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
