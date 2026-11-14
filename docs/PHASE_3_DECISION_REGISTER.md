# Fluid Deck — Phase 3 Decision Register

*Status: Pending unless noted. Never mark user-approved without actual approval.*
*History preserved: pre-PoC recommendations above; user confirmations appended below 2026-11-08 (pre-Phase-4 validation).*

## User Decisions (by end of Phase 3)
| ID | Decision (simple terms) | Recommendation | Options & consequences | Deadline | Blocks |
|---|---|---|---|---|---|
| U2 | Collections nested how deep? | Warn at 4, no hard cap (user freedom) | Warn-only: freedom + deep-tree UX risk / Hard cap: bad UX for power users / Soft cap 8: arbitrary | End of Phase 3 | UI-006 (M5) |
| U5 | Trash auto-deletes after 30 days? Irreversible? | 30-day default, configurable, explicit confirm | Keep: data-loss/GDPR exposure if wrong / No purge: unbounded growth / 90-day: same trade-off, slower | End of Phase 3 | UI-010, DB-005 |
| U6 | Tag naming rules? (e.g. lowercase, dashes) | Free-form, non-empty only | Free-form: inconsistent tags / Kebab-case enforced: friction, cleaner org / Lowercase-only: middle ground | End of Phase 3 | UI-007 |

## Tech Decisions (before affected Phase 4 work)
| ID | Decision | Recommendation | Deadline | Blocks |
|---|---|---|---|---|
| U1 | How do we store collection order? | Fractional `orderIndex` (midpoints) | Before M5 | UI-006 |
| U3 | 8 resource types vs 7 card variants | `other` → default card | Before UI-002 | M4 |
| U4 | Hash-routed SPA URLs: one resource or many? | `core` exception list (Phase 2.3) | Before M3 | DB-007 |
| R-1 | Extension retry (10s ack, 1s→60s backoff, unbounded) | As proposed | Before M6 | EXT-001 |
| R-2 | Protocol name/versioning (`fluiddeck.capture` v1) | As proposed | Before M6 | EXT-004 |
| R-3 | Extension queue limits (64 KiB cap, no count limit) | As proposed | Before M6 | EXT-001 |
| R-4 | Performance budgets → measured values | Phase 4 benchmark suite | M7 | SEARCH-006 |
| R-5 | Security/a11y test execution (axe-core + Playwright + SR) | As planned | M9 | TEST-003/004 |
| DEC-012 | Move project out of OneDrive? | Evaluate at M2 (sync latency) | M2 | SCAFFOLD-001 |
| DEC-013 | Node pin: keep v26 LTS (corrects stale audit C-1) | Keep; update audit | M0 | ENV-001 |

## Risks (from Phase 2.9 review §8)
RSK-01 bridge spoofing (High) → mitigations + PoC; owner: Principal Architect. RSK-02 `<all_urls>` (High) → store transparency + PoC. RSK-03 data loss (High) → quarantine/restore. RSK-04 MiniSearch @10k (Medium) → benchmark. RSK-05 canonicalization (Medium) → corpus. RSK-06 import corruption (High) → batches+preview. RSK-07 DOM blowup (Medium) → 500-cap+windowing. RSK-08 unencrypted local (High) → documented; Phase 8+ seam. RSK-09 a11y (Medium) → WCAG AA + SR pass. RSK-10 supply chain (High) → lockfile + CVE scan.


## M7 / Sprint 6 decisions (2026-11-10 preflight, user-approved)

Recorded during Sprint 6 (M7) preflight. These close the previously open M7 questions and are the authority for Sprint 6 implementation. Historical decisions above are unchanged.

| ID | Decision (simple terms) | Resolution | Blocks |
|---|---|---|---|
| M7-D1 | Where does search presentation live? | `apps/web/src/features/search/`; indexing stays in services (Phase 2.4 ownership) | UI-004 |
| M7-D2 | Dedicated search input vs existing ⌘K palette? | Both: dedicated shell search input **plus** existing Cmd/Ctrl+K palette, sharing one Search Service/index. `/` focuses dedicated search | UI-004 |
| M7-D3 | `?view=trash` outside core ViewState schema? | Extend core ViewState to support `view=trash` with backward-compatible URL round-trips during UI-004 (record now; implement in UI-004) | UI-004, CORE-002 |
| M7-D4 | Bundle strategy for MiniSearch? | Measure bundle first; code-split/lazy-load only if needed to meet initial JS ≤ 250 kB gzip | SEARCH-002, UI-004 |
| M7-D5 | Benchmark environment? | Slow 4G, Moto G4-class CPU, cold cache; document actual browser, throttling, hardware, and methodology | SEARCH-006 |
| SEARCH-007 | Activate a Web Worker for search indexing and keyword querying? | **ACTIVATED — worker optimization required.** Measured 10k rebuild is 6,212.5 ms, exceeding the ≤500 ms trigger by 12.4×; matching-query p95 is 394.9–436.1 ms and facet p95 is 3,438–6,239 ms. Worker scope is MiniSearch build/query/incremental mutation only; Dexie remains the persistence authority and facets remain database-driven. See `docs/SPRINT_6_WORKER_DECISION.md`. **Update (2026-11-14):** the worker shipped in SEARCH-008 and is committed - `apps/web/src/services/search.worker.ts`, `search-worker-core.ts` and `search-worker-protocol.ts` (M9-004, `40709ce`); the main-thread fallback remains the baseline path. | Future worker implementation task; SEARCH-008/UI-004 unaffected |

**Dependencies / technology:** MiniSearch `^7.2.0` is the only new dependency (ADR-007); install deferred to SEARCH-002. No workers, no virtualization library, no FTS5 until measured.

**SEARCH-007 amendment (2026-11-11):** The preflight assumption above ("No workers ... until measured") has now been measured. The 10k rebuild trigger is exceeded, so worker optimization is activated for a future implementation task. The worker is not expected to fix Dexie facet latency, and the 50 ms query/facet budgets remain unmet until separately optimized. **Update (2026-11-14):** the worker now exists and is committed - `apps/web/src/services/search.worker.ts` (`40709ce`), with `search-worker-core.ts` and `search-worker-protocol.ts` (M9-004); the browser test for the built worker needs the production preview server and is deferred to M9-040.

## User Confirmations (2026-11-08, pre-Phase-4 validation)

| ID | Decision | Status |
|---|---|---|
| U2 | Warn when collection nesting reaches four levels | ✅ User-approved |
| U5 | Configurable 30-day deleted-resource retention | ✅ User-approved |
| U6 | Free-form tag naming | ✅ User-approved |
| U1 | Fractional indexing for ordering | ✅ User-approved |
| U4 | Explicit URL canonicalization exception list | ✅ User-approved |
| DEC-012 | Keep project in current OneDrive location | ✅ User-approved |
| DEC-013 | Node.js 26 LTS selected candidate (subject to compatibility verification) | ✅ User-approved |
| R-1 | Extension retry policy: ACK timeout 10s; backoff 1s→60s exponential; unbounded count; FIFO queue; persist retry state across restarts; no aggressive retry loops; idempotent delivery; diagnostics for permanently unavailable receivers; ack only after durable persistence | ✅ User-approved (2026-11-08, final Phase 4 entry review) |
| R-2 | Capture protocol: `fluiddeck.capture` v1; existing envelope; four message types (`capture.deliver`, `capture.ack`, `capture.nack`, `capture.ready`) | ✅ User-approved (2026-11-08, final Phase 4 entry review) |
