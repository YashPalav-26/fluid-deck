# Fluid Deck — Sprint 4 Implementation Plan (M5)

*Date: 2026-11-09 · Planning only — no code, dependencies, or schema changed. Sprint 4 is NOT started; this document is not permission to implement.*
*Companion: `docs/SPRINT_4_TECHNOLOGY_EVALUATION.md` (library research + evidence).*

---

## 1. Sprint objective

Make the library **organizable and navigable** on top of the accepted M4 foundation: command palette, collection/tag management, capture inbox view, real accessible dialogs, and a settings screen — **without** search (M7), capture extension (M6), or import/export (M8).

## 2. Exact M5 task scope (from `docs/PHASE_3_TASK_BREAKDOWN.md`)

| Task ID | Description | P | Deps | Hrs | Acceptance |
|---|---|---|---|---|---|
| UI-005 | Command palette (K1) | Med | UI-003 ✅ | 3 | Keyboard-only pass |
| UI-006 | Collection management (nest, reorder U1) | High | DB-002 ✅ | 5 | Reorder persists; depth warn U2 |
| UI-007 | Tag management + rename/merge | High | DB-002 ✅ | 4 | Rename propagates (test) |
| UI-008 | Capture inbox (dated/linked views) | High | DB-002 ✅ | 3 | Inbox query returns dated+linked |
| UI-009 | Dialogs + notifications (toast) + empty states | Med | UI-003 ✅ | 3 | Focus trap/restore (a11y test) |
| UI-010 | Settings screen (prefs, purge U5, danger zone) | High | DB-008 ✅ | 3 | Purge default per U5 decision |

All six dependencies were satisfied by Sprint 2/3 (DB-002 repos shipped, DB-008 ViewState+prefs shipped, UI-003 shipped). **Zero outstanding dependency blocks.** Total ~21 h engineering effort.

**Explicitly out of M5:** UI-001..004 (done or M7), UI-011 (M9), EXT-001..007 (M6 capture), SEARCH-001..008 (M7), IMPORT-001..009 (M8), TEST-001..008 (M9/M10), DB-005's backup-restore leg (IMPORT-*), DB-006 manual two-tab check and Firefox popup click (unchanged carry-overs).

## 3. Task dependency map (within M5)

```
UI-009 (Radix Dialog) ──▶ UI-005 (cmdk imports Radix Dialog)
        │                    └─▶ UI-006 dialogs (rename/new collection)
        │                    └─▶ UI-007 dialogs (rename/merge tag)
        │                    └─▶ UI-010 (settings + purge confirm)
        └─▶ toast/empty states (extends Sprint 3 ToastProvider)
UI-006 ──▶ UI-008 (inbox "linked collections" rendering)
UI-003 (done) ──▶ UI-005/009
```

Suggested order: **UI-009 → UI-006 → UI-007 → UI-008 → UI-010 → UI-005** — foundations first (Radix Dialog unblocks all dialogs), palette last (cmdk imports Radix anyway, and palette actions should point at finished M5 features).

## 4. Implementation sequence

1. **UI-009 Dialogs (replace Sprint 3 placeholder)** — adopt `@radix-ui/react-dialog`; rebuild `contexts/dialog.tsx` on Radix primitives (keep the same `useDialog()` API so existing consumers don't change). Implement `DialogShell` (title, content, Close, onOpenChange), `ConfirmDialog` (danger/confirm), `FormDialog` (title/description/children/error). Toast: replace Sprint 3's hand-rolled `ToastProvider` internals with Sonner (keep `useToast()` API); Empty states: one shared `EmptyState` component used by inbox, settings, collections, tags.
2. **UI-006 Collections** — sidebar tree view with expand/collapse, create/rename/delete (existing repo ops all present: `createCollection/renameCollection/reparentCollection/reorderCollection/deleteCollection/getCollectionDepth`), drag-reorder **and** keyboard reorder via `@dnd-kit/core` (Space-lift/arrow-move/Enter-drop), depth warning ≥ 4 (U2: `isDepthWarning` already in `packages/core/src/ordering.ts` — render warn icon + text, never block), form dialogs for new/rename with the name validation from repo layer.
3. **UI-007 Tags** — sidebar tag list with rename/merge/delete using existing `renameTag/mergeTags/deleteTag` repo ops (Sprint 2 already tested propagation + merge). U6 free-form names: trimmed, 1–200 chars, existing `normalizeTagName` is the authority. Merge dialog: pick target tag, show the propagation count back from repo result.
4. **UI-008 Capture inbox** — two views (Dated: by `createdAt`, Linked: by `parentId` chains — both derivable from Sprint 2 data) using a new `services/inbox.ts`; empty state via UI-009's `EmptyState`. No capture *extension* here — inbox is a view over existing Dexie data. EXT-001..007 remain M6.
5. **UI-010 Settings** — prefs form (theme — see §6; purge retention days default 30 per U5; dangerous purge button with ConfirmDialog → `purgeDeletedResources`, existing repo fn). Data-safety rule: purge is explicit-confirm only (Sprint 2 rule preserved).
6. **UI-005 Command palette** — `cmdk` (`cmdk` filters items; not an index) with groups: Navigate / Create / Actions. Items: go All/Trash, go to a collection/tag, New collection, New tag, Toggle theme (→ UI-010 prefs), Open settings. Keyboard: `Ctrl/Cmd+K` opens, arrows/enter/Esc handled by cmdk; ensure palette items that mutate invalidate via the shared `invalidateResourceQueries` helper from `hooks/queries.ts`. Add a header button for discoverability.

Each task: implement → tests → typecheck/lint → acceptance check → report, per Sprint 3 workflow.

## 5/6. Third-party library evaluation + recommended dependencies

Full evidence in `SPRINT_4_TECHNOLOGY_EVALUATION.md`. Summary:

| Rec | Purpose | Size est. | Verdict |
|---|---|---|---|
| `cmdk@1.1.1` | UI-005 palette (filters, not index) | ~28 kB gzip | **Adopt** |
| `@radix-ui/react-dialog` | UI-009 dialogs, focus trap/restore | few kB gzip | **Adopt** — URL for UI-009 acceptance |
| `sonner@2.0.8` | UI-009 toast (replaces Sprint 3 hand-rolled `ToastProvider`; Radix Dialog provides no toast) | ~25 kB gzip, zero deps | **Adopt** (lighter than `@radix-ui/react-toast` 40 kB gzip across 12 sub-deps) |
| `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` + `@dnd-kit/utilities@3.2.2` | UI-006 keyboard drag reorder (sortable = full sortable impl; core alone does NOT include sortable) | est. ≤ 50 kB gzip | **Adopt the 3-package set** (sortable peer `@dnd-kit/core ^6.3.0` ✓; U1 persistence via existing `reorderCollection`; dragend geometry only) |
| `lucide-react@1.70.0` | icons UI-005..010 | near-zero (tree-shaken) | **Adopt** |
| `@testing-library/react` + `jsdom` + `@axe-core/playwright` (devDeps) | UI-009 a11y test + UI-005 keyboard pass | 0 shipped | **Adopt** |

Estimated total shipped addition: **≤ 60 kB gzip TARGET** (not yet measured — measurement strategy in `SPRINT_4_TECHNOLOGY_EVALUATION.md`; plan §14 gate runs on the *measured* delta, not the estimate).

## 7. Existing components worth reusing

- Sprint 3 `DialogProvider` API - keep `useDialog()` surface, replace internals with Radix; `ToastProvider` surface kept, internals swapped to Sonner.
- Sprint 2 repo ops: `createCollection`, `renameCollection`, `reparentCollection`, `reorderCollection`, `deleteCollection`, `getCollectionDepth`, `renameTag`, `mergeTags`, `deleteTag`, `purgeDeletedResources`, `createCollection/createTag/etc.` — all present with transaction guarantees.
- `packages/core/src/ordering.ts` — U1 (`orderBetween`, `needsResequence`, `resequence`) + U2 (`collectionDepth`, `isDepthWarning`) already implemented for UI-006; **zero new ordering logic needed**.
- `packages/core/src/preferences.ts` + `preferences` repo — `theme`, `purgeRetentionDays` settings plumbing present for UI-010.
- `invalidateResourceQueries` helper — reuse for every mutation hook in M5.
- QueryClient invalidations in `hooks/queries.ts` — extend the pattern, don't reinvent.

## 8. Custom implementation decisions (and why)

| Decision | Custom? | Reason |
|---|---|---|
| Reorder UX | **No — @dnd-kit** | Keyboard/touch semantics too easy to get wrong by hand |
| Dialog primitives | **No — Radix** | Focus trap/restore *is* UI-009's acceptance |
| Palette filtering | **No — cmdk** | Filtering/keyboard/ARIA is 80% of the work |
| Collection tree presentation | Yes | Product-specific nesting/rule rendering; no generic tree library beats a purpose-built 100-line component at this size |
| Inbox dated/linked views | Yes | Query composition over own repos; no library fits the domain |
| Tag rename/merge UI | Yes | 2 dialogs over existing repo ops; forms are trivial |
| Settings/purge UI | Yes | Product-specific; trap from Radix, no form library needed |
| Theme persistence fix | Yes | ~5-line change (see §9) — no library is 5 lines |

## 9. Sprint 3 findings carried forward (verdict per item)

| # | Finding | M5 verdict |
|---|---|---|
| 1 | Theme preference write-only (resets on reload) | **Fix in M5 via UI-010.** Settings is the natural home: `ThemeProvider` gains a mount effect reading the `theme` pref (after `openDatabase()`); settings toggle + header toggle both write through the existing `setPreference`. ~5 lines + test. This is M5-scope *because UI-010 owns settings screen*. |
| 2 | `totalCount` always equals `resources.length` | Defer. Cosmetic dead footer; revisit in M9 hardening. No M5 task touches the grid's count logic. |
| 3 | `?view=trash` outside ViewState schema | Defer to UI-004/M7. Record in decision register when UI-004 lands. |
| 4 | Append-on-scroll (not true virtualization) | Defer. 500-cap keeps DOM bounded; revisit only if M7 search lifts the cap. |
| 5 | No DOM component tests | Fix in M5 via UI-009 + UI-005 acceptance tests (Testing Library). |
| 6 | Empty dialog context | Fix in M5 via UI-009 (Radix rebuild + concrete dialogs) |
| 7 | `q` ignored until M7 | Defer (SEARCH-002/UI-004, M7). Unchanged. |
| 8 | Bundle 146.34 kB gzip | Monitor. Adoption budget est. ≤ 60 kB; must remain < 250 kB (build gate in §14). |

## 10. Testing strategy

- **Per-task:** Vitest unit tests at the Sprint 3 pattern (service/query invalidation, repo ops already covered). UI-007's "rename propagates (test)" is the acceptance line — new DOM test via Testing Library asserting rename → list reflects + join rows intact.
- **UI-009 acceptance:** jsdom Testing Library test — open dialog → focus is inside → Esc closes → focus returns to trigger. Plus an axe-core Playwright audit of a rendered dialog.
- **UI-005 acceptance:** keyboard-only path test (open palette, arrow to action, Enter, assert state change + focus restoration) — real Playwright browser test preferred over jsdom for a cmdk integration.
- **UI-006 acceptance:** reorder persistence test (unit, fake-indexeddb) + Playwright drag/keyboard smoke. Depth warn: unit test on `isDepthWarning` edge (already tested in Sprint 2? — verify, not assume).
- **Full M5 sweep:** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm build`, `pnpm test:e2e` — same gates as Sprint 3.
- **Not in M5:** real-browser two-tab check (DB-006), Firefox popup click — carry-overs, still unclaimed.

## 11. Accessibility requirements (WCAG 2.2 AA)

- Palette: full keyboard operability (open `Ctrl/Cmd+K`, arrows/Enter/Esc, `aria-activedescendant` via cmdk), focus returns to invoker on close.
- Dialogs: `<div role="dialog" aria-modal="true">` with focus trap + restore (Radix), labelled by title, announced to screen reader (axe-core test).
- Reorder: keyboard sortable (`@dnd-kit/accessibility` announcements), visible focus rings, not color-only depth warning (icon + text + weight).
- Touch targets ≥ 40×40px on palette actions; mobile sidebar and dialogs scroll cleanly.
- Full screen-reader audit is M9 (UI-011) — M5 guarantees primitives are correct, not the final pass.

## 12. Security & privacy considerations

- Unchanged: text-only rendering, http(s)-only URLs enforced by repository layer, `noreferrer noopener` links.
- Purge (UI-010) requires explicit Radix `ConfirmDialog` + describes what will be deleted (count + irreversibility) — **no** silent/periodic auto-purge (U5: configurable retention, explicit confirm; Sprint 2 rule).
- No telemetry, no external requests beyond resource thumbnails; cmdk/Radix/dnd-kit/lucide introduce **no network calls**.
- Dependabot-style risk: newly added deps pinned (`^version`) + lockfile committed, same as TanStack Query precedent.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Radix/cmdk React 19 peer warnings | Both declare `^19` peer support; verify at Sprint 4 start with `pnpm install --frozen-lockfile` smoke |
| jsdom + fake-indexeddb interference in dialog tests | Dialog/palette mount tests run in jsdom only for consumers that don't touch Dexie; DB-backed flows stay in Playwright |
| dnd-kit bundle larger than estimated | Gate on build: if gzip improvement is <20% against the pre-dnd build and UX still reads well, tree-shake further or fall back to up/down button reorder (no lib needed) |
| Scope creep to UI-004 search (	cmdk as index) | cmdk filters its item list only; palette must not implement keyword retrieval — M7 owns that |

## 14. Acceptance criteria (per task, verbatim from breakdown)

- UI-005: keyboard-only pass — complete palette interaction via keyboard, focus restored on close.
- UI-006: reorder persists across reload; depth warning at 4 levels (U2), never blocking; nested create/rename/delete all transactional.
- UI-007: rename propagates (DOM test: renamed tag appears everywhere, old name gone, resource counts intact); merge moves memberships and deletes source.
- UI-008: inbox Dated view returns resources in `createdAt` order; Linked view returns resources whose `parentId` chain lands at an existing collection; both empty states handled.
- UI-009: focus trap + focus restore proven by a11y test; toast notifications for all M5 mutations; empty states across collections/tags/inbox/settings.
- UI-010: purge retention defaults 30 (U5); explicit confirm required; purge executes via existing `purgeDeletedResources`; theme toggle persists across reload.

## 15. Definition of done

- All six tasks pass their acceptance criteria.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm build`, `pnpm test:e2e` all green, reported with actual results.
- Bundle ≤ 250 kB gzip measured delta: baseline = `vite build` at the Sprint 3 commit; after M5, rebuild and compare. The ≤60 kB gzip figure is a TARGET at planning time; only the measured delta is written into acceptance evidence (strategy in `SPRINT_4_TECHNOLOGY_EVALUATION.md`). Gate fails if measured gzip delta > 60 kB — re-negotiate the dependency set (first lever: `@dnd-kit` → up/down button reorder), not the 250 kB budget.
- `docs/SPRINT_4_IMPLEMENTATION_REPORT.md` (filled at implementation end) + `docs/PROJECT_PROGRESS.md` updated; historical reports untouched.
- No push, no commit, no Sprint 5/M6 work. Stop and wait for approval.
