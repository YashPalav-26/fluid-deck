# Fluid Deck — Sprint 6 (M7) Search Benchmark Report

*Date: 2026-11-11 · Scope: SEARCH-006 (Search/index performance benchmarking at 100, 1k, 5k, and 10k synthetic resources).*  
*Status: Complete · Next task: SEARCH-007 (Worker seam decision).*  
*Companions: `docs/SPRINT_6_IMPLEMENTATION_PLAN.md`, `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md`, `docs/architecture/PERFORMANCE_BUDGETS_AND_ACCESSIBILITY.md`, `docs/SPRINT_6_BENCHMARK_RESULTS.json`.*

---

## 1. Executive Summary

SEARCH-006 establishes an automated, reproducible in-browser benchmark harness (`e2e/search-benchmark.spec.ts`) measuring search indexing, query execution, faceted filtering, incremental mutation synchronization, memory, and bundle size across 100, 1,000, 5,000, and 10,000 synthetic resources.

All tests were executed in real Chromium with hardware and network throttling (CPU 4× slowdown proxying a low-tier mobile CPU, Slow 4G network emulation).

### Key Findings vs. Performance Budgets

| Metric | Target / Budget | Measured (10k) | Measured (1k) | Status | Input for SEARCH-007 |
|---|---|---|---|---|---|
| **Rebuild Time (10k)** | ≤ 500 ms | **6,212.5 ms** | 673.5 ms | **Exceeds** | **Triggers worker seam evaluation (12.4× target)** |
| **Query Latency (p95)** | ≤ 50 ms | **394.9–436.1 ms** (match)<br>**2.3 ms** (no-result) | **27.0–35.0 ms** | **Exceeds at 10k**<br>(Passes at 1k) | Worker offload isolates typing from search compute |
| **Facet Apply (p95)** | ≤ 50 ms | **3,438–4,462 ms** (single)<br>**6,238.9 ms** (combined) | **371–607 ms** | **Exceeds** | In-memory candidate intersection on throttled main thread |
| **Sort / Filter (p95)** | ≤ 50 ms | Included in query and facet samples; query **394.9–436.1 ms**, combined facet **6,238.9 ms** | Query **27.0–35.0 ms** | **Exceeds at 10k** | Sort/filter was not isolated as a separate sample; it runs inside the measured query/facet path |
| **Incremental Delete** | ≤ 50 ms | **14.6 ms** | 11.0 ms | **Passes** | `MiniSearch.discard` is fast O(1) term posting purge |
| **Incremental Create** | ≤ 50 ms | **616.6 ms** | 365.7 ms | **Exceeds** | Single-item index upsert includes context loading |
| **Initial JS Bundle** | ≤ 250 kB gzip | **208.30 kB gzip** | 208.30 kB gzip | **Passes** | 41.70 kB headroom under 250 kB budget |
| **500-Result Cap** | Max 500 returned | **500 / 10,000 (truncated)** | **500 / 1,000 (truncated)** | **Passes** | Hard cap strictly enforced with truncation metadata |

---

## 2. Test Environment & Methodology

### 2.1 Hardware and Runtime

- **Host Machine:** AMD Ryzen 7 7445HS (12 logical CPUs), 16 GB RAM, Windows 11 `10.0.26300` (x64)
- **Node.js:** v26.13.0
- **Browser:** Chromium `158.0.8127.18` / Playwright `1.65.0` (headless Chromium)
- **CPU Throttling:** Chrome DevTools Protocol (`Emulation.setCPUThrottlingRate: 4`) — 4× CPU slowdown, a low-tier mobile proxy rather than true Moto G4 hardware emulation.
- **Network Throttling:** Chrome DevTools Protocol (`Network.emulateNetworkConditions`): Slow 4G (2,000 ms RTT, 400 kbps download / 400 kbps upload).
- **Cache State:** The app page and benchmark modules are loaded before throttling and measured with a warm module cache; each scale starts from a fresh dedicated Dexie database. This is **not** a cold-cache browser measurement because throttled dynamic module fetches failed in this environment.
- **Execution Mode:** Headless in-browser execution with real IndexedDB (`Dexie v4`) and in-memory MiniSearch v7.2.0.

### 2.2 Dataset Design

Datasets are generated deterministically using a linear congruential generator (LCG) with state transition `(state * 1664525 + 1013904223) >>> 0` and seed `20261110 + n`:

- **Scale Progression:** 100 (smoke baseline), 1,000, 5,000, 10,000 synthetic resources.
- **Data Distribution:**
  - Resource Types: `article`, `video`, `other`, `tool` (uniform random).
  - Sources: `extension`, `import`, `share`, `other` (uniform random).
  - Domains: 50 distinct realistic synthetic domains (`domain1.example.com` ... `domain50.example.com`).
  - Collections: 10 parent collections with 9 child collections each (100 total hierarchical collections). 70% of resources assigned to a collection.
  - Tags: 200 distinct tags (`tag-1` ... `tag-200`). 1 to 3 tags assigned per resource.
  - Timestamps: Distributed across 365 days; `updatedAt` up to 30 days after `createdAt`.
  - Zero Real User Data: All titles, descriptions, and URLs are synthetic.

### 2.3 Timing and Measurement Protocol

1. **Isolation:** Seeding and IndexedDB batch insertion are completely excluded from timing.
2. **Warm-up:** A dry-run query pass warms the JIT compiler and module imports before timing measurements begin.
3. **High-Resolution Clock:** All metrics recorded via `performance.now()` in the browser page context.
4. **Sample Counts:**
   - Query Latency: 15 samples per query variant.
   - Facet Application: 15 samples per facet variant.
   - Resource Create / Update / Delete: 10 samples each.
   - Tag / Collection Rename: 5 samples each.
5. **Statistical Measures:** Minimum, Median (p50), 95th Percentile (p95), Maximum, and Arithmetic Mean.

---

## 3. Measured Results Across Scales

### 3.1 Startup Rebuild Time (Chunked, Post-Paint)

Measures `rebuildSearchIndex(db)` loading Dexie resources + join tables, deriving search documents, and adding them to MiniSearch in 200-document chunks yielding via `requestIdleCallback`/`setTimeout`:

| Scale (N) | Rebuild Time | Status | Document Count | Target |
|---|---|---|---|---|
| **100** | 107.2 ms | ready | 100 | ≤ 500 ms |
| **1,000** | 673.5 ms | ready | 1,000 | ≤ 500 ms |
| **5,000** | 3,022.4 ms | ready | 5,000 | ≤ 500 ms |
| **10,000** | **6,212.5 ms** | ready | 10,000 | ≤ 500 ms |

### 3.2 Search Query Latency

Measures `searchIndex(index, query, { limit: Infinity })` without facet filtering:

#### p95 by Scale (all query types)
| Query Type | 100 p95 | 1k p95 | 5k p95 | 10k p95 |
|---|---:|---:|---:|---:|
| **Exact** (`alpha`) | 5.7 ms | 27.2 ms | 157.5 ms | 394.9 ms |
| **Multi-Term** (`alpha beta`) | 3.5 ms | 33.3 ms | 172.7 ms | 393.4 ms |
| **Prefix** (`alph`) | 2.2 ms | 35.0 ms | 162.1 ms | 436.1 ms |
| **Fuzzy** (`alpa`) | 3.8 ms | 27.0 ms | 159.9 ms | 420.0 ms |
| **AND/OR Fallback** (`alpha omega`) | 3.7 ms | 31.0 ms | 170.9 ms | 414.5 ms |
| **No Result** (`zzzznotfound`) | 1.9 ms | 1.9 ms | 2.7 ms | 2.3 ms |

#### At 1,000 Resources (Scale = 1k)
| Query Type | Query Text | Min (ms) | p50 (ms) | p95 (ms) | Max (ms) | Mean (ms) | Target p95 |
|---|---|---|---|---|---|---|---|
| **Exact** | `"alpha"` | 14.8 | 23.6 | **27.2** | 27.2 | 21.9 | ≤ 50 ms |
| **Multi-Term** | `"alpha beta"` | 13.7 | 26.5 | **33.3** | 33.3 | 25.5 | ≤ 50 ms |
| **Prefix** | `"alph"` | 15.4 | 22.5 | **35.0** | 35.0 | 23.7 | ≤ 50 ms |
| **Fuzzy** | `"alpa"` | 14.9 | 22.9 | **27.0** | 27.0 | 22.2 | ≤ 50 ms |
| **AND/OR Fallback** | `"alpha omega"` | 15.4 | 26.5 | **31.0** | 31.0 | 24.6 | ≤ 50 ms |
| **No Result** | `"zzzznotfound"` | 0.8 | 1.4 | **1.9** | 1.9 | 1.4 | ≤ 50 ms |

*Result at 1k: All query types comfortably pass the 50 ms p95 budget (1.9 ms to 35.0 ms).*

#### At 10,000 Resources (Scale = 10k)
| Query Type | Query Text | Min (ms) | p50 (ms) | p95 (ms) | Max (ms) | Mean (ms) | Target p95 |
|---|---|---|---|---|---|---|---|
| **Exact** | `"alpha"` | 338.4 | 362.1 | **394.9** | 394.9 | 360.8 | ≤ 50 ms |
| **Multi-Term** | `"alpha beta"` | 340.2 | 355.7 | **393.4** | 393.4 | 356.8 | ≤ 50 ms |
| **Prefix** | `"alph"` | 328.4 | 363.0 | **436.1** | 436.1 | 370.1 | ≤ 50 ms |
| **Fuzzy** | `"alpa"` | 338.0 | 361.6 | **420.0** | 420.0 | 363.2 | ≤ 50 ms |
| **AND/OR Fallback** | `"alpha omega"` | 355.3 | 396.3 | **414.5** | 414.5 | 392.7 | ≤ 50 ms |
| **No Result** | `"zzzznotfound"` | 1.4 | 1.7 | **2.3** | 2.3 | 1.8 | ≤ 50 ms |

*Analysis:* Under 4× CPU throttling on 10k documents, broad matching queries return thousands of internal hits that undergo score ranking, sorting, and tie-breaking, taking ~360–435 ms. In contrast, no-result queries exit in 2.3 ms due to instant term dictionary miss.

### 3.3 Faceted Search Latency

Measures `searchFaceted(db, { q: "alpha", ...filters })` intersecting keyword search with Dexie indexed facet queries:

| Facet Condition | 100 Docs p50 / p95 | 1k Docs p50 / p95 | 5k Docs p50 / p95 | 10k Docs p50 / p95 |
|---|---|---|---|---|
| **Type** | 42.7 / 137.2 ms | 340.5 / 373.6 ms | 1,695.9 / 2,115.7 ms | 3,324.3 / 3,603.3 ms |
| **Source** | 43.4 / 63.5 ms | 336.5 / 371.3 ms | 1,674.2 / 2,080.4 ms | 3,304.3 / 3,438.6 ms |
| **Domain** | 39.3 / 45.9 ms | 316.4 / 610.0 ms | 1,560.2 / 1,939.3 ms | 3,121.1 / 3,545.3 ms |
| **Date Range** | 49.3 / 62.1 ms | 412.8 / 606.9 ms | 1,936.0 / 2,241.5 ms | 3,930.0 / 4,302.4 ms |
| **Collection Descendants** | 52.3 / 63.7 ms | 372.9 / 601.2 ms | 1,761.4 / 1,831.5 ms | 3,559.3 / 3,912.9 ms |
| **Tags OR** | 68.8 / 73.5 ms | 454.7 / 597.6 ms | 2,099.3 / 2,173.6 ms | 4,204.7 / 4,461.8 ms |
| **Unorganized** | 46.1 / 51.9 ms | 368.2 / 416.9 ms | 1,736.7 / 1,902.6 ms | 3,585.1 / 3,897.0 ms |
| **Combined (All Above)** | 101.2 / 109.9 ms | 630.1 / 746.2 ms | 2,865.3 / 2,965.7 ms | 5,825.8 / 6,238.9 ms |

*Analysis:* Facet filtering executes Dexie queries, expands collection trees, loads join tables (`resourceTags`, `resourceCollections`), and computes full candidate counts across all facets. At 10k rows on a throttled CPU, full join-table array iteration dominates execution time.

### 3.4 Incremental Update Latency

Measures single-mutation synchronization after durable Dexie commits:

| Operation | 100 Docs p50 / p95 | 1k Docs p50 / p95 | 5k Docs p50 / p95 | 10k Docs p50 / p95 |
|---|---|---|---|---|
| **Resource Create** | 44.3 / 69.5 ms | 168.2 / 365.7 ms | 307.1 / 338.6 ms | 572.3 / 616.6 ms |
| **Resource Update** | 43.0 / 69.0 ms | 161.4 / 183.0 ms | 328.1 / 352.5 ms | 631.3 / 733.5 ms |
| **Resource Delete** | **7.0 / 20.0 ms** | **6.7 / 11.0 ms** | **3.1 / 14.4 ms** | **2.1 / 14.6 ms** |
| **Tag Rename Sync** | 49.3 / 86.0 ms | 168.8 / 178.5 ms | 311.7 / 601.3 ms | 1,080.5 / 1,685.7 ms |
| **Collection Rename Sync** | 67.6 / 69.6 ms | 192.1 / 205.3 ms | 715.8 / 979.1 ms | 1,513.7 / 1,621.5 ms |

*Key finding:* Deletions are extremely fast (p95 ≤ 14.6 ms at 10k) because `MiniSearch.discard` removes doc postings without retokenizing. Creates and updates load context maps and retokenize, taking ~570–630 ms under 4× CPU throttling.

### 3.5 Memory Measurement and Limitations

- **Metric:** `performance.memory.usedJSHeapSize` recorded before and after rebuild in Chromium.
- **Measured Value:** `heapDelta` was `0` at every scale; the reported baseline was ~18.2 MB before and after. This is a whole-page V8 heap counter, not an index-specific measurement, and GC/bucketing makes small deltas unreliable.
- **Measurement Limitation (Honest Reporting):** The browser exposes no isolated per-index heap measurement. An index-only memory figure is **not measured and is not claimed** here. `performance.memory` reports the entire V8 runtime heap, influenced by browser internals, test harness fixtures, and GC timing.

### 3.6 Bundle Size Context

- **Build Tool:** Vite 7.3.7 production build (`pnpm --filter @fluid-deck/web build`)
- **Initial JS Raw:** 672.91 kB
- **Initial JS Gzip:** **208.30 kB**
- **Budget:** ≤ 250 kB gzip
- **Headroom:** **+41.70 kB** (16.7% headroom remaining)
- **Status:** **PASS**

---

## 4. Result Correctness and 500-Result Cap Validation

Every benchmark run validated functional correctness before recording metrics:

1. **Hit Accuracy:**
   - Exact query returned all matching documents (100 @ 100, 1000 @ 1k, 5000 @ 5k, 10000 @ 10k).
   - Multi-term, prefix, and fuzzy searches matched expected candidate sets.
   - AND-then-OR fallback triggered correctly for non-intersecting terms (`"alpha omega"`), setting `partial: true`.
   - Unknown query (`"zzzznotfound"`) returned 0 hits cleanly without error.
2. **Cap Enforcement:**
   - At 100 docs: Total 100, returned 100, `truncated: false`.
   - At 1,000 docs: Total 1,000, returned 500, `truncated: true`.
   - At 5,000 docs: Total 5,000, returned 500, `truncated: true`.
   - At 10,000 docs: Total 10,000, returned 500, `truncated: true`.

---

## 5. Input for SEARCH-007 (Worker Seam Decision)

Per `docs/architecture/PERFORMANCE_BUDGETS_AND_ACCESSIBILITY.md` §3 and `docs/SPRINT_6_IMPLEMENTATION_PLAN.md` §4:

> *"Only activate a Web Worker if measured build time at 10k exceeds 500 ms. Record the decision in the implementation report."*

### Quantitative Trigger Analysis
- **Threshold for Worker Evaluation:** Rebuild time > 500 ms at 10k.
- **Measured Rebuild Time (10k, throttled):** **6,212.5 ms** (Exceeds by 12.4×).
- **Measured Rebuild Time (1k, throttled):** **673.5 ms** (Exceeds by 1.35×).
- **Measured Query p95 (10k, throttled):** **~395 ms** (Exceeds 50 ms budget).

### Architectural Considerations for SEARCH-007
1. **Startup Non-Blocking Guarantee:** Currently, startup rebuild runs post-paint in chunks using `requestIdleCallback` (SEARCH-003). While this avoids freezing first paint, on a 4× throttled CPU, the 6.2s build consumes idle slices over several seconds.
2. **Worker Seam Feasibility:**
   - Moving MiniSearch indexing and query execution to a dedicated Web Worker would offload tokenization and posting-list work from the UI thread. That is the hypothesis to test in SEARCH-007, not a measured outcome here.
   - Structured-cloning and message-passing overhead were not measured in SEARCH-006; SEARCH-007 must measure them before claiming a net win.
   - Removing React render competition from the search thread may reduce query latency, but this benchmark did not isolate that effect.
3. **Recommendation for SEARCH-007:**
   - The condition for worker adoption is met. SEARCH-007 should evaluate a Web Worker seam for MiniSearch rebuild and query execution.

---

## 6. Reproducibility

The benchmark can be executed reproducibly with:

```bash
# 1. Ensure web app is built
pnpm --filter @fluid-deck/web build

# 2. Run Playwright benchmark spec
pnpm test:e2e e2e/search-benchmark.spec.ts
```

Results are saved to `docs/SPRINT_6_BENCHMARK_RESULTS.json`. The benchmark uses the repository's existing Playwright installation; no new dependency is required. The full four-scale run took ~15.5 minutes on the host above.

---

## M9-006 reconciliation (2026-11-14)

These are Sprint 6's own measurements, preserved with their raw artifacts (`docs/SPRINT_6_BENCHMARK_RESULTS.json`, `docs/SPRINT_6_BENCHMARK_WORKER_RESULTS.json`). They were not re-run in M9. The worker they motivated shipped later - see `docs/SPRINT_6_WORKER_DECISION.md` and `docs/M9_INTEGRATION_REPORT.md`.
