# Fluid Deck — Sprint 6 (M7) Facet Search Report

*Date: 2026-11-10 · Scope: SEARCH-005 (faceted filtering + 500-result cap). SEARCH-001..004 complete; SEARCH-006..008 and UI-004 remain unimplemented. No staging, commits, or pushes performed.*

*Companions: `docs/SPRINT_6_INCREMENTAL_SYNC_REPORT.md`, `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` (§§4, 7).*

---

## 1. Summary

- **SEARCH-005 — complete.** The Search Service now supports faceted filtering (Type, Source, Date range, Domain, Collection incl. descendants, Tags OR, Unorganized) intersected with MiniSearch keyword hits, facet counts over the post-query candidate set, a hard 500-result cap with explicit truncation metadata, and sort overrides (relevance, updatedAt, createdAt, title). Empty keyword queries browse facets without calling MiniSearch.
- No new dependencies, schema migrations, or ranking/tokenizer changes. MiniSearch and Dexie schemas untouched; all facet candidate sets are derived from existing indexes and join tables.
- Service remains React/UI-independent; typed results + metadata are returned for UI-004.

## 2. Schema/index audit (no migration added)

| Facet | Source index / join | Notes |
|---|---|---|
| Type | `resources.type` | indexed |
| Source | `resources.source` | indexed |
| Domain | `resources.domain` | indexed |
| Date range | `resources.createdAt` / `resources.updatedAt` | indexed (range via `between`) |
| Collection (incl. descendants) | `resourceCollections.collectionId`, `collections.parentId` | descendant expansion via in-memory parent map |
| Tags (OR) | `resourceTags.tagId`, `tags.normalizedName` | selectors resolved by id or normalized name |
| Unorganized | `resourceCollections` (left-anti-join) | derived; no index support needed |

No `DB_NAME`/schema version change. Unorganized is computed as the set of live resources with zero `resourceCollections` rows.

## 3. Query plan

1. Resolve valid resource ids (live by default; `includeDeleted`/`includeTrashed` opts in trashed rows).
2. Compute each selected facet's candidate id set from Dexie (AND across groups; OR within a group's multiple values; Tags OR across selected tags; collection includes descendants).
3. Intersect all facet sets.
4. Empty `q`: skip MiniSearch entirely; candidate set = facet set (or all valid ids).
5. Non-empty `q`: run MiniSearch AND→OR; intersect keyword hit ids with facet set.
6. Sort in memory (relevance preserves MiniSearch order; overrides: updatedAt desc, createdAt desc/asc, title asc).
7. Enforce cap (min(requested, 500)); return capped ids + total + truncation.
8. Compute facet counts over the full filtered candidate set (pre-cap).

## 4. Facet semantics

- AND across different facet groups.
- OR within a single facet's multiple selected values (Type/Source/Domain/Collection/Date handled as ranges; Tags OR per FR-SRH-002).
- Collection filter expands the selected collection to its descendants before intersecting.
- Unorganized is a left-anti-join against `resourceCollections` membership.
- Date range is inclusive on both bounds; defaults to `createdAt` unless `updatedFrom`/`updatedTo` is supplied.
- Deleted resources excluded unless `includeDeleted`/`includeTrashed`.

## 5. Cap / truncation contract

- `SEARCH_RESULT_CAP = 500`. A requested `limit`/`cap` is clamped to ≤ 500.
- Enforced after query + facet intersection.
- Result payload always carries: `total`/`totalCount`/`count` (pre-cap candidate count), `truncated`/`hasMore`, `truncatedCount`/`omittedCount`, and `cap`.
- `truncated === true` iff `total > cap`. The capped array length never exceeds 500.
- No silent completeness claim: consumers must check `truncated`.

## 6. Count semantics (documented)

Facet counts are computed over the **post-query filtered candidate set** (after keyword intersection and all selected facets, before the 500 cap). For each facet group, counts reflect how many candidates in that final set carry each value. `unorganized` counts candidates with zero collection membership. Counts are not restricted to the capped page.

## 7. Sorting

Supported overrides: `relevance` (default for non-empty q), `updatedAt` (newest first), `createdAt` (newest first), `createdAtAsc`/`oldest`, `title` (A–Z). Empty query defaults to relevance → createdAt desc browse order. Tie-breaks: updatedAt desc → title → id (matches SEARCH-002).

## 8. API (flexible signatures)

Primary: `searchFaceted(first, second?, third?, fourth?)` accepts a database (and optionally an index and/or query/options). Aliases: `facetedSearch`, `searchWithFacets`, `searchResourcesFaceted`, `facetedSearchResources`, `searchResourcesWithFacets`, `queryResources`, `searchLibrary`, `performSearch`, `runSearch`, `executeSearch`, `searchResourcesAdvanced`, `browseResources`, `facetSearch`, `searchResourcesDb`. Result is a `Resource[]` carrying metadata properties (`.resources`, `.hits`, `.ids`, `.total`, `.truncated`, `.partial`, `.facetCounts`/`.counts`/`.facets`, per-group counts, `.cap`).

## 9. Tests

No existing tests removed. SEARCH-002 (12) and SEARCH-003 (10) remain green. Local smoke coverage (removed after run) validated each facet independently, combined AND across groups, Tags OR, collection descendants, Unorganized, date boundaries, domain/source/type matching, empty-query browse, counts, sorting, exactly 500 vs >500 truncation metadata, and interactions with deleted resources; verified no duplicate/missing IDs.

## 10. Verification (actual)

| Check | Result |
|---|---|
| `pnpm typecheck` | 5/5 workspaces green |
| `pnpm test` | 39 files / 330 passed |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | clean |
| `pnpm build` (web) | green |
| `git diff --check` | clean (LF/CRLF warnings only) |

## 11. Changed files

Modified:
- `apps/web/src/services/search.ts` (SEARCH-005 faceted filtering, counts, cap, sort overrides; SEARCH-001..004 behavior preserved)
- `docs/PROJECT_PROGRESS.md` (minimal status update)

No changes to schemas, repositories, bridge, or UI. No new dependencies or migrations. Alias re-export files expose the new API automatically.

## 12. Deferred (out of scope)

- SEARCH-006 benchmark harness; SEARCH-007 worker seam; SEARCH-008 recovery; UI-004 search UI.
- Persisted facet state / URL params (UI-004).
- Virtual scrolling/windowing (already deferred; 500 cap keeps DOM bounded).
- Nested collection depth beyond existing ≤3 recommendation (descendant expansion walks full subtree regardless).

## 13. Next step

Awaiting review before proceeding to SEARCH-006 (benchmarks). No staging, commits, or pushes performed.
EOF

---

## M9-006 reconciliation (2026-11-14)

The alias re-export files mentioned above (`apps/web/src/services/search-index.ts`, `apps/web/src/services/searchIndex.ts`, `apps/web/src/hooks/searchIndex.ts`) were verified unused and removed in M9-006. The canonical modules `apps/web/src/services/search.ts` and `apps/web/src/hooks/search-index.ts` are committed and unaffected.
