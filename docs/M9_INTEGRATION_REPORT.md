# M9 Integration Report - Sprint 6 Search Reconciliation and Application Integration

*Date: 2026-11-14 - Scope: M9-001..M9-005 (Sprint 6 search integration) plus M9-006 (documentation
reconciliation). No accessibility, performance or export-UI work.*

## 1. Summary

Sprint 6 (M7, search) was implemented entirely in the working tree and never committed. M8
(import/export) was committed on top of a repository that did not contain it, so `origin/main`
and the working tree were two different products until M9-001..M9-004 closed the gap. M9-005
made the committed search engine reachable from the application and closed the one cross-feature
hole the audit found: **imported rows were never indexed**.

| Task | Outcome | Commits |
| --- | --- | --- |
| M9-001 | Repaired the broken Sprint 6 test file `apps/web/src/services/search.test.ts` (4 defects) | `61d8b96` |
| M9-002 | Integrated the shared core tokenizer and the package export | `6d0ac4f`, `4a6d18e`, `409d69c`, `c21e4b6` |
| M9-003 | Integrated the MiniSearch dependency and its lockfile resolution | `7ac508a`, `1e28624` |
| M9-004 | Integrated the search service, engine, worker protocol/core/entrypoint and their unit tests; removed 76 dead alias exports | `57331fe`, `a46dead`, `e49ed56`, `40709ce`, `820a637`, `1f9273e`, `9d4a2f9`, `85569b6`, `b29a16a` |
| M9-005 | Integrated the search UI, hooks, app wiring, the `relevance` sort, and the import-to-search synchronization | `93a7417` .. `460b7cf` (26 commits, one file each) |
| M9-006 | Documentation reconciliation, dead-shim removal, scratch/POC classification | this document + the commits listed in section 7 |

## 2. M9-001 - the broken Sprint 6 test

`apps/web/src/services/search.test.ts` did not parse. Four independent defects, all fixed in the
test file only:

1. `import "fake-indexeddb/auto"` inside a test body (esbuild transform error, TS1232) - moved to
   module scope, matching `search-index.test.ts`.
2. `db.resources.openTxn()` - not a Dexie `EntityTable` method (TS2339) - replaced with
   `database.resources.update(id, {...})`.
3. `row` possibly `undefined` (TS18048) - removed with the invalid API call.
4. The case never wrote the row back, so it proved nothing about incremental sync - it now
   persists the change, calls the production `syncResource(database, id)`, and asserts the index
   reflects the new title **without** a rebuild (`mini.documentCount` unchanged).

The file's own "SEARCH-004" intent was preserved and strengthened; no assertion was weakened and
no test was skipped.

## 3. M9-002 / M9-003 - core and dependency

- `packages/core/src/tokenizer.ts` (58 lines, zero imports) implements the approved tokenizer:
  NFC normalisation, lowercase, split on non-alphanumerics, CamelCase split **and** the joined
  token retained, no stop words, no stemming, diacritics retained. Field weights
  (`title 3 / tagsText 2 / description 1 / urlText 0.6 / collectionsText 0.5 / typeText 0.4`)
  match the architecture table exactly. 12 unit tests.
- `packages/core/src/index.ts` gained `export * from "./tokenizer.ts";` and
  `index.test.ts` gained one case that pins the export in the package's public surface.
- `minisearch@^7.2.0` was declared in `apps/web/package.json` and resolved in `pnpm-lock.yaml`
  (7.2.0, no transitive dependencies, MIT, no `engines` floor). The declaration and the lockfile
  were committed together and in that order, so no commit ever declared a dependency without its
  resolution. `pnpm install --frozen-lockfile` resolves with "Lockfile is up to date".

## 4. M9-004 - the search service

Committed in dependency order: `search-engine.ts` -> `search-worker-protocol.ts` ->
`search-worker-core.ts` -> `search.worker.ts` -> `search.ts` -> the four remaining unit test
files. Every import of those files resolves inside the committed tree.

**76 alias exports removed.** `search.ts` (2,144 lines) exported ~20 aliases per operation
(`buildIndex`, `startIndexing`, `applyBulkImport`, `facetedSearch`, `handleTagRenamed`, ...). Every
alias name was extracted and grepped across `apps`, `packages` and `e2e` - committed **and**
uncommitted code: **zero external references**. All 22 alias targets were real exported
functions, so removing the alias lines could not remove a canonical export. The module is now
2,043 lines and the bundle is unchanged (the aliases were tree-shaken).

**Architecture conformance** (verified against `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md`):
one shared tokenizer at index and query time; approved field weights; `prefix: true` and
`fuzzy: 0.2` at query time only; AND first with an OR fallback and a `partial` flag; exact-title
pin as the only custom ranking rule, then score, `updatedAt`, title and id as deterministic
tie-breaks; `SEARCH_RESULT_CAP = 500`; index writes only after Dexie commits; chunked startup
rebuild with cancellation and stale-build protection; the worker as an off-load with a
main-thread fallback.

## 5. M9-005 - application integration

### 5.1 Search UI

- Header search input with debounce; `/` focuses it unless the target is editable
  (`isEditableTarget`) or a dialog owns the keyboard. The Cmd/Ctrl+K palette is untouched.
- Query, facets and sort live in the URL, so deep links, back and forward work. The sort default
  swaps to `relevance` when a query appears and back to `newest` when it clears; an explicit user
  choice is kept.
- Facets: type, source, date, domain, collection, tag, unorganized, with live counts.
- `SearchStatus` is a polite live region: match count, "N more matches are hidden by the
  500-result limit", indexing progress, the partial-results warning, and an error state with a
  retry.
- An empty query stays on the lighter browse query; the trash view disables search and drops the
  query, and back restores it.

### 5.2 ViewState

Only the `relevance` sort option was added to `packages/core/src/view-state.ts`. The `domain` and
`unorganized` facets were already committed in M8's repository-integrity repair (`b710f8f`), so
the URL contract stays backward compatible: a pre-UI-004 URL still decodes to the same view.

### 5.3 Import-to-search synchronization

The architecture states the rule: *"index writes only ever follow Dexie commits"*. The import
path did not honour it - `import/commit.ts` writes through `repositories/resources.ts`, which never
notified the index, so imported rows were invisible to search until the next application start.

The fix is inside the committer, with no new service API:

- `commitBatch` now also returns `touched`: the ids of the rows the batch created, the rows it
  re-indexed through the `update` resolution, and the rows whose collection membership changed
  (membership text is searchable).
- After each 500-row transaction **resolves**, the loop calls
  `syncResourcesBatch(database, outcome.touched)`, which re-reads the committed rows from Dexie and
  upserts them incrementally. No rebuild is triggered.
- A failed batch throws before the sync, so rolled-back rows are never indexed.
- A sync failure is swallowed: the index is derived state, rebuilt at the next startup, and must
  not fail an import whose rows are already committed.
- Checkpoint, resume and idempotency semantics are unchanged.

Four regression tests were added to `apps/web/src/import/commit.test.ts`. They are proven
meaningful: with the sync call disabled exactly those four fail (`4 failed | 21 passed`), and
with it the file is green (`25 passed`).

1. an imported resource becomes searchable without an app restart or a rebuild;
2. a rolled-back batch never appears in the index (the 500 committed rows are indexed, the
   rolled-back row is not);
3. an updated title is searchable under its new title and no longer matches the old one;
4. a multi-batch import synchronises every committed batch (`documentCount` 600, the last row of
   the second batch is findable).

### 5.4 Known limitation of the synchronization (failure recovery)

**If the index does not exist yet when the import runs, the imported rows are not searchable
until the next startup rebuild.** `applyUpsert` queues such ids in `pendingUpsertIds` when
`state.index` is `null`, and that set is cleared - not replayed - at the next rebuild. So an
import that lands during the startup index build (or after a failed build) is committed to Dexie
but does not appear in search results until the app is restarted. This is a **failure-recovery
limitation of the derived index**, not data loss: the rows are in Dexie, and the index rebuild
picks them up. Closing it (replaying pending upserts into a newly built index, or triggering a
rebuild after an import that ran without one) is M9 hardening work (WS-C, M9-031/032), not part
of this integration.

## 6. Verification

| Gate | Result |
| --- | --- |
| Full unit suite (clean clone of `460b7cf`) | **57 files / 499 tests passed** |
| `pnpm typecheck` (5/5 workspaces) | 0 errors |
| ESLint + Prettier on every touched file | clean |
| `pnpm build` | exit 0 - web entry **771.46 kB raw / 241.33 kB gzip** (budget 250 kB, 8.67 kB headroom); `search.worker` is a **separate 116.43 kB lazy chunk**, excluded from the initial bundle |
| `pnpm test:e2e` (default config, clean clone) | **26 passed (22.1 s)**, including the 4 new search-UI tests |
| Dirty-tree default E2E | 34 passed, 1 failed: `e2e/search-worker-built.spec.ts` - an **untracked** Sprint 6 spec that needs the production preview server (M9-040's test separation), not committed here |

Bundle delta for the whole search feature: entry 719.32 -> 771.46 kB raw / 225.40 -> 241.33 kB
gzip (+52.14 / +15.93), plus a separate 116.43 kB worker chunk.

## 7. M9-006 - documentation reconciliation and cleanup

Committed: the 13 Sprint 6 reports and their two benchmark artifacts, the 5 untracked Sprint 7
planning/report documents, the missing IMPORT-001 report (section 8), the two Phase 3 planning
documents, the Phase 3 decision register (the stale "no worker is implemented yet" statement
corrected), the two architecture documents (worker amendments), and this report.

Deleted: three verified dead shims - `apps/web/src/services/search-index.ts`,
`apps/web/src/services/searchIndex.ts`, `apps/web/src/hooks/searchIndex.ts`. Reference audit: the
only occurrences of those paths anywhere in the repository are in documentation that lists them
as dead; no import, dynamic import, alias or configuration depends on them, and the canonical
implementations (`services/search.ts`, `hooks/search-index.ts`) are committed and covered by
tests.

Preserved untouched: the `poc/` tree (outside the production cleanup boundary), the eight scratch
terminal captures, the four search worker/benchmark E2E specs and the two dedicated Playwright
configs (M9-040), and every unrelated dirty file.

## 8. IMPORT-001 report

`docs/SPRINT_7_IMPORT_001_REPORT.md` was missing from the report set. It was reconstructed in
M9-006 from the committed source (`apps/web/src/import/parser.ts`, 311 lines), the committed test
file (18 tests), the committed fixtures and the git history. It contains no newly measured
result: the only command run for it was `pnpm vitest run apps/web/src/import/parser.test.ts`
(18 passed), everything else is read from the code or from a recorded run.

## 9. What is still open

| Item | Owner |
| --- | --- |
| Screen-reader and 200-400 % zoom/reflow evidence for every screen | M9 WS-A (M9-010..014) |
| Export scopes `Current Filter` / `Selected` and the flatten-collections option | M9 WS-B (M9-020..023) |
| Real-browser 10k import, percentiles, cross-tab import lock, checkpoint hardening, pending-upsert replay | M9 WS-C (M9-030..034) |
| One Playwright config with an explicit Chromium/Firefox/Edge matrix, benchmark-spec separation, the two search worker configs | M9 WS-D (M9-040..043) |
| DOMPurify / MiniSearch dependency wording in the Sprint 7 planning documents | corrected in M9-006 (section 10) |
| The final integration gate on a clean clone | M9-007 |
