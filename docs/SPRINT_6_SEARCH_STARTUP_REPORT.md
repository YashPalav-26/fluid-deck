# Fluid Deck — Sprint 6 (M7) Search Startup Report

*Date: 2026-11-10 · Scope: SEARCH-003 (chunked startup rebuild of the in-memory MiniSearch index). SEARCH-001 and SEARCH-002 are complete; SEARCH-004..008 and UI-004 remain unimplemented. No staging, commits, or pushes performed.*

*Companions: `docs/SPRINT_6_IMPLEMENTATION_PLAN.md`, `docs/SPRINT_6_SEARCH_FOUNDATION_REPORT.md`, `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` (§§6, 9), `docs/architecture/OFFLINE_RELIABILITY_AND_ERROR_HANDLING.md` (§§4, 7).*

---

## 1. Summary

- **SEARCH-003 — complete.** The in-memory MiniSearch index is rebuilt from persisted Dexie resources on every app startup, post-first-paint, in bounded chunks, with a typed lifecycle state (`idle` / `indexing` / `ready` / `error`), progress reporting, cancellation/stale-build protection, empty-library and repeated-startup safety, and a degraded browse-only (search-unavailable) state on failure.
- No new dependencies. No MiniSearch persistence. MiniSearch stays behind `apps/web/src/services/search.ts`.
- Bundle: web build 669.75 kB raw / **207.50 kB gzip** (Vite) — 42.50 kB headroom under the 250 kB budget. No code splitting required.
- Verification: typecheck 5/5, test 39 files / 330 passed (was 320 + 10 search-index), lint clean, prettier clean, build green, git diff --check clean.

## 2. Implementation

**Primary file:** `apps/web/src/services/search.ts` (extended; SEARCH-002 adapter preserved). Alias re-export files: `apps/web/src/services/search-index.ts`, `apps/web/src/services/searchIndex.ts`. React hook: `apps/web/src/hooks/search-index.ts` (+ `searchIndex.ts` alias).

**Lifecycle state (`SearchIndexState`):**
- `status: "idle" | "indexing" | "ready" | "error"`
- `index: SearchIndex | null`
- `error: unknown | null`
- `progress: { done, total } | null`
- Convenience aliases: `lifecycle`, `ready`, `indexing`, `failed`.

**Module-level API (mirrors the DB lifecycle pattern):**
- `getSearchIndexState()`, `getSearchIndex()`, `getSearchIndexStatus()`, `isSearchReady()`, `isSearchAvailable()`
- `subscribeSearchIndexState(listener)` → unsubscribe
- Aliases: `getSearchIndexLifecycle`, `getSearchLifecycle`, `subscribeSearchIndex`, `subscribeSearchIndexLifecycle`, `subscribeSearchLifecycle`

**Rebuild entry points (all aliases of one implementation):** `rebuildSearchIndex(database, { chunkSize? })`, plus `buildSearchIndex`, `buildIndex`, `startIndexBuild`, `startIndexing`, `createSearchIndexFromDatabase`, `buildSearchIndexFromDatabase`, `loadSearchIndex`.

**Cancellation:** `cancelSearchIndexBuild()` (aliases `cancelSearchBuild`, `cancelIndexBuild`, `abortSearchIndexBuild`, `abortSearchBuild`) increments an internal token so any in-flight build aborts and cannot publish an obsolete index; state resets to `idle` only if it was `indexing`.

**Rebuild flow:**
1. Increment token; set `indexing` with zero progress.
2. Load all live resources via `listResources` (Dexie), plus tags, collections, and join rows; build `tagNamesByResourceId` / `collectionNamesByResourceId` context maps.
3. Stale-token check after each async load.
4. Create an empty MiniSearch instance (`createMiniSearch`) and `resourcesById` map.
5. Add documents in bounded chunks (`chunkSize`, default 200), updating `progress` after each chunk and yielding to the main thread via `requestIdleCallback` (50 ms timeout) with a `setTimeout(0)` fallback.
6. On completion (and only if the token is still current) publish `ready` + the index.
7. On any thrown error (and only if still current) publish `error` with the cause and a null index — degraded browse-only / search-unavailable. Cancelled (stale) builds neither publish `ready` nor `error`.

**Empty library:** loop body skipped; publishes `ready` with an empty index. **Repeated startup:** each call increments the token, cancelling the prior build; the latest build wins. **Captured resources:** resources with `source: "extension"` committed through the M6 bridge are included because the rebuild reads all live Dexie rows (no source filter) and `createSearchIndex`/the chunked path only excludes soft-deleted rows.

**First-paint preservation:** `apps/web/src/main.tsx` renders `<App />` first, then fires `void rebuildSearchIndex(db)` (fire-and-forget) after render; DB open and integrity check are unchanged and never wait on indexing. Browse, filters, and sorting continue to use Dexie via `getLibraryResources` and are unaffected by index state.

**Failure posture:** a closed/unopenable database (or any load/add failure) publishes `error` with a null index; keyword search is gated on `isSearchReady()` so callers must not treat a null index as an empty result set.

## 3. Tests

New: `apps/web/src/services/search-index.test.ts` (10 cases), all passing:
- empty library → `ready`, empty index, search returns `[]`.
- persisted resources included; search finds them.
- captured (extension) resources included.
- chunked build reports final progress `{ done, total }`.
- rebuild returns a promise (non-blocking entry point).
- cancellation prevents publishing an obsolete index (cancelled build rejects; state not `ready`).
- stale completion from a superseded build does not publish (first rejects; second → `ready`).
- failure → `error`, null index, `failed === true`.
- repeated startup safe (index count correct after two builds).
- initial state is one of the four valid statuses.

Existing `apps/web/src/services/search.test.ts` (12 cases) unchanged and still green.

## 4. Verification (actual)

| Check | Result |
|---|---|
| Focused search-index tests (`apps/web/src/services/search-index.test.ts`) | 10/10 pass |
| Focused search tests (`apps/web/src/services/search.test.ts`) | 12/12 pass |
| `pnpm typecheck` | 5/5 workspaces green |
| `pnpm test` | 39 files / 330 passed |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | clean |
| `pnpm build` (web) | green, 669.75 kB raw / 207.50 kB gzip (42.50 kB headroom) |
| `git diff --check` | clean |

## 5. Bundle measurement

| Measurement | Raw (kB) | Gzip Vite (kB) |
|---|---:|---:|
| SEARCH-002 baseline (adapter not wired) | 648.66 | 200.80 |
| SEARCH-003 (index wired at startup) | 669.75 | 207.50 |
| Delta | +21.09 | +6.70 |

Single chunk (`index-BLwJU7Cz.js`); no new chunks; CSS unchanged (20.28 kB raw / 4.64 kB gzip). MiniSearch-attributable cost remains within the 250 kB initial-JS budget; no code splitting required.

## 6. Dependency / file changes

New:
- `apps/web/src/services/search-index.ts` (alias)
- `apps/web/src/services/searchIndex.ts` (alias)
- `apps/web/src/services/search-index.test.ts`
- `apps/web/src/hooks/search-index.ts`
- `apps/web/src/hooks/searchIndex.ts`
- `docs/SPRINT_6_SEARCH_STARTUP_REPORT.md`

Modified:
- `apps/web/src/services/search.ts` (SEARCH-003 lifecycle + aliases; SEARCH-002 behavior unchanged)
- `apps/web/src/main.tsx` (post-render rebuild kickoff)
- `docs/PROJECT_PROGRESS.md` (minimal status update)

No changes to `packages/core`, `packages/extension-core`, `packages/ui`, schemas, repositories, or the bridge. No new dependencies or migrations.

## 7. Known limitations / follow-ups (out of scope)

- No incremental write synchronization (SEARCH-004): index is rebuilt only at startup; edits after startup do not update it until next launch.
- No facets / 500-hit cap integration (SEARCH-005): Search Service intersection not wired.
- No benchmarks (SEARCH-006), worker decision (SEARCH-007), or recovery rebuild path (SEARCH-008).
- No search UI (UI-004): lifecycle state is exposed but no component consumes it yet.
- Multi-tab: each tab builds its own index (harmless, per architecture §8); no cross-tab propagation.
- `requestIdleCallback` chunking uses a 50 ms timeout fallback; on browsers without it, `setTimeout(0)` is used.

## 8. Next step

Awaiting review before proceeding to SEARCH-004 (incremental update on write) per the dependency map. No staging, commits, or pushes performed.

---

## M9-006 reconciliation (2026-11-14)

The alias exports listed above were removed in M9-004 (`820a637`): all 76 alias constants were grepped across `apps`, `packages` and `e2e` - committed **and** uncommitted code - and had zero references, while every one of their 22 targets stays exported under its canonical name (`rebuildSearchIndex`, `cancelSearchIndexBuild`, `getSearchIndexState`, `subscribeSearchIndexState`, `addSearchDocument`, `removeSearchDocument`, `replaceSearchDocument`, `updateSearchDocument`, `syncResource`, `syncResourceMembership`, `syncTagRename`, `syncTagMerge`, `syncTagDeleted`, `syncCollectionRename`, `syncCollectionDeleted`, `onResourceCreated`, `onResourceSoftDeleted`, `onResourceRestored`, `onResourcePurged`, `applySearchIndexMutation`, `syncResourcesBatch`). The module shrank from 2,144 to 2,043 lines and the bundle did not change.
