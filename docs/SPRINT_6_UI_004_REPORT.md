# Fluid Deck — Sprint 6 (M7) UI-004 Search Interface Report

*Date: 2026-11-12 · Scope: UI-004 (search UI: input, shortcuts, facets, sort, URL state, states). SEARCH-001..008 were already complete and validated. No staging, commits, or pushes performed.*

*Companions: `docs/SPRINT_6_FACET_SEARCH_REPORT.md` (facet/cap/sort contract), `docs/SPRINT_6_SEARCH_RECOVERY_REPORT.md` (worker lifecycle), `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md`.*

---

## 1. Summary

- **UI-004 — complete.** The finished Search Service is now reachable from the shell: a persistent header input, `/` focus shortcut alongside the existing ⌘/Ctrl+K palette, debounced URL-backed queries, the full facet bar (Type, Source, Date, Domain, Collection incl. descendants, Tags OR, Unorganized), sort controls, honest count/truncation messaging, and explicit indexing/loading/error/partial/empty states.
- No schema change, no worker-protocol change, no new dependency, no second search implementation. The UI calls the existing `searchFaceted` service through one query hook; presentation components read no Dexie tables directly.
- Empty-query browsing deliberately stays on the lighter `getLibraryResources` path; only a non-empty `q` uses the faceted service (facet counting costs ~1.4–2.9 s at 10k).
- Two real navigation bugs surfaced during E2E verification and were fixed (stale debounce replay; same-tick ViewState clobbering). Both now have regression tests.

## 2. Integration points (no duplicated logic)

| Concern | Owner |
|---|---|
| Keyword + facets + cap + sort semantics | `apps/web/src/services/search.ts` (`searchFaceted`, unchanged contract) |
| Browse query + date presets + browse-side domain/unorganized | `apps/web/src/services/library.ts` |
| Query/caching/cancellation | `apps/web/src/hooks/queries.ts` (`useSearchResults`, `useDomains`, `useResources({enabled})`) |
| URL state | `packages/core/src/view-state.ts` codec + `apps/web/src/hooks/useViewState.ts` |
| Index lifecycle | `apps/web/src/hooks/search-index.ts` (unchanged; consumed for status + gating) |
| Presentation | `apps/web/src/features/search/*`, `App.tsx`, `AppShell`, `ResourceGrid` |

Rules held: facet option lists are database-driven (`useCollections`, `useTags`, `listDomains`); the filter bar is a dumb component that only emits `Partial<ViewState>`; result rendering is the existing `ResourceGrid`/`ResourceCard`, so trash/restore/open actions are unchanged.

## 3. Behavior implemented

### 3.1 Query input and shortcuts

- Header input (`role="search"`, visually hidden label “Search resources”, `type="search"`, visible clear button).
- 150 ms debounce; the URL is authoritative: an external value change cancels any queued keystroke before it can write. Enter and blur commit immediately; Escape and the clear button clear immediately (no debounce wait).
- `/` focuses the shell input only when there is no modifier, focus is not inside an editable control, no dialog is open, and the input is enabled. Cmd/Ctrl+K keeps opening the existing palette; the two surfaces share the same service and URL state.

### 3.2 Query path and stale-result protection

- Non-empty `q`: `useSearchResults(view, { enabled: searching && !indexBlocked })` → `searchFaceted(db, …)` with the whole ViewState (type, source, domain, date range, collection, tags, unorganized, sort).
- Empty `q`: `useResources(view, trash, { enabled: !searching })` → existing browse path; no facet-count recomputation.
- React Query key is the entire ViewState, so a superseded query cannot overwrite a newer one; the query function also throws if its `signal` aborted before resolution.
- Index gating: a keyword query is not executed while the index is unready, so a query typed during indexing re-runs on `ready` instead of caching zero results. Browsing is never blocked by index state.

### 3.3 Facets and sort

- Type, Source, Date (week/month/year + preserved custom range), Domain (distinct live domains), Collection (tree-flattened options; the service still expands descendants), Tags (checkbox list, OR semantics), Unorganized.
- Facet counts appear when the search service returns them; the same controls work in browse mode without counts.
- “Clear filters” resets facet-only params and keeps `q`/sort.
- Sort control offers the canonical ViewState vocabulary: newest, oldest, title A–Z/Z–A, most tagged, recently opened, relevance. Relevance is hidden while `q` is empty. Default policy: `newest → relevance` on empty→non-empty query, `relevance → newest` on clear; an explicit user sort is never overridden.

### 3.4 Count and state messaging

`SearchStatus` is one polite live region (error state uses `role="alert"` with a retry action):

- indexing: progress when known (`done of total`), “keyword results may be incomplete”;
- searching: “Searching…”;
- results: `N matches`;
- truncation: “showing the first R” plus “X more matches are hidden by the R-result limit”;
- partial index: “the index was still updating, so this list may be incomplete”;
- error: “Search failed. Your data is untouched.” + retry;
- index failure: “Search is unavailable” empty state with a reload hint (never an empty-result claim);
- empty query-results: `No matches for “…”` with a filter hint instead of the “save a page” copy.

### 3.5 URL contract

- Core codec extended additively: optional lowercased `domain`, boolean `unorganized`, and `relevance` in `VIEW_SORT_OPTIONS`. Pre-UI-004 URLs still decode to the same state (regression test).
- `q`, facets, sort and `view=trash` survive refresh and back/forward. `parseRoute`/`buildRouteSearch` keep `view=trash` outside the core schema, so existing `?view=trash` deep links and history entries remain valid.
- Entering trash clears `q`, type, source, domain, date and unorganized; keeps collection/tags/sort; maps `relevance → newest` (relevance is meaningless without a query). Trash stays browse-only because the index excludes soft-deleted rows; the input is disabled with an explanatory hint.
- `updateView` merges onto a synchronous `routeRef` mirror, so two writes in one tick cannot clobber each other; `navigate` skips `pushState` when the encoded URL is unchanged, keeping history free of no-op entries.

## 4. Defects found during verification (fixed)

1. **Stale debounce replayed after external navigation.** A queued keystroke could fire after trash/back-forward changed the URL, pushing bogus entries such as `?q=react&sort=relevance&view=trash` followed by `?view=trash`. Fixed by cancelling the pending timer whenever the URL value changes; pinned by a regression test (“cancels a queued query when the URL changes underneath it”).
2. **Same-tick ViewState clobbering.** A search commit followed by a facet click in the same tick merged onto the render-time route instead of the newest view, dropping `q`. Fixed with the `routeRef` mirror; pinned by `useViewState.navigation.test.ts` (“merges two writes made before React re-renders”, plus no-op-push, trash-clearing and popstate tests).

E2E expectation corrected accordingly: back/forward steps one history entry at a time, and sort/domain are separate entries.

## 5. Acceptance criteria evidence

Task breakdown AC: **“URL state; empty/error states.”**

| Requirement | Evidence |
|---|---|
| Persistent shell search connected to the Search Service | `AppShell` `headerSearch`; `SearchInput` → `handleQueryChange` → URL → `useSearchResults`/`searchFaceted`; E2E test 1 |
| Cmd/Ctrl+K palette, `/` focuses search outside editable controls | `App.tsx` key handler + `search-shortcuts.ts` unit tests (2) + E2E test 1 |
| Debounce, cancellation, stale-result protection | `SearchInput` 6 tests (incl. URL-wins cancellation, Enter/blur commit, Escape clear); ViewState-keyed query + abort guard |
| Loading / indexing / error / partial / empty states | `SearchStatus` 7 tests; `App` index gating + empty-state copy; E2E empty-result assertion |
| Results via existing grid/card and actions | `App` renders the same `ResourceGrid` with existing trash/restore/open handlers; E2E grid counts; browse/trash regression below |
| Facets: Type, Source, Date, Domain, Collection+descendants, Tags OR, Unorganized | `SearchFilters` 5 tests; `search-facets.test.ts` (tags OR, domain, unorganized, collection-aware service semantics inherited from SEARCH-005) |
| Sort controls | `search-facets.test.ts` (createdAt newest/oldest, title asc/desc, most-tagged, recently-opened, relevance vs explicit sort); sort URL round-trip E2E |
| Count messaging incl. 500 cap / truncation | `SearchStatus` truncation + partial assertions; `search-facets.test.ts` exactly-500 vs 501 and explicit smaller cap (`truncated`, `truncatedCount`/`omittedCount`, `cap`) |
| URL state incl. backward-compatible `view=trash` | core codec 7 tests (round-trip, pre-UI-004 URL, domain normalization); E2E refresh/back/forward; navigation tests (merge, no-op push, trash params, popstate) |
| Browsing and trash intact when search cleared/disabled | E2E test 1 (clear restores 3 items, status disappears), test 3 (trash disables input, drops `q`, back restores query); `library.test.ts` 6 tests |
| Facets DB-driven, no presentation DB access, no duplicate logic | filter bar receives collections/tags/domains/counts as props; only hooks/services touch Dexie |
| Keyboard, visible focus, labels, SR announcements, responsive | sr-only label, `role="search"`, `aria-live` status, `focus-visible` outlines on input/clear/facet controls, 375 px E2E test |
| Boundaries (no schema/worker/dependency/M8/M9 changes) | no schema version change, no protocol change, no new dependency; perf budgets explicitly not claimed |

## 6. Tests

Focused UI-004 run (10 files / 50 tests, all passing):

- `packages/core/src/view-state.test.ts` — 7
- `apps/web/src/services/search-facets.test.ts` — 6
- `apps/web/src/services/library.test.ts` — 6
- `apps/web/src/features/search/SearchInput.test.tsx` — 6
- `apps/web/src/features/search/SearchFilters.test.tsx` — 5
- `apps/web/src/features/search/SearchStatus.test.tsx` — 7
- `apps/web/src/features/search/search-shortcuts.test.ts` — 2
- `apps/web/src/hooks/useViewState.test.ts` — 5
- `apps/web/src/hooks/useViewState.navigation.test.ts` — 4
- `apps/web/src/hooks/queries.test.ts` — 2

New E2E spec `e2e/search-ui.spec.ts` — 4/4 passing: search + `/` + clear; facet/sort URL state with refresh, back and forward; trash disable + query drop + back restore; phone-width reachability.

## 7. Verification (actual)

| Check | Result |
|---|---|
| `pnpm test` | 47 files / 381 tests passed |
| `pnpm typecheck` | 5/5 workspaces green |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | clean |
| `pnpm --filter @fluid-deck/web build` | green |
| `pnpm exec playwright test e2e/search-ui.spec.ts` | 4/4 passed |
| `pnpm exec playwright test --config playwright.search-worker-preview.config.ts` | 2/2 passed (built worker, Chromium + Firefox) |
| `git diff --check` | exit 0 (LF/CRLF warnings only) |

Full default Playwright run: 23 passed / 3 failed. Two failures were the SEARCH-006 benchmark specs (`Execution context was destroyed, most likely because of a navigation`) — the shared Vite dev server hot-reloaded while a production build and file edits ran during those runs. Both pass in isolation (main benchmark 15.0 min; worker benchmark 16.2 min, sequential, no concurrent edits). The third is `e2e/search-worker-built.spec.ts`, which fails by design under the default dev-server config — it requires `playwright.search-worker-preview.config.ts` against `vite preview`, where it passes 2/2. Both are pre-existing harness facts, not UI-004 regressions.

### 7.1 Bundle impact

| Asset | Previous | Now | Delta |
|---|---|---|---|
| Initial JS (`index-*.js`) | 210.20 kB gzip | 701.19 kB raw / **216.86 kB gzip** | **+6.66 kB gzip** |
| CSS | 4.64 kB gzip | 22.18 kB raw / 5.01 kB gzip | +0.37 kB gzip |
| Search worker (lazy) | 116.33 kB raw | 116.43 kB raw | unchanged for UI purposes |

Initial JS remains under the 250 kB gzip budget with ~33 kB headroom. The worker chunk is still loaded lazily and is not part of initial JS.

## 8. Changed files

New:

- `apps/web/src/features/search/SearchInput.tsx` (+ `.test.tsx`)
- `apps/web/src/features/search/SearchFilters.tsx` (+ `.test.tsx`)
- `apps/web/src/features/search/SearchStatus.tsx` (+ `.test.tsx`)
- `apps/web/src/features/search/search-shortcuts.ts` (+ `.test.ts`)
- `apps/web/src/hooks/useViewState.navigation.test.ts`
- `apps/web/src/services/search-facets.test.ts`
- `e2e/search-ui.spec.ts`

Modified (UI-004 portion):

- `packages/core/src/view-state.ts` (+ `.test.ts`) — additive `domain`, `unorganized`, `relevance`
- `apps/web/src/services/search.ts` — ViewState sort vocabulary/comparators
- `apps/web/src/services/library.ts` (+ `.test.ts`) — `viewDateBounds`, browse `domain`/`unorganized`
- `apps/web/src/repositories/resources.ts` — `listDomains`
- `apps/web/src/hooks/queries.ts` — search/domain query keys + hooks, `enabled` options, search invalidation
- `apps/web/src/hooks/useViewState.ts` (+ `.test.ts`) — `routeRef` merge, no-op push skip, trash param clearing
- `apps/web/src/components/AppShell.tsx` — header search slot
- `apps/web/src/features/library/ResourceGrid.tsx` — optional search empty hint
- `apps/web/src/App.tsx` — search vs browse routing, index gating, `/` shortcut, sort policy, filters/status/empty wiring
- `docs/PROJECT_PROGRESS.md` — status update

Note: `services/search.ts`, `hooks/queries.ts`, `CollectionsPanel.tsx` and `TagsPanel.tsx` also carry earlier Sprint 6 work (SEARCH-004 sync wiring / SEARCH-005 facets) already reported elsewhere; only the UI-004 deltas above are new here.

## 9. Limitations and deferred work

- **No performance claim.** Query and facet budgets remain unproven/unmet as previously documented (10k query p95 83–98 ms; facets DB-bound at ~1.8–2.9 s). UI-004 changes no indexing/query algorithm, so those measurements are unchanged and are not claimed as met.
- **Manual accessibility checks not run.** Automated semantics (labels, live region, focus-visible, shortcuts) are in place and unit-tested, but a real screen-reader pass and 200% zoom check are M9 (UI-011) scope.
- **Trash search is disabled by design.** The index excludes soft-deleted rows; the input is disabled with a hint rather than returning misleading empty results.
- **Relevance requires a query** and is hidden in browse; browse falls back to `newest`.
- **Indexing progress is media-unverified**; the status line reports whatever the index hook exposes.
- **Pre-existing harness caveat:** the built-worker spec belongs to its own preview config (§7); the default suite will always report it as failing.
- **Silent dead worker** still costs one 15 s request timeout before recovery (SEARCH-008 §9.3); unchanged by UI-004.

## 10. Verdict

**PASS WITH CONDITIONS.** All UI-004 acceptance behavior is implemented and verified by 50 focused unit/contract tests, the 381-test full suite, typecheck/lint/format/build, 4 UI E2E tests, and the built-worker specs. Conditions: the manual screen-reader/zoom pass remains M9-owned, and the measured query/facet budgets remain unmet and are explicitly not claimed by this task.

---

## M9-006 reconciliation (2026-11-14)

**Status update (2026-11-14):** the search interface described here is committed (M9-005, `460b7cf`): `apps/web/src/features/search/*`, the header search input, the facet filters, the status line and the URL-persisted query, plus the four real-browser tests in `e2e/search-ui.spec.ts`. The scope gap recorded in the Sprint 6 closure review - the Cmd/Ctrl+K palette still filters collections and tags only - is unchanged and is not claimed as delivered.
