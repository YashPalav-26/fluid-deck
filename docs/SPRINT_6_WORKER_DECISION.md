# Fluid Deck — Sprint 6 (M7) SEARCH-007 Worker Decision

*Date: 2026-11-11 · Scope: SEARCH-007 (Web Worker activation decision only).*  
*Status: **ACTIVATED — worker optimization required.** No worker source exists yet; this document records the decision, design boundary, and the separate implementation work needed later.*  
*Companions: `docs/SPRINT_6_BENCHMARK_REPORT.md`, `docs/SPRINT_6_BENCHMARK_RESULTS.json`, `docs/SPRINT_6_IMPLEMENTATION_PLAN.md`, `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md`, `docs/architecture/PERFORMANCE_BUDGETS_AND_ACCESSIBILITY.md`, `docs/PHASE_3_DECISION_REGISTER.md`.*

---

## 1. Decision

**ACTIVATED.** The measured 10k rebuild time is **6,212.5 ms**, exceeding the documented **500 ms** worker trigger by **12.4×**. The worker optimization is therefore required and approved in principle.

What is activated is the **decision**, not an implementation:

- No worker file, adapter, feature flag, or production optimization was added in SEARCH-007.
- The current main-thread search path remains the only implemented path.
- A future, separately authorized task must implement and benchmark the worker.

The worker is expected to remove CPU-intensive MiniSearch work from the UI thread. It is **not** expected to make Dexie facet scans faster, and it does not by itself close the 50 ms query or facet budgets.

---

## 2. Measured Evidence vs Assumptions

### 2.1 Measured in SEARCH-006

Environment: headless Chromium `158.0.8127.18`, 4× CPU throttling, Slow 4G emulation, warm module cache, fresh Dexie database per scale. Not true Moto G4 hardware and not a cold-cache run.

| Metric at 10k | Measured | Budget | Result |
|---|---:|---:|---|
| Full index rebuild | **6,212.5 ms** | ≤500 ms | **Exceeds** |
| Query p95 (matching queries) | **394.9–436.1 ms** | ≤50 ms | **Exceeds** |
| Facet apply p95 (single) | **3,438.6–4,461.8 ms** | ≤50 ms | **Exceeds** |
| Facet apply p95 (combined) | **6,238.9 ms** | ≤50 ms | **Exceeds** |
| Incremental delete p95 | **14.6 ms** | ≤50 ms | **Passes** |
| Incremental create p95 | **616.6 ms** | not met at 10k | **Exceeds** |
| Incremental update p95 | **733.5 ms** | not met at 10k | **Exceeds** |
| Initial JS gzip | **208.30 kB** | ≤250 kB | **Passes** |
| 500-result cap | **500 returned / 10,000 total** | ≤500 | **Passes** |

Full per-scale p50/p95 and incremental mutation timings are in `docs/SPRINT_6_BENCHMARK_RESULTS.json`.

### 2.2 Assumptions — not measured in SEARCH-006

These are design expectations that the future worker implementation must measure:

- Structured-clone cost for build documents and query hit descriptors is small relative to the measured rebuild cost.
- Moving MiniSearch into a worker keeps the UI responsive while the worker computes.
- A worker round-trip adds messaging overhead that remains acceptable for query and mutation acknowledgement.
- Vite's module-worker output works in the supported browsers and does not increase initial JS gzip beyond the 250 kB budget.
- The existing tokenizer and MiniSearch public API can run unchanged inside a module worker.

No numeric claim is made for these until measured.

---

## 3. Narrow Worker Responsibility

### Worker owns

- One MiniSearch instance.
- MiniSearch index construction from serialized search documents.
- Keyword query execution, ranking, exact-title tie-break, and deterministic tie-breaks.
- Incremental MiniSearch upsert/remove operations.
- Minimal ranking metadata needed for sorting: `id`, `title`, `updatedAt`, `score`, `matchedTerms`.

### Worker does **not** own

- Dexie or IndexedDB access. Dexie remains the persistence authority.
- Resource CRUD, joins, tags, collections, or schema logic.
- Facet candidate discovery, collection descendant expansion, facet counts, or result capping. Those remain database/service responsibilities on the main thread.
- URL state, React state, or UI rendering.
- Durable mutation acknowledgement. A worker ACK means the in-memory index changed, not that data was saved.

### Why this boundary

A worker that also scans Dexie would duplicate persistence ownership and add a second database-access path. That conflicts with ADR-004 (Dexie canonical storage) and ADR-012 (no second adapter without demonstrated need). Facet latency is dominated by Dexie scans and join-table iteration, so moving MiniSearch alone cannot fix it.

---

## 4. Ownership: Worker Owns the MiniSearch Instance

**Decision: the worker owns the MiniSearch instance.** The main thread sends serialized search documents, not a serialized MiniSearch index.

Reasons:

1. MiniSearch is derived and disposable (ADR-007/008). There is no reason to serialize its inverted index, term maps, or internal caches.
2. The worker can mutate its instance directly for SEARCH-004 incremental upserts/removals without shipping index internals back and forth.
3. The main thread keeps ownership of `Resource` objects and Dexie. The worker stores only what it needs to search and sort.
4. Query responses return hit descriptors, not full `Resource` objects. The main thread maps IDs to resources. For faceted search, an `idsOnly` response avoids cloning thousands of resources across the boundary.

The worker's document shape extends the existing search document with ranking metadata:

```ts
type WorkerSearchDocument = {
  id: string;
  title: string;
  tagsText: string;
  description: string;
  urlText: string;
  collectionsText: string;
  typeText: string;
  updatedAt: number; // ranking tie-break only
};
```

This is a design shape, not an implemented type. The existing `SearchDocument` and `buildSearchDocument` remain the source of truth.

---

## 5. Typed Protocol (Design Only)

Protocol version is explicit. Every request has a `requestId`; build and mutation messages carry a version or build identifier. The protocol is internal to the web app and is not a network or extension protocol.

```ts
type SearchWorkerRequest =
  | { type: "init"; requestId: number; protocolVersion: 1 }
  | { type: "build:start"; buildId: string; baseVersion: number; total: number }
  | { type: "build:chunk"; buildId: string; seq: number; documents: WorkerSearchDocument[] }
  | { type: "build:commit"; buildId: string; baseVersion: number }
  | { type: "build:cancel"; buildId: string }
  | {
      type: "query";
      requestId: number;
      indexVersion: number;
      q: string;
      limit: number;
      idsOnly: boolean;
    }
  | { type: "mutate"; requestId: number; indexVersion: number; op: "upsert"; document: WorkerSearchDocument }
  | { type: "mutate"; requestId: number; indexVersion: number; op: "remove"; id: string }
  | { type: "mutate:batch"; requestId: number; indexVersion: number; upserts: WorkerSearchDocument[]; removals: string[] }
  | { type: "shutdown"; requestId: number };

type SearchWorkerResponse =
  | { type: "ready"; protocolVersion: 1 }
  | { type: "build:progress"; buildId: string; done: number; total: number }
  | { type: "build:done"; buildId: string; indexVersion: number; documentCount: number }
  | {
      type: "query:result";
      requestId: number;
      indexVersion: number;
      partial: boolean;
      hits: Array<{ id: string; score: number; matchedTerms: string[] }>;
      truncated: boolean;
    }
  | { type: "mutation:ack"; requestId: number; indexVersion: number }
  | { type: "error"; requestId?: number; code: WorkerErrorCode; message: string; retryable: boolean };

type WorkerErrorCode =
  | "NOT_READY"
  | "PROTOCOL_MISMATCH"
  | "STALE_VERSION"
  | "STALE_BUILD"
  | "INVALID_MESSAGE"
  | "BUILD_FAILED"
  | "QUERY_FAILED"
  | "MUTATION_FAILED"
  | "CANCELLED";
```

### Message flow

1. Main creates the worker after first paint or on first search need.
2. Main sends `init`; worker replies `ready` or `PROTOCOL_MISMATCH`.
3. Main captures the current index version and starts `build:start`.
4. Main sends `build:chunk` messages of about 200 documents, matching the existing chunk size.
5. Worker emits `build:progress`; main updates the existing "Indexing…" state.
6. Main sends `build:commit` only if no source-write invalidated the snapshot.
7. Worker atomically swaps in the new index, increments the version, and replies `build:done`.
8. Query: main sends `query` with the committed `indexVersion`; worker returns hit descriptors. Main discards any response whose version or request ID is stale.
9. Mutation: after the Dexie commit, main sends `mutate` or `mutate:batch`; worker applies in order and ACKs the new version.
10. Cancellation: main sends `build:cancel` or ignores a canceled `requestId`. A synchronous MiniSearch query cannot be interrupted mid-call; cancellation is latest-wins at the main-thread boundary.

### Initialization and readiness

- `idle` → worker created → `ready` → `indexing` → `ready` after `build:done`, or `error`.
- Queries before the first `build:done` return `NOT_READY`; the UI keeps the existing cold-start "Indexing…" behavior.
- A worker failure marks the index unavailable; the main thread falls back to the current main-thread path or rebuilds on a fresh worker, depending on the failure class.

### Error handling

- Invalid or unknown messages: `INVALID_MESSAGE`, no state change.
- Version mismatch: `STALE_VERSION`, no state change; main treats the response as stale.
- Build failure: `BUILD_FAILED`; discard the partially built instance.
- Worker crash/termination: main terminates the worker, creates a new one, and rebuilds from Dexie. The old index is disposable by design.
- Repeated crash: stop automatic restart and expose the existing `error` state; do not loop indefinitely.

### Termination/restart

- Normal shutdown sends `shutdown` then terminates the worker.
- No persistence of worker state across sessions; rebuild on every startup remains the contract.
- A restart always starts from Dexie, never from a serialized worker index.

---

## 6. Consistency and SEARCH-004 Synchronization

### Versioned build snapshots

- Every committed build and every mutation increments a monotonically increasing `indexVersion`.
- A build starts from `baseVersion`. `build:commit` must match the worker's current `baseVersion`; otherwise it is rejected as `STALE_BUILD`.
- Query and mutation requests include the version they expect. A mismatch is rejected or discarded; the main thread never applies a stale result to a newer index.

### Writes during build

The existing main-thread implementation restarts a build if any write lands during it. The worker design can do better without weakening consistency:

1. Capture `baseVersion` and a mutation sequence before loading source rows.
2. Load resources and join data on the main thread. If a write lands before the source snapshot is complete, abort and restart the build, matching current behavior.
3. Once the source rows are loaded, writes are post-snapshot deltas. Queue them in order.
4. Commit the new index, then apply the queued upserts/removals in mutation order.
5. If the queue cannot be applied, discard the new index and rebuild from Dexie.

No long-lived IndexedDB transaction is held across the build. Dexie remains the source of truth; the worker index is disposable.

### Ordering and idempotency

- Mutations are applied in the order the main thread observed committed Dexie writes.
- Upsert is idempotent by resource ID: `add` if absent, `replace` if present.
- Remove is idempotent: discarding an absent ID is a no-op.
- Batch mutations preserve per-resource order and are applied atomically from the worker's perspective.
- Duplicate or retried mutation messages with the same version are rejected as stale rather than applied twice.

### SEARCH-004 boundary

SEARCH-004 already synchronizes the index after durable Dexie commits. The worker adapter keeps that boundary:

- The main thread calls the repository first.
- Only after the Dexie transaction commits does it send the worker mutation.
- Worker ACK updates the in-memory index only; it is never treated as a save acknowledgement.
- If the worker fails after the Dexie commit, the durable data is intact; rebuilding from Dexie restores search.

---

## 7. Platform Evaluation

### Vite worker bundling

Use Vite's native module-worker form in a future implementation:

```ts
new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
```

- Vite emits the worker as a separate asset/chunk.
- Instantiate lazily after first paint so the initial JS budget is unaffected.
- Moving `minisearch` into the worker chunk should reduce the main chunk, but this must be measured.
- No worker bundling plugin or dependency is needed.

### Shared tokenizer

`tokenize` and `SEARCH_FIELD_WEIGHTS` live in `packages/core`, import no browser globals, and are safe to import in a module worker. The worker must use the same tokenizer as the main-thread path; a second tokenizer implementation would be a correctness defect.

### MiniSearch module loading

MiniSearch `^7.2.0` is already installed and has no DOM dependency. It can be imported in the worker module. No new dependency is required.

### Structured-clone costs

The protocol avoids the worst cases:

- Build sends plain search documents in ~200-document chunks, not the MiniSearch index.
- Query returns `{id, score, matchedTerms}` descriptors, not full `Resource` objects.
- Facet queries use `idsOnly: true`, so the worker does not clone thousands of resources for intersection.

The remaining clone costs are unmeasured. The future benchmark must measure send/receive time and total query round-trip, not assume they are negligible.

### CSP and browser support

- The web app currently has no CSP that blocks module workers.
- If a CSP is added later, it must include `worker-src 'self'`.
- Module workers are supported in current Chromium, Firefox, and Safari. The WXT extension background is not involved; this is the `apps/web` SPA.
- Feature-detect worker construction. If unavailable, use the existing main-thread path rather than breaking search.

### Fallback behavior

- Worker unsupported or construction fails: use the current main-thread search/index implementation.
- Worker crashes: terminate, rebuild on a fresh worker; after a bounded number of failures, fall back to the main-thread path and report the degraded state.
- Worker returns protocol/version errors: do not apply the response; rebuild or fall back.
- No silent fallback that claims the worker is active when it is not.

---

## 8. Query and Facet Bottlenecks Are Separate

### Query bottleneck

**Measured:** 10k matching-query p95 is 394.9–436.1 ms. The cost is MiniSearch scoring, result materialization, and deterministic sorting/tie-breaking over a large candidate set. The no-result path is 2.3 ms.

**Worker effect:** removes this CPU work from the UI thread. It does **not** guarantee a 50 ms query result; the worker still performs the same computation, and messaging adds overhead.

**Next measured optimizations (not implemented):**

- Avoid `limit: Number.MAX_SAFE_INTEGER` in the facet path; request `idsOnly` and intersect before materializing resources.
- Measure MiniSearch search options and candidate ordering before changing ranking rules.
- Reduce repeated normalization/comparison work in tie-breaks.
- Consider a smaller stored-field set only if measurement shows clone/sort cost is material.

### Facet bottleneck

**Measured:** 10k facet p95 is 3,438.6–4,461.8 ms single and 6,238.9 ms combined. The cost is Dexie queries, full join-table scans (`resourceTags`, `resourceCollections`), descendant expansion, and facet counts.

**Worker effect:** none by itself. Dexie/IndexedDB remains on the main thread. Moving MiniSearch to a worker cannot make these scans faster.

**Next measured optimizations (not implemented):**

- Stop re-reading full join tables per facet; use indexed lookups or a single consistent join snapshot.
- Avoid duplicate `resourceCollections` scans between candidate collection and unorganized/count computation.
- Compute facet counts from the already-loaded candidate set instead of re-scanning joins.
- Measure compound indexes only if the existing schema can support the access pattern; schema changes are outside SEARCH-007 and need separate review.

### Incremental bottleneck

**Measured:** delete p95 is 14.6 ms (passes); create/update p95 is 616.6/733.5 ms at 10k; tag/collection rename p95 is 1,685.7/1,621.5 ms.

**Worker effect:** MiniSearch upsert/remove is only part of the cost. The main thread still loads context and join data from Dexie. The worker may reduce the index-update portion but will not fix the dominant context-loading cost.

**Next measured optimizations (not implemented):**

- Avoid loading all four tables for a single-resource context refresh.
- Scope join reads to the affected resource IDs.
- Measure worker batch updates for tag/collection renames before claiming an improvement.

---

## 9. Acceptance Targets for a Future Worker Implementation

These are **targets for the future task**, not results. The 50 ms query and facet budgets remain unmet until separately optimized.

| Area | Target | Notes |
|---|---|---|
| Build main-thread blocking | Longest main-thread task ≤50 ms during 10k build | Worker must keep tokenization/index construction off the UI thread |
| Build completion | ≤6,212.5 ms at 10k, no regression | Total worker time may remain similar; responsiveness is the primary win |
| Build progress | Progress messages visible at least every 200 documents | Existing "Indexing…" state |
| Query main-thread blocking | ≤16 ms per query | Worker computes off-thread; UI remains responsive |
| Query round-trip | p95 ≤ baseline p95 + 25 ms messaging overhead | Does **not** claim the 50 ms query budget |
| Facet main-thread work | No worse than baseline | Worker is not expected to fix Dexie facet scans |
| Incremental delete | p95 ≤50 ms at 10k | Preserve current pass |
| Incremental create/update | p95 ≤ baseline (616.6/733.5 ms) | Measure worker ACK plus context load; do not claim a win without data |
| Stale results | Zero applied stale responses | Version + request-ID rejection |
| Lost mutations | Zero lost post-commit mutations | Queue/order/idempotency checks |
| Initial JS gzip | ≤250 kB | Worker chunk separate; report initial and total JS gzip |
| Fallback | Search remains usable if worker fails | Main-thread path or bounded rebuild |

---

## 10. Before/After Benchmark Plan

Reuse the existing harness and environment; do not add a benchmark dependency.

1. **Baseline:** keep `docs/SPRINT_6_BENCHMARK_RESULTS.json` unchanged as the pre-worker evidence.
2. **Same conditions:** headless Chromium, 4× CPU throttling, Slow 4G, warm module cache, fresh Dexie database per scale, seeds `20261110 + n`, same query/facet corpus.
3. **Scales:** 100, 1,000, 5,000, 10,000.
4. **Add measurements in the future task:** main-thread long tasks via `PerformanceObserver`, worker build chunk send/receive time, query round-trip, mutation ACK, structured-clone payload sizes, worker chunk gzip.
5. **Modes:** run the current main-thread path and the worker path with the same seeds and environment. At least three runs per mode; report p50/p95 and variability.
6. **Correctness gate:** exact results, fallback/partial behavior, 500 cap, no stale versions, no lost mutations.
7. **Budget report:** compare against the original budgets without redefining them. Explicitly report that query/facet budgets remain unmet if they do.

No timing assertion is added to ordinary unit tests; the benchmark remains a report.

---

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Structured-clone cost is larger than expected | Measure build/query payloads; send documents in chunks; return hit descriptors and `idsOnly` for facets |
| Worker query still exceeds 50 ms | Treat worker as responsiveness fix; optimize query separately |
| Facet latency unchanged | Keep facet work on main thread; plan separate measured optimization |
| Stale results applied after a rebuild | Version + request-ID rejection; latest-wins at the main boundary |
| Writes during build overwrite committed data | Snapshot boundary + queued post-commit deltas + rebuild on failure |
| Worker crash loses the index | Index is disposable; rebuild from Dexie; bounded restart then fallback |
| Bundle grows past 250 kB initial | Worker chunk separate; instantiate lazily; measure initial and total gzip |
| CSP blocks worker | Add `worker-src 'self'` only if a CSP is introduced; feature-detect and fall back |
| Tokenizer drift between threads | Import the same `@fluid-deck/core` tokenizer; one implementation |
| Development/production worker differences | Test Vite dev and production preview; verify worker asset loading |
| Extension confusion | This worker belongs to `apps/web`, not the WXT extension background |

---

## 12. Implementation Boundary

This decision does **not** authorize:

- Worker source code, adapter code, or a feature flag.
- Production search/facet optimization.
- Facet rewrite, new indexes, or schema migrations.
- New dependencies.
- UI-004, SEARCH-008, or unrelated refactors.
- Staging, commits, pushes, or remote operations.

A future implementation task must be separately authorized and must include:

- `apps/web/src/services/search.worker.ts` (or equivalent) and a typed adapter.
- Main-thread fallback and worker lifecycle/restart handling.
- Focused tests for protocol validation, ordering, idempotency, stale rejection, and fallback.
- The before/after benchmark extension described above.
- Verification that initial JS gzip remains ≤250 kB and the worker chunk is accounted for.

---

## 13. Changed Files for SEARCH-007

- `docs/PHASE_3_DECISION_REGISTER.md` — SEARCH-007 row and rationale.
- `docs/SPRINT_6_WORKER_DECISION.md` — this document.
- `docs/PROJECT_PROGRESS.md` — minimal status update.
- `docs/architecture/ARCHITECTURE_DECISION_RECORDS.md` — ADR-008 amendment note.
- `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md` — top-level amendment note.

No worker, production search, facet, schema, dependency, or UI changes.

---

## M9-006 reconciliation (2026-11-14)

**Status update (2026-11-14):** the worker source now exists and is committed - `apps/web/src/services/search.worker.ts` (`40709ce`), `search-worker-core.ts` (`e49ed56`) and `search-worker-protocol.ts` (`a46dead`), wired through `search.ts` (`820a637`). The main-thread fallback described here remains the baseline path. The built-worker browser test still needs the production preview server and is deferred to M9-040.
