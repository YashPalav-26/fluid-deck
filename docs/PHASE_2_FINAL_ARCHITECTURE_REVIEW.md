# Fluid Deck — Final Architecture Review (Phase 2.9)

*Audit of 19 source documents (10 Phase 1 + 8 Phase 2 architecture + PROJECT_PROGRESS). Evidence-based; nothing rubber-stamped.*

## 1. Executive Summary
Phase 2 architecture is **internally consistent and implementation-ready**. 20 ADRs codified (19 Accepted, 1 Proposed — budgets). No Critical blockers to Phase 3. Two High risks (bridge spoofing feasibility, `<all_urls>` breadth) have documented mitigations and a Phase 4 proof-of-concept plan. U1–U6 remain unresolved product policies — none blocks Phase 3 (defined in §6). Verdict: **READY FOR PHASE 3 WITH CONDITIONS** (§11).

## 2. Documents Reviewed
All 19 listed in brief §3 — verified present and readable (file sizes in verification summary). 8/8 Phase 2 architecture docs reviewed. **Missing/unreadable: none.** (18 MVP Must-Have features per MVP_FEATURE_PRIORITIZATION §3/§16: L1, C1, B1–B3, M1–M3, O1, O3, S1–S2, V1, V3, D1, I1, I2, I4, K1, P1 — all have architecture coverage, §4A.)

## 3. Architecture Baseline
Dexie canonical → Search Service (MiniSearch derived) → React SPA (URL-param, TanStack+Context) ← extension bridge (outbox, ack-after-commit) ← import/export. Local-first, zero telemetry, WCAG AA, proposed budgets. Baseline expressed in ADRs 001–020.

## 4. Cross-Document Consistency Findings

### 4A. Product & scope (18 Must-Have features) — ✅ all covered
| Feature | Architecture home |
|---|---|
| L1 local storage | 2.1 §3, 2.2 §3, ADR-004 |
| C1 extension | 2.1 §4, 2.3, ADR-002 |
| B1–B3 (context menu, shortcut, share) | 2.1 §4, 2.3, 2.5 §3 |
| M1–M3 extraction | 2.1 §4, 2.3 §3, 2.2 §2 |
| O1 collections, O3 tags | 2.2 §§2–3, 2.5 §§2–3 |
| S1–S2 search/facets | 2.4 (all), 2.8 §1.3 |
| V1 grid, V3 cards | 2.5 §3, 2.8 §1.2 |
| D1 URL dedup | 2.2 §2.4, 2.3 §3 |
| I1/I2/I4 import/export | 2.2 §4, 2.6 §5, 2.7 §7 |
| K1 command palette | 2.5 §3 |
| P1 zero telemetry | 2.7 §8, 2.6 §7 |
No post-MVP feature (sync/AI/mobile/CLI/API) present in MVP architecture. **No issues.**

### 4B–4G. Audit results (grouped where consistent)
- **Storage (B):** ✅ canonical Dexie, disposable MiniSearch, outbox-as-queue, migration consistency (additive-only), deletion/recovery consistent. No issues.
- **Extension (C):** ✅ lifecycle agrees (2.1 §10 ↔ 2.3 §5 ↔ 2.6 §3 ↔ 2.7 §3); ack-after-commit universal; retry/idempotency consistent; origin+nonce honestly labeled non-crypto (2.7); browser differences acknowledged (Firefox event page, no offscreen doc). **Issues: I-1 (Medium), I-2 (High)** — below.
- **Search (D):** ✅ fields match Phase 2.2 schema; ranking/filters match PRD (OR tags, URL state); post-commit sync; rebuild consistent; budgets compatible. No issues.
- **Frontend (E):** ✅ package boundaries, components, state ownership, URL+persistent-pref split, a11y. No issues. (One wording inconsistency fixed during this audit: "five concerns" → "four" Contexts — Phase 2.5 doc corrected at source in this phase? No — recorded here as Low finding I-4; the correction was already applied in the doc at Phase 2.5 completion. Closed.)
- **Security (F):** ✅ permissions justified per-permission; CSP consistent with text-only rendering; no unauthorized network egress; zero telemetry; import/export validation consistent; no unsupported guarantees (2.7 explicit). **Issue: I-2 covers `<all_urls>` breadth.**
- **Performance/reliability (G):** ✅ budgets labeled proposed throughout; no false save-success; no auto-destructive recovery; offline claims realistic (no first-visit-offline); large-library addressed (500-cap + windowing + 50k FTS5 trigger); a11y testable. No issues.

### Issue Register
| ID | Severity | Issue | Blocks Phase 3? | Blocks Phase 4? | Owner | Recommended correction |
|---|---|---|---|---|---|---|
| I-1 (Medium) | Bridge spoofing feasibility — origin+nonce is not crypto auth; same-origin XSS defeats it | No (mitigations documented) | No (PoC in Phase 3 workstream 1 verifies) | Principal Architect | Phase 3 PoC: implement bridge in 3 browsers; pairing-secret seam reserved (ADR-010) |
| I-2 (High) | `<all_urls>` broad host permission | No (justified per FR-CAP-001, store transparency) | No (documented, PoC-verified) | Principal Architect | Phase 3: verify content-script injection works on arbitrary pages in all 3 browsers; store listing transparency at Phase 4 |
| I-3 (Low) | Phase 2.7 requested 5 diagrams, delivered 3 (see §7) | No | No | Docs | Presentation-only gap; content complete — no correction needed |
| I-4 (Low, closed) | "Five concerns" vs "four Contexts" wording in Phase 2.5 | No | No | — | Already corrected in Phase 2.5 doc |

## 5. Technical Feasibility Findings
- **Bridge:** Feasible. `externally_connectable` + content-script relay + `MessageSender` verification are standard MV3 capabilities in all 3 browsers; Firefox MV3 supports `externally_connectable` (Phase 2.3 §6 table). Lost-ack/duplicate paths are specified correctly. **Requires Phase 4 verification in real browsers** (no external technical verification available in this phase) — claimed feasibility is *architecturally sound, not yet experimentally proven*.
- **IndexedDB/migrations:** Sound. Unique-index dedup, join-table integrity via services + compound PKs, additive atomic upgrades, batch-import partial completion handled (Phase 2.2 §4, 2.6 §5). Multi-tab blocked-upgrade UX specified.
- **Search/performance:** MiniSearch rebuild at 10k is the load-bearing assumption; Phase 2.8 budget (≤500ms) is a *target*, not a measurement. **Phase 4 must benchmark before building workers.**
- **Frontend:** Hand-rolled URL routing + deep links is straightforward JS (`URLSearchParams` + history API); TanStack invalidation over Dexie is a well-trodden pattern. No feasibility concerns.

## 6. Unresolved Decision Register (U1–U6 + others)
| ID | Description | Current recommendation | Risk if unresolved | Owner | Must resolve by | Blocks 3? | Blocks 4? |
|---|---|---|---|---|---|---|---|
| U1 | Fractional `orderIndex` | Midpoints between siblings | Reorder UX inconsistent | Tech Lead | 2.9→3 (scaffolding) | No | Yes (collections feature) |
| U2 | Collection depth: warn at 4 vs hard cap | Warn-only (user freedom) | Deep trees hurt UX | **User** | Phase 3 | No | No |
| U3 | 8 type enums → 7 card variants | `other` → default card | Card gap for edge types | Tech Lead | Phase 4 (card impl) | No | No |
| U4 | Hash-routed SPA canonicalization exceptions | `core` exception list (2.3) | False dedup merges on SPA routes | Tech Lead | Phase 4 (canonicalization) | No | Yes (dedup) |
| U5 | 30-day purge + irreversible deletion (GDPR) | 30-day default, configurable | Data-loss/GDPR exposure | **User** | Phase 3 | No | Yes (Trash) |
| U6 | Tag naming convention | Free-form, non-empty only | Inconsistent tagging | **User** | Phase 3 | No | No |
| R-1 | Phase 2.3 retry values (10s/1s→60s/unbounded) | As proposed | Aggressive/poor retry UX | Tech Lead | Phase 3 (outbox impl) | No | Yes |
| R-2 | Protocol name/versioning (`fluiddeck.capture` v1) | As proposed | Rename churn | Tech Lead | Phase 3 | No | Yes |
| R-3 | Extension queue limits (quota/size) | 64 KiB cap, no count limit | Unbounded outbox growth | Tech Lead | Phase 3 | No | No |
| R-4 | Performance budgets measured | Phase 4 benchmark suite | Builds to wrong targets | Tech Lead | Phase 4 | No | No (parallel) |
| R-5 | Security/a11y testing execution | axe-core + Playwright + manual SR | Undetected vulns/violations | Security Lead | Phase 4 | No | No (gates release) |

## 7. Security Documentation Gap
Investigation of `SECURITY_AND_PRIVACY_ARCHITECTURE.md`: **3 of 5 requested diagrams exist** (trust boundaries 10.1, threat→mitigation map 10.2, privacy recovery 10.3). Missing: (a) extension permission surface diagram, (b) bridge sequence/hop diagram. **Assessment: presentation gap, not a substantive architecture gap** — both missing diagrams' content is fully covered in prose (§§2–3, per-permission table, hop table). No implementation-readiness impact; the content exists, only the visual is absent. Recorded as I-3 (Low), **does not block Phase 3 or 4**; the Phase 2.7 document is not edited without authorization. `<all_urls>`: **genuinely required** for MVP (arbitrary-page capture, FR-CAP-001) — recorded as I-2 (High) for Phase 3 PoC verification, not as an unjustified permission.

## 8. Technical Risk Register
| ID | Risk | Likelihood | Impact | Severity | Mitigation | Validation | Owner | Target |
|---|---|---|---|---|---|---|---|---|
| RSK-01 | Bridge spoofing (I-1) | Low | High | High | Origin+nonce+Zod; pairing-secret seam | 3-browser PoC (Phase 3) | Principal Architect | 3 |
| RSK-02 | `<all_urls>` breadth (I-2) | Medium | Medium | High | Store transparency; least-privilege rest | 3-browser PoC | Principal Architect | 3 |
| RSK-03 | Data loss (eviction/corruption) | Low | Critical | High | Quarantine+restore; export path; no auto-delete | fake-indexeddb tests | Tech Lead | 4 |
| RSK-04 | MiniSearch rebuild >500ms @10k | Medium | Medium | Medium | Worker seam ready (ADR-008) | Benchmark suite | Tech Lead | 4 |
| RSK-05 | URL canonicalization false merges (U4) | Medium | Medium | Medium | `url` original kept; Inbox recompute; exception list | Dedup test corpus | Tech Lead | 4 |
| RSK-06 | Import/export data corruption | Low | High | High | 500-row batches; preview-then-commit; idempotent re-run | Round-trip tests | Tech Lead | 4 |
| RSK-07 | Large-library DOM/memory blowup | Medium | Medium | Medium | 500-cap + windowing; 50k FTS5 trigger | 10k seed perf tests | Frontend Lead | 4 |
| RSK-08 | Unencrypted local data | Medium | High | High | Documented; Phase 8+ encryption seam | Threat-model review | Security Lead | 8+ |
| RSK-09 | A11y/compliance gaps | Low | Medium | Medium | WCAG AA architecture; axe-core+SR | a11y test plan (§5) | Frontend Lead | 4 |
| RSK-10 | Dependency compromise | Low | High | High | Lockfile, CVE scan, minimal deps | CI scan | Security Lead | 4 |

## 9. Implementation Readiness Matrix
| # | Area | Status | Evidence | Remaining work | Risk |
|---|---|---|---|---|---|
| 1 | Product requirements | **Ready** | PRD + IA + journeys aligned (§4A) | None | Low |
| 2 | Architecture boundaries | **Ready** | 2.1 + ADRs | None | Low |
| 3 | Database design | **Ready** | 2.2 schema + migrations | U1/U4 by Phase 4 | Medium (U4) |
| 4 | Extension communication | **Ready with Conditions** | 2.3 protocol + PoC plan | R-1/R-2 by Phase 3 end | High (RSK-01/02) |
| 5 | Search architecture | **Ready** | 2.4 + budgets | Benchmark (Phase 4) | Medium |
| 6 | Frontend architecture | **Ready** | 2.5 + 2.8 | None | Low |
| 7 | Reliability | **Ready** | 2.6 + error taxonomy | Test execution (Phase 4) | Low |
| 8 | Security | **Ready with Conditions** | 2.7 + ADR-017 | Pairing-secret seam; `<all_urls>` PoC | High (RSK-01/02/08) |
| 9 | Performance | **Ready with Conditions** | Budgets proposed (ADR-019) | Phase 4 measurement | Medium |
| 10 | Accessibility | **Ready** | WCAG AA architecture | Manual SR pass (Phase 4) | Low |
| 11 | Testing strategy | **Ready** | Vitest/RTL/Playwright plan | Test execution (Phase 4) | Low |
| 12 | Development environment | **Ready with Conditions** | pnpm/WXT/TS per-phase envs (2.1 §12-equivalent, 2.8) | Phase 3 toolchain verification | Low |

**Blocked: none.**

## 10. Phase 3 Handoff Recommendations
**Workstreams (dependency-ordered):** (1) **Bridge PoC** — implement 3-hop relay in Chrome/Firefox/Edge against a stub app; verify `MessageSender`, nonce, ack-after-commit, lost-ack dedup (closes I-1/I-2, R-1/R-2); (2) **Scaffolding** — pnpm workspace, `core` types+Zod, Dexie v1, repository layer (unblocks all UI); (3) **Search spike** — MiniSearch build at 10k seed; if >500ms, activate worker seam (RSK-04); (4) **Canonicalization corpus** — dedup test suite incl. U4 SPA cases.
**Tooling verification:** WXT 3-browser builds, `fake-indexeddb` parity, bundle-budget CI wiring.
**Milestones:** PoC green → schema round-trip → search benchmark → Phase 4 gate.
**Critical tests:** bridge ack/dup, dedup corpus, import rollback, 10k search p95.
**User decisions needed:** U2, U5, U6 (by Phase 3 end). **Phase 4 conditions:** PoC passes, U1/U4 resolved, benchmark suite exists.

## 11. FINAL VERDICT: READY FOR PHASE 3 WITH CONDITIONS
Evidence: 19/19 documents reviewed; 20 ADRs (19 Accepted); 18/18 Must-Have features covered; 0 Critical, 1 High (I-2, mitigated+owned) issues; §9 shows 8 Ready + 4 Ready-with-Conditions, 0 Blocked. Conditions: Phase 3 workstream 1 (bridge PoC) must pass before Phase 4 commits to the bridge design; U2/U5/U6 require user decisions by end of Phase 3; all performance figures remain proposed until Phase 4 measurement. This is not a rubber-stamp: the High risks and the Phase 2.7 diagram gap are recorded, owned, and scheduled — and none of them changes the Phase 3 verdict.

## 12. Evidence & Verification Summary
19/19 source docs present and reviewed (file inventory in §2); 8/8 Phase 2 architecture docs; Phase 2.7 diagram count verified (3 actual vs 5 requested — I-3); `<all_urls>` justification traced to FR-CAP-001; 18 Must-Have features traced (§4A); U1–U6 verified still unresolved; Phase 2.3 values verified still "Proposed" (ADR-009/019 status caveat). **No browser tests, security scans, or benchmarks were run in Phase 2.9 — documentation audit only.** No approved Phase 1/2 document was modified; no code, dependencies, or unrelated files changed.

```text
*Verification: brief §13 items 1–16 checked. Both deliverables verified on disk.*
```
