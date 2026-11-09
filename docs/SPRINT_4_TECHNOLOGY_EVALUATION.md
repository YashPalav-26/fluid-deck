# Fluid Deck — Sprint 4 Technology Evaluation (M5)

*Date: 2026-11-09 · Planning only — no dependency was installed or updated, no source code modified.*
*Registry data verified via `pnpm view` on 2026-11-09; source URLs included for every candidate.*

Current runtime deps in `apps/web`: `@fluid-deck/core`, `@fluid-deck/ui`, `@tanstack/react-query`, `dexie`, `react@19`, `react-dom@19`, `zod`. Bundle now 146.34 kB gzip (budget 250 kB) — ~100 kB of headroom.

## Category A — Command palette (UI-005)

### cmdk 1.1.1 — SELECTED
- Sources: https://github.com/pacocoursey/cmdk · https://www.npmjs.com/package/cmdk
- Maintenance: 1.1.0/1.1.1 released 2025-03-14; actively used in the React ecosystem (used by shadcn/ui's command component). MIT license.
- Size: 82 kB unpacked (~28 kB gzip est.); deps are Radix primitives (`@radix-ui/react-dialog`, `react-id`, `react-primitive`) — shared cost with Category B.
- React 19 peer: `^18 || ^19 || ^19.0.0-rc` ✓. Accessible keyboard nav built in (arrow keys, enter, Esc).
- Why: the canonical, battle-tested palette component. Building a filter+keyboard+ARIA listbox from scratch would re-invent `cmdk`; the repo's own Sprint 3 stack already pays for Radix primitives if Category B is adopted.
- Note: `cmdk` **filters items** — it is not a search index. Keyword retrieval over resources stays with MiniSearch/SEARCH-002 (M7). Palette ships: actions, navigation, and (if MiniSearch lands in M7) resource jumps.

### Alternatives considered and rejected
- **Hand-rolled palette:** no filtering/ARIA/keyboard maturity; rejected — `cmdk` proved in production (shadcn/ui).
- **Radix `react-dialog` + manual filtering:** viable fallback if `cmdk` is ever abandoned, but strictly more work for the same outcome.
- **cmdk-react forks (e.g. `commandk`):** unmaintained community forks of older releases; ecosystem risk, no advantage.

## Category B — Accessible Dialog (UI-009 focus trap/restore)

### @radix-ui/react-dialog (latest, via `radix-ui` meta) — SELECTED
- Sources: https://github.com/radix-ui/primitives · https://www.radix-ui.com/primitives/docs/components/dialog
- Maintenance: Radix is the standard open-source React primitive set, maintained by the WorkOS/Modulz team. MIT.
- Size: small; light tree-shaking (~a few kB gzip + `react-focus-scope`/`react-portal`).
- React 19: All Radix primitives support React 19 ✓. Focus trap, focus restore, Esc stack, `aria-modal` all built in — **exactly** UI-009's acceptance ("Focus trap/restore (a11y test)").
- Why: UI-009's acceptance criterion is literally Radix's specialty. The current hand-rolled `dialog.tsx` cannot trap focus. Radix also satisfies Category A's `cmdk` dependency tree, so the two selections share cost.

### Alternatives considered and rejected
- **Headless UI (`@headlessui/react`):** also excellent (MIT, React 19 compatible) — rejected because (a) its Dialog and transition story duplicates what `cmdk`'s Radix deps already provide, (b) upstream drifted toward the Tailwind-owned open-source `Floating UI` fork, (c) it adds a separate a11y/overlay stack where Radix primitives suffice.
- **React Aria (`@react-aria/dialog`):** Adobe-maintained, very accessible — rejected as heavier (CJS/ESM dual surface, larger bundle) for a small modal set; re-evaluating only if M5's a11y load grows beyond dialogs/palette.
- **Hand-rolled focus trap:** rejected — focus trapping/restoring is one of the easiest things to get subtly wrong; UI-009 tests for exactly this.

## Category C — Drag-and-drop (UI-006 collection reorder)

### FINAL SELECTED INSTALL SET
A complete sortable implementation requires **three** packages (same team, MIT):
`@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` + `@dnd-kit/utilities@3.2.2` (utilities is pulled automatically by sortable, but named explicitly so the lockfile review sees the real set).

- Sortable peer: `"@dnd-kit/core": "^6.3.0"` ✓ matches 6.3.1.
- **Keyboard accessibility is a feature of `sortable`, not `core` alone**: `sortableKeyboardCoordinates` + `KeyboardSensor` from core/sortable gives Space-to-lift, arrow-to-move (vertical/horizontal/orthogonal), Space-to-drop, with `@dnd-kit/accessibility` screen-reader announcements.
- **Fractional-index persistence (U1)**: dnd-kit is geometry-only. After `onDragEnd`, UI-006 passes the new neighbour IDs to the existing `reorderCollection` (Sprint 2) which calls `orderBetween`/`resequence` inside one transaction — the library never touches persisted order itself.
- Bundle: sortable is a thin wrapper over core (~10–15 kB gzip est.); across all three packages the used paths are estimated ≤ 50 kB gzip before tree-shaking. **This number is a target, not a measurement** (see measurement strategy below).
- Integration effort: moderate (nested tree needs a custom `useSortable` per node + vertical list strategy + pointer sensor with activation constraint so clicks don't drag).

### Alternatives considered and rejected
- **HTML5 native DnD:** no touch, no keyboard, broken Firefox semantics; cannot meet WCAG 2.2 AA for reorder. Rejected.
- **react-beautiful-dnd:** archived/unmaintained upstream ( Atlassian sunset ). Rejected.
- **react-dnd:** active but DnD-core heavy, no built-in sortable/keyboard helper; larger surface than needed.
- **@hello-pangea/dnd (react-beautiful-dnd fork):** maintained fork — viable fallback if `@dnd-kit/core` shows issues with this tree-reorder pattern.
- **sortablejs (+ React wrapper):** imperative DOM manipulation fights React's model; skip.

## Category D — Icons (UI-005/006/007/008/009/010)

### lucide-react 1.70.0 — SELECTED
- Sources: https://github.com/lucide-icons/lucide · https://www.npmjs.com/package/lucide-react
- Maintenance: active, weekly releases, ISC license.
- Size: 38.6 MB unpacked but per-icon ESM + tree-shaking — **near zero** bundle cost in practice (used icons only).
- Why: the de-facto open icon set for React; consistent 24px strokes match the Sprint 3 UI. No ecosystem risk.

### Alternatives considered and rejected
- **Inline SVG handcrafts:** maintenance burden, inconsistent stroke/weight.
- **react-icons:** larger aggregated bundles (includes brands); lucide is cleaner for a pure-product UI.
- **Heroicons:** good, but smaller set; lucide's 1500+ icons cover future M6 capture UI too.

## Category G — Toast notifications (UI-009)

Radix Dialog does **not** provide toasts. Sprint 3 already shipped a hand-rolled `ToastProvider` (aria-live, auto-dismiss); three options evaluated:

### sonner 2.0.8 — SELECTED
- Sources: https://github.com/emilkowalski/sonner · https://sonner.emilkowal.ski/
- Maintenance: highly popular, maintained by Emil Kowalski (Radix contributor, Vercel). MIT.
- Size: 174 kB unpacked (~25 kB gzip).
- **Zero dependencies** — no Radix/side packages.
- React 19 peer: `^18 || ^19` ✓.
- Accessibility: polite aria-live region, keyboard-dismissible, configurable announcement; API is simply `toast("Saved")` / `toast.success(...)` / `toast.error(...)` — matches our Offline §0 invariant (toasts reflect *post-commit* status only).
- Why selected: it is lighter than Radix Toast (12 Radix sub-deps, 193 kB unpacked), and it replaces — not duplicates — the hand-rolled `ToastProvider` we already built. Base dark/light styling matches the app theme. Risk: opinionated defaults (position/classNames) are customisable but need a small theme wrapper.

### Alternatives considered and rejected
- **@radix-ui/react-toast@1.3.1:** correct primitives but 193 kB unpacked across 12 sub-deps (~40 kB gzip), heavier than sonner for zero benefit in a local-first app. Land it via `radix-ui` meta if Radix Dialog is adopted as a full primitive set (UI-009 + UI-005 share Radix deps) — but the per-package cost is higher than sonner for the same outcome.
- **Hand-rolled toast (Sprint 3 status quo):** works, but has no swipe/dismiss animation, limited live-region control, and we would own the a11y test burden forever. The Sprint 3 version is a placeholder; M5 can afford either, but Sonner is more battle-tested.
- **Custom react-hot-toast clone:** rejected — reinvents Sonner.

## Category E — Tests for dialogs/palette (UI-009, UI-005)

### @testing-library/react + jsdom + @axe-core/playwright — SELECTED (next sprint)
- Sources: https://github.com/testing-library/react-testing-library · https://github.com/dequelabs/axe-core-npm
- Maintenance: Testing Library is the standard; jsdom maintained by the jsdom org. MIT.
- Why: UI-009's acceptance is an **a11y test** (focus trap/restore); axe-core via Playwright provides the axe-core audit path UI-011 (M9) needs. Testing Library's queries (`getByRole`) directly express Radix's `role="dialog"` semantics.
- Note: jsdom + fake-indexeddb limitation discussed in the plan — devDependency only, zero shipped bundle impact.

## Category F — date/URL/data

No additions. `date-fns`, `clsx`, `tailwind-merge` were considered and rejected: date needs are ≤ 5 helper functions (relative dates, range labels) already expressible with Intl/Date; class merging is trivial string concat in the Sprint 3 components. **Existing deps suffice.**

## Summary matrix

| Task | Selected | Why (one line) |
|---|---|---|
| UI-005 | cmdk | Canonical accessible palette; Radix cost shared with Category B |
| UI-006 | @dnd-kit/core + sortable + utilities | Full sortable = 3 pkgs; keyboard sensor lives in sortable; U1 persistance via existing repo |
| UI-007 | — (custom) | Rename/merge = thin forms over existing repo ops |
| UI-008 | — (custom) | Inbox = query composition over Sprint 2 repos |
| UI-009 | @radix-ui/react-dialog + sonner (toasts) | Focus trap/restore = UI-009's acceptance criterion; sonner replaces the placeholder toast provider |
| UI-010 | — (custom) | Prefs form + guarded `purgeDeletedResources` |
| UI-005..010 | lucide-react | Icons, tree-shaken, near-zero cost |
| UI-005, UI-009 | @testing-library/react + jsdom + axe-core | Acceptance-grade a11y/DOM tests |
| Bundling | ≤ 60 kB gzip shipped target* | Not measured yet; measurement strategy documented below |

## Explicitly rejected (global)
- **Shadcn/ui (as a framework):** useful as a *code reference* for Radix usage, but its `components.json`+RSC-oriented paths + Tailwind config coupling would fight our existing feature-folder layout and bundle budget. Reference it, don't adopt it.
- **React Router / RHF / Zustand / Redux / Sentry / analytics:** out of scope or against approved decisions (local-first, no telemetry, 3 state owners only).
- **MiniSearch in M5:** approved for M7 (SEARCH-*). Not smuggled in.

*Research tools used: `pnpm view` (npm registry metadata) on 2026-11-09.*

## Bundle measurement strategy (the ≤60 kB gzip figure is a TARGET, not a measurement)

Nothing in M5 planning assumes the ≤60 kB gzip number is verified. After implementation we measure, then decide:

1. **Baseline first.** Capture the pre-M5 build (`vite build` at the Sprint 3 commit = 146.34 kB gzip as reported), then rebuild after M5 lands. The delta is the actual ESM shipped code cost.
2. **Per-package.** Run `vite build --mode analyze` (or add `vite-plugin-visualizer` temporarily) to isolate cmdk, @radix-ui/*, dnd-kit/*, sonner, lucide-react chunks. CSS is tracked separately (Tailwind v4 output) because Radix/cmdk/dnd-kit ship no CSS — our own CSS growth is not lib cost.
3. **Tree-shaking check.** Confirm only imported entry points ship: `lucide-react` must import per-icon (`import { X } from "lucide-react"` — never the barrel), `@dnd-kit/sortable` only `useSortable` paths. If a barrel import sneaks in, the delta reveals it and it is fixed at source.
4. **Shared chunks.** Radix Dialog, cmd k's Radix deps, and DragAndDrop share `@radix-ui/*` chunks automatically in Rollup — count shared code once, don't sum per-category estimates.
5. **Gate.** If measured delta > 60 kB gzip, the first lever is `@dnd-kit` (biggest single contributor) — fallback is a "move up/down" button reorder with zero lib cost. If delta ≤ 60 kB, state it as measured in the Sprint 4 report and recompute headroom against the 250 kB budget.

Only after step 1–4 is a bundle figure written into acceptance evidence.
