# Fluid Deck — Sprint 3 Acceptance Review (M4)

*Date: 2026-11-09 · Auditor role: senior software engineer, independent review · Scope: audit only — no source, dependency, lockfile, staging or commit changes made.*

**Verdict: ACCEPT Sprint 3 (M4) for commit — zero blocking defects. Two low-severity findings and one cosmetic dead-code note recorded for follow-up. Evidence for all quality gates was re-executed during this audit, not merely quoted from the report.**

---

## 1. Task-by-task acceptance assessment

| Task | Requirement | Status | Evidence |
|---|---|---|---|
| UI-001 | App shell + sidebar + URL-param routing; one route; back/forward works | ✅ **Pass** | `hooks/useViewState.ts` round-trips ViewState through the core codec; every navigation is `pushState`, `popstate` re-derives state → back/forward works. Sidebar sets URL state per filter. Verified live by e2e `sidebar navigation sets URL state and back/forward works` (re-run in this audit). |
| UI-002 | Resource grid + cards (7 variants, U3); 500-item cap + windowing | ✅ **Pass** (one cosmetic note, §6.8) | `services/library.ts` caps at `RESOURCE_GRID_CAP` = 500; `windowedResources` + IO-sentinel window tested in `library.test.ts` (4 tests, re-run live). 8 types → 7 variants incl. `other` → default (U3), tested in `card-variant.test.ts`. Cards render text-only, `rel="noreferrer noopener"`, `referrerPolicy="no-referrer"` thumbnails. |
| UI-003 | TanStack queries + 4 Contexts; invalidation on write (test) | ✅ **Pass** | `queries.test.ts`: fetch → repository write → `invalidateResourceQueries` → refetch reflects the write (re-run live). 4 contexts present and wired in `main.tsx`. |
| DB-004 leg | Boot wiring: `openDatabase()` + `checkIntegrity()` | ✅ **Pass** | `main.tsx` bootstrap: open → read-only integrity check → render; DB failure renders an explicit error screen, data never auto-deleted. `blocked`/`versionchange` lifecycle surfaced as banners in `App.tsx`. Verified live by e2e `boot opens the real IndexedDB database` asserting the real Chromium `fluid-deck` IndexedDB database exists (re-run in this audit). |

Acceptance criteria in the task breakdown matched verbatim; nothing was silently reinterpreted.

## 2. Dependency audit

`@tanstack/react-query` ^5.107.1 (`apps/web/package.json`, one line).

| Check | Result |
|---|---|
| Explicitly required by UI-003? | ✅ Yes — task breakdown row: "TanStack queries + 4 Contexts (theme/shell/dialog/toast)". |
| Matches approved architecture? | ✅ Yes — Phase 2.5 names TanStack Query as one of the three state owners (Dexie canonical / Query async cache / URL transient). |
| Only new runtime dependency? | ✅ Yes — diff shows exactly one dependency line added. No router, state library, virtualization, or form library. |
| Lockfile changes only expected? | ✅ Yes — `pnpm-lock.yaml` diff is 24 lines: `@tanstack/react-query@5.107.1` + peer dep `@tanstack/query-core@5.107.1`, resolved against the existing `react@19.3.1` / `@types/react@19.3.0`. No other package moved. |
| Version compatible? | ✅ Yes — peer range `^18 || ^19` satisfied; v5.x is the current major line. |

**Assessment: justified; not a scope deviation.** Note for the record: Phase 2.5 §0's blanket "no new dependencies" sentence includes TanStack Query in its exemption list three lines later — no conflict in practice, no doc change needed.

## 3. Architecture alignment

- **State ownership (Phase 2.5 §0):** conforms. Dexie canonical, TanStack cache invalidation strictly *after* the Dexie commit, ViewState in the URL. No fourth owner introduced.
- **Dependency direction:** components never import `persistence/` or Dexie — verified by inspection; UI flows through `hooks → (service | repositories) → Dexie`. Minor unevenness: `hooks/queries.ts` imports repositories directly for collections/tags/ mutations while `services/library.ts` wraps only the browse query. This is within the documented rule (the prohibition is components→persistence) and does not warrant a refactor now.
- **Error handling / data integrity:** DB-open failure → explicit recovery screen (no blank page, no destructive action); integrity failure → quarantine banner, library stays usable; mutation toasts reflect post-commit status per the Offline §0 invariant.
- **Security:** text-only rendering, no `dangerouslySetInnerHTML`, http(s)-only URLs enforced upstream by the repository layer.
- **Accessibility:** aria-live toast region, `role="alert"` banners, `aria-current` navigation, labelled toggle buttons. Dialog focus trap correctly *not* claimed — it is UI-009's M5 acceptance.
- **Responsive:** sidebar overlay below 768px with `aria-expanded` toggle; grid 1→2→3 columns.
- **No coupling issues found:** contexts are independent; the grid is a pure presentation component; services are framework-free.

## 4. Testing evidence — what this audit actually re-ran

| Command | Re-run in this audit | Result |
|---|---|---|
| `pnpm typecheck` | ✅ | 5/5 workspaces Done |
| `pnpm test` | ✅ | **18 files / 110 tests passed** — matches the implementation report exactly (100 pre-existing + 10 new: library 4, variants 1, routing 3, invalidation 2) |
| `pnpm lint` | ✅ | clean |
| `pnpm exec prettier --check .` | ✅ | all files pass |
| `pnpm test:e2e` | ✅ | **3/3 passed** in real Chromium: shell+sidebar+empty grid; Trash URL nav with goBack/goForward; boot creates the real `fluid-deck` IndexedDB database |
| `pnpm build` | ❌ not re-run | Accepting the report's figures (web 146.34 kB gzip; chrome-mv3 194.91 kB; firefox-mv3 195.03 kB) on the strength of the identical toolchain; no build config changed since. |

Not performed, and **not claimed anywhere**: the manual two-tab `versionchange` check (DB-006) and the Firefox popup click. These remain outstanding carry-overs, correctly listed in the report and `PROJECT_PROGRESS.md`. Unit coverage of `versionchange`/`blocked` handlers (Sprint 2 tests, re-run live) does not substitute for them.

## 5. Known observations — classification

Authority used: PRD + task breakdown. None block acceptance.

1. **`q` param ignored until M7 — acceptable deferral.** The codec parses/encodes it; `services/library.ts` applies no keyword filter, and the code comment says so explicitly. Keyword search belongs to SEARCH-002/UI-004 (M7); inventing it now would duplicate SEARCH scope. No defect.
2. **`?view=trash` outside the ViewState schema — acceptable deferral, documented deviation.** Commented in `useViewState.ts`; folding it into core ViewState is deferred with UI-004. Round-trip tested (routing test). Recommend recording it in the decision register at next edit for traceability.
3. **Append-on-scroll instead of true virtualization — acceptable deferral.** Architecture requires virtualization only above 500 DOM items; the 500 cap makes that unreachable. `@tanstack/react-virtual` remains the approved seam if the cap ever rises.
4. **No DOM component tests — acceptable deferral for M4.** Coverage is pure-logic unit tests + Playwright e2e on real render. Becomes mandatory when UI-009's a11y acceptance (focus trap/restore) lands — shovel-ready then, not before.
5. **Dialog context empty of concrete dialogs — acceptable deferral.** Esc handling and stack renderer present; content dialogs are UI-009/UI-010 (M5).
6. **Bundle 104.79 → 146.34 kB gzip — acceptable.** Inside the proposed ≤250 kB budget; ~unavoidable cost of TanStack Query + the real UI. Figures accepted from the report (build not re-run in this audit).
7. **NEW — theme preference is write-only (potential defect, low, non-blocking).** `ThemeProvider` initialises `useState("light")` and never reads the persisted preference on mount (`setPreference` is called on toggle only). The theme therefore resets to light every reload. Small fix (read the pref in a boot effect). Schedule within M4 polish or early M5; not an acceptance blocker since the toggle itself works and the write path is harmless.
8. **NEW — `totalCount` prop is always `resources.length` (cosmetic dead code, non-blocking).** `App.tsx` passes `allResources.length` as `totalCount`, so the grid's "Showing X of Y" always shows equal numbers and the over-cap footer cannot fire. Harmless; optionally simplify the prop in a later pass.

## 6. Documentation consistency

- `SPRINT_3_IMPLEMENTATION_REPORT.md`: test counts, typecheck/lint/format results and e2e results all match the live re-run; build figures marked as accepted (not re-verified). Scope reconciliation (UI-001–003 per the breakdown; plan §7's "UI-001–005" conflict honestly reported as deviation) is consistent with the breakdown rows I inspected directly (UI-004→M7, UI-005→M5).
- `PROJECT_PROGRESS.md`: Sprint 3 entry, Next Action and Phase 4 status line consistent with the above; carries over the outstanding DB-006 / U4 / Firefox items correctly.
- `GIT_CHECKPOINT_REPORT.md`: numbers cross-check against git history (`7899782`, 83 files; `ce99623`, 23 files) — consistent.

## 7. Git scope assessment

Worktree (nothing staged by me):

| Category | Files |
|---|---|
| Sprint 3 source | `App.tsx`, `main.tsx` modified; `apps/web/src/{components,contexts,features,hooks,services}/` new (11 files + 4 new test files inside) |
| Sprint 3 tests (e2e) | `e2e/web-smoke.spec.ts` modified (3 tests) |
| Sprint 3 docs | `docs/SPRINT_3_IMPLEMENTATION_REPORT.md` new |
| Checkpoint docs | `docs/GIT_CHECKPOINT_REPORT.md` new; `docs/PROJECT_PROGRESS.md` modified — **mixed content**: its diff contains both the 2026-11-09 checkpoint entry and the Sprint 3 entry |
| Sprint 3 deps | `apps/web/package.json`, `pnpm-lock.yaml` |
| Unrelated | `poc/` untracked — excluded, as before |

All in-scope changes are attributable to Sprint 3 (M4) plus the previously authorised checkpoint documentation. Nothing unexpected, no stray files, no excluded paths touched.

## 8. Blocking issues

**None.** Sprint 3 (M4) is acceptance-ready.

## 9. Recommended commit grouping (3 commits, applied only on explicit approval)

1. **chore(deps): add TanStack Query for UI-003** — `apps/web/package.json`, `pnpm-lock.yaml`.
2. **feat(ui): app shell, grid, contexts and DB-004 boot wiring (UI-001..003, M4)** — `apps/web/src/**`, `e2e/web-smoke.spec.ts`.
3. **docs: checkpoint report + Sprint 3 report and progress** — `docs/GIT_CHECKPOINT_REPORT.md`, `docs/SPRINT_3_IMPLEMENTATION_REPORT.md`, `docs/PROJECT_PROGRESS.md` and the acceptance review (this file).

Caveat: `PROJECT_PROGRESS.md`'s diff mixes checkpoint + Sprint 3 content, so a "checkpoint-only docs commit" cannot be made without surgical hunk staging — grouping both documents into commit 3 is the lazy-correct option. `poc/` stays untracked.

---

*Nothing staged, committed, or pushed by this review. Awaiting explicit approval for the commit grouping above.*
