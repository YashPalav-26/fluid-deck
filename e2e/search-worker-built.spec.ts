/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from "@playwright/test";

test("Vite-built module worker loads and speaks protocol v1", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();

  const indexSrc = await page.locator('script[type="module"]').first().getAttribute("src");
  expect(indexSrc).toBeTruthy();
  const workerUrl = await page.evaluate(async (src) => {
    const text = await (await fetch(src!)).text();
    const match = text.match(/(?:assets\/)?search\.worker-[A-Za-z0-9_-]+\.js/);
    if (!match) throw new Error("search worker asset not referenced by the production entry chunk");
    return new URL(match[0], location.origin).href;
  }, indexSrc);

  expect((await page.request.get(workerUrl)).status()).toBe(200);

  const result = await page.evaluate(async (url) => {
    const worker = new Worker(url, { type: "module" });
    let requestId = 0;
    const pending = new Map<
      number,
      { resolve: (value: any) => void; reject: (error: Error) => void }
    >();
    const waiters = new Map<
      string,
      { resolve: (value: any) => void; reject: (error: Error) => void }
    >();
    worker.onmessage = (event) => {
      const data = event.data as any;
      if (data?.type === "error" && data.requestId !== undefined) {
        pending.get(data.requestId)?.reject(new Error(data.code + ": " + data.message));
        pending.delete(data.requestId);
        return;
      }
      if (data?.type === "error") {
        waiters.get(data.code)?.reject(new Error(data.code + ": " + data.message));
        waiters.delete(data.code);
        return;
      }
      if (data?.requestId !== undefined && pending.has(data.requestId)) {
        pending.get(data.requestId)!.resolve(data);
        pending.delete(data.requestId);
      }
      if (data?.type === "build:done" || data?.type === "ready") {
        waiters.get(data.type)?.resolve(data);
        waiters.delete(data.type);
      }
    };
    worker.onerror = (event) => {
      for (const entry of pending.values())
        entry.reject(new Error(event.message || "worker error"));
      for (const entry of waiters.values())
        entry.reject(new Error(event.message || "worker error"));
      pending.clear();
      waiters.clear();
    };
    const request = (body: any, expected: string) =>
      new Promise<any>((resolve, reject) => {
        const id = ++requestId;
        pending.set(id, { resolve, reject });
        worker.postMessage({ ...body, requestId: id });
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error(`timeout waiting for ${expected}`));
        }, 10_000);
      });
    const waitForType = (type: string) =>
      new Promise<any>((resolve, reject) => {
        waiters.set(type, { resolve, reject });
        setTimeout(() => {
          if (!waiters.has(type)) return;
          waiters.delete(type);
          reject(new Error(`timeout waiting for ${type}`));
        }, 10_000);
      });

    const readyWait = waitForType("ready");
    worker.postMessage({ type: "init", requestId: ++requestId, protocolVersion: 1 });
    const ready = await readyWait;
    if (ready.protocolVersion !== 1) throw new Error("protocol mismatch");

    const build = async (version: number, docs: any[]) => {
      worker.postMessage({
        type: "build:start",
        buildId: `built-${version}`,
        baseVersion: version,
        total: docs.length,
      });
      for (let i = 0; i < docs.length; i += 200) {
        worker.postMessage({
          type: "build:chunk",
          buildId: `built-${version}`,
          seq: i / 200,
          documents: docs.slice(i, i + 200),
        });
      }
      const wait = waitForType("build:done");
      worker.postMessage({
        type: "build:commit",
        buildId: `built-${version}`,
        baseVersion: version,
      });
      return wait;
    };

    const empty = await build(0, []);
    const emptyQuery = await request(
      { type: "query", indexVersion: empty.indexVersion, q: "alpha", limit: 1000, idsOnly: true },
      "query:result",
    );

    const docs = Array.from({ length: 50 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      title: i % 2 === 0 ? `built alpha ${i}` : `built beta ${i}`,
      tagsText: "",
      description: "",
      urlText: "",
      collectionsText: "",
      typeText: "article",
      updatedAt: 1_700_000_000_000 + i,
    }));
    const built = await build(empty.indexVersion, docs);
    const query = await request(
      { type: "query", indexVersion: built.indexVersion, q: "alpha", limit: 1000, idsOnly: true },
      "query:result",
    );
    const stale = await request(
      { type: "query", indexVersion: empty.indexVersion, q: "alpha", limit: 10, idsOnly: true },
      "query:result",
    ).then(
      () => null,
      (error) => String(error.message),
    );

    const freshDoc = {
      ...docs[0],
      id: "00000000-0000-4000-8000-000000000999",
      title: "built freshterm",
    };
    const mutation = await request(
      {
        type: "mutate",
        indexVersion: built.indexVersion,
        op: "upsert",
        document: freshDoc,
      },
      "mutation:ack",
    );
    const fresh = await request(
      {
        type: "query",
        indexVersion: mutation.indexVersion,
        q: "freshterm",
        limit: 10,
        idsOnly: true,
      },
      "query:result",
    );
    const removal = await request(
      {
        type: "mutate",
        indexVersion: mutation.indexVersion,
        op: "remove",
        id: freshDoc.id,
      },
      "mutation:ack",
    );
    const removed = await request(
      {
        type: "query",
        indexVersion: removal.indexVersion,
        q: "freshterm",
        limit: 10,
        idsOnly: true,
      },
      "query:result",
    );

    worker.terminate();
    return {
      workerUrl: url,
      emptyHits: emptyQuery.hits.length,
      documentCount: built.documentCount,
      alphaHits: query.hits.length,
      staleError: stale,
      mutationVersion: mutation.indexVersion,
      freshHits: fresh.hits.length,
      removedHits: removed.hits.length,
    };
  }, workerUrl);

  expect(result.workerUrl).toContain("search.worker-");
  expect(result.emptyHits).toBe(0);
  expect(result.documentCount).toBe(50);
  expect(result.alphaHits).toBe(25);
  expect(result.staleError).toContain("STALE_VERSION");
  expect(result.mutationVersion).toBeGreaterThan(2);
  expect(result.freshHits).toBe(1);
  expect(result.removedHits).toBe(0);
});
