# Fluid Deck — Sprint 2 Closure Review (M3)

*Date: 2026-11-08 · Auditor role: senior database engineer · Scope: verification + documentation only.*
*Method: read the planning docs, then verified every claim against the implementation and by re-running the test suite, typecheck, lint, formatter and build. No code, schema, dependency or architecture changes were made. No Sprint 3 work was started.*

**Verdict: RECOMMEND CLOSURE of Sprint 2 (M3) — no blocking defects found.**

---

## 1. Task status

| ID | Task | Status | Evidence |
|---|---|---|---|
| CORE-001 | Domain types in `packages/core` | ✅ Complete | `constants.ts`, `schemas.ts`; core imports nothing but Zod |
| CORE-002 | Zod schemas (entities + prefs + ViewState) | ✅ Complete | `schemas.test.ts` 12 tests incl. invalid fixtures rejected |
| DB-001 | Dexie v1, 7 stores, approved schema | ✅ Complete with documented syntax corrections (§4) | `db.test.ts` 11 tests: version, store names, tables, schema snapshot, uniques, lifecycle |
| DB-002 | Repositories (resources, collections, tags, joins) | ✅ Complete | 40 repository tests across 5 files |
| DB-003 | Unique `canonicalUrl` + tag/collection name enforcement | ✅ Complete | Unique index test at DB level; duplicate capture, rename conflict, sibling-name conflict at repository level |
| DB-004 | v1→v2 additive migration + boot integrity check | ⚠️ Complete except boot wiring | `migration.test.ts` genuinely upgrades a v1 database (§3); `checkIntegrity` implemented and tested but not called at startup |
| DB-005 | Quarantine + guarded full delete + backup restore | ⚠️ Partial — restore deferred (§6) | `integrity.test.ts` (quarantine, no deletion); `resetDatabase` guard test; no backup/restore path exists |
| DB-006 | Multi-tab blocked-upgrade handling | ⚠️ Handler-level only | `db.test.ts` fires `blocked`/`versionchange` and asserts lifecycle + close; manual two-tab test outstanding (§7) |
| DB-007 | Canonicalization + U4 SPA exception list | ⚠️ Mechanism complete, configuration unresolved | `url.test.ts` 11 tests (incl. an explicit exception-host case); shipped list is `[]` (§6, U4) |
| DB-008 | Preferences store + ViewState URL codec | ✅ Complete | `preferences.test.ts` 6 tests; `view-state.test.ts` 5 round-trip tests |

## 2. Verification method and evidence

Re-run during this audit (all from repo root, Node 26.13.0 / pnpm 11.13.0):

| Command | Result |
|---|---|
| `pnpm test` | **14 files, 100 tests passed** — core 39 (11 url, 8 ordering, 12 schemas, 5 view-state, 3 surface), extension-core 4, persistence 17 (11 db, 4 integrity, 2 migration), repositories 40 (10 resources, 9 collections, 9 tags, 6 relationships, 6 preferences) |
| `pnpm typecheck` | `packages/extension-core`, `apps/web`, `apps/extension` → Done (5/5 workspace tasks) |
| `pnpm lint` | `eslint .` — clean, no output |
| `pnpm exec prettier --check .` | All matched files use Prettier code style |
| `pnpm build` | web `index-BXd5b2bj.js` 343.86 kB (104.79 kB gzip), `index-tIml3lO6.css` 9.84 kB (2.70 kB gzip); extension 194.91 kB (chromium-mv3) / 195.03 kB (firefox-mv3) |

The figures in `SPRINT_2_IMPLEMENTATION_REPORT.md` are accurate and unchanged.

## 3. DB-004 migration verification — genuine v1 fixture, real upgrade

`apps/web/src/persistence/migration.test.ts` does not simulate an upgrade:

1. Opens a real `FluidDeckDatabase` (v1) under a unique database name, asserts `verno === 1`, writes one resource and one collection, closes.
2. Constructs a subclass that registers `version(2).stores({ ...SCHEMA_V1, resources: "+ title" })`, reopens **the same database name**, and asserts `verno === 2`, both row counts survive, the new `title` index answers a query, and a post-upgrade insert succeeds.
3. Second test reopens at the same version with no migration and confirms data and version are untouched.

This is a genuine version-1 file upgraded by Dexie's own upgrade transaction. It does not exercise a `.upgrade()` data transform (none exists — the change is additive), so that path remains untested by design. Runs on fake-indexeddb (§8 caveat).

## 4. Seven stores and indexes vs the approved schema

| Store | Approved (Phase 2.2 §2 / §3.1) | Implemented (`SCHEMA_V1`) | Delta |
|---|---|---|---|
| `resources` | `id`, `canonicalUrl` unique, `type`, `source`, `domain`, `[deletedAt+createdAt]`, `createdAt`, `updatedAt`, `lastOpenedAt`, `type+createdAt`, `source+createdAt` (§2.1 index list) | `id, &canonicalUrl, type, source, domain, [deletedAt+createdAt], createdAt, updatedAt, lastOpenedAt, [type+createdAt], [source+createdAt]` | Syntax only: `&` for unique; brackets for the two compound indexes listed unbracketed in the doc |
| `collections` | `id`, `parentId`, `[parentId+orderIndex]`, `name` | identical | None |
| `tags` | `id`, `normalizedName` unique, `[usageCount+name]` | `id, &normalizedName, [usageCount+name]` | Syntax only |
| `resourceCollections` | `[resourceId+collectionId]` PK, `resourceId`, `collectionId` | identical | None |
| `resourceTags` | `[resourceId+tagId]` PK, `resourceId`, `tagId` | identical | None |
| `savedSearches` | `id`, `name` | identical | None |
| `preferences` | `key` | identical | None |

Store set, primary keys and both unique indexes match the approved design. The implemented field set per store matches Phase 2.2 §2.1–§2.7 (verified in `packages/core/src/schemas.ts`; the earlier Sprint 1 resource-type enum drift was corrected to the PRD's `article|video|github|npm|pdf|design|tool|other`).

**Schema-syntax corrections (already documented, re-verified):** `canonicalUrl!` / `normalizedName!` are not Dexie unique markers (`&` is), and `type+createdAt` / `source+createdAt` are not valid compound indexes without brackets. With the doc's literal strings the v1 open fails. Intent is preserved; no field or index was dropped.

## 5. Roadmap ↔ task-breakdown reconciliation (UI-001–003)

| Source | Position |
|---|---|
| `PHASE_4_EXECUTION_ROADMAP.md` §Sprint 2 | "Core (M3–M4)" — includes "app shell + grid + TanStack (UI-001–003)" |
| `PHASE_3_TASK_BREAKDOWN.md` | UI-001, UI-002, UI-003 are milestone **M4**; DB-008 is the last M3 task |
| Sprint 2 authorization | M3 domain + database only |

**Resolution:** the roadmap's Sprint 2 block spans two milestones; this sprint delivered M3. UI-001–003 are **deferred to M4**, not cancelled and not partially built — no UI, routing, TanStack or context code exists (verified: `apps/web/src/main.tsx` is unchanged and imports nothing from `persistence/`). The roadmap does not need editing for correctness; the task breakdown's M-column remains the authoritative mapping.

## 6. Deferred work

| Item | Deferred to | Why |
|---|---|---|
| DB-005 "backup restore" (restore from JSON export) | IMPORT-006 (export JSON), IMPORT-007 (round-trip formats), IMPORT-008 (round-trip e2e), M8 | Restore has no format until the export/import workstream exists; building it now would invent a format |
| Boot integrity check + purge sweep wiring | UI-001 / app bootstrap | No application bootstrap exists yet; nothing opens the database at runtime |
| U4 hash-route exception host list contents | Product decision (owner: user) | No host list was ever approved; mechanism exists and defaults to `[]`. No exceptions were invented |
| Real two-tab verification (DB-006) | Manual check, M9 hardening | Requires two real browser tabs; not automatable here |
| Real-browser IndexedDB validation | M9 / first UI milestone | Tests run on fake-indexeddb |
| Services layer (`services/`) | UI-001 | Repositories currently hold the business rules |

## 7. Outstanding manual checks

1. **DB-006 two-tab upgrade:** open two tabs on the app, trigger a version bump in one, confirm the second tab closes its connection and shows the reload message, and that no upgrade hangs in `blocked`. Not performed — handler-level behaviour only.
2. **Real-browser IndexedDB run:** open the built app in Chromium and Firefox, confirm `fluid-deck` v1 is created with the seven stores, and that a write/quota failure surfaces `DatabaseInitializationError` rather than a raw IDB error. Not performed.
3. **Sprint 1 carry-over:** one Firefox click on the toolbar icon to confirm the popup shows `Ready — fluiddeck.capture v1` (background was verified earlier).

## 8. Known limitation with the largest audit weight

All database and repository evidence (17 persistence tests, 40 repository tests, the migration test) runs on **fake-indexeddb 6.2.7**, an in-memory spec implementation. It validates schema strings, index behaviour, compound keys, uniqueness and transaction rollback logic, but it does **not** establish real-browser validation: Chrome/Firefox storage backends, quota behaviour, per-profile isolation, upgrade under two live tabs, or durable multi-tab event timing. The closure recommendation accepts this gap because the implementation milestone is data-layer-only; it must be closed before any data is trusted by real users (M4 boot wiring + M9 hardening).

## 9. Observations (low severity, no action taken)

1. **`deleteCollection` bumps `updatedAt` on affected resources.** Phase 2.2 §4 says "Resources themselves untouched". No resource row loses data, membership is removed (→ Unorganized) and child collections move to the deleted parent's parent — both FR-ORG-005 compliant — but the timestamp bump means a delete can reorder a "last modified" sort. Documented, not fixed (no code changes authorized).
2. **Two compound indexes not literally in §3.1's code block** (`[type+createdAt]`, `[source+createdAt]`) are present because §2.1 requires them for type/source recency queries. They are additive and unused by any current query.
3. **Quarantine is in-memory** rather than persisted — no approved store exists for it; invalid rows are never rewritten or deleted (verified by test).
4. **`checkIntegrity` is not called anywhere outside tests** — the boot seam exists but nothing invokes it yet.
5. Git: the repository still has **no commits** (entire tree untracked, same state as end of Sprint 1); `poc/` was not modified by this sprint.

## 10. Remaining risks

| Risk | Impact | Mitigation / next |
|---|---|---|
| fake-indexeddb ≠ real browser | Schema bugs or upgrade hangs could appear only in real browsers | Real-browser check at M4 boot, before user data exists |
| No boot wiring | The database is never opened at runtime; capture (Sprint 3) would need it first | Wire `openDatabase()` + `checkIntegrity()` at the start of UI-001 |
| U4 host list empty | Hash-routed SPA pages (`#/doc/1` vs `#/doc/2`) collapse to one resource | User decision required; original `url` is retained so nothing is lost; duplicate modal will offer "save as separate" once UI exists |
| Uncommitted tree | Any environment loss loses all sprint work | Commit Sprint 1 + Sprint 2 before Sprint 3 (user authorization required) |
| Schema doc still contains invalid Dexie strings | A future implementer copying §3.1 verbatim will hit the abort | Corrections recorded in the implementation report + database notes; doc itself left untouched (no doc-edit authorization beyond these three files) |
| No `upgrade()` transform tested | First real data migration may need a pattern not yet proven | Add a transform test with the first non-additive change |

## 11. Closure recommendation

**Close Sprint 2 (M3).** CORE-001, CORE-002, DB-001–DB-003, DB-007 (mechanism) and DB-008 meet their acceptance criteria with evidence; DB-004 and DB-005 are complete except legs that depend on work authorized for later milestones (boot wiring → UI-001, backup restore → IMPORT-006/007/008); DB-006 is complete at handler level with one manual check outstanding. No defect requires a code change, and none was made.

Conditions carried forward into the next authorized sprint — not conditions of closure:

1. Wire `openDatabase()` + `checkIntegrity()` at boot and verify in a real browser.
2. Obtain the U4 exception-host decision (or confirm "no exceptions").
3. Commit the tree.

**Sprint 3 has not been started and is not authorized by this review.**
