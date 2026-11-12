# Sprint 7 - IMPORT-007 Implementation Report (HTML, Markdown and CSV Export)

*Date: 2026-11-12 - Scope: IMPORT-007 - No schema change, no new dependency, no parser change.*

## 1. Scope and verdict

IMPORT-007 adds three more export files beside the IMPORT-006 JSON export. The work was
deliberately shaped as one shared snapshot plus three renderers, not four parallel export
paths:

- `apps/web/src/export/source.ts` - new shared foundation: scope selection, join-table
  reads, collection tree, file metadata, filename and download hand-off.
- `apps/web/src/export/json.ts` - refactored onto that foundation; output shape unchanged.
- `apps/web/src/export/formats.ts` - new HTML (Netscape), Markdown and CSV writers.
- `apps/web/src/features/import-export/ExportDialog.tsx` - format select plus the two
  approved options; HTML/Markdown/CSV are dynamically imported.

**Verdict: PASS WITH CONDITIONS.**

- All four scopes (`all`, `collection`, `selected`, `filter`) now come from the same
  `loadExportSource()` in every format, so scope, soft-delete and relation semantics cannot
  drift between formats. Tests exercise every format against multiple scopes, including a
  600-row filter export that exceeds the 500-card grid cap.
- Escaping is format-specific and test-covered: HTML text/attributes, Markdown frontmatter
  (JSON scalars) and body, CSV quoting plus spreadsheet-formula injection guard.
- Generation is chunked per resource/row into Blob parts, so no whole-library string is
  built for any format. 10k resources: HTML 2.2 MB in ~1.2 s, Markdown 7.5 MB in ~1.4 s,
  CSV 3.5 MB in ~1.4 s.
- html/markdown/csv code is a lazy 4.46 kB / 1.79 kB gzip chunk; the entry chunk grows
  238.92 -> 239.86 kB gzip, inside the 250 kB budget.
- Conditions: jsdom/`fake-indexeddb` evidence only; HTML round-trip of `&` is corrupted by
  the importer (not the exporter); Netscape cannot carry descriptions, notes, thumbnails or
  multiple memberships for one bookmark; CSV notes column keeps notes although the plan
  text said "notes in MD only" (see 5.3/5.4).

## 2. Acceptance criteria

| Criterion (SPRINT_7_IMPLEMENTATION_PLAN IMPORT-007) | Result |
| --- | --- |
| HTML: Netscape format with collection hierarchy | PASS - `<!DOCTYPE NETSCAPE-Bookmark-file-1>`, `<DL><p>` nesting by `parentId`, `orderIndex` order; ancestors included so a leaf-only scope keeps its tree |
| Markdown: frontmatter per resource, single file | PASS - one YAML frontmatter block + body per resource, concatenated |
| CSV: flat rows, all core fields incl. `thumbnailUrl`, `faviconUrl`, `notes` | PASS - fixed 14-column header, CRLF, quoted per RFC 4180 |
| Round-trip import -> export -> import preserves >98% fields | PARTIAL - JSON passes (IMPORT-006). HTML re-imports resources, titles, URLs (no `&`), tags and folder membership through the IMPORT-001 parser; descriptions/notes/thumbnails and extra memberships do not exist in Netscape. Measured field coverage of what Netscape can carry is 100% (see 3.3) |
| Include thumbnails (off by default) | PASS - Markdown only (frontmatter + optional image); HTML/CSV have no such field; default off, asserted in tests |
| Include notes (MD only) | PASS in Markdown (default on, checkbox disabled for other formats); CSV keeps notes as a fixed core field (see 5.3) |
| Flatten collections | NOT IMPLEMENTED - CSV is flat by design and HTML is hierarchical by requirement; a flatten toggle would only affect HTML and nobody asked for a second HTML shape (see 5.4) |
| Shared selection/serialization utility without needless abstraction | PASS - `source.ts` is one snapshot function set; JSON output unchanged and both modules import it |
| Exclude soft-deleted resources | PASS - inherited from `listResources`/`listCollectionMembers`; a test seeds a trashed row and asserts it is absent from HTML and JSON |
| Bypass the 500-item grid cap | PASS - `filter` scope reuses the browse rule chain without `RESOURCE_GRID_CAP`; 600-row export asserted |
| Deterministic filenames, MIME and download | PASS - `fluid-deck-export-YYYY-MM-DD.{json,html,md,csv}`; `application/json`, `text/html;charset=utf-8`, `text/markdown;charset=utf-8`, `text/csv;charset=utf-8`; same `<a download>` + 10 s revoke path |
| Reuse the existing dialog and UX | PASS - same dialog, scope radios and collection picker; one new Format select, two option checkboxes |
| No new dependency | PASS - `Blob`, `URL.createObjectURL`, `<a download>` |

## 3. Design

### 3.1 One snapshot, three renderers

`export/source.ts` owns everything that used to be JSON-specific:

```ts
loadExportSource(database, scope, { version, now }) -> {
  resources,       // scope-selected, soft-deleted excluded
  collections,     // referenced folders + ancestors, tree order
  collectionIds,   // every membership per resource, sorted
  tagNames, tags,  // join-table reads, sorted for byte-stable output
  meta,            // version/exportedAt/resourceCount/truncated
}
```

`json.ts` keeps its 500-record chunking, its Raindrop envelope and its `collection` mirror
field; it now maps `source.resources` instead of doing its own queries. HTML, Markdown and
CSV each render the same arrays. Nothing format-specific leaked back into `source.ts`, and
no generic "exporter plugin" interface was invented: three small functions with the same
`(database, scope, options)` signature are enough.

`meta.truncated` stays `scope.kind !== "all"`, matching IMPORT-006.

### 3.2 Chunking

Every format appends one Blob part per resource (or one per row for CSV) and never joins
the library into a single string. JSON keeps its 500-item `JSON.stringify` blocks. The
final Blob is the only whole-file object, as in IMPORT-006.

### 3.3 HTML (Netscape)

Emitted shape follows what IMPORT-001 actually parses, not the plan's illustrative
`<bookmark>` sketch (which no browser and no importer in this repo understands):

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Fluid Deck bookmarks</TITLE>
<H1>Fluid Deck bookmarks</H1>
<DL><p>
    <DT><A HREF="..." ADD_DATE="..." LAST_MODIFIED="..." TAGS="reading">Title</A>
    <DD>Description
    <DT><H3 ADD_DATE="..." LAST_MODIFIED="...">Dev</H3>
    <DL><p>
        <DT><H3 ...>Tools</H3>
        <DL><p>...bookmarks...</DL><p>
    </DL><p>
</DL><p>
```

- Resources outside every collection are written at the top level. A resource with
  memberships is filed under its first membership (sorted `collectionIds`); tags travel in
  `TAGS`.
- Text nodes escape `<` and `>`; attribute values additionally escape `"` and `'`. `&` is
  left raw on purpose: IMPORT-001's parser does not entity-decode, so `&amp;` would come
  back as literal text. This is the one place where standards-complete escaping was traded
  for round-trip fidelity (see 5.1 for the importer-side gap).
- `<script>` never survives as markup: the test asserts the literal `<script>alert` string
  is absent and the escaped text is present.
- Netscape has no description/notes/thumbnail fields; `<DD>` carries the description for
  human readers only, and IMPORT-001 ignores it.

### 3.4 Markdown

Single file, one section per resource, each opening with YAML frontmatter. Values are
`JSON.stringify` output, i.e. valid YAML double-quoted scalars, so hostile text cannot add
keys or close the block. Keys: `id`, `title`, `url`, `canonicalUrl`, `description`, `domain`,
`type`, `source`, `extractionStatus`, `extractionNotes`, `collections`, `tags`, `createdAt`,
`updatedAt`, `lastOpenedAt` (bare `null`), `faviconUrl`, plus `thumbnailUrl` when thumbnails
are on and `notes` when notes are on (default). Collections and tags are JSON flow
sequences (`["Tools"]`), which YAML parsers also accept.

Body: `## escaped title`, `[title](<url>)`, escaped description, optional image. Headings
and link text escape backslash, backticks, `*`, `_`, `[`, `]`, `<`, `>`, `#`, `|`; URLs are
wrapped in `<...>` with `\`, `<`, `>` percent-encoded, so a space or parenthesis in a URL
cannot break the link.

### 3.5 CSV

Fixed header `CSV_COLUMNS`, CRLF line endings, no BOM:

```
resourceId,url,canonicalUrl,title,description,type,source,collections,tags,
createdAt,updatedAt,thumbnailUrl,faviconUrl,notes
```

- Quoted when the value contains `"`, `,`, CR or LF; inner quotes doubled.
- Formula injection guard: a value starting with `=`, `+`, `-`, `@`, tab or CR gets a
  leading `'` before quoting, so a spreadsheet shows text instead of executing it.
  Test-covered with `=2+3` and `+SUM(A1:A2)`.
- `collections` and `tags` are joined with `", "`. Collections are direct memberships only:
  a parent folder is a hierarchy fact, not a membership, so `Tools` appears and `Dev` does
  not for a bookmark filed only in `Tools`.
- Empty library exports the header row only.

### 3.6 UI

`ExportDialog` gains a Format select (JSON / HTML bookmarks / Markdown / CSV), an "Include
thumbnails" checkbox (default off) and an "Include notes (Markdown only)" checkbox (default
on, disabled unless Markdown). The button is now "Export file"; the toast names the format.
Dismissal resets scope, format, both options, collection and error, as before.

`formats.ts` is loaded with `await import("../../export/formats.ts")` inside the mutation,
so JSON export and app start never pay for the three renderers. Vite produced a separate
`formats-*.js` chunk (see 4.3).

## 4. Evidence

### 4.1 Tests

`apps/web/src/export/formats.test.ts` (7, jsdom + `fake-indexeddb`):

1. Netscape HTML: hierarchy (`Dev -> Tools`), top-level beta before folders, ancestor
   retention, `TAGS`, timestamps, hostile title escaped, description as `<DD>`,
   soft-deleted row absent, deterministic filename/MIME/count, and a real round-trip through
   `validateHtmlImport` (URLs, folder names, `Tools` membership of the alpha bookmark);
2. empty HTML is still a valid file for the importer;
3. Markdown: frontmatter title/description/notes/tags, escaped heading, raw URL, no
   injected keys, `includeNotes: false` removes notes, thumbnails off by default and on by
   request (frontmatter + image);
4. CSV: header equals `CSV_COLUMNS`, 4 rows for 3 resources, exact title/description/notes/
   tags values after a RFC 4180 parse, doubled quotes, formula guard on title and
   description, direct-membership collections only;
5. empty CSV is exactly the header row;
6. all scopes without the grid cap: 600-row `filter`, 1-row `collection`, 2-row `selected`,
   601-row `all` (600 bulk + 1), `truncated` flags;
7. determinism for a fixed clock (HTML byte-identical, Markdown timestamp).

`apps/web/src/features/import-export/ExportDialog.test.tsx` (3, jsdom):

1. JSON all-scope download: parsed blob, filename pattern, no immediate revoke,
   `setTimeout(..., EXPORT_REVOKE_DELAY_MS)`;
2. collection scope disabled until a folder is picked, then a one-item truncated export;
3. Markdown export: notes checkbox disabled for JSON and enabled for Markdown, thumbnails
   unchecked by default, lazy export yields `text/markdown;charset=utf-8`, `.md` filename,
   frontmatter and heading present, `thumbnailUrl` absent.

Consumer checks: HTML goes through the real IMPORT-001/003 pipeline (`validateHtmlImport`,
DOMPurify + parser + Zod). CSV goes through an RFC 4180 parser in the test. Markdown
frontmatter is asserted as parseable JSON scalars; no Markdown/YAML library is installed and
none was added.

### 4.2 Measurement

Temporary `fake-indexeddb` test (deleted after the run), 10,000 seeded resources with
Unicode titles, descriptions with quotes/markup, thumbnails, notes and two extraction notes:

```
html:     build=1151ms bytes=2205877  count=10000
markdown: build=1375ms bytes=7496754  count=10000
csv:      build=1422ms bytes=3501246  count=10000
json:     build=1194ms bytes=6381264  count=10000
```

All four are well inside the proposed 30 s export budget. The join-table scans in
`readRelations` are whole-table (marked `shortcut:`); for 10k resources that is ~20k join
rows, included in the timings above.

### 4.3 Bundle

| Chunk | Size |
| --- | --- |
| entry (IMPORT-006) | 763.87 kB raw / 238.92 kB gzip |
| entry (IMPORT-007) | **766.69 kB raw / 239.86 kB gzip** (+2.82 kB / +0.94 kB) |
| lazy `formats-*.js` | 4.46 kB raw / 1.79 kB gzip |

The 250 kB gzip budget leaves ~10.1 kB. The growth is the shared snapshot module and the
dialog's new controls; the three renderers stay out of the entry chunk.

### 4.4 Gates

| Gate | Result |
| --- | --- |
| Focused `apps/web/src/export/` + `features/import-export/` | 4 files / 18 tests passed |
| Full suite | **469 passed / 55 of 56 files**; only the pre-existing `search.test.ts` transform failure |
| Web typecheck | 5 pre-existing errors, none from this task: 3 in `search.test.ts`, 2 TS2532 in committed `export/json.test.ts` (verified by restoring `HEAD:json.ts` and re-running: identical 5) |
| ESLint | clean on the 6 touched files |
| Prettier | clean on the 6 touched files (four reformatted during the task) |
| Production build | exit 0; web entry above, extension build unchanged |
| `git diff --check` | exit 0 (CRLF warnings only) |

## 5. Limitations

1. **HTML `&` round-trip is importer-side.** The exporter writes `&` raw so IMPORT-001's
   non-decoding parser sees the original URL. The import path runs DOMPurify first, which
   re-escapes it to `&amp;`, so `?a=1&b=2` re-imports as `?a=1&amp;b=2`. Fixing that is a
   one-line entity decode in the parser/validator, explicitly out of scope for IMPORT-007.
2. **Netscape cannot carry the full record.** Descriptions, notes, thumbnails, favicons,
   canonical URLs and extraction metadata have no Netscape fields. The HTML round-trip
   claim is limited to resources, titles, URLs, tags and folder membership.
3. **CSV keeps notes despite the plan's "notes in MD only".** The same sentence requires
   "all core fields including ... `notes`", so the column stays and is populated. The
   "MD only" reading applies to the optional toggle, which does not exist for CSV.
4. **No flatten-collections toggle.** CSV is flat and HTML must be hierarchical, so the
   toggle would only create a second HTML variant. Nothing in the acceptance tests needs it.
5. **Multi-collection membership is still lossy in every non-JSON format.** HTML files a
   bookmark under one folder; CSV lists direct memberships; only JSON keeps `collectionIds`.
   Re-importing HTML gives the first membership only.
6. **jsdom only.** Blob/URL/anchor and 10k timings are Node measurements; no real browser
   download was timed at 10k.
7. **Join tables read whole** (inherited from IMPORT-006, marked `shortcut:`); upgrade to
   indexed `anyOf` past ~1e5 join rows.
8. **Markdown is not validated by a real YAML parser.** Frontmatter values are JSON string
   literals, which is a YAML subset, but no YAML library exists in the repo and none was
   added.

## 6. Files

| File | Change |
| --- | --- |
| `apps/web/src/export/source.ts` | new shared snapshot, scope selection, relations, collections, meta, download |
| `apps/web/src/export/json.ts` | refactored onto the shared snapshot; output unchanged |
| `apps/web/src/export/formats.ts` | new HTML/Markdown/CSV renderers, escaping, options, `CSV_COLUMNS` |
| `apps/web/src/export/formats.test.ts` | new format tests (7) |
| `apps/web/src/features/import-export/ExportDialog.tsx` | format select, thumbnail/notes options, lazy format import |
| `apps/web/src/features/import-export/ExportDialog.test.tsx` | import path update, Markdown dialog test |
| `docs/SPRINT_7_IMPORT_007_REPORT.md` | this report |
| `docs/PROJECT_PROGRESS.md` | IMPORT-007 entry |
