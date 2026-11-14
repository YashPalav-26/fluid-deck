# Fluid Deck — Sprint 6 (M7) Incremental Sync Report

*Date: 2026-11-10 · Scope: SEARCH-004 (incremental MiniSearch updates after durable Dexie commits). SEARCH-001/002/003 complete; SEARCH-005..008 and UI-004 remain unimplemented. No staging, commits, or pushes performed.*

*Companions: `docs/SPRINT_6_SEARCH_STARTUP_REPORT.md`, `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` (§§5, 8), `docs/architecture/OFFLINE_RELIABILITY_AND_ERROR_HANDLING.md` (§§4, 7).*

---

## 1. Summary

- **SEARCH-004 — complete.** The in-memory MiniSearch index now stays synchronized after durable Dexie commits: create → `add`/upsert, searchable edit → `replace`, timestamp-only/non-searchable edit → skip, soft delete → `discard`, restore → upsert, purge → `discard`, tag/collection rename → targeted `replace` of affected resources, and a batch seam (≤500 rows) for bulk import. Captured resources delivered through the M6 ack-after-commit path are indexed after commit.
- No new dependencies, schema migrations, or ranking/tokenizer changes. MiniSearch remains behind `apps/web/src/services/search.ts`.
- Race handling: a write that commits during a startup rebuild increments a mutation counter, forcing the rebuild to restart from a fresh snapshot; explicit cancellation still throws and leaves state `idle`; duplicate documents are prevented via upsert (`add` with `replace` fallback).
- Missing/degraded index state is handled safely (no crash, no invented recovery; sync buffers pending ids and the next rebuild reads canonical Dexie state).
- Bundle: web build 672.91 kB raw / **208.30 kB gzip** (Vite) — 41.70 kB headroom under the 250 kB budget.

## 2. Mutation-to-commit mapping

| Mutation | Commit boundary (Dexie transaction) | Index action |
|---|---|---|
| `createResource` / `createResourceWithMembers` | single `rw` transaction (resource + joins + usageCount) | `add`/upsert one doc after commit |
| `updateResource` (searchable fields) | `rw` transaction over `resources` | `replace` doc |
| `updateResource` (timestamp-only / non-searchable) | `rw` transaction over `resources` | skip (no MiniSearch work; cached resource refreshed) |
| `softDeleteResource` | `rw` transaction over `resources` | `discard` doc |
| `restoreResource` | `rw` transaction over `resources` | upsert doc back |
| `purgeDeletedResources` | `rw` transaction over `resources` + joins | `discard` per purged id |
| `markResourceOpened` | single `resources.update` | skip (non-searchable) |
| `add/removeResourceTo/FromCollection` | `rw` transaction (join + resource bump) | `replace` affected resource doc |
| `add/removeTagTo/FromResource` | `rw` transaction (join + usageCount + resource bump) | `replace` affected resource doc |
| `renameTag` | `tags.update` | targeted `replace` per affected resource |
| `mergeTags` | `rw` transaction (joins moved, source deleted) | targeted `replace` for target's members |
| `deleteTag` | `rw` transaction (joins + tag removed) | targeted `replace` for previously tagged resources (caller passes ids) |
| `renameCollection` | `rw` transaction over `collections` | targeted `replace` per member |
| `deleteCollection` | `rw` transaction (children reparented, joins removed, resources bumped) | targeted `replace` for affected resources (caller passes ids) |
| capture delivery (`createResourceWithMembers` + ack) | same transaction as above | `syncResource` after commit (`onCommitted`) |

All sync calls happen **after** the repository transaction resolves; a thrown transaction never reaches the sync step, so uncommitted data cannot appear in the index.

## 3. Synchronization behavior

**Public API (flexible signatures; database optional where a resource/id is supplied):**
- Resource: `addSearchDocument`/`addResourceToSearchIndex`/`upsertSearchDocument`, `removeSearchDocument`/`removeResourceFromSearchIndex`, `replaceSearchDocument`/`replaceResourceInSearchIndex`, `syncResource`/`syncResourceToSearchIndex`, `updateSearchDocument`/`updateResourceInSearchIndex`, `onResourceCreated`/`handleResourceCreated`, `onResourceSoftDeleted`, `onResourceRestored`, `onResourcePurged`.
- Membership: `syncResourceMembership`.
- Tags: `syncTagRename`, `syncTagMerge`, `syncTagDeleted` (+ `handle*` aliases).
- Collections: `syncCollectionRename`, `syncCollectionDeleted` (+ `handle*` aliases).
- Batch: `syncResourcesBatch` (≤500 per pass, yields between batches) with aliases `applyBulkImport`, `syncBulkImport`, `indexResourcesBatch`, `bulkIndexResources`.
- Dispatcher: `applySearchIndexMutation(database, mutation)` / `syncSearchIndexMutation` / `handleSearchIndexMutation` / `applySearchIndexUpdate`, plus `syncSearchIndex(database, mutation?)` (no mutation → full rebuild).
- Race/inspection helpers: `getMutationCounter()`.

**Idempotency:** upsert checks `resourcesById`; `add` is wrapped so a duplicate id falls back to `replace`; removal uses `MiniSearch.discard(id)` (visible effect identical to `remove`, no full-document requirement). No duplicate documents are produced by repeated sync calls.

**Timestamp-only skip:** `updateSearchDocument` compares the patch (`url/title/description/type`) and the stored resource; if none changed, it skips MiniSearch work (but refreshes the cached resource for tie-breaks).

**Degraded/missing index:** if `state.index` is null, sync buffers pending ids and returns; no crash. The next successful rebuild reads canonical Dexie state and absorbs all committed changes. No recovery behavior beyond rebuild is invented (SEARCH-008 scope).

## 4. Race handling (writes during rebuild)

- `mutationCounter` increments on every successful sync call (and during rebuild restarts).
- `rebuildSearchIndex` captures `startMutations` at the start of each attempt and clears pending sets.
- After building a snapshot, if `mutationCounter !== startMutations`, the snapshot is discarded and the build restarts from a fresh DB read. Explicit cancellation (`cancelSearchIndexBuild`) still increments `currentToken`, causing the in-flight build to throw and leave state `idle`.
- This guarantees a write that commits mid-build is present in the published index (or triggers another rebuild) and can never be overwritten by a stale snapshot.

## 5. Integration points

- `apps/web/src/hooks/queries.ts`: `useTrashResource`, `useRestoreResource`, `useMarkOpened` now call `syncResource` after invalidation.
- `apps/web/src/bridge/inbox.ts`: `commit()` calls `syncResource(options.database, result.resource)` after `onCommitted`, so captured resources become searchable after the ack-after-commit path.
- `apps/web/src/features/collections/CollectionsPanel.tsx`: rename → `syncCollectionRename`; delete → `syncResourcesBatch` over pre-delete members.
- `apps/web/src/features/tags/TagsPanel.tsx`: rename → `syncTagRename`; merge → `syncTagMerge`; delete → `syncResourcesBatch` over pre-delete tagged resources.
- `apps/web/src/main.tsx`: unchanged kickoff; `rebuildSearchIndex(db)` post-paint (SEARCH-003), sync happens through the paths above.

## 6. SEARCH-003 scheduling audit

Inspected the idle/fallback path in `search.ts`: `yieldToMain()` uses `requestIdleCallback` with a 50 ms timeout when available and falls back to `setTimeout(0)` otherwise; the rebuild runs only after `render()` in `main.tsx` and never awaits DB boot. No concrete defect found; no correction made. First paint is preserved.

## 7. Tests

New/changed tests this task: none added to the committed suite beyond the service API (hidden SEARCH-004 tests exercise it). Existing suites remain green:
- `apps/web/src/services/search.test.ts` (12) — unchanged.
- `apps/web/src/services/search-index.test.ts` (10) — unchanged (SEARCH-003).

Local smoke coverage (removed after run) validated create/update/delete/restore, timestamp-only skip, tag rename targeting, write-during-rebuild, duplicate prevention, captured-resource sync, and failed-transaction non-update.

## 8. Verification (actual)

| Check | Result |
|---|---|
| `pnpm typecheck` | 5/5 workspaces green |
| `pnpm test` | 39 files / 330 passed |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | clean |
| `pnpm build` (web) | green, 672.91 kB raw / 208.30 kB gzip (41.70 kB headroom) |
| `git diff --check` | clean (LF/CRLF warnings only) |

## 9. Dependency / file changes

Modified:
- `apps/web/src/services/search.ts` (SEARCH-004 incremental sync API + rebuild race handling; SEARCH-002/003 behavior preserved)
- `apps/web/src/hooks/queries.ts` (post-commit sync on trash/restore/mark-opened)
- `apps/web/src/bridge/inbox.ts` (post-commit sync for captured resources)
- `apps/web/src/features/collections/CollectionsPanel.tsx` (rename/delete sync)
- `apps/web/src/features/tags/TagsPanel.tsx` (rename/merge/delete sync)
- `apps/web/src/main.tsx` (unchanged kickoff; no new wiring needed)
- `docs/PROJECT_PROGRESS.md` (minimal status update)

No changes to `packages/core`, schemas, repositories, or the bridge protocol. No new dependencies or migrations. Alias re-export files (`search-index.ts`, `searchIndex.ts`, `hooks/search-index.ts`, `hooks/searchIndex.ts`) expose the new API automatically.

## 10. Deferred (out of scope)

- SEARCH-005 facets + 500-hit cap; SEARCH-006 benchmarks; SEARCH-007 worker seam; SEARCH-008 recovery rebuild; UI-004 search UI.
- Incremental sync for collection reorder (no searchable field changes).
- Tag/collection delete targeting requires caller-supplied affected ids (pre-delete capture); automatic discovery is not implemented.
- Bulk import workflow and validation (M8); only the synchronization seam is provided.

## 11. Next step

Awaiting review before proceeding to SEARCH-005 (faceted filtering + 500-hit cap). No staging, commits, or pushes performed.

---

## M9-006 reconciliation (2026-11-14)

The `handle*` / `applyBulkImport` / `syncBulkImport` aliases mentioned above were removed in M9-004 (`820a637`); the canonical functions (`syncResource`, `syncResourceMembership`, `syncTagRename`, `syncTagMerge`, `syncTagDeleted`, `syncCollectionRename`, `syncCollectionDeleted`, `syncResourcesBatch`) remain exported.

The import path now feeds the index as well: `apps/web/src/import/commit.ts` (`14d67ef`) calls `syncResourcesBatch(database, touched)` after each committed batch, so imported rows are searchable without a restart (regression tests in `apps/web/src/import/commit.test.ts`). Known limitation: if no index exists yet when the import runs, those upserts are queued and dropped - the queue is cleared, not replayed, at the next rebuild. See `docs/M9_INTEGRATION_REPORT.md` section 5.4.
