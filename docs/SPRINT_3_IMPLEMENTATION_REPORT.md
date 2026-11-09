# Fluid Deck — Sprint 3 Implementation Report (M4)

*Date: 2026-11-09 · Scope: Phase 4 Sprint 3 (M4 — frontend foundation) · Sprint 4 NOT started.*
*Status: **COMPLETE for the authorized scope** — UI-001, UI-002, UI-003 plus the DB-004 boot-wiring leg.*
*No commit made; awaiting review and approval.*

---

## 1. Sprint objective

Build the M4 frontend foundation on the Sprint 2 persistence layer:
app shell with URL-param routing, a capped/windowed resource grid with
type-aware cards, and TanStack Query + the four approved global UI
contexts — including boot wiring of `openDatabase()` + `checkIntegrity()`.

## 2. Scope reconciliation (before coding)

| Source | Position |
|---|---|
| `PHASE_4_EXECUTION_ROADMAP.md` Sprint 2 | "Core (M3–M4)" — includes UI-001–003 |
| `PHASE_3_TASK_BREAKDOWN.md` | UI-001, UI-002, UI-003 are milestone **M4**; DB-008 is the last M3 task |
| Sprint 2 closure review | M3 delivered; UI-001–003 **deferred to M4**, not partially built |
| `PHASE_3_IMPLEMENTATION_PLAN.md` §7 | M4 exit = "UI-001–005 green" — **conflicts** with the breakdown (UI-004 is M7, UI-005 is M5) |

**Resolution:** this sprint implements UI-001, UI-002, UI-003 (M4 per the
breakdown, which the Sprint 2 audit declared authoritative) plus the
DB-004 boot-wiring leg. UI-004 (search) and UI-005 (command palette)
were **not** implemented, even though the plan's M4 line names them —
see §10, deviation 1.

### Scope table

| Task ID | Description | Dependencies | Acceptance criteria | Files/modules | Tests |
|---|---|---|---|---|---|
| UI-001 | App shell + sidebar + URL-param routing | DB-008 ✅ | One route; back/forward works | `App.tsx`, `main.tsx`, `components/AppShell.tsx`, `components/Sidebar.tsx`, `hooks/useViewState.ts`, `contexts/shell.tsx` | `useViewState.test.ts`; Playwright back/forward |
| UI-002 | Resource grid + cards (7 variants, U3) | UI-001 ✅ | 500-item cap + windowing | `features/library/*`, `services/library.ts` | `library.test.ts`, `card-variant.test.ts`; Playwright empty/grid states |
| UI-003 | TanStack queries + 4 Contexts (theme/shell/dialog/toast) | UI-001 ✅ | Invalidation on write (test) | `hooks/queries.ts`, `contexts/*`, `main.tsx` (QueryClient), `services/library.ts` | `queries.test.ts` (QueryClient invalidation); Playwright |
| DB-004 (leg) | Boot wiring: `openDatabase()` + `checkIntegrity()` | DB-001/DB-004 ✅ | App opens DB at boot; integrity reported, never auto-deleted | `main.tsx`, `App.tsx` | Playwright real-IndexedDB boot test |

## 3. Implementation summary

- **Boot (DB-004 leg):** `main.tsx` opens Dexie once via `openDatabase()`,
  runs read-only `checkIntegrity()`, then renders. DB failure renders an
  explicit error screen (no blank page, no auto-delete). `blocked` /
  `versionchange` lifecycle events surface as banners via the existing
  `subscribeDbLifecycle` seam. Integrity failures show a quarantine
  banner; the rest of the library stays usable.
- **UI-001:** one layout (`AppShell`: sidebar + header + main), one route.
  Hand-rolled URL-param routing in `useViewState` — ViewState round-trips
  through the core codec, every change is a `pushState`, `popstate`
  restores on back/forward. Sidebar navigates All / Trash / Collections /
  Tags (navigation only; management is M5). Responsive: sidebar is an
  overlay below 768px, toggled from the header.
- **UI-002:** `ResourceGrid` + `ResourceCard`. Cards map 8 types → 7
  variants (U3: `other` → default), render text-only (no
  `dangerouslySetInnerHTML`), lazy thumbnails with `no-referrer` and
  failure placeholder, external links `rel="noreferrer noopener"`.
  Windowing: service caps results at 500; the grid renders a 50-card
  window that grows on scroll (IntersectionObserver sentinel), so DOM
  size is bounded without a virtualization library.
- **UI-003:** QueryClient + `useResources` / `useCollections` / `useTags`
  with semantic keys (`["resources", view, trash]`). Mutations
  (trash / restore / mark-opened) invalidate `["resources"]` **after**
  their Dexie commit resolves. Four contexts: `ThemeProvider` (light/
  dark class + persisted preference), `ShellProvider`, `DialogProvider`
  (stack renderer; concrete dialogs are UI-009), `ToastProvider`
  (aria-live, auto-dismiss).
- **Services layer:** `services/library.ts` thin-wraps the Sprint 2
  repositories (browse filters: type, collection, tags OR, date, source;
  sorts incl. most-tagged; trash view). Features never import
  repositories directly.

## 4. Files created and modified

Created (17):
`apps/web/src/services/library.ts`, `library.test.ts`,
`apps/web/src/hooks/useViewState.ts`, `useViewState.test.ts`,
`apps/web/src/hooks/queries.ts`, `queries.test.ts`,
`apps/web/src/contexts/theme.tsx`, `shell.tsx`, `dialog.tsx`, `toast.tsx`,
`apps/web/src/components/AppShell.tsx`, `Sidebar.tsx`,
`apps/web/src/features/library/ResourceGrid.tsx`, `ResourceCard.tsx`,
`card-variant.ts`, `card-variant.test.ts`,
`docs/SPRINT_3_IMPLEMENTATION_REPORT.md`

Modified (4):
`apps/web/src/App.tsx` (shell + grid + URL routing),
`apps/web/src/main.tsx` (providers + boot wiring),
`e2e/web-smoke.spec.ts` (3 tests: shell, back/forward, real-IDB boot),
`docs/PROJECT_PROGRESS.md` (Sprint 3 entry)

Dependency (1, approved stack): `@tanstack/react-query` added to
`apps/web` (`package.json` + `pnpm-lock.yaml`). No other deps added;
no Redux/Zustand/RHForm/router/virtualization libraries.

## 5. Architecture decisions followed

- Phase 2.5: 3 state owners (Dexie canonical, TanStack cache, URL
  transient) + 4 small Contexts; `features → hooks → services →
  repositories → Dexie`; no `services/` rule leaks into components.
- Phase 2.1/2.5: no React Router (one route), no telemetry, no network
  egress beyond resource links/thumbnails.
- Security §4: text-only rendering, http(s)-only URLs (repository
  enforced), strict link attributes.
- Offline §2: DB-open failure → explicit error screen, never delete.

## 6. Tests executed and results (actual)

| Command | Result |
|---|---|
| `pnpm test` | **18 files / 110 tests passed** (100 pre-existing + 10 new: library service 4, variants 1, routing 3, invalidation 2) |
| `pnpm typecheck` | 5/5 workspaces Done |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | all files compliant |
| `pnpm build` | web 473.94 kB JS (**146.34 kB gzip** — inside the proposed ≤250 kB budget; was 104.79 kB before TanStack + UI), CSS 14.86 kB (3.90 kB gzip); extension chrome-mv3 194.91 kB, firefox-mv3 195.03 kB (only upstream zod comment warnings) |
| `pnpm test:e2e` | **3/3 passed** — shell renders, Trash URL navigation + goBack/goForward, real Chromium boot creates the `fluid-deck` IndexedDB database |

Real-browser validation performed: Playwright (bundled Chromium) boot
test confirms the app opens a real IndexedDB database named
`fluid-deck` — this closes the Sprint 2 "no real-browser IndexedDB"
gap for the boot path only (see §8 for what remains unproven).

## 7. Acceptance criteria status

| Task | Criterion | Status |
|---|---|---|
| UI-001 | One route; back/forward works | ✅ Playwright goBack/goForward pass |
| UI-002 | 500-item cap + windowing | ✅ Service cap constant + window helper tested; grid renders 50-card growing window |
| UI-003 | Invalidation on write (test) | ✅ QueryClient test: fetch → commit → invalidate → refetch reflects write |
| DB-004 leg | Boot wiring | ✅ `openDatabase` + `checkIntegrity` at boot; real-browser boot test |

## 8. Known issues and technical debt

1. **Keyword search ignored.** `q` in the URL is not yet applied — it
   belongs to SEARCH-002/UI-004 (M7). Browse filters work; a `q` param
   currently has no visible effect. No MiniSearch code was added.
2. **No DOM component tests.** No RTL/jsdom in the workspace; adding
   them would grow the dependency surface for M4. Coverage is pure-logic
   unit tests (service, variants, routing, invalidation) + Playwright
   e2e for rendered behavior.
3. **Dialog context has no concrete dialogs yet** (UI-009/UI-010 own
   them). The provider + stack renderer + Esc handling are in place.
4. **Trash is `?view=trash`**, outside the core ViewState schema
   (documented in `useViewState.ts`); folding it in is a UI-004 concern.
5. **Two-tab manual check (DB-006) still outstanding** — not performed,
   not claimed. Handler behavior remains covered by Sprint 2 tests.
6. **U4 exception-host list still empty** — canonicalization unchanged;
   no hosts invented.
7. **No seed data.** First run shows the empty state by design; the
   plan's "seed data" line was not implemented because seeds would write
   fake rows into the user's real database.
8. **Bundle grew** 104.79 → 146.34 kB gzip with TanStack Query + UI.
   Still within budget; revisit only if it approaches 250 kB.

## 9. Deferred work

- UI-004 search UI + SEARCH-001–008 (M7), UI-005 command palette (M5),
  UI-006–010 collections/tags/inbox/dialogs/settings (M5),
  UI-011 responsive/keyboard hardening (M9), EXT-001–007 capture (M6),
  IMPORT-001–009 (M8), TEST-001–008 (M9–M10).
- DB-005 backup restore (IMPORT-*), boot purge sweep (explicit-only
  purge unchanged), Firefox popup click (Sprint 1 carry-over).
- Manual two-tab versionchange check; manual screen-reader pass (M9).

## 10. Deviations from approved plans

1. **Plan §7 M4 names UI-001–005; implemented UI-001–003.** The task
   breakdown (declared authoritative by the Sprint 2 audit) assigns
   UI-004 to M7 and UI-005 to M5. Building them here would have pulled
   search and palette scope into this sprint. Reported, not silently
   resolved.
2. **Windowing without a virtualization library.** The acceptance text
   says "500-item cap + windowing"; the architecture says virtualize
   only above 500 DOM items. The 500 cap + 50-card growing window
   satisfies both readings and adds no dependency. If a future milestone
   raises the cap, `@tanstack/react-virtual` is the approved seam.
3. **`view=trash` URL param** outside ViewState (see §8.4) — smallest
   change that gives the sidebar its Trash entry in M4.
4. **Pre-existing uncommitted checkpoint docs** (`docs/GIT_CHECKPOINT_REPORT.md`,
   `docs/PROJECT_PROGRESS.md` update from the checkpoint task) were
   left in the working tree untouched by this sprint's code changes;
   `docs/PROJECT_PROGRESS.md` was additionally updated for Sprint 3.

## 11. Recommended next action

Review and approve this sprint, commit the tree (including the
checkpoint docs), then authorize Sprint 4 (search) or the M5
organize/capture block per the user's chosen sprint numbering — the
roadmap's "Sprint 3" (M5–M6) vs this sprint's "Sprint 3 (M4)" numbering
should be reconciled in `docs/PROJECT_PROGRESS.md` at that point.
