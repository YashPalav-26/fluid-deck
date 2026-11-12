# Sprint 7 - IMPORT-005 Implementation Report (Import Preview + Per-Conflict Resolution)

*Date: 2026-11-12 - Scope: IMPORT-005 (plus the HTML folder-membership carry-forward it owns) - No schema change, no new dependency.*

## 1. Scope and verdict

IMPORT-005 is the user-facing side of the import pipeline: a read-only preview of a
`ValidatedImport`, a conflict list keyed by canonical URL, and a per-conflict resolution
(`Skip` / `Update Metadata` / `Add to Collections`, with apply-to-all) that the batch
committer honours inside its transaction.

The task also closes the IMPORT-004 condition "HTML imports create folders but file nothing
into them": the Netscape parser now exposes the folder tree and each bookmark's folder, and
validation maps that into `meta.collectionSourceIds`.

New modules: `apps/web/src/import/preview.ts`,
`apps/web/src/features/import-export/ImportDialog.tsx`. No database migration, no new
dependency (DOMPurify was already added for IMPORT-003), no schema change.

**Verdict: PASS WITH CONDITIONS.**

- Preview counts and conflict identity are covered by tests that also commit and compare the
  result; all three resolutions, mixed imports, stale previews, repeated commits and nested
  HTML folder membership are exercised against `fake-indexeddb`.
- The repo-wide full suite and web typecheck remain red only because of the pre-existing
  `apps/web/src/services/search.test.ts` failure. No IMPORT-005 file contributes an error.
- Conditions: the dialog is covered by jsdom tests, not a real-browser pass; `Update Metadata`
  deliberately ignores lower-confidence imported values (see 6.3); no cross-tab import lock
  (inherited IMPORT-004 limitation).

## 2. Acceptance criteria

| Criterion (SPRINT_7_IMPLEMENTATION_PLAN IMPORT-005) | Result |
| --- | --- |
| Modal with resource/collection/tag counts before commit | PASS - counts for new resources, conflicts, collections, unique tags and validation skips |
| Conflict summary | PASS - one entry per conflicting resource: incoming title/URL and the stored title/URL/`updatedAt` |
| Per-conflict resolution: Skip / Update Metadata / Add to Collections | PASS - radio group per conflict, resolved inside the batch transaction |
| "Apply to all" for bulk | PASS - one control sets every conflict, individual radios still override |
| Preview counts match commit | PASS - same fixture previewed then committed; `created`/`duplicates`/row counts compared |
| User can dismiss and re-run | PASS - dismissal resets state and writes nothing; same file can be re-picked |
| Repeated previews deterministic | PASS - two previews of the same import are deeply equal |
| Revalidate conflicts before writing | PASS - resolution is applied to the row the unique index returns, not to the preview snapshot |
| Preserve transaction / checkpoint / idempotency guarantees | PASS - resolution work runs inside the existing batch transaction; checkpoint and counters extended additively |

## 3. Preview design

`previewImport(database, validated)` returns `ImportPreview`:

```ts
{
  format,
  counts: { resources, newResources, duplicates, collections, tags, skipped },
  conflicts: Array<{
    canonicalUrl,                 // resolution key
    resourceIndex,
    incoming: { url, title },
    existing: { id, url, title, updatedAt }
  }>,
  collectionCounts: Array<{ name, count }>,
  warnings
}
```

- **Read-only.** One indexed read:
  `resources.where("canonicalUrl").anyOf(uniqueCanonicals)`. No `transaction`, no writes, no
  `localStorage` touch. Tests snapshot five table counts before/after and require equality.
- **Conflict identity** is the canonical URL - the same authority the unique index and
  `createResource` use. Soft-deleted rows count as conflicts because the index covers them.
- **Counts.** `resources` is the validated row count; `newResources + duplicates === resources`;
  `collections` counts validated collections (HTML root bookmarks synthesize an `Unorganized`
  folder, so it is counted); `tags` is the union of top-level tags and every per-resource tag,
  deduplicated by `normalizeTagName`; `skipped` is the validation-warning count.
- **Deterministic.** Same input, same output; conflicts follow source order.

## 4. Resolution semantics

| Resolution | Effect inside the batch transaction | Counter |
| --- | --- | --- |
| `skip` (default) | Existing resource, its memberships and tags untouched | `duplicates++` |
| `update` | `updateResource` with a patch built only from non-empty imported values: `title`, `description`, `thumbnailUrl`, `faviconUrl`, `notes`; `type` only when it is not the `"other"` fallback | `duplicates++`, `updated++` |
| `add-to-collections` | `addResourceToCollection` for every mapped imported collection; no tags, no metadata | `duplicates++`, `addedToCollections++` |

- The resolution map is `ReadonlyMap<canonicalUrl, resolution>`; an absent entry falls back to
  `defaultResolution` (`"skip"` when the caller does not set one).
- `duplicates` remains the conflict count. `updated` and `addedToCollections` are the resolved
  subsets, so `updated + addedToCollections <= duplicates` for every run.
- **Stale previews are safe.** `createResourceWithMembers` returns the existing row when the
  canonical URL is already present; the resolution is looked up for *that* row inside the
  transaction. A conflict that disappeared before commit is created normally; a row that
  appeared after the preview gets the fallback resolution rather than a duplicate resource.
- Empty imported values never wipe stored data. `type` is the one field with no empty member,
  so `"other"` (both parsers' fallback) is treated as "source does not know" and skipped. The
  parser's `"Untitled"` placeholder is skipped for the same reason.
- Checkpoint rows gained optional `updated` / `addedToCollections`. IMPORT-004 checkpoints
  remain readable and resume with those counters at zero; row-level replay is already
  idempotent, so only the reporting counters are affected.

## 5. HTML folder-membership carry-forward

The IMPORT-001 parser previously returned flat folder names, so IMPORT-004 created the
folders but filed nothing into them. IMPORT-005 fixes the pipeline end to end:

1. `parser.ts` keeps a folder stack while scanning Netscape tokens and returns
   `folders: ParsedHtmlFolder[]` (`id: html-folder-N`, `name`, `parentId`, `orderIndex`) plus
   `folderId` on every bookmark. Both the fixture style `<DL><p>Name</p>` and the real
   `<DT><H3>Name</H3><DL><p>` style are supported; nested folders become real parents.
   Root-level bookmarks are filed into a synthesized top-level `Unorganized` folder rather
   than being silently unfiled. The legacy `collections: string[]` shape is still returned.
2. `validateHtmlImport` maps `folders` to validated collections (`sourceId = folder id`) and
   each bookmark's `folderId` to `meta.collectionSourceIds`.
3. `commitImport` resolves those source ids to real collection ids and writes the joins.

Evidence: the Chrome fixture (10 bookmarks, 3 exported folders) previews as
`Unorganized 5 / Development 3 / Design 2` and commits 10 resources, 3 folders and 10
memberships; an inline nested export produces `Dev -> Tools` with one bookmark in each.

## 6. Behaviour and limitations worth knowing

1. **`skipped` counts warnings, not edited fields.** IMPORT-003 drops a record or field with a
   warning; the preview cannot see field-level repairs that left the record valid.
2. **Conflicts are per validated row.** IMPORT-003 already removes intra-file canonical
   duplicates, so two rows in the same file never conflict with each other in the preview.
3. **`Update Metadata` is conservative.** An import cannot clear an existing description or set
   a resource to `"other"`; it only refreshes values the source actually supplied.
4. **Format is chosen by file extension** (`.json` -> Raindrop, otherwise HTML). A mislabelled
   export fails with the normal validation error, never a partial import.
5. **Root HTML bookmarks are filed, not left loose.** The synthesized `Unorganized` folder is
   visible in the collection tree. This is a deliberate change from "no membership".
6. **No cross-tab import lock** (inherited). Two tabs cannot create duplicate rows, but their
   checkpoints race.
7. **A stale checkpoint from before this change reports zero `updated`/`addedToCollections`**
   for the batches it already completed. Rows and joins are still correct.
8. **No real-browser import pass.** The dialog is tested through jsdom with the real database
   fixture; a Playwright pass is a reasonable M9 follow-up.
9. **DOMPurify now reaches the entry chunk** because the settings page loads the import dialog.
   Bundle growth is the sanitizer plus the import pipeline, not a new library (see 8).

## 7. Changed files

New:

- `apps/web/src/import/preview.ts` - read-only counts and conflict contract.
- `apps/web/src/import/preview.test.ts` - 7 tests (counts, determinism, conflicts, soft delete,
  preview-vs-commit, HTML membership, nested folders).
- `apps/web/src/features/import-export/ImportDialog.tsx` - preview-first dialog.
- `apps/web/src/features/import-export/ImportDialog.test.tsx` - 3 jsdom tests (preview + commit,
  dismiss-without-writes, invalid file).
- `docs/SPRINT_7_IMPORT_005_REPORT.md` - this report.

Modified:

- `apps/web/src/import/parser.ts` - folder tree + per-bookmark `folderId`; token scan rewritten.
- `apps/web/src/import/validate.ts` - HTML collections from `folders`; memberships from
  `folderId`.
- `apps/web/src/import/validate.test.ts` - HTML membership expectations.
- `apps/web/src/import/commit.ts` - `resolutions` / `defaultResolution`, duplicate branch,
  `updated` / `addedToCollections` in result, progress and checkpoint.
- `apps/web/src/import/commit.test.ts` - 6 resolution tests added (21 total).
- `apps/web/src/features/settings/SettingsPage.tsx` - import section + dialog mount.
- `apps/web/package.json`, `pnpm-lock.yaml` - only the DOMPurify entries are staged from these
  two mixed working-tree files; the unrelated `minisearch` hunks stay uncommitted.
- `docs/PROJECT_PROGRESS.md` - IMPORT-005 entry staged without the pre-existing Sprint 6 hunks.

Untouched: database schema/version, `raindrop.ts`, search code, unrelated repositories.

## 8. Verification evidence

Commands run from the repository root on 2026-11-12.

| Gate | Command | Result |
| --- | --- | --- |
| Focused import + dialog suite | `pnpm vitest run apps/web/src/import/ apps/web/src/features/import-export/` | **6 files / 85 tests passed** (18 parser + 17 Raindrop + 19 validate + 21 commit + 7 preview + 3 dialog) |
| Full suite | `pnpm test` | **454 tests passed, 52 of 53 files**; only failure is the pre-existing `apps/web/src/services/search.test.ts` transform error at line 134 |
| Web typecheck | `pnpm --filter @fluid-deck/web typecheck` | Exactly 3 errors, all pre-existing in `src/services/search.test.ts` (134 TS1232, 162 TS2339 `openTxn`, 164 TS18048). Zero in `src/import/*` or the dialog |
| Lint | `pnpm exec eslint` on the 11 touched source/test files | Clean |
| Formatting | `pnpm exec prettier --check` on the same files | Clean |
| Production build | `pnpm build` | Exit 0; web built in **7.36 s**; entry **757.12 kB raw / 237.07 kB gzip** (+20.21 kB gzip vs IMPORT-004 - DOMPurify and the import pipeline are now reachable from Settings instead of tree-shaken) |
| Whitespace | `git diff --check` | Exit 0 (CRLF warnings only) |

Coverage highlights:

- preview counts on the real Raindrop fixture; zero table writes; repeated preview identical
- duplicate detection (including a soft-deleted row) with canonical-URL conflict identity
- preview `newResources`/`duplicates`/rows/collections match the committed result
- skip / update / add-to-collections individually, plus a mixed four-resource import
- empty imported values do not wipe stored metadata; `type` fallback does not overwrite
- stale preview in both directions: conflict disappeared -> created; row appeared -> resolved
- repeated commit with update and add-to-collections: rows and joins unchanged
- Chrome HTML fixture: 10 folders memberships, 3 folders, correct Development membership
- nested HTML: `Dev -> Tools` tree and one membership each
- dialog: preview + update resolution + commit, dismiss writes nothing, invalid file shows an
  error and stays on the picker

## 9. Handoff

- IMPORT-005 completes the import half of M8; IMPORT-006 (streaming JSON export) is the next
  independent task.
- The pre-existing `apps/web/src/services/search.test.ts` failure still blocks a repo-wide
  green claim and is untouched.
- Reasonable follow-ups: Playwright import journey, an import-lock guard if multi-tab imports
  become common, and a measured 10k preview/commit run.
