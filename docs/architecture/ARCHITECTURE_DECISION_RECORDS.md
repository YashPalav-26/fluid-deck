# Architecture Decision Records — Fluid Deck

*Phase 2.9 | Status: Accepted for Phase 3 planning | Date: 2026-11-08*
*Source documents: SYSTEM_ARCHITECTURE (2.1), DATABASE_SCHEMA_AND_MIGRATIONS (2.2), EXTENSION_WEB_COMMUNICATION_CONTRACTS (2.3), SEARCH_AND_INDEXING_ARCHITECTURE (2.4), FRONTEND_ARCHITECTURE_AND_STATE_OWNERSHIP (2.5), OFFLINE_RELIABILITY_AND_ERROR_HANDLING (2.6), SECURITY_AND_PRIVACY_ARCHITECTURE (2.7), PERFORMANCE_BUDGETS_AND_ACCESSIBILITY (2.8)*

> Format per ADR: **ID · Title · Status · Context · Decision · Rationale · Alternatives · Consequences · Risks · Source.** Related requirements are inlined in "Related". Unresolved product policies (U1–U6) are **not** ADRs.

## ADR-001 — React SPA + Vite + TypeScript
- **Status:** Accepted | Phase 2.5 §1–2 | Related: FR-VIS, IA single-screen
- Choice: React 18+, Vite, TS, Tailwind v4 + shadcn/ui, one layout, hand-rolled URL-param routing.
- Alternatives: React Router (rejected: one route), file-based routing, framework migration (Next.js — rejected: local-first PWA, no SSR need).
- Consequences: no router dependency; deep-linking via URL params; faster iteration. Risk: URL-param sprawl → mitigated by single `ViewState` Zod schema in `core`.

## ADR-002 — WXT + Manifest V3 Extension (Chrome/Firefox/Edge)
- **Status:** Accepted | 2.1 §4, 2.3, 2.7 §2 | Related: FR-CAP-001
- Choice: WXT per-browser output, MV3, isolated-world content scripts, 4 permissions.
- Alternatives: hand-rolled MV3 (rejected: WXT already approved), MV2 (rejected: Chrome deprecated), single-browser (rejected: PRD browsers).
- Consequences: Safari out of MVP scope; per-browser manifest testing required in Phase 4.

## ADR-003 — pnpm Monorepo with Shared Package Boundaries
- **Status:** Accepted | 2.1 §5, 2.3 §7, 2.4 §8, 2.5 §2
- Choice: `packages/core` (pure types+Zod+tokenizer, imports nothing), `packages/ui` (shadcn primitives), `packages/extension-core` (outbox state machine), `apps/web` (orchestration). No cycles; browser globals never in `core`.
- Alternatives: single-repo flat src (rejected: shared contracts need a home), micro-frontends (rejected: overkill). Dependencies flow `apps → packages → core` only.

## ADR-004 — Dexie.js + IndexedDB as Canonical Storage
- **Status:** Accepted | 2.1 §3, 2.2 §§1–3, 2.6 §2 | Related: FR-STO-001
- Choice: Dexie over IndexedDB in the web app; single-writer Repository Layer; full local operation.
- Alternatives: SQLite WASM (rejected: Phase 8+ seam, premature for MVP), raw IndexedDB (rejected: Dexie boilerplate savings), server DB (rejected: local-first requirement). Consequence: unencrypted local data (2.7 mitigation: see ADR-017).

## ADR-005 — Seven-Store Relational-Style Schema
- **Status:** Accepted | 2.2 §§1–3 | Related: FR-STO-001–008
- Choice: 7 stores (`resources, collections, tags, resourceCollections, resourceTags, savedSearches, preferences`); ViewState transient in URL (not stored); no import/export tracking store (no FR justifies it).
- Alternatives: extra metadata/event stores (rejected: YAGNI); single-document store (rejected: bidirectional queries need joins).
- Consequences: join tables with compound PKs give free dedup + bidirectional indexes; no DB-level FKs → single-writer services enforce integrity.

## ADR-006 — Join Tables over Embedded Arrays (Resource↔Collection, Resource↔Tag)
- **Status:** Accepted | 2.2 §§0–1 (D1) | Related: FR-STO-004/005
- Choice: dedicated join stores with compound PK `[resourceId+collectionId]`.
- Alternatives: embedded arrays + Dexie multi-entry indexes (rejected: duplicate detection needs service-side dedup, membership removal rewrites whole rows, usageCount needs scans).
- Trade-off: more writes per organize op (point writes, <1ms) vs free bidirectional queries.

## ADR-007 — MiniSearch as Derived, Disposable Search
- **Status:** Accepted | 2.4 §§1–3, 2.6 §4 | Related: FR-SRH-001, NFR-PER-004
- Choice: in-memory MiniSearch documents (title×3, tags×2, desc×1, url×0.6, collections×0.5, type×0.4), single shared tokenizer, AND-then-OR, exact-title pin. Indexed fields verified against Phase 2.2 Resource model.
- Alternatives: FTS5/SQLite (rejected: Phase 8+, premature), semantic search (rejected: explicit MVP exclusion), inverted-index DB (rejected: reinvents MiniSearch).

## ADR-008 — Rebuild Index on Every Startup; No Persistence, No Workers
- **Status:** Accepted | 2.4 §6, 2.6 §4
- Choice: chunked post-paint rebuild; "Indexing…" degraded mode (browse-only); version marker in `preferences`.
- Alternatives: persisted index (rejected: rebuild is cheaper than cache coherence; JSON 2–5× text size), workers (deferred: only if measured build >500ms at 10k — Phase 4 test).

## ADR-009 — Durable Outbox + At-Least-Once Delivery
- **Status:** Accepted | 2.1 §10, 2.3 §5, 2.6 §3 | Related: FR-CAP
- Choice: `chrome.storage.local` outbox (sole owner: Queue Coordinator); ack-gated deletion only; dedup by captureId + `canonicalUrl` unique index. Retry values (10s ack timeout, 1s→60s backoff, unbounded retry) remain **Proposed, not Accepted**.
- Alternatives: exactly-once (rejected: impossible to guarantee, idempotency achieves the user-visible outcome), native messaging / local HTTP (rejected: attack surface + install friction for zero-network product).

## ADR-010 — Cross-Origin Content-Script Bridge (Origin + Nonce, Not Crypto Auth)
- **Status:** Accepted | 2.3 §§1–4, 2.7 §3 | Related: FR-CAP
- Choice: exact-origin `externally_connectable` allowlist, browser-verified `MessageSender`, `window.postMessage` origin checks, per-load nonce in `sessionStorage`, Zod validation, protocol versioning (`fluiddeck.capture` v1).
- **Explicit limitation:** origin/nonce checks are integrity checks, NOT cryptographic authentication (2.7 correction). Alternatives: shared-secret pairing (deferred: no demonstrated threat; documented upgrade path to Phase 8+).

## ADR-011 — Ack Only After Dexie Commit (No False Save-Success)
- **Status:** Accepted | 2.1 §10, 2.3 §§3–5, 2.6 §§0–3
- Choice: ack produced after `transaction.oncomplete`; "Saved" toast only post-commit; "Queued" copy for outbox state. The system's core invariant.

## ADR-012 — Lightweight Layered Architecture (No ports-and-adapters)
- **Status:** Accepted | 2.1 §§0–1, 2.5 §2
- Choice: 3 boundaries only (storage/UI, queue/popup, bridge) where demonstrated; elsewhere direct calls. ports-and-adapters rejected: one storage engine, one search engine — no second adapter to justify interfaces.

## ADR-013 — TanStack Query + React Context + URL State
- **Status:** Accepted | 2.5 §4 | Related: FR-SRH-003/005
- Choice: 3 owners (Dexie canonical, TanStack over Dexie, URL params) + 4 small Contexts (theme, shell, dialog stack, toasts) + local `useState`. No Redux/Zustand/RHForm.
- Alternatives: Zustand/Redux (rejected: query+context suffices), single giant Context (rejected: anti-pattern documented), server-state pattern (rejected: no server).

## ADR-014 — URL-Parameter Navigation & Transient View State
- **Status:** Accepted | 2.5 §1, 2.2 D3 | Related: FR-SRH-003
- Choice: one route; query/filters/sort/selection in URL; only sort *preference* persisted (`preferences`). Hand-rolled (no React Router).
- Consequence: deep-linkable views; back/forward works; shareable URLs carry no sensitive data (2.7 §4).

## ADR-015 — Local-First + PWA App-Shell-Only Caching
- **Status:** Accepted | 2.6 §§1, 9, 2.1 §11 | Related: FR-PRI, FR-STO
- Choice: app-shell precache only (no runtime caching of extracted content); explicit capability table (offline: browse/search/organize/import/export/queue; network: open resource + thumbnails); first-visit-offline honestly impossible.

## ADR-016 — No Backend, Auth, Sync, or Telemetry in MVP
- **Status:** Accepted | 2.1 §§1, 10, 2.7 §8 | Related: FR-PRI-001/003
- Zero telemetry (in-memory ring buffer only), no network egress beyond user-initiated open/thumbnails, no accounts/auth, no cloud backup. Export JSON is the portability path.

## ADR-017 — Privacy-First: Least Privilege, Text-Only Rendering, Deferred Encryption
- **Status:** Accepted | 2.7 (whole) | Related: FR-PRI-001–003, NFR-SEC-001–005
- Choice: 4-permission extension; isolated world; text-only rendering; strict CSP proposal; http(s)-only URLs; import validation (DOMPurify+Zod+caps); encryption-at-rest **deferred to Phase 8+** (NFR-SEC-005) with documented residual risk (unencrypted IndexedDB, shared device). Consequences: no defense against OS/profile compromise in MVP; OS lock is the boundary.

## ADR-018 — WCAG 2.2 AA Target
- **Status:** Accepted | 2.8 §4, Phase 2.5 §8 | Related: NFR-ACC-001
- Choice: semantics-first, 4.5:1 text contrast, keyboard map (⌘K `/` `s` Esc-stack), focus trap/restore, live regions, 200% zoom, keyboard-equivalent drag paths. Testing: axe-core (automated, ~30–40% coverage) + Playwright keyboard e2e + manual NVDA/VO pass.

## ADR-019 — Performance Budgets (Proposed) and Deferred Optimizations
- **Status:** Proposed (targets, to be measured in Phase 4) | 2.8 §§1–3 | Related: NFR-PER-001–007
- Targets: startup ≤800ms cached, grid ≤500ms, search ≤50ms p95 (NFR-PER-004), import 1k ≤10s, export 10k ≤30s (streaming start), bundle ≤250KB JS gzip. Deferrals: workers, virtualization library, memoization — all gated behind measurement. Virtualization threshold: >500 DOM items (auto-triggered by 500-hit cap).

## ADR-020 — Migration & Recovery (Additive-Only, Quarantine-Not-Delete)
- **Status:** Accepted | 2.2 §3, 2.6 §§2, 5
- Choice: additive Dexie version upgrades (atomic, idempotent), boot integrity check (FR-STO-008), quarantine corrupt rows + restore-from-backup, guarded full-delete only (export-first, type-to-confirm). **No automatic destructive recovery ever.**
- Related: FR-STO-007/008, FR-PRI-002. U5 (30-day purge) is NOT decided by this ADR — see U-register.

**Status caveat:** ADR-019's numeric targets and ADR-009's retry values are **Proposed**; everything else is **Accepted** for Phase 3 planning. Product policies U1–U6 are not ADRs (unresolved, §U-register in the final review).
