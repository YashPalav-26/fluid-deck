# Fluid Deck — Sprint 6 (M7) Closure Review

*Date: 2026-11-12 · Scope: read-only closure audit of M7 (SEARCH-001..008 + UI-004). No production-code, dependency, schema, feature, or Git changes. Existing reports and benchmark artifacts were the evidence source; the 15–16 minute benchmarks were not rerun.*

*Sources: `docs/PHASE_3_TASK_BREAKDOWN.md`, `docs/PHASE_4_EXECUTION_ROADMAP.md`, `docs/SPRINT_6_IMPLEMENTATION_PLAN.md`, `docs/SPRINT_6_READINESS_REVIEW.md`, `docs/PHASE_3_DECISION_REGISTER.md`, `docs/PROJECT_PROGRESS.md`, all six Sprint 6 implementation reports, both benchmark JSON artifacts, `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md`, `docs/architecture/ARCHITECTURE_DECISION_RECORDS.md`, and the current source/tests.*

---

## 1. Verdict

**CLOSED WITH CONDITIONS.**

M7 is functionally implemented and independently re-verified for the unit suite, the search UI E2E flow, the built-worker preview path, typecheck, and the bundle budget. No product blocker, data-loss risk, security regression, or architecture violation was found. Default Playwright is **not green** (23/26) because of test orchestration, not product behavior.

Conditions are evidence/documentation, not feature work:

1. SEARCH-004 has no committed regression test for its own acceptance criterion (“no stale results after edit”).
2. The committed benchmark JSON files no longer reproduce the exact figures quoted in the SEARCH-006/SEARCH-008 reports and `PROJECT_PROGRESS.md` (the files were overwritten by later runs).
3. The default Playwright configuration still includes one wrong-config spec and two long benchmark specs, so `pnpm test:e2e` cannot be green as configured.
4. UI-004 / decision-register claims about the ⌘K palette, `view=trash` in core ViewState, and search highlighting are broader than the shipped behavior.
5. Architecture/decision documents still describe the worker as unimplemented and the budgets as proposed, despite SEARCH-008 and SEARCH-006.

None of these invalidate the implementation. They do prevent an unqualified “complete and fully evidenced” closure.

---

## 2. Task-by-task acceptance matrix

| Task | Acceptance criterion | Reported evidence | Audit result | Status |
|---|---|---|---|---|
| SEARCH-001 | Tokenizer unit tests | `packages/core/src/tokenizer.test.ts`; single implementation in `packages/core` | 12 tokenizer tests; tokenizer exported from core; no MiniSearch in core | **Met** |
| SEARCH-002 | Query tests (AND/OR, pin) | `apps/web/src/services/search.test.ts` | 12 tests cover empty query, AND, OR fallback, exact-title pin, prefix, fuzzy, weights, tie-breaks, soft-delete exclusion, tags/URL context | **Met** |
| SEARCH-003 | Degraded browse-only mode | `apps/web/src/services/search-index.test.ts` | 10 tests cover empty library, persisted data, chunked progress, yielding, cancellation, stale completion, failure/degraded state, repeated startup | **Met** |
| SEARCH-004 | No stale results after edit | `docs/SPRINT_6_INCREMENTAL_SYNC_REPORT.md` §7 | Implementation is wired post-commit (`queries.ts`, `bridge/inbox.ts`, tag/collection panels). No committed test covers edit/rename/trash → query freshness. Report admits local smoke coverage was removed and refers to “hidden SEARCH-004 tests” that are not in the repository. Only adjacent coverage: one recovery test applies a committed write during a build; worker protocol tests cover upsert/remove/batch. | **Met with evidence gap** |
| SEARCH-005 | Cap enforced; windowing engaged | `apps/web/src/services/search-facets.test.ts`; `ResourceGrid.tsx` | 6 tests: sort vocabulary, tags OR/domain/unorganized, exact 500 cap, 501 truncation metadata, smaller explicit cap. Windowing is the pre-existing UI-002 append-on-scroll (50-card window, max 500), not new SEARCH-005 code; no virtualization library. | **Met** |
| SEARCH-006 | Report vs budgets (proposed) | `docs/SPRINT_6_BENCHMARK_REPORT.md`; `docs/SPRINT_6_BENCHMARK_RESULTS.json` | Report compares rebuild/query/facet/mutation/bundle/cap against targets and records the memory-measurement limitation honestly. Exact numbers are not reproducible from the current JSON (see §6). | **Met with artifact caveat** |
| SEARCH-007 | Decision recorded | `docs/SPRINT_6_WORKER_DECISION.md`; decision register | ACTIVATED, with trigger (6,212.5 ms vs 500 ms), boundary, protocol, and recovery targets. Decision is recorded; implementation was deferred to SEARCH-008. | **Met** |
| SEARCH-008 | Corrupt-index rebuild test | `search-worker-recovery.test.ts`, `search-worker-core.test.ts`, real-browser specs | 10 recovery tests + 5 protocol tests cover startup failure, in-flight build, stale response, cancellation, failed commit, runtime crash, malformed response, bounded fallback, empty library, and mutation during build. Real Chromium/Firefox smoke and built-worker preview were rerun by this audit (2/2). | **Met** |
| UI-004 | URL state; empty/error states | `docs/SPRINT_6_UI_004_REPORT.md`; 50 focused tests; `e2e/search-ui.spec.ts` | AC is met: URL-backed query/facets/sort, loading/indexing/error/partial/empty states, backward-compatible `?view=trash`, responsive input. Search E2E rerun 4/4. Conditions: M9 manual SR/zoom; perf budgets not claimed; three scope claims are overstated (§7). | **Met with conditions** |

### 2.1 SEARCH-004 evidence gap (most material finding)

`apps/web/src/services/search.test.ts` covers query semantics only; `search-index.test.ts` covers startup; `search-facets.test.ts` covers facets/cap; `search-worker-recovery.test.ts` imports `syncResource` for one write-during-build case. There is no test that:

- edits a searchable field through the post-commit path and re-queries without a rebuild;
- renames a tag/collection and confirms affected resources re-match;
- soft-deletes/restores and confirms results change;
- confirms a timestamp-only edit does not blank or stale the document.

The implementation itself appears correct on inspection: `syncResource`/`updateSearchDocument` route to `applyUpsert`/`applyRemoval`; `applyUpsert` replaces an existing document, adds a new one, or discards a soft-deleted one; `syncTagRename`/`syncCollectionRename` re-index affected resources. The defect is missing durable evidence, not a proven stale-result bug.

**Smallest correction:** add one focused Vitest file (SEARCH-004) that builds a small index, commits an edit/rename/delete through the same service functions, re-queries, and asserts the new result set. No production-code change.

---

## 3. Test and benchmark evidence

### 3.1 Independently rerun during this audit

| Check | Command | Result |
|---|---|---|
| Unit/integration suite | `pnpm test` | **47 files / 381 tests passed** (8.6 s) |
| Typecheck | `pnpm typecheck` | **5/5 workspaces green** |
| Search UI E2E | `pnpm exec playwright test e2e/search-ui.spec.ts` | **4/4 passed** (7.1 s) |
| Built-worker preview | `pnpm exec playwright test --config playwright.search-worker-preview.config.ts` | **2/2 passed**: Chromium 391 ms, Firefox 1.6 s |
| Default Playwright inventory | `pnpm exec playwright test --list` | **26 tests in 10 files** (matches 23 pass + 3 fail) |
| Bundle (current `dist`) | Node gzip of built assets | Initial JS **701,185 B raw / 216,476 B gzip (≈211.4 KiB; Vite reports 216.86 kB)**; worker **116,426 B raw / 33,749 B gzip**; CSS **22,176 B raw / 5,011 B gzip** |
| Git state | `git status --porcelain` | Sprint 6 files modified/untracked, nothing staged; HEAD `4027425`; no commit/push |

The initial-JS budget is **≤250 kB gzip**; the measured initial JS is **216.86 kB gzip**, leaving **≈33 kB headroom**. The worker chunk is lazy and excluded from initial JS. MiniSearch remains in the initial chunk because the main-thread fallback engine is still bundled (documented in the recovery report).

### 3.2 Benchmark figures — reported vs current committed artifacts

Two canonical artifact files are preserved from the audit:

| Artifact | Source | Purpose |
|---|---|---|
| `docs/SPRINT_6_BENCHMARK_RESULTS.json` | Main-thread (dev‑server) benchmark run | Baseline measurements without worker off‑load |
| `docs/SPRINT_6_BENCHMARK_WORKER_RESULTS.json` | Worker‑path benchmark rerun (same harness, same throttling, same seeds) | Worker‑offload measurements; 10k rebuild 412.1 ms, 10k query p95 exact 161.9 ms |

The SEARCH-006 and SEARCH-008 reports cite measurements from earlier executions (2026‑11‑11 original runs). The current JSON artifacts were produced by later isolation reruns (2026‑11‑12, the UI-004 pass). The qualitative conclusions are identical across all runs; the exact numbers differ because the artifacts represent different execution timestamps, not regressions.

**Canonical worker result:** `SPRINT_6_BENCHMARK_WORKER_RESULTS.json` (10k rebuild 412.1 ms; 10k query p95 exact 161.9 ms; combined facet p95 5,336.7 ms). This is the designated reference for any report that mentions worker‑offload measurements.

**Baseline main‑thread result:** `SPRINT_6_BENCHMARK_RESULTS.json` (10k rebuild 6,011.3 ms; 10k query p95 exact 337.1 ms; combined facet p95 5,215.8 ms). This is the designated reference for any report that mentions main‑thread measurements.

The table below aligns every quoted measurement with its artifact:

| 10k metric | SEARCH‑006 report (main) | `SPRINT_6_BENCHMARK_RESULTS.json` (main) | SEARCH‑008 report (worker) | `SPRINT_6_BENCHMARK_WORKER_RESULTS.json` (worker) |
|---|---:|---:|---:|---:|
| Rebuild | 6,212.5 ms | 6,011.3 ms | 334.2 ms | 412.1 ms |
| Query p95 (exact) | 394.9 ms | 337.1 ms | 83.1 ms | 161.9 ms |
| Query p95 (prefix) | 436.1 ms | 363.4 ms | 85.2 ms | 163.4 ms |
| Facet p95 (type) | 3,603.3 ms | 3,499.0 ms | 1,778.1 ms | 3,282.3 ms |
| Facet p95 (combined) | 6,238.9 ms | 5,215.8 ms | 2,936.6 ms | 5,336.7 ms |
| Incremental create | 616.6 ms | 1,445.4 ms | 574.5 ms | 1,446.3 ms |
| Incremental update | 733.5 ms | not quoted above | 721.4 ms | 1,377.3 ms |
| Incremental delete | 14.6 ms | 7.7 ms | 5.1 ms | 7.0 ms |

All runs still show the same conclusions: the 50 ms query/facet budgets are unmet at 10k in both main‑thread and worker modes; the worker substantially improves query latency and rebuild time versus the main‑thread baseline; facets remain DB‑scan‑bound and their improvement is not attributable to the worker alone; incremental creates/updates are dominated by context loading/retokenization and remain well above 50 ms. The benchmark report already labels memory as unmeasured (`heapDelta = 0` at every scale is not an index‑specific measurement).

**Smallest correction:** When citing benchmark numbers, reference the artifact by name (`SPRINT_6_BENCHMARK_RESULTS.json` for main‑thread, `SPRINT_6_BENCHMARK_WORKER_RESULTS.json` for worker). Do not rerun the 15–16 minute suite just to reconcile prose; the existing artifacts contain the trustworthy raw data.

---

## 4. Playwright failure reconciliation

Default config (`playwright.config.ts`) serves the Vite **dev server** on port 5199 and has no `testIgnore`. It therefore runs all 26 specs, including two benchmark specs and the production-build worker spec.

| Failure | Cause | Classification | Evidence |
|---|---|---|---|
| `e2e/search-benchmark.spec.ts` — “Execution context was destroyed, most likely because of a navigation” | The shared Vite dev server hot-reloaded while a production build and file edits were running during the suite; the page navigated under the benchmark. | **Test orchestration / environment**, not product | Passes in isolation (main benchmark reported 15.0 min; worker 16.2 min in the UI-004 pass; SEARCH-008 recheck 11.2 min). The benchmark imports `/src/...`, so it is dev-server-only by design. |
| `e2e/search-benchmark-worker.spec.ts` — same error | Same shared dev-server HMR race. | **Test orchestration / environment**, not product | Passes in isolation; current artifact was produced by that path. |
| `e2e/search-worker-built.spec.ts` — `indexSrc` null / wrong page | The spec targets a **production build** and needs `vite preview`; the default config serves the dev server whose first module script is the inline react-refresh bootstrap with no `src`. | **Configuration**, not product | **Rerun under `playwright.search-worker-preview.config.ts`: 2/2 passed (Chromium 391 ms, Firefox 1.6 s).** |

The default suite must **not** be described as green. The correct statement is: *23/26 default tests pass; the three failures are one wrong-config spec and two dev-server/HMR-sensitive benchmark specs; all three pass under their intended configs/isolation.*

**Smallest correction:** add `testIgnore: /search-worker-built/` to the default config, and either move the benchmarks to a dedicated config or tag them so the default `test:e2e` runs only stable UI/extension specs. This is test hygiene, not a product fix.

---

## 5. Bundle, worker recovery, 500-cap, and URL verification

### 5.1 Bundle budgets

- Initial JS: **216.86 kB gzip** (701.19 kB raw) vs **≤250 kB** budget → **PASS**, ≈33 kB headroom.
- Lazy worker: **116.43 kB raw / 33.75 kB gzip** → not part of initial JS.
- CSS: **5.01 kB gzip**.
- Delta vs pre-UI-004 (210.20 kB): **+6.66 kB gzip** for the full search UI; no new dependency beyond `minisearch ^7.2.0`.
- No code-splitting of the initial chunk was needed; the worker is a separate lazy chunk, consistent with M7-D4.

### 5.2 Worker recovery guarantees

Verified in source and tests:

- Main-thread fallback engine remains available; worker-first startup with bounded retry.
- `WORKER_MAX_ATTEMPTS = 2`, one fresh-worker restart after startup/commit/runtime failure, then main-thread fallback (recovery tests).
- Stale builds, versions, chunk sequences, and query responses are rejected; a query that races a mutation retries once, then errors instead of returning a stale answer.
- Malformed responses are treated as a crash and recovered.
- Silent worker death is detected only by the **15 s** request timeout (measured 15,129 ms / 15,054 ms), then recovery succeeds. This is documented, bounded, and accepted; no code change recommended in the report.
- Fallback is session-sticky; no multi-tab coordination; each tab builds its own worker/index. All documented.

### 5.3 500-result cap

- `SEARCH_RESULT_CAP = 500`; requested cap is clamped to `[1, 500]`.
- `total` is the pre-cap candidate count; `truncated === total > cap`; capped array length never exceeds 500.
- Facet counts are computed over the full filtered candidate set (pre-cap), not the returned page.
- Tests cover exactly 500 vs 501, explicit smaller cap, and honest `truncated`/`truncatedCount` metadata.
- The grid renders a 50-card append-on-scroll window and caps the visible set at 500; the architecture’s “>500 DOM items” virtualization threshold is never crossed. This is pre-existing UI-002 behavior, not a new SEARCH-005 implementation.

### 5.4 URL compatibility

- `domain`, `unorganized`, and `relevance` are additive/optional in the core codec; pre-UI-004 URLs decode to the same state (7 codec tests).
- `q`, facets, sort, and `view=trash` survive refresh and back/forward; E2E covers refresh/back/forward.
- Trash clears search-only params, maps `relevance → newest`, and disables the input with a hint; the index excludes `deletedAt` rows.
- `?view=trash` remains **outside** the core ViewState schema. This is backward-compatible but is not what M7-D3 literally asked for (see §7).

---

## 6. Deferred work and known risks

| Item | Current disposition | Audit assessment |
|---|---|---|
| Manual screen-reader pass and 200% zoom | M9 (UI-011 / TEST-004) | **Correctly assigned.** UI-004 AC does not require it; automated semantics are present. |
| Query/facet 50 ms budgets at 10k | Documented as unmet; no optimization scheduled | **Known limitation, but no task owner.** M9 TEST-005 is the natural verification/ownership point. Do not claim the budget is met. |
| Silent dead worker → 15 s delay | Retained, documented in SEARCH-008 §9.3 | **Correctly retained.** Bounded and self-healing; a heartbeat/retry would add complexity for a rare case. |
| Session-sticky fallback | Documented in SEARCH-008 §7 | **Accepted limitation.** |
| No multi-tab index coordination | Documented | **Accepted limitation** consistent with per-tab architecture. |
| Virtualization / true windowing | Deferred; 500 cap bounds DOM | **Correctly retained.** No library, no >500 DOM case. |
| Palette resource search (M7-D2) | Not implemented; palette still filters collections/tags only | **Scope gap / overstated claim** (§7). Needs a follow-up task or an explicit deferral. |
| Core ViewState `view=trash` (M7-D3) | Implemented at route layer, not in core codec | **Behaviorally compatible, decision not literally followed** (§7). |
| Search-result highlighting | Planned in `SPRINT_6_IMPLEMENTATION_PLAN.md` §4/§7 but absent from UI-004 report and code | **Undocumented omission** (§7). Not in the task AC. |
| Manual capture checks, DB-006, U4 host list | Pre-existing M6/M3 carries | **Still open, still user-owned.** Not M7 scope; not silently closed. |
| Benchmarks taking 15–16 min in default E2E | No tag/config separation | **Test hygiene** (§4). |

---

## 7. Documentation consistency findings

### 7.1 Benchmark artifacts no longer match the quoted reports (medium, evidence integrity)

Described in §3.2. Reports say “results rewritten to `docs/SPRINT_6_BENCHMARK_WORKER_RESULTS.json`”, but the current file contains a later run with materially different values (for example 10k rebuild 412.1 ms vs 334.2 ms; query p95 161.9 ms vs 83.1 ms; combined facet 5,336.7 ms vs 2,936.6 ms). This is a provenance problem, not a product regression. Preserve per-run files and cite them by name.

### 7.2 Architecture docs still say the worker does not exist (medium)

- `docs/architecture/ARCHITECTURE_DECISION_RECORDS.md` ADR-008 amendment: “no worker source exists yet” and “until a separately authorized worker task lands”.
- `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` header: “no worker exists in the current code”.
- `docs/SPRINT_6_WORKER_DECISION.md` status: “No worker source exists yet.”

SEARCH-008 shipped `apps/web/src/services/search.worker.ts`, the protocol, the worker core, and recovery. These documents should be amended to “worker implemented in SEARCH-008; design statements below are the pre-benchmark baseline.” The architecture’s substantive design (Dexie authority, facets in Dexie, disposable index) remains correct.

### 7.3 Budget-update obligation not discharged (medium)

- `PHASE_4_EXECUTION_ROADMAP.md` Sprint 4: “Update budgets from ‘proposed’ to measured.”
- `PHASE_3_DECISION_REGISTER.md` R-4: performance budgets → measured values, M7.
- `ADR-019` remains **Proposed**; `PERFORMANCE_BUDGETS_AND_ACCESSIBILITY.md` remains “Draft for approval”.

Reports contain measured values and clearly say which budgets fail, but the canonical budget/ADR documents were not updated. Smallest correction: add a measured-results/status section to the budget doc and amend ADR-019’s status without changing the numeric targets.

### 7.4 UI-004 claims are broader than shipped behavior (medium)

`docs/SPRINT_6_UI_004_REPORT.md` §3.1 says “Cmd/Ctrl+K keeps opening the existing palette; the two surfaces share the same service and URL state.” In the code, `CommandPalette.tsx` is still a `cmdk` list over navigation/create actions, collections, and tags; it never calls the Search Service or reads search URL state. M7-D2 asked for both surfaces to share one Search Service/index, and the plan mentioned palette resource jumps. That is not implemented.

Related:
- M7-D3 asked to “extend core ViewState to support `view=trash`”; the implementation deliberately keeps it outside the core codec (`useViewState.ts` route parser). Behavior is backward-compatible, but the decision record and report should say “route-level support” or the code should be moved into core.
- The implementation plan lists “highlight via stored fields” for UI-004; no highlighting exists and the UI-004 report does not list it as deferred.

**Smallest correction:** either (a) implement palette resource search and result highlighting as a follow-up M7.1/UI-004b task, or (b) amend the UI-004 report and M7-D2/M7-D3 records to state what shipped and explicitly defer the rest. Do not leave the broader claim standing.

### 7.5 SEARCH-004 report wording (medium)

`SPRINT_6_INCREMENTAL_SYNC_REPORT.md` §7 says “none added to the committed suite beyond the service API (hidden SEARCH-004 tests exercise it)” and that local smoke coverage was removed. There are no hidden tests in the repository. The report should state plainly that SEARCH-004 has no committed regression test, and the test should be added before closure without conditions.

### 7.6 Minor / pre-existing inconsistencies (low)

- `PROJECT_PROGRESS.md` says “Sprint 6 complete” while also saying “M7 awaits user review/acceptance”. Implementation-complete vs acceptance-pending is defensible, but the header and Next Action should use one state word.
- `PROJECT_PROGRESS.md` cites SEARCH-008 worker benchmark duration 11.2 min; the UI-004 report cites 16.2 min. These can be different runs, but neither is labeled with its artifact.
- The Phase 3 task-breakdown footer says “Total tasks: 64 … ≈209.5h”; `PROJECT_PROGRESS.md` says 67 tasks / ~165h. Pre-existing, not introduced by M7; flagged only so it is not mistaken for a Sprint 6 regression.
- The implementation plan still says “no worker” in its M7 scope table/§5; the SEARCH-007 amendment lives in the decision register and architecture doc, not in the plan. Optional cleanup.

---

## 8. Conditions for final closure

1. **SEARCH-004 test (required):** add committed post-commit freshness coverage for edit, tag/collection rename, and trash/restore. No production-code change expected.
2. **Benchmark provenance (required):** preserve per-run JSON artifacts and correct the report/progress citations, or explicitly label the current JSON as the UI-004 isolation rerun and the quoted tables as earlier runs.
3. **Playwright hygiene (required):** exclude `search-worker-built.spec.ts` from the default config and isolate/tag the benchmark specs so the default suite is honestly green when run.
4. **Scope/claim corrections (required):** amend UI-004/M7-D2/M7-D3 wording for palette resource search, core `view=trash`, and highlighting; implement follow-ups or record explicit deferrals.
5. **Architecture/budget docs (required before M8 planning):** amend ADR-008 / search architecture / worker decision to reflect the shipped worker; update ADR-019 and the performance-budget document with measured status (targets can stay).
6. **Performance ownership (recommended):** assign the unmet 50 ms query/facet budgets to M9 TEST-005, or record them as an accepted post-M7 limitation with an owner.
7. **Already correct:** manual SR/zoom remains M9; manual capture checks remain user-owned; the 15 s hung-worker limitation is accepted.

No condition requires a production feature change to close M7. Conditions 1–5 are tests/docs; 6 is ownership.

---

## 9. Changed files

- **Added:** `docs/SPRINT_6_CLOSURE_REVIEW.md` (this report).

No production source, tests, configuration, schema, dependencies, `poc/`, `.claude/`, `.remember/`, `.freebuff/`, or LifeOS files were modified. `docs/PROJECT_PROGRESS.md` was not edited: the implementation status is factually “implemented, awaiting acceptance”, and the numeric mismatch is better corrected with the artifact-provenance condition than by silently rewriting status text.

## 10. Verification evidence

| Check | Result |
|---|---|
| `pnpm test` | 47 files / 381 tests passed |
| `pnpm typecheck` | 5/5 workspaces green |
| `pnpm exec playwright test e2e/search-ui.spec.ts` | 4/4 passed |
| `pnpm exec playwright test --config playwright.search-worker-preview.config.ts` | 2/2 passed (Chromium + Firefox) |
| `pnpm exec playwright test --list` | 26 tests / 10 files (default config) |
| Built bundle gzip (Node `zlib`, level 9) | initial 216,476 B; worker 33,749 B; CSS 5,011 B |
| Git | HEAD `4027425`; nothing staged; no commit/push |

Default E2E was **not** rerun in full (the 15–16 minute benchmarks were intentionally avoided). The reported 23/26 result is consistent with the 26-test inventory and the three identified orchestration/config failures.

---

## M9-006 reconciliation (2026-11-14)

**Status update (2026-11-14, M9-006):** every Sprint 6 item is now committed (M9-001..M9-005) and a clean clone is green - 57 files / 499 tests, typecheck 0 errors, build exit 0, default Playwright 26 passed. The bundle figure in this report (216.86 kB gzip) predates the search feature reaching the application; the current web entry is 771.46 kB raw / 241.33 kB gzip. The scope gaps recorded here are unchanged: the palette still searches nothing, and the worker's browser test needs the production preview server (M9-040).
