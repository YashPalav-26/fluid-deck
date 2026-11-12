# Sprint 7 - IMPORT-006 Implementation Report (Streaming JSON Export)

*Date: 2026-11-12 - Scope: IMPORT-006 - No schema change, no new dependency.*

## 1. Scope and verdict

IMPORT-006 is the readable half of the pipeline: read the live library from Dexie and hand
the user a JSON file, without building one giant string and without re-using the 500-card
grid query. New module: `apps/web/src/export/json.ts`. New UI:
`apps/web/src/features/import-export/ExportDialog.tsx`, mounted from an Export section in
`SettingsPage.tsx`.

**Verdict: PASS WITH CONDITIONS.**

- All four approved scopes exist at service level (`all`, `collection`, `selected`,
  `filter`); tests exercise each, including a 1,201-row filter export that crosses two
  500-record chunk boundaries.
- Serialization is chunked: one `JSON.stringify` per 500 records, concatenated as Blob
  parts. The 10k-resource measurement is **132 ms** and a **5.8 MB** blob, inside the
  proposed 30 s export / <10 s download-start budgets.
- The exported envelope re-reads through the IMPORT-002/003 validator, so a file we wrote
  is a file we can import (resources, tags, collections and the first membership).
- Conditions: jsdom/`fake-indexeddb` evidence only (no real-browser download run at 10k);
  a resource in several collections keeps every membership in `collectionIds` but the
  IMPORT-002 parser only reads `collection.$id` / `collectionId`, so a re-import keeps the
  first membership only (see 5.2).

## 2. Acceptance criteria

| Criterion (SPRINT_7_IMPLEMENTATION_PLAN IMPORT-006) | Result |
| --- | --- |
| Streaming `JSON.stringify` in 500-record blocks | PASS - `serialize()` stringifies one 500-item chunk at a time into Blob parts |
| 10k export <= 30 s (proposed) | PASS - measured 132 ms for 10,000 resources (5,796,814-byte blob) |
| Download starts < 10 s at 10k | PASS (proxy) - serialization is 132 ms; the dialog hands the blob to `<a download>` immediately. Real-browser download not timed |
| Deferred `revoke` on Blob URLs | PASS - `setTimeout(() => URL.revokeObjectURL(url), 10_000)`, asserted by test |
| Scope options work: All / Current Filter / Selected / Collection | PASS at service level - all four tested; All and Collection mounted in the dialog |
| Export metadata: `version`, `exportedAt`, `resourceCount`, `truncated` | PASS - present as file fields and as `meta` on `JsonExport` |
| No new dependency | PASS - native `Blob`, `URL.createObjectURL`, `<a download>` |
| Full fidelity | PASS - every resource field plus tags, collections and memberships |

## 3. Design

### 3.1 Scopes

```ts
type ExportScope =
  | { kind: "all" }
  | { kind: "collection"; collectionId: string }
  | { kind: "selected"; resourceIds: readonly string[] }
  | { kind: "filter"; view: ViewState };
```

- `all` and `collection` use the repositories (`listResources`, `listCollectionMembers`).
- `selected` filters the validated `listResources` output by id instead of `bulkGet`, so a
  corrupt persisted row cannot bypass validation on its way into the file.
- `filter` mirrors the browse chain in `services/library.ts` (type, source, date, domain,
  unorganized, collection, tags) but **not** its `RESOURCE_GRID_CAP` of 500: "Current
  Filter" must export every match, not the first screen. The duplication is marked
  `shortcut:` in code; unify once the grid cap is separated from the query (IMPORT-009).
- Only `all` and `collection` are in the dialog. `selected` needs multi-select and `filter`
  needs the active view, both of which belong to the library chrome in IMPORT-009.

### 3.2 File shape

Raindrop-compatible envelope, so the existing validator can read it:

```json
{ "result": true, "version": 1, "exportedAt": "...", "resourceCount": 2, "truncated": false,
  "collections": [{ "_id": "...", "title": "Dev", "parent": null, "sort": 0 }],
  "tags": [{ "_id": "...", "title": "reading", "count": 1 }],
  "items": [{ "_id": "...", "link": "...", "collection": { "$id": "..." },
              "collectionIds": ["..."], "tags": ["reading"], "...": "..." }] }
```

Extra fields Raindrop has no name for: `faviconUrl`, `canonicalUrl`, `domain`, `type`,
`source`, `extractionStatus`, `extractionNotes`, `lastOpenedAt`, `collectionIds`. Exported
collections are the referenced folders plus every ancestor, so the tree survives a
re-import even when only a leaf was filled. Tag/count data comes from the join tables, not
from a per-resource query; join scans are marked `shortcut:` for the ~1e5-row case.

Timestamps are ISO strings (`created`, `lastUpdate`) as Raindrop writes them; the
IMPORT-002 parser converts them back to epoch milliseconds.

### 3.3 Chunking and download

`serialize()` writes the envelope header, then one `JSON.stringify` of 500 items at a
time, trimming the array brackets and stitching commas, and finally closes the array. No
step ever stringifies the whole library. `downloadExport()` creates an object URL, clicks a
detached `<a download>`, and revokes the URL after 10 s - an immediate revoke kills the
download on slower browsers.

Soft-deleted rows are excluded by `listResources` in every scope; a test seeds one and
checks that `all` and `selected` both drop it.

### 3.4 UI

`ExportDialog` offers "Everything" and "One collection", loads collections with the same
`["collections"]` query key the import dialog invalidates, disables the export button until
a collection is chosen, toasts the exported count, shows a `role="alert"` error and resets
its state when closed.

## 4. Evidence

### 4.1 Tests

`apps/web/src/export/json.test.ts` (5, jsdom + `fake-indexeddb`):

1. full-fidelity all-scope export: metadata, filename, item field mapping, `Dev -> Tools`
   ancestor chain, tag id/name/count, `collection` mirror field;
2. soft-deleted resources never export (`all` and `selected`), `truncated` set;
3. collection scope exports only members and marks the file truncated;
4. filter scope exports 1,201 rows with no grid cap, chunk boundaries stitched correctly;
5. round-trip through `validateRaindropImport`: resource fields, tags, collections and
   membership read back.

`apps/web/src/features/import-export/ExportDialog.test.tsx` (2, jsdom): named download with
a parsed blob, no immediate revoke and `setTimeout(..., 10_000)`; collection scope disabled
until a folder is picked, then a one-item truncated export.

### 4.2 Measurement

Temporary `fake-indexeddb` test (deleted after the run), 10,000 seeded resources:

```
MEASURE export 10k: 132ms, 5796814 bytes, 10000 items
```

### 4.3 Bundle

Entry chunk 757.12 kB raw / 237.07 kB gzip (IMPORT-005) -> **763.87 kB raw / 238.92 kB
gzip** (+6.75 kB raw / +1.85 kB gzip). The export module is reachable from Settings, so it
lands in the entry chunk; code-splitting Settings would move it out but was not requested.

### 4.4 Gates

| Gate | Result |
| --- | --- |
| Focused export/import-export tests | 3 files / 10 tests passed |
| Full suite | 461 passed / 54 of 55 files |
| Web typecheck | only the 3 pre-existing `search.test.ts` errors |
| ESLint | clean on the 5 touched files |
| Prettier | clean on the 5 touched files |
| Production build | exit 0, web 7.01 s |
| `git diff --check` | exit 0 |

## 5. Limitations

1. **jsdom only.** Blob/URL/anchor behaviour is stubbed; no real browser download at 10k
   was timed. The service measurement is the serialization path, not the disk write.
2. **Multi-collection round-trip.** `collectionIds` keeps every membership, but
   `validateRaindropImport` reads only `collection.$id` / `collectionId`, so re-importing
   an exported file restores the first membership. Closing this needs a one-line parser
   change (read `collectionIds`) in IMPORT-007/008, when the parser is in scope.
3. **Join tables are scanned whole** (marked `shortcut:`), fine for a personal library;
   upgrade to indexed `anyOf` past ~1e5 join rows.
4. **No selection/filter entry points in the UI yet** - intentional, IMPORT-009 owns that
   chrome; the service scopes are already tested.
5. No real-browser memory check on the 5.8 MB blob; chunking bounds the intermediate
   strings, not the final blob.

## 6. Files

| File | Change |
| --- | --- |
| `apps/web/src/export/json.ts` | new export service: scopes, relations, chunked serialize, download |
| `apps/web/src/export/json.test.ts` | new service tests |
| `apps/web/src/features/import-export/ExportDialog.tsx` | new export dialog |
| `apps/web/src/features/import-export/ExportDialog.test.tsx` | new dialog tests |
| `apps/web/src/features/settings/SettingsPage.tsx` | Export section + dialog mount |
| `docs/SPRINT_7_IMPORT_006_REPORT.md` | this report |
| `docs/PROJECT_PROGRESS.md` | IMPORT-006 entry |
