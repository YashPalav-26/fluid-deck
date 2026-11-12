import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceSchema } from "@fluid-deck/core";
import type { Resource } from "@fluid-deck/core";
import { FluidDeckDatabase } from "../persistence/db.ts";
import { SearchWorkerCore } from "./search-worker-core.ts";
import type { WorkerSearchRequest, WorkerSearchResponse } from "./search-worker-protocol.ts";
import {
  cancelSearchIndexBuild,
  getSearchIndexState,
  searchFaceted,
  startSearch,
  syncResource,
  type SearchWorkerLike,
} from "./search.ts";

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeResource(id: number, title: string, overrides: Partial<Resource> = {}): Resource {
  const now = 1000 + id;
  return resourceSchema.parse({
    id: UUID(id),
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title,
    description: "",
    thumbnailUrl: "",
    faviconUrl: "",
    domain: "example.com",
    type: "article",
    source: "extension",
    notes: "",
    extractionStatus: "complete",
    extractionNotes: [],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null,
    deletedAt: null,
    ...overrides,
  });
}

interface FakeWorkerOptions {
  failInit?: boolean;
  failCommit?: boolean;
  staleQuery?: boolean;
  staleFirstQuery?: boolean;
  malformedQuery?: boolean;
  onRequest?: (request: WorkerSearchRequest) => void;
}

class FakeWorker implements SearchWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  private readonly core = new SearchWorkerCore();
  private readonly options: FakeWorkerOptions;
  private terminated = false;
  private staleQuerySent = false;

  constructor(options: FakeWorkerOptions = {}) {
    this.options = options;
  }

  postMessage(request: WorkerSearchRequest): void {
    this.options.onRequest?.(request);
    if (this.terminated) return;
    if (request.type === "init" && this.options.failInit) {
      this.deliver({
        type: "error",
        requestId: request.requestId,
        code: "BUILD_FAILED",
        message: "init failed",
        retryable: true,
      });
      return;
    }
    if (request.type === "build:commit" && this.options.failCommit) {
      this.deliver({
        type: "error",
        code: "BUILD_FAILED",
        message: "commit failed",
        retryable: true,
      });
      return;
    }

    const staleOnce =
      request.type === "query" && this.options.staleFirstQuery && !this.staleQuerySent;
    if (staleOnce) this.staleQuerySent = true;
    for (const response of this.core.handle(request)) {
      if (request.type === "query" && (this.options.staleQuery || staleOnce)) {
        this.deliver({ ...response, indexVersion: 0 } as WorkerSearchResponse);
      } else if (request.type === "query" && this.options.malformedQuery) {
        this.deliver("not-a-response");
      } else {
        this.deliver(response);
      }
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  crash(): void {
    this.terminated = true;
    this.onerror?.({ message: "worker crashed" } as ErrorEvent);
  }

  private deliver(data: unknown): void {
    queueMicrotask(() => {
      if (this.terminated) return;
      this.onmessage?.({ data } as MessageEvent<unknown>);
    });
  }
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for condition");
}

async function queryIds(database: FluidDeckDatabase, q: string): Promise<string[]> {
  return (await searchFaceted(database, { q })).ids;
}

let database: FluidDeckDatabase;

beforeEach(async () => {
  database = new FluidDeckDatabase(`fluid-deck-test-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe("SEARCH-008 worker recovery and fallback", () => {
  it("starts on a worker and serves queries without a main-thread index", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    await database.resources.add(makeResource(2, "Vue Basics"));

    await startSearch(database, { workerFactory: () => new FakeWorker() });
    const state = getSearchIndexState();
    expect(state.status).toBe("ready");
    expect(state.engine).toBe("worker");
    expect(state.index).toBeNull();
    expect(await queryIds(database, "react")).toEqual([UUID(1)]);
  });

  it("reaches ready on a worker for an empty library", async () => {
    await startSearch(database, { workerFactory: () => new FakeWorker() });
    const state = getSearchIndexState();
    expect(state.status).toBe("ready");
    expect(state.engine).toBe("worker");
    expect(await queryIds(database, "anything")).toEqual([]);
  });

  it("applies a committed mutation while a worker build is in flight", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    const late = makeResource(2, "Late Worker Capture");

    let syncDone: Promise<void> | null = null;
    const workerFactory = () =>
      new FakeWorker({
        onRequest: (request) => {
          if (request.type !== "build:start" || syncDone) return;
          syncDone = (async () => {
            await database.resources.add(late);
            await syncResource(database, late);
          })();
        },
      });

    await startSearch(database, { workerFactory });
    await syncDone;
    await waitFor(async () => (await queryIds(database, "late worker")).includes(late.id));
    expect(await queryIds(database, "late worker")).toEqual([late.id]);
  });

  it("retries one fresh worker after startup failure", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    let attempts = 0;
    const workerFactory = () => new FakeWorker({ failInit: attempts++ === 0 });

    await startSearch(database, { workerFactory });
    const state = getSearchIndexState();
    expect(attempts).toBe(2);
    expect(state.status).toBe("ready");
    expect(state.engine).toBe("worker");
    expect(state.index).toBeNull();
  });

  it("retries once after a stale query response", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));

    await startSearch(database, { workerFactory: () => new FakeWorker({ staleFirstQuery: true }) });
    expect(await queryIds(database, "react")).toEqual([UUID(1)]);
  });

  it("cancels an in-flight worker build without publishing it", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    const workerFactory = () =>
      new FakeWorker({
        onRequest: (request) => {
          if (request.type === "build:start") cancelSearchIndexBuild();
        },
      });

    await expect(startSearch(database, { workerFactory })).rejects.toThrow();
    expect(getSearchIndexState().status).not.toBe("ready");
    expect(getSearchIndexState().index).toBeNull();
  });

  it("restarts after a failed build commit", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    let attempts = 0;
    const workerFactory = () => new FakeWorker({ failCommit: attempts++ === 0 });

    await startSearch(database, { workerFactory });
    const state = getSearchIndexState();
    expect(attempts).toBe(2);
    expect(state.status).toBe("ready");
    expect(state.engine).toBe("worker");
    expect(await queryIds(database, "react")).toEqual([UUID(1)]);
  });

  it("rebuilds on a fresh worker after a runtime crash", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    const workers: FakeWorker[] = [];
    const workerFactory = () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    };

    await startSearch(database, { workerFactory });
    expect(getSearchIndexState().engine).toBe("worker");
    workers[0]!.crash();

    await waitFor(() => {
      const state = getSearchIndexState();
      return state.status === "ready" && state.engine === "worker" && workers.length === 2;
    });
    expect(await queryIds(database, "react")).toEqual([UUID(1)]);
  });

  it("treats malformed worker responses as a crash and recovers", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    const workers: FakeWorker[] = [];
    let malformed = true;
    const workerFactory = () => {
      const worker = new FakeWorker({ malformedQuery: malformed });
      malformed = false;
      workers.push(worker);
      return worker;
    };

    await startSearch(database, { workerFactory });
    await expect(queryIds(database, "react")).rejects.toThrow();
    await waitFor(() => {
      const state = getSearchIndexState();
      return state.status === "ready" && workers.length === 2;
    });
    expect(await queryIds(database, "react")).toEqual([UUID(1)]);
  });

  it("falls back to the main thread after bounded worker failures", async () => {
    await database.resources.add(makeResource(1, "React Hooks"));
    let attempts = 0;
    const workerFactory = () => {
      attempts += 1;
      return new FakeWorker({ failInit: true });
    };

    await startSearch(database, { workerFactory });
    const state = getSearchIndexState();
    expect(attempts).toBe(2);
    expect(state.status).toBe("ready");
    expect(state.engine).toBe("main");
    expect(state.index).not.toBeNull();
    expect(await queryIds(database, "react")).toEqual([UUID(1)]);
  });
});
