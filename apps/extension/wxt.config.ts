import { defineConfig } from "wxt";

/**
 * Manifest V3 foundation for Chrome, Edge (chromium) and Firefox.
 *
 * `<all_urls>` (FR-CAP-001): the content-script relay must run on the page the
 * user captures from, and any page can be captured. Approved rationale is
 * documented in SYSTEM_ARCHITECTURE §4 and shown in the store listing. No other
 * host permission is used: no history, cookies, tabs content or webRequest.
 */
export default defineConfig({
  manifest: ({ browser }) => ({
    name: "Fluid Deck",
    description: "Capture and organize your internet resources. Local-first, zero telemetry.",
    version: "0.1.0",
    permissions: ["storage", "activeTab", "scripting", "contextMenus", "alarms"],
    host_permissions: ["<all_urls>"],
    // EXT-005: the only keyboard trigger. `Ctrl+Shift+S` / `⌘⇧S` per PRD
    // FR-CAP-008; `commands` is a manifest key, not an extra permission, and
    // the user can rebind it in the browser's extension shortcuts page.
    commands: {
      "save-current-tab": {
        suggested_key: { default: "Ctrl+Shift+S", mac: "Command+Shift+S" },
        description: "Save the current page to Fluid Deck",
      },
    },
    // Firefox MV3 requires a stable add-on ID; the data-collection declaration is
    // "none" because Fluid Deck has zero telemetry (FF 2025 store requirement).
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "extension@fluiddeck.app",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});
