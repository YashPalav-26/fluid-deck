import {
  ALARM_NAME,
  BridgeTransport,
  EXTRACTION_TIMEOUT_MS,
  PROTOCOL,
  PROTOCOL_VERSION,
  OutboxMachine,
  OUTBOX_STORAGE_KEY,
  FAILED_CAPTURES_STORAGE_KEY,
  POPUP_CAPTURE_MESSAGE,
  READ_METADATA_MESSAGE,
  SAVED_CAPTURES_STORAGE_KEY,
  addFailedCapture,
  addSavedCapture,
  createAlarmAdapter,
  createCaptureService,
  effectiveDeadlineMs,
  fallbackMetadata,
  isCaptureMetadata,
  toPopupCaptureResult,
} from "@fluid-deck/extension-core";
import type {
  AlarmApi,
  CaptureMetadata,
  CaptureResult,
  CaptureTrigger,
  FailedCaptureEntry,
  OutboxEntry,
  OutboxRecord,
  OutboxStorage,
  PopupCaptureResult,
  SavedCaptureEntry,
} from "@fluid-deck/extension-core";
import { APP_URL_PATTERNS } from "../src/bridge-config.ts";

/**
 * EXT-001 + EXT-004 — MV3 lifecycle and the production bridge transport.
 *
 * The durable outbox is reconciled on every worker start; the transport turns
 * the queue head into a `capture.deliver` envelope addressed to a live app tab.
 * Attempts, ACK timeouts, backoff, FIFO and durable state all remain in
 * `OutboxMachine`. The transport owns only the hop-1 registry and envelope
 * direction — it is not a second queue and never schedules retries itself.
 *
 * When no app tab is reachable the machine's attempt resolves `"timeout"`,
 * the record stays durable, and the alarm wakes the worker again. Nothing is
 * dropped and nothing is delivered early.
 *
 * EXT-005 adds the two approved triggers (context menu, keyboard command).
 * Both call the single `captureTab()` path — there is no second pipeline.
 */

const STORAGE_KEY = OUTBOX_STORAGE_KEY;

const storageAdapter: OutboxStorage = {
  async load() {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    return (stored[STORAGE_KEY] as OutboxRecord[] | undefined) ?? [];
  },
  async save(records) {
    await browser.storage.local.set({ [STORAGE_KEY]: records });
  },
};

/**
 * EXT-006 - the two outbox-exit registries. When a record leaves the outbox
 * (ACK after the web commit, or a permanent nack), a small durable entry is
 * kept so the popup can still classify that page after the record is gone.
 * It derives nothing for delivery and is never the capture path's authority.
 */
async function loadRegistry<T>(key: string): Promise<T[]> {
  try {
    const stored = await browser.storage.local.get(key);
    const value = stored[key];
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

async function persistRegistry<T>(key: string, entries: T[]): Promise<void> {
  try {
    await browser.storage.local.set({ [key]: entries });
  } catch (error) {
    console.info("[Fluid Deck] popup registry write skipped (%s) %o", key, error);
  }
}

/** Called only after `outbox.handleAck` resolved for a validated ack. */
async function rememberSavedCapture(entry: SavedCaptureEntry): Promise<void> {
  await persistRegistry(
    SAVED_CAPTURES_STORAGE_KEY,
    addSavedCapture(entry, await loadRegistry<SavedCaptureEntry>(SAVED_CAPTURES_STORAGE_KEY)),
  );
}

/** Called only after a validated permanent nack removed the record. */
async function rememberFailedCapture(entry: FailedCaptureEntry): Promise<void> {
  await persistRegistry(
    FAILED_CAPTURES_STORAGE_KEY,
    addFailedCapture(entry, await loadRegistry<FailedCaptureEntry>(FAILED_CAPTURES_STORAGE_KEY)),
  );
}

/** draft url/canonical for registry entries, read before the record leaves. */
function payloadFor(captureId: string): { url?: string; canonicalUrlHint?: string } | undefined {
  const record = outbox.queue().find((r) => r.captureId === captureId);
  if (!record) return undefined;
  const payload = record.payload as { url?: unknown; canonicalUrlHint?: unknown };
  return {
    url: typeof payload.url === "string" ? payload.url : undefined,
    canonicalUrlHint:
      typeof payload.canonicalUrlHint === "string" ? payload.canonicalUrlHint : undefined,
  };
}

const transport = new BridgeTransport({
  sendToTab: (tabId, message) => browser.tabs.sendMessage(tabId, message),
});

const alarmApi: AlarmApi = {
  create(name, whenSec) {
    return browser.alarms.create(name, { when: whenSec });
  },
  clear(name) {
    return browser.alarms.clear(name);
  },
  getAll() {
    return browser.alarms
      .getAll()
      .then((alarms) => alarms.map((a) => ({ name: a.name, scheduledTime: a.scheduledTime ?? 0 })));
  },
};

const scheduler = createAlarmAdapter(alarmApi);

const outbox = new OutboxMachine({
  store: storageAdapter,
  deliver: (entry) => transport.deliver(entry),
  onSchedule: (deadlineMs) => {
    scheduler.scheduleAt(deadlineMs);
    // A zero deadline means the new head is ready *now* (pending, never
    // attempted). The alarm driver deliberately clears epoch-0 alarms, so
    // drain immediately instead of parking the queue until the next wake.
    if (deadlineMs === 0 && outbox.queue().length > 0) {
      setTimeout(() => void outbox.tick().catch(() => undefined), 0);
    }
  },
});

/** Re-arm the durable alarm from the head's effective deadline (retry OR ACK, whichever is next). */
function reconcileAlarm() {
  scheduler.reconcile(effectiveDeadlineMs(outbox.queue()[0], Date.now()));
}

/**
 * Worker restarts lose the in-memory ready registry but not the app tab or the
 * relay's nonce. Querying app tabs restores delivery targets without a new
 * handshake (a page that never ran the relay simply times out and retries).
 */
async function discoverAppTabs(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ url: APP_URL_PATTERNS });
    for (const tab of tabs) {
      if (tab.id !== undefined) transport.markCandidate(tab.id);
    }
  } catch (error) {
    console.info("[Fluid Deck] bridge: app tab discovery skipped (%o)", error);
  }
}

/** Reconcile durable state on boot, then attempt the head if anything is queued. */
export async function reconcile(): Promise<void> {
  await outbox.restore();
  await discoverAppTabs();
  const queue = outbox.queue();
  reconcileAlarm();
  if (queue.length > 0) {
    console.info(
      `[Fluid Deck] outbox: ${queue.length} record(s) recovered (%o)`,
      queue.map((r) => ({ captureId: r.captureId, status: r.status, attempts: r.attempts })),
    );
    await outbox.tick();
  }
}

export { outbox, transport };

// ---------------------------------------------------------------------------
// EXT-005 — capture triggers
// ---------------------------------------------------------------------------

/** Context-menu item id and command id; `wxt.config.ts` declares the command. */
export const SAVE_MENU_ID = "fluid-deck:save-page";
export const SAVE_COMMAND = "save-current-tab";

/**
 * One capture path for every trigger. Metadata comes from the EXT-002 live-DOM
 * reader in the capture content script (an MV3 worker has no `DOMParser`, so
 * `extractMetadata(url)` cannot parse here); the draft is the canonical shared
 * schema; `outbox.enqueue` is the accepted boundary.
 */
const captureService = createCaptureService({
  extract: extractForCapture,
  enqueue: (entry) => outbox.enqueue(entry),
  queueDepth: () => outbox.queue().length,
});

/** Resolves or rejects after `ms`; the timer never outlives the call. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("metadata timeout")), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * EXT-002 metadata for the target tab. Missing, restricted or unresponsive
 * content scripts degrade to `fallbackMetadata` — the capture is still queued,
 * it just keeps the URL-derived title. The 5 s budget is the approved
 * extraction timeout.
 */
async function extractForCapture(target: {
  url: string;
  tabId?: number;
}): Promise<CaptureMetadata> {
  if (target.tabId === undefined) return fallbackMetadata(target.url);
  try {
    const response = await withTimeout(
      browser.tabs.sendMessage(target.tabId, { type: READ_METADATA_MESSAGE }),
      EXTRACTION_TIMEOUT_MS,
    );
    if (isCaptureMetadata(response)) return response;
    console.info("[Fluid Deck] capture: content script returned no usable metadata");
  } catch (error) {
    console.info("[Fluid Deck] capture: live metadata unavailable %o", error);
  }
  return fallbackMetadata(target.url);
}

let lastCapture: CaptureResult | undefined;

/**
 * Truthful feedback only: `accepted` means durable, never "saved". The ACK
 * arrives later and is the web app's statement, surfaced by EXT-006.
 */
function reportCapture(result: CaptureResult): void {
  if (result.status === "accepted") {
    console.info("[Fluid Deck] capture accepted (%s) %o", result.trigger, {
      captureId: result.captureId,
      url: result.url,
      degradedMetadata: result.degraded,
      queueDepth: result.queueDepth,
    });
    return;
  }
  if (result.status === "rejected") {
    console.info("[Fluid Deck] capture skipped (%s): %s %o", result.trigger, result.reason, {
      url: result.url,
    });
    return;
  }
  console.error("[Fluid Deck] capture NOT queued (%s): outbox storage failure %o", result.trigger, {
    url: result.url,
    error: result.error,
  });
}

/** Captures one known tab (context menu supplies it; the command resolves it). */
export async function captureTab(
  tab: { id?: number; url?: string } | undefined,
  trigger: CaptureTrigger,
): Promise<CaptureResult> {
  const result = await captureService.capture({ url: tab?.url, tabId: tab?.id, trigger });
  lastCapture = result;
  reportCapture(result);
  return result;
}

/** The tab id the popup passes with its request (its own tabs.query result). */
export async function captureTabById(tabId: number): Promise<PopupCaptureResult> {
  try {
    const tab = await browser.tabs.get(tabId);
    return toPopupCaptureResult(await captureTab(tab, "popup"));
  } catch (error) {
    console.info("[Fluid Deck] popup capture: tab %d unreadable %o", tabId, error);
    return { status: "rejected", trigger: "popup", reason: "missing-url" };
  }
}

/**
 * EXT-006 — popup requests come only from extension-owned pages: an extension
 * page running as its own tab still reports `sender.tab`, so a valid request
 * is either a no-sender-tab extension page (the real popup) or a page under
 * `chrome-extension://<runtime.id>/`. A normal web page can never qualify.
 */
function isPopupCaptureRequest(
  message: unknown,
  sender: { id?: string; tab?: { url?: string } | null },
): message is { tabId?: number } {
  if ((message as { type?: unknown } | null)?.type !== POPUP_CAPTURE_MESSAGE) return false;
  if (sender.id !== browser.runtime.id) return false;
  if (sender.tab === undefined || sender.tab === null) return true;
  const url = sender.tab.url;
  return typeof url === "string" && url.startsWith(`chrome-extension://${browser.runtime.id}/`);
}

/** Resolves the background result for the popup (sanitized for rendering). */
async function handlePopupCapture(request: { tabId?: number }): Promise<PopupCaptureResult> {
  const tabId = typeof request.tabId === "number" ? request.tabId : undefined;
  if (tabId !== undefined) return captureTabById(tabId);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return { status: "rejected", trigger: "popup", reason: "missing-url" };
  return captureTabById(tab.id);
}

/** Keyboard command path: the command event carries no tab, so resolve the active one. */
export async function captureActiveTab(trigger: CaptureTrigger): Promise<CaptureResult> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return await captureTab(tab, trigger);
  } catch (error) {
    console.info("[Fluid Deck] capture skipped (%s): no readable active tab %o", trigger, error);
    const result: CaptureResult = { status: "rejected", trigger, reason: "missing-url" };
    lastCapture = result;
    return result;
  }
}

/**
 * Menus are browser-persisted, so this only needs to run on install/update.
 * `removeAll` first keeps it idempotent (a duplicate id would throw).
 */
export async function registerContextMenu(): Promise<void> {
  try {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: SAVE_MENU_ID,
      title: "Save to Fluid Deck",
      contexts: ["page"],
    });
  } catch (error) {
    console.info("[Fluid Deck] capture: context menu registration skipped %o", error);
  }
}

/** Alarm wake: reload durable state, rediscover tabs, and attempt the head. */
export async function onAlarmWake(name: string): Promise<void> {
  if (name !== ALARM_NAME) return;
  await outbox.restore();
  await discoverAppTabs();
  const queue = outbox.queue();
  reconcileAlarm();
  console.info(`[Fluid Deck] outbox alarm woke; ${queue.length} record(s) pending`);
  if (queue.length > 0) await outbox.tick();
}

/**
 * Hop-2 → hop-1 routing. The relay already checked page origin, source and
 * nonce; background re-validates the envelope (role, version, payload) before
 * it can touch outbox state. `sender.tab.id` is browser-provided and cannot be
 * spoofed by the page.
 */
function routeIncoming(message: unknown, sender: { tab?: { id?: number } }): void {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  const type = (message as { type?: unknown } | null)?.type;

  if (type === "capture.ready") {
    if (transport.markReady(tabId, message)) void outbox.tick().catch(() => undefined);
    return;
  }

  if (type === "capture.ack") {
    const route = transport.routeAck(tabId, message);
    if (!route) return;
    // Always mirror the ack into the outbox: the transport may already have
    // resolved the delivery promise, but a late ack must still clear the row.
    const draft = payloadFor(route.captureId);
    void outbox
      .handleAck(route.captureId)
      .then(() => {
        // EXT-006: "saved" registry entry, written only after the ack that
        // only exists because the Dexie transaction committed.
        if (draft)
          void rememberSavedCapture({
            captureId: route.captureId,
            url: draft.url ?? "",
            canonicalUrlHint: draft.canonicalUrlHint,
            savedAt: Date.now(),
          });
      })
      .catch(() => undefined);
    return;
  }

  if (type === "capture.nack") {
    const route = transport.routeNack(tabId, message);
    if (!route?.permanent) return;
    const draft = payloadFor(route.captureId);
    void outbox
      .handleNack(route.captureId, true)
      .then(() => {
        if (draft)
          void rememberFailedCapture({
            captureId: route.captureId,
            url: draft.url,
            code: route.code,
            at: Date.now(),
          });
      })
      .catch(() => undefined);
  }
}

/**
 * Internal test/diagnostics surface (service-worker global only — never
 * reachable from a page). EXT-006 reads the same outbox; the Playwright
 * bridge test enqueues through it without adding capture triggers early.
 */
export interface FluidDeckTestApi {
  outbox: OutboxMachine;
  transport: BridgeTransport;
  reconcile: () => Promise<void>;
  enqueue: (entry: OutboxEntry) => Promise<void>;
  tick: () => Promise<void>;
  queue: () => OutboxRecord[];
  /** EXT-005: run the real trigger handler against the active tab / a known tab. */
  captureActiveTab: (trigger: CaptureTrigger) => Promise<CaptureResult>;
  captureTab: (
    tab: { id?: number; url?: string } | undefined,
    trigger: CaptureTrigger,
  ) => Promise<CaptureResult>;
  registerContextMenu: () => Promise<void>;
  lastCapture: () => CaptureResult | undefined;
}

declare global {
  var __fluidDeck: FluidDeckTestApi | undefined;
}

globalThis.__fluidDeck = {
  outbox,
  transport,
  reconcile,
  enqueue: (entry) => outbox.enqueue(entry),
  tick: () => outbox.tick(),
  queue: () => outbox.queue(),
  captureActiveTab,
  captureTab,
  registerContextMenu,
  lastCapture: () => lastCapture,
};

export default defineBackground(() => {
  console.info(`[Fluid Deck] background ready - ${PROTOCOL} v${PROTOCOL_VERSION}`);
  void browser.storage.local.set({ "fluid-deck:booted": Date.now() });

  // Reconcile durable state + alarm on every worker start.
  void reconcile();
  browser.runtime.onStartup.addListener(() => {
    void reconcile();
    // Menus normally persist across restarts; re-creating is idempotent
    // (`removeAll` first) and covers browsers that drop them.
    void registerContextMenu();
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    void onAlarmWake(alarm.name);
  });
  browser.runtime.onMessage.addListener((message, sender) => {
    routeIncoming(message, sender);
    if (isPopupCaptureRequest(message, sender)) {
      // The returned promise is the popup's response (ext messaging).
      return handlePopupCapture(message);
    }
    return undefined;
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    transport.forgetTab(tabId);
  });
  // EXT-005 — context menu: the browser supplies the tab that was clicked, so
  // no extra query (and no `tabs` permission) is needed.
  browser.runtime.onInstalled.addListener(() => {
    void registerContextMenu();
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== SAVE_MENU_ID) return;
    void captureTab(tab, "context-menu").catch(() => undefined);
  });
  // EXT-005 — keyboard command (`Ctrl+Shift+S` / `⌘⇧S`, declared in the manifest).
  browser.commands.onCommand.addListener((command) => {
    if (command !== SAVE_COMMAND) return;
    void captureActiveTab("command").catch(() => undefined);
  });
  // Navigation can invalidate a target without closing the tab. A fresh load
  // re-runs the content script and announces `capture.ready` again.
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "loading" && changeInfo.url === undefined) return;
    const url = tab.url ?? "";
    if (APP_URL_PATTERNS.some((pattern) => patternMatches(pattern, url))) {
      transport.markCandidate(tabId);
    } else {
      transport.forgetTab(tabId);
    }
  });
});

/** Minimal `origin/*` matcher for the exact allowlist (no wildcard domains). */
function patternMatches(pattern: string, url: string): boolean {
  return pattern.endsWith("/*") ? url.startsWith(pattern.slice(0, -1)) : url === pattern;
}
