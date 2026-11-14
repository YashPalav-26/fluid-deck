# M9 WS-A - Accessibility Audit: Search and Import/Export

*Date: 2026-11-13 - Scope: the search experience and the import/export dialogs. Audit only for the
findings; the fixes are recorded in `docs/M9_ACCESSIBILITY_IMPLEMENTATION_REPORT.md`.*

## 1. Method

- Read the shipped components (`SearchInput`, `SearchFilters`, `SearchStatus`, `search-shortcuts`,
  `ImportDialog`, `ExportDialog`, `DialogShell`, `ResourceCard`) and their unit tests.
- Checked the ten audit dimensions: semantic HTML and accessible names, label/error
  association, keyboard navigation and focus order, focus trapping/restoration/Escape, live-region
  announcements, dynamic progress and result announcements, dialog semantics and dismissal, colour
  contrast and non-colour cues, reduced motion, responsive layout and reflow.
- Ran an axe scan (`@axe-core/playwright`, already a workspace dependency) over the search screen
  and both dialogs, in Chromium, against the real app with a seeded IndexedDB.

**Environment:** Windows 11, Node v26.13.0, Playwright 1.65.0, Chromium 159, Firefox
(Playwright bundled), Edge 157 (`channel: "msedge"`), Vite dev server on `127.0.0.1:5199`.

**Not available in this environment:** a screen reader (no NVDA/JAWS/VoiceOver), a manual zoom
control, and a physical keyboard-only operator. Those checks are recorded as **NOT VERIFIED**
below and in the implementation report.

## 2. Findings

Severity: **high** = a user of assistive technology loses the workflow or the information;
**medium** = a real barrier with a workaround; **low** = polish.

| # | Severity | Finding | Evidence | Status |
| --- | --- | --- | --- | --- |
| A1 | high | **Focus was lost when the import completed.** The "Import now" button unmounts when the completion summary replaces the preview, so focus fell back to the document and the result was never announced. | `ImportDialog.tsx` (the done branch replaces the preview block); reproduced in the browser: `document.activeElement` = `<body>` after a commit | **Fixed** - the summary is a focusable `role="status"` region and receives focus |
| A2 | high | **Focus was lost when an import failed.** The file input unmounts when the error summary replaced it, leaving the keyboard user with no position (the alert was announced, but focus was on the document). | Same reproduction path as A1 with a malformed file | **Fixed** - the error heading is focusable (`tabIndex={-1}`) and takes focus |
| A3 | high | **Focus was not restored when a dialog closed.** These dialogs are opened by plain buttons, not by a Radix `Dialog.Trigger`, so Radix had no trigger to restore focus to; after Escape the focus was on `<body>` instead of the "Import bookmarks" button. | Browser reproduction: after `Escape`, `document.activeElement` = `<body>` | **Fixed** in the shared `DialogShell`: the last focused element outside the dialog is remembered and refocused on close |
| A4 | medium | **The search status replaced its own live region on error.** `SearchStatus` returned a different element (`role="alert"`) for the error case and a `role="status"` element otherwise, so the live region was re-created instead of changing content - screen readers may never announce the error. | `SearchStatus.tsx` (two different roots) | **Fixed** - one stable `role="status" aria-live="polite"` region; the error is a nested `role="alert"` inside it |
| A5 | medium | **The export error was rendered below the action buttons.** It was announced (`role="alert"`), but a sighted user could miss it at the bottom of the dialog, and the export busy state was not announced at all. | `ExportDialog.tsx` | **Fixed** - the error moved to the top of the dialog content and a `role="status"` busy line was added |
| A6 | medium | **Facet counts failed contrast.** `text-xs text-slate-400` on white is about 2.6:1, below the 4.5:1 requirement; axe reported `color-contrast` (serious) on the "(1)" count. | axe scan of the search screen | **Fixed** - `text-slate-500 dark:text-slate-400` (about 4.8:1 light, 6.4:1 dark) |
| A7 | low | **Heading order jumped a level.** The grid card title was an `<h3>` under the page's `<h1>`, which axe reported as `heading-order` (moderate). | axe scan of the search screen | **Fixed** - the card title is now an `<h2>` |
| A8 | low | **A truncated conflict title had no full-text alternative.** The conflict legend is visually truncated (`truncate`); the full text is only available to a screen reader. | `ImportDialog.tsx` | **Fixed** - `title` attribute with the full title/URL |
| A9 | low | **The export dialog buttons had no explicit focus ring.** They fell back to the browser default outline, which is visible but inconsistent with the rest of the app. | `ExportDialog.tsx` | **Fixed** - `focus-visible:outline-2 focus-visible:outline-offset-2` |
| A10 | - | Radix does **not** set `aria-modal` on the dialog content; it traps focus and hides the rest of the page with `aria-hidden` instead. | rendered DOM inspection | Not a defect - the test asserts `role="dialog"` + the accessible name instead |

### What was already correct (no change needed)

- The search input has a real label (`sr-only` "Search resources"), a `type="search"` field, an
  `aria-label` on the clear button, and Escape/Enter handling that bypasses the debounce.
- The `/` shortcut is guarded by `isEditableTarget` (input, textarea, select, contenteditable,
  textbox/searchbox/combobox roles) and by an open-dialog check, so it never steals typing.
- The filter controls are real `<label>` + `<select>` / checkbox pairs inside a labelled
  `<section aria-label="Search filters">`, with the tag list in a `<fieldset>` + `<legend>`.
- The import progress uses a native `<progress aria-label="Import progress">` plus a polite
  `role="status"` line with the human-readable batch count.
- The import conflict controls are radios in a `<fieldset>` with a `<legend>` naming the resource.
- The import error summary is an `role="alert"` with `aria-labelledby`, a title, the messages and a
  hint; the warnings are a `<details>`/`<summary>` whose text states the count (no colour-only cue).
- Dialogs are Radix dialogs: focus trap, Escape, `role="dialog"`, title and description.
- Nothing in the audited components animates, so `prefers-reduced-motion` has nothing to reduce.

## 3. Reflow findings

Measured with the layout viewport reduced to the CSS size the content would have at that zoom
(1280 px reference -> 640 / 427 / 320 CSS px):

| Zoom | Search header | Filters | Import dialog |
| --- | --- | --- | --- |
| 200% (640 px) | input visible, inside the viewport | controls visible, wrapping | dialog fits the viewport, file input visible |
| 300% (427 px) | same | same | same |
| 400% (320 px) | same | same | same |

No horizontal scrolling was needed for the audited surfaces, and no control was clipped. The
library grid was not assessed (out of scope, and its own layout behaviour is unchanged).

## 4. Explicit gaps

| Gap | Why it is a gap | How to close it |
| --- | --- | --- |
| Screen-reader behaviour | No screen reader is installed in this environment, so no NVDA/JAWS/VoiceOver output exists. Automated checks prove names, roles and live-region semantics - not what is actually spoken. | Manual pass on Windows with NVDA (and VoiceOver on macOS) over the import, export and search flows, recorded step by step |
| Real browser zoom | Zoom was emulated by reducing the layout viewport, which reproduces the reflow but not the browser's own zoom behaviour (scroll anchoring, form control scaling). | Repeat the three levels in a real browser zoom control and record the result |
| Forced colours / high contrast | Not exercised | A forced-colours pass with the focus and status cues checked |
| Non-text contrast and target size | axe does not measure pointer target size; the 1×1 "clear" glyph button in the search header is visually small | Measure target sizes and enlarge if needed |
| Motion | Nothing to verify - no audited component animates | Verify the new focus/announcement behaviour does not introduce motion |
