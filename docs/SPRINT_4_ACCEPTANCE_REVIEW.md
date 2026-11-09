# Fluid Deck — Sprint 4 Acceptance Review (M5)

*Date: 2026-11-09 · Auditor role: senior software engineer + accessibility/dependency auditor · Scope: audit only — no source, dependency, lockfile, staging or commit changes made (where a rule prevented writing a fix, it is flagged, not applied).*

**Verdict: ACCEPT Sprint 4 (M5) subject to one mandatory code fix (typecheck) — all six tasks pass their acceptance criteria; one defect class noted, and no task is Blocked.**

---

## 1. Task-by-task acceptance assessment

| Task | Requirement | Status | Evidence |
|---|---|---|---|
| UI-009 | Dialogs + toasts + empty states; focus trap/restore (a11y test) | ✅ **Pass** | Radix Dialog (focus trap, escape stack, `aria-modal`); DialogShell.test.tsx 2/2 (jsdom Testing Library focus-move + Esc-close); axe-core 0 violations real Chromium |
| UI-006 | Collection management; reorder persists; depth warn U2 | ✅ **Pass** (drag UX caveat §2) | buildTree + depth tests pass; reorder via Sprint 2 `reorderCollection`; idempotent per independent audit; U1 persistence via `orderIndex` transaction |
| UI-007 | Tag rename/merge; rename propagates (test) | ✅ **Pass** | TagsPanel.test.tsx DOM render + repo re-read (join row key stable, name propagated) |
| UI-008 | Inbox query returns dated+linked | ✅ **Pass** | inbox.test.ts dated-desc + linked-only-memberships pass |
| UI-010 | Purge default per U5 (30 days); explicit confirm | ✅ **Pass** | `purgeDeletedResources(db, { confirm: true, retentionDays })` + ConfirmDialog; theme persistence verified in code |
| UI-005 | Command palette; keyboard-only pass | ✅ **Pass** | cmdk (filtering only); e2e arrow+Enter + combobox visible; ⌘K button axe-clean |

## 2. Findings (honest severity)

1. **BLOCKING (must-fix before commit): `apps/web/src/services/inbox.test.ts:34` — `input(...)` is called with 3 arguments while its helper takes 2.** This is a type error — `pnpm typecheck` fails (verified during this audit). It is *not* a runtime failure (Vitest strips types and the suite passes 116/116), but the repo's quality gates must be green before any commit. Root cause: a shell regex replace introduced the mismatch during lint fixes. The fix is one-line (remove the trailing argument); the audit mandate bars applying it, so it is flagged for the implementer.
2. **Low (documented, no code impact):** reorder does not support cross-parent drags — the handler silently no-ops when `over` is not a same-parent sibling (`CollectionsPanel.tsx:156-162`). Safe (no partial writes) but a dead-end UX: a user may drag to another parent's list and nothing happens. Acceptable for M5 (the breakdown only requires reorder persistence + depth warning); reparenting is a later-milestone feature (`reparentCollection` exists upstream).
3. **Low (visual/hardening only):** the 500 kB chunk-size Rollup warning is cosmetic (main thread sync load); no def.
4. **Low (masking):** TagsPanel.test.tsx reads the dev-only database singleton via `fake-indexeddb/auto` import inside jsdom — works, but it is a *test-environment* Dexie, not the production instance. This is precisely what the evaluation doc prescribes (db flows stay in Playwright); real Chromium IDB boot is covered by the unchanged Sprint 3 test.

## 3. Data integrity

- U1 fractional indexing: existing Sprint 2 `orderBetween`/`needsResequence` used; reorder writes via transaction after commit; repeat drags are fixed-point except `updatedAt` (independently verified).
- Reload survival: order lives in Dexie (`orderIndex` column) — survives reload by construction; drag handler only touches siblings of the moved node; invalid reorder (cross-parent, same-node) early-returns before any write.
- No partial writes anywhere: invalidate queries only after Dexie commit.

## 4. Dependency audit

**Runtime (apps/web):** `@radix-ui/react-dialog@^1.3.1`, `cmdk@^1.1.1`, `sonner@^2.0.8`, `lucide-react@^1.70.0`, `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `@dnd-kit/utilities@^3.2.2` — all exactly as the refined evaluation specified; MIT/ISC licenses; React 19 peers satisfied.
**Dev:** `@testing-library/react@^16.3.3`, `@testing-library/jest-dom@^7.0.1`, `jsdom@^31.0.0` (apps/web); `@axe-core/playwright@^4.14.0` at workspace root — **placement required**: the Playwright runner lives at the root (with `@playwright/test`), and pnpm's strict layout is the reason it cannot resolve from `e2e/` when installed only under `apps/web`. The root placement is by necessity, not scope drift, and it appeared in both manifests correctly.
**Lockfile:** pnpm-lock.yaml additions are exclusively these packages + their transitive trees (Radix primitives, dnd-kit deps, jsdom toolchain, axe-core, testing-library). No unrelated versions moved; no upgrades to existing packages.

## 5. Testing evidence (re-run during this audit)

| Command | Result |
|---|---|
| `pnpm typecheck` | **FAIL on `apps/web/src/services/inbox.test.ts:34`** (1 line — see §2.1) |
| `pnpm test` | **22 files / 116 passed** (Vitest doesn't typecheck; inbox.test runs and passes) |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | clean |
| `pnpm test:e2e` | **6/6 passed** — incl. axe zero-violation run in real Chromium, palette keyboard path, inbox/settings navigation |
| `pnpm build` (reproduced twice) | **631.99 kB JS / 195.45 kB gzip; CSS 18.01 kB (4.36 gzip)** — matches the report exactly |

## 6. Bundle verification

Reproduced: **195.45 kB gzip** vs Sprint 3 baseline **146.34 kB** → delta **+49.11 kB gzip**; the ≤60 kB target is met with 10.89 kB of headroom. Figures confirmed verbatim against the report. CSS 18.01 kB (was 14.86) — +3.15 kB raw / +0.46 kB gzip from new classes.

## 7. Accessibility

- axe-core: **zero violations** (real Chromium) — palette + shell pass.
- DialogShell.test: focus moves in, Esc closes (focus restore is native Radix; test asserts the moved-in focus).
- Palette: full keyboard path verified; ⌘K button carries its visible text in the accessible name (axe `label-content-name-mismatch` fix verified as part of the zero-violation run).
- dnd-kit keyboard sortable: Space-lift/arrow-move/Enter-drop wired via `sortableKeyboardCoordinates` + `KeyboardSensor`; termination verified by independent audit.
- **Not performed:** full screen-reader pass (M9 per plan), manual drag/keyboard reorder pass — correctly carried forward, neither claimed as evidence.

## 8. Known outstanding checks & their acceptance mapping

| Check | Blocks M5? | Reason |
|---|---|---|
| `inbox.test.ts` type error | **Yes, pre-commit only** | Quality-gate blocker; 1-line fix |
| DB-006 manual two-tab versionchange | No | Documented Sprint 2 carry-over; M5 exit doesn't include it; handler behavior is covered by Sprint 2 tests |
| U4 exception-host list | No | M3 carry-over; canonicalization unchanged per plan |
| Firefox popup click | No | Sprint 1 carry-over |
| Manual drag/keyboard reorder pass | No | Acceptance is persistence + warning, both automated; suggest as acceptance-step polish, M9 owns the full keyboard pass (UI-011) |
| Full screen-reader validation | No | Assigned to M9 by the plan |

## 9. Git scope assessment

| Category | Files |
|---|---|
| Sprint 4 source | `App.tsx`, `AppShell.tsx`, `Sidebar.tsx`, `contexts/{dialog,theme,toast}.tsx`, `hooks/useViewState.ts`, `main.tsx` modified; `features/{collections,dialogs,inbox,palette,settings,tags}/`, `services/inbox.ts` created |
| Sprint 4 tests | DialogShell.test.tsx, CollectionsPanel.test.ts, TagsPanel.test.tsx, inbox.test.ts, `e2e/m5.spec.ts`, `hooks/useViewState.test.ts` (mechanical `page` field), `vitest.config.ts` |
| Dependencies | `apps/web/package.json`, root `package.json`, `pnpm-lock.yaml` |
| Documentation | `SPRINT_4_IMPLEMENTATION_PLAN.md`, `SPRINT_4_TECHNOLOGY_EVALUATION.md`, `SPRINT_4_IMPLEMENTATION_REPORT.md`, `PROJECT_PROGRESS.md` (Sprint 4 entry + corrected 3-package dnd-kit summary) |
| Previously existing | `poc/` (untouched) |

No stray files, no excluded paths, no unrelated edits. The worktree is unambiguous.

## 10. Final acceptance verdict

**ACCEPT WITH ONE MANDATORY PRE-COMMIT FIX** — all six tasks pass; data integrity, accessibility and bundle targets verified; the only blocking item is the one-line `inbox.test.ts` type error (see §2.1). Once that lands, the tree is commit-ready.

## 11. Recommended commit grouping

1. `chore(deps): add M5 UI dependencies` — `apps/web/package.json`, `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`
2. `feat(ui): implement collections, tags, inbox, settings, palette and accessible dialogs (UI-005..010, M5)` — all `apps/web/src/**` + `e2e/m5.spec.ts`
3. `fix(test): typecheck-clean inbox helper signature` — the §2.1 one-line fix
4. `docs: record Sprint 4 plan, evaluation and implementation report` — `docs/SPRINT_4_IMPLEMENTATION_PLAN.md`, `docs/SPRINT_4_TECHNOLOGY_EVALUATION.md`, `docs/SPRINT_4_IMPLEMENTATION_REPORT.md`, `docs/PROJECT_PROGRESS.md`, `docs/SPRINT_4_ACCEPTANCE_REVIEW.md`

*Nothing staged, committed, or pushed by this review. The mandatory fix (§2.1) is intentionally not applied — it awaits explicit approval as a code change.*
