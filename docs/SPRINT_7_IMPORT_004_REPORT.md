# Sprint 7 — IMPORT-004 Implementation Report (Batch Persistence + Checkpoint Resume)

*Date: 2026-11-12 · Scope: IMPORT-004 only · No commits, staging, or pushes performed.*

## 1. Scope and verdict

IMPORT-004 is the persistence side of the import pipeline. It consumes the `ValidatedImport`
contract from IMPORT-003 and writes resources, collection tree, memberships and tags in batches of
500 resources, one Dexie transaction per batch, with a durable checkpoint that survives a killed
tab.

It adds one module, `apps/web/src/import/commit.ts`, plus tests. No UI, no schema change, no new
dependency.

**Verdict: PASS WITH CONDITIONS.**

- Batch, rollback, resume, idempotency and relationship behaviour are covered by 15 tests against
  `fake-indexeddb` that assert committed state, not call counts.
- The repo-wide full suite and web typecheck remain red only because of the pre-existing
  `apps/web/src/services/search.test.ts` failure. No IMPORT-004 file contributes an error.
- Conditions: HTML imports do not produce resource↔folder memberships (inherited from the
  IMPORT-001 parser, see §8.1), and per-conflict resolution UI is IMPORT-005 scope; IMPORT-004
  applies the approved default "skip existing".

## 2. Acceptance criteria

| Criterion (SPRINT_7_IMPLEMENTATION_PLAN §IMPORT-004) | Result |
| --- | --- |
| Import in batches of 500 rows per Dexie transaction | PASS — `IMPORT_BATCH_SIZE = 500`; one `rw` transaction per batch over the five affected stores |
| Kill mid-import → resume from checkpoint, no duplicate rows | PASS — checkpoint saved after each committed batch; test kills at batch 1 of 2 and resumes at index 500 |
| Idempotent re-run via canonical URL dedup | PASS — second full run creates 0, reports N duplicates, join rows and `usageCount` unchanged |
| Test with 1k and 10k corpora | PASS for 1k (resume + rollback tests use 1,000 rows); 10k is not exercised in unit tests (§8.8) |
| Batch error: prior batches stand, failed batch rolls back | PASS — bad row at index 500 leaves exactly 500 resources; retry commits the rest |
| Requested: metadata kept outside strict resource input | PASS — `resources[].input` only; `meta` applied separately; stored rows fail nothing in `resourceSchema` |
| Requested: duplicate / existing conflict policy | PASS — skip, existing resource and its relationships untouched |
| Requested: transaction boundaries observable | PASS — assertions read table state after each phase |
| No UI, export, schema migration, unrelated refactor | PASS |
| Parsers and IMPORT-003 validation unchanged | PASS except one additive contract field (§4.1) |

## 3. Batch and checkpoint design

**Batch.** `commitImport(database, validated, options)` slices `validated.resources` into
`IMPORT_BATCH_SIZE` (500) chunks. Each chunk is written inside
`database.transaction("rw", [resources, collections, resourceCollections, tags, resourceTags], …)`;
the repository helpers (`createResourceWithMembers`, `addResourceToCollection`, `addTagToResource`)
join that transaction because Dexie reuses a compatible parent scope. A throw anywhere aborts the
whole chunk.

**Order of work.**

1. Collections are persisted once, before any batch (they are few and resources reference them).
2. Batches then follow source order; `onProgress` fires after each committed batch.
3. The completion checkpoint is written after the last batch, never before.

**Checkpoint** (`ImportCheckpoint`, no tracking table — Phase 2.2 D2):

```ts
{ fingerprint, format, totalResources, nextIndex, created, duplicates, completed, updatedAt }
```

- Stored under `fluid-deck:import-checkpoint` through a small `CheckpointStore` interface.
  Browser: `localStorage`; anything else: in-memory. Storage errors (private mode, quota) degrade
  to a no-op — the checkpoint is an optimization, not a correctness requirement.
- `nextIndex` is the first resource index not yet committed, advanced only after its transaction
  resolves.
- Resume starts at `nextIndex` when `fingerprint` and `totalResources` match and `completed` is
  false. A completed checkpoint is cleared and the run starts from zero (idempotent replay).
- Stored checkpoints are treated as untrusted: malformed shapes, wrong format, foreign fingerprint
  or `nextIndex > total` are ignored and the import starts at zero.
- `fingerprint` = `format:count:` + two 32-bit FNV-1a passes over the resource URLs in order. Same
  file → same fingerprint; different file → fresh run.

**Concurrency.** A module-level flag rejects a second `commitImport` while one is in flight
(`concurrent_import`). Cross-tab concurrency is not locked; database-level canonical-URL uniqueness
still prevents duplicate rows there (§8.4).

## 4. Transaction and idempotency guarantees

- **One transaction per batch**, committing resource row + collection joins + tag joins +
  `usageCount` bumps + imported timestamp together.
- **A failed batch leaves nothing behind**: all 500 rows of that chunk roll back, including rows
  that had already succeeded inside it. Test: 1,000-row import with a schema-invalid row at index
  500 leaves exactly 500 resources.
- **Prior batches stand**: they live in earlier transactions and are never revisited or deleted.
  Nothing predating the import is ever updated or removed.
- **Resume is safe at any point.** Killed between transactions → checkpoint points at the next
  chunk. Killed during a transaction → IndexedDB aborts it, checkpoint still points at that chunk,
  replay is a no-op for rows that were already there.
- **Replay is idempotent without the checkpoint** because `createResource` returns the existing row
  for a canonical URL, and `add*ToResource` refuse to duplicate a compound-key join.
- `ImportCommitError` (`invalid_import`, `concurrent_import`, `batch_failed`) carries `committed`
  and `fingerprint`, so the caller can say "paused at N of M".

## 5. Metadata and relationship mapping

| Imported value | Written where | Rule |
| --- | --- | --- |
| `resources[].input` | `resources` row | Only this object reaches `createResource`. No meta is spread in |
| `meta.createdAt` | `resources.createdAt` | Applied inside the batch transaction when it is a non-negative integer ≤ now; future/invalid values are ignored, never clamped |
| `meta.tags` | `tags` + `resourceTags` | Created on demand through `ensureTags`; `usageCount` is derived from actual join rows (D7), never copied from the export |
| `meta.collectionSourceIds` | `resourceCollections` | Resolved through `collections[].sourceId`; unknown ids are dropped |
| `collections[]` | `collections` rows | Parents resolved from `parentSourceId` (topological passes); siblings re-created in ascending `orderIndex` so append order matches the export |
| `tags[]` (top level) | — | Not used: tag identity/usage comes from memberships (§8.3) |
| duplicate canonical URL | — | Skipped; the existing row and its memberships are untouched (`duplicates++`) |

Collection policies:

- **Reuse** an existing sibling whose normalized name matches, instead of failing on the
  repository's sibling-name constraint. This is what makes resume and re-import idempotent.
- **Dangling parent** → import the collection at the top level and add a warning.
- **Parent cycle** → flatten every collection in the cycle to the top level and add a warning
  (never hang, never drop data).
- HTML collections have `sourceId: null` and no memberships (see §8.1).

## 6. Changed files

New:

- `apps/web/src/import/commit.ts` — batch committer, checkpoint store, fingerprint, error type.
- `apps/web/src/import/commit.test.ts` — 15 tests (`fake-indexeddb`, real tables).

Modified (small, justified):

- `apps/web/src/import/validate.ts` — `ValidatedImportCollection` gained `sourceId: string | null`
  so memberships can be resolved at commit. Additive only; validation behavior unchanged.
- `apps/web/src/repositories/collections.ts` — `normalizeCollectionName` exported (was private) so
  the committer reuses the one normalization rule instead of duplicating it.
- `docs/SPRINT_7_IMPORT_003_REPORT.md` — contract block updated for `sourceId`.
- `docs/PROJECT_PROGRESS.md` — progress entry.

Untouched: both parsers, `parser.test.ts`, `raindrop.test.ts`, `validate.test.ts`, schema,
database version.

## 7. Verification evidence

Commands run from the repository root on 2026-11-12.

| Gate | Command | Result |
| --- | --- | --- |
| Focused import suite | `pnpm vitest run apps/web/src/import/` | **4 files / 69 tests passed** (18 + 17 + 19 + 15) |
| Full suite | `pnpm test` | **438 tests passed, 50 of 51 files**; only failure is the pre-existing `apps/web/src/services/search.test.ts` transform error at line 134 |
| Web typecheck | `pnpm --filter @fluid-deck/web typecheck` | Exactly 3 errors, all pre-existing in `src/services/search.test.ts` (134 TS1232, 162 TS2339 `openTxn`, 164 TS18048). Zero in `src/import/*` |
| Lint | `pnpm exec eslint` on `commit.ts`, `commit.test.ts`, `validate.ts`, `collections.ts` | Clean |
| Formatting | `pnpm exec prettier --write` on the same files | Clean |
| Production build | `pnpm build` | Exit 0; web built in 7.10 s; **216.86 kB gzip** (unchanged — committer is not in the entry chunk yet) |
| Whitespace | `git diff --check` | Exit 0 |

Coverage highlights (all assert table state):

- small import (2 resources), memberships, tag counts, timestamp mapping
- meta isolation from the persisted row (`resourceSchema` still parses it)
- exact 500 → 1 batch, 501 → 2 batches, progress emissions `[1, 2]`
- nested collections with parents and sibling order
- collection reuse by normalized name
- dangling parent + parent cycle → warnings, no failure
- existing canonical URL → skipped, original row untouched
- past timestamp applied, future timestamp ignored
- double commit idempotency (rows, joins, `usageCount`)
- kill after batch 1 → resume at 500 → 1,000 rows
- failing batch rollback → 500 rows, `committed: 500`, retry to 1,000
- invalid/foreign/completed checkpoint → fresh run
- invalid import object → `invalid_import`, zero writes
- concurrent commit → `concurrent_import`
- real `validateRaindropImport` fixture committed end to end

## 8. Known limitations and risks

1. **HTML imports create folders but no memberships.** The IMPORT-001 parser returns folder names
   only (`collections: string[]`), so `meta.collectionSourceIds` is empty for every HTML resource.
   Resources land in the library, folders are created, but nothing is filed into them. Fixing this
   means changing the Netscape parser, which this task was told not to touch. Silent data-shape
   gap worth a follow-up inside M8.
2. **`createdAt` is rewritten after insert.** The row is created with "now", then updated inside the
   same transaction when the export carries a usable timestamp. Costs one extra write per imported
   resource and means `createdAt !== updatedAt` for those rows.
3. **Declared-but-unused tags are not persisted.** Only tags attached to an imported resource
   exist after commit. A Raindrop tag with zero items disappears; `ValidatedImport.tags` remains
   available for the preview UI.
4. **No cross-tab import lock.** Two tabs can run imports concurrently. Rows cannot duplicate
   (unique canonical URL, compound-key joins) but checkpoint writes race and progress is
   per-context. Acceptable for a local-first single-user app; a `navigator.locks` guard is a small
   follow-up if it matters.
5. **Checkpoint is per browser profile.** It lives in `localStorage`; a different profile/browser
   starts from zero. Safe (dedup), just slower.
6. **Fingerprint is 64-bit FNV, not a cryptographic hash.** A collision needs the same format,
   count and both 32-bit halves; consequence is resuming at the wrong index, which could skip new
   rows. Practically unreachable, documented rather than fixed (a SubtleCrypto hash would be async
   and unavailable in some test/runtime paths).
7. **Collections are written outside batch transactions.** A crash mid-collections leaves some
   folders created; the next run reuses them. No destructive rollback by design (requirement 10).
8. **No 10k commit benchmark.** Tests cover 1,000 rows; the 100k validation cap is not exercised
   end-to-end for time or memory. Batch cost is dominated by the per-batch transaction, which is
   the part designed for.
9. **Conflict policy is fixed to "skip".** IMPORT-005 adds Skip / Update Metadata / Add to
   Collections; the committer will need a per-resource decision hook at that point.
10. **A permanently bad row blocks its batch forever.** This is the approved behavior ("aborts at
    the first failing batch"), and IMPORT-003 guarantees validated input, so it should only be
    reachable through a programming error.

## 9. Handoff

- **Next dependency-ready task: IMPORT-005** — import preview and duplicate summary. It consumes
  `ValidatedImport` for counts (resources / collections / unique tags) and `commitImport` for the
  commit, and owns the per-conflict choice that IMPORT-004 currently hard-codes to "skip".
- IMPORT-006/007 (export) are independent of the committer.
- If HTML folder filing is required, the change belongs in the IMPORT-001 parser plus a validation
  test, not in the committer.

---

## M9-006 reconciliation (2026-11-14)

**2026-11-14 status (M9-006):** the pre-existing failure recorded here - `apps/web/src/services/search.test.ts` failing to transform - was fixed in M9-001 (`61d8b96`) and that file is now committed; a clean clone runs 57 files / 499 tests green. The suite numbers in this report (438 tests / 50 of 51 files) predate the M8 and M9 suites.
