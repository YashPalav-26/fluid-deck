import AxeBuilder from "@axe-core/playwright";
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
 * EXT-006 — real-browser acceptance for the extension popup.
 *
 * Chrome renders the live popup.html inside a browser-owned popup window that
 * sits outside Playwright's automation boundary, so the honest harness window
 * is the popup page opened as a tab: every line of code under test is the
 * production popup (same HTML, module, and controllers), and the one test-only
 * piece is `window.__fluidDeckPopup.setActiveTab`, which supplies the active
 * tab the query seam would otherwise return (an extension page opened as a tab
 * makes real `tabs.query` answer with the popup page itself).
 *
 * Statuses are verified through the actual data chain: the durable outbox,
 * the ACK-only saved registry, and `storage.onChanged` — never through mocks.
 */

const EXTENSION_PATH = path.resolve("apps/extension/.output/chrome-mv3");
const APP_URL = "http://127.0.0.1:5199/";

interface CaptureApi {
  queue: () => Array<{ captureId: string }>;
}

test.describe.configure({ timeout: 120_000 });

let server: Server;
let fixtureBase = "";

function page(title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1></body></html>`;
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const fixtures: Record<string, string> = {
      "/popup-article": page("Popup capture fixture"),
      "/popup-retry": page("Popup retry fixture"),
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

async function launchExtension(): Promise<{
  context: BrowserContext;
  worker: Worker;
  popupUrl: string;
  dispose: () => Promise<void>;
}> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "fd-popup-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const popupUrl = new URL("popup.html", worker.url()).toString();
  return {
    context,
    worker,
    popupUrl,
    dispose: async () => {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

/** Opens the production popup page (as a tab) with the active-tab seam set. */
async function openPopup(
  context: BrowserContext,
  popupUrl: string,
  tabId: number | undefined,
  tabUrl: string | undefined,
  tabTitle: string | undefined,
): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await popup.evaluate(
    ({ tab: t }) => {
      (
        window as unknown as { __fluidDeckPopup: { setActiveTab: (v: unknown) => void } }
      ).__fluidDeckPopup.setActiveTab(t);
    },
    { tab: tabId === undefined ? undefined : { id: tabId, url: tabUrl, title: tabTitle } },
  );
  await expect(popup.locator("#status-region")).not.toHaveAttribute("data-kind", "loading");
  return popup;
}

/** Real tab id for a URL, through the browser's own tabs API. */
async function tabIdFor(worker: Worker, url: string): Promise<number> {
  const id = await worker.evaluate(async (target) => {
    const [tab] = await chrome.tabs.query({ url: target });
    return tab?.id;
  }, url);
  expect(id, `no tab open at ${url}`).toBeDefined();
  return id as number;
}

test("popup journeys: not captured → queued → saved, with accurate wording throughout", async () => {
  const { context, worker, popupUrl, dispose } = await launchExtension();
  try {
    // No app open yet: initially nothing is captured, and the queue is empty.
    const target = await context.newPage();
    const targetUrl = `${fixtureBase}/popup-article`;
    await target.goto(targetUrl);
    const targetId = await tabIdFor(worker, `${fixtureBase}/popup-article`);

    const popup = await openPopup(context, popupUrl, targetId, targetUrl, "Popup capture fixture");
    await expect(popup.locator("#page-title")).toHaveText("Popup capture fixture");
    await expect(popup.locator("#page-host")).toContainText("127.0.0.1");
    await expect(popup.locator("#status-region")).toHaveAttribute("data-kind", "not-captured");
    await expect(popup.locator("#status-text")).toHaveText("Not saved yet");
    await expect(popup.locator("#save-button")).toBeEnabled();
    await expect(popup.locator("#queue-summary")).toBeHidden();

    // Click → durable enqueue. With no app listening, the record may show
    // "queued" only briefly and advance to "retrying" (the R-1 attempt times
    // out quickly). Both are honest non-saved states, so accept the legitimate
    // transition instead of racing a transient intermediate state.
    await popup.locator("#save-button").click();
    await expect
      .poll(() => popup.locator("#status-region").getAttribute("data-kind"))
      .toMatch(/^(queued|retrying)$/);
    const intermediateText = await popup.locator("#status-text").textContent();
    expect(intermediateText?.toLowerCase()).toMatch(/queued|retry/);
    // Never the saved claim: not the saved state, and not the word "Saved".
    expect(intermediateText).not.toBe("Saved");

    // No app is listening: the attempt times out and R-1 schedules a retry.
    await expect
      .poll(() => popup.locator("#status-region").getAttribute("data-kind"), { timeout: 30_000 })
      .toBe("retrying");
    await expect(popup.locator("#status-text")).toContainText("retry");
    // Duplicate-click prevention: nothing invokable while the record is live.
    await expect(popup.locator("#save-button")).toBeDisabled();

    // Reopen: the popup reconstructs the retry state from durable storage.
    await popup.close();
    const reopened = await openPopup(
      context,
      popupUrl,
      targetId,
      targetUrl,
      "Popup capture fixture",
    );
    await expect(reopened.locator("#status-region")).toHaveAttribute("data-kind", "retrying");
    await expect(reopened.locator("#open-app")).toBeEnabled();

    // Open the app: the pending record delivers, the app commits, ACK arrives
    // and — only then — the popup reads "Saved".
    const app = await context.newPage();
    await app.goto(APP_URL);
    await expect(app.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();
    await expect
      .poll(() => reopened.locator("#status-region").getAttribute("data-kind"), { timeout: 60_000 })
      .toBe("saved");
    await expect(reopened.locator("#status-text")).toHaveText("Saved");
    const card = app.getByTestId("resource-card").filter({ hasText: "Popup capture fixture" });
    await expect(card).toBeVisible();
    await expect
      .poll(
        async () =>
          await worker.evaluate(
            () =>
              (globalThis as unknown as { __fluidDeck?: CaptureApi }).__fluidDeck?.queue().length ??
              0,
          ),
        { timeout: 30_000 },
      )
      .toBe(0);
  } finally {
    await dispose();
  }
});

test("saved state survives closing and reopening; keyboard still triggers the form", async () => {
  const { context, worker, popupUrl, dispose } = await launchExtension();
  try {
    const target = await context.newPage();
    const targetUrl = `${fixtureBase}/popup-article`;
    await target.goto(targetUrl);
    const targetId = await tabIdFor(worker, `${fixtureBase}/popup-article`);

    const popup = await openPopup(context, popupUrl, targetId, targetUrl, "Popup capture fixture");

    // Keyboard-only: focus the save control and submit with Enter.
    await target.bringToFront().catch(() => undefined);
    await popup.keyboard.press("Tab");
    await expect(popup.locator("#save-button")).toBeFocused();
    await popup.keyboard.press("Enter");

    const app = await context.newPage();
    await app.goto(APP_URL);
    await expect(app.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();
    await expect
      .poll(() => popup.locator("#status-region").getAttribute("data-kind"), { timeout: 60_000 })
      .toBe("saved");
    await expect
      .poll(
        async () =>
          await worker.evaluate(
            () =>
              (globalThis as unknown as { __fluidDeck?: CaptureApi }).__fluidDeck?.queue().length ??
              0,
          ),
        { timeout: 30_000 },
      )
      .toBe(0);

    await popup.close();
    const reopened = await openPopup(
      context,
      popupUrl,
      targetId,
      targetUrl,
      "Popup capture fixture",
    );
    await expect(reopened.locator("#status-region")).toHaveAttribute("data-kind", "saved");
    await expect(reopened.locator("#status-text")).toHaveText("Saved");
  } finally {
    await dispose();
  }
});

test("restricted and missing tabs never enable the save action; axe passes", async () => {
  const { context, popupUrl, dispose } = await launchExtension();
  try {
    // The extension page itself is a chrome-extension:// tab: restricted.
    const popup = await context.newPage();
    await popup.goto(popupUrl);
    await popup.evaluate(
      () => typeof (window as unknown as { __fluidDeckPopup: unknown }).__fluidDeckPopup,
    );
    await popup.evaluate(() => {
      (
        window as unknown as { __fluidDeckPopup: { setActiveTab: (v: unknown) => void } }
      ).__fluidDeckPopup.setActiveTab(undefined);
    });
    await expect(popup.locator("#page-title")).toHaveText("No active tab");
    await expect(popup.locator("#save-button")).toBeDisabled();

    // Restricted URL surface (non-http scheme can never be captured).
    await popup.evaluate(() => {
      (
        window as unknown as { __fluidDeckPopup: { setActiveTab: (v: unknown) => void } }
      ).__fluidDeckPopup.setActiveTab({
        id: (window as unknown as { id?: never }).id,
        url: "chrome-extension://id/other.html",
        title: "Extension page",
      });
    });
    await expect(popup.locator("#status-text")).toHaveText("This page can’t be captured");
    await expect(popup.locator("#save-button")).toBeDisabled();

    // Accessibility: axe on the fully rendered popup surface.
    const results = await new AxeBuilder({ page: popup }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

    // Empty queue while nothing is pending.
    await expect(popup.locator("#queue-summary")).toBeHidden();
  } finally {
    await dispose();
  }
});
