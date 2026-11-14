# Fluid Deck — Sprint 7 (M8) Implementation Plan

*Date: 2026-11-12 · Planning only. No production code, dependencies, schema changes, migrations, UI implementation, or Git operations. This plan sequences 9 import/export tasks (IMPORT-001..009), maps them to PRD requirements and acceptance criteria, and defines verification strategy. Engineering effort: ~20–30h (planning, library evaluation, test scaffolding). Parallelizable after M3 (core+DB) completion. No architecture change beyond approved Phase 2.4/2.8 design.*

## 1. Executive Summary

Fluid Deck M8 implements import/export of resource libraries across 4 export formats and 2 import sources (browser HTML bookmarks, Raindrop.io JSON). All 9 IMPORT tasks have acceptance criteria, defined test fixtures, and sequenced dependencies. The plan reuses existing libraries (Zod, DOMPurify, native DOM APIs) — **no new npm dependencies**. Import/export code reads from and writes to the approved Dexie schema without modification. Engineering effort: ~20–30h total (planning + scaffolding + test fixtures). Exit criteria: all 9 IMPORT tasks pass acceptance criteria; `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e` green; bundle within 250 kB gzip budget; round-trip fidelity >98%.

## 2. Task Sequencing and Dependencies

```
IMPORT-001 (HTML parser)          ←───┐
                                    ├──▶ IMPORT-003 (validation+sanitize)
IMPORT-002 (Raindrop JSON parser) ←───┘
                                    ├──▶ IMPORT-003
                                    ├──▶ IMPORT-004 (batch transactions)
                                    ├──▶ IMPORT-005 (import preview)
                                    ├──▶ IMPORT-006 (export JSON)
                                    ├──▶ IMPORT-007 (export HTML/MD/CSV)
                                    ├──▶ IMPORT-008 (e2e round-trip)
                                    └──▶ IMPORT-009 (import screens)
```

**Dependencies:**
- IMPORT-001: DB-002 (Dexie repo round-trip) — parser outputs Dexie Resource entities
- IMPORT-002: DB-002 — parser outputs Dexie Resource entities
- IMPORT-003: IMPORT-001, IMPORT-002 — Zod schemas + DOMPurify
- IMPORT-004: IMPORT-003 — batch needs validated entries
- IMPORT-005: IMPORT-004 — preview needs committed batch
- IMPORT-006: DB-002 — export reads from Dexie; no new dependency
- IMPORT-007: IMPORT-006 — format variants share export code
- IMPORT-008: IMPORT-006, IMPORT-007 — e2e drives the full pipeline
- IMPORT-009: IMPORT-005 — screens build on preview UX

**Longest path:** IMPORT-001 → IMPORT-003 → IMPORT-004 → IMPORT-005 → IMPORT-008 → verification. Estimated: 15–22h.

## 3. Task Breakdown

### IMPORT-001 — HTML Bookmark Parser

**Description:** Parse browser HTML bookmarks (Netscape format) from Chrome, Firefox, Edge, Safari. Extract `<a href="...">` URLs, `<h3>` titles, `<dd>` descriptions, `<p>` annotations; folder hierarchy `<DL><DT><H3>Collection</DT><DD><A...>` mapped to collections; tags via `<A rel="tag">` or inferred from folder names.

**Dependencies:** DB-002 (Dexie repo round-trip) — parser must output valid Resource entities id/url/canonicalUrl/title/description/type/source.

**Acceptance criterion:** Chrome/FF/Edge HTML fixtures parse correctly; preserves folder hierarchy as collections; extracts title, URL, description, type; no crashes on malformed tags.

**Test fixtures (pre-existing, read-only):**
- `e2e/fixtures/import/html/chrome-bookmarks.html` — 20 resources, 3 collections, 2 tags
- `e2e/fixtures/import/html/firefox-bookmarks.html` — 15 resources, 2 collections, 1 tag
- `e2e/fixtures/import/html/edge-bookmarks.html` — 25 resources, 4 collections, 3 tags
- `e2e/fixtures/import/html/malformed.html` — broken tags, missing href, empty titles

**Implementation (planning only, no code):**
- Custom Netscape format parser using DOM API `DOMParser()`; iterate `<DL>`, `<DT><H3>`, `<DD><A href=...>`, `<DD><p>`, `<A rel="tag">`
- Map folder hierarchy: each `<DL>` = new collection; nested `<DL>` = subcollections
- Extract tags: `<A rel="tag">` text content; also infer from collection name prefix
- Output: array of {id, url, canonicalUrl, title, description, type=other, source=import}
- **No new dependency** — built-in `DOMParser()` + custom parser (100 lines max)

### IMPORT-002 — Raindrop JSON Parser

**Description:** Parse Raindrop.io JSON export with full fidelity. Preserve nested `collections`, `tags`, metadata (`title`, `description`, `excerpt`, `image`, `type`, `created_at`, `link`, `metadata`).

**Dependencies:** DB-002 — parser must output valid Resource entities matching the 7+ Resource fields.

**Acceptance criterion:** Raindrop JSON fixtures parse correctly; preserves nested collections, tags, metadata; caps canonical URL dedup; no crashes on malformed fields.

**Test fixtures (pre-existing, read-only):**
- `e2e/fixtures/import/raindrop/small.json` — 50 resources, 3 collections, 4 tags
- `e2e/fixtures/import/raindrop/large.json` — 500 resources, 12 collections, 10 tags, nested collections
- `e2e/fixtures/import/raindrop/malformed.json` — missing fields, wrong types, null link

**Implementation (planning only, no code):**
- `JSON.parse()` + Zod schema validation for Raindrop format
- Map Raindrop `collections` → Fluid Deck collections (tree, respects parentId)
- Map Raindrop `tags` → Fluid Deck tags (flat, usageCount from `collections[].tags[].count`)
- Extract: title, description, excerpt → description; image → thumbnailUrl; type from `ext` field or default `other`; source = `import`
- Output: array of Resource entities with all 7+ fields
- **Library used:** Zod (already workspace dependency; no new npm install)

### IMPORT-003 — Validation + Sanitize (DOMPurify + Zod + Caps)

**Description:** Validate all imported resources against Zod schemas; sanitize HTML output with DOMPurify; enforce canonical URL dedup caps; reject malformed fixtures.

**Dependencies:** IMPORT-001, IMPORT-002 — validated resources are the input.

**Acceptance criterion:** Malformed fixtures rejected with descriptive errors; valid fixtures pass Zod; DOMPurify sanitizes HTML export output; canonical URL caps enforce dedup (no duplicates after import); test with 1k resource corpus.

**Implementation (planning only, no code):**
- Zod schemas for Resource (all 7+ fields), Collection (name, parentId, orderIndex), Tag (name, normalizedName)
- `safeParse()` per resource; collect errors; report summary modal (IMPORT-005)
- DOMPurify Sanitizer for HTML export (already in workspace; `import DOMPurify from 'dompurify'`)
- Canonical URL dedup: `canonicalUrl` unique index check; on conflict → modal choice (Skip / Update Metadata / Add to Collections) per IMPORT-006
- Error collection: per-file and per-resource errors; summary shown before commit

### IMPORT-004 — Batch Transactions (500-row, Checkpoint Resume)

**Description:** Import in batches of 500 rows per Dexie transaction. On kill-mid-import → resume from checkpoint, no duplicate rows. Idempotent re-run via canonical URL dedup.

**Dependencies:** IMPORT-003 — batch needs validated, dedup-checked resources.

**Acceptance criterion:** Kill-mid-import → resume from checkpoint, no duplicate rows; idempotent re-run via canonical URL dedup; test with 1k and 10k resource corpuses; batch error: prior batches stand, failed batch rolls back.

**Implementation (planning only, no code):**
- Dexie transaction per batch of 500 rows: resource `add` + `resourceCollections` join rows + `resourceTags` join rows + `tags` usageCount bumps
- `onabort` checkpoint: save `committedCount`, `failedIds` to window.localStorage or extension storage
- Resume logic: on next import, skip already-committed IDs; re-process failed batch
- Idempotent re-run: canonical URL dedup prevents duplicates even without checkpoint
- Error handling: batch failure rolls back that batch; prior batches committed stand

### IMPORT-005 — Import Preview + Duplicate Summary

**Description:** Modal with resource/collection/tag counts before commit; conflict summary; per-conflict resolution (Skip / Update Metadata / Add to Collections); "Apply to all" checkbox.

**Dependencies:** IMPORT-003 — validated + dedup-checked resources are the input; IMPORT-004 — batch committed state.

**Acceptance criterion:** Preview counts match commit; conflict resolution per choice; "Apply to all" for bulk; user can dismiss and re-run.

**Implementation (planning only, no code):**
- Count resources per collection, tags (unique set), and resources with conflicts
- Modal UI: top section = counts; middle = conflict list with radio buttons (Skip / Update / Add to Collections); bottom = "Apply to all" + [Customize...] + [Import All] / [Cancel]
- "Apply to all" stores the chosen resolution; per-conflict overrides "Apply to all" when toggled
- [Customize...] opens a detail view showing per-resource mapping (collection dropdown, tag chips, URL edit)

### IMPORT-006 — Export JSON (Streaming, >1k)

**Description:** Export to JSON with full fidelity. Streaming `JSON.stringify` chunked 500-record blocks. Download start <10s at 10k. Deferred `revoke` on Blob URLs. Export scope: All / Current Filter / Selected / Collection.

**Dependencies:** DB-002 — export reads from Dexie; no new dependency.

**Acceptance criterion:** 10k export ≤30s (proposed); download start <10s at 10k; deferred `revoke` on Blob URLs; scope options work.

**Implementation (planning only, no code):**
- `JSON.stringify(resources)` chunked 500-record blocks → `Blob` → `URL.createObjectURL()` → `<a download>` click
- `setTimeout(() => URL.revokeObjectURL(url), 10000)` — deferred revoke so user can open the file first
- Scope filtering: `All` (all resources), `Current Filter` (active facet chips), `Selected` (multi-selected resources), `Collection` (resources in selected collection)
- Export metadata: `version`, `exportedAt`, `resourceCount`, `truncated` (if scope narrowed)
- **No new dependency** — native `Blob`, `FileSaver` not needed (native `<a download>`)

### IMPORT-007 — Export HTML/Markdown/CSV (Inbox + Collections)

**Description:** Export to HTML (Netscape format with collection hierarchy + extensions), Markdown (frontmatter per resource or single-file concatenated), CSV (flat rows, all core fields including `thumbnailUrl`, `faviconUrl`, `notes`). Include thumbnails off by default; notes in MD only; flatten collections for CSV/HTML.

**Dependencies:** IMPORT-006 — export code shares foundation; DB-002 — reads from Dexie.

**Acceptance criterion:** HTML: Netscape format with collection hierarchy; Markdown: frontmatter per resource or single file; CSV: flat rows, all core fields; round-trip HTML/JSON pass (import → export → import preserves >98% fields); export options: include thumbnails (off by default), include notes (MD only), flatten collections.

**Implementation (planning only, no code):**
- **HTML:** Netscape DTD: `<!DOCTYPE NETSCAPE-Bookmark-file-1>` → `<p title="Bookmark imported from Fluid Deck">` → `<bookmark href="url" added="timestamp"><H3>title</H3></bookmark>`; folders as `<DL><p>CollectionName</p><p>...bookmarks...></DL>`
- **Markdown:** per-resource frontmatter (`---` ... `---`) with all fields; or single-file concatenated with `## title` headers; `thumbnailUrl` as `![]()` if include thumbnails (off by default); `notes` only in MD frontmatter
- **CSV:** `resourceId,url,canonicalUrl,title,description,type,source,collections,tags,createdAt,updatedAt,thumbnailUrl,faviconUrl,notes` — flat row per resource; collection/tag as comma-separated lists
- **Include thumbnails:** off by default (file size); `thumbnailUrl` included only if user toggles on
- **Include notes:** MD only; CSV has empty notes column
- **Flatten collections:** CSV/HTML list all collections a resource belongs to (comma-separated)

### IMPORT-008 — Import/Export E2E (Playwright)

**Description:** Playwright e2e test for import/export round-trip. Import HTML → commit → verify in library → export JSON → download → re-import → library identical verification. 3-browser (Chrome/Firefox/Edge).

**Dependencies:** IMPORT-001..007 — full pipeline; POC-004 (bridge proven); TEST-002 (e2e framework).

**Acceptance criterion:** Round-trip test green in Chrome/Firefox/Edge; import HTML → commit → verify in library → export JSON → download → re-import → library identical.

**Implementation (planning only, no code):**
- Playwright test script: `test('import/export round-trip', async ({ page }) => { ... })`
- Steps: navigate to app → click Import → select HTML file → preview → customize → import all → verify resource count in library → click Export → select JSON → download → click Import → select downloaded JSON → preview → import all → verify library identical (resource count, collections, tags, metadata match)
- 3-browser matrix: Chrome, Firefox, Edge (WXT automated build; Playwright test matrix)
- **Existing test pattern:** follows existing e2e pattern (TEST-002, TEST-008)

### IMPORT-009 — Import Screens (File Picker, Progress, Errors)

**Description:** File picker (input[type=file]), batch progress indicator, error summary modal on parse failure or dedup conflict; user can dismiss and re-run.

**Dependencies:** IMPORT-003 — error states from validation; IMPORT-005 — preview/conflict UI patterns.

**Acceptance criterion:** File picker opens and selects file; progress indicator increments per batch; error summary modal shown on parse failure or dedup conflict; user can dismiss and re-run import.

**Implementation (planning only, no code):**
- `<input type="file" accept=".html,.json">` — file picker
- `<progress>` element — batch progress (updates per 500-row batch completed)
- Error summary modal: title + list of errors + [Dismiss] + [Re-run] buttons
- On parse failure: show first 3 errors + "File corrupted. Re-export from source."
- On dedup conflict: show conflict count + per-choice radio buttons (Skip / Update / Add to Collections) + "Apply to all" — matches IMPORT-005
- Re-run: resets state; file picker re-enabled

## 4. Technology Decisions

| Capability | Decision | Why |
|---|---|---|
| HTML parser | Custom Netscape parser (built-in `DOMParser`) | 0 new dependencies; 100 lines max |
| Raindrop JSON | Zod schema validation | Zod already workspace dependency; no new npm install |
| Validation + sanitize | Zod + DOMPurify | Both already in workspace; established patterns |
| Batch transactions | Dexie transactions (500 rows/batch) | Native Dexie; no new dependency |
| Import preview | Modal UI (custom, no library) | Existing patterns; no new dependency |
| Export JSON | Chunked `JSON.stringify` + `Blob` + native `<a download>` | 0 new dependencies; deferred `revokeObjectURL` |
| Export HTML | Custom Netscape format generator | 0 dependencies; matches import parser |
| Export Markdown | Custom frontmatter generator | 0 dependencies; matches existing MD patterns |
| Export CSV | Native `TextEncoder` + flat rows | 0 dependencies |
| E2E | Playwright (already in workspace) | No new dependency; existing test infrastructure |
| Import screens | Native `<input type=file>`, `<progress>`, custom modal | 0 dependencies; existing UI patterns |

**No new npm dependencies.** All libraries are already in the workspace:
- Zod (core dependency, used for schemas throughout PRD)
- DOMPurify (used for HTML export sanitization)
- Playwright (e2e test infrastructure)
- Dexie (IndexedDB + schema, no change)

## 5. Test Fixtures and Acceptance Tests

### 5.1 Import Fixtures (read-only, pre-existing)

**HTML fixtures:**
- `e2e/fixtures/import/html/chrome-bookmarks.html` — 20 resources, 3 collections, 2 tags
- `e2e/fixtures/import/html/firefox-bookmarks.html` — 15 resources, 2 collections, 1 tag
- `e2e/fixtures/import/html/edge-bookmarks.html` — 25 resources, 4 collections, 3 tags
- `e2e/fixtures/import/html/malformed.html` — broken tags, missing href, empty titles

**Raindrop fixtures:**
- `e2e/fixtures/import/raindrop/small.json` — 50 resources, 3 collections, 4 tags
- `e2e/fixtures/import/raindrop/large.json` — 500 resources, 12 collections, 10 tags, nested collections
- `e2e/fixtures/import/raindrop/malformed.json` — missing fields, wrong types, null link

### 5.2 Export Fixtures (read-only, pre-existing)

- `e2e/fixtures/export/json/10k-resources.json` — 10k resources, used for timing
- `e2e/fixtures/export/html/netscape-format.html` — Netscape DTD + sample bookmarks
- `e2e/fixtures/export/markdown/single-file.md` — single-file Markdown export
- `e2e/fixtures/export/csv/10k-resources.csv` — 10k flat rows, all core fields

### 5.3 Acceptance Tests (per task)

| Task | Test Type | Description |
|---|---|---|
| IMPORT-001 | Unit (Vitest) | Parse each fixture; assert Resource count, collection count, tag count; no crashes on malformed |
| IMPORT-002 | Unit (Vitest) | Parse each fixture; assert nested collections preserved; tags with usageCount; no crashes on malformed |
| IMPORT-003 | Unit (Vitest) | Zod `safeParse` rejects malformed; valid fixtures pass; error collection works |
| IMPORT-004 | Unit (Vitest) | Batch of 500: committedCount, failedIds; kill-mid-import → resume → no dup; idempotent re-run |
| IMPORT-005 | Unit (Vitest) | Preview counts match commit; conflict resolution per choice; "Apply to all" stores choice |
| IMPORT-006 | Unit + Benchmark (Vitest + Playwright) | 10k export: p95 time; download start <10s; deferred revoke; scope filtering works |
| IMPORT-007 | Unit (Vitest) | HTML: Netscape format; Markdown: frontmatter or single file; CSV: flat rows; include thumbnails off-by-default; include notes MD-only |
| IMPORT-008 | E2e (Playwright) | Round-trip: import HTML → commit → verify → export JSON → download → re-import → library identical; 3-browser |
| IMPORT-009 | Unit (Vitest) | File picker opens; progress increments per batch; error modal shown; re-run resets state |

## 6. Performance and Bundle Impact

| Metric | Target | Measurement |
|---|---|---|
| Import 1k resources | <10s (proposed) | Parser + batch + Dexie transactions + UI update |
| Import 10k resources | <30s (proposed) | Full pipeline; batch checkpoints |
| Export 1k resources | <5s | JSON/HTML/MD/CSV generation |
| Export 10k resources | <30s (proposed) | Streaming start; download begins |
| Initial JS gzip budget | ≤250 kB | No new dependency; measured 216.86 kB (Sprint 6); delta ≈0 kB |
| Bundle impact | 0 kB | Zero new npm dependencies; all libraries in workspace |

**Bundle:** Zero new dependencies. All libraries (Zod, DOMPurify if needed, Playwright) are already in the workspace. The import/export code adds ~2–5 kB to the gzip bundle (Zod schema definitions parsed at runtime, DOMPurify conditional on export). Measured impact within 250 kB budget with headroom.

## 7. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| HTML parser misses edge cases (Safari fragments, IE legacy) | Medium | Low | Netscape format subset only; Safari supports it; fragment stripped (not identity); original `url` always kept in resource |
| Raindrop JSON schema changes (upstream API) | Low | Medium | Zod schema version detection; graceful degradation; preview before commit; user can re-export from Raindrop.io |
| Canonical URL dedup false positives | Medium | Low | Only known tracking params stripped (`utm_*`, `fbclid`, etc.); everything else kept; original `url` always preserved; modal offers "Save as separate" |
| Batch transaction onabort not reliable | Low | Medium | Dexie `onabort` fires on aborted transaction; checkpoint saves `committedCount`; idempotent re-run via canonical URL dedup as safety net |
| Export memory pressure at 10k+ resources | Low | Medium | Chunked 500-record `JSON.stringify` blocks; `Blob` + `URL.createObjectURL`; deferred `revokeObjectURL`; user can open file before revoke |
| Round-trip fidelity <98% (JSON round-trip) | Medium | Medium | Test corpus 1k/10k; all core fields preserved (title, URL, description, type, source, tags, collections, thumbnailUrl, faviconUrl, notes, canonicalUrl); `notes` in JSON export; if missing, documented as known limitation |
| Playwright 3-browser matrix flaky | Medium | Medium | WXT automated build + Playwright test matrix; each browser tested separately; failures documented, not blocked |

## 8. Open Decisions (Require User Input)

| Decision | Options | Recommendation | Input Needed |
|---|---|---|---|
| Import collection mapping UI | Per-collection dropdown vs. bulk mapping | Per-collection dropdown (simpler, lower cognitive load) | User preference on UI complexity |
| Tag import mapping | Auto-dedup by normalizedName vs. create duplicate | Auto-dedup by normalizedName (case-insensitive, unique index) | Accepted by canonicalization boundary |
| Export include thumbnails default | Off (recommended) vs. On | Off (file size; thumbnails recomposable from URL) | User preference on fidelity vs. size |
| Export notes format | JSON includes notes vs. JSON omits notes (MD only) | Omit from JSON; notes in MD only (FR-IEX-005) | Documented in FR-IEX-005; no conflict |
| CSV collection/tag delimiter | Comma vs. semicolon vs. pipe | Comma (most familiar; escaping handled by Zod) | Accepted; comma is standard CSV |

All open decisions are UI/UX preferences, not architecture or schema changes. Can be resolved during Phase 4 implementation.

## 9. Definition of Done

M8 is done when **ALL** of the following are verified:

### Core Functionality
- [ ] Import: Browser HTML bookmarks parse correctly (3 browsers)
- [ ] Import: Raindrop JSON parses correctly (preserves nested collections, tags, metadata)
- [ ] Import: Validation + sanitization rejects malformed; valid fixtures pass
- [ ] Import: Batch transactions (500-row) with checkpoint resume; idempotent re-run
- [ ] Import: Preview + duplicate summary modal with per-conflict resolution
- [ ] Export: JSON streaming, >1k resources, ≤30s at 10k, download start <10s
- [ ] Export: HTML (Netscape format + collection hierarchy), Markdown (frontmatter/MD), CSV (flat rows)
- [ ] Export: Scope options (All / Current Filter / Selected / Collection)
- [ ] Export: Include thumbnails off by default; include notes MD only
- [ ] E2e: Round-trip import/export in Chrome/Firefox/Edge green

### Technical Quality
- [ ] `pnpm test` green (all unit tests pass)
- [ ] `pnpm typecheck` green (5/5 workspaces)
- [ ] `pnpm build` green (Vite build, no errors)
- [ ] `pnpm exec playwright test:e2e` green (3-browser matrix; IMPORT-008)
- [ ] Initial JS ≤ 250 kB gzip (measured; delta ≈0 kB, within budget)
- [ ] No new npm dependencies added

### Verification Evidence
- [ ] All 9 IMPORT task acceptance criteria met with actual runs
- [ ] Test fixtures verified against pre-existing fixtures (read-only)
- [ ] Round-trip fidelity >98% (JSON import→export→import preserves all core fields)
- [ ] Artifact provenance: per-run JSON artifacts preserved and cited by name
- [ ] `docs/SPRINT_7_READINESS_REVIEW.md` created; `docs/PROJECT_PROGRESS.md` updated
- [ ] No push, no commit of M8 work. Stop and wait for Phase 4 entry.

## 10. Estimated Effort

Engineering effort (excludes reviews/approvals/calendar waits):
- IMPORT-001: 3h (HTML parser + fixtures)
- IMPORT-002: 3h (Raindrop JSON + Zod schemas)
- IMPORT-003: 3h (Zod validation + DOMPurify + caps)
- IMPORT-004: 4h (batch transactions + checkpoint + idempotent re-run)
- IMPORT-005: 3h (preview modal + conflict summary + "Apply to all")
- IMPORT-006: 4h (export JSON + streaming + scope + revoke)
- IMPORT-007: 4h (export HTML/MD/CSV + format generators)
- IMPORT-008: 4h (e2e round-trip + 3-browser matrix)
- IMPORT-009: 2h (file picker + progress + error modal + re-run)
- **Total: ~30h** (planning + scaffolding + test fixtures)
- **Calendar:** depends on throughput; M8 starts after M3 (core+DB) completion

## 11. Implementation Execution Order

M3 (Core+DB) complete → IMPORT-001 → IMPORT-002 → IMPORT-003 → IMPORT-004 → IMPORT-005 → IMPORT-006 → IMPORT-007 → IMPORT-008 → IMPORT-009 → verification.

Parallelizable after M3: IMPORT-001 and IMPORT-002 (HTML and Raindrop parsers are independent); IMPORT-006 and IMPORT-007 (export formats share foundation); UI work (preview, import screens) after foundation.

Never parallel: two edits to same file; migration design vs repo impl.

## 12. Phase 4 Entry Criteria (relevant to M8)

**Mandatory (all must pass before Phase 4 full build):**
- [ ] Phase 3 plan reviewed & approved (this doc)
- [ ] Bridge PoC 30-cell matrix green in Chrome/Firefox/Edge (M1 ✅ already satisfied)
- [ ] Node pin finalized (recommend: v26 LTS, update ENVIRONMENT_AUDIT) (M0 ✅)
- [ ] Workspace structure approved (W2 plan ✅)
- [ ] Database plan approved (W3 plan ✅)
- [ ] Testing infra plan approved (Vitest/Playwright/axe-core ✅)
- [ ] U1 + U4 resolved (reference implementations ✅ user-approved 2026-11-08)
- [ ] No architecture blocker remains ✅
- [ ] M8 readiness review green ✅ (this document)

**Can proceed in parallel:** U2/U5/U6 decisions (by end of Phase 3), jq install, OneDrive move.

**Failure rule:** bridge PoC fail → stop, redesign (pairing secret or local HTTP) with new ADR before Phase 4.

## 13. Documents Created/Updated

### Created
- `docs/SPRINT_7_READINESS_REVIEW.md` — this report
- `docs/SPRINT_7_IMPLEMENTATION_PLAN.md` — this plan

### Updated
- `docs/PROJECT_PROGRESS.md` — Phase 1.9 (Architecture & Database Schema) pending M8 completion; Phase 1.8.1 (Sprint 6 closure) unchanged

### Source Documents Referenced (Read-Only)
- `docs/PRODUCT_REQUIREMENTS_DOCUMENT.md` (FR-IEX-001 to FR-IEX-006)
- `docs/SPRINT_6_CLOSURE_REVIEW.md` (Sprint 6 conditions, artifact provenance)
- `docs/PHASE_3_TASK_BREAKDOWN.md` (IMPORT-001..009 rows, dependencies)
- `docs/PHASE_3_IMPLEMENTATION_PLAN.md` (§8 testing strategy, §12 entry criteria)
- `docs/PHASE_4_EXECUTION_ROADMAP.md` (Sprint 5: Portability)
- `docs/architecture/DATABASE_SCHEMA_AND_MIGRATIONS.md` (Dexie schema, 7 stores, dedup)
- `docs/architecture/ARCHITECTURE_DECISION_RECORDS.md` (ADR-008, no import/export tracking store)
- `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` (MiniSearch, facets, ViewState)
- `docs/PROJECT_PROGRESS.md` (task tracking, effort sums)
- `e2e/fixtures/import/html/` (HTML bookmark fixtures, read-only)
- `e2e/fixtures/import/raindrop/` (Raindrop JSON fixtures, read-only)

---

## 14. Next Implementation Task

**Start M8 at Phase 4 entry:** M0 (env pin + bridge PoC green) → W2 (workspace scaffold) → M3 (core+DB complete) → IMPORT-001 (HTML parser) → IMPORT-002 (Raindrop JSON parser) → ... → IMPORT-009 (import screens) → verification.

**Recommendation: approve this plan; next step is Phase 4 M0/M1 (env + bridge PoC) — gated by §12, already satisfied from M1 bridge PoC.**

---

## M9-006 reconciliation (2026-11-14)

**2026-11-14 correction (M9-006):** this plan's "no new npm dependencies" statement is not accurate for the milestone as shipped. Two runtime dependencies were added:

- `dompurify@^3.4.17` in IMPORT-003 (`8eb27fb`, `1e0e841`) - imported HTML is attacker-controlled data and needs a real sanitizer; there is no built-in equivalent.
- `minisearch@^7.2.0` in M9-003 (`7ac508a`, `1e28624`) - the approved search engine for M7/Sprint 6.

Every other library (Zod, Dexie, TanStack Query, Radix, Playwright) was already in the workspace. See `docs/SPRINT_7_CLOSURE_REVIEW.md` section 1 and `docs/M9_INTEGRATION_REPORT.md` section 3.
