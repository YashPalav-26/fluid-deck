# Project Progress — Fluid Deck

## Project Objective
Build a premium, full-stack Personal Digital Library and Smart Bookmark Management Platform. Users save, organize, categorize, search, and revisit websites, software, games, AI tools, developer resources, learning materials, articles, design references, and productivity services.

## Current Phase: 4 — Implementation, Sprint 5 (M6 extension capture pipeline)
**Status:** Sprint 2 M3 complete (audited); Sprint 3 M4 complete, accepted, committed and pushed (2026-11-09); Sprint 4 (M5) complete, accepted, committed and pushed (`fb422df`, 2026-11-09); Sprint 5 (M6) implementation complete — EXT-007 through EXT-006 all implemented, reviewed, and accepted. Eight logical Sprint 5 commits created locally on `main` (`302583a` … `8f543c8`); local main is ahead of `origin/main` (`fb422df`); Sprint 5 changes have **NOT** been pushed. Next action: final verification, then a separately authorized manual push.

## Completed Work (Phase 0)
- Step 0.1: Workflow initialization — confirmed project path, empty folder, skill activation
- Step 0.2: Skill ecosystem discovery — 80 global skills evaluated, 74 Keep / 2 Improve / 5 Update
- Step 0.3: MCP inventory — 7 connected, 1 failed (GitHub auth), 1 not needed (REA)
- Step 0.4: Environment audit — toolchain verified, Node v26 non-LTS flagged, jq/tsc missing
- Step 0.5: Agent ecosystem discovery — 43 agents (8 global + 32 ECC + 3 Caveman)
- Step 0.6: Cost & token optimization — 4 verified skills, 6 missing, protocol documented
- Step 0.7: Documentation reconciliation — all 6 Phase 0 docs created/verified

## Completed Work (Phase 1.1)
- Product vision document created (docs/PRODUCT_VISION.md)
- Core problems identified and prioritized
- Product positioning defined
- 8 product principles established
- Product boundaries defined (in/out of scope)
- Differentiation hypotheses vs 6 competitors
- Success metrics proposed with targets
- 8 open questions documented

## Completed Work (Phase 1.2)
- Competitive research on 6 primary competitors (Raindrop.io, mymind, Fabric, Are.na, Notion, Browser-native)
- Feature comparison matrix across 40+ capabilities
- Verified strengths/limitations from official sources + community feedback
- Differentiation analysis: 5 validated opportunities, 5 patterns to adopt, 5 mistakes to avoid
- MVP scope refined with must-have/should-have/nice-to-have tiers
- 8 unresolved technical questions identified

## Completed Work (Phase 1.3)
- Target user segment analysis across 7 segments
- 6 evidence-informed personas created (Alex, Maya, Dr. Chen, Sam, Jordan, Taylor)
- 16 Jobs-to-be-Done statements across Capture, Organization, Retrieval, Portability
- Segment prioritization with transparent scoring (Primary: Developers, Designers; Secondary: AI Enthusiasts, Researchers; Defer: 3 segments)
- User needs categorized: Essential (10), Important (6), Optional (2), Future (4)
- Adoption barriers and mitigation strategies per segment
- 12 validation questions requiring user research (5 high priority)

## Completed Work (Phase 1.4)
- 52 candidate features evaluated across 14 categories
- MoSCoW prioritization with impact/effort scoring
- 18 MVP Must-Have features defined with specifications
- 25 Post-MVP Should-Have features scoped
- 9 Future/Experimental features identified
- 10 key product decisions evaluated with recommendations
- MVP boundaries explicitly defined (included/excluded/postponed)
- 5 complexity traps avoided (vector DB, AI pipeline, sync, collaboration, native mobile)
- MVP success criteria proposed across 5 metric categories (all hypotheses)
- Smallest coherent product defined

## Completed Work (Phase 1.5)
- IA principles defined (7 principles: retrieval-first, hierarchy+facets, progressive disclosure, URL state, local-first, zero mandatory fields, portability)
- Conceptual content model: 7 entities (Resource, Collection, Tag, Type, Source, Saved Search, View State)
- Navigation hierarchy: Primary (collapsible collection tree), Secondary (filter chips + search), Tertiary (⌘K command palette)
- Organization rules: multi-membership collections, 3-level nesting, global tags, non-destructive delete, Unorganized virtual collection, duplicate handling
- Browsing structure: Grid view (masonry/uniform), 7 type-specific card variants, virtual scroll, faceted filtering, empty/loading/error states
- 10 key IA flows documented (onboarding, extension save, metadata edit, collection org, tag management, search+filter, import, export, duplicates, trash)
- Scalability analyzed at 50/500/5k/10k+ resources with mitigations
- 9 open questions identified (Safari, list view, smart collections, pHash, depth limit, tag UI, URL state, keyboard shortcuts, detail panel)

## Completed Work (Phase 1.6)
- Journey design principles established (7 principles: capture-first, progressive disclosure, keyboard-first, instant feedback, recoverable defaults, persona-aware, URL as truth)
- 3 primary persona scenarios defined (Alex developer, Maya designer, Sam AI explorer)
- 10 end-to-end journeys documented with full detail (onboarding, extension save, edit metadata, collections, tags, search/filter, import, export, duplicates, delete/recover)
- Failure and recovery scenarios mapped (9 scenarios with detection, user recovery, system recovery)
- Critical interaction edge cases identified (13 edge cases with MVP handling and Post-MVP considerations)
- Journey prioritization: 4 Critical MVP, 4 Important MVP, 4 Post-MVP
- Smallest coherent MVP identified (Journeys 1-4 flawless, 5-8 well, 9-12 deferred)
- 8 workflow simplification opportunities with specific improvements
- 9 unresolved product questions documented
- No conflicts with previous Phase 1 documentation
- Minor recommendations: List View V2, Smart Collections minimal, floating toolbar, inline undo toast

## Completed Work (Phase 1.7)
- Web application framework evaluated: React SPA (Vite) vs Next.js vs Tauri → **React SPA recommended**
- Browser extension architecture: Manifest V3 cross-browser via WXT → **WXT + webextension-polyfill recommended**
- Local-first storage compared: IndexedDB (Dexie) vs SQLite WASM+OPFS (wa-sqlite/official) vs sql.js → **IndexedDB MVP → SQLite WASM Phase 8+**
- Search technology evaluated: MiniSearch vs FTS5 vs Transformers.js → **MiniSearch MVP → FTS5 Phase 8+**
- State management compared: TanStack Query vs Zustand vs Redux → **TanStack Query + Context recommended**
- Data validation: Zod + TypeScript → **Zod + TypeScript recommended**
- Schema migrations: Dexie vs SQL → **Dexie MVP → SQL Phase 8+**
- Metadata extraction strategy: Rule-based + Content Script + Offscreen → **Rule-based + dual strategy recommended**
- Shared code architecture: pnpm workspaces (core, ui, extension-core) → **pnpm workspaces recommended**
- Testing strategy: Vitest + Playwright + Chrome DevTools MCP → **Vitest + Playwright + visual recommended**
- Security and privacy evaluated: Zero telemetry, minimal permissions, import/export sanitization required
- Feasibility analysis against actual environment (Windows 11, Node v26 non-LTS, missing jq/tsc)
- 10 key technical decisions documented with recommendations, risks, confidence levels
- 5 decisions requiring user approval identified
- Blocker identification: Node.js LTS pin, jq install, tsc install required before Phase 4

## Completed Work (Phase 1.8.1)
- PRD Consistency Audit completed — compared PRD against all 7 Phase 1 source documents
- **Critical inconsistency found and fixed**: Search technology — PRD specified SQLite FTS5 for MVP, but Technical Direction Evaluation (Phase 1.7) recommends MiniSearch for MVP with FTS5 migration at Phase 8+
- 4 corrections applied to PRD: FR-SRH-001, NFR-PER-004, Section 13.1, FR-STO-001
- All 10 approved product decisions preserved
- All 18 MVP Must-Have features verified present
- Traceability matrix covers all MVP features
- 53 acceptance criteria verified

## Documents Status
| File | Status |
|------|--------|
| docs/PROJECT_PROGRESS.md | Current (this file) |
| docs/ENVIRONMENT_AUDIT.md | Verified accurate |
| docs/MCP_INVENTORY.md | Verified accurate |
| docs/SKILL_SELECTION_MATRIX.md | Verified accurate |
| docs/COST_AND_TOKEN_OPTIMIZATION.md | Verified accurate |
| docs/DEVELOPMENT_WORKFLOW.md | Verified accurate |
| docs/PRODUCT_VISION.md | Created (Phase 1.1) |
| docs/COMPETITIVE_RESEARCH.md | Created (Phase 1.2) |
| docs/TARGET_USERS_AND_PERSONAS.md | Created (Phase 1.3) |
| docs/MVP_FEATURE_PRIORITIZATION.md | Created (Phase 1.4) |
| docs/INFORMATION_ARCHITECTURE.md | Created (Phase 1.5) |
| docs/USER_JOURNEYS_AND_WORKFLOWS.md | Created (Phase 1.6) |
| docs/TECHNICAL_DIRECTION_EVALUATION.md | Created (Phase 1.7) |
| docs/PRODUCT_REQUIREMENTS_DOCUMENT.md | Created (Phase 1.8), Corrected (Phase 1.8.1) |
| docs/PRD_CONSISTENCY_AUDIT.md | Created (Phase 1.8.1) |
| docs/PHASE_1_FINAL_REVIEW.md | Created (Phase 1.9) |
| docs/architecture/SYSTEM_ARCHITECTURE.md | Created (Phase 2.1) |
| docs/architecture/DATABASE_SCHEMA_AND_MIGRATIONS.md | Created (Phase 2.2) |
| docs/architecture/EXTENSION_WEB_COMMUNICATION_CONTRACTS.md | Created (Phase 2.3) |
| docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md | Created (Phase 2.4) |
| docs/architecture/FRONTEND_ARCHITECTURE_AND_STATE_OWNERSHIP.md | Created (Phase 2.5) |
| docs/architecture/OFFLINE_RELIABILITY_AND_ERROR_HANDLING.md | Created (Phase 2.6) |
| docs/architecture/SECURITY_AND_PRIVACY_ARCHITECTURE.md | Created (Phase 2.7) |
| docs/architecture/PERFORMANCE_BUDGETS_AND_ACCESSIBILITY.md | Created (Phase 2.8) |
| docs/architecture/ARCHITECTURE_DECISION_RECORDS.md | Created (Phase 2.9) |
| docs/PHASE_2_FINAL_ARCHITECTURE_REVIEW.md | Created (Phase 2.9) |
| docs/PHASE_3_IMPLEMENTATION_PLAN.md | Created (Phase 3) |
| docs/PHASE_3_TASK_BREAKDOWN.md | Created (Phase 3) |
| docs/PHASE_4_EXECUTION_ROADMAP.md | Created (Phase 3) |
| docs/PHASE_3_DECISION_REGISTER.md | Created (Phase 3) |

## Existing Project Folder Status
- Path: `C:\Users\ADMIN\OneDrive\Documents\Github-Projex\fluid-deck`
- Git: Not initialized
- Files: docs/ directory only (10 files)
- Package.json: None
- Source code: None (greenfield)

## Current Blockers
1. GitHub MCP authentication failed (400 bad request) — blocks repo operations, needed for Phase 10
2. Node.js v26.13.0 is non-LTS — pin to LTS (22/20) via fnm/nvm before Phase 4
3. `jq` not installed — needed for JSON processing
4. `tsc` not in PATH — install globally before Phase 4 build

## Completed Work (Phase 2.1)
- System architecture & boundaries documented (docs/architecture/SYSTEM_ARCHITECTURE.md)
- Architecture style: lightweight layered (ports-and-adapters rejected for MVP with first-principles reasoning)
- Component responsibilities defined for web app, extension, and shared packages (core, ui, extension-core)
- Extension capture handoff recommended: durable chrome.storage.local outbox + explicit open/bridge delivery + ack-gated deletion (idempotent UUID + canonical-URL dedup)
- Storage ownership, trust boundaries, offline/failure, security/privacy, cross-browser, risks, future evolution documented
- 4 Mermaid diagrams (context, container/component, handoff sequence, data ownership/trust)
- 8 unresolved decisions queued for Phase 2.2/2.3+; no schemas, contracts, or code written (Phase 2.1 scope only)

## Completed Work (Phase 2.2)
- Database schema & migrations documented (docs/architecture/DATABASE_SCHEMA_AND_MIGRATIONS.md)
- 7 stores: resources, collections, tags, resourceCollections, resourceTags, savedSearches, preferences; ViewState and import/export tracking deliberately NOT stored (URL-transient / no FR)
- Join tables chosen over embedded arrays for Resource-Collection and Resource-Tag (compound PKs, bidirectional indexes)
- URL normalization + dedup defined (tracking-only strip, fragment drop, canonicalUrl unique index as dedup authority)
- MiniSearch defined as fully derived/rebuildable; Dexie v1 schema with additive-only migration strategy and boot integrity check documented
- 4 Mermaid diagrams (ERD, join relationships, write/index lifecycle, upgrade lifecycle)
- 6 unresolved questions (U1-U6) queued; no code, migrations, or dependencies written (Phase 2.2 scope only)

## Completed Work (Phase 2.3)
- Extension↔web communication contracts documented (docs/architecture/EXTENSION_WEB_COMMUNICATION_CONTRACTS.md)
- 4-type versioned protocol (deliver/ack/nack/ready), at-least-once transport, idempotent by captureId + canonicalUrl; ack only after Dexie commit
- Origin check (single exact-origin allowlist) + per-load nonce handshake; 64 KiB envelope cap, Zod validation, http(s)-only URL hygiene
- Retry: 10 s ack timeout, backoff 1-60 s, unbounded local retry (outbox is sole state); contracts in packages/core (pure TS+Zod)
- 4+ Mermaid diagrams (message flow, retry/ack failure, trust boundaries, package direction); Phase 2.2 U1-U6 carried forward unchanged; no code/schemas implemented (Phase 2.3 scope only)

## Completed Work (Phase 2.4)
- Search & indexing architecture documented (docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md)
- MiniSearch in-memory, rebuilt on every app start (no persistence, no worker); weighted fields (title 3, tags 2, desc 1, url 0.6, collections 0.5, type 0.4); single shared tokenizer
- Facets resolved via Dexie indexed queries, intersected in Search Service; AND-then-OR semantics; index sync on post-commit hooks only (drafts never indexed)
- Performance figures labeled as targets for Phase 4 benchmarking (not measured); FTS5 seam reserved for Phase 8+
- 5 Mermaid diagrams (data flow, sync, query lifecycle, rebuild, package direction); Phase 2.2 U1-U6 carried forward unchanged; no code implemented (Phase 2.4 scope only)

## Completed Work (Phase 2.5)
- Frontend architecture & state ownership documented (docs/architecture/FRONTEND_ARCHITECTURE_AND_STATE_OWNERSHIP.md)
- Single SPA, hand-rolled URL-param routing (no React Router); feature-folder structure with explicit dependency rules; 3 state owners (Dexie canonical, TanStack Query, URL) + 4 small Contexts
- No React Hook Form / Zustand / Redux; controlled forms + Zod; grid-only rendering; Tailwind v4 design tokens
- 5 Mermaid diagrams (component hierarchy, dependencies, state flow, mutations, search lifecycle); Phase 2.2 U1-U6 carried forward unchanged; no components implemented (Phase 2.5 scope only)

## Completed Work (Phase 2.6)
- Offline behavior, reliability & error handling documented (docs/architecture/OFFLINE_RELIABILITY_AND_ERROR_HANDLING.md)
- Invariant: 'saved' only after Dexie commit; PWA app-shell-only caching; quarantine-not-delete; no automatic destructive recovery; U5 purge carried forward unchanged
- Outbox sole retry state (Phase 2.3 values as proposals); search degraded-mode; error taxonomy (9 categories) with zero telemetry
- 5 Mermaid diagrams (offline boundaries, tx failure/recovery, outbox retry, index rebuild, import rollback); no code implemented (Phase 2.6 scope only)

## Completed Work (Phase 2.7)
- Security & privacy architecture documented (docs/architecture/SECURITY_AND_PRIVACY_ARCHITECTURE.md)
- Threat model (8 threats T1-T8, STRIDE skim); 4-permission minimum extension set; isolated-world content scripts; origin+nonce bridge (integrity, NOT crypto auth)
- Text-only rendering, strict CSP proposal, http(s)-only URL allowlist, IDN/punycode display; import caps (proposed targets); IndexedDB encryption deferred to Phase 8+ with documented residual risk
- Zero telemetry (FR-PRI-001), no auth (FR-PRI-003), guarded full delete (FR-PRI-002); 3 Mermaid diagrams (trust boundaries, threat map, privacy recovery); no code implemented (Phase 2.7 scope only)

## Completed Work (Phase 2.8)
- Performance budgets & accessibility documented (docs/architecture/PERFORMANCE_BUDGETS_AND_ACCESSIBILITY.md)
- Proposed targets (startup, rendering ≤500ms NFR-PER-005, search ≤50ms NFR-PER-004, bundle ≤250KB JS, memory provisional); all labeled unmeasured, Phase 4 benchmarking to validate
- Optimized ladder: debounce + 500-cap + chunked build + code-splitting in MVP; memo/workers/virtualization only if measured-necessary; virtualization threshold-triggered >500 DOM items
- WCAG 2.2 AA (NFR-ACC-001): semantics, contrast, keyboard map (⌘K///s), focus trap/restore, live regions; testing via axe-core + Playwright + manual SR pass (none run yet)
- 5 Mermaid diagrams (startup, search lifecycle, large-library rendering, measurement workflow, a11y focus); Phase 2.2 U1-U6 carried forward unchanged; no code implemented (Phase 2.8 scope only)

## Completed Work (Phase 2.9)
- Architecture Decision Records documented (docs/architecture/ARCHITECTURE_DECISION_RECORDS.md): 20 ADRs, 19 Accepted, 1 Proposed (performance budgets)
- Final architecture review (docs/PHASE_2_FINAL_ARCHITECTURE_REVIEW.md): 19/19 docs audited, 18/18 Must-Have features covered, 0 Critical issues; Phase 2.7 diagram gap (3/5) assessed as presentation-only (I-3, Low)
- Verdict: **READY FOR PHASE 3 WITH CONDITIONS** — bridge PoC (workstream 1) must pass before Phase 4; U2/U5/U6 need user decisions by end of Phase 3; budgets remain proposed until Phase 4 measurement
- U1-U6 + 5 additional unresolved items registered (U-register §6); no code, no dependencies, no Phase 3 work started (Phase 2.9 scope only)

## Completed Work (Phase 3)
- Implementation plan (docs/PHASE_3_IMPLEMENTATION_PLAN.md): 8 workstreams, M0–M10 milestones, dependency graph, §12 Phase 4 entry gate (bridge PoC mandatory)
- Task breakdown (docs/PHASE_3_TASK_BREAKDOWN.md): 67 tasks, unique IDs, no circular deps, ~165h + reviews
- Phase 4 execution roadmap (docs/PHASE_4_EXECUTION_ROADMAP.md): 6 sprints, roadmap-only (not execution permission)
- Decision register (docs/PHASE_3_DECISION_REGISTER.md): U1–U6 + R-1–R-5 + DEC-012/013; user decisions U2/U5/U6 by end of Phase 3
- Environment verified: Node v26.13.0 now Active LTS (audit C-1 stale — keep, do not downgrade); 2 doc conflicts recorded (C-1 stale audit, C-2 stale Next.js workflow); no code/deps/git created (Phase 3 scope only)

## Completed Work (Pre-Phase-4 PoC, 2026-11-08)
- User decisions recorded (U1/U2/U4/U5/U6, DEC-012/013 ✅ user-approved); R-1/R-2 provisional (recommended as proposed, not accepted)
- PoC at poc/extension-bridge/ (disposable, zero runtime deps): logic harness 14/14 PASS; real-browser Chrome/Edge T01/T05/T06 PASS; Firefox NOT RUN (Playwright binary missing + system launch timeout)
- Verdict: 3-hop bridge viable in Chrome/Edge, no architecture change; Firefox row must complete before Phase 4 gate closes. Phase 4 NOT started.

## Completed Work (Firefox completion, 2026-11-08)
- Diagnosed Firefox hang (Playwright/system binary mismatch); installed matching bundled Firefox via `npx playwright-core install firefox`
- Firefox 159.0 runtime full matrix: 12/12 PASS (T01–T10 + B1/B2); validation docs at docs/validation/ (matrix 30/30, findings incl. residual 5-min manual add-on load task)
- **PoC gate: PASSED.** Only R-1/R-2 approval remains before Phase 4.

## Completed Work (Phase 4 entry review, 2026-11-08)
- R-1 (10s ACK, 1s→60s backoff, unbounded, FIFO, safeguards) and R-2 (`fluiddeck.capture` v1, 4 message types) recorded as ✅ user-approved in PHASE_3_DECISION_REGISTER.md + validation/EXTENSION_BRIDGE_POC_DECISIONS.md; propagated to plan/roadmap/matrix
- Final entry audit (A–G) in docs/PHASE_4_ENTRY_REVIEW.md — verdict **READY WITH CONDITIONS**
- Condition: manual Firefox `about:debugging` temp add-on load verification is a mandatory Sprint 1 task (NOT complete)
- Verified: no scaffold/code/deps added; Phase 4 pending authorization

## Completed Work (Phase 4 Sprint 1, 2026-11-08)
- Monorepo: `apps/web`, `apps/extension`, `packages/{core,ui,extension-core}`; pnpm 11 workspace; git initialized (autocrlf=true), no commit made
- ENV-001/002 ✅ (Node 26.13.0, pnpm 11.13.0), SCAFFOLD-001–005 ✅, SCAFFOLD-006 ✅ minus CI stub; POC-001–005 previously complete
- Verified: `pnpm install`, `typecheck` (5/5), `test` 7/7, `build` (web 103.52 kB gzip; ext chrome-mv3 + firefox-mv3 MV3), `lint` clean, `test:e2e` 1/1
- Extension loaded in bundled Chromium: background SW wrote `fluid-deck:booted`, popup rendered `fluiddeck.capture v1`
- Not done (Sprint 1 scope): Dexie/DB, routing, capture flow — DB-001/CORE-001 are Sprint 2 (M3)
- Firefox manual verification (2026-11-08, user): add-on loaded via `about:debugging`, background Running, log `[Fluid Deck] background ready — fluiddeck.capture v1` → **PASS**
- CSP: two Firefox "blocked … eval" warnings investigated → **not from Fluid Deck** (0 `eval`/`Function(` matches in the production artifact, no CSP override, clean-profile run emits no CSP warnings); environment/devtool side, no functional impact, CSP left untouched
- Popup: renders `Ready — fluiddeck.capture v1` in Chromium (screenshot); Firefox popup visual check still needs one user click
- Full report: `docs/SPRINT_1_IMPLEMENTATION_REPORT.md`

## Completed Work (Phase 4 Sprint 2, 2026-11-08)
- Scope: M3 domain + database only. UI-001–003 (roadmap lists them under Sprint 2, breakdown marks them M4) were NOT implemented.
- CORE-001/002: `packages/core` reorganized into constants, Zod schemas, URL canonicalization, fractional ordering/depth, ViewState URL codec, preference defaults. Resource-type enum corrected to the PRD's approved 8 values.
- DB-001–008: Dexie `fluid-deck` v1 with the seven approved stores; repositories for resources, collections, tags, joins, preferences, saved searches; one transaction per logical mutation; soft delete/restore + guarded purge; quarantine + guarded full delete; integrity check; multi-tab `blocked`/`versionchange` handling; v1→v2 additive migration test.
- Schema-syntax corrections to Phase 2.2 §3.1 (Dexie `&` for unique, `[type+createdAt]` brackets) — documented in the Sprint 2 report, no semantic change.
- Verified: `typecheck` 5/5, `test` 14 files / 100 tests, `lint` clean, `prettier --check` clean, `build` (web 104.79 kB gzip; chrome-mv3 194.91 kB; firefox-mv3 195.03 kB), `test:e2e` 1/1.
- Not done: app shell/grid/TanStack (UI-001–003), boot wiring of `openDatabase`/`checkIntegrity`, real-browser IndexedDB verification, DB-005 backup restore (IMPORT-*), U4 exception host list contents.
- Full report: `docs/SPRINT_2_IMPLEMENTATION_REPORT.md`; developer notes: `docs/architecture/DATABASE_IMPLEMENTATION_NOTES.md`
- Closure audit (2026-11-08): `docs/SPRINT_2_CLOSURE_REVIEW.md` — re-verified schema/indexes against Phase 2.2, confirmed the migration test uses a genuine v1 database, confirmed `test` 100/100, typecheck, lint, format and build unchanged; **no defects, no code changes**. Tracked deferrals: DB-005 backup restore (IMPORT-006/007/008), DB-004 boot wiring (UI-001), DB-006 manual 2-tab check, U4 exception-host decision, real-browser IndexedDB validation.

## Completed Work (Git checkpoint, 2026-11-09)
- Initial checkpoint `7899782` (`78997825acd457fc9d1b0b473f259a16ddd7e97f`, 83 files) preserved as-is; post-commit audit found `packages/` untracked though apps already import `@fluid-deck/core`, `@fluid-deck/ui`, `@fluid-deck/extension-core` — clean checkout could not build.
- Follow-up `ce99623` (`ce99623105089b2a36b205a9ab74d8bc896b7a54`, 23 files, `fix: include missing shared workspace packages`): `packages/core`, `packages/extension-core`, `packages/ui` source/config/tests only. `poc/`, node_modules, build output, `.claude/`, `.remember/`, `.freebuff/` excluded. Original commit not amended/rebased; no remote, no push.
- Verified: `pnpm install --frozen-lockfile`, `typecheck` 5/5, `test` 14 files / 100 tests, `build` (web 104.79 kB gzip; chrome-mv3 194.91 kB; firefox-mv3 195.03 kB). Full report: `docs/GIT_CHECKPOINT_REPORT.md`.

## Completed Work (Phase 4 Sprint 3 / M4, 2026-11-09)
- Scope per task breakdown M4 (roadmap's Sprint 2 block spanned M3–M4; Sprint 2 delivered M3 only): UI-001 app shell + sidebar + URL-param routing (one route, back/forward via pushState/popstate), UI-002 resource grid + 7-variant cards (U3) with 500-item cap + 50-card growing window, UI-003 TanStack Query (`@tanstack/react-query`, only new dep) + 4 Contexts (theme/shell/dialog/toast) with post-commit invalidation. Plus DB-004 boot leg: `openDatabase()` + `checkIntegrity()` wired in `main.tsx` with explicit DB-error screen and blocked/versionchange banners.
- Services layer added (`services/library.ts`) thin-wrapping Sprint 2 repositories; features never import repositories directly. Keyword search (`q`) intentionally NOT implemented (SEARCH-002/UI-004, M7); Trash uses `?view=trash` outside the core ViewState schema (documented deviation).
- Scope conflict recorded: implementation plan §7 M4 names UI-001–005, breakdown assigns UI-004→M7, UI-005→M5 — implemented UI-001–003 only.
- Verified: `test` 18 files / 110 tests (10 new), `typecheck` 5/5, `lint` clean, `prettier --check` clean, `build` (web 146.34 kB gzip — inside proposed 250 kB budget; chrome-mv3 194.91 kB; firefox-mv3 195.03 kB), `test:e2e` 3/3 including real-Chromium boot creating the `fluid-deck` IndexedDB database.
- Not done: search UI/palette/details/settings (UI-004/005/009/010), collection/tag management (UI-006/007, M5), capture (EXT-*, M6), manual two-tab check (DB-006), U4 host list (still empty), Firefox popup click. No commit made — awaiting approval.
- Full report: `docs/SPRINT_3_IMPLEMENTATION_REPORT.md`; acceptance: `docs/SPRINT_3_ACCEPTANCE_REVIEW.md` (4 commits total: `e944794` deps, `8f4d576` UI, `e318146` docs — all pushed to `origin/main`, remote hash `e318146` confirmed 2026-11-09)

## Planning (Phase 4 Sprint 4 / M5, 2026-11-09)
- M5 task scope per task breakdown: UI-005 (palette), UI-006 (collections), UI-007 (tags), UI-008 (inbox), UI-009 (dialogs/toast), UI-010 (settings); ~21h; all dependencies satisfied by Sprints 2-3.
- Library research complete: adopt `cmdk` (palette), `@radix-ui/react-dialog` + `sonner` (dialogs/toasts), `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (reorder), `lucide-react` (icons), Testing Library + axe-core (a11y tests). Shipped addition measured 49.11 kB gzip (was ≤60 kB target).
- Plan: `docs/SPRINT_4_IMPLEMENTATION_PLAN.md`; technology evaluation: `docs/SPRINT_4_TECHNOLOGY_EVALUATION.md`. Sprint 4 implementation COMPLETE (2026-11-09) — see below.

## Completed Work (Phase 4 Sprint 4 / M5, 2026-11-09)
- Implementation order: UI-009 → UI-006 → UI-007 → UI-008 → UI-010 → UI-005. Dialog/Provider APIs from Sprint 3 preserved (`useDialog`/`useToast`); internals moved to Radix (`contexts/dialog.tsx`) + Sonner (`contexts/toast.tsx`) with `<Toaster>` in `main.tsx`.
- Sidebar now hosts `CollectionsPanel` (U1 reorder via `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, persisted through Sprint 2 `reorderCollection`; U2 depth warn-only) and `TagsPanel` (rename/merge via Sprint 2 `renameTag/mergeTags`); `InboxPage` (dated/linked per `services/inbox.ts`) and `SettingsPage` (theme + U5 retention + explicit-confirm purge) render via the `?view=` URL param (`useViewState.page`); `CommandPalette` (cmdk over collections/tags) on header `⌘K` button + Ctrl/Cmd+K.
- Theme write-only bug FIXED (Sprint 3 finding 1): `ThemeProvider` loads the persisted preference on mount; settings writes via the preferences repository.
- DOM component tests added (Testing Library + jsdom + `fake-indexeddb/auto` for singleton DB): UI-009 focus trap/restore, UI-007 rename propagation, UI-006 buildTree. `vitest.config.ts` include widened to `*.test.tsx`. Axe-core audit in real Chromium (`e2e/m5.spec.ts`): zero violations.
- New devDeps: `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` (apps/web), `@axe-core/playwright` (workspace root — e2e runner lives there), plus the approved runtime set above.
- Verified: `test` 22 files / 116 tests, `typecheck` 5/5, `lint` clean, `prettier --check` clean, `build` web 195.45 kB gzip (delta +49.11 vs Sprint 3's 146.34 — inside the ≤60 kB target), `test:e2e` 6/6. No commit made — awaiting approval.
- Full report: `docs/SPRINT_4_IMPLEMENTATION_REPORT.md`
- **Commit record (2026-11-09, added after the fact):** Sprint 4 was committed in 3 grouped commits — `26ba495` (deps), `ee81dc7` (implementation), `fb422df` (docs). Verified with the mandatory typecheck fix in `inbox.test.ts`. **NOT pushed** — `main` is ahead of `origin/main` (`fb422df` vs `e318146`) as of this writing. The sprint was not pushed to GitHub; this corrects the "pushed" assumption in the Sprint 5 briefing (see `docs/SPRINT_5_READINESS_REVIEW.md` §0).

## Planning (Phase 4 Sprint 5 / M6, 2026-11-09)
- M6 task scope per task breakdown: EXT-001 (outbox, 4h), EXT-002 (extraction, 4h), EXT-003 (thumbnails, 3h), EXT-004 (bridge, 4h), EXT-005 (triggers B1/B2/B3, 3h), EXT-006 (popup UI, 3h), EXT-007 (shared protocol, 1h); 22h total. Dependencies POC-004, CORE-002 both satisfied; R-1/R-2 user-approved.
- No new dependencies proposed (Zod, browser.storage.local, platform DOM APIs). Readiness: READY WITH CONDITIONS (push Sprint 4 + confirm R-1 params). See `docs/SPRINT_5_READINESS_REVIEW.md`.
- Plan: `docs/SPRINT_5_IMPLEMENTATION_PLAN.md`. Sprint 5 implementation NOT started.

## Completed Work (Phase 4 Sprint 5 / M6, in progress)
- **EXT-007 (2026-11-09/10):** Shared protocol, no duplication. Canonical: `packages/extension-core/src/index.ts` (R-2 v1 untouched). Audit found zero production duplicates (only disposable `poc/`); the gap was the web app not importing the shared package. Landed: `apps/web/src/bridge/contract.ts` seam (re-exports + parse helpers EXT-004 will consume), `apps/web/package.json` `workspace:*` dep on `@fluid-deck/extension-core`, stale background comment corrected. TDD: RED (missing module) → GREEN, 4 seam tests (identity/valid/invalid/version gate). Verified: `typecheck` 5/5, `test` 23/120, `lint` clean, `prettier --check` clean, `build` web 195.45 kB gzip + extensions unchanged. `pnpm test:e2e` not run (contract-only change, no UI).
- Report: `docs/SPRINT_5_IMPLEMENTATION_REPORT.md` (grows per task). EXT-002..006 NOT started.
- **EXT-001 (2026-11-10):** Durable outbox state machine. `packages/extension-core/src/outbox.ts` — transport-agnostic `OutboxMachine` (injectable store/clock/deliver): FIFO single-head delivery, single-flight, R-1 exact (10s timeout, backoff min(1s·2^n, 60s), unbounded, permanent-nack drop only), handleAck head-match idempotency, storage-failure-safe enqueue. Background: WXT storage adapter (`browser.storage.local` `fluid-deck:outbox`), reconcile-on-boot + `onStartup`; delivery starts only when a transport is injected (EXT-004) — reconcile-only, logged. No `alarms` permission added.
   - **EXT-001 lifecycle correction (2026-11-10):** Added `alarms` permission + durable one-shot alarm driver (`alarm-driver.ts`: `createAlarmAdapter`/`ALARM_NAME`, ms↔s conversion) wired via `onSchedule`; boot reconciles (clear+recreate from durable state); `onAlarm` reloads + ticks when due; stale/early/duplicate alarms harmless. Permanent NACK confirmed terminal per contracts §3.3 (no ambiguity). Verified: `typecheck` 5/5, `test` 25/140, `lint` clean, `prettier --check` clean, `build` web 195.45 kB + chrome 198.02 / firefox 198.14, `test:e2e` 6/6.
   - **EXT-001 final lifecycle audit (2026-11-10):** Audit found 5 gaps in the correction above, all fixed: (1) background reconcile armed only `nextAttemptAt`, ignoring the in-flight ACK deadline — now `effectiveDeadlineMs()` (retry vs ACK, earliest future, null when none); (2) an early/duplicate wake on an armed attempt re-delivered — now guarded (re-arm + return, same for waiting heads); (3) timeout transitions kept a stale `ackDeadlineAt`, double-counting attempts on restart — now cleared; (4) `onSchedule(0)` armed an epoch-0 alarm — now clears; (5) `handleAck` didn't re-arm the new head — now does. Timing contract documented in `alarm-driver.ts`: persisted logical deadlines exact; Chrome wakes are ≥30s-coarse and may be late; prompt execution while alive is the in-worker `setTimeout` race, alarm is suspension/restart fallback only; Firefox alarms don't survive browser restart, boot/onStartup reconcile recreates them. Storage failure: arming-save failure surfaces with no attempt counted and durable untouched; outcome-save failure uses a best-effort re-save (usually lands); if all transition saves fail, durable stays at last persisted state — restart re-attempts at the same backoff step, never reset below durable, capture never lost. Verified: focused 37/37, `typecheck` 5/5, `test` 26/153, `lint` clean, `prettier --check` clean, `build` web 195.45 kB gzip + chrome-mv3 199.03 / firefox-mv3 199.15 kB.

- **EXT-002 (2026-11-10):** Metadata extraction (M1). `packages/extension-core/src/metadata.ts` - pure `readMetadata(document, pageUrl)` (approved mechanism: one meta + one link traversal per call, no parsing library) implementing the `SYSTEM_ARCHITECTURE` §7 first-hit-wins chain: title `og:title` → `twitter:title` → `<title>` → URL-derived; description `og:description` → `twitter:description` → `meta[name=description]`; image `og:image` → `twitter:image`; canonical `og:url` → `link[rel=canonical]` → page URL, canonicalized; favicon first declared `link[rel~=icon]`; site name `og:site_name` → host. Also `extractMetadata(url)` for the no-DOM/offscreen acquire path (injected fetch/parser, 5 s timeout, 512 KiB cap, content-type gate, redirect rebasing, non-http(s) rejected before any request) and `fallbackMetadata`. `createCaptureDraft` lives in `index.ts` and validates against the frozen `captureDraftSchema`; no protocol/outbox change, no new dependency, `type` left to M3 detection. TDD: 21 fixture/mocked tests covering all 20 mandated areas (unsafe URLs, 404/network/timeout/empty/content-type/oversize/redirect, malformed HTML, precedence, Zod contract). Verified: focused 21/21, `typecheck` 5/5, `test` 27/174, `lint` clean, `prettier --check` clean, `build` web 195.45 kB gzip + chrome-mv3 199.03 / firefox-mv3 199.15 kB (unchanged, tree-shaken), `test:e2e` not run (no user-visible surface).

   - **EXT-002 review corrections (2026-11-10):** (A) `extractMetadata` now reads `Response.body` incrementally: cumulative byte counting before accumulation, hard 512 KiB cap preserved, `reader.cancel()` + `releaseLock()` on overflow (oversized content never reaches the parser), content-length kept as an advisory pre-check only, 5 s abort/timeout and all existing fallback notes unchanged. (B) `packages/extension-core/package.json` declares `jsdom ^31.0.0` as a devDependency (already-installed version; lockfile importer-only change). Tests: +6 deterministic mocked-`ReadableStream` cases (below/exact/over limit, missing + misleading content-length, cancel observed, parser not called, stream failure, mid-stream abort) → `metadata.test.ts` 27. Verified: focused 27/27, `typecheck` 5/5, `test` 27/180, `lint` clean, `prettier --check` clean, `build` web 195.45 kB gzip + chrome-mv3 199.03 / firefox-mv3 199.15 kB, `test:e2e` not run (no integration surface).

- **EXT-003 (2026-11-10):** Thumbnail failure handling + HTTP 429 (M2). Extension: `packages/extension-core/src/thumbnail.ts` - `createThumbnailProbe({fetchImpl, now, timeoutMs, maxBytes, cooldowns})` returns `{outcome, status?, retryAfterMs?}` for `ok | invalid-url | cooling-down | rate-limited | http-error | not-image | too-large | timeout | network-error`; `parseRetryAfter()` accepts delta-seconds and HTTP-date, clamps 1 s..24 h, and missing/malformed headers fall back to 60 s. 429 is checked before the generic HTTP branch, records an in-memory per-URL cooldown, and `cooling-down` short-circuits before any fetch (no retry loop, no scheduler, no persisted cache). Request is `credentials:"omit"` + `referrerPolicy:"no-referrer"`, `image/*`-only, body cancelled unread, declared size >2 MiB rejected, 5 s abort. Web: `ResourceCard` now always renders an `aspect-video` media slot; the `img` appears only for an `httpUrlSchema`-valid URL that has not failed, `onError` swaps to a muted `ImageOff` placeholder (no broken icon, no layout shift), and title/domain/type/description/actions are untouched. No protocol, schema, R-1/R-2, manifest, or dependency change (`lucide-react` was already installed). TDD: 22 probe tests + 6 card DOM tests. Verified: focused 28/28, `typecheck` 5/5, `test` 29/208, `lint` clean, `prettier --check` clean, `build` web 197.15 kB gzip (+1.70 kB) + chrome-mv3 199.03 / firefox-mv3 199.15 kB (unchanged, probe not imported by entrypoints yet), `test:e2e` 6/6 (card markup is user-visible).

- **EXT-004 (2026-11-10):** Production bridge wiring. The existing durable `OutboxMachine` now delivers through the real 3-hop path; R-2 v1, R-1 timings, and the single queue are untouched. `packages/extension-core/src/bridge-transport.ts` (`BridgeTransport`: ready/URL tab registry, one entry → one `capture.deliver`, ack/nack re-validation, `timeout` when no receiver) + `bridge-relay.ts` (`createBridgeRelay`: exact origin, `event.source`, role, per-load nonce, nonce injection on the way down) with `apps/extension/entrypoints/bridge.content.ts` as the thin `document_start` content script on exact dev origins (`apps/extension/src/bridge-config.ts`: `127.0.0.1:5199`, `localhost:5199`; no wildcard). `apps/web/src/bridge/inbox.ts` validates the deliver (source/origin/nonce/role/version/size/draft), writes through the existing Dexie repository, and acks **only after the commit**; failures map to `quota`/`db_unavailable`/`invalid_payload`/`invalid_url`/`transient` nacks and a failed write is never acked. Idempotency is the pre-existing pair: `captureId` → `resources.id` and the `canonicalUrl` unique index (duplicate delivery acks `duplicate`, one row). Repository gains opt-in `id`, `tagNames` (in-transaction create-or-get), and `dropMissingMembers`; defaults unchanged for UI callers. Background wires `reconcile()`/`onAlarm` delivery, `capture.ready`/`ack`/`nack` routing via `sender.tab.id`, tab discovery after a worker restart, and `tabs.onRemoved`/`onUpdated` cleanup; `OutboxMachine.handleNack` covers a late permanent nack without adding a retry loop. Metadata/thumbnail probing stay with EXT-002/003 - the receiver never fetches. No new permission, no `externally_connectable`, no `tabs` permission, no dependency. TDD: 37 unit tests (transport 8, relay 8, outbox nack 4, repository 7, inbox 10) + a **real-browser Playwright spec** (`e2e/bridge.spec.ts`) that loads the built extension, uses the real handshake + Dexie commit + ack, and proves replay creates no second row. Verified: focused 37/37, `typecheck` 5/5, `test` 34 files / 245 passed, `lint` clean, `prettier --check` clean, `build` web 200.80 kB gzip (+3.65) + chrome-mv3 303.79 kB raw / 86.52 kB gzip + firefox-mv3 303.90 kB raw / 86.58 kB gzip (inside the 250 kB gzip cap; the new relay bundle is 101.15 kB raw), `test:e2e` 7/7.
  - E2E runner note: use `channel: "chromium"` for extension specs. The default headless shell loads no extensions and Chrome stable ≥ 137 ignores `--load-extension` (verified on Chrome 156).
  - Not implemented by design: capture triggers (EXT-005), popup status/queue UI (EXT-006), build-time production origin injection.

- **EXT-005 (2026-11-10):** Capture triggers B1 + B2 (B3 deferred with user approval). One pipeline for every trigger: `packages/extension-core/src/capture.ts` (`createCaptureService({extract, enqueue, queueDepth, now, createId})`, `CAPTURE_TRIGGERS = ["context-menu", "command"]` *(historical: this was the EXT-005 state at the time; EXT-006 subsequently added the popup trigger, so the current declaration is `["context-menu", "command", "popup"]`)*, `CaptureResult` = `accepted | rejected | failed`, `isCaptureMetadata`, internal `READ_METADATA_MESSAGE`) → URL validation → EXT-002 metadata → `createCaptureDraft` → `outbox.enqueue` (**accepted boundary = durable write**, never "saved") → EXT-004 delivery → Dexie commit → ACK. Triggers: **B1** context menu "Save to Fluid Deck" (`contextMenus.onClicked`, browser-supplied tab, `removeAll`+create on `onInstalled`/`onStartup`); **B2** `Ctrl+Shift+S` / `⌘⇧S` via `wxt.config.ts` `commands["save-current-tab"]` (`commands.onCommand` → `tabs.query({active,currentWindow})`). **B3 (Web Share Target) deferred**: PRD §7.2 lists mobile share target as Post-MVP/Phase 8, `MVP_FEATURE_PRIORITIZATION.md` defines B3 as the page-action popup (= EXT-006), and `apps/web` has no PWA manifest/`share_target`; no extension API can register one. **Key finding:** MV3 service workers have no `DOMParser`, so `extractMetadata(url)` fell through to `parse:failed` in the background (proved by the real-browser test) — metadata is instead read live by a new `apps/extension/entrypoints/capture.content.ts` (`<all_urls>`, `document_idle`) answering the internal message with EXT-002's `readMetadata(document, location.href)`; 5 s `withTimeout` and missing/restricted/hung content scripts degrade to `fallbackMetadata` while the capture is still queued. EXT-003's `createThumbnailProbe` is deliberately **not** called at capture time (card owns the placeholder; no extra fetcher on the durability path). Feedback is truthful and adds no UI surface (no badge/toast before EXT-006): structured console record + `CaptureResult` + `__fluidDeck.lastCapture()`; distinct `captureId` per invocation, library stays unique via the existing canonical-URL dedup. No permission, dependency, R-1/R-2, schema, or protocol change (`commands` is a manifest key). TDD: 33 deterministic service tests (trigger set, 8 unsupported schemes, EXT-002 reuse with real `extractMetadata`, extractor throw → fallback, thumbnail/favicon passthrough, optional image, schema validity, enqueue-before-accept ordering, storage failure, distinct ids + same canonical hint, worker-restart durability, response validation) + 3 real-browser tests (`e2e/capture-triggers.spec.ts`, `channel: "chromium"`, built extension, real HTTP fixtures, real Dexie + ACK, duplicate → one card). Verified: focused 33/33, e2e 3/3, `typecheck` 5/5, `test` 35 files / **278 passed**, `lint` clean, `prettier --check` clean, `build` web 200.80 kB gzip (unchanged) + chrome-mv3 **410.74 kB raw / 117.19 kB gzip** + firefox-mv3 410.86 kB raw / 117.24 kB gzip (new `capture.js` 102.66 kB raw; inside the 250 kB cap), `test:e2e` **10/10**. Manual still required: real menu item + key chord in Chrome/Edge, macOS `⌘⇧S`, the same two in Firefox, and the web-app-closed → reopen drain path.

  - Not implemented by design: capture share target B3 (Phase 8 PWA capability), popup status/queue UI (EXT-006), build-time production origin injection.

- **EXT-006 (2026-11-10):** Extension popup UI (final Sprint 5 / M6 task). Plain TS + custom CSS over the finished EXT-005 pipeline - no second capture path, no new state store. **Status model** (pure, `packages/extension-core/src/popup-status.ts`, 17 tests): `not-captured | queued(position) | saving | retrying(attempts,nextRetryAt) | saved | failed(reason,code)`, derived with precedence *newest matching outbox record → newest exit entry → not-captured*; URL matching is exact or through `canonicalizeUrl` (canonical hint or page URL), so tracking-param/fragment variants count as the same page. Sources: outbox record itself = queued (never attempted) / saving (`attempts > 0`, R-1 in-flight) / retrying (`status:"waiting"`); `saved`/`failed` come only from two small outbox-exit registries the background maintains (`fluid-deck:saved-captures` / `fluid-deck:failed-captures`, 40 entries, dedupe by captureId) written **only at outbox exits** - after `handleAck` resolves a validated ack (the ACK that only exists because the Dexie transaction committed), and after a validated permanent `routeNack` discarded the record (with `NackRoute.code`). Rejected/outbox-unavailable results are deliberately not persisted as failures (they may still retry durably). The popup re-derives on every `storage.onChanged` over `OUTBOX_STORAGE_KEY +` both registries, so ACK updates arrive live and a reopened popup reconstructs state from durable storage with zero popup-owned state. **Trigger**: `"popup"` added to `CAPTURE_TRIGGERS` (three approved triggers); the popup sends internal `POPUP_CAPTURE_MESSAGE` with `{tabId}`; the background handler is guarded to extension-owned senders (no `sender.tab`, or a page under `chrome-extension://<runtime.id>/`) and returns a sanitized `PopupCaptureResult` (`toPopupCaptureResult`, error objects flattened to `errorMessage`). **Popup surface** (`entrypoints/popup/`, 280 px): page title + hostname; status row in `role="status" aria-live="polite"` (icon + text, five distinct inline-SVG icons, never color-only); factual queue line (`N waiting to be delivered · M retrying`, hidden when empty); one primary "Save page" button (web identity: slate-900, `hover:bg-slate-700`, rounded-md, `focus-visible` outline, reduced-motion respected; disabled while submitting or while queued/saving/retrying for this page); "Open Fluid Deck" opens `APP_ORIGINS[0]` then closes; restricted/non-http URLs and missing tabs disable the action with distinct text ("This page can’t be captured" / "No active tab to save"); storage read failure renders "Couldn’t save this page", never success; the background itself retries durably so "Fluid Deck isn’t responding" is transient and closure never cancels a durably enqueued capture. **Tests**: e2e `e2e/popup.spec.ts` (real browser, built extension, real outbox/Dexie/ACK) covers not-captured → queued → retrying (no app tab) → saved after the app commits, "Saved" survives close+reopen, keyboard-only submit, duplicate-click prevention (button disabled while the record is live), restricted/missing-tab states, queue summary hidden when empty, and an axe scan (clean). **One documented seam**: Chrome's popup window is outside Playwright's automation boundary, so popup.html is opened as a tab and `window.__fluidDeckPopup.setActiveTab` supplies the active tab real `tabs.query` would otherwise answer with the popup itself; the seam cannot bypass the derive logic, and everything it feeds flows through production code paths. Verified: focused 51/51 (17 model + 34 capture incl. the popup trigger), `typecheck` 5/5, `test` 36 files / **296 passed**, `lint` clean, `prettier --check .` clean, `pnpm build` web (no change in this task; displayed below) + chrome-mv3 **425.78 kB raw / 125.61 kB gzip** + firefox-mv3 425.90 kB raw / 125.68 kB gzip (+15.0 raw / +8.4 gzip over EXT-005; `popup` chunk 105.48 kB raw incl. shared zod, `background.js` 110.77; inside the 250 kB gzip cap), `test:e2e` **13/13** (10 prior + 3 popup). No dependency added (`@axe-core/playwright` was already at HEAD); no permission, manifest key, schema, ACK/retry, or protocol change. Manual still required: real rendered popup click in Chrome/Edge/Firefox (clicking the toolbar popup uses the same `main.ts`, but the window itself is Chrome-owned), Firefox-specific popup rendering, keyboard focus order in a real popup (e2e covered keyboard on the seam), screen-reader pronunciation of the live region, and the with-app-closed → reopen drain journey in a real browser.

## Sprint 7 / M8 — Import

- **IMPORT-005 (import preview + per-conflict resolution):** `apps/web/src/import/preview.ts` — `previewImport(database, validated)` returns read-only counts (`resources`, `newResources`, `duplicates`, `collections`, `tags`, `skipped`), a conflict list keyed by canonical URL (incoming title/url beside the stored title/url/`updatedAt`), per-collection counts and the validation warnings; one indexed `resources.where("canonicalUrl").anyOf(...)` read, no transaction and no writes (five table counts asserted unchanged), deterministic across repeated previews. `commitImport` gained `resolutions` (`Map<canonicalUrl, "skip" | "update" | "add-to-collections">`) and `defaultResolution` (default `"skip"`); conflicts are resolved **inside** the existing batch transaction against the row the unique index returns, so a stale preview cannot act on the wrong row. `update` patches only non-empty imported `title`/`description`/`thumbnailUrl`/`faviconUrl`/`notes` (plus `type` when it is not the `"other"` fallback, and never the `"Untitled"` placeholder); `add-to-collections` adds memberships only (no tags, no metadata); `skip` leaves the row and its relationships untouched. Counters are additive: `duplicates` stays the conflict count, `updated` and `addedToCollections` are the resolved subsets, and IMPORT-004 checkpoints resume with those at zero. The HTML folder-membership condition from IMPORT-004 is closed: `parser.ts` now emits a folder tree (`html-folder-N` ids, parent ids, `orderIndex`) and a per-bookmark `folderId` for both `<DL><p>Name</p>` and `<DT><H3>` exports, filing root bookmarks into a synthesized `Unorganized` folder; `validate.ts` maps folders to collections and `folderId` to `meta.collectionSourceIds`. UI: `apps/web/src/features/import-export/ImportDialog.tsx` (file pick → validate → preview counts/conflicts → per-conflict radios + apply-to-all → commit → toast + query invalidation; dismissal resets and writes nothing) mounted from a new Import section in `SettingsPage.tsx`.
  - Tests: `preview.test.ts` 7 (fresh counts with zero writes, determinism, duplicate + soft-deleted conflict identity, preview-vs-commit counts, Chrome fixture memberships `Unorganized 5 / Development 3 / Design 2`, nested `Dev → Tools`); `commit.test.ts` +6 = 21 (skip/update/add individually, mixed four-resource import, stale preview in both directions, repeated-commit idempotency, empty values never wiping stored metadata); `ImportDialog.test.tsx` 3 jsdom (preview + update + commit, dismiss writes nothing, invalid file error).
  - Verified: focused `pnpm vitest run apps/web/src/import/ apps/web/src/features/import-export/` **6 files / 85 tests passed**, full `pnpm test` **454 passed / 52 of 53 files**, web typecheck exactly the 3 pre-existing `search.test.ts` errors, ESLint clean on the 11 touched files, Prettier clean, `pnpm build` exit 0 (web 7.36 s, entry **757.12 kB raw / 237.07 kB gzip** — DOMPurify and the import pipeline are now reachable from Settings), `git diff --check` exit 0.
  - Known non-IMPORT-005 failure: `apps/web/src/services/search.test.ts` (Sprint 6) still fails to transform; untouched. No schema change, no new dependency (DOMPurify was IMPORT-003).
  - Report: `docs/SPRINT_7_IMPORT_005_REPORT.md`. Verdict: **PASS WITH CONDITIONS** (jsdom-only UI coverage, conservative `Update Metadata` semantics, inherited no-cross-tab-lock limitation).

## Next Action
User: review EXT-006 (extension popup UI) - implemented, verified, NOT staged/committed. Sprint 5 / M6 is complete pending review; do not start Sprint 6 without explicit approval.
Still outstanding: manual context-menu + `Ctrl+Shift+S`/`⌘⇧S` check in Chrome/Edge, macOS `⌘⇧S`, the same two in Firefox, and the web-app-closed → reopen drain check (EXT-005); popup-specific manual checks (real rendered toolbar popup click + Firefox popup rendering + screen-reader pronunciation of the live region, EXT-006); manual two-tab versionchange check (DB-006), U4 canonicalization exception-host list, manual drag-reorder keyboard pass (M9), full screen-reader pass (M9).

## Approval Status
Phase 0: Complete
Phase 1.1: Complete (product vision)
Phase 1.2: Complete (competitive research)
Phase 1.3: Complete (target users & personas)
Phase 1.4: Complete (MVP feature prioritization)
Phase 1.5: Complete (information architecture)
Phase 1.6: Complete (user journeys & workflows)
Phase 1.7: Complete (technical direction evaluation)
Phase 1.8: Complete (product requirements document)
Phase 1.8.1: Complete (PRD consistency audit)
Phase 1.9: Complete (final product discovery review)
Phase 2.1: Complete (system architecture & boundaries)
Phase 2.2: Complete (database schema & migrations)
Phase 2.3: Complete (extension-web communication contracts)
Phase 2.4: Complete (search & indexing architecture)
Phase 2.5: Complete (frontend architecture & state ownership)
Phase 2.6: Complete (offline, reliability & error handling)
Phase 2.7: Complete (security & privacy architecture)
Phase 2.8: Complete (performance budgets & accessibility)
Phase 2.9: Complete (ADRs + final architecture review — READY FOR PHASE 3 WITH CONDITIONS)
Phase 2: Architecture complete
Phase 3: Complete (implementation planning — 4 docs, ready for approval)
Phase 4: In progress — Sprint 1 complete (2026-11-08); Sprint 2 M3 complete, audited and recommended for closure (2026-11-08); Git checkpoint `7899782` + package follow-up `ce99623` complete (2026-11-09); Sprint 3 (M4) implemented, accepted, committed and pushed (`e944794` + `8f4d576` + `e318146` = `origin/main` @ `e318146`, 2026-11-09); Sprint 4 (M5) planned (plan + technology evaluation), implementation NOT started