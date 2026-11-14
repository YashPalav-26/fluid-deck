# Fluid Deck — Sprint 6 (M7) Search Foundation Report

*Date: 2026-11-10 · Scope: SEARCH-001 (shared tokenizer, `packages/core`) and SEARCH-002 (MiniSearch adapter + Search Service, `apps/web`) only. SEARCH-003..008 and UI-004 are out of scope and remain unimplemented. No staging, commits, or pushes performed.*

*Companions: `docs/SPRINT_6_IMPLEMENTATION_PLAN.md`, `docs/SPRINT_6_READINESS_REVIEW.md`, `docs/PHASE_3_TASK_BREAKDOWN.md` (M7 rows).*

---

## 1. Summary

- **SEARCH-001 — complete.** Single pure-TypeScript tokenizer in `packages/core`, exported via the public API, with unit tests covering every rule and edge case. No MiniSearch in core.
- **SEARCH-002 — complete.** `minisearch ^7.2.0` installed in `apps/web` only. Thin Search Service adapter (`apps/web/src/services/search.ts`) with approved fields/weights, AND-first/OR-fallback, prefix + fuzzy, exact-title pin, deterministic tie-breaks, 500-hit default cap, and soft-delete exclusion at index build.
- Bundle measured: MiniSearch adds **+6.23 kB gzip** (Vite) when actually wired, leaving **42.97 kB headroom** under the 250 kB initial-JS budget. No code splitting required (measured, not estimated).
- Verification: typecheck 5/5, test 38 files / 320 passed, lint clean, prettier clean, build green, git diff --check clean.

---

## 2. SEARCH-001 — Shared tokenizer (`packages/core`)

**File:** `packages/core/src/tokenizer.ts` (new). Exported via `packages/core/src/index.ts` (`export * from "./tokenizer.ts"`).

**Contract:**
- `tokenize(input: unknown): string[]` — pure, browser-free, no MiniSearch. Returns `[]` for non-string or empty input.
- `SEARCH_FIELD_WEIGHTS` — approved field boosts (`title 3, tagsText 2, description 1, urlText 0.6, collectionsText 0.5, typeText 0.4`), exported as `as const` plus `SearchFieldName`.
- NFC-normalize input first, then lowercase per token. Diacritics retained (no accent stripping, no stemming, no stop words).
- Split on runs of non-letter/non-number (`/[^\p{L}\p{N}]+/u`), so punctuation, hyphens, and URL delimiters (`/ ? = & . - _`) all act as boundaries.
- CamelCase split via two fixed regexes, applied in this order:
  - `CAMEL_BOUNDARY_1 = /([\p{Ll}\p{N}])([A-Z])/gu`
  - `CAMEL_BOUNDARY_2 = /([A-Z]+)([A-Z][\p{Ll}])/gu`
- Each CamelCase run yields its split parts, **plus** the joined whole token **only when a split actually occurred** (`parts.length > 1`). Acronym runs that do not split are not duplicated.
- Dedup preserving first occurrence (case-insensitive, NFC-normalized).
- URL tokenization falls out of the general rules: domain/path/query segments split on `/ ? = & . - _`; CamelCase segments (e.g. `reactHooks`) additionally split.

**Tests:** `packages/core/src/tokenizer.test.ts` (new) — 30+ cases covering NFC normalization, lowercasing, punctuation splitting, CamelCase splitting + joined retention, acronym non-over-splitting, URL domain/path/query tokenization, diacritic retention, empty/whitespace/non-string input, dedup, and the exact boundary regexes. All green.

---

## 3. SEARCH-002 — MiniSearch adapter + Search Service (`apps/web`)

**Dependency:** `minisearch ^7.2.0` added to `apps/web/package.json` only (resolved `7.2.0`). `pnpm-lock.yaml` updated. No other dependency added.

**File:** `apps/web/src/services/search.ts` (new). `apps/web/src/services/search.test.ts` (new, 12 cases).

**Public surface:**
- Constants: `SEARCH_FIELDS` (6), `SEARCH_STORE_FIELDS` (4).
- Types: `SearchDocument`, `SearchContext`, `SearchIndex`, `SearchHit`.
- Functions: `buildSearchDocument`, `createSearchIndex`, `searchIndex`, `searchResources`.

**Index construction:**
- MiniSearch instance with `fields`, `idField: "id"`, `storeFields: SEARCH_STORE_FIELDS`, shared `tokenize` from core, and `searchOptions.boost = SEARCH_FIELD_WEIGHTS`, `prefix: true`, `fuzzy: 0.2`.
- `createSearchIndex(resources, context)` filters out soft-deleted resources (`deletedAt !== null`) before `addAll`. `resourcesById` retains all input resources (including deleted) for hit hydration, but deleted rows never appear in results because they are not indexed.
- `buildSearchDocument` derives `tagsText` / `collectionsText` from the optional `SearchContext` maps; `urlText = canonicalUrl + " " + domain`; `typeText = resource.type`.

**Query rules:**
- Empty/whitespace query → `{ hits: [], partial: false }`.
- AND-first: `combineWith: "AND"`. If zero results, fall back to OR (`combineWith: "OR"`) and set `partial: true` when results exist.
- Prefix (`prefix: true`) and fuzzy (`fuzzy: 0.2`) enabled on both passes.
- Exact-title pin: a resource whose NFC-normalized, lowercased, trimmed title equals the normalized query sorts first.
- Tie-breaks after score: `updatedAt` desc → title asc → id asc.
- Default cap 500 (`options.limit` overrides).
- `searchResources` convenience wrapper returning `Resource[]`.

**Tests (12, all green):** empty query, AND semantics, OR-degrade + `partial`, exact-title pin, prefix, fuzzy, title-over-description ranking, deterministic tie-breaks, soft-delete exclusion, tagsText via context, urlText, invalid/empty queries do not throw.

---

## 4. Bundle measurement

**Method:** same command `pnpm --filter @fluid-deck/web build` (Vite 7.3.7), same single-chunk output, no code splitting. Baseline recorded in `docs/SPRINT_6_READINESS_REVIEW.md` §9.

Because `search.ts` is not yet imported by any production entry (SEARCH-003/UI-004 not started), a naive build would tree-shake MiniSearch out and show zero delta. To measure the true MiniSearch-attributable cost, a temporary production entry imported `createSearchIndex` and referenced it via `console.log` (forced retention), the build was captured, then `main.tsx` was reverted (`git checkout`) and verified clean.

| Measurement | Raw (kB) | Gzip Vite (kB) | Gzip -9 (kB) |
|---|---:|---:|---:|
| Baseline (pre-install, recorded) | 648.66 | 200.80 | 195.36 |
| After (MiniSearch wired into bundle) | 668.02 | 207.03 | 206.26 |
| **MiniSearch-attributable delta** | **+19.36** | **+6.23** | +10.90 |

- Chunk change: single chunk renamed `index-CEqyBrEr.js` → `index-FlUK7Z3A.js` (same shape, no new chunks). CSS unchanged (20.28 kB raw / 4.64 kB gzip).
- MiniSearch standalone ESM: 78,014 B raw / 18,196 B gzip; the bundled delta is smaller due to tree-shaking and shared dependencies.
- Post-wire gzip (207.03) vs 250 kB budget → **42.97 kB headroom**. No code splitting required (decision 4: measure first; split only if needed). No 250 kB threshold crossed, so no STOP condition.

---

## 5. Verification (actual)

| Check | Result |
|---|---|
| Focused tokenizer tests (`packages/core/src/tokenizer.test.ts`) | pass |
| Focused search tests (`apps/web/src/services/search.test.ts`) | pass (12/12) |
| `pnpm typecheck` | 5/5 workspaces green |
| `pnpm test` | 38 files / 320 passed (was 308 + 12 search) |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | clean (after `--write` on the 2 new files) |
| `pnpm build` (web) | green, 200.80 kB gzip (adapter not yet wired; see §4) |
| `git diff --check` | clean |

Prettier was applied to `packages/core/src/tokenizer.ts` and `apps/web/src/services/search.test.ts` (whitespace only, no logic change). No other formatting drift introduced.

---

## 6. Dependency / lockfile diff

- `apps/web/package.json`: added `"minisearch": "^7.2.0"` (dependencies). No other package.json touched.
- `pnpm-lock.yaml`: added minisearch 7.2.0 resolution. No other resolution changed.
- `packages/core/src/index.ts`: added `export * from "./tokenizer.ts"`.
- No changes to `packages/extension-core`, `apps/extension`, `packages/ui`, schemas, or the bridge.

---

## 7. Known limitations / follow-ups (out of scope, recorded)

- Search Service is not wired to any consumer yet (SEARCH-003 startup rebuild, SEARCH-004 incremental update, SEARCH-005 facets/cap, SEARCH-008 recovery, UI-004 search UI remain).
- No startup rebuild, no incremental sync, no facets, no URL/ViewState changes, no search UI, no workers, no recovery, no benchmark harness — all deferred to their own tasks.
- Tokenizer has no stop words/stemming by design (Phase 2.4 §2); FTS5 migration seam is Phase 8+.
- `SEARCH_STORE_FIELDS` stored fields are available for future highlight; highlighting UI is UI-004.
- MiniSearch bundle cost is measured but only manifests when the adapter is imported (SEARCH-003 will import it).

---

## 8. Files changed (this scope)

New:
- `packages/core/src/tokenizer.ts`
- `packages/core/src/tokenizer.test.ts`
- `apps/web/src/services/search.ts`
- `apps/web/src/services/search.test.ts`
- `docs/SPRINT_6_SEARCH_FOUNDATION_REPORT.md`

Modified:
- `packages/core/src/index.ts` (export)
- `apps/web/package.json` (minisearch dep)
- `pnpm-lock.yaml` (minisearch resolution)

Not modified: `apps/web/src/main.tsx` (reverted after measurement), all other source.

---

## 9. Next step

Awaiting approval to proceed to **SEARCH-003** (chunked startup rebuild, post-paint) per the dependency map. No staging, commits, or pushes performed.

---

## M9-006 reconciliation (2026-11-14)

Since this report was written the adapter is wired: `apps/web/src/services/search-engine.ts` is imported by the committed search service (`820a637`), and the feature reached the application in M9-005 (`460b7cf`). The 200.80 kB gzip figure was measured while the adapter was unreachable; the current web entry is 771.46 kB raw / 241.33 kB gzip.
