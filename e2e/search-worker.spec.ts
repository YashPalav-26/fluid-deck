/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from "@playwright/test";

async function openApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const state = {
      instances: [] as unknown[],
      blockFuture: false,
    };
    (window as any).__fdWorkerState = state;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        if (state.blockFuture) {
          const silent = {
            onmessage: null,
            onerror: null,
            onmessageerror: null,
            postMessage() {},
            terminate() {},
          };
          state.instances.push(silent);
          return silent;
        }
        const worker = Reflect.construct(target, args);
        state.instances.push(worker);
        return worker;
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fluid Deck" })).toBeVisible();
  // Let the app's own empty-database startup finish before swapping databases.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const search = await import("/src/services/search.ts");
        return search.getSearchIndexState().status;
      }),
    )
    .toBe("ready");
}

interface FixtureOptions {
  count?: number;
  concurrentWrite?: boolean;
  empty?: boolean;
}

async function startFixture(page: Page, options: FixtureOptions = {}) {
  return page.evaluate(async (options) => {
    const dbMod = await import("/src/persistence/db.ts");
    const search = await import("/src/services/search.ts");
    const resourcesRepo = await import("/src/repositories/resources.ts");
    const db = new dbMod.FluidDeckDatabase(
      `fluid-deck-e2e-search-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    (window as any).__fdDb = db;
    await db.open();

    const count = options.count ?? 0;
    const now = 1_700_000_000_000;
    const rows = Array.from({ length: count }, (_, i) => {
      const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
      return {
        id,
        url: `https://fixture.example.com/${i + 1}`,
        canonicalUrl: `https://fixture.example.com/${i + 1}`,
        title: i % 2 === 0 ? `browser alpha fixture ${i + 1}` : `browser beta fixture ${i + 1}`,
        description: "deterministic browser fixture",
        thumbnailUrl: "",
        faviconUrl: "",
        domain: "fixture.example.com",
        type: "article",
        source: "extension",
        notes: "",
        extractionStatus: "complete",
        extractionNotes: [],
        createdAt: now + i,
        updatedAt: now + i,
        lastOpenedAt: null,
        deletedAt: null,
      };
    });
    if (rows.length > 0) await db.resources.bulkAdd(rows);

    let concurrentId: string | null = null;
    let concurrentError: string | null = null;
    const concurrent = options.concurrentWrite
      ? (async () => {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1));
            const created = await resourcesRepo.createResource(db, {
              url: "https://fixture.example.com/during-build",
              title: "browser latewrite during build",
              description: "committed while the worker build was running",
              type: "article",
              source: "extension",
              notes: "",
              extractionStatus: "complete",
              extractionNotes: [],
            });
            await search.syncResource(db, created.resource.id);
            concurrentId = created.resource.id;
          } catch (error) {
            concurrentError = error instanceof Error ? error.message : String(error);
          }
        })()
      : Promise.resolve();

    await search.startSearch(db);
    await concurrent;

    const state = search.getSearchIndexState();
    const query = async (q: string) => (await search.searchFaceted(db, { q })).ids;
    const alphaIds = await query("alpha");
    const betaIds = await query("beta");
    const lateIds = concurrentId ? await query("latewrite") : [];
    const persisted = concurrentId ? Boolean(await db.resources.get(concurrentId)) : null;

    return {
      engine: state.engine,
      status: state.status,
      alphaCount: alphaIds.length,
      betaCount: betaIds.length,
      lateIds,
      persisted,
      concurrentId,
      concurrentError,
      workerCount: ((window as any).__fdWorkerState?.instances as unknown[]).length,
    };
  }, options);
}

async function searchInPage(page: Page, q: string): Promise<string[]> {
  return page.evaluate(async (q) => {
    const search = await import("/src/services/search.ts");
    const db = (window as any).__fdDb;
    return (await search.searchFaceted(db, { q })).ids;
  }, q);
}

test.describe("search worker browser integration", () => {
  test("loads, builds, queries, and applies committed mutations", async ({ page }) => {
    test.setTimeout(90_000);
    await openApp(page);
    const result = await startFixture(page, { count: 3 });

    expect(result.status).toBe("ready");
    expect(result.engine).toBe("worker");
    expect(result.workerCount).toBeGreaterThanOrEqual(1);
    expect(result.alphaCount).toBe(2);
    expect(result.betaCount).toBe(1);

    const created = await page.evaluate(async () => {
      const search = await import("/src/services/search.ts");
      const resourcesRepo = await import("/src/repositories/resources.ts");
      const db = (window as any).__fdDb;
      const row = await resourcesRepo.createResource(db, {
        url: "https://fixture.example.com/mutation",
        title: "browser mutation term",
        description: "created after Dexie commit",
        type: "article",
        source: "extension",
        notes: "",
        extractionStatus: "complete",
        extractionNotes: [],
      });
      await search.syncResource(db, row.resource.id);
      return { id: row.resource.id, persisted: Boolean(await db.resources.get(row.resource.id)) };
    });

    expect(created.persisted).toBe(true);
    expect(await searchInPage(page, "mutation")).toEqual([created.id]);
    expect(
      await page.evaluate(async () => {
        const search = await import("/src/services/search.ts");
        return search.getSearchIndexState().engine;
      }),
    ).toBe("worker");
  });

  test("starts and queries an empty library", async ({ page }) => {
    test.setTimeout(90_000);
    await openApp(page);
    const result = await startFixture(page, { empty: true });
    expect(result.status).toBe("ready");
    expect(result.engine).toBe("worker");
    expect(result.alphaCount).toBe(0);
  });

  test("keeps a committed write made during the build", async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    const result = await startFixture(page, { count: 5000, concurrentWrite: true });
    expect(result.concurrentError).toBeNull();
    expect(result.concurrentId).toBeTruthy();
    expect(result.persisted).toBe(true);
    expect(result.lateIds).toEqual([result.concurrentId]);
    expect(result.engine).toBe("worker");
  });

  test("recovers from a worker crash on a fresh worker", async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    const before = await startFixture(page, { count: 10 });
    expect(before.engine).toBe("worker");

    await page.evaluate(() => {
      const state = (window as any).__fdWorkerState;
      const worker = state.instances[state.instances.length - 1] as Worker;
      worker.onerror?.(new ErrorEvent("error", { message: "e2e simulated worker crash" }));
    });

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const search = await import("/src/services/search.ts");
            const state = search.getSearchIndexState();
            return {
              status: state.status,
              engine: state.engine,
              workers: ((window as any).__fdWorkerState.instances as unknown[]).length,
            };
          }),
        { timeout: 30_000 },
      )
      .toMatchObject({ status: "ready", engine: "worker" });
    expect(
      (await page.evaluate(() => (window as any).__fdWorkerState.instances.length)) as number,
    ).toBeGreaterThan(1);
    expect(await searchInPage(page, "alpha")).toHaveLength(5);
  });
});

test.describe("search worker hang evidence", () => {
  test("a silent worker termination delays recovery by the request timeout", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "delay evidence recorded in Chromium");
    test.setTimeout(90_000);
    await openApp(page);
    await startFixture(page, { count: 5 });

    const elapsed = await page.evaluate(async () => {
      const search = await import("/src/services/search.ts");
      const db = (window as any).__fdDb;
      const state = (window as any).__fdWorkerState;
      const worker = state.instances[state.instances.length - 1] as Worker;
      const started = performance.now();
      worker.terminate();
      await search.searchFaceted(db, { q: "alpha" }).catch(() => undefined);
      while (search.getSearchIndexState().status !== "ready") {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return performance.now() - started;
    });

    console.log(`HANG_RECOVERY_MS ${Math.round(elapsed)}`);
    expect(elapsed).toBeGreaterThan(14_000);
    expect(elapsed).toBeLessThan(30_000);
    expect(
      await page.evaluate(async () => {
        const search = await import("/src/services/search.ts");
        return search.getSearchIndexState().engine;
      }),
    ).toBe("worker");
  });
});

test.describe("search worker fallback", () => {
  test("falls back to the main engine after bounded worker failures", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "bounded fallback recorded in Chromium");
    test.setTimeout(120_000);
    await openApp(page);
    await startFixture(page, { count: 5 });

    await page.evaluate(() => {
      (window as any).__fdWorkerState.blockFuture = true;
      const state = (window as any).__fdWorkerState;
      const worker = state.instances[state.instances.length - 1] as Worker;
      worker.onerror?.(new ErrorEvent("error", { message: "e2e simulated worker crash" }));
    });

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const search = await import("/src/services/search.ts");
            const state = search.getSearchIndexState();
            return { status: state.status, engine: state.engine };
          }),
        { timeout: 60_000 },
      )
      .toEqual({ status: "ready", engine: "main" });

    expect(await searchInPage(page, "alpha")).toHaveLength(3);
  });
});
