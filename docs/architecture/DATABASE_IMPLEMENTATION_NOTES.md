# Database Implementation Notes — Fluid Deck

*Phase 4 / Sprint 2 (2026-11-08). Companion to `DATABASE_SCHEMA_AND_MIGRATIONS.md` (the design spec) — this file documents **how the implemented layer is used**. It does not restate the specification.*

## Where things live

```
packages/core/src/            constants · schemas (Zod) · canonicalizeUrl · ordering · ViewState codec · prefs
apps/web/src/persistence/     db.ts (Dexie instance + v1 schema + lifecycle) · integrity.ts · quarantine.ts
apps/web/src/repositories/    resources · collections · tags · relationships · preferences · saved-searches · errors
apps/web/src/testing/         database-fixture.ts (isolated fake-indexeddb database per test)
```

Dependency direction: `repositories → persistence → core`. Components must never import `persistence/` or Dexie (Phase 2.5 §4.2); they go through services/hooks (UI-001+).

## Opening the database

```ts
import { openDatabase } from "./persistence/db.ts";
import { checkIntegrity } from "./persistence/integrity.ts";

await openDatabase();
const report = await checkIntegrity(db); // read-only; never deletes
```

`openDatabase()` throws `DatabaseInitializationError` instead of leaking a raw Dexie/IDB error. `checkIntegrity()` returns counts, schema-invalid rows (quarantined), orphan joins and `usageCount` drift.

## Repository conventions

- Every function takes the database first: `createResource(db, input)` — pass the singleton in app code, an isolated instance in tests.
- Inputs are validated with Zod (`parseOrThrow`) and failures throw `RepositoryError` with a `code` to branch on.
- Rows read from IndexedDB are re-validated (`parsePersisted`); an invalid row is quarantined and skipped, never rewritten.
- Anything touching more than one store runs inside one `db.transaction(...)`.

## Adding a schema version

1. Bump `SCHEMA_VERSION` in `packages/core/src/constants.ts`.
2. Add `this.version(n).stores({ ...SCHEMA_V1_or_current, <changed stores> })` in `FluidDeckDatabase` — additive indexes/stores only.
3. If data must be reshaped, add `.upgrade(tx => ...)`; upgrades run inside the version-change transaction, so a throw rolls the whole upgrade back.
4. Add a test modelled on `persistence/migration.test.ts`: write on the old version, reopen on the new one, assert counts, the new index, and post-upgrade writes.

Rules: never edit a released migration; never delete a store without an explicit, tested data transform; `updatedAt` is not touched by backfills.

## Index quirks worth remembering

- Unique marker is `&`; compound indexes need brackets: `[deletedAt+createdAt]`.
- IndexedDB does not index `null`, so:
  - live resources are absent from `[deletedAt+createdAt]` (trash queries use a numeric range);
  - top-level collections (`parentId === null`) are found with a filter, nested ones with the `parentId` index.
- Only `canonicalUrl` and `normalizedName` are unique at the database level. Sibling collection names and referential integrity are repository-enforced.

## Ordering (U1)

`orderBetween(previous, next)` returns a midpoint; siblings start `ORDER_GAP` (1024) apart. When `needsResequence()` is true (< 1e-6 gap), `reorderCollection` rewrites the sibling positions with `resequence()` inside the same transaction before computing the midpoint. Comparisons are `(orderIndex, id)` so ties are deterministic.

## Deletion (U5)

- `softDeleteResource` sets `deletedAt` once (repeat calls keep the original timestamp).
- `restoreResource` clears it; membership rows are retained throughout.
- `purgeDeletedResources(db, { confirm: true, retentionDays, now })` is the only hard delete of resources and requires the literal `confirm: true`. No boot-time sweep exists yet.
- `resetDatabase(db, { confirmation: "delete-all-data" })` is the only caller of `db.delete()`.

## Integrity and quarantine

`checkIntegrity()` validates every row (acceptable at 10k), reports orphans and usage drift, and records bad rows in the in-memory quarantine list. Repairs are explicit: `recomputeTagUsageCounts(db)`, or a manual export/backup cycle. Nothing is auto-repaired or auto-deleted.

## Testing

Use `useTestDatabase()` from `apps/web/src/testing/database-fixture.ts`; it imports `fake-indexeddb/auto`, creates a uniquely named database per test, clears quarantine, and deletes the database afterwards. Remember: this is simulated IndexedDB, not a browser.
