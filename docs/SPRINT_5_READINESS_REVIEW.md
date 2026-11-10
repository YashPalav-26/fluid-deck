# Fluid Deck — Sprint 5 (M6) Readiness Review

*Date: 2026-11-09 · Planning/audit only — no source code inspected-to-modify, nothing changed.*

---

## 0. Git state (documented discrepancy)

**The briefing states Sprint 4 was "accepted, committed, and pushed to GitHub." Git evidence shows it is NOT pushed.**

- Local `main` = `fb422df` (docs commit); `origin/main` = `e318146` (Sprint 3-era). `main` is **ahead by 3 commits** (`26ba495`, `ee81dc7`, `fb422df`) and **not synchronized with the remote**.
- Working tree is clean apart from `poc/` (intentionally untracked).
- No action has been taken on this mismatch (audit-only task).

**Consequence:** M6 readiness is unaffected (code is identical), but the official record of Sprint 4's remote state must be corrected before Sprint 5 implementation starts — otherwise every subsequent remote operation is built on a false baseline. Recommend documenting this in `PROJECT_PROGRESS.md` (done by this review) and pushing the three Sprint 4 commits before starting Sprint 5 implementation — but **not pushed here**.

## 1. Exact M6 task list

From `PHASE_3_TASK_BREAKDOWN.md`, milestone **M6** (total 22 h):

| Task | Title | Dep | Status of dep |
|---|---|---|---|
| EXT-001 | Outbox state machine | POC-004 | ✅ Done (Sprint 1) |
| EXT-002 | Metadata extraction (M1) | CORE-002 | ✅ Done (Sprint 2) |
| EXT-003 | Thumbnails (M2, 429→placeholder) | EXT-002 | internal |
| EXT-004 | Bridge wiring, web side | EXT-001 | internal |
| EXT-005 | Triggers B1/B2/B3 | EXT-004 | internal |
| EXT-006 | Popup UI (saved only after ack) | EXT-004 | internal |
| EXT-007 | Shared protocol, no dup logic | EXT-001 | internal |

All external dependencies (POC-004, CORE-002) are satisfied. `CTRL-S`/`contextMenus`/share-target APIs need WXT manifest additions — no architectural prerequisite is missing.

## 2. Readiness verdict: **READY WITH CONDITIONS**

Conditions:
1. Push the three Sprint 4 commits (`26ba495`, `ee81dc7`, `fb422df`) and record the new remote hash (do not let M6 work pile on an unsynchronized remote).
2. Confirm R-1 retry policy parameters in the outbox unit tests (unchanged since approval).

No other gate blocks M6. Nothing in the M6 scope depends on unresolved product decisions: R-1 (retry) and R-2 (capture protocol) are both user-approved (2026-11-08).

## 3. Carryovers — classification

| Item | Class | Notes |
|---|---|---|
| **Sprint 4 not pushed** (this review, §0) | **M6 blocker** (process blocker, not code) | Correct the record before Sprint 5 implementation commits continue |
| DB-006 two-tab/versionchange manual check | Non-blocking carryover | M3 carry-over; M6 doesn't touch `persistence/` |
| U4 exception-host list (empty) | Non-blocking carryover | Canonicalization unchanged by M6 |
| Firefox popup manual click (Sprint 1) | **M6 dependency** | The popup (EXT-006) is saved-state UI; the M6 Firefox popup verification should cover *both* the Sprint 1 click and the new popup in one pass — no new verification budget required |
| Manual drag/keyboard reorder pass | Non-blocking carryover | M5 carry-over; M6 doesn't touch the collections panel |
| Full screen-reader pass | Future (M9) | `UI-011` owns it — not M6 |
| `q` keyword search inert / `?view=trash` external / `totalCount` cosmetic | Future (M7/M9) | Unchanged by M6 |

## 4. Technology/dependency decisions (proposed)

- **No new dependencies.** Zod is the schema authority; `browser.storage.local` is the outbox store; platform DOM APIs extract metadata; `fetch` gets thumbnails. Rationale: nothing in M6 needs a library beyond what the approved evaluation already selected.
- Rejected: `@webext/core` (thin browser-API wrapper, unneeded), `webext-redux`/`webext-messaging` (overbuilt for a 4-message protocol), `Readability` (`@mozilla/readability` — too heavy for M1 title/desc extraction).
- `@fluid-deck/extension-core` remains the single source: web and extension both import protocol constants + schemas (existing architecture, enforced by EXT-007).

## 5. Plan quality gates (checked)

- Every M6 task maps to an approved task ID ✅
- Sequence respects within-sprint deps ✅
- No future milestone tasks pulled forward (SEARCH/UI-004 not claimed by EXT-004's payload) ✅
- No new architecture decisions required beyond the approved outbox state machine design ✅
- Dependencies: none new ✅
- Source code: untouched by this review ✅

## 6. Implementation sequence & estimate

EXT-007 (1h, shared types + payload schema) → EXT-001 (4h, outbox + unit tests) → EXT-002 (4h, extractor + fixtures) → EXT-003 (3h, thumbnails + placeholder) → EXT-004 (4h, web receiver + Playwright click→saved) → EXT-005 (3h, triggers) → EXT-006 (3h, popup) = **22 h** — matches the task breakdown hours exactly.

## 7. Recommended next action

1. User: approve this plan, and authorize pushing Sprint 4's three commits to sync the remote.
2. Then authorize Sprint 5 (M6) implementation.
