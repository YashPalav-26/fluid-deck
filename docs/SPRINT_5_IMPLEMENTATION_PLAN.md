# Fluid Deck — Sprint 5 (M6) Implementation Plan

*Date: 2026-11-09 · Planning only. Sprint 5 implementation NOT started; this plan is not permission to implement.*

---

## 1. Sprint objective

Make capture real: a browser-extension user can save a page (popup, context menu, keyboard shortcut, or share) from any site, have its title/URL/description extracted, thumbnail fetched, and the resource delivered to the web app over the already-proven PoC bridge — **only** reported as "saved" after the web app's Dexie transaction commits and acknowledges.

## 2. Exact M6 task scope (from `docs/PHASE_3_TASK_BREAKDOWN.md`)

| Task | Title | P | Deps | Hrs | Acceptance |
|---|---|---|---|---|---|
| EXT-001 | `packages/extension-core` outbox state machine | High | POC-004 ✅ | 4 | Unit tests (ack/dedup/retry) |
| EXT-002 | Metadata extraction (title/URL/desc M1) | High | CORE-002 ✅ | 4 | Fixture pages extract correctly |
| EXT-003 | Thumbnails (M2; 429→placeholder) | Med | EXT-002 | 3 | Placeholder on failure |
| EXT-004 | Production bridge wiring (web side) | High | EXT-001 | 4 | End-to-end click→saved (Playwright) |
| EXT-005 | Context menu B1 + shortcut B2 + share B3 | Med | EXT-004 | 3 | All 3 triggers save |
| EXT-006 | Extension popup UI (save status, queue count) | Med | EXT-004 | 3 | "Saved" only after ack |
| EXT-007 | Extension-core sharing with web (no dup logic) | Med | EXT-001 | 1 | Shared pkg imported by both |

**Out of M6:** UI-004/SEARCH-* (M7), IMPORT-*/TEST-* (M8/M9), EXT beyond the above, cloud sync, auth, AI.

## 3. Task dependency map (within M6)

```
EXT-001 (outbox state machine) ──▶ EXT-004 (bridge, web receiver)
        │                          ├─▶ EXT-005 (triggers)
        │                          └─▶ EXT-006 (popup)
        └─▶ EXT-007 (sharing enforcement)
EXT-002 (metadata extraction) ──▶ EXT-003 (thumbnails)
        └─▶ EXT-004 (deliver payload)
```

Order: **EXT-007 → EXT-001 → EXT-002 → EXT-003 → EXT-004 → EXT-005 → EXT-006** — share protocol types first (both apps import them), then state machine, extractor, thumbnails, the bridge, capture triggers, and finally popup UI over the finished pipeline.

## 4. Implementation sequence

### EXT-007 (+ shared protocol review)
`packages/extension-core` already exports the R-2 protocol constants and Zod schemas (Sprint 1 — `PROTOCOL`, message types, `NACK_CODES`, `PERMANENT_NACK_CODES`). M6 adds: (a) the `CapturePayload` resource schema consumed by both sides, (b) the **outbox state machine**: ack/dedup/retry transitions with the approved R-1 policy (10 s ACK timeout; 1 s→60 s exponential backoff; unbounded retry count; FIFO queue; idempotent delivery; `permanent` vs transient nacks), persisting retry state in `browser.storage.local`. Acceptance: unit tests covering each transition.
Files: `packages/extension-core/src/outbox.ts`, `protocol.ts` (extended), `index.test.ts`.

### EXT-001 (consumed in `apps/extension`)
The outbox runs in the extension's background (service worker). Entries are `CapturePayload`s with `id` (client UUID from repo layer), `attempts`, `nextRetryAt`, `status`. Unit-tested state machine: enqueue → deliver → wait-ack → (ack → dequeued) / (nack-transient → backoff retry) / (nack-permanent → discard) / (timeout → retry). Idempotent: web dedups by `id`.

### EXT-002 — Metadata extraction
Content script reads `document.title`, URL, `<meta property="og:description">` + `<meta name="description">` (M1 fixture pages in `docs/validation/` format), also picks `og:image`/favicon (preparing EXT-003). Pure `readMetadata(document) → CaptureMetadata` DOM function, unit-tested against fixture HTML documents (jsdom), no new library (platform DOM APIs are sufficient; Readability would overshoot the brief and add a DOM-gobbling surface).

### EXT-003 — Thumbnails
`fetch(og:image)` with a sized budget; on 429/404/network error → placeholder card variant (M2 semantics). The `thumbnailUrl` lands in the payload; the web card already lazy-renders with `referrerPolicy="no-referrer"` and `onerror` hide — unchanged.

### EXT-004 — Production bridge wiring (web side)
New `apps/web/src/bridge/inbox.ts`: listens for `window.postMessage` `fluiddeck.capture` envelopes (origin-checked, nonce-checked, Zod-validated, envelope ≤ `MAX_ENVELOPE_BYTES`), calls `createResourceWithMembers` (Sprint 2, already transactional + canonical-dedup), and only then posts `capture.ack`. Duplicate deliveries of the same `id` must be idempotent off `canonicalUrl`. Tests: unit (origin/nonce/size rejection), Playwright e2e click→"saved" (extension driving the dev page).
Web side stores the delivered resource via `externalId` request param (documented earlier: "search as a future command").

### EXT-005 — Capture triggers
Context menu (B1: "Save to Fluid Deck"), `Ctrl+Shift+S` shortcut (B2), Web Share Target fallback (B3) — all call a single `captureCurrentTab()` that creates the payload and enqueues it into the outbox. Manifest gains `contextMenus`, `commands`, `web_accessible_resources` (as needed); WXT `contextMenus` API typed. Each trigger individually covered by a Playwright-ish manual/E2E check per the acceptance "All 3 triggers save".

### EXT-006 — Extension popup UI
`apps/extension/entrypoints/popup/` — minimal HTML + React or plain TS (WXT entrypoint): shows current queue depth and last save status. Source of truth is the outbox: status is **"Saved" only after `capture.ack`**, otherwise "Queued"/"Error". Reads `browser.storage.local` outbox via the same outbox module. No new UI framework; the existing popup + `lucide-react` icons already in the stack.

## 5. Technology decisions

| Capability | Decision | Why |
|---|---|---|
| Protocol schema / share | `zod` (already present) + `@fluid-deck/core` | R-2 already ships these; single source for envelope validation on both sides |
| Outbox persistence | `browser.storage.local` via WXT `storage` API | Native extension storage; no new dep (quota ~10 MB) |
| Metadata extraction | Platform DOM APIs (`document.title`, `querySelector(meta[...])`) | M1 scope; Readability is heavier than the brief |
| Thumbnails | `fetch` | No lib needed; M2 explicitly bounds failure to a placeholder |
| Popup UI | Native/WXT entrypoint + `lucide-react` (already adopted M5) | No new framework; consistency |
| Tests | Vitest (unit), Playwright (e2e pull-the-plug) | Existing stack; jsdom pragma not IndexedDB — service logic only here |

**No new dependencies proposed.** `webext-redux`/`webext-messaging` rejected (overbuilt for 4-message protocol); `@webext/core` rejected (thin wrapper over browser APIs, maintenance overhead unneeded).

## 6. Files and modules affected

- `packages/extension-core/src/` — outbox + payload schema (both sides import; EXT-007)
- `apps/extension/entrypoints/` — background (outbox loop), content (extractor), popup (UI), manifest (WXT config)
- `apps/web/src/bridge/` — web receiver + ack; `InboxPage` may show received items (already does)
- `packages/core/` — `ResourceInput`/`resourceInputSchema` already aligned; only used via `createResourceWithMembers`
- Tests: `packages/extension-core/src/outbox.test.ts`, content extractor fixtures, `e2e/extension-capture.spec.ts`

## 7. Testing strategy

- **Unit** (Vitest, today-agnostic): outbox transitions (ack/dedup/retry/backoff/dequeue), extractor against fixture HTML, web receiver (origin/nonce/size reject → no ack).
- **Integration**: same-repo in-memory (fake-indexeddb) — `createResourceWithMembers` idempotency on duplicate delivery.
- **E2E Playwright**: full click→saved loop against the dev web server with the WXT dev build loaded (Playwright `chromium.launchPersistentContext` + extension path) or the PoC pattern that worked in Sprint 1.
- **Browser/Firefox**: manual verification caveat (Sprint 1 pattern) — Firefox popup click (Sprint 1 carry-over) is **not** claimed until someone clicks it.

## 8. Accessibilities / UX constraints

Popup: small, keyboard navigable, focus visible; "Saved" only post-ack — never speculative. Context menu entries are native (browser-managed a11y). Capture failures surface through toast pattern (planned in M5 — `useToast` exists on web).

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| MV3 service worker dormancy kills the outbox loop | Cycle kept short; state rehydrated on wake; `browser.alarms` as wake-up for backoff |
| Firefox compatibility of `contextMenus`/`commands` | WXT abstracts; manual Firefox check in acceptance; Sprint 1 precedent |
| Web receiver being spoofed by a random page | Same origin+nonce+Zod+size gate as the PoC; document residual risk (unencrypted, origin-check-only) per Phase 2 security §1 |
| Thumbnail 429 spam | Delay + placeholder; no retry loop |
| Scope creep to M7 search | Extraction only produces metadata; retrieval is not built |

## 10. Acceptance criteria (per task, verbatim from breakdown)

- EXT-001: unit tests (ack/dedup/retry) — required in Vitest (node env + jsdom-independent logic).
- EXT-002: fixture pages extract correctly.
- EXT-003: placeholder on thumbnail failure.
- EXT-004: end-to-end click→saved (Playwright).
- EXT-005: all 3 triggers save.
- EXT-006: "Saved" only after ack.
- EXT-007: shared package imported by both apps.

## 11. Definition of done

- All 7 tasks pass their acceptance criteria with actual runs.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm build`, `pnpm test:e2e` green, reported with actual results.
- Bundle ≤250 kB gzip (build-measured after M6; baseline = 195.45 kB).
- `docs/SPRINT_5_IMPLEMENTATION_REPORT.md` created; `docs/PROJECT_PROGRESS.md` updated. Historical reports untouched.
- No push, no commit of Sprint 5 work. Stop and wait.
