/**
 * SEARCH-008 worker core. Pure protocol/state machine behind the worker
 * entrypoint, so recovery and stale-message behaviour is testable without a
 * real Worker. It owns one disposable MiniSearch instance and no Dexie access.
 */
import type MiniSearch from "minisearch";
import { createMiniSearch, queryMiniSearch } from "./search-engine.ts";
import type { SearchDocument, SearchDocumentMeta } from "./search-engine.ts";
import {
  SEARCH_WORKER_PROTOCOL_VERSION,
  isWorkerSearchDocument,
  type WorkerErrorCode,
  type WorkerSearchDocument,
  type WorkerSearchRequest,
  type WorkerSearchResponse,
} from "./search-worker-protocol.ts";

type MiniSearchInstance = MiniSearch<SearchDocument>;

interface PendingBuild {
  buildId: string;
  baseVersion: number;
  total: number;
  seen: number;
  mini: MiniSearchInstance;
  meta: Map<string, SearchDocumentMeta>;
  expectedSeq: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requestIdOf(value: unknown): number | undefined {
  return isObject(value) && typeof value.requestId === "number" ? value.requestId : undefined;
}

function error(
  code: WorkerErrorCode,
  message: string,
  retryable = false,
  requestId?: number,
): WorkerSearchResponse {
  return {
    type: "error",
    code,
    message,
    retryable,
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

function metaOf(document: WorkerSearchDocument): SearchDocumentMeta {
  return { id: document.id, title: document.title, updatedAt: document.updatedAt };
}

function upsert(
  mini: MiniSearchInstance,
  meta: Map<string, SearchDocumentMeta>,
  document: WorkerSearchDocument,
): void {
  if (mini.has(document.id)) mini.replace(document);
  else mini.add(document);
  meta.set(document.id, metaOf(document));
}

export class SearchWorkerCore {
  private mini: MiniSearchInstance | null = null;
  private meta = new Map<string, SearchDocumentMeta>();
  private version = 0;
  private build: PendingBuild | null = null;

  handle(request: unknown): WorkerSearchResponse[] {
    if (!isObject(request) || typeof request.type !== "string") {
      return [error("INVALID_MESSAGE", "Malformed worker request")];
    }

    try {
      switch (request.type as WorkerSearchRequest["type"]) {
        case "init":
          return this.init(request as WorkerSearchRequest);
        case "build:start":
          return this.buildStart(request as WorkerSearchRequest);
        case "build:chunk":
          return this.buildChunk(request as WorkerSearchRequest);
        case "build:commit":
          return this.buildCommit(request as WorkerSearchRequest);
        case "build:cancel":
          return this.buildCancel(request as WorkerSearchRequest);
        case "query":
          return this.query(request as WorkerSearchRequest);
        case "mutate":
          return this.mutate(request as WorkerSearchRequest);
        case "mutate:batch":
          return this.mutateBatch(request as WorkerSearchRequest);
        case "shutdown":
          return [];
        default:
          return [error("INVALID_MESSAGE", "Unknown worker request")];
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return [error("BUILD_FAILED", message, true)];
    }
  }

  private init(request: WorkerSearchRequest): WorkerSearchResponse[] {
    if (request.type !== "init") {
      return [error("INVALID_MESSAGE", "Malformed init request", false, requestIdOf(request))];
    }
    if (typeof request.protocolVersion !== "number") {
      return [error("INVALID_MESSAGE", "Malformed init request", false, request.requestId)];
    }
    if (request.protocolVersion !== SEARCH_WORKER_PROTOCOL_VERSION) {
      return [
        error(
          "PROTOCOL_MISMATCH",
          `Unsupported worker protocol ${request.protocolVersion}`,
          false,
          request.requestId,
        ),
      ];
    }
    return [{ type: "ready", protocolVersion: SEARCH_WORKER_PROTOCOL_VERSION }];
  }

  private buildStart(request: WorkerSearchRequest): WorkerSearchResponse[] {
    if (request.type !== "build:start") {
      return [error("INVALID_MESSAGE", "Malformed build request")];
    }
    if (typeof request.buildId !== "string" || request.buildId === "") {
      return [error("INVALID_MESSAGE", "Build id is required")];
    }
    if (!Number.isInteger(request.total) || request.total < 0) {
      return [error("INVALID_MESSAGE", "Build total must be a non-negative integer")];
    }
    if (request.baseVersion !== this.version) {
      return [error("STALE_BUILD", "Build base version is stale")];
    }
    if (this.build) {
      return [error("STALE_BUILD", "A build is already in progress")];
    }

    this.build = {
      buildId: request.buildId,
      baseVersion: request.baseVersion,
      total: request.total,
      seen: 0,
      mini: createMiniSearch(),
      meta: new Map(),
      expectedSeq: 0,
    };
    return [];
  }

  private buildChunk(request: WorkerSearchRequest): WorkerSearchResponse[] {
    if (request.type !== "build:chunk") {
      return [error("INVALID_MESSAGE", "Malformed build chunk")];
    }
    const build = this.build;
    if (!build || build.buildId !== request.buildId) {
      return [error("STALE_BUILD", "Build id does not match the active build")];
    }
    if (request.seq !== build.expectedSeq) {
      return [error("STALE_BUILD", "Build chunk sequence is out of order")];
    }
    if (!Array.isArray(request.documents) || !request.documents.every(isWorkerSearchDocument)) {
      return [error("INVALID_MESSAGE", "Build chunk contains an invalid document")];
    }
    if (build.seen + request.documents.length > build.total) {
      return [error("BUILD_FAILED", "Build chunk exceeds the declared document total")];
    }

    for (const document of request.documents) upsert(build.mini, build.meta, document);
    build.expectedSeq += 1;
    build.seen += request.documents.length;
    return [
      {
        type: "build:progress",
        buildId: build.buildId,
        done: build.seen,
        total: build.total,
      },
    ];
  }

  private buildCommit(request: WorkerSearchRequest): WorkerSearchResponse[] {
    if (request.type !== "build:commit") {
      return [error("INVALID_MESSAGE", "Malformed build commit")];
    }
    const build = this.build;
    if (!build || build.buildId !== request.buildId) {
      return [error("STALE_BUILD", "Build id does not match the active build")];
    }
    if (request.baseVersion !== this.version || build.baseVersion !== this.version) {
      return [error("STALE_BUILD", "Build base version is stale")];
    }
    if (build.seen !== build.total) {
      return [error("BUILD_FAILED", "Build is incomplete")];
    }

    this.mini = build.mini;
    this.meta = build.meta;
    this.version += 1;
    this.build = null;
    return [
      {
        type: "build:done",
        buildId: request.buildId,
        indexVersion: this.version,
        documentCount: this.mini.documentCount,
      },
    ];
  }

  private buildCancel(request: WorkerSearchRequest): WorkerSearchResponse[] {
    if (request.type !== "build:cancel") {
      return [error("INVALID_MESSAGE", "Malformed build cancellation")];
    }
    if (this.build?.buildId === request.buildId) this.build = null;
    return [];
  }

  private query(request: WorkerSearchRequest): WorkerSearchResponse[] {
    if (request.type !== "query") {
      return [error("INVALID_MESSAGE", "Malformed query")];
    }
    if (typeof request.q !== "string") {
      return [error("INVALID_MESSAGE", "Malformed query", false, request.requestId)];
    }
    if (request.indexVersion !== this.version) {
      return [error("STALE_VERSION", "Query index version is stale", false, request.requestId)];
    }
    if (!this.mini) {
      return [error("NOT_READY", "Search index is not ready", true, request.requestId)];
    }
    if (!Number.isInteger(request.limit) || request.limit < 1) {
      return [error("INVALID_MESSAGE", "Query limit must be positive", false, request.requestId)];
    }

    const result = queryMiniSearch(this.mini, request.q, this.meta, request.limit);
    return [
      {
        type: "query:result",
        requestId: request.requestId,
        indexVersion: this.version,
        partial: result.partial,
        hits: result.hits,
        truncated: result.total > request.limit,
      },
    ];
  }

  private mutate(request: WorkerSearchRequest): WorkerSearchResponse[] {
    if (request.type !== "mutate") {
      return [error("INVALID_MESSAGE", "Malformed mutation")];
    }
    if (typeof request.requestId !== "number") {
      return [error("INVALID_MESSAGE", "Mutation request id is required")];
    }
    if (request.indexVersion !== this.version) {
      return [error("STALE_VERSION", "Mutation index version is stale", false, request.requestId)];
    }
    if (!this.mini) {
      return [error("NOT_READY", "Search index is not ready", true, request.requestId)];
    }

    if (request.op === "upsert") {
      if (!isWorkerSearchDocument(request.document)) {
        return [error("INVALID_MESSAGE", "Invalid mutation document", false, request.requestId)];
      }
      upsert(this.mini, this.meta, request.document);
    } else {
      if (typeof request.id !== "string") {
        return [error("INVALID_MESSAGE", "Invalid removal id", false, request.requestId)];
      }
      if (this.mini.has(request.id)) this.mini.discard(request.id);
      this.meta.delete(request.id);
    }

    this.version += 1;
    return [{ type: "mutation:ack", requestId: request.requestId, indexVersion: this.version }];
  }

  private mutateBatch(request: WorkerSearchRequest): WorkerSearchResponse[] {
    if (request.type !== "mutate:batch") {
      return [error("INVALID_MESSAGE", "Malformed batch mutation")];
    }
    if (typeof request.requestId !== "number") {
      return [error("INVALID_MESSAGE", "Mutation request id is required")];
    }
    if (request.indexVersion !== this.version) {
      return [error("STALE_VERSION", "Mutation index version is stale", false, request.requestId)];
    }
    if (!this.mini) {
      return [error("NOT_READY", "Search index is not ready", true, request.requestId)];
    }
    if (
      !Array.isArray(request.upserts) ||
      !request.upserts.every(isWorkerSearchDocument) ||
      !Array.isArray(request.removals) ||
      !request.removals.every((id) => typeof id === "string")
    ) {
      return [error("INVALID_MESSAGE", "Invalid batch mutation", false, request.requestId)];
    }

    for (const document of request.upserts) upsert(this.mini, this.meta, document);
    for (const id of request.removals) {
      if (this.mini.has(id)) this.mini.discard(id);
      this.meta.delete(id);
    }
    this.version += 1;
    return [{ type: "mutation:ack", requestId: request.requestId, indexVersion: this.version }];
  }
}
