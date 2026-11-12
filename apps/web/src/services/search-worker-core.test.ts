import { describe, expect, it } from "vitest";
import { SearchWorkerCore } from "./search-worker-core.ts";
import type { WorkerSearchDocument, WorkerSearchResponse } from "./search-worker-protocol.ts";

function doc(id: string, title: string, updatedAt = 1): WorkerSearchDocument {
  return {
    id,
    title,
    tagsText: "",
    description: "",
    urlText: "",
    collectionsText: "",
    typeText: "article",
    updatedAt,
  };
}

function build(core: SearchWorkerCore, documents: WorkerSearchDocument[], buildId = "b1") {
  const responses: WorkerSearchResponse[] = [
    ...core.handle({ type: "init", requestId: 1, protocolVersion: 1 }),
    ...core.handle({ type: "build:start", buildId, baseVersion: 0, total: documents.length }),
    ...core.handle({
      type: "build:chunk",
      buildId,
      seq: 0,
      documents,
    }),
    ...core.handle({ type: "build:commit", buildId, baseVersion: 0 }),
  ];
  return responses;
}

describe("SEARCH-008 worker core protocol", () => {
  it("initializes only protocol version 1", () => {
    const core = new SearchWorkerCore();
    expect(core.handle({ type: "init", requestId: 1, protocolVersion: 1 })).toEqual([
      { type: "ready", protocolVersion: 1 },
    ]);
    const mismatch = core.handle({ type: "init", requestId: 2, protocolVersion: 2 });
    expect(mismatch[0]).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH" });
  });

  it("builds and queries an index", () => {
    const core = new SearchWorkerCore();
    const responses = build(core, [doc("a", "React Hooks"), doc("b", "Vue Basics")]);
    expect(responses.at(-1)).toMatchObject({ type: "build:done", indexVersion: 1 });

    const result = core.handle({
      type: "query",
      requestId: 3,
      indexVersion: 1,
      q: "react",
      limit: 10,
      idsOnly: true,
    });
    expect(result[0]).toMatchObject({
      type: "query:result",
      indexVersion: 1,
      hits: [{ id: "a" }],
    });
  });

  it("rejects stale builds, sequences, versions, and malformed documents", () => {
    const core = new SearchWorkerCore();
    expect(
      core.handle({ type: "build:start", buildId: "b1", baseVersion: 9, total: 1 })[0],
    ).toMatchObject({ type: "error", code: "STALE_BUILD" });
    build(core, [doc("a", "React")]);

    expect(
      core.handle({
        type: "query",
        requestId: 4,
        indexVersion: 0,
        q: "react",
        limit: 5,
        idsOnly: true,
      })[0],
    ).toMatchObject({ type: "error", code: "STALE_VERSION" });

    expect(core.handle({ type: "build:start", buildId: "b2", baseVersion: 1, total: 1 })).toEqual(
      [],
    );
    expect(
      core.handle({ type: "build:chunk", buildId: "b2", seq: 1, documents: [doc("b", "Vue")] })[0],
    ).toMatchObject({ type: "error", code: "STALE_BUILD" });
    expect(
      core.handle({
        type: "build:chunk",
        buildId: "b2",
        seq: 0,
        documents: [{ id: "b" }],
      })[0],
    ).toMatchObject({ type: "error", code: "INVALID_MESSAGE" });
  });

  it("applies upserts, removals, and batches monotonically", () => {
    const core = new SearchWorkerCore();
    build(core, [doc("a", "React")]);

    expect(
      core.handle({
        type: "mutate",
        requestId: 5,
        indexVersion: 1,
        op: "upsert",
        document: doc("b", "Vue"),
      })[0],
    ).toEqual({ type: "mutation:ack", requestId: 5, indexVersion: 2 });

    expect(
      core.handle({
        type: "mutate:batch",
        requestId: 6,
        indexVersion: 2,
        upserts: [doc("c", "Svelte")],
        removals: ["a"],
      })[0],
    ).toEqual({ type: "mutation:ack", requestId: 6, indexVersion: 3 });

    const result = core.handle({
      type: "query",
      requestId: 7,
      indexVersion: 3,
      q: "react vue svelte",
      limit: 10,
      idsOnly: true,
    });
    expect(result[0]).toMatchObject({ type: "query:result" });
  });

  it("cancels an interrupted build without publishing it", () => {
    const core = new SearchWorkerCore();
    core.handle({ type: "build:start", buildId: "b1", baseVersion: 0, total: 2 });
    core.handle({ type: "build:chunk", buildId: "b1", seq: 0, documents: [doc("a", "React")] });
    expect(core.handle({ type: "build:cancel", buildId: "b1" })).toEqual([]);
    expect(core.handle({ type: "build:commit", buildId: "b1", baseVersion: 0 })[0]).toMatchObject({
      type: "error",
      code: "STALE_BUILD",
    });
    expect(
      core.handle({
        type: "query",
        requestId: 8,
        indexVersion: 0,
        q: "react",
        limit: 5,
        idsOnly: true,
      })[0],
    ).toMatchObject({ type: "error", code: "NOT_READY" });
  });
});
