/**
 * SEARCH-007/008 internal Search Worker protocol. Version 1 only; this is a
 * same-origin, in-app message contract, not a network or extension protocol.
 */
import type { SearchDocument } from "./search-engine.ts";

export const SEARCH_WORKER_PROTOCOL_VERSION = 1 as const;

export type WorkerSearchDocument = SearchDocument;

export type WorkerSearchRequest =
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
  | {
      type: "mutate";
      requestId: number;
      indexVersion: number;
      op: "upsert";
      document: WorkerSearchDocument;
    }
  | { type: "mutate"; requestId: number; indexVersion: number; op: "remove"; id: string }
  | {
      type: "mutate:batch";
      requestId: number;
      indexVersion: number;
      upserts: WorkerSearchDocument[];
      removals: string[];
    }
  | { type: "shutdown"; requestId: number };

export type WorkerErrorCode =
  | "NOT_READY"
  | "PROTOCOL_MISMATCH"
  | "STALE_VERSION"
  | "STALE_BUILD"
  | "INVALID_MESSAGE"
  | "BUILD_FAILED"
  | "QUERY_FAILED"
  | "MUTATION_FAILED"
  | "CANCELLED";

export interface WorkerSearchHit {
  id: string;
  score: number;
  matchedTerms: string[];
}

export type WorkerSearchResponse =
  | { type: "ready"; protocolVersion: 1 }
  | { type: "build:progress"; buildId: string; done: number; total: number }
  | { type: "build:done"; buildId: string; indexVersion: number; documentCount: number }
  | {
      type: "query:result";
      requestId: number;
      indexVersion: number;
      partial: boolean;
      hits: WorkerSearchHit[];
      truncated: boolean;
    }
  | { type: "mutation:ack"; requestId: number; indexVersion: number }
  | {
      type: "error";
      requestId?: number;
      code: WorkerErrorCode;
      message: string;
      retryable: boolean;
    };

export function isWorkerSearchDocument(value: unknown): value is WorkerSearchDocument {
  if (typeof value !== "object" || value === null) return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.id === "string" &&
    typeof doc.title === "string" &&
    typeof doc.tagsText === "string" &&
    typeof doc.description === "string" &&
    typeof doc.urlText === "string" &&
    typeof doc.collectionsText === "string" &&
    typeof doc.typeText === "string" &&
    typeof doc.updatedAt === "number" &&
    Number.isFinite(doc.updatedAt)
  );
}
