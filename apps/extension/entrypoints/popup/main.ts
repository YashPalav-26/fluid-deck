/**
 * EXT-006 - the popup controller. It owns no capture logic and no queue: it
 * renders a view derived from durable state (the EXT-001 outbox plus the two
 * outbox-exit registries the background maintains) and forwards the save
 * action to the background through one internal message. Reopening the popup
 * reconstructs everything from `browser.storage.local`, so a closure never
 * loses or cancels a durably enqueued capture.
 */
import {
  FAILED_CAPTURES_STORAGE_KEY,
  OUTBOX_STORAGE_KEY,
  POPUP_CAPTURE_MESSAGE,
  SAVED_CAPTURES_STORAGE_KEY,
  derivePageCaptureStatus,
  summarizeOutbox,
  type FailedCaptureEntry,
  type OutboxRecord,
  type PageCaptureStatus,
  type SavedCaptureEntry,
} from "@fluid-deck/extension-core";
import { APP_ORIGINS } from "../../src/bridge-config.ts";

interface TabLike {
  id?: number;
  url?: string;
  title?: string;
}

interface PopupRefs {
  activeTab: TabLike | undefined;
  /** The active-tab query (or the e2e seam) has actually run. */
  activeTabResolved: boolean;
  records: OutboxRecord[];
  saved: SavedCaptureEntry[];
  failed: FailedCaptureEntry[];
  storageFailed: boolean;
  submitting: boolean;
}

const state: PopupRefs = {
  activeTab: undefined,
  activeTabResolved: false,
  records: [],
  saved: [],
  failed: [],
  storageFailed: false,
  submitting: false,
};

const els = {
  title: document.getElementById("page-title") as HTMLParagraphElement,
  host: document.getElementById("page-host") as HTMLParagraphElement,
  status: document.getElementById("status-region") as HTMLElement,
  icon: document.getElementById("status-icon") as HTMLElement,
  text: document.getElementById("status-text") as HTMLParagraphElement,
  queue: document.getElementById("queue-summary") as HTMLParagraphElement,
  form: document.getElementById("save-form") as HTMLFormElement,
  save: document.getElementById("save-button") as HTMLButtonElement,
  saveLabel: document.getElementById("save-label") as HTMLSpanElement,
  open: document.getElementById("open-app") as HTMLButtonElement,
};

/**
 * Icons carry the status beyond color. Inline SVG only — no external assets.
 */
const ICONS: Record<string, string> = {
  "not-captured":
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 5v3.5l2 1.5" stroke-linecap="round"/></svg>',
  queued:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 5h11M2.5 8h11M2.5 11h7" stroke-linecap="round"/></svg>',
  spinner:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M8 1.5A6.5 6.5 0 1 1 1.5 8" stroke-linecap="round"/></svg>',
  saved:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  failed:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 4.75V9" stroke-linecap="round"/><circle cx="8" cy="11.25" r=".4" fill="currentColor" stroke="none"/></svg>',
};

/** Registry-ish restriction list (chrome://, edge://, the store, etc.). */
function isRestrictedUrl(url: string | undefined): boolean {
  if (url === undefined) return true;
  try {
    const parsed = new URL(url);
    return !/^https?:$/.test(parsed.protocol);
  } catch {
    return true;
  }
}

function hostname(url: string | undefined): string {
  try {
    return new URL(url ?? "").hostname;
  } catch {
    return "";
  }
}

function secondsUntil(at: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((at - now) / 1000));
  if (seconds <= 0) return "moments";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

const STATUS_TEXT: Record<PageCaptureStatus["kind"], string> = {
  "not-captured": "Not saved yet",
  queued: "Queued — waiting to be saved",
  saving: "Saving…",
  retrying: "Can’t reach the app — will retry",
  saved: "Saved",
  failed: "Couldn’t save this page",
};

function describeStatus(status: PageCaptureStatus, now: number): string {
  switch (status.kind) {
    case "queued":
      return status.position > 1
        ? `Queued (#${status.position}) — not yet saved`
        : STATUS_TEXT.queued;
    case "retrying": {
      const base = `Can’t reach the app — retrying (attempt ${status.attempts + 1})`;
      if (status.nextRetryAt !== undefined && status.nextRetryAt > now)
        return `${base} in ${secondsUntil(status.nextRetryAt, now)}`;
      return base;
    }
    case "failed":
      return status.code !== undefined
        ? `Couldn’t save this page (${status.code})`
        : STATUS_TEXT.failed;
    case "saved":
      return STATUS_TEXT.saved;
    default:
      return STATUS_TEXT[status.kind];
  }
}

const ICON_FOR_KIND: Record<PageCaptureStatus["kind"], string> = {
  "not-captured": "not-captured",
  queued: "queued",
  saving: "spinner",
  retrying: "spinner",
  saved: "saved",
  failed: "failed",
};

function renderStatus(status: PageCaptureStatus, now: number): void {
  els.status.dataset.kind = status.kind;
  els.icon.dataset.icon = ICON_FOR_KIND[status.kind];
  els.icon.innerHTML = ICONS[ICON_FOR_KIND[status.kind]] ?? "";
  els.text.textContent = describeStatus(status, now);

  // Duplicate-click guard: nothing re-triggers while an attempt is live or a
  // record for this page is still in the outbox.
  const busy =
    status.kind === "saving" ||
    status.kind === "queued" ||
    status.kind === "retrying" ||
    state.submitting;
  els.save.disabled = busy || !canCapture();
  els.saveLabel.textContent =
    status.kind === "queued" || status.kind === "saving" || status.kind === "retrying"
      ? "Saving…"
      : "Save page";
}

function canCapture(): boolean {
  if (state.storageFailed) return false;
  const url = state.activeTab?.url;
  return state.activeTab?.id !== undefined && !isRestrictedUrl(url);
}

function renderPage(): void {
  const tab = state.activeTab;
  if (tab === undefined) {
    els.title.textContent = state.activeTabResolved ? "No active tab" : "Checking this tab…";
    els.host.textContent = "";
  } else {
    els.title.textContent = tab.title?.trim() ? tab.title : "Untitled page";
    els.host.textContent = hostname(tab.url);
  }
}

function renderQueue(): void {
  const counts = summarizeOutbox(state.records);
  const parts: string[] = [];
  if (counts.pending > 0) parts.push(`${counts.pending} waiting to be delivered`);
  if (counts.retrying > 0) parts.push(`${counts.retrying} retrying`);
  if (parts.length === 0) {
    els.queue.hidden = true;
    els.queue.textContent = "";
    return;
  }
  els.queue.hidden = false;
  els.queue.textContent = parts.join(" · ");
}

function render(): void {
  renderPage();
  if (state.activeTabResolved && state.activeTab === undefined) {
    // No tab to capture from (e.g. a new-tab window): honest absence, not error.
    els.save.disabled = true;
    els.status.dataset.kind = "not-captured";
    els.icon.dataset.icon = "not-captured";
    els.icon.innerHTML = ICONS["not-captured"] ?? "";
    els.text.textContent = "No active tab to save";
    renderQueue();
    return;
  }
  const pageUrl = state.activeTab?.url;
  let status: PageCaptureStatus;
  if (state.storageFailed) {
    status = { kind: "failed", reason: "storage-unavailable" };
  } else if (state.activeTab !== undefined && isRestrictedUrl(pageUrl)) {
    // Restricted pages (chrome://, the web store) can never be captured.
    status = { kind: "not-captured" };
    els.save.disabled = true;
    els.saveLabel.textContent = "Save page";
    els.status.dataset.kind = "not-captured";
    els.icon.dataset.icon = "not-captured";
    els.icon.innerHTML = ICONS["not-captured"] ?? "";
    els.text.textContent = "This page can’t be captured";
    renderQueue();
    return;
  } else {
    status = derivePageCaptureStatus({
      pageUrl,
      records: state.records,
      saved: state.saved,
      failed: state.failed,
    });
  }
  renderStatus(status, Date.now());
  renderQueue();
}

/** One read for all three stores; a failure here is never rendered as success. */
async function readStorage(): Promise<void> {
  try {
    const stored = await browser.storage.local.get([
      OUTBOX_STORAGE_KEY,
      SAVED_CAPTURES_STORAGE_KEY,
      FAILED_CAPTURES_STORAGE_KEY,
    ]);
    state.records = (stored[OUTBOX_STORAGE_KEY] as OutboxRecord[] | undefined) ?? [];
    state.saved = (stored[SAVED_CAPTURES_STORAGE_KEY] as SavedCaptureEntry[] | undefined) ?? [];
    state.failed = (stored[FAILED_CAPTURES_STORAGE_KEY] as FailedCaptureEntry[] | undefined) ?? [];
    state.storageFailed = false;
  } catch (error) {
    console.info("[Fluid Deck] popup storage read failed %o", error);
    state.storageFailed = true;
  }
}

/** The save button posts the internal popup message; no second capture path. */
async function triggerCapture(): Promise<void> {
  if (state.submitting) return;
  state.submitting = true;
  try {
    const result = (await browser.runtime.sendMessage({
      type: POPUP_CAPTURE_MESSAGE,
      tabId: state.activeTab?.id,
    })) as { status?: string; errorMessage?: string } | undefined;
    // Rejected/failed results are surfaced immediately; accepted results are
    // confirmed only when the outbox record appears (storage listener below).
    if (result?.status === "accepted") return;
    if (result?.status === "failed" || result?.status === "rejected") {
      els.status.dataset.kind = "failed";
      els.icon.dataset.icon = "failed";
      els.icon.innerHTML = ICONS.failed ?? "";
      els.text.textContent =
        result.status === "failed"
          ? `Couldn’t save this page${result.errorMessage ? `: ${result.errorMessage}` : ""}`
          : "This page can’t be captured";
      els.saveLabel.textContent = "Save page";
    }
  } catch (error) {
    console.info("[Fluid Deck] popup capture message failed %o", error);
    // App/service worker unreachable: the queue already holds nothing new.
    els.status.dataset.kind = "failed";
    els.icon.dataset.icon = "failed";
    els.icon.innerHTML = ICONS.failed ?? "";
    els.text.textContent = "Fluid Deck isn’t responding — try again";
    els.saveLabel.textContent = "Save page";
  } finally {
    state.submitting = false;
    render();
  }
}

/** e2e seam: popup.html opened as a tab would otherwise query itself. */
function setupSeam(): void {
  (window as unknown as Record<string, unknown>).__fluidDeckPopup = {
    setActiveTab(tabLike: TabLike | undefined): void {
      state.activeTab = tabLike;
      state.activeTabResolved = true;
      void bootstrap();
    },
  };
}

async function bootstrap(): Promise<void> {
  // The e2e seam may have already resolved the active tab (including an
  // explicit "none"); a fresh tabs.query must not clobber it.
  if (state.activeTab === undefined && !state.activeTabResolved) {
    state.activeTab = (
      await browser.tabs.query({ active: true, currentWindow: true })
    )[0] as TabLike;
  }
  state.activeTabResolved = true;
  await readStorage();
  render();
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  void triggerCapture();
});

els.open.addEventListener("click", () => {
  const url = APP_ORIGINS[0];
  if (url === undefined) return;
  void browser.tabs.create({ url }).then(() => window.close());
});

// The outbox or a registry changed (ACK arrived, retry scheduled, capture
// enqueued by any trigger): re-derive the view. One shared listener, no leaks.
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const relevant = [
    OUTBOX_STORAGE_KEY,
    SAVED_CAPTURES_STORAGE_KEY,
    FAILED_CAPTURES_STORAGE_KEY,
  ].some((key) => key in changes);
  if (!relevant) return;
  void readStorage().then(() => render());
});

setupSeam();
void bootstrap();
