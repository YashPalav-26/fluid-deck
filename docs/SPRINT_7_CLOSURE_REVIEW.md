# Sprint 7 (M8) Closure Review - Import / Export

*Date: 2026-11-12 - Scope: M8 closure audit (documentation + evidence + Git history). No product code changed, no M9 work started.*

## 1. Executive verdict

**M8: PASS WITH CONDITIONS. M8 is CLOSED for planning purposes; the conditions below carry into M9 hardening.**

All nine IMPORT tasks are implemented, committed and verified against a clean clone of
`origin/main` at `97ccdb1` (this audit itself adds two documentation-only commits on top of that
HEAD - no code, test or config change). That HEAD installs with a frozen lockfile, typechecks in
all five workspaces, runs 412 unit tests green, builds for web + both extension targets, and runs
the browser suites green: **22/22 in the default Playwright config** and **27/27 in the dedicated
Chromium/Firefox/Edge import-export config**.

Two things prevent an unconditional PASS and are stated plainly here rather than buried:

1. **One new npm dependency was added** (`dompurify@^3.4.17`, commits `8eb27fb` + `1e0e841`),
   while the plan's technology decisions and definition-of-done both assert "no new npm
   dependencies". The plan and the readiness review were wrong about DOMPurify being present in
   the workspace; IMPORT-003's report already documented this. It is a single, justified
   addition (HTML sanitization has no built-in equivalent), not a scope failure.
2. **The export scope options `Selected` and `Current Filter` have no UI entry point.** They
   exist and are tested at service level, but the plan's definition-of-done lists four export
   scopes in the UI, and only `Everything` and `One collection` are reachable from Settings.
   `ExportDialog.tsx` even notes that the missing scopes "need the library chrome (IMPORT-009)",
   but IMPORT-009 was scoped to the *import* screens and never built that chrome. This is an
   open M8 gap, not a defect.

Neither condition blocks the import/export pipeline, which is what M8 delivers.

## 2. Method and evidence basis

Audited in this pass:

- Git history for the whole milestone: `4027425` (Sprint 5 close) -> `97ccdb1`, **65 commits**.
- The nine task reports (eight exist; IMPORT-001 has no report - see section 8),
  `docs/SPRINT_7_IMPLEMENTATION_PLAN.md`, `docs/SPRINT_7_READINESS_REVIEW.md`, the six
  `FR-IEX-*` PRD requirements, and the committed code/tests they point at.
- Commands **actually run in this audit** (nothing else was re-measured):
  - `git rev-parse HEAD` / `git ls-remote origin refs/heads/main` -> both `97ccdb1`.
  - `git log`, `git ls-files`, `git status --porcelain`, `git show --stat` over the milestone.
  - `pnpm exec playwright test --list` in a clean clone -> 22 tests in 7 files.
  - `pnpm test:e2e` in a clean clone -> **22 passed (32.2 s)**.
  - `pnpm exec playwright test --config playwright.import-export.config.ts` in a clean clone
    -> **27 passed (1.1 m)**.

Everything else cited below is **recorded evidence from the verification runs of the
implementation tasks** (IMPORT-009 and the repository-integrity repair), explicitly labelled as
such. No test suite, typecheck or build result is claimed as fresh unless it was run here.

## 3. Task-by-task acceptance matrix

| Task | Acceptance criterion (plan) | Evidence | Status |
| --- | --- | --- | --- |
| IMPORT-001 | Chrome/FF/Edge HTML fixtures parse correctly; folder hierarchy preserved; title/URL/description/type extracted; no crash on malformed tags | `apps/web/src/import/parser.ts` (`a0f053a`, fixed by `4af7fb2`); `parser.test.ts` (`76cd963`) over the Chrome/Firefox/Edge/malformed fixtures; folder tree + memberships (`1414fc6`, `8502964`, `a0f053a`); E2E HTML import in 3 browsers | **Met** (no written report - see section 8) |
| IMPORT-002 | Raindrop JSON fixtures parse; nested collections, tags, metadata preserved; canonical dedup capped; no crash on malformed fields | `apps/web/src/import/raindrop.ts` (`2c63ab9`), test (`7ae8b54`); report `docs/SPRINT_7_IMPORT_002_REPORT.md` (PASS WITH CONDITIONS) | **Met** |
| IMPORT-003 | Malformed rejected with descriptive errors; valid fixtures pass; DOMPurify sanitizes HTML; canonical dedup caps; 1k corpus | `apps/web/src/import/validate.ts` (`1414fc6`, `edf9cc7`); `validate.test.ts` (limits, unsafe schemes, prototype keys, depth cap, sanitization); report `SPRINT_7_IMPORT_003_REPORT.md` | **Met** (DOMPurify added as a dependency - section 8) |
| IMPORT-004 | 500-row batches; kill-mid-import -> resume, no duplicates; idempotent re-run | `apps/web/src/import/commit.ts` (`03d13fd`); `commit.test.ts`: 20 tests incl. "uses one batch for 500 rows and two batches for 501", "resumes after an interruption that happened after a committed batch", "rolls back the failing batch, keeps earlier batches and can retry", "is idempotent when the same import is committed twice", "rejects a concurrent commit in the same context" | **Met** |
| IMPORT-005 | Preview counts match commit; per-conflict resolution; "Apply to all" stores the choice | `apps/web/src/import/preview.ts` (`7799095`), conflicts inside the transaction (`03d13fd`), dialog (`d28ae4b`), Settings entry (`35b57ee`); `preview.test.ts` (7), `commit.test.ts` (+6), `ImportDialog.test.tsx` | **Met** |
| IMPORT-006 | Streaming JSON export; 10k <= 30 s; download start < 10 s; scope filtering | `apps/web/src/export/json.ts` (`9122b6d`), shared snapshot `export/source.ts` (`55918b2`), dialog (`9093d42`, `001ca42`); 10k export **1,194 ms** / 6.4 MB unit-measured; `json.test.ts` (5) | **Met** (service-level scopes only - section 8) |
| IMPORT-007 | HTML (Netscape + hierarchy), Markdown (frontmatter), CSV (flat, all core fields); thumbnails off by default; notes MD-only | `apps/web/src/export/formats.ts` (`1bf2828`, `61686f6`), dialog options (`e605c5a`, `ae01c23`); `formats.test.ts` (7) | **Met** (CSV keeps a notes column - documented divergence) |
| IMPORT-008 | Round-trip E2E green in Chrome/Firefox/Edge; library identical after re-import | `apps/web/src/import/roundtrip.test.ts` (`bdc28f2`, 8 tests), `e2e/import-export.spec.ts` (`455728d`, 4 tests), `playwright.import-export.config.ts` (`75e8143`); 1,200 items across 3 batches | **Met** |
| IMPORT-009 | File picker opens and selects; progress increments per batch; error summary modal on parse failure or dedup conflict; user can dismiss and re-run | `ImportDialog.tsx` (`c4c843b`), test (`9264615`), `e2e/import-screens.spec.ts` (`72195e4`), config widened (`62dd922`); report `SPRINT_7_IMPORT_009_REPORT.md` | **Met** |

## 4. Requirements traceability (PRD FR-IEX-001..006)

| Requirement | Statement | M8 coverage | Status |
| --- | --- | --- | --- |
| FR-IEX-001 | Import browser HTML bookmarks (Chrome/Firefox/Edge/Safari) | IMPORT-001 parser; Chrome/FF/Edge fixtures; Netscape format; Safari has no distinct export format, so it is covered by the Netscape parser | **Met** (Safari fixture absent - see section 8) |
| FR-IEX-002 | Import Raindrop.io JSON export with full fidelity | IMPORT-002 parser + validator; nested collections, tags, `collectionIds`, `faviconUrl` merged | **Met**, with documented losses: `source`, extraction metadata, `lastOpenedAt` are not read back; `type` maps to the core enum with an `"other"` fallback |
| FR-IEX-003 | Import preview with counts and conflict detection | IMPORT-005 preview + IMPORT-009 screens (counts, warnings, conflicts, apply-to-all) | **Met** |
| FR-IEX-004 | Export to JSON (full fidelity), HTML (Netscape + extensions), Markdown (frontmatter), CSV (flat) | IMPORT-006/007 exporters, shared snapshot, 4 formats, lazy `formats` chunk | **Met** |
| FR-IEX-005 | Export options: include thumbnails, include notes, flatten collections | Dialog exposes "Include thumbnails" (default off) and "Include notes (Markdown only)" (default on, disabled otherwise) | **Partial** - there is no flatten-collections toggle; CSV is always flat and HTML always hierarchical, so the option has no meaning in those formats |
| FR-IEX-006 | Duplicate conflicts at import with per-conflict and bulk resolution | Skip / Update Metadata / Add to Collections per conflict + apply-to-all; resolution re-checked inside the commit transaction; stale-preview test | **Met** (cross-tab concurrent import lock not implemented - inherited, section 8) |

### Plan definition-of-done checklist

| DoD item | Result |
| --- | --- |
| Import: HTML bookmarks parse correctly (3 browsers) | PASS |
| Import: Raindrop JSON preserves nested collections, tags, metadata | PASS (documented field losses) |
| Import: validation + sanitization rejects malformed; valid fixtures pass | PASS |
| Import: 500-row batch transactions with checkpoint resume; idempotent re-run | PASS |
| Import: preview + duplicate summary with per-conflict resolution | PASS |
| Export: JSON streaming, >1k resources, <= 30 s at 10k, download start < 10 s | PASS (10k export 1.2 s unit-measured) |
| Export: HTML (Netscape + hierarchy), Markdown (frontmatter), CSV (flat) | PASS |
| Export: scope options (All / Current Filter / Selected / Collection) | **PARTIAL** - All and Collection in the UI; Current Filter and Selected exist at service level only |
| Export: thumbnails off by default; notes MD-only | PASS (CSV keeps an empty notes column by design) |
| E2E round-trip green in Chrome/Firefox/Edge | PASS |
| `pnpm test` green | PASS in a clean clone (46 files / 412 tests); the dirty tree still fails one **untracked** Sprint 6 file |
| `pnpm typecheck` green (5/5 workspaces) | PASS in a clean clone; the dirty tree has 3 errors, all inside that same untracked Sprint 6 file |
| `pnpm build` green | PASS (web + chrome-mv3 + firefox-mv3) |
| `pnpm exec playwright test:e2e` green | PASS - **22/22 in the default config in a clean clone**, 27/27 in the 3-browser import-export config |
| Initial JS <= 250 kB gzip | PASS - 225.40 kB gzip in the clean clone; 241.30 kB in the dirty tree that carries the uncommitted Sprint 6 search UI |
| No new npm dependencies added | **DEVIATION** - `dompurify@^3.4.17` added in `8eb27fb` (+ lockfile `1e0e841`) |
| All 9 IMPORT acceptance criteria met with actual runs | PASS, except IMPORT-001 which has code + tests but no written report |
| Test fixtures verified against pre-existing fixtures (read-only) | PASS - the seven import fixtures were untracked pre-existing work; they were tracked byte-for-byte and never edited |
| Round-trip fidelity > 98% | **Interpreted, not measured as a percentage** - the round-trip tests assert *field-level equality* on every core field (URL, title, description, notes, type, thumbnail, favicon, tags, all memberships, collection tree), which is stronger than a 98 % threshold; no 1k/10k round-trip corpus was run (largest: 1,200 items in the browser, 600 in the unit suite) |

## 5. Verification evidence

### 5.1 Clean clone of the final HEAD (`97ccdb1`)

| Command | Result |
| --- | --- |
| `git clone https://github.com/YashPalav-26/fluid-deck.git` | `97ccdb1b14949551a52e2af6b298e06a760b9669` |
| `pnpm install --frozen-lockfile` | Done in 18.6 s, no lockfile drift |
| `pnpm typecheck` | 5/5 workspaces Done, 0 errors |
| `pnpm test` | **46 files / 412 tests passed**, 0 failed |
| `pnpm build` | exit 0 - web entry 719.32 kB raw / **225.40 kB gzip**; lazy `formats` chunk 4.48 kB / 1.80 kB gzip; extension chrome-mv3 426.17 kB, firefox-mv3 426.29 kB |
| `pnpm test:e2e` (default config) | **22 passed (32.2 s)** - includes the 4 IMPORT-008 and 5 IMPORT-009 specs |
| `pnpm exec playwright test --config playwright.import-export.config.ts` | **27 passed (1.1 m)** - 9 tests x Chromium / Firefox / Edge |

### 5.2 Dirty working tree (recorded during the repository-integrity repair, same HEAD)

- `pnpm test`: 481 passed / 56 of 57 files. The single failing file is
  `apps/web/src/services/search.test.ts` - **untracked Sprint 6 work**, not M8.
- `pnpm typecheck`: 3 errors, all inside that same untracked file.
- `pnpm build`: exit 0; entry 771.32 kB / 241.30 kB gzip (the tree also contains the
  uncommitted Sprint 6 search UI, which is not in `HEAD`).

### 5.3 Pipeline, formats, conflicts, resume, security (code + test anchors)

| Area | Where it lives | Evidence |
| --- | --- | --- |
| Parser -> validator -> preview -> committer | `import/parser.ts`, `import/validate.ts`, `import/preview.ts`, `import/commit.ts` | one pipeline; the UI never re-implements import logic |
| HTML folder hierarchy / nested collections | `parser.ts` folder tree -> `validate.ts` folder mapping -> `commit.ts` nested collection rebuild | `roundtrip.test.ts` "preserves representable fields, nested folders, tags and descriptions"; `commit.test.ts` "reconstructs nested collections and preserves sibling order" |
| Tags | per-resource tags + flat tag rows | `roundtrip.test.ts` "preserves resources, text, multi-collection memberships, tags and the tree" |
| JSON multi-collection membership | `collectionIds` merged in `validate.ts` | `roundtrip.test.ts` "keeps every membership through a repeated export/import cycle" |
| Conflict handling | `preview.ts` conflicts + `commit.ts` resolutions inside the transaction | `commit.test.ts`: skip / update / add-to-collections / mixed map / stale-preview revalidation; `roundtrip.test.ts` live + soft-deleted duplicates |
| Checkpoint + resume | `commit.ts` `ImportCheckpoint` in `localStorage`, fingerprint + index | `commit.test.ts` resume / rollback-and-retry / invalid-foreign-completed checkpoint; IMPORT-009 re-run path returns to the preview |
| Size + record + depth caps | `IMPORT_LIMITS` (HTML 50 MB, Raindrop 20 MB, 100k records, JSON depth 20) | `validate.test.ts` rejects over-cap files, accepts exactly the record cap, enforces the depth boundary |
| Sanitization | DOMPurify `sanitizeBookmarkHtml`, Zod schemas, prototype-key stripping | `validate.test.ts`: scripts/event handlers/`javascript:` hrefs stripped, unsafe schemes dropped with a warning, prototype keys stripped |
| Scheme safety after entity decoding | `canonicalizeUrl` rejects `javascript:` | `roundtrip.test.ts` "keeps unsafe HTML links out of the import" |

### 5.4 Performance (single runs, recorded during IMPORT-008/009 - not repeated here)

| Flow | Measurement |
| --- | --- |
| Import 1,200 items (3 batches) | Chromium 8,279 ms; Edge 8,452 ms; Firefox 16,655-17,720 ms |
| Export JSON (1,200 items) | 592-1,158 ms |
| Export 10,000 items (unit, fake-indexeddb) | 1,151-1,422 ms depending on format; 6.4 MB JSON blob |
| Import 10,000 items | **not measured in a browser** - extrapolation from 1,200-item runs (~7-15 ms/item) puts 10k at roughly 70-150 s, i.e. above the plan's *proposed* 30 s target |

## 6. Clean-clone integrity evidence

Two repository-integrity defects were found and closed during M8:

1. **Untracked required module.** `apps/web/src/import/raindrop.ts` (the approved IMPORT-002
   parser) was untracked while the *committed* `import/validate.ts` imported it, so `HEAD`
   could not typecheck or build. Closed by 12 single-file commits (`2c63ab9` ... `287c661`),
   including the seven import fixtures the committed tests read and two one-word `export`
   fixes (`0c3c3b2`, `287c661`) that committed code already depended on.
2. **Uncommitted Sprint 6 seam.** `apps/web/src/export/source.ts` (committed with IMPORT-007)
   imported `viewDateBounds` and read `view.domain` / `view.unorganized`, which existed only
   in the uncommitted Sprint 6 working tree, so `HEAD` failed to build with
   `"viewDateBounds" is not exported by "src/services/library.ts"`. Closed by 5 single-file
   commits (`b710f8f`, `38a047e`, `c7bb069`, `7df7528`, `96de082`): the two view-state facets,
   their tests, the shared `viewDateBounds` helper with browse-side filtering, and two
   "possibly undefined" type errors in the committed `export/json.test.ts`.

Result: a fresh clone of `97ccdb1` installs, typechecks, tests, builds and runs the browser
suites green (section 5.1). The Sprint 6 *search* work remains uncommitted and is outside M8's
acceptance surface; it is the only reason the dirty tree still shows one failing test file.

## 7. Limitations and residual risks (carried to M9)

| # | Limitation | Impact | Status |
| --- | --- | --- | --- |
| 1 | **No screen-reader evidence.** No NVDA/VoiceOver run; the import dialog's `role="alert"`, `role="status"`, `role="progressbar"`, labelled file input, `fieldset`/`legend` radio groups and focus handling are markup-level only | Accessibility is **not** claimed as conformant | Carried to M9 (manual pass, per the readiness review) |
| 2 | **No zoom / reflow evidence.** 375 px viewport is covered by E2E; 200-400 % zoom and forced-colours are not | Zoom regressions possible | Carried to M9 |
| 3 | **Oversized-file path is unit-covered only.** The >20 MB / >50 MB caps are tested in `validate.test.ts`; no browser test uploads a file that large | The user-facing rejection message is untested in a browser | Carried to M9 |
| 4 | **Single-run performance measurements.** No p95, no repetition; 10k import never measured in a browser and extrapolates above the proposed 30 s budget | Budget claim unproven at 10k | Carried to M9 |
| 5 | **Default Playwright suite.** `playwright.config.ts` has no `projects` and no `testIgnore`, so it runs Chromium only; the 3-browser matrix lives in `playwright.import-export.config.ts`. In the dirty tree the default suite also picks up the untracked Sprint 6 search benchmarks, which is why the dedicated config exists | Two configs to keep in sync; dirty-tree default run is not green | Documented; M9 should fold the matrix into one config |
| 6 | **Uncommitted Sprint 6 search work.** 75 dirty/untracked entries remain in the working tree (23 modified, 52 untracked), including the one failing test file and the `relevance` sort residue in `packages/core/src/view-state.ts` | The dirty tree is not a clean mirror of `HEAD` | Outside M8 acceptance; must be committed by the Sprint 6 owner |
| 7 | **DOMPurify is a new dependency** despite the plan's "no new dependencies" claim | Documentation/plan accuracy only; the dependency is justified and used in one place | Recorded; plan text should be corrected at M9 planning |
| 8 | **Export scopes `Selected` / `Current Filter` have no UI.** Service-level implementations exist and are tested; the plan's DoD expects four scopes in the UI | A user cannot export "current filter" or "selection" | **Open M8 gap** - close in M9 or amend the DoD |
| 9 | **No flatten-collections export option** (FR-IEX-005) | CSV is always flat, HTML always hierarchical | **Open gap**, same decision as #8 |
| 10 | **Format fidelity losses.** JSON drops `source`, extraction metadata and `lastOpenedAt`; HTML carries only the first membership and no notes/thumbnail/favicon; CSV keeps a notes column | Round-trip is lossy outside JSON | Documented in IMPORT-007/008; by design |
| 11 | **No cross-tab import lock.** A second tab can import concurrently (rows cannot duplicate thanks to the canonical-URL unique index, but counts and checkpoints can race) | Rare data-count drift | Inherited from IMPORT-004; M9 candidate |
| 12 | **Checkpoint is per browser profile** (`localStorage`) and fingerprinted with 64-bit FNV | Resume does not work across browsers/profiles; a collision needs the same format, size and content | Documented in IMPORT-004 |
| 13 | **Hash-route canonicalization.** `HASH_ROUTE_EXCEPTION_HOSTS` is empty by design (open U4 item), so two hash-routed pages on one host canonicalize to the same URL and collapse into one import row | Rare false-duplicate | U4 open item; already tracked as outstanding in PROJECT_PROGRESS |
| 14 | **Safari has no fixture.** FR-IEX-001 names Safari; Safari has no distinct bookmark format, so the Netscape parser covers it, but no Safari fixture or browser run exists | Unproven in name only | Acceptable; noted for completeness |
| 15 | **IMPORT-001 has no written implementation report** (code and tests exist) | Documentation gap in the report set | M9/M8 documentation follow-up |

## 8. Acceptance criteria without (or with partial) evidence

1. **Export scope options** - `Current Filter` and `Selected` are implemented and unit-tested
   at service level but have no UI entry point; the plan's DoD expects them in the UI
   (gap #8). `ExportDialog.tsx` still points at IMPORT-009 for the missing chrome, which was
   never built.
2. **Flatten-collections export option** (FR-IEX-005) - not implemented as a toggle; the
   per-format behaviour is fixed instead (gap #9).
3. **"No new npm dependencies"** - one dependency added (DOMPurify) (gap #7).
4. **Round-trip fidelity > 98 %** - proven as field-level equality rather than a measured
   percentage, and only at 600 (unit) / 1,200 (browser) corpus size, not 1k/10k.
5. **Import 10k within 30 s** - not measured in a browser; extrapolation exceeds the proposed
   budget (gap #4).
6. **Import 1k within 10 s** - met at 1,200 items on Chromium/Edge (8.3-8.5 s) but missed on
   Firefox (16.7-17.7 s).
7. **Accessibility conformance** - not claimed (gaps #1, #2).
8. **IMPORT-001 written report** - missing (gap #15).

Everything else in the plan's acceptance criteria has direct code + test evidence.

## 9. M8 closure decision

**Decision: M8 is CLOSED as PASS WITH CONDITIONS.**

- IMPORT-001..009 are implemented, committed on `main`, and verified against a clean clone of
  the final HEAD.
- The plan's core functionality checklist, the technical-quality checklist (with the two
  deviations recorded above) and the round-trip/three-browser E2E requirements are met.
- The conditions in section 7 are accepted as M9 hardening work, except gaps #8 and #9, which
  are small M8 product gaps and should be closed at the start of M9 (or the definition of done
  amended to state that two of the four export scopes are service-level only).
- No M9 work is started by this review.

### Recommended next milestone: M9 hardening

Priority order, derived from the gaps above:

1. **Accessibility pass** - screen-reader walkthrough of the import and export dialogs, plus
   200-400 % zoom/reflow and forced-colours checks, and an axe scan on the import screens
   (`@axe-core/playwright` is already a workspace dependency).
2. **Export scope completion** - expose `Current Filter` and `Selected` in the export dialog,
   and settle the flatten-collections question.
3. **Scale and performance** - a browser-level 10k import measurement, repeated runs with
   percentiles, and a decision on the 30 s budget (the 500-row batch size is the lever).
4. **Config consolidation** - one Playwright configuration with an explicit project matrix and
   `testIgnore` for the Sprint 6 benchmark specs, so the default `pnpm test:e2e` is green in
   the dirty tree too.
5. **Cross-tab safety** - an import lock (Web Locks API or a Dexie-backed lease) plus
   checkpoint hardening (stronger fingerprint, cross-profile guidance).
6. **Housekeeping** - commit or archive the 75 remaining Sprint 6 working-tree entries; correct
   the plan's "no new dependencies" wording; write the missing IMPORT-001 report.

## 10. Appendix - M8 commit inventory (65 commits, `4027425..97ccdb1`)

| Group | Commits |
| --- | --- |
| IMPORT-001 HTML parser + folder tree | `a0f053a`, `1414fc6`, `8502964` (+ `76cd963` test) |
| IMPORT-002 Raindrop parser | `2c63ab9`, `7ae8b54` |
| IMPORT-003 validation + sanitize | `1414fc6`, `8eb27fb`, `1e0e841`, `edf9cc7` |
| IMPORT-004 batch + checkpoint | `03d13fd` (+ `commit.test.ts`) |
| IMPORT-005 preview + conflicts + dialog | `7799095`, `6892455`, `03d13fd`, `5154dab`, `d28ae4b`, `fd660cc`, `35b57ee`, `9715a65`, `30eb2d3` |
| IMPORT-006 JSON export | `9122b6d`, `6cd9c74`, `9093d42`, `9fde283`, `001ca42`, `55918b2`, `ed26f0b`, `0d6cda0`, `06c489d` |
| IMPORT-007 HTML/Markdown/CSV export | `1bf2828`, `9c05134`, `e605c5a`, `ae01c23`, `9c095ec`, `8f05ff6` |
| IMPORT-008 round-trip E2E + fidelity fixes | `4af7fb2`, `edf9cc7`, `61686f6`, `d699154`, `8d40d1a`, `a86aa8d`, `bdc28f2`, `455728d`, `75e8143`, `ae20831`, `eaddbc6` |
| IMPORT-009 import screens | `c4c843b`, `9264615`, `72195e4`, `62dd922`, `456c2fc`, `19e808f` |
| Repository integrity (untracked required module + fixtures + exports) | `2c63ab9`, `7ae8b54`, `76cd963`, `41e0aa5`, `d72478f`, `6e136eb`, `f801c35`, `39b0943`, `b0fc453`, `c5b0675`, `0c3c3b2`, `287c661` |
| Clean-clone build repair | `b710f8f`, `38a047e`, `c7bb069`, `7df7528`, `96de082`, `9c70862`, `97ccdb1` |
