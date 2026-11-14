# Fluid Deck — Sprint 6 (M7) Search Recovery Report

*Date: 2026-11-11 (implementation) · 2026-11-12 (browser validation + benchmark recheck, §9). Scope: SEARCH-008 (search-index recovery) implementing the SEARCH-007 worker architecture. SEARCH-001..007 are complete; UI-004 remains unimplemented. No staging, commits, or pushes performed.*

*Companions: `docs/SPRINT_6_WORKER_DECISION.md`, `docs/SPRINT_6_IMPLEMENTATION_PLAN.md`, `docs/SPRINT_6_BENCHMARK_REPORT.md`, `docs/architecture/SEARCH_AND_INDEXING_ARCHITECTURE.md`, `docs/architecture/OFFLINE_RELIABILITY_AND_ERROR_HANDLING.md`.*

---

## 1. Summary

- **SEARCH-008 — complete.** The approved SEARCH-007 worker architecture is implemented: the live MiniSearch instance is built and queried in a module Web Worker, while Dexie, `Resource` objects, facets, the 500-hit cap, and the UI remain on the main thread.
- Recovery covers startup/init failure, build/commit failure, runtime crash, malformed responses, cancellation, interrupted builds, stale builds/responses, empty libraries, repeated startup, and writes that commit during a build.
- Recovery is bounded: at most two worker build attempts, then one fresh-worker recovery after a runtime crash, then a main-thread rebuild. No automatic restart loop.
- SEARCH-004 invariants are preserved: Dexie commits first; only post-commit `syncResource` / membership / rename calls reach the index. A write before the snapshot completes invalidates and restarts the build; a write after the snapshot queues and applies after the build commits.
- No new dependency, no schema/migration change, no facet rewrite, no search UI. The worker chunk is separate from initial JS.
- Bundle: initial JS **679.11 kB raw / 210.20 kB gzip** (Vite) — **39.80 kB headroom** under the 250 kB budget. Separate worker chunk **116.33 kB raw / 33.73 kB gzip** (`gzip`, 33,728 B).
- Verification: focused 37/37, full suite **345/345**, typecheck 5/5, lint clean, prettier clean, web build green, `git diff --check` clean.

## 2. Implementation

### Ownership and entry points

- `apps/web/src/services/search-engine.ts` — shared search document/ranking engine used by both the main-thread fallback and the worker. It owns `SEARCH_FIELDS`, `SEARCH_STORE_FIELDS`, `SearchDocument` (including `updatedAt` for tie-breaks), `SearchContext`, `buildSearchDocument`, `createMiniSearch`, and `queryMiniSearch` (AND-then-OR, exact-title pin, deterministic tie-breaks).
- `apps/web/src/services/search-worker-protocol.ts` — version 1 same-origin in-app contract: `init`, `build:start`, `build:chunk`, `build:commit`, `build:cancel`, `query`, `mutate`, `mutate:batch`, `shutdown`; responses `ready`, `build:progress`, `build:done`, `query:result`, `mutation:ack`, `error`.
- `apps/web/src/services/search-worker-core.ts` — pure worker state machine. Owns the disposable MiniSearch instance, validates requests/documents, rejects stale `buildId` / `baseVersion` / `indexVersion` / chunk sequence, and advances one monotonic `indexVersion` per committed build or mutation batch.
- `apps/web/src/services/search.worker.ts` — thin module-worker entrypoint around `SearchWorkerCore`; no Dexie access, no `Resource` objects.
- `apps/web/src/services/search.ts` — main-thread lifecycle/client: worker construction after first paint, init/build/query/mutation routing, stale-response handling, recovery, fallback, and the retained main-thread rebuild path.
- `apps/web/src/main.tsx` — renders `<App />` first, then calls `startSearch(db)` (worker-first, main fallback).

### Lifecycle state

`SearchIndexState` keeps `status: idle | indexing | ready | error`, `index`, `error`, `progress`, and adds `engine: "main" | "worker"`. `ready` means the active engine can answer queries; in worker mode `index` is `null` by design because the live MiniSearch instance is not on the main thread. `getSearchIndex()` therefore remains a main-thread-only accessor; query consumers use `searchFaceted` / `searchResources`.

### Build consistency

1. `startSearch` stops any prior worker/build, then starts a worker.
2. After `init`, the main thread records `startMutations = mutationCounter` and begins the Dexie snapshot.
3. Before the snapshot completes, any `syncResource`/removal marks the build invalidated. The build is discarded and the bounded attempt restarts with a fresh snapshot.
4. After the snapshot is loaded, mutations are queued on the build.
5. Documents are sent in 200-document chunks, then `build:commit`.
6. The worker swaps the completed MiniSearch instance atomically and increments `indexVersion`.
7. The main thread publishes `ready` and flushes queued mutations through the serialized mutation chain.

### Mutation and query consistency

- Post-commit edits use the existing `syncResource`, `syncResourceMembership`, tag/collection rename/delete, soft-delete/restore/purge helpers. Worker routing occurs only after the Dexie operation has committed.
- While a build is in flight, post-snapshot mutations are queued. Mutations before the snapshot completes invalidate the build.
- After `ready`, mutations are serialized through `workerMutationChain`; each acknowledgement must advance `indexVersion` or it is rejected as stale.
- Queries capture the current `indexVersion`. If a mutation commits while the query is in flight, the client waits for the mutation chain and retries once; a second mismatch is an error rather than a silently stale result.
- Facets continue to use Dexie indexed queries; worker `idsOnly` results are intersected with the existing facet set, and the 500-hit cap remains unchanged.

### Recovery behavior

| Condition | Behavior |
|---|---|
| Worker constructor / `init` failure or 15 s init timeout | Reject the attempt, terminate the worker, retry once on a fresh worker. |
| Build commit failure | Reject the build, terminate, retry once on a fresh worker. |
| Worker runtime crash (`onerror`) | Discard the index, publish `error`, recover once on a fresh worker. |
| Worker `messageerror` or non-protocol response | Treat as a runtime failure; same recovery path. |
| Recovery worker also fails | Set `workerDisabled` for the session and rebuild on the main thread. |
| First start fails on both attempts | Set `workerDisabled` and rebuild on the main thread; startup still resolves when the main build succeeds. |
| Cancellation during init/build | `cancelSearchIndexBuild` posts `build:cancel`, increments the build token, terminates the worker, and publishes no index. |
| Stale/superseded build | Main-thread token and worker `baseVersion`/`buildId` checks reject it; an obsolete completion cannot publish. |
| Stale query/mutation response | Worker rejects mismatched `indexVersion`; client retries a query once after the mutation chain, or fails. |
| Malformed worker request/document | Worker returns `INVALID_MESSAGE`; malformed client responses become a runtime failure or timeout. |
| Empty library | Worker builds and commits an empty index; lifecycle reaches `ready`, queries return `[]`. |
| Repeated startup | `startSearch` stops the prior worker/build before starting the next one; latest wins. |

### Fallback boundary

The main-thread rebuild path is retained unchanged and is the final fallback. `workerDisabled` is session-sticky after fallback so a failing worker is not restarted by every query. No infinite restart or fallback loop exists. Worker construction happens inside `startSearch`, after first paint, so the worker chunk is not part of initial JS.

## 3. Tests

New `apps/web/src/services/search-worker-core.test.ts` (5 cases):
- protocol version 1 init and protocol mismatch;
- build + query with `idsOnly`;
- stale build, out-of-order chunk, stale version, malformed document;
- upsert, removal, and batch mutations with monotonic versions;
- build cancellation cannot be committed and leaves the core not ready.

New `apps/web/src/services/search-worker-recovery.test.ts` (10 cases, fake `SearchWorkerLike` over the real `SearchWorkerCore` and real Dexie):
- worker start and query with a null main-thread index;
- empty library reaches `ready`;
- committed mutation during an in-flight build is applied;
- startup init failure retries one fresh worker;
- a stale query response is retried once before returning results;
- in-flight build cancellation publishes nothing;
- failed build commit restarts on a fresh worker;
- runtime crash rebuilds on a fresh worker;
- malformed worker response is treated as a crash and recovers;
- bounded worker failures fall back to the main index.

Existing search tests remain green: `search.test.ts` (12), `search-index.test.ts` (10).

## 4. Verification (actual)

| Check | Result |
|---|---|
| Focused search tests (4 files) | 37/37 pass |
| `pnpm test` | 41 files / 345 passed |
| `pnpm typecheck` | 5/5 workspaces green |
| `pnpm lint` | clean |
| `pnpm exec prettier --check .` | clean |
| `pnpm --filter @fluid-deck/web build` | green, 679.11 kB raw / 210.20 kB gzip initial JS |
| `git diff --check` | clean (line-ending warnings only) |

## 5. Bundle measurement

| Measurement | Raw (kB) | Vite gzip (kB) |
|---|---:|---:|
| Pre-SEARCH-008 baseline | 672.91 | 208.30 |
| SEARCH-008 initial JS (`index-Dz-dM4K9.js`) | 679.11 | 210.20 |
| Delta | +6.20 | +1.90 |
| Separate worker chunk (`search.worker-BkQMfa5q.js`) | 116.33 | 33.73 (`gzip`, 33,728 B) |

Initial JS headroom is 39.80 kB under the 250 kB budget. Initial + lazy worker JS is 243.93 kB gzip (6.07 kB under the same 250 kB reference), though the binding budget is initial JS. CSS is unchanged at 20.28 kB raw / 4.64 kB gzip. The worker asset is emitted separately; no worker code is included in the initial chunk.

## 6. Dependency / file changes

New:
- `apps/web/src/services/search-engine.ts` (shared engine extracted from `search.ts`)
- `apps/web/src/services/search-worker-protocol.ts`
- `apps/web/src/services/search-worker-core.ts`
- `apps/web/src/services/search.worker.ts`
- `apps/web/src/services/search-worker-core.test.ts`
- `apps/web/src/services/search-worker-recovery.test.ts`
- `docs/SPRINT_6_SEARCH_RECOVERY_REPORT.md`

Modified:
- `apps/web/src/services/search.ts` (shared engine re-exports, worker lifecycle/recovery/fallback, mutation routing, worker `idsOnly` faceted path)
- `apps/web/src/main.tsx` (`startSearch(db)` after first render instead of `rebuildSearchIndex`)
- `docs/PROJECT_PROGRESS.md` (SEARCH-008 status and evidence)

No new dependency. No schema, migration, repository contract, facet, cap, or search UI change. No approved SEARCH-007 protocol/architecture change was required.

## 7. Known limitations / risks

- **Hung-worker recovery delay (measured, see §9).** A silently terminated worker is detected only by the 15 s request timeout; the in-flight query rejects and recovery then completes on a fresh worker. Measured 15,129 ms and 15,054 ms in Chromium. Bounded and self-healing; the rejected query is the only user-visible cost. No code change recommended (see §9.3).
- **No performance claim beyond the measured recheck (see §9.2).** The 50 ms query/facet budgets remain unmet at 10k. Facets remain Dexie/main-thread and their movement is **not** attributable to the worker.
- **Fallback is session-sticky.** After a fallback, a later transient failure does not re-enable the worker for that tab.
- **Main-thread fallback still bundles MiniSearch.** The initial chunk retains the fallback engine, which is why initial JS grows slightly; the live index is off-thread in worker mode.
- **Worker construction is after first paint but at startup, not deferred to first query.** This preserves the startup index lifecycle but does not lazy-load on demand.
- **No multi-tab coordination.** Each tab builds its own worker/index, consistent with the existing per-tab architecture.
- **UI-004 remains unimplemented**, so no user-visible search surface consumes the new lifecycle yet.

## 8. Verdict

**PASS.**

SEARCH-008 acceptance behavior is implemented and verified in real browsers: the production Vite build's module worker loads and speaks protocol v1 in Chromium and Firefox; dev-server startup reaches `ready` on the worker in both browsers; keyword queries, empty-library startup, committed mutations during and after builds, and crash recovery on a fresh worker all pass; bounded fallback to the main-thread index is Chromium-verified (the two fallback-evidence specs are Chromium-only by design and skip elsewhere); stale builds/versions/responses are rejected. The SEARCH-006 benchmark was re-run against the worker path (11.2 min, same harness, same seeds formula, same throttling): 10k rebuild 334.2 ms (main-thread baseline 6,212.5 ms), 10k query p95 83.1–98.0 ms across query types (baseline 394.9–436.1 ms), facets and incremental mutations reported in §9.2 with the DB-driven facet caveat. The 15 s hung-worker delay was investigated and is a documented, bounded limitation (§9.3). UI-004 remains the next Sprint 6 task.

## 9. SEARCH-008 validation evidence (2026-11-12)

### 9.1 Real-browser smoke test

Harness: the repository's existing Playwright setup. Dev-server integration via `playwright.search-worker.config.ts`; the production Vite build via `playwright.search-worker-preview.config.ts` (`vite preview`, `--strictPort`). Both configs run Chromium and Firefox projects.

| Check | Chromium | Firefox |
|---|---|---|
| Built module worker loads, protocol v1 init/build/query/mutate, stale-version rejection (`search-worker-built.spec.ts`, production build) | PASS (397 ms) | PASS (1.4 s) |
| Worker-first startup reaches `ready`; keyword queries correct (`search-worker.spec.ts`) | PASS (886 ms) | PASS (2.5 s) |
| Empty-library startup reaches `ready`, queries return `[]` | PASS (594 ms) | PASS (1.5 s) |
| Committed write during an in-flight build is applied | PASS (2.5 s) | PASS (2.3 s) |
| Worker crash recovers on a fresh worker | PASS (717 ms) | PASS (913 ms) |
| Silent worker termination → bounded recovery (hang evidence) | PASS, **15,054 ms** | skipped by design (Chromium-only evidence spec) |
| Bounded worker failures fall back to the main engine | PASS (30.7 s) | skipped by design (Chromium-only evidence spec) |

Earlier in the same validation pass the dev-server run of `search-worker-built.spec.ts` failed (`indexSrc` null): the spec targets the production build, but the base Playwright config serves the dev server, whose first `script[type="module"]` is the inline react-refresh bootstrap with no `src`. Under the preview config the spec passes in both browsers; no production behavior was implicated. The spec was also missing the `eslint-disable @typescript-eslint/no-explicit-any` header its sibling carries — 7 lint errors fixed (test file only).

Deterministic fixtures: fixed UUIDs, fixed timestamps, fixed titles (`alpha`/`beta`/`latewrite`/`mutation`), fresh Dexie database per fixture. No fake worker is substituted in these browser checks; the worker under test is the real Vite-emitted module worker (dev server) or the production worker chunk (preview).

### 9.2 Benchmark recheck (SEARCH-006 harness, worker path)

Rerun: `pnpm exec playwright test search-benchmark-worker.spec.ts` → **1 passed (11.2 min)**. Same harness, same throttling (4× CPU, Slow 4G), same warm-module protocol, same scales, same deterministic LCG seeds (`20261110 + n`). Results rewritten to `docs/SPRINT_6_BENCHMARK_WORKER_RESULTS.json`.

**Index rebuild (worker build, off the main thread).**

| Scale | Main-thread baseline (SEARCH-006) | Worker pre-run | Worker recheck |
|---|---:|---:|---:|
| 100 | 107.2 ms | 10.1 ms | **9.7 ms** |
| 1,000 | 673.5 ms | 44.0 ms | **58.3 ms** |
| 5,000 | 3,022.4 ms | 199.1 ms | **268.9 ms** |
| 10,000 | **6,212.5 ms** | 359.6 ms | **334.2 ms** |

**Keyword query p95 (worker-protocol round-trip vs main-thread baseline).**

| Scale | Query type | Main-thread p95 | Worker pre-run p95 | Worker recheck p95 |
|---|---|---:|---:|---:|
| 10k | exact | 394.9 ms | 140.2 ms | **83.1 ms** |
| 10k | multi-term | 393.4 ms | — | **98.0 ms** |
| 10k | prefix | 436.1 ms | 123.5 ms | **85.2 ms** |
| 10k | fuzzy | 420.0 ms | — | **94.0 ms** |
| 10k | AND/OR fallback | 414.5 ms | — | **88.7 ms** |
| 1,000 | exact | 27.2 ms | 13.2 ms | **16.1 ms** |
| 1,000 | prefix | 35.0 ms | 11.7 ms | **16.5 ms** |

**Facet p95 (main thread remains the DB/facet owner; worker returns `idsOnly` hits).**

| Scale | Facet | Main-thread p95 | Worker pre-run p95 | Worker recheck p95 |
|---|---|---:|---:|---:|
| 10k | type | 3,603.3 ms | 3,390.5 ms | **1,778.1 ms** |
| 10k | combined | 6,238.9 ms | 6,528.2 ms | **2,936.6 ms** |
| 1,000 | type | 373.6 ms | 339.0 ms | **450.3 ms** |
| 1,000 | combined | 746.2 ms | 608.0 ms | **772.8 ms** |

**Incremental mutation p95 (post-Dexie-commit sync).**

| Scale | Operation | Main-thread p95 | Worker pre-run p95 | Worker recheck p95 |
|---|---|---:|---:|---:|
| 10k | create | 616.6 ms | 1,455.4 ms | **574.5 ms** |
| 10k | update | 733.5 ms | 1,232.6 ms | **721.4 ms** |
| 10k | delete | 14.6 ms | 10.2 ms | **5.1 ms** |
| 10k | tag rename | 1,685.7 ms | — | **590.3 ms** |
| 10k | collection rename | 1,621.5 ms | — | **570.5 ms** |

**Bundle (production build, measured from `dist`).**

| Measurement | Raw | Gzip |
|---|---:|---:|
| Initial JS (`index-Dz-dM4K9.js`) | 679.11 kB | **210.20 kB** (budget ≤250 kB; 39.80 kB headroom) |
| Separate worker chunk (`search.worker-BkQMfa5q.js`) | 116.33 kB | **33.73 kB** |

Environment/methodology notes: same host, same Chromium/Playwright versions, same throttling and warm-module protocol as SEARCH-006. Run-to-run variance is material for facets and incremental mutations (compare the pre-run and recheck worker columns); the 10k facet and incremental improvements versus the main-thread baseline are **not** attributable to the worker alone — facets remain Dexie/main-thread and the improvement sits inside DB-scan-bound work. Query p95 remains above the 50 ms budget at 10k (83.1–98.0 ms) even with the worker; the worker removes the work from the UI thread but does not make the computation itself meet the budget.

### 9.3 Hung-worker recovery delay — investigation

Measured: **15,129 ms** (first Chromium run) and **15,054 ms** (second) from silent `worker.terminate()` to `ready` on a fresh worker.

Root cause: `WORKER_REQUEST_TIMEOUT_MS = 15_000` in `apps/web/src/services/search.ts` is the only detection mechanism for a worker that dies without firing `onerror` (external termination, browser kill). The pending query request waits out its full timeout; `sendWorkerRequest`'s timer rejects and calls `handleWorkerFailure`, which starts the bounded fresh-worker recovery. The delay therefore equals the timeout constant; recovery itself is fast and succeeds.

Evidence-based assessment:

- The behavior is bounded (≤15 s) and self-healing; the test asserts `ready` on a fresh worker afterward, and subsequent queries pass in both browsers.
- The only user-visible cost is that the single in-flight query rejects (the UI can retry; the next query works after recovery).
- Reducing the timeout is **not** supported by the evidence: a legitimate worker build on a throttled low-end device can take seconds, and a shorter timeout would risk false-positive failure during normal builds.
- A heartbeat/keepalive would detect silent death in ~2–3 s, but it adds a message loop and complexity for a rare, already-bounded case.

Recommendation: **no production change now.** Keep the documented limitation. If a future task wants the hang to be transparent, the minimal improvement is to retry the rejected query once after recovery completes (client-side), not to shorten the timeout.

## 10. Changed files for this validation pass

- `e2e/search-worker-built.spec.ts` — added the missing `eslint-disable @typescript-eslint/no-explicit-any` header (7 lint errors; test file only, no behavior change).
- `docs/SPRINT_6_SEARCH_RECOVERY_REPORT.md` — this section, the §7 limitation update, and the verdict change (PASS WITH CONDITIONS → PASS).
- `docs/SPRINT_6_BENCHMARK_WORKER_RESULTS.json` — rewritten by the benchmark rerun.
- `docs/PROJECT_PROGRESS.md` — validation evidence entry.

No production source, protocol, schema, dependency, or Git operation was part of this pass.

---

## M9-006 reconciliation (2026-11-14)

The bundle figures in this report were measured before the search feature reached the application. The current web entry is 771.46 kB raw / 241.33 kB gzip (`460b7cf`), with the worker in a separate lazy chunk (116.43 kB).
