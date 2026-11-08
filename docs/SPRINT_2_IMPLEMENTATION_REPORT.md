# Fluid Deck — Sprint 2 Implementation Report

*Date: 2026-11-08 · Scope: Phase 4 Sprint 2 (M3 — core domain + database foundation) · Sprint 3 NOT started.*
*Status: **COMPLETE for the authorized scope** — 10 tasks: 8 complete, 2 complete with a documented caveat (DB-004 boot wiring, DB-006 manual 2-tab test); DB-005's backup-restore leg belongs to IMPORT-*. No Sprint 3 work performed.*
*Closure audit (2026-11-08): `docs/SPRINT_2_CLOSURE_REVIEW.md` — verified independently, recommended for closure, no defects found. One low-severity observation recorded there (collection delete bumps `updatedAt`).*

---

## 1. Sprint objectives

Implement the canonical local persistence foundation: shared domain types, Zod validation, the seven-store Dexie v1 database, repositories with transaction boundaries, canonicalization, ordering, soft delete/restore, integrity checking, and tests — without building product UI.

## 2. Task selection gate and reported discrepancies

Source: `docs/PHASE_3_TASK_BREAKDOWN.md` (M3) and `docs/PHASE_4_EXECUTION_ROADMAP.md`.

| Task | Assigned milestone | In this sprint |
|---|---|---|
| CORE-001, CORE-002 | M3 | Yes |
| DB-001 … DB-008 | M3 | Yes |
| UI-001, UI-002, UI-003 | M4 | **No** — the roadmap lists UI-001–003 under "Sprint 2", the breakdown marks them M4, and the Sprint 2 brief scopes this sprint to domain + database. Deferred, not dropped. |

**Discrepancies found and reported before/with implementation (none silently resolved):**

1. **Roadmap vs breakdown** — roadmap Sprint 2 includes the app shell/grid/TanStack work (UI-001–003). Implemented M3 only, as instructed.
2. **Resource-type enum drift** — Sprint 1 `core` shipped `article|video|image|audio|document|tool|social|other`. PRD FR-CAP-004 and Phase 2.2 §2.1 both specify `article|video|github|npm|pdf|design|tool|other`. Corrected to the approved enum (CORE-001/002).
3. **Invalid Dexie schema syntax in Phase 2.2 §3.1** — the doc writes `canonicalUrl!` / `normalizedName!` and `type+createdAt` / `source+createdAt`. Dexie's unique marker is `&`, and compound indexes require brackets. With the doc's strings the v1 upgrade aborts (`SyntaxError`, mapped to a misleading VersionError). Corrected to `&canonicalUrl`, `&normalizedName`, `[type+createdAt]`, `[source+createdAt]` — same intent, valid syntax.
4. **U4 exception-list contents** — approved as a mechanism, never specified as a host list. Implemented the mechanism with an empty default list (see §13).
5. **Repository folder name** — `SYSTEM_ARCHITECTURE` §3 says `src/persistence/`, `FRONTEND_ARCHITECTURE` §2 says `src/repositories/`. Used both: persistence (db/integrity/quarantine) + repositories (data access).

## 3. Task results

| ID | Status | Evidence |
|---|---|---|
| CORE-001 | ✅ Complete | `packages/core/src/{constants,schemas}.ts`; imports only Zod |
| CORE-002 | ✅ Complete | 39 core tests incl. invalid-fixture rejection |
| DB-001 | ✅ Complete | `SCHEMA_V1` snapshot test + 7-store/index/unique assertions |
| DB-002 | ✅ Complete | 6 repository modules; 38 repository tests |
| DB-003 | ✅ Complete | Unique indexes + duplicate paths tested at DB and repository level |
| DB-004 | ✅ Complete (caveat) | v1→v2 additive upgrade test + `checkIntegrity`; boot wiring lands with UI-001 |
| DB-005 | ⚠️ Partial | Quarantine + guarded full delete done/tested; "backup restore" deferred to IMPORT-006/007/008 (M8) — no export format exists yet |
| DB-006 | ✅ Complete (caveat) | `blocked`/`versionchange` handling tested at handler level; manual 2-tab check not performed |
| DB-007 | ✅ Complete (caveat) | Canonicalization + U4 mechanism; default host list empty (§13) |
| DB-008 | ✅ Complete | Preference model/defaults + ViewState URL codec round-trip |

## 4. Domain models implemented

`packages/core` (no React, no Dexie, no `chrome.*`):

| File | Contents |
|---|---|
| `constants.ts` | `APP_NAME`, `DB_NAME = "fluid-deck"`, `SCHEMA_VERSION = 1`, approved enums, limits, `COLLECTION_WARNING_DEPTH = 4`, `DEFAULT_PURGE_RETENTION_DAYS = 30` |
| `schemas.ts` | `resourceSchema`/`resourceInputSchema`/`resourcePatchSchema`, `collectionSchema` (+input/patch), `tagSchema`, `resourceCollectionSchema`, `resourceTagSchema`, `savedSearchSchema` (+input), `preferenceSchema`; types inferred from schemas (`z.input` for write inputs) |
| `url.ts` | `canonicalizeUrl`, `extractDomain`, `HASH_ROUTE_EXCEPTION_HOSTS`, `UrlNormalizationError` |
| `ordering.ts` | `orderBetween`, `needsResequence`, `resequence`, `compareOrder`, `collectionDepth`, `isDepthWarning` |
| `view-state.ts` | `viewStateSchema`, `encodeViewState`, `decodeViewState`, sort/date enums |
| `preferences.ts` | approved preference keys + defaults |
| `index.ts` | re-export surface only |

**Resource fields** (Phase 2.2 §2.1, no speculative additions): `id, url, canonicalUrl, title, description, thumbnailUrl, faviconUrl, domain, type, source, notes, extractionStatus, extractionNotes, createdAt, updatedAt, lastOpenedAt, deletedAt`.

## 5. Seven-store schema (as implemented)

```
resources:           id, &canonicalUrl, type, source, domain, [deletedAt+createdAt], createdAt,
                     updatedAt, lastOpenedAt, [type+createdAt], [source+createdAt]
collections:         id, parentId, [parentId+orderIndex], name
tags:                id, &normalizedName, [usageCount+name]
resourceCollections: [resourceId+collectionId], resourceId, collectionId
resourceTags:        [resourceId+tagId], resourceId, tagId
savedSearches:       id, name
preferences:         key
```

- Only two DB-enforced uniques (`canonicalUrl`, `normalizedName`); join tables dedupe via compound primary keys.
- `collections` and `tags` have **no** `deletedAt` — the approved schema gives soft delete to resources only; deleting a collection is non-destructive to resources but hard-deletes the collection row.
- `preferences` is key-value (`key`, `value: string`); approved keys and defaults live in `core/preferences.ts`.

## 6. Migration behavior

- One version (`v1`) registered in `FluidDeckDatabase`; `SCHEMA_V1` is the single source of store definitions.
- DB-004 test: a v2 subclass adds an index to `resources` (`title`), reopens the v1 file → `verno === 2`, row counts preserved, the new index query works, post-upgrade writes succeed.
- Reopening at v1 without a schema change preserves committed rows (tested).
- `versionchange` closes the connection so another tab's upgrade can commit (DB-006).
- No `upgrade()` data transforms exist yet — only additive index changes were needed.

## 7. Repository operations

| Module | Operations |
|---|---|
| `repositories/resources.ts` | create (canonicalize + derive + dedup), create-with-members (one transaction), get by id/canonicalUrl, list live (createdAt index), list trash (`[deletedAt+createdAt]`), update (URL edit re-canonicalizes with conflict check), soft delete (idempotent), restore (lossless), `markResourceOpened`, explicit guarded `purgeDeletedResources` |
| `repositories/collections.ts` | create (sibling order + depth), rename, reparent (self/cycle checks), reorder (fractional + resequence), delete (children reassigned, joins removed, resources bumped), list/tree reads, `getCollectionDepth` |
| `repositories/tags.ts` | create (get-or-create), ensureTags, rename (normalized uniqueness), merge (move joins, skip conflicts, recompute count), delete, list ranked, explicit `recomputeTagUsageCounts` |
| `repositories/relationships.ts` | add/remove resource↔collection, add/remove resource↔tag (usageCount in the same transaction), membership listings (deleted filtered by default), reference validation |
| `repositories/preferences.ts` | get (default fallback), set, getAll merged |
| `repositories/saved-searches.ts` | create, list, delete (store ships; surfacing is S5) |
| `repositories/errors.ts` | `RepositoryError` with codes `VALIDATION / NOT_FOUND / INVALID_REFERENCE / CONSTRAINT / CYCLE`, `parseOrThrow`, `parsePersisted` (quarantine on read) |

Repositories take the database instance as their first argument (explicit seam for isolated test databases); the canonical singleton is `db` in `apps/web/src/persistence/db.ts`. No repository imports React or the UI.

## 8. Transaction strategy

One Dexie transaction per logical mutation, covering every store it touches:

- resource + join rows + tag `usageCount` + `updatedAt` (`createResourceWithMembers`);
- join row + both parents + `usageCount`;
- collection delete: children reassignment + join removal + affected resources' `updatedAt`;
- tag merge/delete: joins + tag row;
- purge: resource rows + both join tables.

Verified rollback: creating a resource with an unknown collection throws `INVALID_REFERENCE` and leaves **zero** resource rows, zero join rows, and no canonical-URL residue.

## 9. Validation rules

- All write inputs pass through Zod before persistence; persisted rows are re-validated on read (corruption → quarantine, never a crash).
- IDs are UUIDs; timestamps are non-negative integers; `updatedAt >= createdAt` enforced on resources/collections.
- URLs must be absolute `http(s)` (`javascript:`, `data:`, `file:`, `blob:`, relative rejected); thumbnail/favicon accept `""` or an http(s) URL.
- Resource `type` limited to the approved 8 values; `source` to `extension|import|share|other`; `extractionStatus` to `complete|partial|failed`.
- Collection names: trimmed, 1–200 chars; sibling-scoped, case-insensitive uniqueness (DB-003).
- Tag names: free-form, trimmed, internal whitespace collapsed, 1–200 chars; identity = NFC + lowercase; display casing preserved (U6).
- Saved search `filterStateJson` must parse as JSON.
- Unknown fields are rejected on write (`strictObject`) but tolerated on read (forward-compatible persisted rows).

## 10. Test results (actual)

`pnpm test` → **14 files, 100 tests, all passing**.

| Suite | Tests |
|---|---|
| `packages/core` (schemas, URL, ordering, view-state, surface) | 39 |
| `packages/extension-core` (Sprint 1 protocol tests, unchanged) | 4 |
| `apps/web` persistence (schema/uniques/guards, integrity, migration) | 17 |
| `apps/web` repositories (resources 10, collections 9, tags 9, relationships 6, preferences/saved-searches 6) | 40 |

Coverage of the required cases: resource validation, duplicate canonical URL (incl. concurrent double-capture), invalid schemes, soft delete/restore, purge window + guard; collection parent validation, self-parent, cycles, four-level warning (five levels still allowed), fractional reorder + resequence, non-destructive delete; tag free-form names, normalized uniqueness, rename conflict, merge; compound-key duplicate prevention, invalid references, membership removal leaving parents intact; transaction rollback; migration v1→v2; seven stores/indexes/uniques; integrity report + quarantine without deletion.

## 11. Commands executed (actual output summarised)

| Command | Result |
|---|---|
| `pnpm --filter @fluid-deck/web add dexie` | dexie `^4.4.7` added |
| `pnpm --filter @fluid-deck/web add -D fake-indexeddb` | fake-indexeddb `^6.2.7` added |
| `pnpm --filter @fluid-deck/web add zod` | zod `^4.6.7` (direct dep; types were otherwise unresolved) |
| `pnpm typecheck` | 5/5 workspaces `Done` |
| `pnpm test` | 14 files / 100 tests passed |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | all matched files compliant |
| `pnpm build` | web `index-*.js` 343.86 kB (104.79 kB gzip), CSS 9.84 kB (2.70 kB gzip); extension chrome-mv3 194.91 kB, firefox-mv3 195.03 kB |
| `pnpm test:e2e` | 1/1 passed (`web shell renders`) |

## 12. Dependencies added or changed

- `apps/web` dependencies: `dexie@^4.4.7`, `zod@^4.6.7`; devDependency `fake-indexeddb@^6.2.7`.
- No other dependency changes; no Dexie plugin, no test framework, no `any`/suppressions.
- `vitest.config.ts` now also includes `apps/web/src/**/*.test.ts` (node environment).

## 13. Architecture deviations and decisions recorded

1. Repositories take an explicit database argument instead of importing the singleton — needed for isolated `fake-indexeddb` tests; no extra abstraction layer.
2. Business rules (cycle checks, ordering, dedup, usage counts) live in repositories for this sprint. The documented `services/` layer arrives with UI-001 and will thin-wrap these; no UI code contains rules.
3. Join repositories share one module (`relationships.ts`) rather than one file per join store.
4. Quarantine is a **read-time exclusion list in session memory** (`persistence/quarantine.ts`) because no approved store exists for it. Invalid rows are never rewritten or deleted.
5. Purge is explicit-only (`confirm: true` + retention window); the boot-time purge sweep from Phase 2.2 §4 is **not** wired, per the Sprint 2 rule that ordinary operations must not irreversibly delete.
6. `deletedAt` filtering relies on the compound index: IndexedDB does not index `null`, so live rows are absent from `[deletedAt+createdAt]` and trash queries use a numeric range.
7. Top-level collection siblings are found with a filter (IndexedDB cannot index `null` `parentId`); nested siblings use the `parentId` index.
8. U4: `canonicalizeUrl(url, { hashRouteExceptionHosts })` preserves fragments for listed hosts (exact or subdomain). The shipped default list is **empty** because no host list was ever approved; the data model keeps the original `url` regardless.
9. Preferences are stored as strings with an open key set (approved defaults in `core`); no enum validation on keys so prefs can grow without a migration.
10. Zod was added as a direct `apps/web` dependency rather than relying on workspace hoisting.

## 14. Known limitations

- **No real-browser IndexedDB validation.** All database/repository tests run on `fake-indexeddb` 6.2.7. Sprint 1's Playwright smoke test does not exercise Dexie. Real-browser verification (quota, upgrade under two real tabs) is outstanding.
- **DB-006 manual two-tab test not performed**; only the handler behavior (`versionchange` closes, `blocked` surfaces a message) is tested.
- **No boot wiring.** Nothing in `main.tsx` calls `openDatabase()` or `checkIntegrity()` — the app shell arrives with UI-001. `main.tsx` is untouched this sprint.
- **DB-005 backup restore not implemented** (belongs to IMPORT-*); quarantine has no UI/export affordance yet.
- **U4 host list empty**; hash-routed SPAs (`app.com/#/doc/1` vs `#/doc/2`) still merge as documented false positives.
- Resource type detection, capture, search indexing, tags/collections UI, and saved-search surfacing are outside this sprint.
- `usageCount` drift is only repaired by an explicit call (integrity check reports it).
- Collections have no soft delete (schema decision), so a deleted collection cannot be restored.
- Version 2 exists only inside the migration test; no production migration is registered yet.

## 15. Remaining Sprint 2 tasks and Sprint 3 readiness

**Remaining M4 work from the roadmap's Sprint 2 block (not authorized here):** UI-001 (shell + URL-param routing), UI-002 (resource grid/cards), UI-003 (TanStack queries + 4 Contexts).

**Sprint 3 readiness:** the M3 foundation is usable — capture (EXT) needs `createResourceWithMembers`, dedup and canonicalization are in place; organization (UI-005–010) needs the collection/tag repositories, which are complete. Before Sprint 3 the following seams are recommended: wire `openDatabase()` + `checkIntegrity()` at boot, wrap repositories in the services layer, and run one real-browser IndexedDB check.

**Sprint 2 verdict: complete for the authorized M3 scope, with the two caveats above. Sprint 3 not started and not authorized.**
