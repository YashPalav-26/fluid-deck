import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

/**
 * EXT-005 — real-browser acceptance for the two approved capture triggers.
 *
 * Chromium's own context menu and keyboard-shortcut UI live outside the
 * automation boundary, so the native gesture itself is manual. Everything the
 * gesture invokes is real here: the browser-supplied tab URL, EXT-002 metadata
 * extraction over a live HTTP page, the canonical draft, the durable outbox,
 * the EXT-004 bridge, the Dexie commit and the ACK.
 *
 * The test-only seam is `globalThis.__fluidDeck`, the service-worker diagnostics
 * global the background already exposes (`captureActiveTab` is the exact
 * function the `commands.onCommand` listener calls).
 */

const EXTENSION_PATH = path.resolve("apps/extension/.output/chrome-mv3");
const APP_URL = "http://127.0.0.1:5199/";

interface CaptureOutcome {
  status: "accepted" | "rejected" | "failed";
  captureId?: string;
  url?: string;
  degraded?: boolean;
  queueDepth?: number;
}

interface CaptureApi {
  transport: { knownTabs: () => number[] };
  queue: () => Array<{ captureId: string }>;
  captureActiveTab: (trigger: "context-menu" | "command") => Promise<CaptureOutcome>;
}

test.describe.configure({ timeout: 120_000 });

let server: Server;
let fixtureBase = "";

function page(title: string, description: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    </head><body><h1>${title}</h1></body></html>`;
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const fixtures: Record<string, string> = {
      "/article": page("Capture fixture article", "Metadata read over real HTTP"),
      "/other": page("Keyboard capture fixture", "Command trigger target"),
      "/replay": page("Replay fixture", "Duplicate trigger target"),
    };
    const body = fixtures[request.url ?? ""];
    if (!body) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fixtureBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Launches real Chromium with the built extension and waits for the worker. */
async function launchExtension(): Promise<{
  context: BrowserContext;
  worker: Worker;
  dispose: () => Promise<void>;
}> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "fd-capture-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

  await expect
    .poll(
      () =>
        worker.evaluate(
          () => typeof (globalThis as unknown as { __fluidDeck?: CaptureApi }).__fluidDeck,
        ),
      { timeout: 30_000 },
    )
    .toBe("object");

  return {
    context,
    worker,
    dispose: async () => {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

/** Opens the web app, which starts the inbox and announces `capture.ready`. */
async function openApp(context: BrowserContext, worker: Worker): Promise<Page> {
  const page = await context.newPage();
  await page.goto(APP_URL);
  await expect(page.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();

  await expect
    .poll(
      () =>
        worker.evaluate(() =>
          (globalThis as unknown as { __fluidDeck: CaptureApi }).__fluidDeck.transport.knownTabs(),
        ),
      { timeout: 30_000 },
    )
    .not.toHaveLength(0);

  return page;
}

/** Opens the target page and makes it the active tab, as a user would. */
async function openTarget(context: BrowserContext, fixturePath: string): Promise<string> {
  const target = await context.newPage();
  const url = `${fixtureBase}${fixturePath}`;
  await target.goto(url);
  await target.bringToFront();
  return url;
}

function capture(worker: Worker, trigger: "context-menu" | "command") {
  return worker.evaluate(
    (value) =>
      (globalThis as unknown as { __fluidDeck: CaptureApi }).__fluidDeck.captureActiveTab(value),
    trigger,
  );
}

function queueLength(worker: Worker): Promise<number> {
  return worker.evaluate(
    () => (globalThis as unknown as { __fluidDeck: CaptureApi }).__fluidDeck.queue().length,
  );
}

test("context menu trigger captures the active page and acks after the commit", async () => {
  expect(
    existsSync(EXTENSION_PATH),
    `Missing ${EXTENSION_PATH} — run \`pnpm build\` before \`pnpm test:e2e\`.`,
  ).toBe(true);

  const { context, worker, dispose } = await launchExtension();
  try {
    const app = await openApp(context, worker);
    const url = await openTarget(context, "/article");

    const outcome = await capture(worker, "context-menu");
    expect(outcome).toMatchObject({ status: "accepted", url });
    expect(outcome.captureId).toBeTruthy();
    // The fixture has og:title + og:description but no og:image, so EXT-002
    // reports `partial` → degraded, while the capture itself is fully retained.
    expect(outcome.degraded).toBe(true);

    // The queue only clears on ACK, which the web app posts after the commit.
    await expect.poll(() => queueLength(worker), { timeout: 30_000 }).toBe(0);

    const card = app.getByTestId("resource-card").filter({ hasText: "Capture fixture article" });
    await expect(card).toBeVisible();
  } finally {
    await dispose();
  }
});

test("keyboard command trigger captures the active page through the same pipeline", async () => {
  const { context, worker, dispose } = await launchExtension();
  try {
    const app = await openApp(context, worker);
    const url = await openTarget(context, "/other");

    const outcome = await capture(worker, "command");
    expect(outcome).toMatchObject({ status: "accepted", url });
    await expect.poll(() => queueLength(worker), { timeout: 30_000 }).toBe(0);

    const card = app.getByTestId("resource-card").filter({ hasText: "Keyboard capture fixture" });
    await expect(card).toBeVisible();
  } finally {
    await dispose();
  }
});

test("repeated triggers enqueue again but never duplicate the resource", async () => {
  const { context, worker, dispose } = await launchExtension();
  try {
    const app = await openApp(context, worker);
    const url = await openTarget(context, "/replay");

    const first = await capture(worker, "context-menu");
    await expect.poll(() => queueLength(worker), { timeout: 30_000 }).toBe(0);
    const second = await capture(worker, "command");
    await expect.poll(() => queueLength(worker), { timeout: 30_000 }).toBe(0);

    expect(first).toMatchObject({ status: "accepted", url });
    expect(second).toMatchObject({ status: "accepted", url });
    // Distinct capture ids; the canonical URL is what keeps the library unique.
    expect(first.captureId).not.toBe(second.captureId);

    const cards = app.getByTestId("resource-card").filter({ hasText: "Replay fixture" });
    await expect(cards).toHaveCount(1);
  } finally {
    await dispose();
  }
});
