import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type Worker } from "@playwright/test";

/**
 * EXT-004 — real-browser acceptance for the production bridge.
 *
 * This test loads the BUILT extension (`pnpm build` first) into real Chrome,
 * captures through the actual 3-hop path (background → content-script relay →
 * `window.postMessage` → web inbox), and proves the two things unit tests can
 * only approximate:
 *
 * - the web app commits to real IndexedDB *before* the ACK, so the durable
 *   outbox only clears once the row exists;
 * - a duplicate delivery (same capture ID) acks as a duplicate and creates no
 *   second row.
 *
 * Nothing is mocked: real Dexie, real `chrome.runtime` messaging, real
 * content script. The only test-only seam is `globalThis.__fluidDeck`, the
 * service-worker-global API the background exposes for diagnostics.
 */

const EXTENSION_PATH = path.resolve("apps/extension/.output/chrome-mv3");
const APP_URL = "http://127.0.0.1:5199/";

interface BridgeApi {
  transport: { knownTabs: () => number[] };
  enqueue: (entry: { captureId: string; payload: Record<string, unknown> }) => Promise<void>;
  tick: () => Promise<void>;
  queue: () => Array<{ captureId: string }>;
}

test.describe.configure({ timeout: 120_000 });

test("production bridge commits to IndexedDB, acks, and stays idempotent", async () => {
  expect(
    existsSync(EXTENSION_PATH),
    `Missing ${EXTENSION_PATH} — run \`pnpm build\` before \`pnpm test:e2e\`.`,
  ).toBe(true);

  const userDataDir = await mkdtemp(path.join(tmpdir(), "fd-bridge-e2e-"));
  // `channel: "chromium"` (Playwright's bundled Chromium, new headless) is the
  // only headless target that loads extensions: the default headless shell has
  // no extension support, and Chrome stable >= 137 ignores `--load-extension`.
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  try {
    const worker: Worker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

    // The worker must be awake before the page announces `capture.ready`;
    // otherwise the ready handshake can fire into a suspended listener.
    await expect
      .poll(
        () =>
          worker.evaluate(
            () => typeof (globalThis as unknown as { __fluidDeck?: BridgeApi }).__fluidDeck,
          ),
        { timeout: 30_000 },
      )
      .toBe("object");

    const page = await context.newPage();
    await page.goto(APP_URL);
    await expect(page.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();

    // The relay forwards `capture.ready`; the background registers the tab.
    await expect
      .poll(
        () =>
          worker.evaluate(() =>
            (globalThis as unknown as { __fluidDeck: BridgeApi }).__fluidDeck.transport.knownTabs(),
          ),
        { timeout: 30_000 },
      )
      .not.toHaveLength(0);

    const captureId = crypto.randomUUID();
    const payload = {
      captureId,
      url: "https://example.com/bridge-e2e",
      title: "Bridge E2E capture",
      capturedAt: Date.now(),
      source: "extension",
    };

    const enqueue = async () => {
      await worker.evaluate(
        async (entry) => {
          const api = (globalThis as unknown as { __fluidDeck: BridgeApi }).__fluidDeck;
          await api.enqueue(entry);
          await api.tick();
        },
        { captureId, payload },
      );
    };

    await enqueue();

    // ACK is posted only after the Dexie transaction commits, so a cleared
    // queue proves the row is durable.
    await expect
      .poll(
        () =>
          worker.evaluate(
            () => (globalThis as unknown as { __fluidDeck: BridgeApi }).__fluidDeck.queue().length,
          ),
        { timeout: 30_000 },
      )
      .toBe(0);

    const card = page.getByTestId("resource-card").filter({ hasText: "Bridge E2E capture" });
    await expect(card).toBeVisible();

    const countRows = () =>
      page.evaluate(async (url) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("fluid-deck");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<number>((resolve, reject) => {
            const request = database
              .transaction("resources", "readonly")
              .objectStore("resources")
              .getAll();
            request.onsuccess = () =>
              resolve(
                (request.result as Array<{ canonicalUrl?: string }>).filter(
                  (row) => row.canonicalUrl === url,
                ).length,
              );
            request.onerror = () => reject(request.error);
          });
        } finally {
          database.close();
        }
      }, "https://example.com/bridge-e2e");

    expect(await countRows()).toBe(1);

    // Replay the exact same capture: at-least-once delivery must not duplicate.
    await enqueue();
    await expect
      .poll(
        () =>
          worker.evaluate(
            () => (globalThis as unknown as { __fluidDeck: BridgeApi }).__fluidDeck.queue().length,
          ),
        { timeout: 30_000 },
      )
      .toBe(0);

    expect(await countRows()).toBe(1);
    await expect(card).toHaveCount(1);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
