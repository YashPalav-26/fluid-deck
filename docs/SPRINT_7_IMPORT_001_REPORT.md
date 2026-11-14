# Sprint 7 - IMPORT-001 Implementation Report (HTML Bookmark Parser)

*Date: 2026-11-14 - Scope: IMPORT-001 - no schema change, no new dependency, no UI.*
*Reconstructed in M9-006 from the committed code, tests and fixtures. No result in this report is
newly measured: every number below is either read from the committed source or from a recorded
verification run named in section 6.*

## 1. Scope and verdict

IMPORT-001 is the Netscape bookmark parser: browser HTML exports in, Fluid Deck resource entities
out. It is the first stage of the import pipeline
(parser -> validator -> preview -> committer) and the only stage that has to cope with
browser-specific HTML.

**Verdict: PASS WITH CONDITIONS.** The plan's criterion is met - Chrome, Firefox and Edge
fixtures parse into the approved entity shape, folder hierarchy is preserved, title / URL /
description / type are extracted, and malformed HTML does not crash the parser. The conditions
are documented format limits (section 5), not defects.

## 2. Acceptance criterion (approved plan)

> Chrome/FF/Edge HTML fixtures parse correctly; preserves folder hierarchy as collections;
> extracts title, URL, description, type; no crashes on malformed tags.

| Part | Result | Evidence |
| --- | --- | --- |
| Chrome / Firefox / Edge fixtures parse | PASS | `apps/web/src/import/parser.test.ts` - 18 tests over the three browser fixtures plus the malformed fixture |
| Folder hierarchy preserved as collections | PASS | nested `describe("Collections extraction")` and the folder-tree/membership work in `a0f053a` / `1414fc6` (see section 4) |
| Title, URL, description, type extracted | PASS | `parseHtmlBookmarks` returns `ParsedHtmlBookmark` (resource entity shape + import-only `folderId`); `type` defaults to `"other"` |
| No crash on malformed tags | PASS | `describe("Malformed HTML")`: "does not crash; only parses valid entries" and "skips bookmarks without HREF" |

## 3. Implementation

`apps/web/src/import/parser.ts` (311 lines, no imports - a pure token scan, no dependency):

- **Token scan.** One regular expression (`TOKEN_RE`) walks the document in structural order:
  `<dl>`, `</dl>`, `<dt>`, `<h3>`, `<a>`, `<p>`, `<dd>`. Order matters: `<dl>`/`<dt>` are matched
  before the generic text patterns, and `<dd>` ends at the next structural tag because browsers
  auto-close it there.
- **Folder stack.** `<DL><p>Name</p>` and `<DT><H3>Name</H3>` push a folder; `</dl>` pops it. Every
  bookmark therefore carries the id of the folder it was exported in, including nested folders.
  Root bookmarks are filed into a synthesized `Unorganized` folder.
- **Entity decoding.** `decodeEntities` decodes named / decimal / hex entities **once**, so
  `&amp;amp;` becomes `&amp;` and never `&`. It mirrors what the browser already did to the
  document, so the parser sees the text the exporter meant instead of the sanitizer's
  re-escaped serialization.
- **Attributes.** `HREF_RE` (required), `REL_RE` (tags), `TAGS_RE` (Netscape `TAGS="a,b"`).
- **Shape.** `ParsedHtmlBookmark extends ResourceEntity` plus `folderId`, which is import-only
  metadata consumed by `validateHtmlImport` and never written to Dexie. `source` is always
  `"import"`, `type` defaults to `"other"`, `extractionStatus` is `"complete"`, `notes` is `""`.

## 4. Files and history

| File | State | Commit |
| --- | --- | --- |
| `apps/web/src/import/parser.ts` | tracked | `a0f053a` (created, with the folder tree), entity/`TAGS`/`<DD>` handling in `4af7fb2` |
| `apps/web/src/import/parser.test.ts` | tracked | `76cd963` (tracked during the M8 repository-integrity repair; the file existed as untracked Sprint 6 work before) |
| `e2e/fixtures/import/html/chrome-bookmarks.html` | tracked | `41e0aa5` |
| `e2e/fixtures/import/html/firefox-bookmarks.html` | tracked | `d72478f` |
| `e2e/fixtures/import/html/edge-bookmarks.html` | tracked | `6e136eb` |
| `e2e/fixtures/import/html/malformed.html` | tracked | `f801c35` |

The parser's folder-tree work was carried forward into IMPORT-004/005
(`a0f053a`, `1414fc6`, `8502964`): IMPORT-004 created the folder rows but filed nothing into
them, so IMPORT-005's parser revision gave every bookmark a `folderId` and the validator mapped
folders to collections.

## 5. Known limitations

1. **No Safari fixture.** Safari exports the same Netscape format, so the parser covers it, but
   the repository has no Safari fixture and no Safari run. FR-IEX-001 names Safari; the coverage
   is by format, not by a proven fixture.
2. **HTML metadata is dropped by the sanitizer allowlist** (`ADD_DATE`, `ICON` and similar
   Netscape attributes) - an IMPORT-003 policy, not a parser bug.
3. **`<DD>` descriptions attach to the preceding bookmark.** A `<DD>` that precedes any `<DT>`
   has nothing to attach to and is skipped.
4. **The parser is a token scan, not `DOMParser`.** It is deliberately dependency-free and
   tolerant of broken markup, but it is not a general HTML parser: it understands the Netscape
   subset and nothing else.
5. **Entities are decoded once, after sanitization.** That ordering is what makes
   `&#106;avascript:` decodable and then rejectable by `canonicalizeUrl` - it is a security
   property, not a convenience.

## 6. Verification

| Check | Result | When |
| --- | --- | --- |
| `pnpm vitest run apps/web/src/import/parser.test.ts` | **18 tests passed** (Chrome 7, Firefox 3, Edge 2, malformed 2, tags 2, collections 2) | recorded in the M9-006 audit |
| Full unit suite (clean clone of `460b7cf`) | 57 files / 499 tests passed | M9-005 |
| `pnpm --filter @fluid-deck/web typecheck` | 0 errors | M9-005 |

No test was written or changed for this report; the parser's own suite is the evidence.

## 7. Handoff

IMPORT-001 feeds IMPORT-003 (`validateHtmlImport` consumes `folderId`, entity shape and the
sanitizer) and, through it, IMPORT-004/005 (batches, preview, conflict resolution). The
round-trip behaviour of the parsed data is proven by IMPORT-008's browser and unit suites.
