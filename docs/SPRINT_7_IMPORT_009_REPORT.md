# Sprint 7 - IMPORT-009 Implementation Report (Import Screens and Repository Integrity)

*Date: 2026-11-12 - Scope: IMPORT-009 - No schema change, no new dependency, no export change.*
*Verified on the real browser/IndexedDB path (Playwright), not jsdom only.*

## 1. Scope and verdict

IMPORT-009 is the screen layer of the import pipeline: the plan asks for a file picker, a
per-batch progress indicator, an error summary modal on parse failure, per-conflict resolution
and a working re-run. The task brief widened it to the whole import workflow (selection, format
detection, validation errors *and* warnings, preview, conflicts, progress, checkpoint resume,
completion/failure, safe dismissal, Settings integration, accessibility, responsive layout) and
added a repository-integrity prerequisite.

Two pieces of work were done, in this order:

1. **Repository integrity (section 2).** `apps/web/src/import/raindrop.ts` - the approved
   IMPORT-002 parser - was untracked in the working tree while the *committed* `validate.ts`
   already imported it, so `HEAD` could not build. It was verified, tracked in its own
   single-file commit, pushed, and the clean-clone gap re-measured.
2. **IMPORT-009 screens (section 3).** `ImportDialog.tsx` grew from a preview-only dialog into
   the full import workflow: picker -> validate -> preview (counts + warnings + conflicts) ->
   commit with live batch progress -> summary, plus a dismissible error summary with a working
   "Re-run", an "Import another file" exit, focus management and keyboard/responsive support.
   A new real-browser spec (`e2e/import-screens.spec.ts`) covers the screens against real
   IndexedDB in Chromium, Firefox and Edge.

No import logic was duplicated: the dialog still calls `validateHtmlImport` /
`validateRaindropImport` -> `previewImport` -> `commitImport`, and the conflict semantics,
persistence rules and checkpoint behaviour are untouched. Export is untouched.

**Verdict: PASS WITH CONDITIONS.** The plan's criterion is met and the import screens are
proven in three real browsers. The conditions are the clean-clone build gate (still red, caused
by *uncommitted Sprint 6 view-state work that is outside IMPORT-009's scope), the oversized-file
path being unit-covered only, and the absence of screen-reader / zoom evidence.

## 2. Repository integrity correction

### 2.1 Recorded baseline (before any change)

| Fact | Value |
| --- | --- |
| Local HEAD | `eaddbc6696202892eda1a29ebfcd7fbc07c827f1` |
| Remote HEAD (`origin/main`) | `eaddbc6696202892eda1a29ebfcd7fbc07c827f1` |
| Branch | `main` |
| Dirty / untracked entries | **82** |

The 82 entries were inspected only (`git status --porcelain`), never modified, staged or
discarded. They are Sprint 6 search work (`apps/web/src/services/search*.ts`,
`packages/core/src/view-state.ts`, `apps/web/src/services/library.ts`), Sprint 6 docs
(`docs/SPRINT_6_*`), `e2e/search-*.spec.ts`, `playwright.search-worker*.config.ts`,
`build_output.txt`, `git_diff.txt`, `lint_output.txt`, `test_output.txt`, `test_run.txt`,
`typecheck_output.txt`, `summary.txt`, `git_status.txt` and `poc/`. After the prerequisite the
count fell to 77, i.e. the 12 tracked files left the untracked set and **nothing else moved**.

### 2.2 Verification of `raindrop.ts`

- Header: `IMPORT-002 - Raindrop.io JSON export parser`; exports `parseRaindropPayload`,
  `parseRaindropJson`, `RaindropParseError`, and the parsed collection/tag/resource types.
- No `eval`, no `new Function`, no `fetch`, no `innerHTML`, no `TODO`/`FIXME`/`HACK`; 360 lines.
- **Required by committed code**: the committed `apps/web/src/import/validate.ts` imports
  `./raindrop.ts` (and `commit.ts`/`validate.ts` were already committed). Without the file,
  `HEAD` cannot even typecheck.
- The committed `validate.test.ts` and `commit.test.ts` read the raindrop fixtures, so the
  fixtures were required for a clean clone too.

### 2.3 Commits (one file each, pushed before IMPORT-009 work)

| Commit | File |
| --- | --- |
| `2c63ab9` | `apps/web/src/import/raindrop.ts` |
| `7ae8b54` | `apps/web/src/import/raindrop.test.ts` |
| `76cd963` | `apps/web/src/import/parser.test.ts` |
| `41e0aa5` | `e2e/fixtures/import/html/chrome-bookmarks.html` |
| `d72478f` | `e2e/fixtures/import/html/firefox-bookmarks.html` |
| `6e136eb` | `e2e/fixtures/import/html/edge-bookmarks.html` |
| `f801c35` | `e2e/fixtures/import/html/malformed.html` |
| `39b0943` | `e2e/fixtures/import/raindrop/small.json` |
| `b0fc453` | `e2e/fixtures/import/raindrop/large.json` |
| `c5b0675` | `e2e/fixtures/import/raindrop/malformed.json` |
| `0c3c3b2` | `apps/web/src/repositories/collections.ts` (only `export` added to `normalizeCollectionName`) |
| `287c661` | `apps/web/src/repositories/tags.ts` (only `export` added to `displayTagName`) |

The last two were **not** staged from the dirty working copy. They were rebuilt from the
`HEAD` blob (`git cat-file blob HEAD:<path>`), patched with exactly one `export` keyword, and
written into the index with `git hash-object -w --no-filters` + `git update-index --cacheinfo`.
That keeps the unrelated blank-line removal in `tags.ts` out of the commit.

Both `export` keywords are required by already-committed code: `import/commit.ts` imports
`normalizeCollectionName` from `repositories/collections.ts` and `import/validate.ts` imports
`displayTagName` from `repositories/tags.ts`. Without them the production build fails at
`src/import/commit.ts (27:2): "normalizeCollectionName" is not exported by
"src/repositories/collections.ts"`.

### 2.4 Clean-clone verification

Two clones of `origin/main` were made and installed with `pnpm install --frozen-lockfile`.

| Clone | HEAD | Result |
| --- | --- | --- |
| `clean-clone` | `c5b0675` | install OK; `pnpm build` **fails**: `normalizeCollectionName` not exported by `src/repositories/collections.ts` |
| `clean-clone2` | `287c661` | install OK; `pnpm vitest run apps/web/src/import` **90/90 passed**; typecheck **5 errors**; `pnpm build` **fails** |
| `cleanfix2` | `96de082` | install OK; typecheck **green**; `pnpm test` **46 files / 412 passed**; `pnpm build` **green** (entry 719.32 kB raw / 225.40 kB gzip) |

The third row is the follow-up repository-integrity task that resolved this condition: the
`viewDateBounds` / `domain` / `unorganized` seam was committed (`b710f8f`, `38a047e`, `c7bb069`,
`7df7528`) and the two `export/json.test.ts` type errors were fixed (`96de082`).

Remaining errors at `287c661` (all pre-existing, all caused by *uncommitted* Sprint 6 work):

```
src/export/json.test.ts(154,7)                TS2532 Object is possibly 'undefined'
src/export/json.test.ts(210,12)               TS2532 Object is possibly 'undefined'
src/export/source.ts(13,10)                   TS2305 no exported member 'viewDateBounds'
src/export/source.ts(96,12) / (96,78)         TS2339 property 'domain' does not exist
src/export/source.ts(98,12)                   TS2339 property 'unorganized' does not exist
```

and the build error:

```
src/export/source.ts (13:9): "viewDateBounds" is not exported by "src/services/library.ts"
```

`viewDateBounds` / `domain` / `unorganized` exist only in the **uncommitted** dirty
`apps/web/src/services/library.ts` and `packages/core/src/view-state.ts` (Sprint 6 view-state
feature). `HEAD` therefore cannot build the web app at all - a condition this task inherited and
is not allowed to fix (Sprint 6 work is out of scope and must not be committed here). The import
side of the tree is clean: `apps/web/src/import` is 90/90 green in the clean clone.

## 3. IMPORT-009 acceptance matrix

| Criterion (plan + task brief) | Result | Evidence |
| --- | --- | --- |
| File picker opens and selects a file | PASS | `apps/web/src/features/import-export/ImportDialog.tsx`; E2E "parse failure shows a dismissible error summary and re-run returns to the picker" (picker focused on open) |
| HTML and Raindrop JSON selection | PASS | Format detection by extension (`.json` -> raindrop validator, otherwise HTML validator); E2E uses a `.json` file, IMPORT-008 E2E uses `.html`; `parser.test.ts` / `raindrop.test.ts` cover both fixtures |
| Progress indicator increments per batch | PASS | native `<progress aria-label="Import progress">` fed by `commitImport`'s existing `onProgress`; text `Batch N: X of Y resources` in a `role="status"` live region. Component test: 600 rows -> 2 batches, batch line asserted. E2E: 1,200 rows -> 3 batches, `max="1200"` asserted |
| Error summary modal on parse failure | PASS | `role="alert"` block: title "This file could not be imported", the validator message, hint "File corrupted. Re-export from source.", `[Dismiss]` + `[Re-run]`. Unit + E2E |
| Error summary on commit failure | PASS | "Import stopped" + the `ImportCommitError` message + resume hint; `Re-run` returns to the preview so the checkpoint resumes |
| First 3 errors shown | PASS | `MAX_PROBLEMS = 3`, `messages.slice(0, MAX_PROBLEMS)` |
| Re-run resets state, picker re-enabled | PASS | Parse failure -> picker; commit failure -> preview (checkpoint resume, resolutions preserved); E2E asserts the picker is visible *and focused* after re-run |
| Dedup conflict: count + per-conflict radios (Skip / Update / Add to Collections) + Apply to all | PASS | Unchanged IMPORT-005 semantics, still driven by `previewImport` conflicts and `commitImport`'s `resolutions` map. Unit test asserts `Update metadata` patches the stored row |
| Validation warnings shown, not dropped | PASS | `validated.warnings` rendered in a `<details>` block (max 5 shown + "N more"); the preview count row "Skipped during validation" stays. Unit + E2E |
| Preview counts | PASS | New resources / Conflicts / Collections / Tags / Skipped; unit test asserts exact numbers, E2E asserts the count row is visible |
| Completion state | PASS | "Imported N new resources. X updated, Y added to collections, Z duplicates matched." + "Import another file" + "Done"; resume note when `result.resumedFrom > 0` |
| Safe dismissal / cancellation | PASS | Cancel/Dismiss close without writing (unit asserts row counts unchanged); Escape closes the idle dialog (E2E asserts 0 rows); the dialog refuses to close while a commit is in flight |
| Settings integration | PASS | `SettingsPage.tsx` -> "Import bookmarks" -> the same dialog (unchanged entry point; E2E drives it through Settings) |
| Reuse parser -> validator -> preview -> committer | PASS | The dialog only calls `validateHtmlImport`/`validateRaindropImport`, `previewImport`, `commitImport`; no import logic re-implemented |
| HTML hierarchy / nested collections / tags / JSON multi-collection preserved | PASS | Untouched pipeline; IMPORT-008 round-trip E2E (4 tests x 3 browsers) still green, including `Dev -> Tools` nesting and multi-membership |
| Export behaviour unchanged | PASS | No export file touched; IMPORT-008 export tests green in the same run |
| Accessible labels, keyboard navigation, visible focus | PASS (partial - see section 5) | labelled file input, `role="alert"`/`role="status"`/`role="progressbar"`, radio groups in `fieldset`/`legend`, `focus-visible` outlines, focus moved to the picker on open/re-run, Escape closes |
| Responsive layout | PASS | 375x667 viewport E2E: dialog inside the viewport, no horizontal overflow |
| Real Dexie / real IndexedDB, not only mocked UI | PASS | Playwright reads the app's real `fluid-deck` IndexedDB; component tests use the real Dexie test database |
| No M9 work, no schema change, no new dependency | PASS | Only `ImportDialog.tsx`, its test, the new E2E spec and the Playwright `testMatch` changed |

## 4. What changed

| File | Change | Commit |
| --- | --- | --- |
| `apps/web/src/features/import-export/ImportDialog.tsx` | Full import workflow: progress bar + batch status, warnings block, error summary with Dismiss/Re-run, completion summary with "Import another file", focus management, disabled conflict controls while committing | `c4c843b` |
| `apps/web/src/features/import-export/ImportDialog.test.tsx` | 3 -> 7 tests: per-batch progress (600 rows), error summary dismiss/re-run, validation warnings, summary -> picker | `9264615` |
| `e2e/import-screens.spec.ts` | New: 5 real-browser tests (error summary + re-run, batch progress + completion, partial warnings, Escape dismissal, 375px viewport) | `72195e4` |
| `playwright.import-export.config.ts` | `testMatch` widened to `/import-(export\|screens)\.spec\.ts/` so the new spec runs in the same Chromium/Firefox/Edge matrix | `62dd922` |
| `docs/SPRINT_7_IMPORT_009_REPORT.md` | This report | (this commit) |
| `docs/PROJECT_PROGRESS.md` | IMPORT-009 entry spliced into the `HEAD` copy of the file (the working copy holds unrelated Sprint 6 edits, which stay uncommitted) | `456c2fc` |

Every commit contains exactly one file. The 12 prerequisite commits are in section 2.3.

Behaviour notes:

- **Format detection** is by file extension (`.json` -> Raindrop validator, otherwise the HTML
  validator), matching what the app can actually re-import.
- **Progress** reuses `commitImport`'s existing `onProgress` callback; no new commit logic.
- **Re-run after a failed commit** returns to the *preview*, not the picker, so the saved
  checkpoint is resumed and already-chosen resolutions are reused. Re-run after a *parse*
  failure returns to the picker.
- **Dismissal during an active commit** is refused, so a half-written import cannot be
  abandoned silently.

## 5. Import UX and accessibility coverage

Covered:

- The file input has a real label ("Bookmark file"); the file type is restricted with
  `accept=".html,.htm,.json,text/html,application/json"`.
- The error summary is an `role="alert"` region with an `aria-labelledby` title, so it is
  announced when it appears; the progress line is a `role="status" aria-live="polite"` region;
  the progress bar is a native `<progress aria-label="Import progress">`.
- Conflicts are grouped in `fieldset`/`legend` with radio inputs named per conflict, so arrow
  keys move inside a group and the group is announced.
- Focus is moved to the file input when the dialog opens and after a re-run; Radix
  `DialogShell` provides the focus trap, Escape handling and focus restore.
- Interactive controls carry `focus-visible` outlines; controls are disabled while a commit is
  running so they cannot be operated mid-write.
- Layout: the dialog is `w-[calc(100vw-2rem)] max-w-md` with `max-h-[85dvh]` and internal
  scrolling, verified at 375x667 with no horizontal overflow.

**Not covered (so not claimed):**

- No screen-reader run (NVDA / VoiceOver). Nothing here is evidence of WCAG conformance; the
  markup is semantic and labelled, but spoken output is unverified.
- No zoom / reflow test at 200% or 400%, and no high-contrast or forced-colours check.
- No keyboard-only walkthrough of the conflict list beyond the native radio-group behaviour
  (Radix's focus trap is inherited and was exercised by the Escape test).
- Oversized-file rejection (> 20 MB Raindrop / > 50 MB HTML) is covered by
  `validate.test.ts` only, not by a browser test.

## 6. Test and build results

| Gate | Result |
| --- | --- |
| `pnpm vitest run apps/web/src/features/import-export` | **10/10 passed** (7 ImportDialog + 3 ExportDialog), repeated runs stable |
| Full `pnpm test` | **481 passed / 56 of 57 files**; the only failing file is the pre-existing `apps/web/src/services/search.test.ts` transform failure (`import "fake-indexeddb/auto"` inside a test body). Run twice, identical result |
| `pnpm --filter @fluid-deck/web typecheck` | 5 errors - the same 5 pre-existing ones (3 in `search.test.ts`, 2 TS2532 in `export/json.test.ts`); **no new error** |
| `pnpm exec eslint` on the 4 touched files | clean |
| `pnpm exec prettier --check` on the 4 touched files | clean (1 file reformatted) |
| `pnpm build` | exit 0 (web 10.49 s, extension chrome-mv3 + firefox-mv3) |
| `git diff --check` | exit 0 (CRLF warnings only) |
| `pnpm exec playwright test --config playwright.import-export.config.ts` | **27/27 passed (1.0 min)** - 9 tests x 3 browsers (Chromium 159, Firefox from Playwright 1.65, Edge 157) |
| Clean clone at `287c661` | `pnpm install --frozen-lockfile` OK; `apps/web/src/import` **90/90**; typecheck 5 pre-existing errors; build fails on the uncommitted Sprint 6 `viewDateBounds` |

Baseline before this task was 477 passed / 56 of 57 files. The delta is exactly the 4 new
component tests.

Browser timings from the final run (wall clock, real IndexedDB): Firefox 1,200-item import
**17,720 ms**, export **574 ms**; Chromium/Edge ~10-13 s per test. Single runs, no percentiles.

### Bundle

| Chunk | Before (IMPORT-008) | After (IMPORT-009) |
| --- | --- | --- |
| entry | 768.27 kB raw / 240.47 kB gzip | **771.32 kB raw / 241.30 kB gzip** (+3.05 / +0.83) |
| lazy `formats-*.js` | 4.48 kB / 1.80 kB gzip | 4.48 kB / 1.80 kB gzip (unchanged) |
| `search.worker-*.js` (separate worker) | 116.43 kB raw | 116.43 kB raw (unchanged) |

Budget is 250 kB gzip: **8.70 kB headroom** remains. The growth is the import screen UI only.
The E2E spec and the Playwright config never enter the app bundle.

## 7. Limitations and conditions

1. **Clean-clone build: was red, now green.** At the time of this report `origin/main` could
   not build the web app because `src/export/source.ts` imports `viewDateBounds` from the
   uncommitted Sprint 6 `services/library.ts`. A follow-up repository-integrity task committed
   the seam (`b710f8f`, `38a047e`, `c7bb069`, `7df7528`) and fixed the two
   `export/json.test.ts` type errors (`96de082`); a fresh clone of `96de082` installs,
   typechecks, tests (412 passed) and builds cleanly. The Sprint 6 *search* work is still
   uncommitted and is not needed for the build.
2. **Oversized files** are rejected by `validate.ts` (unit-covered) but no browser test
   uploads a >20 MB file.
3. **No screen-reader or zoom evidence.** Accessibility is claimed at the markup/label/focus
   level only (section 5).
4. **Progress text is transient.** The batch line only appears once the first 500-row
   transaction resolves; under a loaded full-suite run that exceeds the 1 s Testing Library
   default, so the component test asserts it with an explicit 20 s timeout (test timeout 30 s).
   A real browser has no such problem - the E2E sees the batch line every time.
5. **JSON does not preserve `source`, extraction metadata or `lastOpenedAt`** (documented in
   IMPORT-008, section 3.1) - unchanged by this task.
6. **HTML carries only the first membership** and no notes/thumbnail/favicon - a format limit,
   documented in IMPORT-008.
7. **Single-run browser evidence.** Timings and green results are one run per browser on this
   machine; traces are `retain-on-failure` only.
8. **`Import another file` keeps the dialog open** and resets to the picker. There is no
   "import several files in one dialog session" flow - it was not asked for.

## 8. Remaining risks

| Risk | Impact | Mitigation / status |
| --- | --- | --- |
| `HEAD` does not build (Sprint 6 view-state work uncommitted) | High for "clone and run" | Out of IMPORT-009 scope; documented above and in PROJECT_PROGRESS. Needs a Sprint 6 commit |
| A user closes the tab mid-import | Low | Batches are transactional and the checkpoint is durable; re-running resumes idempotently (IMPORT-004) |
| Progress text is not announced for very fast imports | Low | The native `<progress>` element plus the live region are both in the DOM during the commit; verified in the browser |
| No screen-reader verification | Medium | Marked as a condition; a full a11y pass is an M9 item |
| 100k-record upper limit only unit-covered | Low | `IMPORT_LIMITS` is enforced in the validator, not in the UI |

## 9. M8 completion verdict

**M8: PASS WITH CONDITIONS.**

- IMPORT-001..009 are implemented, verified and (for 001-008) committed; IMPORT-009's files are
  committed in this checkpoint.
- The clean-clone-equivalent build gate was **red** here for reasons that belong to Sprint 6,
  not to M8's code. A follow-up repository-integrity task closed it: the `viewDateBounds` /
  `domain` / `unorganized` seam and the two `export/json.test.ts` type errors were committed
  (`b710f8f`, `38a047e`, `c7bb069`, `7df7528`, `96de082`), and a fresh clone of `96de082`
  installs, typechecks, tests (412 passed) and builds cleanly.
- The other conditions (no screen-reader/zoom evidence, oversized-file path unit-covered only,
  format fidelity losses documented in IMPORT-008) are known and tracked, not blockers.
