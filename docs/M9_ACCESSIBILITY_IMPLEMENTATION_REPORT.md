# M9 WS-A - Accessibility Implementation Report (Search and Import/Export)

*Date: 2026-11-14 - Scope: the search experience and the import/export dialogs. The findings and
their severity are in `docs/M9_ACCESSIBILITY_AUDIT.md`; this report records what was changed,
how it was verified, and what remains unverified.*

## 1. Verdict

**WS-A implementation: COMPLETE for everything automatable in this environment.**
The nine verified defects (A1-A9) are fixed, the fixes are covered by unit and browser tests,
and the full regression matrix is green. **Automated accessibility is not WCAG conformance:** no
screen reader and no real browser zoom were available here, so those two checks are recorded as
**NOT VERIFIED** (section 6).

## 2. What changed, and what it looks like now

| ID | Component | Before | After |
| --- | --- | --- | --- |
| A1 | `ImportDialog` completion | The "Import now" button unmounted; focus fell to `<body>` and the result was never announced | The summary is a focusable `role="status"` paragraph; an effect moves focus to it |
| A2 | `ImportDialog` failure | The file input unmounted; focus fell to `<body>` | The error heading is `tabIndex={-1}` and takes focus |
| A3 | `DialogShell` (shared) | Closing the dialog left focus on `<body>` - these dialogs have no Radix `Dialog.Trigger` to restore to | The shell remembers the last focused element outside the dialog and refocuses it in `onCloseAutoFocus` |
| A4 | `SearchStatus` | The error case returned a *different* root (`role="alert"`), re-creating the live region | One stable `role="status" aria-live="polite"` region; the error is a nested `role="alert"` inside it |
| A5 | `ExportDialog` | The error was rendered below the action buttons; the busy state was silent | The error moved to the top of the dialog body; a `role="status"` line announces "Exporting your library…" |
| A6 | `SearchFilters` | Facet counts used `text-slate-400` (~2.6:1 on white) - axe `color-contrast`, serious | `text-slate-500 dark:text-slate-400` (~4.8:1 light, ~6.4:1 dark) |
| A7 | `ResourceCard` | The card title was an `<h3>` under the page `<h1>` - axe `heading-order`, moderate | The card title is an `<h2>` |
| A8 | `ImportDialog` conflicts | A visually truncated legend exposed only the truncated text | The legend carries a `title` attribute with the full title/URL |
| A9 | `ExportDialog` buttons | Focus rings fell back to the browser default | Explicit `focus-visible:outline-2 focus-visible:outline-offset-2` |

No behaviour was removed, no shortcut or command-palette behaviour was touched, and no dependency
was added. The axe scanner used (`@axe-core/playwright`) was already a workspace dev dependency.

### Files changed

| File | Change |
| --- | --- |
| `apps/web/src/features/dialogs/DialogShell.tsx` | Focus restoration (A3) |
| `apps/web/src/features/import-export/ImportDialog.tsx` | Error/completion focus + live region, conflict legend title (A1, A2, A8) |
| `apps/web/src/features/import-export/ExportDialog.tsx` | Error placement, busy status, focus rings (A5, A9) |
| `apps/web/src/features/search/SearchStatus.tsx` | Single stable live region (A4) |
| `apps/web/src/features/search/SearchFilters.tsx` | Facet count contrast (A6) |
| `apps/web/src/features/library/ResourceCard.tsx` | Heading order (A7) |
| `apps/web/src/features/search/SearchStatus.test.tsx` | +1 test: the live region element survives the switch to the error state |
| `apps/web/src/features/import-export/ImportDialog.test.tsx` | +2 tests: focus moves to the error heading / to the completion summary |
| `e2e/accessibility.spec.ts` | New browser suite: axe, keyboard/focus, live region, reflow (7 tests) |
| `docs/M9_ACCESSIBILITY_AUDIT.md` | Audit: findings A1-A10, reflow measurements, explicit gaps |
| `docs/M9_ACCESSIBILITY_IMPLEMENTATION_REPORT.md` | This report |

### Commits (one file per commit, in order)

| Commit | File |
| --- | --- |
| `031f0ca` | `apps/web/src/features/import-export/ImportDialog.tsx` |
| `3c93d24` | `apps/web/src/features/dialogs/DialogShell.tsx` |
| `2933eb8` | `apps/web/src/features/import-export/ExportDialog.tsx` |
| `ce23dee` | `apps/web/src/features/search/SearchStatus.tsx` |
| `bde2f12` | `apps/web/src/features/search/SearchFilters.tsx` |
| `2acc680` | `apps/web/src/features/library/ResourceCard.tsx` |
| `47a0f46` | `apps/web/src/features/import-export/ImportDialog.test.tsx` |
| `97d518e` | `apps/web/src/features/search/SearchStatus.test.tsx` |
| `5a97360` | `e2e/accessibility.spec.ts` |
| `8d2ec2c` | `docs/M9_ACCESSIBILITY_AUDIT.md` |
| this report | `docs/M9_ACCESSIBILITY_IMPLEMENTATION_REPORT.md` |

## 3. Automated accessibility evidence

### 3.1 axe

`e2e/accessibility.spec.ts` runs `AxeBuilder` against the live app (real IndexedDB, seeded
resources) and fails on **any** violation of any impact level - there is no impact filter and no
allow-list. Scanned surfaces: `main` (the search screen), `[role="search"]` (the header search
region), `[role="dialog"]` for the import dialog and for the export dialog.

Before the fixes, the scan of the search screen reported:

- `color-contrast` (serious) on the facet count spans
- `heading-order` (moderate) on the resource card titles

After the fixes the same scan reports **zero violations** on all four surfaces.

**Documented exception (exact scope):** the two dialog scans are skipped in **Firefox only**,
because axe-core crashes the Firefox page while a Radix dialog is open in this environment
(`frame.evaluate: Page crashed`, reproduced on every run). Chromium and Edge scan both dialogs.
Every other check in the file - keyboard, focus, live region, reflow - runs in all three browsers.

### 3.2 Keyboard and focus

| Check | Where | Result |
| --- | --- | --- |
| `/` focuses the search box | browser test | pass (all 3 browsers) |
| Escape clears the query and returns to browsing | browser test | pass (all 3 browsers) |
| Every interactive control has an accessible name ("Clear search", "Type", "Sort") | browser test | pass (all 3 browsers) |
| The result count lives in a polite live region (`role="status"`, `aria-live="polite"`) | browser test + unit test | pass (all 3 browsers) |
| The import dialog is a labelled modal (`role="dialog"`, accessible name "Import bookmarks") | browser test | pass (all 3 browsers) |
| Initial focus is the file input | browser test | pass (all 3 browsers) |
| A parse failure is announced (`role="alert"`) **and takes focus** | browser test + unit test | pass (all 3 browsers) |
| Escape dismisses the dialog and focus returns to the trigger button | browser test | pass (all 3 browsers) |
| The completion summary takes focus and is a `role="status"` region | unit test | pass |

### 3.3 Reflow at 200%, 300% and 400%

Zoom is emulated the way the reflow criterion is measured: the layout viewport is reduced to the
CSS size the content would have at that zoom level (1280 px reference -> 640 / 427 / 320 CSS px).

| Zoom | Search header | Filters | Import dialog | Horizontal overflow |
| --- | --- | --- | --- | --- |
| 200% (640 px) | input visible, inside the viewport | controls visible, wrapping | dialog fits the viewport, file input visible | none |
| 300% (427 px) | same | same | same | none |
| 400% (320 px) | same | same | same | none |

The browser tests assert the input stays inside the viewport, the filter controls stay visible,
the dialog is no wider than the viewport, and that
`document.documentElement.scrollWidth - clientWidth <= 1` (no unintended horizontal scrolling).

## 4. Regression results

| Suite | Command | Result |
| --- | --- | --- |
| Focused unit tests (search, import/export, dialogs, library) | `pnpm vitest run apps/web/src/features/search apps/web/src/features/import-export apps/web/src/features/dialogs apps/web/src/features/library` | PASS - 9 files / 42 tests |
| Full unit suite | `pnpm test` | PASS - **57 files / 502 tests** |
| Typecheck | `pnpm typecheck` | PASS - 5/5 workspaces, 0 errors |
| Lint | `pnpm exec eslint .` | PASS - exit 0, no findings |
| Format | `pnpm exec prettier --check <changed files>` | PASS |
| Production build | `pnpm build` | PASS - exit 0; web entry 772.36 kB raw / **241.50 kB gzip** (budget 250 kB gzip); search worker 116.43 kB lazy chunk; formats 4.48 kB lazy chunk |
| Accessibility browser suite | `pnpm exec playwright test e2e/accessibility.spec.ts --project=chromium --project=firefox --project=edge` | PASS - Chromium 7/7, Edge 7/7, Firefox 5 passed + 2 skipped (documented exception) |
| Standard Playwright acceptance suite | `pnpm exec playwright test --project=chromium --project=firefox --project=edge` | PASS - **99 passed / 4 skipped / 0 failed** (2.8-3.0 min) |
| Import/export browser matrix | `pnpm exec playwright test --config=playwright.import-export.config.ts` | PASS - **27 passed** |

Benchmark suites (`playwright.benchmark.config.ts`) were deliberately not run: they are
performance measurements, out of WS-A scope.

### 4.1 Browser-by-browser numbers

**Accessibility suite (`e2e/accessibility.spec.ts`, 7 tests):**

| Browser | Result |
| --- | --- |
| Chromium | 7/7 passed |
| Firefox | 5 passed + 2 skipped (the two dialog axe scans, documented exception) |
| Edge | 7/7 passed |

**Full default suite (all specs in `playwright.config.ts`):**

| Browser | Passed | Skipped | Failed |
| --- | --- | --- | --- |
| Chromium | 39 | 0 | 0 |
| Firefox | 28 | 4 | 0 |
| Edge | 32 | 0 | 0 |
| **Total** | **99** | **4** | **0** |

The four Firefox skips: the two WS-A dialog axe scans (documented exception) plus two
`search-worker.spec.ts` cases that already carry their own Firefox skip in that (untracked,
not WS-A-owned) spec.

**Import/export matrix (`playwright.import-export.config.ts`): 27 passed** across the three
browsers (Chromium, Firefox, Edge).

The first attempt at the full matrix produced 6 Chromium failures caused by running a second
Playwright invocation concurrently, which deleted the shared `test-results` artifact directory
mid-run (`ENOENT: ... traces/...-recording*.trace`). Re-run with nothing else executing: green.
That is recorded here because the raw numbers are otherwise unexplained.

## 5. What a screen reader would and would not get

This section is about semantics only. It is **not** a screen-reader test result.

| Announced content | Mechanism |
| --- | --- |
| Search result count, "Searching…", "Search index is still building (x of y indexed)" | one `role="status" aria-live="polite"` region in `SearchStatus` |
| Search failure | nested `role="alert"` inside the same region |
| Import progress | native `<progress aria-label="Import progress">` plus a polite `role="status"` line with "Batch n: x of y resources" |
| Import failure | `role="alert"` with `aria-labelledby` pointing at the error heading |
| Import completion | the focused `role="status"` summary paragraph |
| Import warnings | a `<details>`/`<summary>` whose text states the count |
| Export failure / busy state | `role="alert"` and `role="status"` |

## 6. NOT VERIFIED - manual checks this environment cannot perform

| Check | Why it is not verified | How to close it |
| --- | --- | --- |
| Screen-reader output (NVDA / JAWS / VoiceOver) | No screen reader is installed on this machine, and a headless browser cannot speak. The automated checks prove names, roles, live-region semantics and focus targets - not what is actually spoken. | Manual pass on Windows with NVDA (and VoiceOver on macOS) over the search, import and export flows, recording the spoken output step by step |
| Real browser zoom at 200/300/400% | Zoom was emulated by reducing the layout viewport. That reproduces the reflow but not the browser's own zoom pipeline (scroll anchoring, form-control scaling, text-only zoom). | Repeat the three levels with the browser zoom control and record the result |
| Forced colours / high contrast | Not exercised | A forced-colours pass checking the focus rings and the status cues |
| Pointer target size (WCAG 2.5.8) | axe does not measure target size; the small "clear" glyph button in the search header is a candidate | Measure the targets and enlarge them if needed |
| Assistive-technology announcement ordering | The live-region *content* order was designed, but whether a given screen reader speaks it in that order was not observed | Covered by the screen-reader pass above |

Nothing in this report should be read as a WCAG conformance claim.

## 7. Remaining limitations

1. The Firefox dialog axe scans do not run (documented exception, exact scope above).
2. The screen-reader and real-zoom passes remain open - they are the two conditions on this
   workstream.
3. The library grid, the collections/tags panels and the command palette were audited only to the
   extent that the search screen renders them; the grid's own layout was not re-tested at 400%.
4. The export scope gaps (`Current Filter`, `Selected`, flatten-collections) and the performance
   workstream are explicitly **not** touched here.

## 8. WS-A acceptance verdict

**PASS WITH CONDITIONS.**

- All nine verified defects are fixed, with before/after evidence and regression coverage.
- The automated accessibility suite is green in Chromium, Firefox and Edge, with the exact scope
  of the single documented exception recorded.
- Typecheck, lint, format, the full unit suite and the production build are green.
- **Condition:** the screen-reader pass and the real 200/300/400% browser-zoom pass are
  **NOT VERIFIED** in this environment and remain open for a machine and an operator that can
  perform them. WS-A must not be reported as WCAG conformant until they are done.
