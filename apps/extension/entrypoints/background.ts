import { PROTOCOL, PROTOCOL_VERSION } from "@fluid-deck/extension-core";

/**
 * Sprint 1 foundation only. The outbox state machine (EXT-001), extractor
 * (EXT-002) and bridge wiring (EXT-004) land in Sprint 3.
 */
export default defineBackground(() => {
  console.info(`[Fluid Deck] background ready — ${PROTOCOL} v${PROTOCOL_VERSION}`);
  void browser.storage.local.set({ "fluid-deck:booted": Date.now() });
});
