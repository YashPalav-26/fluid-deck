# M9 Readiness Review - Fluid Deck (Hardening)

*Date: 2026-11-12 - Audit and planning only. No M9 implementation was started, no Sprint 6 file was integrated, archived or deleted, and no application code was modified.*

## 1. Executive verdict

**M9 is ready to be planned and scoped, but NOT ready to be implemented yet.** One blocking
condition sits in front of it: the repository's committed state (`origin/main`) does not contain
the Sprint 6 search implementation, while the working tree does. Any M9 work started today would
be built on a foundation that is 75 files away from being reproducible - and the first M9 task
that touches a search-adjacent file would immediately hit the unresolved red gate in
`apps/web/src/services/search.test.ts`.

Recommended sequence: **close the reconciliation gate (7-9 steps, see
`docs/SPRINT_6_REPOSITORY_RECONCILIATION.md` section 5), then start M9 workstream A
(accessibility), which is independent of the search decision.**

## 2. Exact Git baseline (measured, not assumed)

| Fact | Value |
| --- | --- |
| Repository | `C:\Users\ADMIN\OneDrive\Documents\Github-Projex\fluid-deck` |
| Branch | `main` |
| Local HEAD | `204c54bf7698150a933e1dbc4eb68c8248f01bf1` |
| Remote HEAD (`origin/main`) | `204c54bf7698150a933e1dbc4eb68c8248f01bf1` - **identical, 0 ahead / 0 behind** |
| Index | clean (staged set empty) |
| Dirty entries | **75** = 23 modified + 52 untracked (recounted in this audit) |
| Modified diff volume | 413 insertions / 80 deletions |
| Untracked volume | ~0.9 MB of source/docs, plus `poc/` at 14.0 MB (135 files, incl. `node_modules`) |

Dirty inventory by class. Counts are **files**; `git status` shows 75 entries because two
directories are collapsed into one entry each (`apps/web/src/features/search/` = 8 files,
`poc/` = 135 files). Full file-level table with per-path classification in
`docs/SPRINT_6_REPOSITORY_RECONCILIATION.md` section 3.

| Class | Files | Git entries | Representative paths |
| --- | --- | --- | --- |
| Production implementation candidate | 25 | 22 | `apps/web/src/services/search*.ts` (5), `packages/core/src/tokenizer.ts`, `apps/web/src/features/search/*` (4), `hooks/{queries,useViewState}.ts`, `App.tsx`, `main.tsx`, `repositories/resources.ts`, `package.json` + `pnpm-lock.yaml` |
| Test / e2e candidate | 19 | 15 | 11 search test files, 5 `e2e/search-*.spec.ts`, 2 `playwright.search-worker*.config.ts`, `core/view-state.test.ts` |
| Documentation candidate | 23 | 23 | 13 `docs/SPRINT_6_*`, 5 untracked `docs/SPRINT_7_*` (M8 plan/readiness/IMPORT-002..004 reports), 5 Phase 3 + architecture diffs |
| Scratch / generated artifact | 8 | 8 | `build_output.txt`, `git_diff.txt`, `git_status.txt`, `lint_output.txt`, `summary.txt`, `test_output.txt`, `test_run.txt`, `typecheck_output.txt` |
| Proof of concept | 135 | 1 | `poc/extension-bridge` (135 files, 14.0 MB, includes `node_modules`) - excluded by the standing boundary |
| Obsolete / duplicate | 4 | 4 | `services/search-index.ts`, `services/searchIndex.ts`, `hooks/searchIndex.ts` (dead shims), `repositories/tags.ts` (blank-line-only diff) |
| Unclear - needs investigation | 2 | 2 | `services/search.test.ts` (does not parse), `docs/PROJECT_PROGRESS.md` (older fork that drops the committed IMPORT-008 entry) |
| **Total** | **216** | **75** | |

## 3. Sprint 6 implementation assessment

### 3.1 Is it coherent?

**Yes, architecturally.** The shape matches the approved Phase 2.4 ownership rules:

- one shared tokenizer in `@fluid-deck/core` (`packages/core/src/tokenizer.ts`),
- one MiniSearch engine module free of Dexie and browser APIs (`services/search-engine.ts`),
- a versioned worker protocol (`search-worker-protocol.ts`) with a worker entrypoint
  (`search.worker.ts`) and a shared core (`search-worker-core.ts`),
- one Search Service owning index lifecycle, faceting, ranking and incremental sync
  (`services/search.ts`),
- UI in `features/search/`, state in the URL via the existing `useViewState`,
- Dexie remains the sole source of truth; the index is disposable and rebuilt at startup.

### 3.2 Is it complete?

**Functionally yes; mechanically no.** The feature works (evidence below), but the tree cannot be
committed as-is:

| Blocker | Detail |
| --- | --- |
| `services/search.test.ts` does not parse | `import "fake-indexeddb/auto"` inside a test body (esbuild error / TS1232), `db.resources.openTxn()` is not a Dexie API (TS2339), `row` possibly undefined (TS18048), and the case never writes the row back, so it does not exercise the post-commit sync path it names |
| Core package points at an untracked file | `packages/core/src/index.ts` exports `./tokenizer.ts`; committing the index alone breaks `@fluid-deck/core` |
| Dependency pair must land together | `minisearch@^7.2.0` in `apps/web/package.json` + `pnpm-lock.yaml` |
| Three dead shims | `services/search-index.ts`, `services/searchIndex.ts`, `hooks/searchIndex.ts` have no importer |
| Alias-export explosion | ~20 aliases in the 2144-line `services/search.ts` (`buildSearchIndex`/`buildIndex`/`startIndexBuild`/`loadSearchIndex`/... and `facetedSearch`/`searchWithFacets`/`searchResourcesFaceted`) |
| Doc contradiction | The Sprint 6 decision register still says *"No worker is implemented yet"* while the architecture/ADR documents state the worker shipped in SEARCH-008 |
| Progress log is an older fork | The working copy of `docs/PROJECT_PROGRESS.md` carries the Sprint 6 IMPORT-001..004 entries but drops the committed IMPORT-008 entry; committing it verbatim would delete M8 progress | Merge from the HEAD copy |

### 3.3 Measured evidence (this audit)

| Check | Command | Result |
| --- | --- | --- |
| Search unit suites (11 files: facets, index, worker core, worker recovery, 4 feature tests, tokenizer, view-state navigation, view-state) | `pnpm vitest run <those paths>` | **11 files passed** |
| Search UI E2E | `pnpm exec playwright test e2e/search-ui.spec.ts` | **4 passed (7.2 s)** |
| Dirty-tree full unit suite | `pnpm test` (earlier this session) | 481 passed / 56 of 57 files; only `search.test.ts` fails |
| Dirty-tree typecheck | `pnpm typecheck` (earlier this session) | 3 errors, all in `search.test.ts` |
| Dirty-tree build | `pnpm build` (earlier this session) | exit 0 - web entry 771.32 kB raw / 241.30 kB gzip |

### 3.4 Clean-clone risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Sprint 6 stays uncommitted | `origin/main` has no search; the app a user clones has no keyword search, while the working tree does - two different products | Close the reconciliation gate before M9 |
| `index.ts` without `tokenizer.ts` | `@fluid-deck/core` fails to compile in a clean clone | Land core files in dependency order |
| `package.json` without lockfile (or vice versa) | `pnpm install --frozen-lockfile` fails in a clean clone | Land both in one commit |
| `docs/PROJECT_PROGRESS.md` committed from the working copy | M8 progress entries deleted from history | Merge from the HEAD copy |
| `poc/` committed | 14 MB of `node_modules` and bundle dumps in history | Keep ignored; never stage |
| Search index staleness after an import | The import committer writes through `repositories/resources.ts` (`createResourceWithMembers` / `updateResource`), which does **not** call `syncResource` - only the UI query hooks and the capture bridge do. An imported batch is therefore not searchable until the next rebuild | New M9 task (see `docs/M9_IMPLEMENTATION_PLAN.md`, M9-034) |
| Untracked `search.test.ts` keeps the dirty tree red | Every full-suite run reports 56/57 files; M8 carried this for two milestones | M9-001 in the reconciliation plan |

## 4. Known failures (reported, not reclassified)

| Failure | Scope | Owner |
| --- | --- | --- |
| `apps/web/src/services/search.test.ts` - esbuild transform error (import in a test body) | dirty tree only (untracked file); absent from a clean clone | Sprint 6 reconciliation |
| 3 TypeScript errors in the same file (`TS1232`, `TS2339`, `TS18048`) | dirty tree only | Sprint 6 reconciliation |
| ESLint error in the same file (recorded in `lint_output.txt`) | dirty tree only | Sprint 6 reconciliation |
| Sprint 6's own default Playwright inventory recorded "26 tests in 10 files (23 pass + 3 fail)" | the 3 failures are the Sprint 6 benchmark specs in the dirty tree | Sprint 6 reconciliation |
| No screen-reader evidence anywhere in the app | M8 and Sprint 6 | M9 workstream A |
| No 200-400 % zoom / reflow evidence | M8 and Sprint 6 | M9 workstream A |
| Export scopes `Current Filter` / `Selected` have no UI; no flatten-collections option | M8 | M9 workstream B |
| Import 10k never measured in a browser; single-run timings only | M8 | M9 workstream C |
| No cross-tab import lock; checkpoint is per browser profile, 64-bit FNV fingerprint | M8 / IMPORT-004 | M9 workstream C |

## 5. M9 priorities

| # | Workstream | Why now | Blocking dependency |
| --- | --- | --- | --- |
| P0 | **Repository reconciliation** (Sprint 6 integration) | The committed tree is not the working tree; two different products; one red test file carried through M8 | none - start here |
| P1 | **Accessibility** | No screen-reader or zoom evidence exists for any screen in the app, including the new import screens and the search UI | search UI files must exist first (workstream A can start on the committed M8 screens while P0 runs) |
| P2 | **Export completeness** | FR-IEX-005/006 are only partially met; two of four export scopes and the flatten option are missing | none (M8 code is committed) |
| P3 | **Performance and reliability** | 10k import is unmeasured and extrapolates above the proposed budget; no cross-tab import lock | none |
| P4 | **Test infrastructure** | Two Playwright configs, one with no project matrix; the dirty default suite is red | P0 (benchmark specs) |
| P5 | **Documentation** | DOMPurify claim wrong, IMPORT-001 report missing, Sprint 6 doc contradictions | P0 (Sprint 6 docs) |

Suggested task IDs, dependencies and acceptance criteria are in
`docs/M9_IMPLEMENTATION_PLAN.md`. The ID family `M9-0xx` is unused in the repository (existing
families: `UI-`, `IMPORT-`, `SEARCH-`, `EXT-`, `DB-`, `ADR-`, `TEST-`, `CORE-`, `SRH-`, `CAP-`,
`PER-`, `IEX-`, `STO-`, `PRI-`), so the new IDs are unique.

## 6. Exit gates for M9

M9 may be declared closed when all of the following hold:

1. `origin/main` is reproducible: a fresh clone installs, typechecks, tests and builds green.
2. The reconciliation ledger shows zero unexplained dirty entries.
3. Every screen in the app (import, export, search, settings, grid) has a documented
   screen-reader and zoom/reflow pass, or an explicit documented exception.
4. The four export scopes and the flatten option are either shipped or formally descoped in the
   PRD/plan with the reason recorded.
5. A 10k import is measured in a real browser with repeated runs and percentiles reported.
6. The import path is safe against a concurrent second tab.
7. One Playwright configuration with an explicit Chromium/Firefox/Edge matrix is green, and the
   documented CI command reproduces it.

## 7. Work NOT performed in this review

- No Sprint 6 file was committed, staged, moved, archived or deleted.
- No application code was modified; no product behaviour changed.
- No M9 implementation was started (no accessibility, export, performance, test-infra or
  documentation work items were executed).
- No M9 task was implemented or scheduled beyond the plan.
- The `poc/` tree and the 8 scratch capture files were left untouched (no deletion, no
  `.gitignore` change).
- `docs/PROJECT_PROGRESS.md` was not rewritten; only a narrowly scoped M9 planning entry is
  proposed, staged from the committed (HEAD) copy so the dirty Sprint 6 edits stay uncommitted.
- No new benchmark was executed; the only measurements quoted are the ones actually run in this
  audit (the 11 search test files, the search UI E2E) or recorded earlier in this session
  (dirty-tree `pnpm test` / `pnpm typecheck` / `pnpm build`).
- The search worker E2E configs (`playwright.search-worker*.config.ts`) were **not** executed -
  they need a production build/preview server and were left for the reconciliation step.
