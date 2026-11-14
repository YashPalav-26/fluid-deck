# Fluid Deck — Sprint 6 (M7) Readiness Review

*Date: 2026-11-10 · Preflight only — no source code, dependencies, schema, or commits changed. Sprint 6 implementation (SEARCH-001..008, UI-004) NOT started; this document is not permission to implement.*

*Companion: `docs/SPRINT_6_IMPLEMENTATION_PLAN.md` (proposed plan, preflight status).*

---

## 0. Git state (verified 2026-11-10)

- Branch `main`, tracking `origin/main`. Local HEAD = `4027425b47f57a80a52b2f5226d31e45794a5e47` ("docs: finalize Sprint 5 pre-push checkpoint status") = `origin/main`. **Synchronized: 0 ahead, 0 behind.** No fetch/push performed.
- Working tree clean except intentionally untracked `poc/` (preserved, not staged).
- Sprint 5 (M6) commits `302583a` … `8f543c8` plus hygiene `4027425` are on both local and origin. Sprint 5 is pushed.
- Verification baseline (run 2026-11-10): `typecheck` 5/5, `test` 36 files / 296 passed, `lint` clean, `prettier --check .` clean, `build` web 200.80 kB gzip (single chunk), extension builds green. `git diff --check` clean.

## 1. Exact M7 task list

From `docs/PHASE_3_TASK_BREAKDOWN.md`, milestone **M7** (total **26 h**):

| Task | Title | Dep | Status of dep | Hrs |
|---|---|---|---|---|
| SEARCH-001 | Shared tokenizer (single impl, `core`) | CORE-001 | ✅ Done (Sprint 2) | 2 |
| SEARCH-002 | MiniSearch build (fields/weights per 2.4) | SEARCH-001 | internal | 4 |
| SEARCH-003 | Startup rebuild (chunked, post-paint, "Indexing…") | SEARCH-002 | internal | 3 |
| SEARCH-004 | Incremental update on write (post-commit) | SEARCH-002 | internal | 2 |
| SEARCH-005 | Faceted filtering + 500-hit cap | SEARCH-002 | internal | 3 |
| SEARCH-006 | Benchmark: 1k/5k/10k (build, p95, memory) | SEARCH-003 | internal | 4 |
| SEARCH-007 | Worker seam decision (only if >500 ms @10k) | SEARCH-006 | internal | 1 |
| SEARCH-008 | Search failure recovery (empty index → rebuild) | SEARCH-003 | internal | 2 |
| UI-004 | Search UI (input, ⌘K, `/`, facets, sort) | SEARCH-002 | internal | 5 |

All external dependencies (CORE-001 tokenizer host in `packages/core`) are satisfied. SEARCH-001 has no MiniSearch dependency and can start immediately. MiniSearch (`^7.2.0`, ADR-007) is introduced at SEARCH-002, not before.

## 2. Readiness verdict: **READY WITH CONDITIONS**

Conditions remaining after preflight:
1. **M6 manual capture-pipeline checks** (real browser/macOS interaction) are not yet performed — see §8 matrix. Required before M7 integration testing that exercises captured resources; SEARCH-001/002 implementation does not depend on them.
2. **MiniSearch bundle delta** is unmeasured (MiniSearch is not installed; boundary: no new dependencies in preflight). Baseline measured = 200.80 kB gzip single chunk; headroom = 49.20 kB against the 250 kB initial-JS budget. Delta must be measured at SEARCH-002 before UI-004 ships (approved decision 4).
3. **Benchmark environment** must be documented (browser, throttling, hardware, methodology) per approved decision 5 when SEARCH-006 runs.

No other gate blocks M7. SEARCH-001 (tokenizer, pure `packages/core`, no MiniSearch) can start on approval. Nothing in M7 scope depends on unresolved product decisions: the five approved decisions below close the previously open questions.

## 3. Carryovers — classification

### Capture-pipeline checks required for M7 integration (EXT-005/EXT-006)

| Item | Status | Who performs |
|---|---|---|
| Context-menu "Save to Fluid Deck" (B1) in Chrome/Edge | Manual — not run | User (browser) |
| `Ctrl+Shift+S` / `⌘⇧S` shortcut (B2) in Chrome/Edge | Manual — not run | User (browser) |
| macOS `⌘⇧S` | Manual — not run | User (macOS) |
| Same two triggers in Firefox | Manual — not run | User (browser) |
| Web-app-closed → reopen drain path | Manual — not run | User (browser) |
| Real rendered toolbar popup click | Manual — not run | User (browser) |
| Firefox popup rendering | Manual — not run | User (browser) |
| Screen-reader pronunciation of popup live region | Manual — not run | User (AT) |

Automated coverage already exists and is green: `e2e/bridge.spec.ts` (real Chromium, real handshake + Dexie commit + ack, replay idempotency) and `e2e/capture-triggers.spec.ts` (3 real-browser triggers) and `e2e/popup.spec.ts` (status lifecycle, keyboard, axe scan via the documented Playwright seam). These are **not** a substitute for the manual items above; they are reported as executed (13/13 e2e at last run).

### Non-blocking carryovers (not capture-pipeline)

| Item | Class | Notes |
|---|---|---|
| DB-006 two-tab / `versionchange` manual check | Non-blocking carryover (M3) | M7 does not touch persistence; remains unclaimed |
| U4 canonicalization exception-host list (empty) | Non-blocking carryover (M3) | Canonicalization unchanged by M7 |
| Manual drag/keyboard reorder pass | Future (M9, UI-011) | M7 does not touch collections panel |
| Full screen-reader pass (NVDA/VO) | Future (M9, TEST-004) | M7 guarantees primitives correct; final pass is M9 |
| `?view=trash` outside ViewState schema | Addressed by approved decision 3 (record now; implement in UI-004) | Backward-compatible round-trip required |
| `totalCount` cosmetic dead footer | Deferred to M9 | No M7 task touches grid count logic |
| Append-on-scroll (not true virtualization) | Deferred | 500-cap keeps DOM bounded; revisit only if M7 lifts the cap |

## 4. Technology / dependency decisions (proposed)

- **One new dependency: `minisearch ^7.2.0`** (ADR-007 mandated; npm latest). All other M7 work uses existing stack (Vite, React, Dexie, TanStack Query, Zod, Tailwind). No `vite-bundle-visualizer` added unless needed for measurement.
- No Web Worker, no virtualization library, no FTS5/SQLite — per Phase 2.4/2.8 "measure first" contract; SEARCH-007 only activates a worker if measured build time at 10k exceeds 500 ms.
- `packages/core` owns the pure tokenizer, field-weight constants, and ranking constants (unit-testable without a browser or MiniSearch). `apps/web` owns the Search Service and the MiniSearch adapter (thin wrapper, ≤ ~80 lines). Search presentation lives in `apps/web/src/features/search/` (approved decision 1). `packages/ui` gets search presentation components only; zero indexing code.
- `packages/extension-core` is untouched by search.

## 5. Approved decisions (recorded 2026-11-10)

| # | Decision | Resolution |
|---|---|---|
| 1 | Search presentation location | `apps/web/src/features/search/`; indexing stays in services |
| 2 | Search entry points | Dedicated shell search input **plus** existing Cmd/Ctrl+K palette; both share one Search Service/index. `/` focuses dedicated search |
| 3 | `view=trash` in ViewState | Extend core ViewState to support `view=trash` with backward-compatible URL round-trips during UI-004 (record now; implement in UI-004) |
| 4 | Bundle strategy | Measure bundle first; code-split/lazy-load only if needed to meet initial JS ≤ 250 kB gzip |
| 5 | Benchmark environment | Slow 4G, Moto G4-class CPU, cold cache; document actual browser, throttling, hardware, and methodology |

Recorded in `docs/PHASE_3_DECISION_REGISTER.md` (M7 / Sprint 6 section) and referenced in `docs/SPRINT_6_IMPLEMENTATION_PLAN.md`.

## 6. Plan quality gates (checked)

- Every M7 task maps to an approved task ID ✅ (SEARCH-001..008, UI-004)
- Sequence respects within-sprint deps ✅ (SEARCH-001 → SEARCH-002 → SEARCH-003/004/005; SEARCH-006 → SEARCH-007; UI-004 after SEARCH-002)
- No future milestone tasks pulled forward (IMPORT-*/TEST-* not claimed) ✅
- No new architecture decisions beyond approved search architecture (Phase 2.4) ✅
- New dependency count: 1 (`minisearch`), ADR-007-mandated ✅
- Source code: untouched by this review ✅

## 7. Implementation sequence & estimate

SEARCH-001 (2h, tokenizer in `packages/core`) → SEARCH-002 (4h, MiniSearch build + adapter, install + measure bundle delta) → SEARCH-003 (3h, chunked rebuild) → SEARCH-004 (2h, incremental update) + SEARCH-005 (3h, facets + 500 cap) → SEARCH-006 (4h, benchmark report) → SEARCH-007 (1h, worker seam decision) → SEARCH-008 (2h, recovery) → UI-004 (5h, search UI) = **26 h** — matches the reconciled task breakdown (SEARCH-001..008 = 21 h + UI-004 = 5 h).

`PHASE_3_IMPLEMENTATION_PLAN.md` M7 row corrected from "15–22" to "26" (forward-looking planning figure).

## 8. M6 manual verification matrix (audit)

### Automated (executed, green) — not a substitute for manual items

| Check | Tool | Result |
|---|---|---|
| Bridge handshake + Dexie commit + ack + replay idempotency | Playwright (real Chromium, built extension) | 1/1 green (`e2e/bridge.spec.ts`) |
| Context-menu + shortcut + restricted-URL triggers | Playwright (real Chromium) | 3/3 green (`e2e/capture-triggers.spec.ts`) |
| Popup status lifecycle, keyboard, duplicate-click, axe scan | Playwright (popup-as-tab seam) | 9/9 green (`e2e/popup.spec.ts`) |
| Unit suites (outbox, metadata, thumbnail, transport, relay, inbox, popup-status, repo) | Vitest | 296/296 green |
| Typecheck / lint / format / build | tsc, eslint, prettier, vite | all green |

### Manual (NOT executed — require user/browser/macOS interaction)

| Check | Requires | Status |
|---|---|---|
| Context-menu item click in Chrome/Edge | Browser | **Not run** |
| `Ctrl+Shift+S` / `⌘⇧S` chord in Chrome/Edge | Browser | **Not run** |
| macOS `⌘⇧S` | macOS | **Not run** |
| Same two triggers in Firefox | Browser | **Not run** |
| Web-app-closed → reopen drain | Browser | **Not run** |
| Real rendered toolbar popup click | Browser (Chrome-owned window) | **Not run** |
| Firefox popup rendering | Browser | **Not run** |
| Screen-reader pronunciation of popup live region | AT (NVDA/VO) | **Not run** |
| DB-006 two-tab `versionchange` | Browser (two tabs) | **Not run** |
| Manual drag/keyboard reorder | Browser | **Not run** (M9) |
| Full screen-reader pass | AT | **Not run** (M9) |

**Nothing above is claimed as passed.** Automated e2e covers the logic; the manual items remain the user's to execute.

## 9. Bundle baseline (measured 2026-11-10)

Reproducible command: `pnpm --filter @fluid-deck/web build` (Vite 7.3.7). Output:
- `dist/assets/index-CEqyBrEr.js` — 648.66 kB raw, **200.80 kB gzip** (single chunk; no code splitting configured).
- `dist/assets/index-B44mpNS_.css` — 20.28 kB raw, 4.64 kB gzip.
- `dist/index.html` — 0.40 kB raw, 0.27 kB gzip.

Initial JS = total JS = 200.80 kB gzip (single chunk; all routes load the full bundle on first paint). Independent `gzip -9` of the same file = 195.36 kB (compression-level difference; Vite's reported gzip is the canonical baseline).

Headroom vs 250 kB initial-JS budget = **49.20 kB**. MiniSearch (`^7.2.0`, unpacked 826 KB) must be measured at SEARCH-002; code-split/lazy-load only if needed (approved decision 4). No speculative optimization performed.

## 10. Recommended next action

1. User: review this preflight report, the proposed Sprint 6 plan, and the recorded decisions.
2. Resolve the remaining conditions as appropriate (manual capture checks are the main user-owned gate).
3. On approval, authorize Sprint 6 (M7) implementation starting with SEARCH-001 (tokenizer, no MiniSearch), then SEARCH-002 (install MiniSearch + measure bundle delta before UI-004).
4. Do not stage, commit, or push without explicit separate authorization.

---

## M9-006 reconciliation (2026-11-14)

**Status update (2026-11-14):** MiniSearch is installed and committed (`7ac508a`, `1e28624`), and the measured initial JS is now 241.33 kB gzip against the 250 kB budget, with the worker in a separate lazy chunk.
