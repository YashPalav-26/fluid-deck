# Sprint 6 (M7) Repository Reconciliation - Fluid Deck

*Date: 2026-11-12 - Audit and planning only. Nothing was integrated, archived, deleted or rewritten. No application code was touched.*

## 1. Why this document exists

Sprint 6 (M7, search) was implemented entirely in the working tree and never committed. M8
(import/export) was implemented and committed on top of a repository whose `HEAD` does not
contain Sprint 6. The result is a repository where:

- `origin/main` builds and tests green **without** search (M8 state, verified),
- the working tree contains a large, largely working search implementation that is **not**
  version-controlled, and
- the working tree's `docs/PROJECT_PROGRESS.md` is an **older fork** of the committed file that
  would silently delete the M8 progress entries if committed as-is.

This document classifies every dirty entry, states the dependencies between them, and proposes
the smallest safe sequence to reach a clean, reproducible baseline before M9 starts.

## 2. Exact baseline

| Fact | Value |
| --- | --- |
| Repository | `C:\Users\ADMIN\OneDrive\Documents\Github-Projex\fluid-deck` |
| Branch | `main` |
| Local HEAD | `204c54bf7698150a933e1dbc4eb68c8248f01bf1` |
| Remote HEAD (`origin/main`) | `204c54bf7698150a933e1dbc4eb68c8248f01bf1` (identical) |
| Staged changes | none (index == HEAD) |
| Dirty entries | **75** = 23 modified + 52 untracked (counted, not assumed) |
| Modified diff | 413 insertions, 80 deletions across 23 files |
| Last M8 commit | `204c54b` docs: name the audited HEAD explicitly in the closure review |

Committed state of record (verified during the M8 closure audit): a fresh clone of `origin/main`
installs with a frozen lockfile, typechecks in 5/5 workspaces, runs 412 unit tests green, builds
web + both extension targets, and runs the browser suites green (22/22 in the default Playwright
config, 27/27 in the dedicated Chromium/Firefox/Edge import-export config).

## 3. Classification

Legend: **P** production implementation candidate · **T** test/e2e candidate · **D** documentation
candidate · **POC** proof of concept / historical experiment · **S** scratch or generated artifact ·
**X** obsolete or duplicate (do not commit) · **U** unclear, needs investigation.

### 3.1 Modified files (23)

| Path | Class | Notes |
| --- | --- | --- |
| `apps/web/package.json` | P | adds `minisearch@^7.2.0`; the only new runtime dependency of Sprint 6 |
| `pnpm-lock.yaml` | P | MiniSearch resolution; must land with `package.json` or `pnpm install --frozen-lockfile` fails in a clean clone |
| `packages/core/src/index.ts` | P | adds `export * from "./tokenizer.ts"` - **depends on an untracked file**; committing it alone breaks the core package |
| `packages/core/src/view-state.ts` | P | adds the `"relevance"` sort option (2 lines) - the only Sprint 6 residue in core |
| `packages/core/src/view-state.test.ts` | T | round-trip case switched to `sort: "relevance"` |
| `apps/web/src/services/search.ts` | P | **2144 lines / 71 KB** - the Search Service (index lifecycle, faceting, ranking, incremental sync, worker seam) |
| `apps/web/src/services/search-engine.ts` | P | MiniSearch wrapper, free of Dexie/browser APIs; imported by the worker core |
| `apps/web/src/services/search-worker-core.ts` | P | `SearchWorkerCore` class used by the module worker |
| `apps/web/src/services/search-worker-protocol.ts` | P | worker message contract, versioned (`SEARCH_WORKER_PROTOCOL_VERSION = 1`) |
| `apps/web/src/services/search.worker.ts` | P | Vite module-worker entrypoint |
| `apps/web/src/services/search.test.ts` | **U** | **does not parse** - see section 4. Blocks the whole integration |
| `apps/web/src/services/search-index.test.ts` | T | startup / index build behaviour |
| `apps/web/src/services/search-facets.test.ts` | T | facet computation and cap |
| `apps/web/src/services/search-worker-core.test.ts` | T | worker core behaviour |
| `apps/web/src/services/search-worker-recovery.test.ts` | T | worker failure and recovery |
| `apps/web/src/services/search-index.ts` | **X** | one-line re-export of `search.ts`; **no importer anywhere** |
| `apps/web/src/services/searchIndex.ts` | **X** | duplicate of the above (case-variant); no importer |
| `apps/web/src/hooks/search-index.ts` | P | `useSearchIndex()` - imported by `App.tsx` and `features/search/SearchStatus.tsx` |
| `apps/web/src/hooks/searchIndex.ts` | **X** | re-export of `hooks/search-index.ts`; no importer |
| `apps/web/src/hooks/queries.ts` | P | adds the `search` query key, `useSearchResults`, `useDomains`, and the `enabled` flag on `useResources` |
| `apps/web/src/hooks/useViewState.ts` | P | URL-state merge fix (synchronous `routeRef` mirror), no duplicate history entries, trash drops search params |
| `apps/web/src/hooks/useViewState.test.ts` | T | +31 lines for the merge behaviour |
| `apps/web/src/hooks/useViewState.navigation.test.ts` | T | navigation/history behaviour |
| `apps/web/src/App.tsx` | P | wires `SearchInput`, `SearchFilters`, `SearchStatus`, the `/` shortcut, and routes non-empty `q` to the faceted path |
| `apps/web/src/main.tsx` | P | starts the lazy search worker after boot, with a main-thread fallback |
| `apps/web/src/components/AppShell.tsx` | P | `headerSearch` slot in the header |
| `apps/web/src/features/collections/CollectionsPanel.tsx` | P | re-syncs the index after a collection rename |
| `apps/web/src/features/tags/TagsPanel.tsx` | P | re-syncs after a tag rename/merge |
| `apps/web/src/features/library/ResourceGrid.tsx` | P | `emptyHint` so the empty state does not advertise the extension during a search |
| `apps/web/src/bridge/inbox.ts` | P | `syncResource` after a capture commits |
| `apps/web/src/repositories/resources.ts` | P | `listDomains()` + `syncResource` after writes |
| `apps/web/src/repositories/tags.ts` | **X** | the only change is the removal of one blank line - no behaviour; keep HEAD |
| `docs/PROJECT_PROGRESS.md` | **U** | **older fork**: it carries the Sprint 6 IMPORT-001..004 entries but **drops the committed IMPORT-008 entry** (the M8 IMPORT-009, repository-integrity and M8-closure entries are present because they were merged into it). Committing it verbatim would delete the IMPORT-008 progress line. Must be merged from the HEAD copy, never overwritten |
| `docs/PHASE_3_DECISION_REGISTER.md` | D | adds the M7 decision block (M7-D1..D5, SEARCH-007) |
| `docs/PHASE_3_IMPLEMENTATION_PLAN.md` | D | M7 effort updated 15-22h -> 26h |
| `docs/PHASE_3_TASK_BREAKDOWN.md` | D | M7 line-item effort update |
| `docs/architecture/ARCHITECTURE_DECISION_RECORDS.md` | D | one-line pointer to the worker decision |
| `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` | D | supersedes the "no worker" statements with the measured 10k rebuild numbers |

### 3.2 Untracked files (52)

**Search implementation (16)**

| Path | Class | Notes |
| --- | --- | --- |
| `apps/web/src/features/search/SearchInput.tsx` | P | debounced search input |
| `apps/web/src/features/search/SearchFilters.tsx` | P | facet filters (type, source, domain, collection, tags, unorganized, date) |
| `apps/web/src/features/search/SearchStatus.tsx` | P | index status ("Indexing…", error, ready) |
| `apps/web/src/features/search/search-shortcuts.ts` | P | `/` shortcut + `isEditableTarget` guard |
| `apps/web/src/features/search/SearchInput.test.tsx` | T | |
| `apps/web/src/features/search/SearchFilters.test.tsx` | T | |
| `apps/web/src/features/search/SearchStatus.test.tsx` | T | |
| `apps/web/src/features/search/search-shortcuts.test.ts` | T | |
| `apps/web/src/services/search.ts` | P | see 3.1 |
| `apps/web/src/services/search-engine.ts` | P | see 3.1 |
| `apps/web/src/services/search-worker-core.ts` | P | see 3.1 |
| `apps/web/src/services/search-worker-protocol.ts` | P | see 3.1 |
| `apps/web/src/services/search.worker.ts` | P | see 3.1 |
| `apps/web/src/services/search-index.ts`, `services/searchIndex.ts` | X | dead shims (see 3.1) |
| `apps/web/src/hooks/search-index.ts` | P | used by `App.tsx` + `SearchStatus.tsx` |
| `apps/web/src/hooks/searchIndex.ts` | X | dead shim |
| `apps/web/src/services/search.test.ts`, `search-index.test.ts`, `search-facets.test.ts`, `search-worker-core.test.ts`, `search-worker-recovery.test.ts` | T / **U** | `search.test.ts` is broken (section 4) |
| `apps/web/src/hooks/useViewState.navigation.test.ts` | T | |

**Core package (2)**

| Path | Class | Notes |
| --- | --- | --- |
| `packages/core/src/tokenizer.ts` | P | shared tokenizer + `SEARCH_FIELD_WEIGHTS`; imported by `search-engine.ts` and re-exported by `packages/core/src/index.ts` |
| `packages/core/src/tokenizer.test.ts` | T | |

**E2E + Playwright configs (7)**

| Path | Class | Notes |
| --- | --- | --- |
| `e2e/search-ui.spec.ts` | T | UI-004 journey (debounce, `/`, facets, empty state) |
| `e2e/search-worker.spec.ts` | T | worker behaviour in a dev server |
| `e2e/search-worker-built.spec.ts` | T | worker against a production build |
| `e2e/search-benchmark.spec.ts` | T | main-thread benchmark harness |
| `e2e/search-benchmark-worker.spec.ts` | T | worker benchmark harness |
| `playwright.search-worker.config.ts` | T | Chromium + Firefox matrix for `search-worker*.spec.ts` |
| `playwright.search-worker-preview.config.ts` | T | Chromium + Firefox matrix against `vite preview` |

**Documentation (19)**

| Path | Class | Notes |
| --- | --- | --- |
| `docs/SPRINT_6_READINESS_REVIEW.md` | D | Sprint 6 readiness |
| `docs/SPRINT_6_IMPLEMENTATION_PLAN.md` | D | Sprint 6 plan (SEARCH-001..008 + UI-004) |
| `docs/SPRINT_6_SEARCH_FOUNDATION_REPORT.md` | D | SEARCH-001/002 (tokenizer + engine) |
| `docs/SPRINT_6_SEARCH_STARTUP_REPORT.md` | D | index build on startup |
| `docs/SPRINT_6_FACET_SEARCH_REPORT.md` | D | faceting |
| `docs/SPRINT_6_INCREMENTAL_SYNC_REPORT.md` | D | index sync on writes |
| `docs/SPRINT_6_SEARCH_RECOVERY_REPORT.md` | D | worker failure/recovery |
| `docs/SPRINT_6_WORKER_DECISION.md` | D | SEARCH-007 measurement and decision |
| `docs/SPRINT_6_UI_004_REPORT.md` | D | search interface |
| `docs/SPRINT_6_BENCHMARK_REPORT.md` | D | benchmark write-up |
| `docs/SPRINT_6_BENCHMARK_RESULTS.json` | D | benchmark artifact (evidence) |
| `docs/SPRINT_6_BENCHMARK_WORKER_RESULTS.json` | D | worker benchmark artifact (evidence) |
| `docs/SPRINT_6_CLOSURE_REVIEW.md` | D | Sprint 6 closure ("CLOSED WITH CONDITIONS") |
| `docs/SPRINT_7_IMPLEMENTATION_PLAN.md` | D | **M8 plan, untracked** - documents committed code |
| `docs/SPRINT_7_READINESS_REVIEW.md` | D | **M8 readiness, untracked** |
| `docs/SPRINT_7_IMPORT_002_REPORT.md` | D | **M8 report, untracked** - documents committed code |
| `docs/SPRINT_7_IMPORT_003_REPORT.md` | D | **M8 report, untracked** |
| `docs/SPRINT_7_IMPORT_004_REPORT.md` | D | **M8 report, untracked** |

**Scratch and generated artifacts (9)**

| Path | Class | Notes |
| --- | --- | --- |
| `build_output.txt` | S | captured `pnpm build` console output |
| `git_diff.txt` | S | captured `git diff` |
| `git_status.txt` | S | captured `git status` |
| `lint_output.txt` | S | captured `eslint .` (contains the `search.test.ts` error) |
| `summary.txt` | S | captured `vitest run` output |
| `test_output.txt` | S | captured `vitest run` output |
| `test_run.txt` | S | captured `vitest run` output |
| `typecheck_output.txt` | S | captured `tsc` output (the 3 `search.test.ts` errors) |
| `poc/` (135 files, 14.0 MB) | **POC** | `poc/extension-bridge` - the M1 bridge PoC including **`node_modules/` (120 files, 13.97 MB)** and 3.6 MB / 3.3 MB bundle dumps. Must never be committed; also excluded by the standing "do not modify `poc/`" boundary |

## 4. Sprint 6 implementation assessment

### 4.1 What is verified working (measured in this audit)

| Check | Command | Result |
| --- | --- | --- |
| Search unit suites | `pnpm vitest run` over the 11 search/tokenizer/view-state test files | **11 files passed** |
| Search UI E2E | `pnpm exec playwright test e2e/search-ui.spec.ts` | **4 passed (7.2 s)** |
| Full dirty-tree unit suite (earlier in this session) | `pnpm test` | 481 passed / 56 of 57 files - the only failure is `search.test.ts` |
| Dirty-tree build (earlier in this session) | `pnpm build` | exit 0; web entry 771.32 kB raw / 241.30 kB gzip |

### 4.2 What is not working

`apps/web/src/services/search.test.ts` **does not parse**. Three independent defects in one file:

1. `import "fake-indexeddb/auto";` inside a test body (line 134) - esbuild rejects it:
   `ERROR: Unexpected "\"fake-indexeddb/auto\""` / `TS1232: An import declaration can only be used at the top level of a module`.
2. `db.resources.openTxn()` (line 162) - `openTxn` is not a Dexie `EntityTable` method: `TS2339`.
3. `row` is possibly `undefined` (line 164): `TS18048`.
4. Even after parsing is fixed, the test does not test what it claims: it reads a row, mutates the
   detached object and never writes it back, so "resource edit becomes searchable after Dexie
   commit" would not exercise the post-commit sync path at all.

This single file is the cause of the pre-existing red gate that has been carried through the whole
M8 milestone (`pnpm test` 56/57 files, 3 typecheck errors, and an ESLint error recorded in
`lint_output.txt`). It is the only blocker to a green dirty tree.

### 4.3 Structural risks in the implementation

| Finding | Evidence | Risk |
| --- | --- | --- |
| **Alias-export explosion** in the 2144-line `search.ts` (~20 aliases: `buildSearchIndex`/`buildIndex`/`startIndexBuild`/`startIndexing`/`loadSearchIndex`/`createSearchIndexFromDatabase`/... plus `facetedSearch`/`searchWithFacets`/`searchResourcesFaceted`) | `apps/web/src/services/search.ts` | A wide, redundant public surface that no caller needs; it hides the real API and makes future refactors risky |
| **Three dead case-variant shims** | `services/search-index.ts`, `services/searchIndex.ts`, `hooks/searchIndex.ts` - no importer anywhere (verified by grep) | Dead files that would be committed as "search modules"; two differ only by casing style, which is a portability smell |
| **Search Service is a 2144-line monolith** | `search.ts` | Index lifecycle, faceting, ranking, incremental sync, worker seam and aliases in one file; hard to review and to change safely |
| **Core package depends on an untracked file** | `packages/core/src/index.ts` exports `./tokenizer.ts` (untracked) | Committing `index.ts` without `tokenizer.ts` breaks `@fluid-deck/core` in a clean clone |
| **New runtime dependency** | `minisearch@^7.2.0` in `apps/web/package.json` + `pnpm-lock.yaml` | Must be intentional (ADR-007) and land with the lockfile |
| **Documented inconsistency inside the Sprint 6 doc set** | `docs/PHASE_3_DECISION_REGISTER.md` (SEARCH-007) still says *"No worker is implemented yet"* while `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` and `ARCHITECTURE_DECISION_RECORDS.md` state the worker **shipped** in SEARCH-008 | A reader of the decision register gets the wrong picture of the current design |
| **Stale test counts in the Sprint 6 closure review** | `docs/SPRINT_6_CLOSURE_REVIEW.md` claims `pnpm test` = 47 files / 381 tests passed | The number predates the M8 suites (clean clone today: 46 files / 412 tests) and the claim cannot be reproduced while `search.test.ts` fails to parse |

### 4.4 Compatibility with the committed M8 repository

| Interaction | Assessment |
| --- | --- |
| `packages/core/src/view-state.ts` | Sprint 6 adds the `"relevance"` sort. M8's committed `export/source.ts` filters on `view.domain` / `view.unorganized`, which M8's own repair commit already added. Both can coexist: `relevance` is additive to the sort union |
| `apps/web/src/services/library.ts` | M8's repair commit made `viewDateBounds` shared; Sprint 6's `hooks/queries.ts` imports it - consistent |
| `apps/web/src/repositories/tags.ts` | Sprint 6's diff is a blank-line removal only - no conflict |
| `apps/web/src/repositories/resources.ts` | Sprint 6 adds `listDomains()` and a `syncResource` call after writes - no conflict with the import/export pipeline |
| Import/export pipeline | Untouched by Sprint 6; `import/commit.ts` does not know about the search index, so an import can leave the index stale until the next rebuild. Sprint 6 syncs on resource writes through the repository, but the import committer writes in its own transactions - **an imported batch may not be reflected in the index until the next app start**. This is a real cross-feature gap worth an M9 task |
| Bundle | Dirty tree entry 771.32 kB / 241.30 kB gzip vs clean clone 719.32 kB / 225.40 kB gzip - the search work costs ~16 kB gzip, still inside the 250 kB budget |

## 5. Recommended integration sequence (smallest safe sequence)

The goal is a repository where `origin/main` contains the search implementation, the unit suite
and typecheck are green, and no legitimate work is lost. Seven steps, in order. **Not executed in
this task.**

**Step 0 - Gate (blocking).** Decide the scope of the search integration before touching Git:
keep `search.ts` as-is, or split it. Nothing else can proceed while `search.test.ts` is red.

**Step 1 - Repair the broken test.** Rewrite `apps/web/src/services/search.test.ts` so it parses:
move the `fake-indexeddb/auto` import to the top of the file, replace `db.resources.openTxn()`
with the real Dexie API, and make the "edit becomes searchable" case actually write the row
through the repository so the post-commit sync path runs. Acceptance: `pnpm test` is green in
the dirty tree (57/57 files) and `pnpm --filter @fluid-deck/web typecheck` reports 0 errors.

**Step 2 - Land the core package first.** Commit `packages/core/src/tokenizer.ts`,
`packages/core/src/tokenizer.test.ts` and `packages/core/src/index.ts` (in that dependency
order) so `@fluid-deck/core` never references a missing module. Acceptance: `pnpm --filter
@fluid-deck/core typecheck` and its tests pass.

**Step 3 - Land the dependency pair.** `apps/web/package.json` + `pnpm-lock.yaml` together, then
`pnpm install --frozen-lockfile` must succeed. Acceptance: a fresh clone installs without
lockfile drift.

**Step 4 - Land the search service in dependency order.** `search-worker-protocol.ts` ->
`search-engine.ts` -> `search-worker-core.ts` -> `search.worker.ts` -> `search.ts` -> the four
search test files (rewritten `search.test.ts` from Step 1). Do **not** commit the three dead
shims. Acceptance: the 11 search test files pass from a clean clone.

**Step 5 - Land the UI and integration layer.** `hooks/search-index.ts`, `hooks/queries.ts`,
`hooks/useViewState.ts` (+ its two test files), `features/search/*`, `App.tsx`, `main.tsx`,
`components/AppShell.tsx`, `features/{collections,tags,library}` panels, `bridge/inbox.ts`,
`repositories/resources.ts`, and `packages/core/src/view-state.ts` + `view-state.test.ts` (the
`relevance` residue). Acceptance: `pnpm test` green, typecheck green, `pnpm build` green, the
search UI E2E green in all three browsers.

**Step 6 - Land the evidence and documentation.** Sprint 6 docs (13 files), the M8 docs that are
still untracked (`SPRINT_7_IMPLEMENTATION_PLAN.md`, `SPRINT_7_READINESS_REVIEW.md`,
`SPRINT_7_IMPORT_002/003/004_REPORT.md`), and the Phase 3 / architecture diffs - after fixing the
"no worker is implemented yet" contradiction in the decision register. Acceptance: the doc set
is internally consistent with the shipped code.

**Step 7 - Merge `docs/PROJECT_PROGRESS.md` instead of overwriting it.** Take the committed
(HEAD) file as the base and add the Sprint 6 entries from the working copy; never commit the
working copy verbatim. Acceptance: `git diff` on that file shows Sprint 6 entries **added** and
zero M8 entries removed.

**Step 8 - Quarantine, do not delete.** Move the 8 scratch `*_output.txt` captures and the 14 MB
`poc/` tree (which contains `node_modules`) outside the repository or into an explicitly
git-ignored location, and add ignore rules. Nothing in `poc/` may be committed.

**Step 9 - Verify the clean-clone gate.** Fresh clone of the pushed HEAD: `pnpm install
--frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, plus the two
search Playwright configs. Only then declare the baseline reproducible.

### 5.1 Hazards to avoid

1. Committing `packages/core/src/index.ts` without `tokenizer.ts` - breaks the core package.
2. Committing `package.json` without `pnpm-lock.yaml` (or the reverse) - breaks
   `pnpm install --frozen-lockfile` in a clean clone.
3. Committing the working copy of `docs/PROJECT_PROGRESS.md` - it drops the committed IMPORT-008
   entry, so M8 progress is deleted from the log.
4. Committing `poc/` - drags 14 MB of `node_modules` and bundle dumps into history.
5. Committing the three dead shims - permanent dead code with two naming conventions.
6. Landing `search.ts` without first fixing `search.test.ts` - reproduces the red gate that has
   been carried through M8.
7. Assuming Sprint 6's own evidence numbers still hold (`47 files / 381 tests`, default suite
   "23 pass + 3 fail") - they were measured before M8 and before the red gate.

## 6. Exit criteria for a clean reproducible baseline

- [ ] `git status` is empty except for a documented, ignored `poc/` and scratch area
- [ ] A fresh clone of `origin/main`: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green
- [ ] The search E2E suites are green in Chromium, Firefox and Edge
- [ ] `docs/PROJECT_PROGRESS.md` contains both the Sprint 6 and the M8 entries
- [ ] The decision register and the search architecture document agree on the worker
- [ ] The bundle entry stays <= 250 kB gzip (currently 241.30 kB with search included)
- [ ] No `node_modules`, scratch capture or benchmark dump is tracked

## 8. Resolution status (2026-11-14, M9-006)

| Step | Status |
| --- | --- |
| M9-001 repair the broken test file | done - `61d8b96` |
| M9-002 land the core package | done - `6d0ac4f`, `4a6d18e`, `409d69c`, `c21e4b6` |
| M9-003 land the dependency pair | done - `7ac508a`, `1e28624` |
| M9-004 land the search modules | done - `57331fe` .. `b29a16a` (76 unused alias exports removed) |
| M9-005 land the UI and integration layer + the import-to-search sync | done - `93a7417` .. `460b7cf` (26 commits) |
| M9-006 merge the documentation + remove the dead shims | this task |
| M9-007 clean-clone gate | green at `460b7cf`: install, typecheck (5/5), 57 files / 499 tests, build, 26 Playwright tests |
| Scratch captures and `poc/` | deliberately never committed; `poc/` stays outside the production cleanup boundary |
| Search worker / benchmark specs and their Playwright configs | left uncommitted on purpose - M9-040 owns the test separation and the explicit browser matrix |
