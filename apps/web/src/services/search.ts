/**
 * SEARCH-002 — thin MiniSearch adapter + Search Service query layer.
 * SEARCH-003 — startup rebuild lifecycle (chunked, post-paint, cancellation,
 * progress/readiness state, degraded browse-only on failure).
 *
 * Owns the MiniSearch instance (derived, disposable) and the approved ranking
 * rules (exact-title pin, AND-then-OR degrade, deterministic tie-breaks).
 * MiniSearch's concrete API must not leak past this module.
 */
import type MiniSearch from "minisearch";
import type { Resource, ResourcePatch } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { listResources } from "../repositories/resources.ts";
import { normalizeTagName } from "../repositories/tags.ts";
import { buildSearchDocument, createMiniSearch, queryMiniSearch } from "./search-engine.ts";
import type { SearchContext, SearchDocument, SearchDocumentMeta } from "./search-engine.ts";
import {
  SEARCH_WORKER_PROTOCOL_VERSION,
  type WorkerSearchDocument,
  type WorkerSearchRequest,
  type WorkerSearchResponse,
} from "./search-worker-protocol.ts";

export {
  SEARCH_FIELDS,
  SEARCH_STORE_FIELDS,
  buildSearchDocument,
  createMiniSearch,
  queryMiniSearch,
} from "./search-engine.ts";
export type { SearchContext, SearchDocument, SearchDocumentMeta } from "./search-engine.ts";

export interface SearchIndex {
  mini: MiniSearch<SearchDocument>;
  resourcesById: Map<string, Resource>;
}

export function createSearchIndex(
  resources: readonly Resource[],
  context: SearchContext = {},
): SearchIndex {
  const mini = createMiniSearch();

  const live = resources.filter((resource) => resource.deletedAt === null);
  mini.addAll(live.map((resource) => buildSearchDocument(resource, context)));
  return {
    mini,
    resourcesById: new Map(resources.map((resource) => [resource.id, resource])),
  };
}

export interface SearchHit {
  resource: Resource;
  score: number;
  matchedTerms: string[];
  partial: boolean;
}

const DEFAULT_LIMIT = 500;

function metaByResourceId(index: SearchIndex): Map<string, SearchDocumentMeta> {
  return new Map(
    [...index.resourcesById.values()].map((resource) => [
      resource.id,
      { id: resource.id, title: resource.title, updatedAt: resource.updatedAt },
    ]),
  );
}

export function searchIndex(
  index: SearchIndex,
  query: string,
  options: { limit?: number } = {},
): { hits: SearchHit[]; partial: boolean } {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const result = queryMiniSearch(index.mini, query, metaByResourceId(index), limit);
  const hits: SearchHit[] = result.hits
    .map((hit) => {
      const resource = index.resourcesById.get(hit.id);
      if (!resource) return null;
      return {
        resource,
        score: hit.score,
        matchedTerms: hit.matchedTerms,
        partial: result.partial,
      };
    })
    .filter((hit): hit is SearchHit => hit !== null);
  return { hits, partial: result.partial };
}

export function searchResources(
  index: SearchIndex,
  query: string,
  options?: { limit?: number },
): Resource[] {
  return searchIndex(index, query, options).hits.map((hit) => hit.resource);
}

/* ------------------------------------------------------------------ */
/* SEARCH-003 — startup rebuild lifecycle                              */
/* ------------------------------------------------------------------ */

export type SearchIndexStatus = "idle" | "indexing" | "ready" | "error";

export interface SearchIndexProgress {
  done: number;
  total: number;
}

export type SearchEngineKind = "main" | "worker";

export interface SearchIndexState {
  status: SearchIndexStatus;
  index: SearchIndex | null;
  error: unknown | null;
  progress: SearchIndexProgress | null;
  engine: SearchEngineKind;
  // Convenience aliases for consumers/tests that read these names.
  lifecycle: SearchIndexStatus;
  ready: boolean;
  indexing: boolean;
  failed: boolean;
}

function makeState(
  status: SearchIndexStatus,
  index: SearchIndex | null,
  error: unknown | null,
  progress: SearchIndexProgress | null,
  engine: SearchEngineKind = "main",
): SearchIndexState {
  return {
    status,
    index,
    error,
    progress,
    engine,
    lifecycle: status,
    ready: status === "ready",
    indexing: status === "indexing",
    failed: status === "error",
  };
}

let state: SearchIndexState = makeState("idle", null, null, null);
const listeners = new Set<(next: SearchIndexState) => void>();
let currentToken = 0;
let mutationCounter = 0;
const pendingUpsertIds = new Set<string>();
const pendingRemovalIds = new Set<string>();

function setState(next: SearchIndexState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

export function getSearchIndexState(): SearchIndexState {
  return state;
}

export function getSearchIndex(): SearchIndex | null {
  return state.index;
}

export function getSearchIndexStatus(): SearchIndexStatus {
  return state.status;
}

export function isSearchReady(): boolean {
  return state.status === "ready";
}

export function isSearchAvailable(): boolean {
  return isSearchReady();
}

export function subscribeSearchIndexState(listener: (next: SearchIndexState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (
      globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      ric(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

interface SearchSnapshot {
  resources: Resource[];
  context: SearchContext;
  resourcesById: Map<string, Resource>;
}

/** One consistent read of every source row needed to build the index. */
async function loadSearchSnapshot(
  database: FluidDeckDatabase,
  checkCurrent: () => void = () => {},
): Promise<SearchSnapshot> {
  const resources = await listResources(database);
  checkCurrent();

  const [tags, collections, resourceTags, resourceCollections] = await Promise.all([
    database.tags.toArray(),
    database.collections.toArray(),
    database.resourceTags.toArray(),
    database.resourceCollections.toArray(),
  ]);
  checkCurrent();

  const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
  const collectionNameById = new Map(
    collections.map((collection) => [collection.id, collection.name]),
  );
  const tagNamesByResourceId = new Map<string, string[]>();
  const collectionNamesByResourceId = new Map<string, string[]>();

  for (const join of resourceTags) {
    const name = tagNameById.get(join.tagId);
    if (name === undefined) continue;
    const existing = tagNamesByResourceId.get(join.resourceId);
    if (existing) existing.push(name);
    else tagNamesByResourceId.set(join.resourceId, [name]);
  }
  for (const join of resourceCollections) {
    const name = collectionNameById.get(join.collectionId);
    if (name === undefined) continue;
    const existing = collectionNamesByResourceId.get(join.resourceId);
    if (existing) existing.push(name);
    else collectionNamesByResourceId.set(join.resourceId, [name]);
  }

  return {
    resources,
    context: { tagNamesByResourceId, collectionNamesByResourceId },
    resourcesById: new Map(resources.map((resource) => [resource.id, resource])),
  };
}

export async function rebuildSearchIndex(
  database: FluidDeckDatabase,
  options: { chunkSize?: number } = {},
): Promise<SearchIndex> {
  searchCancelled = false;
  stopSearchWorkerOnly();
  const chunkSize = Math.max(1, options.chunkSize ?? 200);

  // SEARCH-004: restart the build if any write lands during it, so a stale
  // snapshot can never overwrite a committed mutation. Explicit cancellation
  // (cancelSearchIndexBuild) still throws and leaves state idle.
  while (true) {
    const token = ++currentToken;
    const startMutations = mutationCounter;
    pendingUpsertIds.clear();
    pendingRemovalIds.clear();

    setState(makeState("indexing", null, null, { done: 0, total: 0 }));

    try {
      const { resources, context, resourcesById } = await loadSearchSnapshot(database, () => {
        if (token !== currentToken) throw new Error("search index build cancelled (stale)");
      });

      const mini = createMiniSearch();

      setState(makeState("indexing", null, null, { done: 0, total: resources.length }));

      for (let i = 0; i < resources.length; i += chunkSize) {
        if (token !== currentToken) throw new Error("search index build cancelled (stale)");
        const chunk = resources.slice(i, i + chunkSize);
        mini.addAll(chunk.map((resource) => buildSearchDocument(resource, context)));
        const done = Math.min(i + chunk.length, resources.length);
        setState(makeState("indexing", null, null, { done, total: resources.length }));
        if (i + chunkSize < resources.length) await yieldToMain();
      }

      if (token !== currentToken) throw new Error("search index build cancelled (stale)");

      // A write landed during this build: discard the snapshot and rebuild.
      if (mutationCounter !== startMutations) continue;

      const index: SearchIndex = { mini, resourcesById };
      setState(
        makeState("ready", index, null, { done: resources.length, total: resources.length }),
      );
      return index;
    } catch (error) {
      if (token !== currentToken) {
        // Stale/cancelled build: do not publish an obsolete index or error state.
        throw error;
      }
      setState(makeState("error", null, error, null));
      throw error;
    }
  }
}

export function cancelSearchIndexBuild(): void {
  searchCancelled = true;
  const worker = searchWorker;
  if (worker && workerBuild) {
    try {
      worker.postMessage({ type: "build:cancel", buildId: workerBuild.id });
    } catch {
      // Termination below is sufficient when the worker is already gone.
    }
  }
  stopSearchWorkerOnly();
  if (state.status === "indexing") {
    setState(makeState("idle", null, null, null, state.engine));
  }
}

/* ------------------------------------------------------------------ */
/* SEARCH-008 — Web Worker lifecycle, recovery, bounded fallback        */
/* ------------------------------------------------------------------ */

export interface SearchWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerSearchRequest): void;
  terminate(): void;
}

export interface StartSearchOptions {
  workerFactory?: () => SearchWorkerLike;
  maxAttempts?: number;
}

interface PendingWorkerRequest {
  expected: WorkerSearchResponse["type"];
  resolve: (response: WorkerSearchResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type WorkerMutation =
  { op: "upsert"; document: WorkerSearchDocument } | { op: "remove"; id: string };

interface WorkerBuildState {
  id: string;
  startMutations: number;
  snapshotLoaded: boolean;
  invalidated: boolean;
  queued: WorkerMutation[];
}

const WORKER_REQUEST_TIMEOUT_MS = 15_000;
const WORKER_MAX_ATTEMPTS = 2;

let searchWorker: SearchWorkerLike | null = null;
let searchDatabase: FluidDeckDatabase | null = null;
let searchWorkerFactory: (() => SearchWorkerLike) | null = null;
let workerInitialized = false;
let workerIndexReady = false;
let workerVersion = 0;
let workerBuild: WorkerBuildState | null = null;
let workerBuildSeq = 0;
let workerRequestSeq = 0;
let workerDisabled = false;
let recovering = false;
let searchCancelled = false;
let workerMutationChain: Promise<void> = Promise.resolve();
const workerRequests = new Map<number, PendingWorkerRequest>();
let pendingInit: {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;
let pendingBuild: {
  resolve: (response: Extract<WorkerSearchResponse, { type: "build:done" }>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

function nextWorkerRequestId(): number {
  workerRequestSeq += 1;
  return workerRequestSeq;
}

function defaultSearchWorkerFactory(): SearchWorkerLike {
  if (typeof Worker === "undefined") throw new Error("Web Worker is unavailable");
  return new Worker(new URL("./search.worker.ts", import.meta.url), {
    type: "module",
    name: "fluid-deck-search",
  }) as unknown as SearchWorkerLike;
}

function rejectPendingWorkerWork(error: Error): void {
  if (pendingInit) {
    clearTimeout(pendingInit.timer);
    pendingInit.reject(error);
    pendingInit = null;
  }
  if (pendingBuild) {
    clearTimeout(pendingBuild.timer);
    pendingBuild.reject(error);
    pendingBuild = null;
  }
  for (const pending of workerRequests.values()) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  workerRequests.clear();
}

function stopSearchWorkerOnly(): void {
  currentToken += 1;
  const worker = searchWorker;
  searchWorker = null;
  workerInitialized = false;
  workerIndexReady = false;
  workerVersion = 0;
  workerBuild = null;
  rejectPendingWorkerWork(new Error("Search worker stopped"));
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    try {
      worker.terminate();
    } catch {
      // A worker that already crashed cannot be terminated again.
    }
  }
}

function workerFailureMessage(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "Search worker failed");
}

function handleWorkerMessage(worker: SearchWorkerLike, event: MessageEvent<unknown>): void {
  if (worker !== searchWorker) return;
  const data = event.data;
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as { type?: unknown }).type !== "string"
  ) {
    handleWorkerFailure(new Error("Search worker sent a malformed response"));
    return;
  }
  const response = data as WorkerSearchResponse;

  switch (response.type) {
    case "ready": {
      if (response.protocolVersion !== SEARCH_WORKER_PROTOCOL_VERSION) {
        handleWorkerFailure(new Error("Search worker protocol mismatch"));
        return;
      }
      workerInitialized = true;
      if (pendingInit) {
        clearTimeout(pendingInit.timer);
        pendingInit.resolve();
        pendingInit = null;
      }
      return;
    }
    case "build:progress": {
      if (workerBuild?.id === response.buildId) {
        setState(
          makeState(
            "indexing",
            null,
            null,
            { done: response.done, total: response.total },
            "worker",
          ),
        );
      }
      return;
    }
    case "build:done": {
      if (pendingBuild && workerBuild?.id === response.buildId) {
        clearTimeout(pendingBuild.timer);
        pendingBuild.resolve(response);
        pendingBuild = null;
      }
      return;
    }
    case "error": {
      const error = new Error(response.message);
      if (pendingInit) {
        clearTimeout(pendingInit.timer);
        pendingInit.reject(error);
        pendingInit = null;
        return;
      }
      if (response.requestId !== undefined) {
        const pending = workerRequests.get(response.requestId);
        if (pending) {
          workerRequests.delete(response.requestId);
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        return;
      }
      if (workerBuild && pendingBuild) {
        clearTimeout(pendingBuild.timer);
        pendingBuild.reject(error);
        pendingBuild = null;
        return;
      }
      handleWorkerFailure(error);
      return;
    }
    case "query:result":
    case "mutation:ack": {
      if (response.requestId === undefined) return;
      const pending = workerRequests.get(response.requestId);
      if (!pending) return;
      workerRequests.delete(response.requestId);
      clearTimeout(pending.timer);
      if (pending.expected !== response.type) {
        pending.reject(new Error(`Unexpected search worker response: ${response.type}`));
      } else {
        pending.resolve(response);
      }
      return;
    }
  }
}

function attachSearchWorker(worker: SearchWorkerLike): void {
  worker.onmessage = (event) => handleWorkerMessage(worker, event);
  worker.onerror = (event) => {
    handleWorkerFailure(new Error(event.message || "Search worker crashed"));
  };
  worker.onmessageerror = () => {
    handleWorkerFailure(new Error("Search worker message could not be deserialized"));
  };
}

function handleWorkerFailure(error: unknown): void {
  const failure = workerFailureMessage(error);
  const wasReady = workerIndexReady;
  stopSearchWorkerOnly();
  if (!wasReady) {
    // A build-time failure is surfaced through the build promise so the
    // bounded start/retry path can decide whether to fall back.
    return;
  }
  setState(makeState("error", null, failure, null, "worker"));
  void recoverSearchWorker();
}

function sendWorkerRequest(
  request: WorkerSearchRequest,
  expected: WorkerSearchResponse["type"],
): Promise<WorkerSearchResponse> {
  const worker = searchWorker;
  if (!worker) return Promise.reject(new Error("Search worker is not running"));
  return new Promise<WorkerSearchResponse>((resolve, reject) => {
    const requestId = nextWorkerRequestId();
    const outgoing = { ...request, requestId } as WorkerSearchRequest;
    const timer = setTimeout(() => {
      workerRequests.delete(requestId);
      reject(new Error("Search worker request timed out"));
      handleWorkerFailure(new Error("Search worker request timed out"));
    }, WORKER_REQUEST_TIMEOUT_MS);
    workerRequests.set(requestId, { expected, resolve, reject, timer });
    try {
      worker.postMessage(outgoing);
    } catch (error) {
      clearTimeout(timer);
      workerRequests.delete(requestId);
      reject(workerFailureMessage(error));
    }
  });
}

function enqueueWorkerMutation(mutation: WorkerMutation): Promise<void> {
  const run = workerMutationChain.then(() => sendWorkerMutationNow(mutation));
  workerMutationChain = run.catch(() => undefined);
  return run;
}

async function sendWorkerMutationNow(mutation: WorkerMutation): Promise<void> {
  if (!searchWorker || !workerIndexReady) throw new Error("Search worker index is not ready");
  const indexVersion = workerVersion;
  const response = await sendWorkerRequest(
    mutation.op === "upsert"
      ? {
          type: "mutate",
          requestId: 0,
          indexVersion,
          op: "upsert",
          document: mutation.document,
        }
      : { type: "mutate", requestId: 0, indexVersion, op: "remove", id: mutation.id },
    "mutation:ack",
  );
  if (response.type !== "mutation:ack")
    throw new Error("Unexpected search worker mutation response");
  if (response.indexVersion <= workerVersion) {
    throw new Error("Search worker returned a stale mutation acknowledgement");
  }
  workerVersion = response.indexVersion;
}

function queueOrApplyWorkerMutation(mutation: WorkerMutation): Promise<void> | null {
  if (workerBuild) {
    if (!workerBuild.snapshotLoaded) workerBuild.invalidated = true;
    else workerBuild.queued.push(mutation);
    return null;
  }
  return workerIndexReady ? enqueueWorkerMutation(mutation) : null;
}

async function initSearchWorker(worker: SearchWorkerLike): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingInit = null;
      reject(new Error("Search worker did not become ready in time"));
    }, WORKER_REQUEST_TIMEOUT_MS);
    pendingInit = { resolve, reject, timer };
    try {
      worker.postMessage({
        type: "init",
        requestId: nextWorkerRequestId(),
        protocolVersion: SEARCH_WORKER_PROTOCOL_VERSION,
      });
    } catch (error) {
      clearTimeout(timer);
      pendingInit = null;
      reject(workerFailureMessage(error));
    }
  });
}

async function runWorkerBuild(
  database: FluidDeckDatabase,
  workerFactory: () => SearchWorkerLike,
): Promise<void> {
  if (searchCancelled) throw new Error("Search index build cancelled");
  const token = ++currentToken;
  const startMutations = mutationCounter;
  const worker = workerFactory();
  searchWorker = worker;
  workerInitialized = false;
  workerIndexReady = false;
  workerVersion = 0;
  attachSearchWorker(worker);

  setState(makeState("indexing", null, null, { done: 0, total: 0 }, "worker"));
  await initSearchWorker(worker);
  if (token !== currentToken) throw new Error("search index build cancelled (stale)");
  if (!workerInitialized) throw new Error("Search worker failed to initialize");

  const build: WorkerBuildState = {
    id: `worker-build-${++workerBuildSeq}`,
    startMutations,
    snapshotLoaded: false,
    invalidated: false,
    queued: [],
  };
  workerBuild = build;

  const snapshot = await loadSearchSnapshot(database, () => {
    if (token !== currentToken) throw new Error("search index build cancelled (stale)");
  });
  if (token !== currentToken) throw new Error("search index build cancelled (stale)");
  if (build.invalidated || mutationCounter !== startMutations) {
    throw new Error("Search snapshot became stale during worker build");
  }
  build.snapshotLoaded = true;

  const documents = snapshot.resources.map((resource) =>
    buildSearchDocument(resource, snapshot.context),
  );
  setState(makeState("indexing", null, null, { done: 0, total: documents.length }, "worker"));

  const done = new Promise<Extract<WorkerSearchResponse, { type: "build:done" }>>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        pendingBuild = null;
        reject(new Error("Search worker build timed out"));
      }, WORKER_REQUEST_TIMEOUT_MS);
      pendingBuild = { resolve, reject, timer };
    },
  );
  // If startup is cancelled or postMessage throws before we await `done`, the
  // rejection is still surfaced by startSearchWorker; avoid an unhandled one.
  void done.catch(() => undefined);

  worker.postMessage({
    type: "build:start",
    buildId: build.id,
    baseVersion: workerVersion,
    total: documents.length,
  });
  const chunkSize = 200;
  for (let i = 0; i < documents.length; i += chunkSize) {
    if (token !== currentToken) throw new Error("search index build cancelled (stale)");
    worker.postMessage({
      type: "build:chunk",
      buildId: build.id,
      seq: i / chunkSize,
      documents: documents.slice(i, i + chunkSize),
    });
  }
  worker.postMessage({ type: "build:commit", buildId: build.id, baseVersion: workerVersion });

  const result = await done;
  if (token !== currentToken) throw new Error("search index build cancelled (stale)");
  workerVersion = result.indexVersion;
  workerIndexReady = true;
  workerBuild = null;
  setState(
    makeState("ready", null, null, { done: documents.length, total: documents.length }, "worker"),
  );
  for (const mutation of build.queued) await enqueueWorkerMutation(mutation);
}

export async function startSearchWorker(
  database: FluidDeckDatabase,
  options: StartSearchOptions = {},
): Promise<void> {
  const workerFactory = options.workerFactory ?? searchWorkerFactory ?? defaultSearchWorkerFactory;
  searchWorkerFactory = workerFactory;
  const maxAttempts = Math.max(1, options.maxAttempts ?? WORKER_MAX_ATTEMPTS);
  let lastError: unknown = new Error("Search worker failed to start");
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (searchCancelled) throw new Error("Search index build cancelled");
    try {
      await runWorkerBuild(database, workerFactory);
      return;
    } catch (error) {
      lastError = error;
      stopSearchWorkerOnly();
    }
  }
  throw workerFailureMessage(lastError);
}

async function recoverSearchWorker(): Promise<void> {
  if (recovering) return;
  recovering = true;
  const database = searchDatabase;
  try {
    if (!database) throw new Error("Search database is unavailable");
    try {
      await startSearchWorker(database, { maxAttempts: WORKER_MAX_ATTEMPTS });
      return;
    } catch (error) {
      if (searchCancelled) throw error;
    }
    // Bounded recovery: after one fresh worker attempt fails, switch this
    // session to the main-thread engine instead of restarting forever.
    workerDisabled = true;
    await rebuildSearchIndex(database);
  } catch (error) {
    setState(makeState("error", null, error, null, "main"));
  } finally {
    recovering = false;
  }
}

/** Worker-first startup with a bounded main-thread fallback. */
export async function startSearch(
  database: FluidDeckDatabase,
  options: StartSearchOptions = {},
): Promise<void> {
  searchDatabase = database;
  searchCancelled = false;
  stopSearchWorkerOnly();
  searchWorkerFactory = options.workerFactory ?? defaultSearchWorkerFactory;
  if (workerDisabled) {
    await rebuildSearchIndex(database);
    return;
  }
  try {
    await startSearchWorker(database, options);
  } catch (error) {
    if (searchCancelled) throw error;
    workerDisabled = true;
    stopSearchWorkerOnly();
    await rebuildSearchIndex(database);
  }
}

async function requestWorkerQuery(query: string, limit: number, idsOnly: boolean) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!searchWorker || !workerIndexReady) throw new Error("Search worker index is not ready");
    const indexVersion = workerVersion;
    const response = await sendWorkerRequest(
      { type: "query", requestId: 0, indexVersion, q: query, limit, idsOnly },
      "query:result",
    );
    if (response.type !== "query:result")
      throw new Error("Unexpected search worker query response");
    if (response.indexVersion === indexVersion) return response;
    // A mutation committed while the query was in flight: wait for the
    // mutation chain, then retry against the current version.
    await workerMutationChain;
  }
  throw new Error("Search worker returned a stale query response");
}

/* ------------------------------------------------------------------ */
/* SEARCH-004 — incremental update after durable Dexie commits          */
/* ------------------------------------------------------------------ */

function isDatabase(value: unknown): value is FluidDeckDatabase {
  return (
    typeof value === "object" &&
    value !== null &&
    "resources" in value &&
    typeof (value as { resources?: { get?: unknown } }).resources?.get === "function"
  );
}

function isResource(value: unknown): value is Resource {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    "deletedAt" in value
  );
}

async function loadSearchContext(
  database: FluidDeckDatabase,
  resourceIds?: readonly string[],
): Promise<SearchContext> {
  const [tags, collections, resourceTags, resourceCollections] = await Promise.all([
    database.tags.toArray(),
    database.collections.toArray(),
    database.resourceTags.toArray(),
    database.resourceCollections.toArray(),
  ]);

  const idSet = resourceIds ? new Set(resourceIds) : null;
  const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
  const collectionNameById = new Map(
    collections.map((collection) => [collection.id, collection.name]),
  );

  const tagNamesByResourceId = new Map<string, string[]>();
  const collectionNamesByResourceId = new Map<string, string[]>();

  for (const join of resourceTags) {
    if (idSet && !idSet.has(join.resourceId)) continue;
    const name = tagNameById.get(join.tagId);
    if (name === undefined) continue;
    const existing = tagNamesByResourceId.get(join.resourceId);
    if (existing) existing.push(name);
    else tagNamesByResourceId.set(join.resourceId, [name]);
  }
  for (const join of resourceCollections) {
    if (idSet && !idSet.has(join.resourceId)) continue;
    const name = collectionNameById.get(join.collectionId);
    if (name === undefined) continue;
    const existing = collectionNamesByResourceId.get(join.resourceId);
    if (existing) existing.push(name);
    else collectionNamesByResourceId.set(join.resourceId, [name]);
  }

  return { tagNamesByResourceId, collectionNamesByResourceId };
}

function searchableChanged(previous: Resource | undefined, next: Resource): boolean {
  if (!previous) return true;
  if (previous.title !== next.title) return true;
  if (previous.description !== next.description) return true;
  if (previous.canonicalUrl !== next.canonicalUrl) return true;
  if (previous.domain !== next.domain) return true;
  if (previous.type !== next.type) return true;
  return false;
}

async function applyUpsert(
  database: FluidDeckDatabase | undefined,
  resource: Resource,
  context?: SearchContext,
  bumpCounter: boolean = false,
): Promise<void> {
  if (bumpCounter) mutationCounter += 1;

  if (resource.deletedAt !== null) {
    if (workerBuild || (searchWorker && workerIndexReady)) {
      const pending = queueOrApplyWorkerMutation({ op: "remove", id: resource.id });
      if (pending) await pending;
      return;
    }
    if (searchWorker) return;
    const idx = state.index;
    if (!idx) {
      pendingUpsertIds.delete(resource.id);
      pendingRemovalIds.add(resource.id);
      return;
    }
    idx.mini.discard(resource.id);
    idx.resourcesById.delete(resource.id);
    pendingRemovalIds.add(resource.id);
    return;
  }

  if (workerBuild || (searchWorker && workerIndexReady)) {
    const ctx = context ?? (database ? await loadSearchContext(database, [resource.id]) : {});
    const pending = queueOrApplyWorkerMutation({
      op: "upsert",
      document: buildSearchDocument(resource, ctx),
    });
    if (pending) await pending;
    return;
  }
  if (searchWorker) return;

  const idx = state.index;
  if (!idx) {
    pendingUpsertIds.add(resource.id);
    return;
  }

  const ctx = context ?? (database ? await loadSearchContext(database, [resource.id]) : {});
  const doc = buildSearchDocument(resource, ctx);

  if (idx.resourcesById.has(resource.id)) {
    idx.mini.replace(doc);
  } else {
    try {
      idx.mini.add(doc);
    } catch {
      // Duplicate id: treat as replace to stay idempotent.
      idx.mini.replace(doc);
    }
  }
  idx.resourcesById.set(resource.id, resource);
  pendingUpsertIds.delete(resource.id);
  pendingRemovalIds.delete(resource.id);
}

async function applyRemoval(id: string, bumpCounter: boolean = false): Promise<void> {
  if (bumpCounter) mutationCounter += 1;
  if (workerBuild || (searchWorker && workerIndexReady)) {
    const pending = queueOrApplyWorkerMutation({ op: "remove", id });
    if (pending) await pending;
    return;
  }
  if (searchWorker) return;
  const idx = state.index;
  if (!idx) {
    pendingRemovalIds.add(id);
    pendingUpsertIds.delete(id);
    return;
  }
  idx.mini.discard(id);
  idx.resourcesById.delete(id);
  pendingRemovalIds.delete(id);
  pendingUpsertIds.delete(id);
}

// --- Public mutation API (flexible signatures) ---

export async function addSearchDocument(
  first: FluidDeckDatabase | Resource,
  second?: Resource | SearchContext,
  third?: SearchContext,
): Promise<void> {
  let database: FluidDeckDatabase | undefined;
  let resource: Resource;
  let context: SearchContext | undefined;
  if (isDatabase(first)) {
    database = first;
    resource = second as Resource;
    context = third;
  } else {
    resource = first as Resource;
    context = second as SearchContext | undefined;
  }
  mutationCounter += 1;
  await applyUpsert(database, resource, context, false);
}

export async function removeSearchDocument(
  first: FluidDeckDatabase | string,
  second?: string,
): Promise<void> {
  const id = typeof first === "string" ? first : (second as string);
  mutationCounter += 1;
  await applyRemoval(id, false);
}

export async function replaceSearchDocument(
  first: FluidDeckDatabase | Resource,
  second?: Resource | SearchContext,
  third?: SearchContext,
): Promise<void> {
  await addSearchDocument(
    first as FluidDeckDatabase | Resource,
    second as Resource | SearchContext,
    third,
  );
}

export async function syncResource(
  first: FluidDeckDatabase | Resource | string,
  second?: Resource | string,
  third?: SearchContext,
): Promise<void> {
  let database: FluidDeckDatabase | undefined;
  let target: Resource | string | undefined;
  if (isDatabase(first)) {
    database = first;
    target = second;
  } else if (isResource(first)) {
    target = first;
  } else if (typeof first === "string") {
    target = first;
  }

  mutationCounter += 1;

  if (typeof target === "string") {
    if (database) {
      const row = await database.resources.get(target);
      if (!row || row.deletedAt !== null) {
        await applyRemoval(target, false);
        return;
      }
      // Parse via persisted helper? row is already a Resource-shaped record.
      await applyUpsert(database, row as Resource, third, false);
      return;
    }
    await applyRemoval(target, false);
    return;
  }

  if (target) {
    await applyUpsert(database, target, third, false);
  }
}

export async function updateSearchDocument(
  first: FluidDeckDatabase,
  second: string,
  patch?: ResourcePatch,
  previous?: Resource,
): Promise<void> {
  mutationCounter += 1;
  const database = first;
  const id = second;
  const row = await database.resources.get(id);
  if (!row) {
    await applyRemoval(id, false);
    return;
  }
  const resource = row as Resource;
  if (resource.deletedAt !== null) {
    await applyRemoval(id, false);
    return;
  }

  const idx = state.index;
  const stored = idx?.resourcesById.get(id);
  const prior = previous ?? stored;

  // Determine whether any searchable field changed.
  const urlChanged = patch?.url !== undefined;
  const titleChanged = patch?.title !== undefined;
  const descriptionChanged = patch?.description !== undefined;
  const typeChanged = patch?.type !== undefined;
  const patchSearchable = urlChanged || titleChanged || descriptionChanged || typeChanged;

  if (patch && !patchSearchable && !searchableChanged(prior, resource)) {
    // Timestamp-only / non-searchable edit: skip MiniSearch work, but keep the
    // cached resource fresh for tie-breaks.
    if (idx) idx.resourcesById.set(id, resource);
    return;
  }

  if (!patchSearchable && !searchableChanged(prior, resource)) {
    if (idx) idx.resourcesById.set(id, resource);
    return;
  }

  await applyUpsert(database, resource, undefined, false);
}

export async function syncResourceMembership(
  database: FluidDeckDatabase,
  resourceId: string,
): Promise<void> {
  mutationCounter += 1;
  const row = await database.resources.get(resourceId);
  if (!row || (row as Resource).deletedAt !== null) {
    await applyRemoval(resourceId, false);
    return;
  }
  await applyUpsert(database, row as Resource, undefined, false);
}

// Tag / collection rename + merge + delete targeting.

export async function syncTagRename(database: FluidDeckDatabase, tagId: string): Promise<void> {
  mutationCounter += 1;
  const joins = await database.resourceTags.where("tagId").equals(tagId).toArray();
  const ids = joins.map((join) => join.resourceId);
  if (ids.length === 0) return;
  const resources = await database.resources.bulkGet(ids);
  const context = await loadSearchContext(database, ids);
  for (const resource of resources) {
    if (!resource || resource.deletedAt !== null) continue;
    await applyUpsert(database, resource as Resource, context, false);
  }
}

export async function syncTagMerge(
  database: FluidDeckDatabase,
  targetTagId: string,
): Promise<void> {
  mutationCounter += 1;
  const joins = await database.resourceTags.where("tagId").equals(targetTagId).toArray();
  const ids = joins.map((join) => join.resourceId);
  if (ids.length === 0) return;
  const resources = await database.resources.bulkGet(ids);
  const context = await loadSearchContext(database, ids);
  for (const resource of resources) {
    if (!resource || resource.deletedAt !== null) continue;
    await applyUpsert(database, resource as Resource, context, false);
  }
}

export async function syncTagDeleted(
  database: FluidDeckDatabase,
  tagId: string,
  affectedResourceIds?: readonly string[],
): Promise<void> {
  mutationCounter += 1;
  const ids = affectedResourceIds ? [...affectedResourceIds] : [];
  if (ids.length === 0) return;
  const resources = await database.resources.bulkGet(ids);
  const context = await loadSearchContext(database, ids);
  for (const resource of resources) {
    if (!resource || resource.deletedAt !== null) continue;
    await applyUpsert(database, resource as Resource, context, false);
  }
}

export async function syncCollectionRename(
  database: FluidDeckDatabase,
  collectionId: string,
): Promise<void> {
  mutationCounter += 1;
  const joins = await database.resourceCollections
    .where("collectionId")
    .equals(collectionId)
    .toArray();
  const ids = joins.map((join) => join.resourceId);
  if (ids.length === 0) return;
  const resources = await database.resources.bulkGet(ids);
  const context = await loadSearchContext(database, ids);
  for (const resource of resources) {
    if (!resource || resource.deletedAt !== null) continue;
    await applyUpsert(database, resource as Resource, context, false);
  }
}

export async function syncCollectionDeleted(
  database: FluidDeckDatabase,
  collectionId: string,
  affectedResourceIds?: readonly string[],
): Promise<void> {
  mutationCounter += 1;
  const ids = affectedResourceIds ? [...affectedResourceIds] : [];
  if (ids.length === 0) return;
  const resources = await database.resources.bulkGet(ids);
  const context = await loadSearchContext(database, ids);
  for (const resource of resources) {
    if (!resource || resource.deletedAt !== null) continue;
    await applyUpsert(database, resource as Resource, context, false);
  }
}

// Soft delete / restore / purge helpers.
export async function onResourceSoftDeleted(
  first: FluidDeckDatabase | string,
  second?: string,
): Promise<void> {
  const id = typeof first === "string" ? first : (second as string);
  mutationCounter += 1;
  await applyRemoval(id, false);
}

export async function onResourceRestored(
  first: FluidDeckDatabase | Resource,
  second?: Resource,
): Promise<void> {
  let database: FluidDeckDatabase | undefined;
  let resource: Resource | undefined;
  if (isDatabase(first)) {
    database = first;
    resource = second;
    if (!resource && typeof second === "string") {
      const row = await database.resources.get(second);
      resource = row as Resource | undefined;
    }
  } else if (isResource(first)) {
    resource = first;
  }
  mutationCounter += 1;
  if (!resource) return;
  await applyUpsert(database, resource, undefined, false);
}

export async function onResourcePurged(
  first: FluidDeckDatabase | string,
  second?: string,
): Promise<void> {
  const id = typeof first === "string" ? first : (second as string);
  mutationCounter += 1;
  await applyRemoval(id, false);
}

export async function onResourceCreated(
  first: FluidDeckDatabase | Resource,
  second?: Resource | SearchContext,
  third?: SearchContext,
): Promise<void> {
  await addSearchDocument(
    first as FluidDeckDatabase | Resource,
    second as Resource | SearchContext,
    third,
  );
}

// Batch seam (up to 500 rows). No import workflow is implemented here.
export async function syncResourcesBatch(
  first: FluidDeckDatabase | readonly Resource[],
  second?: readonly Resource[] | readonly string[],
  third?: SearchContext,
): Promise<void> {
  let database: FluidDeckDatabase | undefined;
  let items: readonly (Resource | string)[] = [];
  if (isDatabase(first)) {
    database = first;
    items = (second as readonly (Resource | string)[]) ?? [];
  } else {
    items = (first as readonly (Resource | string)[]) ?? [];
  }

  mutationCounter += 1;

  // Resolve strings to resources when a database is available.
  const resources: Resource[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      if (database) {
        const row = await database.resources.get(item);
        if (row) resources.push(row as Resource);
      }
    } else {
      resources.push(item as Resource);
    }
  }

  const BATCH = 500;
  for (let i = 0; i < resources.length; i += BATCH) {
    const chunk = resources.slice(i, i + BATCH);
    const ids = chunk.map((resource) => resource.id);
    const context = database ? await loadSearchContext(database, ids) : third;
    for (const resource of chunk) {
      await applyUpsert(database, resource, context, false);
    }
    if (i + BATCH < resources.length) await yieldToMain();
  }
}

// Generic mutation dispatcher.
export type SearchIndexMutation =
  | { type: "resource-created"; resource: Resource }
  | { type: "resource-updated"; resource: Resource; previous?: Resource; patch?: ResourcePatch }
  | { type: "resource-deleted"; id: string }
  | { type: "resource-soft-deleted"; id: string }
  | { type: "resource-restored"; resource: Resource }
  | { type: "resource-purged"; id: string }
  | { type: "resource-membership-changed"; resourceId: string }
  | { type: "tag-renamed"; tagId: string }
  | { type: "tag-merged"; targetTagId: string }
  | { type: "tag-deleted"; tagId: string; affectedResourceIds?: readonly string[] }
  | { type: "collection-renamed"; collectionId: string }
  | { type: "collection-deleted"; collectionId: string; affectedResourceIds?: readonly string[] }
  | { type: "bulk-import"; resources: readonly Resource[] };

export async function applySearchIndexMutation(
  database: FluidDeckDatabase,
  mutation: SearchIndexMutation,
): Promise<void> {
  switch (mutation.type) {
    case "resource-created":
      await onResourceCreated(database, mutation.resource);
      return;
    case "resource-updated":
      await updateSearchDocument(database, mutation.resource.id, mutation.patch, mutation.previous);
      // Ensure the current row is indexed even if patch omitted.
      await applyUpsert(database, mutation.resource, undefined, false);
      return;
    case "resource-deleted":
    case "resource-soft-deleted":
      await onResourceSoftDeleted(database, mutation.id);
      return;
    case "resource-restored":
      await onResourceRestored(database, mutation.resource);
      return;
    case "resource-purged":
      await onResourcePurged(database, mutation.id);
      return;
    case "resource-membership-changed":
      await syncResourceMembership(database, mutation.resourceId);
      return;
    case "tag-renamed":
      await syncTagRename(database, mutation.tagId);
      return;
    case "tag-merged":
      await syncTagMerge(database, mutation.targetTagId);
      return;
    case "tag-deleted":
      await syncTagDeleted(database, mutation.tagId, mutation.affectedResourceIds);
      return;
    case "collection-renamed":
      await syncCollectionRename(database, mutation.collectionId);
      return;
    case "collection-deleted":
      await syncCollectionDeleted(database, mutation.collectionId, mutation.affectedResourceIds);
      return;
    case "bulk-import":
      await syncResourcesBatch(database, mutation.resources);
      return;
  }
}

// Generic aliases.
export async function syncSearchIndex(
  database: FluidDeckDatabase,
  mutation?: SearchIndexMutation,
): Promise<void> {
  if (mutation) {
    await applySearchIndexMutation(database, mutation);
  } else {
    await rebuildSearchIndex(database);
  }
}
export async function syncSearchIndexFromDatabase(database: FluidDeckDatabase): Promise<void> {
  // Rebuild is the canonical full sync; provided for compatibility.
  await rebuildSearchIndex(database);
}

export function getMutationCounter(): number {
  return mutationCounter;
}

/* ------------------------------------------------------------------ */
/* SEARCH-005 — faceted filtering + 500-result cap                     */
/* ------------------------------------------------------------------ */

export const SEARCH_RESULT_CAP = 500;

export interface FacetDateRange {
  from?: number | string | Date | null;
  to?: number | string | Date | null;
  start?: number | string | Date | null;
  end?: number | string | Date | null;
}

export interface SearchFacetFilters {
  type?: string | string[] | null;
  types?: string | string[] | null;
  resourceType?: string | string[] | null;
  source?: string | string[] | null;
  sources?: string | string[] | null;
  domain?: string | string[] | null;
  domains?: string | string[] | null;
  collection?: string | string[] | null;
  collectionId?: string | string[] | null;
  collectionIds?: string | string[] | null;
  collections?: string | string[] | null;
  tags?: string | string[] | null;
  tagIds?: string | string[] | null;
  tagNames?: string | string[] | null;
  unorganized?: boolean | null;
  unorganised?: boolean | null;
  isUnorganized?: boolean | null;
  dateRange?: FacetDateRange | null;
  date?: FacetDateRange | null;
  from?: number | string | Date | null;
  to?: number | string | Date | null;
  startDate?: number | string | Date | null;
  endDate?: number | string | Date | null;
  createdFrom?: number | string | Date | null;
  createdTo?: number | string | Date | null;
  updatedFrom?: number | string | Date | null;
  updatedTo?: number | string | Date | null;
}

export interface FacetedSearchOptions extends SearchFacetFilters {
  q?: string;
  query?: string;
  search?: string;
  keyword?: string;
  text?: string;
  filters?: SearchFacetFilters | null;
  facets?: SearchFacetFilters | null;
  facet?: SearchFacetFilters | null;
  sort?: string | null;
  orderBy?: string | null;
  limit?: number;
  cap?: number;
  includeDeleted?: boolean;
  includeTrashed?: boolean;
  dateField?: "createdAt" | "updatedAt" | null;
}

export interface FacetCounts {
  type: Record<string, number>;
  source: Record<string, number>;
  domain: Record<string, number>;
  collection: Record<string, number>;
  tag: Record<string, number>;
  unorganized: number;
}

export interface FacetedSearchMetadata {
  resources: Resource[];
  hits: SearchHit[];
  ids: string[];
  total: number;
  totalCount: number;
  count: number;
  truncated: boolean;
  truncatedCount: number;
  omittedCount: number;
  hasMore: boolean;
  partial: boolean;
  sort: string;
  query: string;
  facetCounts: FacetCounts;
  counts: FacetCounts;
  facets: FacetCounts;
  typeCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  domainCounts: Record<string, number>;
  collectionCounts: Record<string, number>;
  tagCounts: Record<string, number>;
  unorganizedCount: number;
  cap: number;
}

export type FacetedSearchResult = Resource[] & FacetedSearchMetadata;

function toNumberDate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return asNumber;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => toStringArray(item));
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return [];
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  return [];
}

function normalizeFilters(input: unknown): SearchFacetFilters {
  if (!input || typeof input !== "object") return {};
  return { ...(input as SearchFacetFilters) };
}

function mergeFilterSources(options: FacetedSearchOptions): SearchFacetFilters {
  const base = normalizeFilters(options.filters ?? options.facets ?? options.facet);
  const flattened: SearchFacetFilters = { ...base };
  const keys: (keyof SearchFacetFilters)[] = [
    "type",
    "types",
    "resourceType",
    "source",
    "sources",
    "domain",
    "domains",
    "collection",
    "collectionId",
    "collectionIds",
    "collections",
    "tags",
    "tagIds",
    "tagNames",
    "unorganized",
    "unorganised",
    "isUnorganized",
    "dateRange",
    "date",
    "from",
    "to",
    "startDate",
    "endDate",
    "createdFrom",
    "createdTo",
    "updatedFrom",
    "updatedTo",
  ];
  for (const key of keys) {
    if (options[key] !== undefined) {
      (flattened as Record<string, unknown>)[key] = options[key];
    }
  }
  return flattened;
}
async function getCollectionDescendants(
  database: FluidDeckDatabase,
  rootId: string,
): Promise<string[]> {
  const all = await database.collections.toArray();
  const childrenByParent = new Map<string, string[]>();
  for (const collection of all) {
    const parentId = collection.parentId ?? "__root__";
    const list = childrenByParent.get(parentId) ?? [];
    list.push(collection.id);
    childrenByParent.set(parentId, list);
  }
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenByParent.get(current) ?? [];
    for (const child of children) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return [...result];
}

async function resolveTagIds(
  database: FluidDeckDatabase,
  filters: SearchFacetFilters,
): Promise<string[]> {
  const selected = [
    ...toStringArray(filters.tags),
    ...toStringArray(filters.tagIds),
    ...toStringArray(filters.tagNames),
  ];
  if (selected.length === 0) return [];
  const tags = await database.tags.toArray();
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const byNormalizedName = new Map(tags.map((tag) => [tag.normalizedName, tag]));
  const resolved = new Set<string>();
  for (const selector of selected) {
    if (byId.has(selector)) {
      resolved.add(selector);
      continue;
    }
    const normalized = normalizeTagName(selector);
    const found = byNormalizedName.get(normalized);
    if (found) resolved.add(found.id);
  }
  return [...resolved];
}

function intersectSets(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const value of a) {
    if (b.has(value)) out.add(value);
  }
  return out;
}

async function collectFacetCandidateIds(
  database: FluidDeckDatabase,
  filters: SearchFacetFilters,
  validIds: Set<string>,
  includeDeleted: boolean,
): Promise<Set<string>> {
  const typeSelected = toStringArray(filters.type ?? filters.types ?? filters.resourceType);
  const sourceSelected = toStringArray(filters.source ?? filters.sources);
  const domainSelected = toStringArray(filters.domain ?? filters.domains);
  const collectionSelectedRaw = toStringArray(
    filters.collection ?? filters.collectionId ?? filters.collectionIds ?? filters.collections,
  );
  const tagIds = await resolveTagIds(database, filters);
  const unorganized =
    filters.unorganized === true || filters.unorganised === true || filters.isUnorganized === true;

  const dateRange = (filters.dateRange ?? filters.date) as FacetDateRange | null | undefined;
  const fromRaw =
    filters.from ??
    filters.startDate ??
    filters.createdFrom ??
    filters.updatedFrom ??
    dateRange?.from ??
    dateRange?.start;
  const toRaw =
    filters.to ??
    filters.endDate ??
    filters.createdTo ??
    filters.updatedTo ??
    dateRange?.to ??
    dateRange?.end;
  const fromDate = toNumberDate(fromRaw);
  const toDate = toNumberDate(toRaw);
  const hasDateRange = fromDate !== null || toDate !== null;

  let result: Set<string> = new Set(validIds);

  if (typeSelected.length > 0) {
    const set = new Set<string>();
    for (const value of typeSelected) {
      const rows = await database.resources.where("type").equals(value).toArray();
      for (const row of rows) {
        if (!includeDeleted && row.deletedAt !== null) continue;
        if (validIds.has(row.id)) set.add(row.id);
      }
    }
    result = intersectSets(result, set);
  }

  if (sourceSelected.length > 0) {
    const set = new Set<string>();
    for (const value of sourceSelected) {
      const rows = await database.resources.where("source").equals(value).toArray();
      for (const row of rows) {
        if (!includeDeleted && row.deletedAt !== null) continue;
        if (validIds.has(row.id)) set.add(row.id);
      }
    }
    result = intersectSets(result, set);
  }

  if (domainSelected.length > 0) {
    const set = new Set<string>();
    for (const value of domainSelected) {
      const rows = await database.resources.where("domain").equals(value).toArray();
      for (const row of rows) {
        if (!includeDeleted && row.deletedAt !== null) continue;
        if (validIds.has(row.id)) set.add(row.id);
      }
    }
    result = intersectSets(result, set);
  }

  if (hasDateRange) {
    const set = new Set<string>();
    const lower = fromDate ?? -Infinity;
    const upper = toDate ?? Infinity;
    const dateField =
      filters.updatedFrom !== undefined || filters.updatedTo !== undefined
        ? "updatedAt"
        : "createdAt";
    let rows: Resource[] = [];
    try {
      rows = (await database.resources
        .where(dateField)
        .between(lower, upper, true, true)
        .toArray()) as Resource[];
    } catch {
      rows = (await database.resources.toArray()) as Resource[];
    }
    for (const row of rows) {
      if (!includeDeleted && row.deletedAt !== null) continue;
      if (validIds.has(row.id)) set.add(row.id);
    }
    if (set.size === 0 && rows.length === 0) {
      const all = await database.resources.toArray();
      for (const row of all) {
        const value = dateField === "updatedAt" ? row.updatedAt : row.createdAt;
        if (value < lower || value > upper) continue;
        if (!includeDeleted && row.deletedAt !== null) continue;
        if (validIds.has(row.id)) set.add(row.id);
      }
    }
    result = intersectSets(result, set);
  }

  if (collectionSelectedRaw.length > 0) {
    const descendantSets = await Promise.all(
      collectionSelectedRaw.map((id) => getCollectionDescendants(database, id)),
    );
    const collectionIds = new Set(descendantSets.flat());
    const set = new Set<string>();
    const joins = await database.resourceCollections.toArray();
    for (const join of joins) {
      if (!collectionIds.has(join.collectionId)) continue;
      if (validIds.has(join.resourceId)) set.add(join.resourceId);
    }
    result = intersectSets(result, set);
  }

  if (tagIds.length > 0) {
    const set = new Set<string>();
    const joins = await database.resourceTags.toArray();
    for (const join of joins) {
      if (!tagIds.includes(join.tagId)) continue;
      if (validIds.has(join.resourceId)) set.add(join.resourceId);
    }
    result = intersectSets(result, set);
  }

  if (unorganized) {
    const memberIds = new Set<string>();
    const joins = await database.resourceCollections.toArray();
    for (const join of joins) memberIds.add(join.resourceId);
    const set = new Set<string>();
    for (const id of validIds) {
      if (!memberIds.has(id)) set.add(id);
    }
    result = intersectSets(result, set);
  }

  return result;
}
async function performFacetedSearch(
  database: FluidDeckDatabase,
  index: SearchIndex | null,
  options: FacetedSearchOptions,
): Promise<FacetedSearchResult> {
  const merged = mergeFilterSources(options);
  const query = String(
    options.q ?? options.query ?? options.search ?? options.keyword ?? options.text ?? "",
  ).trim();
  const includeDeleted = options.includeDeleted === true || options.includeTrashed === true;
  const cap = Math.max(
    1,
    Math.min(options.cap ?? options.limit ?? SEARCH_RESULT_CAP, SEARCH_RESULT_CAP),
  );

  const allResources = includeDeleted
    ? await database.resources.toArray()
    : await listResources(database);
  const resourceById = new Map(allResources.map((row) => [row.id, row as Resource]));
  const validIds = new Set(allResources.map((row) => row.id));

  const facetIds = await collectFacetCandidateIds(database, merged, validIds, includeDeleted);

  const keywordIds: string[] = [];
  const keywordOrder = new Map<string, number>();
  const keywordHitMap = new Map<string, SearchHit>();
  let partial = false;
  if (query.length > 0 && searchWorker && workerIndexReady) {
    const response = await requestWorkerQuery(query, Number.MAX_SAFE_INTEGER, true);
    partial = response.partial;
    response.hits.forEach((hit, position) => {
      const resource = resourceById.get(hit.id);
      if (!resource) return;
      keywordIds.push(hit.id);
      keywordOrder.set(hit.id, position);
      keywordHitMap.set(hit.id, {
        resource,
        score: hit.score,
        matchedTerms: hit.matchedTerms,
        partial,
      });
    });
  } else if (query.length > 0 && index) {
    const { hits, partial: isPartial } = searchIndex(index, query, {
      limit: Number.MAX_SAFE_INTEGER,
    });
    partial = isPartial;
    hits.forEach((hit, position) => {
      keywordIds.push(hit.resource.id);
      keywordOrder.set(hit.resource.id, position);
      keywordHitMap.set(hit.resource.id, hit);
    });
  }

  let candidateIds: Set<string>;
  if (query.length > 0) {
    candidateIds = new Set<string>();
    for (const id of keywordIds) {
      if (facetIds.has(id)) candidateIds.add(id);
    }
  } else {
    candidateIds = new Set(facetIds);
  }

  const candidateResources = [...candidateIds]
    .map((id) => resourceById.get(id))
    .filter((resource): resource is Resource => Boolean(resource));

  const sort = normalizeSortValue(options.sort ?? options.orderBy);
  // Read once: the most-tagged sort and the facet counts below both need these.
  const joinsRC = await database.resourceCollections.toArray();
  const joinsRT = await database.resourceTags.toArray();

  if (sort === "relevance") {
    candidateResources.sort((a, b) => {
      const ia = keywordOrder.has(a.id) ? keywordOrder.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const ib = keywordOrder.has(b.id) ? keywordOrder.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      const ua = a.updatedAt ?? 0;
      const ub = b.updatedAt ?? 0;
      if (ub !== ua) return ub - ua;
      if (a.title !== b.title) return a.title < b.title ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } else if (sort === "updatedAt") {
    candidateResources.sort((a, b) => {
      const ua = a.updatedAt ?? 0;
      const ub = b.updatedAt ?? 0;
      if (ub !== ua) return ub - ua;
      if (a.title !== b.title) return a.title < b.title ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } else if (sort === "createdAt") {
    candidateResources.sort((a, b) => {
      const ca = a.createdAt ?? 0;
      const cb = b.createdAt ?? 0;
      if (cb !== ca) return cb - ca;
      if (a.title !== b.title) return a.title < b.title ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } else if (sort === "createdAtAsc" || sort === "oldest") {
    candidateResources.sort((a, b) => {
      const ca = a.createdAt ?? 0;
      const cb = b.createdAt ?? 0;
      if (ca !== cb) return ca - cb;
      if (a.title !== b.title) return a.title < b.title ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } else if (sort === "title") {
    candidateResources.sort((a, b) => {
      if (a.title !== b.title) return a.title < b.title ? -1 : 1;
      if (a.updatedAt !== b.updatedAt) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } else if (sort === "titleDesc") {
    candidateResources.sort((a, b) => {
      if (a.title !== b.title) return a.title > b.title ? -1 : 1;
      if (a.updatedAt !== b.updatedAt) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } else if (sort === "mostTagged") {
    const countsByResource = new Map<string, number>();
    for (const join of joinsRT) {
      countsByResource.set(join.resourceId, (countsByResource.get(join.resourceId) ?? 0) + 1);
    }
    candidateResources.sort((a, b) => {
      const ca = countsByResource.get(a.id) ?? 0;
      const cb = countsByResource.get(b.id) ?? 0;
      if (cb !== ca) return cb - ca;
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } else if (sort === "recentlyOpened") {
    candidateResources.sort((a, b) => {
      const oa = a.lastOpenedAt ?? 0;
      const ob = b.lastOpenedAt ?? 0;
      if (ob !== oa) return ob - oa;
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  const total = candidateResources.length;
  const capped = candidateResources.slice(0, cap);

  const countResources = candidateResources;
  const typeCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const domainCounts: Record<string, number> = {};
  const collectionCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  let unorganizedCount = 0;

  const finalResourceIds = new Set(countResources.map((r) => r.id));
  const memberIds = new Set(joinsRC.map((j) => j.resourceId));

  for (const resource of countResources) {
    typeCounts[resource.type] = (typeCounts[resource.type] ?? 0) + 1;
    sourceCounts[resource.source] = (sourceCounts[resource.source] ?? 0) + 1;
    domainCounts[resource.domain] = (domainCounts[resource.domain] ?? 0) + 1;
    if (!memberIds.has(resource.id)) unorganizedCount += 1;
  }
  for (const join of joinsRC) {
    if (!finalResourceIds.has(join.resourceId)) continue;
    collectionCounts[join.collectionId] = (collectionCounts[join.collectionId] ?? 0) + 1;
  }
  for (const join of joinsRT) {
    if (!finalResourceIds.has(join.resourceId)) continue;
    tagCounts[join.tagId] = (tagCounts[join.tagId] ?? 0) + 1;
  }

  const facetCounts: FacetCounts = {
    type: typeCounts,
    source: sourceCounts,
    domain: domainCounts,
    collection: collectionCounts,
    tag: tagCounts,
    unorganized: unorganizedCount,
  };

  const hits: SearchHit[] = capped.map((resource) => {
    const existing = keywordHitMap.get(resource.id);
    if (existing) return existing;
    return { resource, score: 0, matchedTerms: [], partial };
  });

  const resultArray = capped as FacetedSearchResult;
  const metadata: FacetedSearchMetadata = {
    resources: capped,
    hits,
    ids: capped.map((r) => r.id),
    total,
    totalCount: total,
    count: total,
    truncated: total > cap,
    truncatedCount: Math.max(0, total - cap),
    omittedCount: Math.max(0, total - cap),
    hasMore: total > cap,
    partial,
    sort,
    query,
    facetCounts,
    counts: facetCounts,
    facets: facetCounts,
    typeCounts,
    sourceCounts,
    domainCounts,
    collectionCounts,
    tagCounts,
    unorganizedCount,
    cap,
  };
  Object.assign(resultArray, metadata);
  return resultArray;
}

function normalizeSortValue(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "") return "relevance";
  // UI-004 sorts with the canonical ViewState vocabulary; legacy aliases stay.
  if (raw === "relevance" || raw === "score" || raw === "rank") return "relevance";
  if (raw === "newest" || raw === "recent") return "createdAt";
  if (raw === "oldest" || raw === "createdatasc") return "createdAtAsc";
  if (raw === "updatedat" || raw === "updated" || raw === "modified") return "updatedAt";
  if (raw === "createdat" || raw === "created" || raw === "newestcreated") return "createdAt";
  if (raw === "title" || raw === "title-asc" || raw === "name" || raw === "alphabetical") {
    return "title";
  }
  if (raw === "title-desc" || raw === "titledesc") return "titleDesc";
  if (raw === "most-tagged" || raw === "mosttagged") return "mostTagged";
  if (raw === "recently-opened" || raw === "recentlyopened") return "recentlyOpened";
  return raw;
}

function isDatabaseForFacet(value: unknown): value is FluidDeckDatabase {
  return (
    typeof value === "object" &&
    value !== null &&
    "resources" in value &&
    typeof (value as { resources?: { get?: unknown } }).resources?.get === "function"
  );
}

function isSearchIndexForFacet(value: unknown): value is SearchIndex {
  return typeof value === "object" && value !== null && "mini" in value && "resourcesById" in value;
}

async function resolveFacetedArgs(
  first: unknown,
  second?: unknown,
  third?: unknown,
  fourth?: unknown,
): Promise<{
  database: FluidDeckDatabase;
  index: SearchIndex | null;
  options: FacetedSearchOptions;
}> {
  let database: FluidDeckDatabase | null = null;
  let index: SearchIndex | null = null;
  let options: FacetedSearchOptions = {};

  if (isDatabaseForFacet(first)) {
    database = first as FluidDeckDatabase;
  } else if (isSearchIndexForFacet(first)) {
    index = first as SearchIndex;
    if (isDatabaseForFacet(second)) database = second as FluidDeckDatabase;
  }

  const candidates = [second, third, fourth];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    if (isDatabaseForFacet(candidate) || isSearchIndexForFacet(candidate)) continue;
    if (typeof candidate === "string") {
      if (options.q === undefined) options.q = candidate;
      else if (options.query === undefined) options.query = candidate;
    } else if (typeof candidate === "object") {
      options = { ...options, ...(candidate as FacetedSearchOptions) };
    }
  }

  if (!database) {
    const state = getSearchIndexState();
    index = index ?? state.index;
  }

  if (!index && database) {
    index = getSearchIndex();
  }

  if (!database) {
    throw new Error("searchFaceted requires a FluidDeckDatabase");
  }

  return { database, index, options };
}

export async function searchFaceted(
  first: unknown,
  second?: unknown,
  third?: unknown,
  fourth?: unknown,
): Promise<FacetedSearchResult> {
  const { database, index, options } = await resolveFacetedArgs(first, second, third, fourth);
  return performFacetedSearch(database, index, options);
}
