# Fluid Deck — Sprint 6 (M7) Implementation Plan

*Date: 2026-11-10 · Planning only. Sprint 6 implementation NOT started; this document is not permission to implement.*
*Companion: `docs/SPRINT_6_READINESS_REVIEW.md` (readiness review, preflight status).*
*Architecture sources: `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` (Phase 2.4), `docs/architecture/PERFORMANCE_BUDGETS_AND_ACCESSIBILITY.md` (Phase 2.8), `docs/PHASE_3_TASK_BREAKDOWN.md` (M7 rows).*

---

## 1. Sprint objective

Make the library **searchable and faceted**: a shared tokenizer and MiniSearch index built from Dexie on every app start, with faceted filtering, a 500-hit cap, incremental updates on write, benchmark evidence, and a search UI (dedicated input + existing ⌘K palette) with URL state — **without** import/export (M8), hardening (M9), or any new architecture beyond the approved Phase 2.4 design.

## 2. Exact M7 task scope (from `docs/PHASE_3_TASK_BREAKDOWN.md`)

| Task | Title | P | Deps | Hrs | Acceptance |
|---|---|---|---|---|---|
| SEARCH-001 | Shared tokenizer (single impl, `core`) | High | CORE-001 ✅ | 2 | Tokenizer unit tests |
| SEARCH-002 | MiniSearch build (fields/weights per 2.4) | High | SEARCH-001 | 4 | Query tests (AND/OR, pin) |
| SEARCH-003 | Startup rebuild (chunked, post-paint, "Indexing…") | High | SEARCH-002 | 3 | Degraded browse-only mode |
| SEARCH-004 | Incremental update on write (post-commit) | High | SEARCH-002 | 2 | No stale results after edit |
| SEARCH-005 | Faceted filtering + 500-hit cap | High | SEARCH-002 | 3 | Cap enforced; windowing engaged |
| SEARCH-006 | Benchmark: 1k/5k/10k (build, p95, memory) | High | SEARCH-003 | 4 | Report vs budgets (proposed) |
| SEARCH-007 | Worker seam decision (only if >500 ms @10k) | Low | SEARCH-006 | 1 | Decision recorded |
| SEARCH-008 | Search failure recovery (empty index → rebuild) | Medium | SEARCH-003 | 2 | Corrupt-index rebuild test |
| UI-004 | Search UI (input, ⌘K, `/`, facets, sort) | High | SEARCH-002 | 5 | URL state; empty/error states |

**Out of M7:** IMPORT-*/TEST-* (M8/M9), EXT beyond M6, cloud sync, auth, AI, FTS5/SQLite (Phase 8+), semantic/hybrid search, stemming/synonyms, notes search (defer until asked), workers (only if measured).

## 3. Task dependency map (within M7)

```
SEARCH-001 (tokenizer, packages/core)
   └─▶ SEARCH-002 (MiniSearch build + adapter, apps/web)
          ├─▶ SEARCH-003 (chunked rebuild) ──▶ SEARCH-006 (benchmark) ──▶ SEARCH-007 (worker seam)
          │        └─▶ SEARCH-008 (recovery)
          ├─▶ SEARCH-004 (incremental update)
          ├─▶ SEARCH-005 (facets + 500 cap)
          └─▶ UI-004 (search UI, apps/web/src/features/search/)
```

Order: **SEARCH-001 → SEARCH-002 → SEARCH-003 → (SEARCH-004 ∥ SEARCH-005 ∥ SEARCH-008) → SEARCH-006 → SEARCH-007 → UI-004**. UI-004 lands last so it consumes a finished Search Service and a measured bundle delta.

## 4. Implementation sequence

### SEARCH-001 — Shared tokenizer (pure `packages/core`)
One tokenizer used at both index time and query time (single source — the most common search bug is divergent tokenization). NFC-normalize, lowercase, split on punctuation/non-alphanumerics (incl. hyphen, URL delimiters), CamelCase split + keep joined token, no stop words, no stemming, prefix + fuzzy at query time via MiniSearch. URL tokenization: split on `/ ? = & . - _`, domain tokenized separately. Diacritics kept. Unit tests in `packages/core` (Vitest, no browser globals).

### SEARCH-002 — MiniSearch build (install + measure)
Install `minisearch ^7.2.0` (the only new dependency). Build the MiniSearch instance in `apps/web` over derived documents (id, title×3, tagsText×2, description×1, urlText×0.6, collectionsText×0.5, typeText×0.4). Exact-title pin, AND-then-OR degrade, tie-breaks (updatedAt desc, title A–Z, id). Adapter ≤ ~80 lines, keeps MiniSearch's concrete API out of services. **Measure bundle delta before proceeding** (approved decision 4); record raw + gzip. If delta threatens the 250 kB budget, code-split/lazy-load at this point (not speculatively).

### SEARCH-003 — Startup rebuild (chunked, post-paint)
Open DB → integrity check → first paint → chunked async build → `indexReady` announcement. UI shows "Indexing…" until ready; cold start shows empty results with the honest state (no stale index). Degraded browse-only mode if build fails (search disabled, grid still works).

### SEARCH-004 — Incremental update on write (post-commit)
Search Service subscribes to TanStack Query invalidations that fire after Dexie commits (same post-commit hook as capture, Phase 2.3 §5.4). Per-event: create → `add`; update → diff searchable fields, `replace` if changed else skip; soft delete/restore → `remove`/`add`; hard purge → `remove`; tag/collection rename/merge → targeted `replace` per affected resource. Extension capture drafts never indexed.

### SEARCH-005 — Faceted filtering + 500-hit cap
Facets computed in Dexie (type, source, date range, collection incl. descendants, tags OR, unorganized) → candidate IDs; intersect with MiniSearch keyword hits in the Search Service; facet counts over the post-query candidate set. Result cap 500; empty query → faceted browse sorted by default (Newest). Sort override (relevance / newest / oldest / title).

### SEARCH-006 — Benchmark (1k/5k/10k)
Seed datasets (100/1k/5k/10k synthetic resources, deterministic). Measure build time, query p95, memory (Chrome heap snapshots). Report vs proposed budgets (build ≤500 ms, query p95 ≤50 ms at 10k). **Document actual browser, throttling (Slow 4G), hardware (Moto G4-class CPU), and methodology (cold cache)** (approved decision 5).

### SEARCH-007 — Worker seam decision
Only activate a Web Worker if measured build time at 10k exceeds 500 ms. Record the decision (worker or not) in the implementation report. Default: no worker (Phase 2.4/2.8 contract).

### SEARCH-008 — Search failure recovery
Empty/corrupt in-memory index → rebuild. Because the index is never persisted, recovery is always rebuild-on-next-start; SEARCH-008 adds the explicit "empty index → rebuild" path and test (corrupt-index rebuild). `searchSchemaVersion` marker in preferences for future migration bumps.

### UI-004 — Search UI (new `apps/web/src/features/search/`)
Dedicated shell search input (approved decision 2) **plus** existing Cmd/Ctrl+K palette; both share one Search Service/index. `/` focuses dedicated search (only when not in an input). Facet chips, sort selector, empty/error states, highlight via stored fields, results count live region ("N results"), "Indexing…" state, AND-then-OR partial-match indicator. URL state for `{q, type, collection, tags, date, source, sort}` with backward-compatible round-trips including `view=trash` (approved decision 3 — extend core ViewState; implement during UI-004). Empty query → faceted browse (not a search). Keyboard map preserved (⌘K, `/`, Esc stack, arrows). Accessibility: WCAG 2.2 AA, focus management, `prefers-reduced-motion`.

## 5. Technology decisions

| Capability | Decision | Why |
|---|---|---|
| Search index | `minisearch ^7.2.0` (ADR-007) | Approved; only new dependency |
| Tokenizer | Custom, single impl in `packages/core` | Phase 2.4 §2; single source prevents divergent tokenization |
| Facets | Dexie indexed queries + intersection in Search Service | Phase 2.4 §4; cheaper than MiniSearch filter closures |
| Rebuild | Chunked async post-paint, not persisted, no worker | Phase 2.4 §6–7; measure first |
| Search presentation | `apps/web/src/features/search/` | Approved decision 1 |
| Search entry | Dedicated input + existing palette, shared service | Approved decision 2 |
| Trash in URL | Extend core ViewState (`view=trash`) | Approved decision 3 |
| Bundle | Measure first; split only if needed | Approved decision 4 |
| Benchmark env | Slow 4G, Moto G4, cold cache, documented | Approved decision 5 |
| Tests | Vitest (unit/tokenizer/recovery), Playwright (search e2e) | Existing stack |

**No additional dependencies** (no `vite-bundle-visualizer` unless measurement requires it; no worker library; no virtualization library).

## 6. Files and modules affected

- `packages/core/src/` — tokenizer, field-weight constants, ranking constants, ViewState extension (`view=trash`) (SEARCH-001, UI-004)
- `apps/web/src/services/` (or `apps/web/src/search/`) — Search Service (build/query/intersect/rank) (SEARCH-002..008)
- `apps/web/src/bridge/` — unchanged (search never touches the bridge)
- `apps/web/src/features/search/` — search UI (UI-004) (new directory, approved decision 1)
- `apps/web/src/features/palette/` — palette consumes Search Service for resource jumps (UI-004)
- `apps/web/src/main.tsx` — index-ready wiring (SEARCH-003)
- `packages/ui/` — search presentation components only (UI-004)
- `packages/extension-core/` — untouched
- Tests: tokenizer unit tests, MiniSearch query tests, rebuild/recovery tests, search e2e

## 7. Testing strategy

- **Unit (Vitest, `packages/core`):** tokenizer (NFC, CamelCase split, URL tokenization, diacritics kept), field weights, ranking constants, ViewState `view=trash` round-trip.
- **Unit (Vitest, `apps/web`):** MiniSearch query (AND/OR degrade, exact-title pin, tie-breaks), incremental update (no stale after edit), facet intersection, 500-cap, recovery (empty index → rebuild), degraded browse-only mode.
- **Benchmark (Playwright or in-browser timer):** 100/1k/5k/10k seed datasets; build time, query p95, memory heap snapshots; report vs budgets.
- **E2E (Playwright):** search flow (type → results → click), `/` focus, ⌘K palette resource jumps, facets, sort, empty/error states, "Indexing…" state, partial-match indicator, URL round-trip including `view=trash`.
- **Accessibility:** axe-core on search view; keyboard-only path; live-region announcement; `prefers-reduced-motion`.
- **Bundle gate:** measured delta at SEARCH-002; build fails if initial JS > 250 kB without an approved decision.

## 8. Accessibility requirements (WCAG 2.2 AA)

- Dedicated search input: labelled, `role="search"`, focus ring, `/` shortcut only when not in an input (Phase 2.8 §4).
- Results count announced via `role="status"` live region (polite) after search.
- Facet chips: keyboard operable, `aria-pressed`/selected state, removable via keyboard.
- Sort selector: standard select/listbox semantics.
- "Indexing…" state announced to AT.
- Empty/error states: text + icon, not color alone; focus moves to a sensible target.
- `prefers-reduced-motion`: disable transitions.
- Full screen-reader audit remains M9 (TEST-004); M7 guarantees primitives correct.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| MiniSearch bundle exceeds 250 kB headroom | Measure at SEARCH-002; code-split/lazy-load only if needed (decision 4); adapter stays thin |
| Index build blocks first paint at 10k | Chunked post-paint build + honest "Indexing…" state; worker seam exists if measured (SEARCH-007) |
| Divergent tokenization (index vs query) | Single tokenizer in `packages/core`, unit-tested |
| Stale results after write | Incremental update on post-commit hook; SEARCH-004 test |
| Facet intersection cost | Dexie indexed queries; candidate sets small |
| URL state drift (`view=trash`) | Extend ViewState with backward-compatible round-trip (decision 3) |
| AND-then-OR surprise results | Partial-match indicator in UI; documented limitation |
| No stemming/synonyms | Documented accepted limitation (Phase 2.4 §2); FTS5 migration seam Phase 8+ |

## 10. Acceptance criteria (per task, verbatim from breakdown)

- SEARCH-001: tokenizer unit tests.
- SEARCH-002: query tests (AND/OR, pin).
- SEARCH-003: degraded browse-only mode.
- SEARCH-004: no stale results after edit.
- SEARCH-005: cap enforced; windowing engaged.
- SEARCH-006: report vs budgets (proposed).
- SEARCH-007: decision recorded.
- SEARCH-008: corrupt-index rebuild test.
- UI-004: URL state; empty/error states.

## 11. Definition of done

- All 9 tasks pass their acceptance criteria with actual runs.
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm build`, `pnpm test:e2e` green, reported with actual results.
- Initial JS ≤ 250 kB gzip (measured, not estimated); bundle delta recorded.
- Benchmark report recorded (build/query p95/memory vs budgets) with documented environment.
- Worker seam decision recorded (SEARCH-007).
- `docs/SPRINT_6_IMPLEMENTATION_REPORT.md` created; `docs/PROJECT_PROGRESS.md` updated. Historical reports untouched.
- No push, no commit of Sprint 6 work. Stop and wait.

---

## M9-006 reconciliation (2026-11-14)

**Status (2026-11-14):** this plan was executed. The worker was activated (SEARCH-007/008) and the whole feature is committed - see `docs/M9_INTEGRATION_REPORT.md` for the task-by-task record and the clean-clone evidence.
