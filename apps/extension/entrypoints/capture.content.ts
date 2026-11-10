import { READ_METADATA_MESSAGE, readMetadata } from "@fluid-deck/extension-core";

/**
 * EXT-005 — live metadata reader (the EXT-002 DOM path).
 *
 * An MV3 service worker has no `DOMParser`, so metadata is read where the DOM
 * actually is: in the captured tab's isolated world. This script only answers
 * the background's `READ_METADATA_MESSAGE`; it never runs page code, never
 * injects anything into the page, and returns only the approved metadata
 * fields (title, description, canonical, favicon, image) — the same
 * `readMetadata` implementation EXT-002 tested.
 *
 * `matches: ["<all_urls>"]` is the already-declared host permission; restricted
 * pages (browser UI, add-on stores) simply have no content script, and the
 * background degrades to `fallbackMetadata`.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if ((message as { type?: unknown } | null)?.type !== READ_METADATA_MESSAGE) return undefined;
      try {
        return Promise.resolve(readMetadata(document, location.href));
      } catch {
        // Unreadable document: the background falls back.
        return undefined;
      }
    });
  },
});
