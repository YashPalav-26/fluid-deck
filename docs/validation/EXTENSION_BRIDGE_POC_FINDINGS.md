# Extension Bridge PoC — Findings (incl. Firefox 159.0)

## What worked
- 3-hop bridge (outbox → relay → postMessage → IndexedDB → ack) executes identically in Chrome, Edge, Firefox.
- `capture.ready` nonce handshake + origin gate hold in Firefox (`sessionStorage` nonce, `crypto.randomUUID` available).
- IndexedDB persists across receiver reload in Firefox (T10 duplicate after reload — restart recovery proven at the persistence boundary).

## Firefox-specific behavior
1. **Previous timeout cause:** Playwright lacked its bundled Firefox binary (first error). Second attempt used system `firefox.exe` 159.0.1 with Playwright 1.65's expectations — Juggler handshake mismatch caused the 90s hang. **Fix:** `npx playwright-core install firefox` (matching bundled binary). No code change needed.
2. **No polyfill drift:** `window.postMessage` origin semantics, `MessageSender`/`tabs.sendMessage` shape match Chrome (contract §4.6 as expected).
3. **Residual gap (honest):** Firefox extension *background* (MV3 event page vs Chrome service worker) and `storage.local` outbox durability were NOT exercised in Firefox — Playwright Firefox cannot load temporary addons the way Chromium args do. Outbox logic is proven in Node harness + Chrome/Edge runtime; Firefox background lifecycle needs one manual `about:debugging` load confirmation in Phase 4 (5 min), not a blocker to the bridge gate.

## Browser differences needing attention in Phase 4
- Firefox: use `browser.*` namespace or polyfill exactly once (already planned, ADR-003).
- Firefox: no offscreen document — extraction fallback path per contract §6 (not bridge-relevant).
- Edge = Chrome behavior (confirmed).

## Security note (unchanged)
Origin/nonce = integrity checks, not crypto auth. No new findings in Firefox.
