# M9 Implementation Plan - Fluid Deck (Hardening)

*Date: 2026-11-12 - Planning only. No task in this plan has been implemented, scheduled or started.*

Companion documents: `docs/M9_READINESS_REVIEW.md` (assessment) and
`docs/SPRINT_6_REPOSITORY_RECONCILIATION.md` (repository gate, WS-0).

## 1. Goals and non-goals

**Goal.** Take Fluid Deck from "M8 closed with conditions, repository not reproducible" to "every
milestone's code is version-controlled, the screens are verifiably accessible, the export surface
matches the PRD, the import path is measured and safe, and one test command reproduces the
browser matrix."

**Non-goals.** No new product capability beyond closing documented gaps; no schema change; no
migration; no new runtime dependency other than what the reconciliation gate already requires
(MiniSearch); no M10 scope (PWA/share target, offline sync, semantic search).

**Task ID convention.** `M9-0xx`, unique across the repository (no `M9-` IDs existed before this
plan; existing families are `UI-`, `IMPORT-`, `SEARCH-`, `EXT-`, `DB-`, `ADR-`, `TEST-`,
`CORE-`, `SRH-`, `CAP-`, `PER-`, `IEX-`, `STO-`, `PRI-`). IDs are stable and referenced from the
reports.

## 2. Sequencing

```
WS-0 reconciliation gate (M9-001..007)   <- blocks everything that touches search files
   |
WS-A accessibility (M9-010..014)   <- can start on committed M8 screens in parallel with WS-0
WS-B export completeness (M9-020..023)
WS-C performance + reliability (M9-030..034)
WS-D test infrastructure (M9-040..043)   <- depends on WS-0 for the benchmark specs
WS-E documentation (M9-050..053)          <- depends on WS-0 for the Sprint 6 doc set
```

Exit gates are defined per workstream in section 8 and for M9 as a whole in section 9.

## 3. WS-0 - Repository reconciliation gate (prerequisite)

These mirror the steps in `docs/SPRINT_6_REPOSITORY_RECONCILIATION.md` section 5. They are listed
here because M9's own exit criteria depend on them.

| ID | Task | Dependencies | Acceptance criteria | Risk |
| --- | --- | --- | --- | --- |
| **M9-001** | Repair `apps/web/src/services/search.test.ts`: move `fake-indexeddb/auto` to a top-level import, replace the non-existent `db.resources.openTxn()` with the real Dexie API, make the "edit becomes searchable" case actually write the row through the repository so the post-commit sync path runs | none | `pnpm test` green in the dirty tree (57/57 files, 0 failures); `pnpm --filter @fluid-deck/web typecheck` reports 0 errors; ESLint clean on the file | A rewrite can silently weaken the assertion - keep the case, prove it fails when the sync hook is removed |
| **M9-002** | Land the core package in dependency order: `packages/core/src/tokenizer.ts`, `tokenizer.test.ts`, then `packages/core/src/index.ts` | M9-001 | `@fluid-deck/core` typechecks and tests green; a clone containing `index.ts` always contains `tokenizer.ts` | Committing `index.ts` first breaks the core package for everyone |
| **M9-003** | Land the dependency pair `apps/web/package.json` + `pnpm-lock.yaml` in one change (MiniSearch `^7.2.0`) | M9-002 | `pnpm install --frozen-lockfile` succeeds on a fresh clone with no lockfile drift | Lockfile drift breaks the reproducible-install gate |
| **M9-004** | Land the search modules in dependency order: `search-worker-protocol.ts` -> `search-engine.ts` -> `search-worker-core.ts` -> `search.worker.ts` -> `search.ts` -> the 5 search test files | M9-001, M9-003 | 11 search test files green from a clean clone; the 3 dead shims (`services/search-index.ts`, `services/searchIndex.ts`, `hooks/searchIndex.ts`) are **not** committed | Importing a 2144-line module early hides dependency gaps until the end |
| **M9-005** | Land the UI and integration layer: `features/search/*`, `hooks/search-index.ts`, `hooks/queries.ts`, `hooks/useViewState.ts` (+2 test files), `App.tsx`, `main.tsx`, `components/AppShell.tsx`, `features/{collections,tags,library}` panels, `bridge/inbox.ts`, `repositories/resources.ts`, `packages/core/src/view-state.ts` + `view-state.test.ts` (`relevance` residue) | M9-004 | Dirty tree fully green: unit suite, typecheck, build, search UI E2E in 3 browsers | `repositories/tags.ts` blank-line-only change must be dropped, not committed |
| **M9-006** | Merge `docs/PROJECT_PROGRESS.md` from the **committed** copy plus the Sprint 6 entries; fix the "No worker is implemented yet" contradiction in `docs/PHASE_3_DECISION_REGISTER.md`; land the 13 `SPRINT_6_*` docs, the 5 untracked `SPRINT_7_*` docs and the Phase 3 / architecture diffs; quarantine the 8 scratch captures and `poc/` behind ignore rules | M9-005 | `git diff` on `docs/PROJECT_PROGRESS.md` shows Sprint 6 entries **added** and zero M8 entries removed; no `node_modules` or capture file tracked | Committing the working copy of the progress log would delete M8 history |
| **M9-007** | Verify the clean-clone gate on the pushed HEAD: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, plus the two search Playwright configs | M9-006 | All green on a fresh clone; entry bundle <= 250 kB gzip; results recorded in the M9 report | A partial gate leaves the "two products" problem in place |

## 4. WS-A - Accessibility

M8 and Sprint 6 both claimed accessibility at the markup level only. No screen-reader run and no
zoom/reflow evidence exist anywhere in the project. `@axe-core/playwright` is already a workspace
dependency, so the automated part costs nothing new.

| ID | Task | Dependencies | Acceptance criteria | Risk |
| --- | --- | --- | --- | --- |
| **M9-010** | Screen-reader pass (NVDA + VoiceOver) over: import dialog (picker, preview, conflicts, progress, error summary, re-run), export dialog, search input/filters/status, settings, grid, empty states | WS-0 (so the search screens exist) | A written pass/fail per screen with the exact steps and the spoken output recorded; every failure becomes a tracked item | Manual, slow, easy to skip - block the workstream exit on it |
| **M9-011** | Keyboard and focus-management audit: dialog focus trap and restore, `/` shortcut vs. editable targets, `Cmd/Ctrl+K` palette, radio groups in conflict resolution, focus visibility on every new control | M9-010 | Keyboard-only traversal of every dialog and panel with no focus trap; visible focus on all interactive elements; each finding fixed or explicitly accepted | The search `/` shortcut can swallow typing in inputs - already guarded by `isEditableTarget`, must be re-verified |
| **M9-012** | Zoom and reflow verification at 200 % and 400 % (equivalent to 1280 px and 640 px CSS viewports at 1x), plus forced-colours / high-contrast spot checks | M9-011 | No horizontal scrolling, no clipped controls and no lost content at both zoom levels on the import, export, search and grid screens; findings fixed or accepted | 400 % reflow usually breaks fixed-width headers and the grid - budget for layout work |
| **M9-013** | Automated axe checks in the browser suite for the import, export and search screens | M9-011, WS-D M9-040 | An axe scan runs in CI for the three screens and fails the build on serious/critical violations; zero serious violations at the time of landing | Axe cannot see focus order or announcement quality - it complements, never replaces M9-010/011 |
| **M9-014** | Accessibility regression backlog + targeted unit/E2E tests for each fixed defect | M9-010..013 | Every accepted finding has either a test or a documented, dated exception in the limitations section | Findings without tests regress silently |

## 5. WS-B - Export completeness

The plan's definition of done lists four export scopes; the UI exposes two. FR-IEX-005 also names
a flatten-collections option that does not exist. Both are small, user-visible gaps.

| ID | Task | Dependencies | Acceptance criteria | Risk |
| --- | --- | --- | --- | --- |
| **M9-020** | Expose the **Current Filter** export scope in `ExportDialog.tsx` (service support already exists and is tested in `export/json.test.ts`) | none | The dialog offers Everything / Current filter / One collection; "Current filter" exports every match, not the first 500-card screen (the service already ignores the grid cap - prove it with a >500-match test) | Users may expect "current filter" to mean the visible page - the label and the test must agree |
| **M9-021** | Expose the **Selected** export scope | M9-020 **and** a selection model in the grid - the grid currently has no multi-select, so this is the larger half of the task | Either a multi-select exists in `ResourceGrid` with a keyboard path, or the scope is formally descoped in the PRD with the reason recorded | This is a real feature, not a checkbox - do not smuggle it in as a UI-only change |
| **M9-022** | Decide and implement the **flatten-collections** option (FR-IEX-005) | M9-020 | Either a documented, working toggle for the formats where it is meaningful, or an ADR-style decision that CSV is always flat and HTML always hierarchical, with the PRD wording corrected | A toggle that silently changes JSON semantics would break the round-trip contract |
| **M9-023** | Export regression coverage for the new surfaces | M9-020..022 | A browser test exports by each available scope and re-imports the file; the round-trip property from IMPORT-008 still holds | Scope changes can silently narrow the export - assert `truncated` flags |

## 6. WS-C - Performance and reliability

| ID | Task | Dependencies | Acceptance criteria | Risk |
| --- | --- | --- | --- | --- |
| **M9-030** | Real-browser **10k import benchmark**: a deterministic 10,000-item file, measured through the real import dialog against real IndexedDB, with the harness committed and the raw result JSON kept | WS-D M9-040 (needs a stable browser harness) | A committed harness plus a recorded measurement; the result states machine, browser, cold/warm cache and the measured phases (parse, validate, commit) - **no target is claimed until the measurement exists** | The 1,200-item extrapolation (~70-150 s) already suggests the proposed 30 s budget will not hold; report the number as measured, then re-plan the batch size or the budget |
| **M9-031** | Repeated runs and **percentile reporting** (p50/p95, >= 5 runs) for import, export and search rebuild/query | M9-030 | A repeatable command and a report with percentiles, method and environment; single-run numbers are explicitly labelled as such everywhere they appear | Flaky environments produce fake percentiles - keep raw runs |
| **M9-032** | **Cross-tab import lock** (Web Locks API, with a Dexie-backed fallback) | none | Two tabs importing the same file cannot interleave; the second receives a clear, actionable message; a test drives two tabs in one browser context | Lock API support differences across browsers; the fallback must not deadlock |
| **M9-033** | **Checkpoint and recovery hardening**: stronger fingerprint (SHA-256 instead of 64-bit FNV), clearer resume UX in the dialog, guidance that the checkpoint is per browser profile | M9-032 | A changed file cannot resume a stale checkpoint; the resume note names the item it continued from; the profile limitation is documented in the dialog | Fingerprint change invalidates existing checkpoints - acceptable, but say so in the release note |
| **M9-034** | **Search index freshness after import**: the import committer writes in its own transactions and never notifies the search index, so an imported batch is not searchable until the next rebuild | WS-0 M9-005 (the search service must exist), M9-007 | After an import that changes searchable fields, a search for an imported title finds it without an app restart; an import that does not touch searchable fields does not rebuild the index | A rebuild per import is too slow at 10k - prefer an incremental upsert of the imported rows |

## 7. WS-D - Test infrastructure

| ID | Task | Dependencies | Acceptance criteria | Risk |
| --- | --- | --- | --- | --- |
| **M9-040** | One Playwright configuration with explicit **Chromium, Firefox and Edge** projects | WS-0 M9-007 | `pnpm test:e2e` runs the full matrix; the projects are declared, not implicit; the current two-config split (`playwright.import-export.config.ts`, `playwright.search-worker*.config.ts`) is folded in or explicitly justified | Edge via `channel: "msedge"` is machine-dependent - keep it skippable but documented |
| **M9-041** | Spec separation and hygiene: `testIgnore` for the long benchmark specs, a stable test-data directory, no generated files inside the repo | M9-040 | The default suite is green in the dirty tree and in a clean clone; benchmark specs run only when explicitly requested | `testIgnore` can hide real failures - the excluded specs must have their own documented command |
| **M9-042** | Reproducible CI commands: the exact command list (install, typecheck, unit, e2e matrix, build) documented in one place and wired to a script | M9-040, M9-041 | A single documented entry point reproduces every gate on a fresh clone; the M9 report cites it | CI runners differ from this machine - the commands must not depend on local state |
| **M9-043** | Test-data hygiene: fixtures under `e2e/fixtures/` (already tracked for M8), generated files under a temp dir, and a rule that scratch captures never enter the repo | M9-042 | No scratch capture file is tracked; the 8 existing captures are ignored/removed per M9-006 | Removing captures loses history - they are already captured in the Sprint 6 reports |

## 8. WS-E - Documentation

| ID | Task | Dependencies | Acceptance criteria | Risk |
| --- | --- | --- | --- | --- |
| **M9-050** | Correct the **DOMPurify dependency claims** in `docs/SPRINT_7_IMPLEMENTATION_PLAN.md`, `docs/SPRINT_7_READINESS_REVIEW.md` and the affected reports: the plan asserts "no new npm dependencies" while `dompurify@^3.4.17` was added in `8eb27fb` | none | Every document states the real dependency set; the "no new dependencies" line is either corrected or annotated with the exception and its justification | Editing historical planning documents is acceptable only as an annotated amendment, never a silent rewrite |
| **M9-051** | Write the missing **IMPORT-001 implementation report** (code and 18 tests exist; the report does not) | none | A report in the same shape as IMPORT-002..009, with the acceptance criterion, the evidence and the known limitations | It must describe the code as it is now (after the IMPORT-008 entity/fidelity fixes), not as it was first written |
| **M9-052** | Refresh acceptance evidence and known limitations: the M8 closure review, the Sprint 6 report set (including the stale "47 files / 381 tests" numbers and the worker contradiction) | WS-0 M9-006, M9-030, M9-031 | Every number in the reports matches a recorded run; the limitations lists carry the M9 outcomes (a11y, 10k import, export scopes) | Editing evidence to match new results is fine; editing it to match hopes is not |
| **M9-053** | PRD / definition-of-done traceability update for FR-IEX-005 and FR-IEX-006 and the export scope list | M9-020..023 | The PRD, the plan and the implementation agree on which export scopes and options exist; descoped items are recorded with the reason | The PRD is a customer-facing artefact - keep the language honest and specific |

## 9. Workstream exit gates

| Workstream | Exit gate |
| --- | --- |
| WS-0 | Fresh clone of `origin/main`: install, typecheck, test, build all green; `git status` clean except documented ignored paths; the progress log contains both Sprint 6 and M8 entries |
| WS-A | Screen-reader and zoom/reflow pass recorded per screen; axe clean (no serious/critical) for import, export and search; every finding fixed or documented as an accepted exception |
| WS-B | All four export scopes reachable in the UI (or descoped with a recorded reason); the flatten option shipped or decided; round-trip regression green for every scope |
| WS-C | 10k import measured in a real browser with percentiles; the cross-tab lock proven by a two-tab test; checkpoint resume hardened and documented |
| WS-D | One Playwright configuration with an explicit Chromium/Firefox/Edge matrix; `pnpm test:e2e` green on a fresh clone; benchmark specs separately invocable; CI command list documented |
| WS-E | Dependency claims corrected; IMPORT-001 report written; all evidence numbers re-verified against recorded runs; PRD traceability updated |

## 10. M9 exit criteria (all must hold)

1. A fresh clone of `origin/main` is reproducible and green on every documented gate.
2. Every screen has a screen-reader and zoom/reflow result, or a dated, accepted exception.
3. FR-IEX-001..006 are either fully met with evidence, or explicitly descoped with the reason and
   the PRD updated.
4. The 10k import path is measured, and the published budget matches the measurement.
5. A concurrent second tab cannot corrupt an import.
6. One command reproduces the browser matrix in all three engines.
7. No scratch artifact, `node_modules` or unmerged working-tree fork is tracked.

## 11. Explicitly not claimed

- No performance number in this plan is a measurement. The 1,200-item figures quoted in the M8
  reports (Chromium 8,279 ms, Firefox 16,655-17,720 ms, Edge 8,452 ms) are single runs from
  earlier milestones; the 10k import is unmeasured and the only extrapolation (~70-150 s) is an
  extrapolation, not a result.
- No accessibility conformance is claimed. M9-010..014 exist precisely because no screen-reader
  or zoom evidence has ever been collected.
- The Sprint 6 search implementation is assessed, not certified: 11 unit test files and the
  search UI E2E pass, but the module set cannot be committed before M9-001, and the 2144-line
  service with its alias surface is a review liability, not a clean integration.
- No task in this plan has been implemented, started or scheduled.
