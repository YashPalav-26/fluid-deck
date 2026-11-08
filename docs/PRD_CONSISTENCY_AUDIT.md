# PRD Consistency Audit — Fluid Deck

*Generated: 2026-11-07 | Phase: 1.8.1 | Audit of: docs/PRODUCT_REQUIREMENTS_DOCUMENT.md*

---

## 1. Audit Scope

Compared `docs/PRODUCT_REQUIREMENTS_DOCUMENT.md` against all Phase 1 source documents:
- `docs/PRODUCT_VISION.md` (Phase 1.1)
- `docs/COMPETITIVE_RESEARCH.md` (Phase 1.2)
- `docs/TARGET_USERS_AND_PERSONAS.md` (Phase 1.3)
- `docs/MVP_FEATURE_PRIORITIZATION.md` (Phase 1.4)
- `docs/INFORMATION_ARCHITECTURE.md` (Phase 1.5)
- `docs/USER_JOURNEYS_AND_WORKFLOWS.md` (Phase 1.6)
- `docs/TECHNICAL_DIRECTION_EVALUATION.md` (Phase 1.7)

---

## 2. Checks Performed

| Check Category | Items Verified |
|----------------|----------------|
| **Approved Product Decisions** | All 10 decisions from MVP_FEATURE_PRIORITIZATION §4 preserved |
| **MVP Must-Have Features** | All 18 features present with correct IDs and categories |
| **Should-Have / Future Features** | All 25 Should-Have, 9 Future features listed |
| **Functional Requirements** | 47 FRs traced to features, journeys, acceptance criteria |
| **Non-Functional Requirements** | 31 NFRs with measurable targets |
| **User Journeys** | 4 Critical MVP, 4 Important MVP, 4 Post-MVP documented |
| **Information Architecture** | Navigation hierarchy, content model, org rules match IA doc |
| **Search Technology** | **INCONSISTENCY FOUND** — see §3 |
| **Storage Architecture** | MVP = IndexedDB/Dexie (matches Tech Direction) |
| **Extension Architecture** | Manifest V3, Chrome/Firefox/Edge, Safari deferred (matches) |
| **Traceability Matrix** | All 18 MVP features traced to problems, journeys, criteria |
| **Acceptance Criteria** | 53 verifiable criteria across 10 categories |
| **Metrics** | All 25 metrics labeled as hypotheses |
| **Open Questions** | 5 approval decisions, 7 Phase 2 deferred, 9 unresolved |

---

## 3. Inconsistencies Found

### 3.1 CRITICAL: Search Technology for MVP

| Location | Current PRD Statement | Source Document Truth |
|----------|----------------------|----------------------|
| **Section 13.1** (Keyword Search MVP) | "Engine: SQLite FTS5 virtual table" | **TECHNICAL_DIRECTION_EVALUATION.md §4.2**: "MVP Recommendation: MiniSearch + Faceted Filters" |
| **Section 8.4, FR-SRH-001** | "System SHALL provide full-text keyword search via SQLite FTS5" | **TECHNICAL_DIRECTION_EVALUATION.md §4.2**: MiniSearch for MVP; FTS5 at Phase 8+ |
| **Section 8.4, FR-SRH-001 Acceptance Criteria** | "<200ms p95" (implies FTS5) | MiniSearch achieves <50ms for 10k in-memory |
| **Section 9.1, NFR-PER-004** | "Search latency (FTS5, p95) <200ms" | Should reference MiniSearch, not FTS5 |
| **Section 23.2, Row 3 (Search MVP)** | "MiniSearch in-memory + faceted filters — Provisional (migrate Phase 8+)" | **CORRECT** — matches Tech Direction |
| **Section 23.2, Row 4 (Search Phase 8+)** | "SQLite FTS5 native — Provisional" | **CORRECT** — matches Tech Direction |

**Root Cause**: PRD Sections 8.4, 13.1, and 9.1 were written with FTS5 as the MVP search engine, but Phase 1.7 Technical Direction Evaluation (completed after PRD draft) explicitly recommends MiniSearch for MVP with FTS5 migration at Phase 8+.

**Impact**: If implemented as written, the MVP would require SQLite WASM + OPFS (for FTS5) instead of IndexedDB + Dexie, contradicting the approved storage decision and adding ~800KB WASM bundle.

---

### 3.2 MINOR: Storage Description in Section 8.1

| Location | Current PRD Statement | Source Document Truth |
|----------|----------------------|----------------------|
| **Section 8.1, FR-STO-001** | "System SHALL provide local-first persistence using IndexedDB (PWA) or SQLite (desktop)" | Tech Direction §3.3: MVP = IndexedDB (Dexie.js) for web app; Extension uses `chrome.storage.local` queue only. SQLite desktop is Phase 8+ (Tauri). |

**Impact**: Low — "or SQLite (desktop)" is technically accurate as a Phase 8+ path but could confuse MVP implementation.

---

### 3.3 MINOR: MVP Feature List — Missing O3 (Tags with Autocomplete)

| Location | Current PRD Statement | Source Document Truth |
|----------|----------------------|----------------------|
| **Section 7.1 Must-Have Features Table** | Lists 18 features: L1, C1, M1, M2, M3, O1, O3, S1, S2, V1, V3, D1, I1, I2, I4, K1, B1, P1 | **MVP_FEATURE_PRIORITIZATION.md**: O3 "Tags with autocomplete" scores 12 (Must-Have threshold) and is in Must-Have table row 170 |

**Correction**: O3 is present in PRD Section 7.1 table (row 169) — **VERIFIED PRESENT**. No inconsistency.

---

## 4. Corrections Applied to PRD

### 4.1 Section 8.4 — FR-SRH-001 (Search Requirement)

**Before:**
```
| FR-SRH-001 | System SHALL provide full-text keyword search via SQLite FTS5 | Searches title, URL, description, tags, extracted content; <200ms p95 | S1, L1 |
```

**After:**
```
| FR-SRH-001 | System SHALL provide full-text keyword search via MiniSearch (in-memory index) | Searches title, URL, description, tags, extracted content; <50ms p95 at 10k resources | S1, L1 |
```

### 4.2 Section 9.1 — NFR-PER-004 (Search Latency)

**Before:**
```
| NFR-PER-004 | Search latency (FTS5, p95) | <200ms | Client-side measurement |
```

**After:**
```
| NFR-PER-004 | Search latency (MiniSearch, p95) | <50ms at 10k resources | Client-side measurement |
```

### 4.3 Section 13.1 — Keyword Search (MVP)

**Before:**
```
### 13.1 Keyword Search (MVP)
- Engine: SQLite FTS5 virtual table
- Indexed fields: title, URL, description, tags, extracted content
- Features: Prefix search, fuzzy tolerance, field boosting
- Performance: <200ms p95 at 10k resources
```

**After:**
```
### 13.1 Keyword Search (MVP)
- Engine: MiniSearch (in-memory index rebuilt on app load from IndexedDB)
- Indexed fields: title, URL, description, tags, extracted content
- Features: Prefix search, fuzzy search, field boosting, filter functions
- Performance: <50ms p95 at 10k resources; index build ~50ms
- Migration path: Replace with SQLite FTS5 native at Phase 8+ (same query API)
```

### 4.4 Section 8.1 — FR-STO-001 (Storage Requirement) — Clarification

**Before:**
```
| FR-STO-001 | System SHALL provide local-first persistence using IndexedDB (PWA) or SQLite (desktop) | Data persists across browser/app restarts; no network required for CRUD | L1 |
```

**After:**
```
| FR-STO-001 | System SHALL provide local-first persistence using IndexedDB via Dexie.js (PWA) | Data persists across browser/app restarts; no network required for CRUD; Extension uses chrome.storage.local for offline capture queue only | L1 |
```

---

## 5. Unresolved Issues (No Correction Needed — Documented for Transparency)

| Issue | Status | Notes |
|-------|--------|-------|
| **Desktop framework for Phase 8+** | Requires user approval | Tauri vs Electron vs PWA-only (PRD §20.1, §23.3) |
| **SQLite WASM migration timing** | Requires user approval | Phase 8 (validated) vs Phase 6 (parallel) |
| **Safari extension** | Requires user approval | MVP vs Phase 8+ (deferred) |
| **Self-hosted sync server** | Requires user approval | Phase 8+ vs Phase 10+ |
| **Local encryption at rest** | Requires user approval | MVP (P2) vs Phase 8+ |
| **Undo toast duration** | Unresolved product question | 5s vs 10s vs persistent (PRD §20.4) |
| **Auto-purge default (30 days)** | Unresolved | GDPR considerations |
| **Duplicate modal default action** | Unresolved | "Add to current collection" vs "Skip" |
| **Collection depth limit** | Unresolved | Hard limit at 3 vs soft warning |
| **Tag naming convention** | Unresolved | kebab-case vs free-form |

---

## 6. Verification Results

| Verification | Result |
|--------------|--------|
| All 10 approved product decisions preserved | ✅ PASS |
| All 18 MVP Must-Have features present with correct specs | ✅ PASS |
| All 25 Should-Have features correctly categorized | ✅ PASS |
| All 9 Future features correctly categorized | ✅ PASS |
| 47 Functional Requirements traceable to features | ✅ PASS |
| 31 Non-Functional Requirements with measurable targets | ✅ PASS |
| 4 Critical MVP Journeys documented | ✅ PASS |
| 53 Acceptance Criteria verifiable | ✅ PASS |
| Traceability matrix covers all 18 MVP features | ✅ PASS |
| All metrics labeled as hypotheses | ✅ PASS |
| Search technology inconsistency **FIXED** | ✅ FIXED |
| Storage description clarified | ✅ FIXED |

---

## 7. Verdict

**PRD STATUS: CONSISTENT WITH CORRECTIONS APPLIED**

The PRD is now consistent with all Phase 1 source documents after applying the 4 corrections in §4. The single critical inconsistency (search technology) has been resolved to match the Phase 1.7 Technical Direction Evaluation recommendation: **MiniSearch for MVP, SQLite FTS5 at Phase 8+**.

All approved product decisions, MVP feature scope, user journeys, information architecture, and acceptance criteria are preserved and traceable.

**Next Step**: Await user review and explicit approval of corrected PRD before proceeding to Phase 1.9 (Architecture & Database Schema).

---

## 8. Documents Updated

- `docs/PRODUCT_REQUIREMENTS_DOCUMENT.md` — 4 corrections applied (Sections 8.1, 8.4, 9.1, 13.1)
- `docs/PRD_CONSISTENCY_AUDIT.md` — This document
- `docs/PROJECT_PROGRESS.md` — Phase 1.8.1 marked complete