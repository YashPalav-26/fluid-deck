
## EXT-001 — Durable outbox state machine (complete)

**Design:** `packages/extension-core/src/outbox.ts` — transport-agnostic `OutboxMachine` + `OutboxStorage` adapter + pure `computeBackoffMs`. Delivery and clock are injected; the module never touches `browser.*`. Background (`apps/extension/entrypoints/background.ts`) supplies the WXT storage adapter (`browser.storage.local` key `fluid-deck:outbox`, existing "storage" permission) and a `deliver` seam that resolves `"timeout"` until EXT-004 wires the real transport; `reconcile()` runs on boot + `runtime.onStartup` and **only** restores state — delivery attempts start only when a transport is configured (never silent: recovered queue depth is logged until then; a placeholder returning "timeout" would be dishonest if it ran, so the machine is deliberately not invoked for delivery yet — the reconcile-only boot path above is the smallest honest step).

**R-1 compliance (exact):** `ACK_TIMEOUT_MS = 10_000`; backoff `min(1000 × 2^n, 60_000)` (unbounded count, attempts++; floor 1 s, cap 60 s); FIFO — only the head (`records[0]`) is ever attempted; a later item cannot overtake a waiting head; single-flight via `#inFlight` (concurrent ticks share one attempt — tested); removal only on `ack` for the head's captureId, or `nack-permanent` (transient nack = backoff); computeBackoff over the *current* head attempts count so retries never reset; `handleAck` ignores empty/malformed/mismatched/stale/duplicate IDs idempotently; in-flight timeout→backoff.

**Storage guarantees:** `enqueue()` awaits `store.save()` before resolving (durable-before-deliver); a failed save throws and leaves the in-memory mirror untouched (test: no silent loss, next enqueue still succeeds); recovery = load-on-boot into `#records` (attempts/`nextAttemptAt` preserved across restart; waiting head not force-delivered early); a storage failure during an error-path save retains the record in memory (best-effort `.catch` — next successful write re-persists it; documented as the one judgment call).

**Tests (TDD, 16 unit `outbox.test.ts` + 4 core):** all 16 brief-mandated areas covered with fake clock semantics — persist-before-deliver, FIFO, head-ack removal, mismatched-id ignored, malformed ack ignored, duplicate ack harmless, 10s timeout → waiting(1s), full backoff ladder 1/2/4/8/16/32/60 + unbounded (4 ticks → attempts=4), failure retention, no-overtake, restart restore (pending + in-flight), retry-state survives restart, storage-failure safety, single-flight (2 concurrent ticks → 1 deliver), permanent-nack drop, transient-nack retry, duplicate-delivery safety, exact constants. Plus `index.test.ts` 4/4 (protocol intact through the same package).

**MV3 note:** wake-ups use existing semi-permanent events (boot + `onStartup`) — **no `alarms` permission added** (the approved evaluation did not include alarms; wake events + EXT-004's message-driven wake cover it; alarm-based wake-ups are an EXT-004 optimization if needed).

**Verification (actual):** `pnpm typecheck` 5/5; `pnpm test` **25 files / 140 passed** (+16 outbox, +4 alarm driver, +4 EXT-007 seam over Sprint 4's 116); `pnpm lint` clean; `pnpm exec prettier --check .` clean; `pnpm build` web 195.45 kB gzip, chrome-mv3 198.02 kB, firefox-mv3 198.14 kB; `pnpm test:e2e` **6/6 passed** (earlier in the same session, regression check before the docs update).

**Lifecycle correction (2026-11-10, user-mandated):** review found the EXT-001 implementation relied on startup/message wake events, which do not guarantee delivery when a persisted retry becomes due. Corrected with the approved alarms API (preferred over setTimeout, which never survives suspension):
- `packages/extension-core/src/alarm-driver.ts` — injected `AlarmApi` (ms↔s conversion inside), one-shot `scheduleAt/clear/reconcile/hasAlarm`; exported as `createAlarmAdapter` / `ALARM_NAME`.
- `OutboxMachine` gains `onSchedule(deadlineMs)` called after enqueue and after every failure→waiting transition with the head's `nextAttemptAt`.
- `background.ts` supplies the `browser.alarms` adapter; every boot reconciles (clear + recreate from durable state — alarm lost in a crash is rebuilt), and `onAlarm` for `ALARM_NAME` reloads durable state and processes via tick when due (idempotent + single-flight; stale/unknown names are no-ops).
- Manifest: `alarms` permission added (smallest addition; Chrome + Firefox MV3 both support it — Firefox's mv3 runtime is the same alarms capability Chrome ships).
- Tests today: driver mapping/reconcile/early-stale (4) + machine uses the 10 required brief areas already covered; the wake-loop is deterministic with injected adapters (no real timers).

**Contract/AMBIGUITY resolution:** permanent NACK is EXPLICITLY terminal in the approved architecture (`EXTENSION_WEB_COMMUNICATION_CONTRACTS.md` §3.3: version/payload_too_large/invalid_payload/invalid_url → "Delete from outbox immediately, never retry"; popup surfaces dismissible "couldn't save N captures". The machine's handling matches this verbatim — no decision needed.

**Final lifecycle audit (2026-11-10, user-mandated):** audit of the correction above found 5 gaps, all fixed in this pass (R-1 values untouched: 10s ACK, 1–60s backoff, unbounded, FIFO):
1. **ACK reconcile gap:** background armed only `nextAttemptAt` (0 for an in-flight head → epoch-0/immediate alarm). New pure `effectiveDeadlineMs(head, nowMs)` in `alarm-driver.ts` returns the earliest *future* deadline across retry (`waiting.nextAttemptAt`) and ACK (`ackDeadlineAt`), or null; used by `reconcile()` and `onAlarmWake()`.
2. **Early/duplicate delivery:** an armed attempt (`pending` + future `ackDeadlineAt`) re-delivered on any wake. `tick()` now re-arms and returns without delivering (same guard for `waiting` heads). Never delivers early; FIFO/single-flight preserved.
3. **Stale ACK deadline double-count:** timeout transitions kept `ackDeadlineAt`, so restart re-converted expired attempts and incremented attempts twice. Both failure paths now clear it (`ackDeadlineAt: undefined`).
4. **Epoch-0 alarm:** `onSchedule(0)` (empty queue) armed an immediate alarm. `scheduleAt(≤0)` now clears.
5. **`handleAck` re-arm:** removing the head now schedules the next head's deadline.

**Timing contract (documented in `alarm-driver.ts` header):** persisted logical deadlines are exact; browser wakes are not. Chrome production alarms have a 30s minimum firing interval and may be delayed — a 1s retry / 10s ACK wake can land late. Prompt execution while the worker is alive is the in-worker `setTimeout` race (`#deliverWithTimeout`, the same `ACK_TIMEOUT_MS`); the one-shot alarm is the suspension/restart fallback only — no polling, no recurring alarms. Every wake compares `now()` to the persisted deadline (`restore()` converts expired ACK deadlines to timed-out attempts; `tick()` guards early delivery). Firefox: alarms do not survive a browser restart (same as Chrome); boot + `onStartup` reconciliation recreates the alarm from durable state, so a missing alarm is never assumed.

**Storage failure (precise limitation, tested):** durable state is the source of truth; memory may run ahead but never feeds back into a reset. Arming-save failure (before delivery) surfaces from `tick()` with no attempt counted and durable untouched — delivery never starts without a durable deadline. Outcome-save failure falls into the catch path's best-effort re-save, which normally lands (attempt counted durably). If every transition save fails, durable stays at the last persisted state; restart restores it verbatim and re-attempts at the same backoff step — the one failure is re-tried, never escalated, never reset below the durable count, and the capture is never lost. A stronger guarantee (counting a failure whose write never landed) is impossible with this storage API and is not claimed.

**New tests (deterministic, injected clock/adapters):** `alarm-driver.test.ts` 8/8 (+epoch-0 clear, `effectiveDeadlineMs` ACK/retry/earliest/past/null); `outbox-lifecycle.test.ts` 9/9 (ACK persisted+scheduled before deliver, restart restores deadline, interrupted in-flight → timed-out attempt, single failed save → best-effort lands + survives restart, all saves fail → durable unchanged, early wake on armed attempt → no double delivery + re-arm, timeout clears ACK deadline, early waiting tick → re-arm + never early, arming failure surfaces + no attempt + recovers).
**Verification (actual):** focused `packages/extension-core/src/` 37/37; `pnpm typecheck` 5/5; `pnpm test` **26 files / 153 passed**; `pnpm lint` clean; `pnpm exec prettier --check .` clean; `pnpm build` web 195.45 kB gzip, chrome-mv3 199.03 kB, firefox-mv3 199.15 kB. No E2E re-run: no interaction surface changed (background has no user-visible behavior; E2E 6/6 from the correction pass stands).

## EXT-002 - Metadata extraction (complete)

**Scope:** M1 fields only - title, description, canonical URL, favicon URL, plus the M2 image URL as a *value* (downloading/placeholder is EXT-003). `docs/PHASE_3_TASK_BREAKDOWN.md` acceptance ("fixture pages extract correctly") and `SPRINT_5_IMPLEMENTATION_PLAN.md` §4 (pure `readMetadata(document)`, jsdom fixtures, no new library) are met without a content-script entrypoint: EXT-004 owns transport, EXT-005 owns triggers.

**Architecture:** `packages/extension-core/src/metadata.ts`
- `readMetadata(document, pageUrl) -> CaptureMetadata` - pure DOM extraction, the approved mechanism. One `meta` traversal + one `link` traversal per call (no repeated `querySelector` scans), first occurrence wins.
- `extractMetadata(pageUrl, options) -> Promise<CaptureMetadata>` - acquire path for captures with no live DOM (the offscreen/SPA case allowed by `SYSTEM_ARCHITECTURE` §7). Injects `fetchImpl`/`parseHtml`; defaults to `fetch` + `DOMParser`. Never throws.
- `fallbackMetadata(pageUrl)` - predictable degraded payload.
- `createCaptureDraft(...)` in `packages/extension-core/src/index.ts` (the protocol-owner file) maps metadata onto the frozen R-2 draft and validates with `captureDraftSchema`.

**Precedence (source: `SYSTEM_ARCHITECTURE.md` §7 "fallback chain, first hit wins"; FR-CAP-002/003):**

| Field | Order |
|---|---|
| title | `og:title` -> `twitter:title` -> `<title>` -> URL-derived (host + path slug) |
| description | `og:description` -> `twitter:description` -> `meta[name=description]` |
| image | `og:image`/`og:image:url` -> `twitter:image`/`twitter:image:src` (step 4 "first `<img>`" is EXT-003) |
| canonical | `og:url` -> `link[rel=canonical]` -> the page URL (canonicalized identity) |
| favicon | first `link[rel~=icon]` (`shortcut icon` included) |
| site name | `og:site_name` -> hostname (display-only; the frozen draft has no field) |

**Resource type:** left unset. The domain model's 8-value enum defaults to `other`; rule-based detection is M3 work that lives in `core` (`SYSTEM_ARCHITECTURE` §7) and does not exist yet - EXT-002 does not invent rules.

**Security:** inert `DOMParser` document (no script execution, no resource loading); no HTML ever re-enters a DOM; every URL is resolved against the page and re-validated by `httpUrlSchema` (rejects `javascript:`/`data:`/`file:`/`blob:`/relative); the canonical goes through `canonicalizeUrl`; text is whitespace-collapsed, control-char stripped and capped at `MAX_TEXT_LENGTH`; fetch uses `credentials: "omit"` and `referrerPolicy: "no-referrer"`; notes carry step names only, never page content.

**Reliability:** `url:invalid` (no request), `fetch:http-<status>`, `fetch:error`, `fetch:timeout` (5 s `AbortController`), `fetch:content-type` (non-HTML/XHTML), `fetch:empty`, `fetch:too-large` (declared `content-length` pre-check + actual byte check, 512 KiB), `parse:failed`, `extract:failed`. Redirects follow and relative metadata resolves against the final `response.url`. Every path returns `fallbackMetadata` + a note; extraction never mutates or touches the outbox.

**Tests (TDD, `metadata.test.ts`, 21):** all 20 brief-mandated areas - document title, OG title/description, meta-description fallback, site name, canonical (og wins, tracking stripped, hash dropped, relative resolved), favicon resolve + unsafe-scheme drop, missing-metadata fallback, precedence conflicts, malformed HTML, invalid page schemes (asserts `fetch` is never called), unsafe metadata URLs, HTTP 404, network rejection, fake-timer timeout, empty body, unsupported content type, oversized (declared + actual), redirect rebasing, invalid metadata on an otherwise valid capture, final payload through `captureDraftSchema`. One extra test covers the injected parser and the fail-closed `parse:failed` path.

**Verification (actual):** focused `metadata.test.ts` 21/21; `pnpm typecheck` 5/5; `pnpm test` **27 files / 174 passed** (+21 over EXT-001's 153); `pnpm lint` clean; `pnpm exec prettier --check .` clean; `pnpm build` web 195.45 kB gzip, chrome-mv3 199.03 kB, firefox-mv3 199.15 kB (unchanged - no entrypoint imports the module yet, so it tree-shakes out). `pnpm test:e2e` not run: no user-visible or browser-integration surface changed.

**Dependencies added:** none at implementation time; `jsdom` was then declared explicitly for this suite in the review corrections below (already-installed `^31.0.0`, dev-only).

**Known limitations / follow-ups:**
- No type detection (M3/`core`), no implicit `/favicon.ico` default, no icon-size selection, no `twitter:site` mapping.
- `siteName` is extracted but cannot be delivered - the R-2 draft is frozen without that field.
- No content-script/offscreen entrypoint exists yet; EXT-004/EXT-005 wire `readMetadata`/`extractMetadata` into capture.
- Where extraction runs (content script vs offscreen document) stays an EXT-004/EXT-005 decision, per plan ordering.

### EXT-002 review corrections (2026-11-10)

**Correction A - incremental size enforcement.** `readBoundedText(response, maxBytes)` replaces `response.text()` in `extractMetadata` (`packages/extension-core/src/metadata.ts`):
- `response.body.getReader()` + `TextDecoder({stream:true})`, so multibyte characters split across chunks decode correctly.
- Cumulative `bytes` is incremented **before** the chunk is decoded/appended; the first chunk that pushes the total past 512 KiB triggers `reader.cancel()` and returns `null` - the parser is never called with oversized content (`parseHtml` not invoked; asserted).
- `reader.cancel().catch(() => undefined)` then `releaseLock()` in `finally` - cancellation failures cannot mask the `fetch:too-large` result, and the lock is always released (including stream-error and abort paths).
- Body-less responses (synthetic/`Response` without a stream) still work: `response.text()` + byte check, same 512 KiB cap.
- Exact limit: `bytes > maxBytes` - a body of exactly 524,288 bytes is accepted; 524,289 is rejected.
- Content-Length pre-check kept as the cheap early exit; it is advisory only - a missing or misleading header still gets bounded by the stream.
- Timeout unchanged: 5 s `AbortController`; an abort during `reader.read()` rejects, the outer catch maps `aborted` to `fetch:timeout`, other rejections to `fetch:error`. Other fallbacks (`http`, `content-type`, `empty`, `parse:failed`) untouched.

**New tests (6, deterministic mocked `ReadableStream`s):** below-limit parses; exactly-at-limit accepted; over-limit rejected *without* content-length and the source's `cancel()` is called; misleading content-length still bounded; oversized body never reaches the parser; stream failure → `fetch:error`; abort mid-stream → `fetch:timeout` (fake timers). Existing timeout test kept. `metadata.test.ts` now 27 tests.

**Correction B - explicit test dependency.** `packages/extension-core/package.json` gains `"devDependencies": { "jsdom": "^31.0.0" }` - the exact version already installed (31.0.0, shared with `apps/web`). `pnpm-lock.yaml` changes only the `packages/extension-core` importer (+4 lines); no new package resolved, no production dependency, no parser library. `pnpm install` linked it locally; focused suite still green.

**Correction verification (actual):** focused `metadata.test.ts` 27/27; `pnpm typecheck` 5/5; `pnpm test` **27 files / 180 passed**; `pnpm lint` clean; `pnpm exec prettier --check .` clean; `pnpm build` web 195.45 kB gzip, chrome-mv3 199.03 kB, firefox-mv3 199.15 kB. `pnpm test:e2e` not run: no user-visible or browser-integration surface changed.

**Limitation removed:** the "byte cap enforced after download" caveat no longer applies. Remaining: no M3 type detection, no implicit favicon, `siteName` not deliverable, extraction run-location deferred to EXT-004/005.

## EXT-003 - Thumbnail failure handling and 429 cooldown (complete)

**Scope:** M2 semantics only - a missing, unsafe, failed, or rate-limited thumbnail degrades to a placeholder; 429 is recognized, `Retry-After` is honored, and the same URL is not re-fetched during its cooldown. `SPRINT_5_IMPLEMENTATION_PLAN.md` §4/§10 acceptance ("placeholder on thumbnail failure", hazard "no retry loop") is met. No fetching service, no persisted cache, no scheduler, no schema/protocol change, no R-1/R-2 change.

**Architecture:**
- `packages/extension-core/src/thumbnail.ts` (library-only; no `browser.*`): `createThumbnailProbe({ fetchImpl, now, timeoutMs, maxBytes, cooldowns })` returns `probe(url) -> Promise<ThumbnailProbeResult>`; `parseRetryAfter(header, nowMs)`. Every call resolves - failures are outcomes, never throws.
- `apps/web/src/features/library/ResourceCard.tsx`: the media slot is always rendered as an `aspect-video` box. An `<img>` renders only when the URL passes `httpUrlSchema` **and** that exact URL has not failed; `onError` records the failed URL (replacing the old `display:none`), so the slot keeps its dimensions and no broken-image glyph appears.
- `packages/extension-core/src/index.ts`: re-exports the module (the protocol-owner entrypoint); no protocol constant changed.

**Outcomes** (`ThumbnailProbeResult.outcome`): `ok`, `invalid-url`, `cooling-down`, `rate-limited`, `http-error`, `not-image`, `too-large`, `timeout`, `network-error`. `status` is carried for HTTP results; `retryAfterMs` for rate limiting and cooldown.

**429 / Retry-After behavior:**
- Status 429 is checked before the generic `!response.ok` branch, so it cannot be mistaken for another error; 404/500 remain `http-error` with their status.
- `Retry-After` supports delta-seconds (`30` -> 30 s) and HTTP-date (`Thu, 01 Jan 2026 00:00:30 GMT` -> remaining ms). Values are clamped to 1 s .. 24 h: a `0` header cannot spin, and a hostile huge value cannot suppress a host for longer than a day.
- Missing, empty, malformed (`soon`, `-5`, `1.5`), or numeric-looking non-dates fall back to 60 s. The fallback is returned as `retryAfterMs`, so UI can show timing later without re-parsing.
- **Cooldown:** a `Map<url, untilMs>` records `startedAt + retryAfterMs`. Before any fetch, an active cooldown returns `cooling-down` + remaining ms - no network call. The exact boundary (`now >= until`) is expired and allows one retry. Cooldowns are per exact URL and in-memory (session-scoped); there is no background refetch, no persisted state, and no aggressive retry path.
- `pnpm-lock.yaml` and manifests: unchanged by this task.

**Security:**
- `httpUrlSchema` rejects `javascript:`, `data:`, `file:`, `blob:`, relative and empty URLs before any request and again before the `img` is rendered.
- Probe request: `GET`, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `accept: image/*`, 5 s `AbortController`.
- The response must declare `image/*`; HTML/SVG documents are not fetched into the DOM and no body content is injected (`<img src>` only, `alt=""`, decorative placeholder `aria-hidden`).
- The body is cancelled rather than downloaded; declared `content-length` over 2 MiB is `too-large` before any read.
- No new host permissions; no page content in results or logs; no `dangerouslySetInnerHTML`.

**Resource integrity:** the card's title link, type badge, domain, description and trash/restore actions are independent of the media slot. A failure only swaps the slot's contents; the resource prop and stored record are never mutated. Since the slot exists in every state (`aspect-video`), image failure causes zero layout shift, and resources captured without an image get the same deliberate tile instead of an empty gap.

**Tests (TDD, 28 new):**
- `packages/extension-core/src/thumbnail.test.ts` (22): unsafe/relative URL rejection with no request; 429 detection; delta-seconds; HTTP-date; 1 s floor; 24 h cap; missing header default; malformed header default; HTTP-date in the past; active cooldown blocks fetch and resumes after it; exact-boundary expiry; per-URL isolation; 404/500 not classified as 429; image success with `credentials`/`referrerPolicy` assertions; non-image content type; declared oversize; body cancellation; network rejection; fake-timer timeout.
- `apps/web/src/features/library/ResourceCard.test.tsx` (6): valid image (lazy, no-referrer, no placeholder, `aspect-video`); missing URL -> placeholder; `javascript:` URL -> placeholder; `onError` -> placeholder while title link/domain/card survive; failed state persists across re-renders; a new thumbnail URL renders again.
- Existing `card-variant.test.ts` and all prior suites stay green.

**Verification (actual):** focused `thumbnail.test.ts` + `ResourceCard.test.tsx` **28/28**; `pnpm typecheck` 5/5; `pnpm test` **29 files / 208 passed** (+28 over EXT-002's 180); `pnpm lint` clean; `pnpm exec prettier --check .` clean; `pnpm build` web 197.15 kB gzip (+1.70 kB from 195.45; single 636.07 kB chunk, pre-existing Vite >500 kB warning), chrome-mv3 **199.03 kB**, firefox-mv3 **199.15 kB** (unchanged - no entrypoint imports the probe yet, so it tree-shakes out). `pnpm test:e2e` **6/6** run because card markup changed (smoke, navigation, IndexedDB boot, axe, palette, inbox/settings).

**Dependencies added:** none. `lucide-react ^1.70.0` was already installed (M5) and is now imported by the card for the single `ImageOff` icon.

**Known limitations / follow-ups:**
- Library-only: no content-script/offscreen/background caller exists yet; EXT-004/EXT-005 own capture wiring. Until then the probe is exercised only by tests.
- Cooldown state is in-memory and session-scoped by design (no background service, no `storage.local` entry). A reload forgets it; the placeholder still covers the card.
- EXT-002 step 4 ("first `<img>` on the page") is still not implemented; only `og:image`/`twitter:image` feed `thumbnailUrl`.
- The card does not re-probe a failed URL within the same mount (deliberate: a retry loop is exactly what this task forbids); a new `thumbnailUrl` resets the state.
- Images are cropped with `object-cover`; no intrinsic dimensions are stored, so the slot is a fixed 16:9 regardless of source aspect ratio.
- This intentionally supersedes the older plan line "the web card already ... `onerror` hide - unchanged"; the approved placeholder criterion requires the swap.

## EXT-004 - Production bridge wiring (complete)

**Scope:** connect the existing durable `OutboxMachine` (EXT-001) to the web app through the approved 3-hop bridge. Acceptance in `SPRINT_5_IMPLEMENTATION_PLAN.md` is "end-to-end click → saved (Playwright)"; capture triggers are EXT-005 and the popup is EXT-006, so the production path is proven by the real-browser test described below rather than by a context-menu click. R-2 v1 is untouched: the same four message types, the same envelopes, no new protocol version, no second schema.

**Architecture (no new queue, no new retry loop):**

| Piece | File | Responsibility |
|---|---|---|
| Hop 1 transport | `packages/extension-core/src/bridge-transport.ts` | One outbox entry → one `capture.deliver` envelope → one `DeliveryOutcome`. Tab registry fed by `capture.ready` or URL discovery. Validates every inbound ack/nack before it can complete a delivery. |
| Hop 2 relay | `packages/extension-core/src/bridge-relay.ts` | Content-script forwarder on exact app origins. Owns the per-load nonce and the origin/source/role checks. Injects `meta.nonce` on the way down. |
| Browser entrypoint | `apps/extension/entrypoints/bridge.content.ts` | `defineContentScript`, `matches` = exact app origins, `runAt: "document_start"`, supplies `window`/`browser` surfaces and `sessionStorage` nonce persistence. |
| Hop 3 receiver | `apps/web/src/bridge/inbox.ts` | Validates the deliver, writes through the existing Dexie repository, acks **only after the transaction resolves**. |
| Background wiring | `apps/extension/entrypoints/background.ts` | Constructs the transport, routes `ready`/`ack`/`nack` from `sender.tab.id`, discovers app tabs after a worker restart, ticks on alarm wake, cleans the registry on tab close/navigation. |
| Origin allowlist | `apps/extension/src/bridge-config.ts` | `http://127.0.0.1:5199`, `http://localhost:5199` only (dev). Exact strings; no wildcard, no parent-domain match. The production origin is a build-time addition. |
| Repository support | `apps/web/src/repositories/resources.ts` | `CreateResourceOptions { id?, dropMissingMembers? }`, `CreateResourceMembers { collectionIds?, tagIds?, tagNames? }`. |

**Why the repository changed:** capture-ID idempotency needs `captureId` to be `resources.id`. `createResource` now (a) checks the supplied ID first and returns the existing row when its `canonicalUrl` matches, (b) throws `CONSTRAINT` if that ID is already bound to a different canonical URL, (c) keeps the existing canonical-URL unique-index check for captures with a fresh ID. `createResourceWithMembers` gains in-transaction tag-name resolution (`ensureTags`) and an opt-in `dropMissingMembers` so a stale collection/tag from an untrusted draft is dropped instead of rejecting an otherwise valid capture. Defaults are unchanged for every existing caller.

**Delivery semantics (R-1 unchanged):** `ACK_TIMEOUT_MS = 10_000`, backoff `min(1000 × 2^n, 60_000)`, unbounded retries, FIFO single-head, single-flight, durable `storage.local` state, alarm wake. The transport never schedules anything: when no app tab is known or `tabs.sendMessage` rejects, it resolves `"timeout"` and the machine owns the backoff. Two additions are needed for correctness, not a second machine:
- `OutboxMachine.handleNack(captureId, permanent)` — a permanent NACK that arrives after the ACK timeout (or after the delivery promise was already resolved) still removes the head; a late transient NACK is deliberately a no-op because the scheduled backoff already owns the retry. Only a matching head is affected.
- `onSchedule(0)` with a non-empty queue drains via `setTimeout(..., 0)`, because the alarm driver clears epoch-0 alarms. Without it a newly enqueued pending head would wait for the next wake instead of the next tick.

**Ack/nack validation (both directions):** inbound acks/nacks must come from a known app tab (`sender.tab.id`), parse as the canonical envelope, have `senderRole: "webapp"`, a supported major version, a payload whose `captureId` matches the envelope, and — at the relay — the current nonce. Rejections are silent at the relay (wrong origin/source/nonce/role) and ignored at the background (bad envelope/payload/unknown tab). An ack from a different tab is accepted as a statement but does not complete this tab's pending delivery.

**Idempotency (two layers, both pre-existing):** `captureId` → `resources.id` (replay of the same capture) and `canonicalUrl` unique index (same page captured twice). A duplicate delivery acks `outcome: "duplicate"` with the surviving `resourceId` and creates no second row; there is no in-memory replay cache. Ack after a duplicate commit is still idempotent from the outbox's point of view (`handleAck` only acts on the matching head).

**Failure mapping (web → NACK):** `QuotaExceededError` → `quota`; `DatabaseClosedError` / `InvalidStateError` → `db_unavailable`; `RepositoryError` `VALIDATION`/`CONSTRAINT` → `invalid_payload`; anything else → `transient`. Envelope too large → `payload_too_large`; unsupported major → `version`; `httpUrlSchema` rejection → `invalid_url`. Permanent codes follow the approved table (`version`, `payload_too_large`, `invalid_payload`, `invalid_url` are discarded by the outbox); `quota`, `db_unavailable`, `transient` are retried. **No ACK is ever posted for a failed or partial write**, and validation happens before any database access (the one exception is the transactional write itself, which either commits or throws).

**Metadata and thumbnails:** EXT-004 does not call `extractMetadata()` or `createThumbnailProbe()`. The draft arrives already carrying title/description/thumbnail/favicon from the capture path (EXT-002/003 own those), the inbox only re-validates it and maps it onto `ResourceInput`. The boundary is deliberate: the receiver must not fetch remote pages or images, so it cannot become a second fetcher with its own timeout/cooldown semantics. Optional URL fields that fail `httpUrlSchema` are dropped instead of rejecting the capture; `type` is passed through or defaults to `other` (no M3 detection).

**Security:** exact origin allowlist (no wildcard, no regex, no subdomain matching) on both the manifest `matches` and a runtime re-check in the content script; `event.source === window` so only the top frame counts; per-load nonce in the web app and in the relay's content-script sessionStorage; `targetOrigin` is the exact origin on every `postMessage`; both hops re-validate the Zod envelope; payload size checked against `MAX_ENVELOPE_BYTES` (64 KiB) before parsing; all URLs re-checked with `httpUrlSchema`; the extension outbox (`chrome.storage.local`) and the web IndexedDB stay separate stores with separate authority. No new manifest permission (`alarms` came from EXT-001), no `externally_connectable`, no `tabs` permission (host permissions already cover the `tabs.query` URL filter), no `<all_urls>` content-script injection beyond the exact app origins.

**Lifecycle:** boot and `runtime.onStartup` restore durable state, rediscover app tabs via `tabs.query` (host permissions cover it) and reconcile the alarm before ticking; `onAlarm` reloads the same durable state, so a restarted worker rebuilds the registry without waiting for a new handshake; `tabs.onRemoved` forgets the tab and drops its pending delivery; `tabs.onUpdated` forgets non-app URLs and re-registers app URLs (the fresh load re-announces `capture.ready`); listeners are registered once at module scope. If the app is closed or no receiver exists, delivery resolves `"timeout"`, the record stays durable, and the alarm wakes the worker — nothing is dropped, nothing is delivered early, and no duplicate listener or attempt is created.

**Tests (5 new unit files, 37 tests; 1 real-browser spec):**
- `packages/extension-core/src/bridge-transport.test.ts` (8): no tab → timeout; one canonical envelope to a known tab then ack; `sendMessage` rejection → timeout (no relay); ack from another tab does not consume; permanent/transient nack outcomes; only valid ready envelopes register; wrong-role/version/type acks rejected; `forgetTab` removes delivery targets.
- `packages/extension-core/src/bridge-relay.test.ts` (8): wrong origin; wrong source/frame; non-envelope and wrong role; ready installs the nonce and is forwarded; deliver gets `meta.nonce` + exact `targetOrigin`; deliver with wrong role/version rejected; ack requires the current nonce; ack before any ready is rejected.
- `packages/extension-core/src/outbox-nack.test.ts` (4): permanent nack removes the head durably; transient nack is a no-op; unknown/non-head IDs ignored; a waiting head is removed when the permanent nack arrives after timeout.
- `apps/web/src/repositories/resources-bridge.test.ts` (7): capture ID becomes the row ID; same ID + same URL is idempotent; same ID + different canonical URL throws `CONSTRAINT`; new ID + same URL dedups by canonical URL; tag names are created inside the transaction (duplicates merged, display name preserved); known collections added and unknown membership IDs dropped; strict mode still throws and rolls back.
- `apps/web/src/bridge/inbox.test.ts` (10, real Dexie on `fake-indexeddb`): ready handshake once with the per-load nonce; commit-then-ack `created`; duplicate delivery acks `duplicate` with one row; **no ack before the transaction resolves**; failure → retryable nack for `quota`/`db_unavailable`/`transient` and never an ack; version mismatch is permanent; oversized envelope rejected before touching the database; `invalid_url` vs `invalid_payload`; wrong origin/source/nonce/role produce no reply at all; tag names resolved and unknown collection IDs dropped.
- `e2e/bridge.spec.ts` (real browser, **not** mocked helpers): loads the built `apps/extension/.output/chrome-mv3` into Chromium, waits for the service worker and the real `capture.ready` handshake, enqueues through the service-worker test API, and asserts that (a) the outbox reaches 0 only after the row is durable, (b) the card appears, (c) exactly one `resources` row exists for the canonical URL, and (d) replaying the same capture ID leaves the count at 1 and clears the queue again.

**Verification (actual):** focused `packages/extension-core/src/bridge-transport.test.ts bridge-relay.test.ts outbox-nack.test.ts` + `apps/web/src/repositories/resources-bridge.test.ts` + `apps/web/src/bridge/inbox.test.ts` **37/37**; `pnpm typecheck` 5/5; `pnpm test` **34 files / 245 passed** (+37 over EXT-003's 208); `pnpm lint` clean; `pnpm exec prettier --check .` clean; `pnpm build` web **200.80 kB gzip** (+3.65 kB from 197.15; single 648.66 kB raw chunk, pre-existing Vite >500 kB warning), chrome-mv3 **303.79 kB raw / 86.52 kB gzip** (new `content-scripts/bridge.js` 101.15 kB raw / ~29 kB gzip — the relay bundles the shared Zod envelope), firefox-mv3 **303.90 kB raw / 86.58 kB gzip** — inside the 250 kB gzip cap; `pnpm test:e2e` **7/7** (6 existing + the new bridge spec).

**E2E runner note (recorded for CI):** the bridge spec launches Playwright's bundled Chromium with `channel: "chromium"`. The default headless shell cannot load extensions at all, and Chrome stable ≥ 137 ignores `--load-extension`; both were verified on this machine (Chrome 156.0.8078.81). The spec fails fast with an explicit "run `pnpm build`" message when the extension output is missing, rather than silently skipping.

**No dependency added.** The web app already depended on `@fluid-deck/extension-core` (EXT-007); the content script and background use WXT's existing `browser` global. `pnpm-lock.yaml` changed earlier in the sprint only for the EXT-002 `jsdom` devDependency.

**Known limitations / follow-ups:**
- No capture trigger exists yet (context menu / shortcut / share are EXT-005). The only enqueue path today is the service-worker-global `globalThis.__fluidDeck` test API, which is unreachable from pages.
- The popup does not report save status or queue depth yet (EXT-006).
- Tab selection is "first known app tab". With several app tabs open the head is delivered to one of them; a loss is a timeout, not a duplicate, because the receiver is idempotent either way.
- `dropMissingMembers` is opt-in and used only by the bridge; normal UI writes keep their strict failure behavior.
- The dev origin list is hard-coded for `:5199`. Production builds must add the deployed origin to `bridge-config.ts`; the plan's build-time origin injection is not implemented (no production origin exists yet).
- The relay's nonce is stored in content-script `sessionStorage`; a browser that blocks storage falls back to the in-memory nonce and simply re-handshakes on reload.

## EXT-005 - Capture triggers (B1 + B2 complete, B3 deferred by decision)

**Approved task line:** `PHASE_3_TASK_BREAKDOWN.md` M6 and `SPRINT_5_IMPLEMENTATION_PLAN.md` §4 both say "Context menu B1 + shortcut B2 + share B3" (3 h). Acceptance in the plan is "all 3 triggers save". The trigger→pipeline requirements come from PRD FR-CAP-007 (context menu save) and FR-CAP-008 (keyboard shortcut), plus plan §4's browser-behavior hazards and §10's "no trigger bypasses URL validation or the durable outbox" constraint.

**Trigger definitions and sources.**

| ID | Trigger | Entry point | Source |
|---|---|---|---|
| B1 | Context menu "Save to Fluid Deck" on the page | `browser.contextMenus.onClicked` → `captureTab(tab, "context-menu")` | `SPRINT_5_IMPLEMENTATION_PLAN.md` §4; PRD FR-CAP-007 |
| B2 | `Ctrl+Shift+S` / `⌘⇧S` | `browser.commands.onCommand("save-current-tab")` → `captureActiveTab("command")` | `SPRINT_5_IMPLEMENTATION_PLAN.md` §4; PRD FR-CAP-008; `MVP_FEATURE_PRIORITIZATION.md` (B2 = shortcut; note that PRD FR-CAP-007/008 label them B2/B1 — the label order differs between documents, the trigger set does not) |
| B3 | "Web Share Target fallback" | **Not implementable** | See deferral below |

**B3 deferral (decided with the user before implementation; no code written).** Four documents disagree, and none of them describes an extension capability:

- `SPRINT_5_IMPLEMENTATION_PLAN.md` §4 names B3 "Web Share Target fallback".
- `PRODUCT_REQUIREMENTS_DOCUMENT.md` §7.2 lists "Mobile share target (C4)" as **Post-MVP, Phase 8+**.
- `MVP_FEATURE_PRIORITIZATION.md` defines B3 as the **page action popup**, which is `EXT-006` ("Extension popup UI"), not a share target.
- `apps/web` has no PWA manifest and no `share_target` entry (verified: no `manifest*.json` / `*.webmanifest` / service worker in the app), so there is nothing to fall back to.

A Web Share Target is a PWA/manifest capability registered by the receiving web app and invoked by the OS share sheet on mobile; no browser-extension API can register or emulate it, and adding a PWA manifest is Phase 8 web work that this task's scope excludes. **Decision (user-approved): implement B1 and B2 fully and document B3 as deferred**, rather than inventing a third extension trigger (the only candidate, toolbar-action capture, is EXT-006's surface). Sprint plan line should read as two extension triggers plus the deferred PWA item.

**Architecture - one pipeline, no second queue.**

```
B1 onContextMenu(tab)  ─┐
B2 onCommand→tabs.query ─┴→ captureTab() → createCaptureService.capture({url, tabId, trigger})
                                    │
                      URL validation (httpUrlSchema, HTTP(S) only)
                                    │
                      metadata: content script ← readMetadata(document)   (EXT-002)
                                    │  (timeout / missing / restricted → fallbackMetadata)
                      createCaptureDraft() (canonical R-2 draft, EXT-002)
                                    │
                      outbox.enqueue()  ← ACCEPTED BOUNDARY (EXT-001, durable)
                                    │
                      EXT-004 transport → relay → web inbox → Dexie commit → ACK
```

- `packages/extension-core/src/capture.ts` - `createCaptureService({ extract, enqueue, queueDepth, now, createId })`. Pure: no `browser.*`, every dependency injected. `CAPTURE_TRIGGERS = ["context-menu", "command"]` is the single source of truth for which triggers exist (EXT-005 state; EXT-006 subsequently added `"popup"`, so the current declaration is `["context-menu", "command", "popup"]`).
- `apps/extension/entrypoints/capture.content.ts` - new content script (`<all_urls>`, `document_idle`) that answers the internal `READ_METADATA_MESSAGE` with `readMetadata(document, location.href)`.
- `apps/extension/entrypoints/background.ts` - `captureTab()`, `captureActiveTab()`, `extractForCapture()` (5 s `withTimeout` budget), `registerContextMenu()`, the two listeners, and truthful `reportCapture()` logging.
- `apps/extension/wxt.config.ts` - `commands["save-current-tab"]` with `suggested_key.default = "Ctrl+Shift+S"` and `.mac = "Command+Shift+S"`. `commands` is a manifest key, not a permission.

**User interaction, per trigger.**

- **B1 (context menu).** Right-click anywhere on the page → "Save to Fluid Deck" (page context only; no image/link/selection variants, so the captured target is always the page the user was looking at). The browser supplies the clicked tab, so no `tabs.query` and no `tabs` permission are involved. Menu registered once via `runtime.onInstalled` (`removeAll` first, so it is idempotent) and re-asserted on `runtime.onStartup` for browsers that drop menus. Both are wrapped so a registration failure logs and never breaks the worker.
- **B2 (keyboard).** `Ctrl+Shift+S` (Chrome/Edge/Linux/Windows) or `⌘⇧S` (macOS); the exact binding from PRD FR-CAP-008. The user can rebind it on the browser's extension-shortcuts page — `commands` is deliberately not a global/OS-level hook. The command event carries no tab, so the handler queries `{active: true, currentWindow: true}`; a browser that refuses the query produces `rejected/missing-url` rather than an exception. Note that Chrome reserves some combinations; `Ctrl+Shift+S` is not reserved and loads without a conflict warning in the built manifest.
- **Neither trigger opens the popup or any new UI.** `EXT-006` owns the popup surface; this task adds no badge, toast, or dialog (a badge would have no honest time to clear before EXT-006 wires ack status).

**Data flow and durability, per trigger.** Both triggers produce the identical `CaptureResult` and the identical pipeline above: the only difference is where the tab comes from (`onClicked`'s `tab` vs. `tabs.query`). `captureId` is a fresh UUID per invocation; `capturedAt` is the capture time; `source: "extension"`. `title`/`description`/`canonicalUrl`/`faviconUrl`/`thumbnailUrl` come from the EXT-002 metadata object, and the payload is validated by the shared `captureDraftSchema` before it is queued. `accepted` is returned **only after** `outbox.enqueue()` resolves, i.e. after `browser.storage.local` confirmed the write — the same durable-before-deliver rule as EXT-001.

**Metadata integration (and the MV3 finding that shaped it).** The first attempt wired `extractMetadata(url)` straight into the background and the real-browser test proved it wrong: **an MV3 service worker has no `DOMParser`**, so the streaming fetch path fell through to `parse:failed` and every capture was `degraded` even on a trivial page (verified live: `degradedMetadata: true` for a page with a real `<title>`). The approved live-DOM path was therefore used instead:

- `capture.content.ts` runs in the captured tab's isolated world and returns `readMetadata(document, location.href)` — the exact EXT-002 implementation and precedence, no second extractor.
- The background sends `READ_METADATA_MESSAGE` to `tab.id` (available because of the already-declared `<all_urls>` host permission; no `tabs` permission), wrapped in a 5 s `withTimeout` using `EXTRACTION_TIMEOUT_MS`.
- Missing content script (`chrome://`, `about:`, `file:`, add-on stores, PDF viewer, discarded/hung tab), a rejected `sendMessage`, a timeout, or a structurally invalid response all fall back to `fallbackMetadata(url)` — the capture is still queued, only the fields degrade. `isCaptureMetadata()` re-validates the response because a message response is still an untrusted boundary.
- The internal message name `fluiddeck:internal:read-metadata` is **not** part of R-2: it never crosses the extension boundary, adds no protocol version and no message type, and is only handled by our own isolated-world script.

**Thumbnail integration.** EXT-003's `createThumbnailProbe()` is deliberately **not** called at capture time. Its approved scope is "the card owns placeholder rendering"; probing before enqueue would delay durability by up to 5 s for no user-visible benefit and would put a second fetcher on the critical path. `thumbnailUrl` therefore flows through the draft exactly as extracted, and the card's existing placeholder covers a bad/missing image. Thumbnail failure remains non-fatal at every hop.

**Enqueue, ACK, and what "saved" means.** `accepted` = "queued durably", never "saved". The ACK is posted by `apps/web/src/bridge/inbox.ts` only after the Dexie transaction commits; the outbox row is removed then. If the web app is closed, the record survives in `storage.local` and the EXT-001 alarm re-delivers on the next app open (10 s ACK timeout, 1-60 s exponential backoff, unbounded, FIFO, single-flight — all unchanged).

**Feedback and error handling (truthful, no new UI).** `reportCapture()` logs one structured record per trigger:

| Result | Condition | User-visible behavior |
|---|---|---|
| `accepted` (`degraded: false`) | metadata complete, durable write confirmed | console: capture id, url, `degradedMetadata: false`, queue depth |
| `accepted` (`degraded: true`) | metadata partial/failed, capture retained | same log with `degradedMetadata: true` — the draft keeps the URL-derived title |
| `rejected / missing-url` | no active tab, empty URL, unreadable tab | console info; nothing enqueued, nothing saved |
| `rejected / unsupported-url` | `chrome://`, `about:blank`, `file:`, `javascript:`, `data:`, `edge://`, `view-source:`, not-a-URL | console info with the offending URL; nothing enqueued |
| `failed / outbox-unavailable` | `storage.local` write refused (e.g. quota) | `console.error` "capture NOT queued"; nothing is claimed as saved |
| web app unavailable | delivery times out | outbox retains the record; captured-then-delivered on next app open |

`globalThis.__fluidDeck.lastCapture()` exposes the same `CaptureResult` for diagnostics/support without adding a user surface. EXT-006 will consume the outbox and the ACK to render real status.

**Permissions and security.** No permission was added: the manifest is still exactly `storage`, `activeTab`, `scripting`, `contextMenus`, `alarms` with `host_permissions: ["<all_urls>"]`. `contextMenus` and `alarms` were already declared; `commands` is not a permission. The new content script is restricted to HTTP(S) by the pipeline's `httpUrlSchema` gate before any tab messaging, and it only ever returns the five approved metadata fields — it runs no page code, injects nothing into the page, reads no page content beyond the metadata tags, and cannot be messaged from a page. The bridge's exact origin allowlist (`http://127.0.0.1:5199`, `http://localhost:5199`) is untouched; no wildcard origin and no `externally_connectable` was introduced. A context-menu click on a restricted page (`chrome://`, add-on store) reaches the pipeline as an unsupported URL and is rejected before any storage write. No URL is fetched at capture time by the extension.

**Idempotency / duplicate behavior.** Two deliberate layers already existed; EXT-005 adds no queue logic on top:
- Every invocation gets a distinct `captureId`, so pressing the trigger twice is two durable writes (two honest captures) rather than a silent merge — the user asked twice.
- The library still contains one row because the repository dedups on canonical URL; the second delivery acks `outcome: "duplicate"` and creates no second resource. The e2e test asserts exactly this (`toHaveCount(1)` after two triggers).
- Replays (same `captureId` re-delivered) are the EXT-004/EXT-001 case and remain idempotent.

**Tests (TDD).**

- `packages/extension-core/src/capture.test.ts` (33, deterministic, injected extraction/enqueue/clock/id) covers the 15 mandated areas: exact trigger set; both triggers run the same pipeline; URL trimming; missing/empty URL; eight unsupported schemes and non-URLs rejected with no extraction and no enqueue; EXT-002 reuse through the real `extractMetadata` with a fixture response; fetch failure → degraded but accepted; extractor throw → `fallbackMetadata`; image/favicon passthrough; image absent → capture retained, thumbnail undefined; payload passes `captureDraftSchema`; queue depth after enqueue; **no `accepted` before the durable write resolves** (explicit ordering assertion); storage failure → `failed/outbox-unavailable` and never `accepted`; distinct ids with identical canonical hint; durability across a worker restart via a real `OutboxMachine`; `isCaptureMetadata` accept/reject cases.
- `e2e/capture-triggers.spec.ts` (3, real browser, `channel: "chromium"`, built extension, real HTTP fixture server): context-menu path captures the active page, ACKs only after the Dexie commit, card appears; command path through the same pipeline; repeated triggers enqueue twice, produce distinct ids, and leave exactly one resource. The spec fails fast with an explicit "run `pnpm build`" message if the extension output is missing — it is never silently skipped. The native gestures themselves (actual right-click menu item, actual key chord) are documented as manual checks below; everything they invoke is exercised for real.
- Existing suites unchanged and green.

**Verification (actual):** focused `capture.test.ts` **33/33**; `e2e/capture-triggers.spec.ts` **3/3**; `pnpm typecheck` **5/5**; `pnpm test` **35 files / 278 passed** (+33 over EXT-004's 245); `pnpm lint` clean; `pnpm exec prettier --check .` clean; `pnpm build` web **200.80 kB gzip** (unchanged — no web source changed in this task), chrome-mv3 **410.74 kB raw / 117.19 kB gzip**, firefox-mv3 **410.86 kB raw / 117.24 kB gzip** (new `content-scripts/capture.js` 102.66 kB raw; both well inside the 250 kB gzip cap); `pnpm test:e2e` **10/10** (6 web, 1 bridge, 3 capture triggers).

**Manifest diff (built output).** `commands.save-current-tab` added; second content script `content-scripts/capture.js` on `<all_urls>` at `document_idle`; `permissions`, `host_permissions`, `action`, `background`, and the `bridge.js` entry are byte-for-byte unchanged; Firefox keeps `browser_specific_settings.gecko` and `data_collection_permissions.required: ["none"]`.

**No dependency added.** `pnpm-lock.yaml`, `apps/web/package.json`, and `packages/extension-core/package.json` were not touched by this task (their pending changes are EXT-002's `jsdom` devDependency and EXT-004's workspace dependency).

**Manual verification still outstanding (documented, not silently skipped).**
1. Chrome/Edge: right-click a normal page → the item reads exactly "Save to Fluid Deck" and is absent on `chrome://` pages.
2. Chrome/Edge: press `Ctrl+Shift+S` on a normal page; confirm `chrome://extensions/shortcuts` lists "Save the current page to Fluid Deck" as active (not "unassigned"/conflicting).
3. macOS: `⌘⇧S` behaves identically.
4. Firefox: the same two gestures. Firefox registers `commands` and `contextMenus` in MV3, but the built `firefox-mv3` bundle has not been loaded in a real Firefox here; verify the menu item, the shortcut, and that `runtime.onInstalled` menu creation survives a browser restart (`about:debugging` → Inspect).
5. With the web app closed: trigger both, then open the app and confirm the queue drains and the cards appear (durable-then-delivered path).

**Known limitations / follow-ups.**
- B3 (share target) is deferred: it is the Phase 8 PWA capability, and the MVP doc's B3 (page action popup) is EXT-006.
- No user-facing confirmation exists yet (no toast, badge, or popup text). Feedback is a truthful return value plus structured console diagnostics; EXT-006 owns the visible status and the decision of when "Saved" may be shown.
- Metadata is read from the live DOM, so a page whose metadata is set by client-side JavaScript *after* `document_idle` may be seen in its earlier state; the timeout/fallback chain guarantees a capture either way.
- Restricted pages (browser UI, add-on stores, `file://`, PDF viewer) cannot answer the metadata request and are captured with a URL-derived title — or rejected if the scheme is not HTTP(S).
- Trigger a page and immediately close the tab: the enqueue has already resolved durably, but the metadata request may have been cut short → degraded title (capture still saved).
- Context-menu registration depends on `runtime.onInstalled`/`onStartup`; a browser that persists neither would need EXT-006's diagnostics to notice. Chrome and Firefox persist both.
- The `<all_urls>` content script is a broader injection than the bridge's exact-origin relay. It is required because any page can be captured, it is already covered by the approved host permission, and it answers exactly one internal message.

## EXT-006 - Extension popup UI (complete)

**Files created / modified.**
- `packages/extension-core/src/popup-status.ts` (new) - the pure status model: `PageCaptureStatus` union, the two outbox-exit registries (`addSavedCapture` / `addFailedCapture`, 40 entries, dedupe by captureId), `derivePageCaptureStatus`, `summarizeOutbox`, the internal `POPUP_CAPTURE_MESSAGE` name, the sanitized `PopupCaptureResult` + `toPopupCaptureResult`, and the re-exported `OUTBOX_STORAGE_KEY` (single source, reused by the background instead of its old literal). No `browser.*` anywhere.
- `packages/extension-core/src/popup-status.test.ts` (new) - 17 deterministic model tests.
- `packages/extension-core/src/capture.ts` / `capture.test.ts` - `"popup"` added to `CAPTURE_TRIGGERS` (now exactly three approved triggers; test asserts the exact set).
- `packages/extension-core/src/index.ts` - `export * from "./popup-status.ts"`.
- `apps/extension/entrypoints/background.ts` - the two outbox-exit registry helpers (`loadRegistry`/`persistRegistry`/`rememberSavedCapture`/`rememberFailedCapture`, `payloadFor` reads url + canonical hint **before** the record leaves the outbox); ack routing records `saved` only in the `.then` of a successful `handleAck`; permanent-nack routing records `failed` in the `.then` of `handleNack(id, true)` with `route.code`; `STORAGE_KEY` now references the shared `OUTBOX_STORAGE_KEY`; popup capture handler (`captureTabById` / `isPopupCaptureRequest` / `handlePopupCapture`) returning the popup's response.
- `apps/extension/entrypoints/popup/index.html` + `main.ts` (rewritten) and `style.css` (new) - the popup surface described below.
- `e2e/popup.spec.ts` (new) - 3 real-browser tests.
- `docs/SPRINT_5_IMPLEMENTATION_REPORT.md` + `docs/PROJECT_PROGRESS.md` - this section and the progress entry; EXT-007→EXT-005 history untouched.

**What the popup does.** A 280 px compact surface that renders the authoritative state of the current page's capture and offers one action, mirroring the web app's slate identity (Tailwind slate scale as CSS custom properties, `bg-slate-900` primary button with `hover:bg-slate-700`, `rounded-md`, `focus-visible` outline, `prefers-reduced-motion` honored - only the in-flight spinner animates, and not at reduced motion). Layout: small uppercase "Fluid Deck" wordmark (`h1`), two-line clamped page title + hostname, the status row, a factual queue line, "Save page", "Open Fluid Deck". No cards, gradients, charts, or decorative motion; color never carries status alone.

**Status model and transitions (single source per state).**
- `not-captured` - no outbox record matches the page URL/canonical form, no exit entry.
- `queued` (with FIFO position) - newest matching `OutboxRecord` with `attempts === 0`, `status: "pending"`. Enqueue confirmed; never rendered as "Saved".
- `saving` - record with `attempts > 0` (an in-flight attempt is armed on the durable record). R-1: at best "saving".
- `retrying` - record with `status: "waiting"`; shows attempt count and the next retry time from `nextAttemptAt`.
- `saved` - ONLY a `SavedCaptureEntry`, which the background records exclusively after `OutboxMachine.handleAck` resolved for a validated `capture.ack` - the ACK the web sender only posts after its Dexie transaction commits (EXT-004 unchanged).
- `failed` - ONLY a `FailedCaptureEntry`, recorded after a validated `capture.nack` with `permanent: true` discarded the record, carrying `NackRoute.code` (e.g. `invalid_payload`); plus storage-read failure (`storage-unavailable`).
- Derivation precedence `derivePageCaptureStatus`: newest matching outbox record → newest (by event time) saved/failed exit → not-captured. Matching compares exact URL equality against `url`/`canonicalUrlHint` in both directions, then canonicalized forms (`canonicalizeUrl`), so `?utm=…` captures still classify the same page.

**How status reaching outbox-exit is captured without duplicating the machine.** The registries are append-only diagnostics, not a queue: the background calls `rememberSavedCapture`/`rememberFailedCapture` only in the resolution paths above and persists at most 40 entries. Records rejected at capture time or outbox-unavailable writes are not recorded (they may still be durably retried later; claiming them failed would be false). No R-1 timing, ACK semantics, transport, or protocol byte changed.

**Live updates and reopens.** The popup has zero owned state: on `storage.onChanged` (outbox or either registry, local area) it re-reads all three keys and re-derives - so an ACK flips the row from `sending`-ish states to "Saved" live; closing the popup never cancels anything (the outbox is durable and the service worker delivers independently); reopening re-derives the same view from the same durable storage; a service-worker restart changes nothing the viewer derives.

**Access failure of the immediate click path.** The save button posts `POPUP_CAPTURE_MESSAGE` with the tab's id; the background validates the sender as extension-owned (no `sender.tab` - the real popup - or a `chrome-extension://<runtime.id>/` page; a web page can never impersonate it since it would need the runtime id). A `captureTabById("missing-tab")` maps to a truthful rejected result; a `sendMessage` rejection (worker gone) is rendered "Fluid Deck isn't responding - try again" while the outbox retains whatever is durably there. The response is sanitized `PopupCaptureResult` (unserializable error flattened to `errorMessage`). Risk assessment: the popup adds no capture path; the button is another `CaptureTrigger`.

**Queue and retry visibility.** A one-line summary of real outbox contents, e.g. `2 waiting to be delivered · 1 retrying`, shown only when non-empty and hidden otherwise - counts straight from `summarizeOutbox(records)`. The status row, not the summary line, is where a page's own retry info lives (`Can't reach the app - retrying (attempt N) in <X seconds/moments>`), with the next retry time coming exactly from `OutboxMachine`'s durable `nextAttemptAt`. Internal payload details (nonce, deadlines, ids beyond what the status needs) are not exposed.

**Accessibility.** Semantic `h1`/paragraphs/`form`/`button`; `role="status" aria-live="polite"` announcing every status change through a single text node; five distinct inline SVG icons (aria-hidden, decorative, status text is the accessible name carrier); full keyboard path - Tab reaches "Save page" then "Open Fluid Deck", Enter submits the form (verified e2e via `toBeFocused()` + `keyboard.press("Enter")`); visible `focus-visible` outlines; contrast pairs verified against slate-700-on-slate-50 (the `saved` green and `failed` red tints carry bold/status weight and never rely on color alone); same 12 ms transitions for `prefers-reduced-motion: reduce` are disabled. An automated axe scan runs clean on a fully rendered popup.

**The one e2e seam (documented honestly).** Chrome renders real extension popups in a window outside Playwright's automation boundary, so `e2e/popup.spec.ts` opens the production `popup.html` as a tab and calls `window.__fluidDeckPopup.setActiveTab` - supplying the tab that real `tabs.query({active, currentWindow})` would otherwise answer with the popup page itself. The seam is the only e2e-only piece, it can only supply what a real `tabs.query` would return (a tab id/url/title), and everything downstream (derive logic, storage reads, messaging, ack→saved, retried relevance flow through production code). Nothing else is mocked: real built extension, real HTTP fixture pages, real durable outbox, real bridge, real Dexie commit + ACK.

**Tests (TDD).**
- `packages/extension-core/src/popup-status.test.ts` (17): not-captured empty state; pending record ⇒ queued; `attempts > 0` ⇒ saving, never saved; `waiting` ⇒ retrying with attempts + `nextRetryAt`; URL/canonical matching (exact and canonicalized both directions); saved-from- registry classification with the outbox no longer holding the row; outbox record beats an older saved entry (recapture); failed-from-registr entry with code; newest exit wins between a failed and a later saved capture; newest record wins among multiple matches; missing page url ⇒ not-captured; `summarizeOutbox` empty vs pending vs waiting; registry dedupe/prune/sort ordering for both entry kinds; shared `OUTBOX_STORAGE_KEY` assertion.
- `packages/extension-core/src/capture.test.ts` (34, one updated): `CAPTURE_TRIGGERS` is exactly `["context-menu","command","popup"]` - no fourth trigger.
- `e2e/popup.spec.ts` (3): journey A: fixture page ⇒ not-captured/queue hidden; click ⇒ `queued` and NO "Saved"-matching wording; no app open ⇒ retries in a deterministic journey to `retrying` with next-retry wording; save button disabled (duplicate-click prevention); close + reopen ⇒ still `retrying` (reconstructed from durable storage); open the app ⇒ outbox drains + status flips to `saved` / "Saved" once the native outbox handled the real ACK; resource card visible; end-to-end queue empty checks the popup isn't lying. Journey B (different launch): keyboard-only capture (Tab to the button, Enter), real ACK ⇒ saved, close + reopen ⇒ still saved. Journey C: no/missing active tab ⇒ "No active tab to save"; entry disabled; non-http URL ⇒ "This page can't be captured"; axe scan clean; queue summary hidden when empty.

**Verification (actual):** focused 51/51 (17 model + 34 capture); `pnpm test` **36 files / 296 passed** (+18 over EXT-005's 278); `pnpm typecheck` **5/5**; `pnpm lint` clean; `pnpm exec prettier --check .` clean; `pnpm build` web (unchanged, no web source updated in the popup task; see prior ext line for size) + **chrome-mv3 425.78 kB raw / ~125.61 kB gzip** (bundle blocks: `background.js` 110.77, `popup-*.js` 105.48 incl. shared zod, `popup.css` 3.55) + **firefox-mv3 425.90 kB raw / ~125.68 kB gzip** - +15.0 raw / +8.4 gzip over EXT-005; under the 250 kB gzip budget; `pnpm test:e2e` **13/13** (6 web smoke/M5, 1 bridge, 3 capture triggers, 3 popup).

**Dependencies / permissions.** None added: `@axe-core/playwright` was already committed at HEAD for the a11y checks; no `package.json`, `pnpm-lock.yaml`, manifest permission, or content-script match changed by this task. Bundle growth is the popup surface plus the shared-core pieces the model needs.

**Manual verification still outstanding (documented, not silently skipped).**
1. Click the actual toolbar button in Chrome/Edge (the automated harness exercises the same popup.html as a tab; the real browser-owned window, sizing, and close-on-loss behavior are Chrome-managed).
2. Firefox: load the built `firefox-mv3` and verify the popup renders/behaves identically (`browser.storage.onChanged`, form submit seam and icon rendering have no Chromium-only API).
3. Screen reader: "Not saved yet"/"Saved"/retry phrase announced via the live region (recorded as e2e-verified `aria-live` DOM contract; voice pronunciation needs a human ear).
4. Real-flow with app closed: capture from the popup, confirm the queued/retrying states read the durable store and the app open completes the transition (durable-then-delivered, matching EXT-001's semantics).
5. Developer ergonomics: confirm `dashboard` > `service worker` console shows no new errors over a full capture cycle.

**Known limitations / follow-ups.**
- The popup shows queue state only via the aggregate line; a per-record list (id, canonical url of others) is intentionally outside EXT-006 to keep the surface honest and compact.
- A single status row classifies one URL; if two tabs share a canonical URL, both popups show one same state - derived from the same authoritative record either way.
- `saved`-state display today depends on a validated ACK handling even for `duplicate` outcome (`handleAck` succeeds for both created and duplicate); index-suffix micro-UX differentiation is a natural EXT-007 follow-up if desired.
- Restricted-URL surface shows an empty state for transient-tab-extractions (e.g. a page whose renderer hung) - the capture still resolves truthful state either way.
- No production origin configured yet (build-time injection is deferred by the existing plan; both dev URLs only until then).
