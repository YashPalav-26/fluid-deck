/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const, @typescript-eslint/no-unused-expressions */
import { test } from "@playwright/test";
import fs from "node:fs";

test("SEARCH-006 search/index benchmark", async ({ page }) => {
  test.setTimeout(1_800_000);

  await page.goto("/");
  await page.waitForTimeout(1500);

  // Warm module cache before throttling.
  await page.evaluate(async () => {
    await import("/src/persistence/db.ts");
    await import("/src/services/search.ts");
    await import("/src/repositories/resources.ts");
    await import("/src/repositories/tags.ts");
    await import("/src/repositories/collections.ts");
    await import("/src/repositories/relationships.ts");
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 2000,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });

  const scales = [100, 1000, 5000, 10000];
  const results: any[] = [];

  for (const n of scales) {
    const seed = 20261110 + n;
    const r = await page.evaluate(
      async ({ n, seed }) => {
        try {
          const dbMod = await import("/src/persistence/db.ts");
          const searchMod = await import("/src/services/search.ts");
          const repoMod = await import("/src/repositories/resources.ts");
          const tagsMod = await import("/src/repositories/tags.ts");
          const collMod = await import("/src/repositories/collections.ts");
          const relMod = await import("/src/repositories/relationships.ts");

          function rngFactory(s: number) {
            let state = s >>> 0;
            return () => {
              state = (state * 1664525 + 1013904223) >>> 0;
              return state / 4294967296;
            };
          }
          const rng = rngFactory(seed);
          let counter = 0;
          function makeId() {
            counter += 1;
            return `00000000-0000-4000-8000-8${counter.toString(16).padStart(11, "0")}`;
          }

          const dbName = `fluid-deck-bench-${n}-${Date.now()}`;
          const db = new dbMod.FluidDeckDatabase(dbName);
          await db.open();

          const now = 1700000000000;
          // Collections: 10 parents x 9 children.
          const collections: any[] = [];
          const parentIds: string[] = [];
          for (let p = 0; p < 10; p++) {
            const pid = makeId();
            parentIds.push(pid);
            collections.push({
              id: pid,
              name: `Collection ${p + 1}`,
              parentId: null,
              orderIndex: p,
              createdAt: now,
              updatedAt: now,
            });
            for (let c = 0; c < 9; c++) {
              collections.push({
                id: makeId(),
                name: `Collection ${p + 1}-${c + 1}`,
                parentId: pid,
                orderIndex: p * 10 + c,
                createdAt: now,
                updatedAt: now,
              });
            }
          }

          // Tags: 200.
          const tags: any[] = [];
          const tagIds: string[] = [];
          for (let t = 0; t < 200; t++) {
            const id = makeId();
            tagIds.push(id);
            tags.push({
              id,
              name: `tag-${t + 1}`,
              normalizedName: `tag-${t + 1}`,
              usageCount: 0,
              createdAt: now,
            });
          }

          const types = ["article", "video", "other", "tool"];
          const sources = ["extension", "import", "share", "other"];
          const domains = Array.from({ length: 50 }, (_, i) => `domain${i + 1}.example.com`);
          const words = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];

          const resources: any[] = [];
          const resourceTags: any[] = [];
          const resourceCollections: any[] = [];

          for (let i = 0; i < n; i++) {
            const id = makeId();
            const type = types[Math.floor(rng() * types.length)];
            const source = sources[Math.floor(rng() * sources.length)];
            const domain = domains[Math.floor(rng() * domains.length)];
            const createdAt = now + Math.floor(rng() * 365 * 24 * 60 * 60 * 1000);
            const updatedAt = createdAt + Math.floor(rng() * 30 * 24 * 60 * 60 * 1000);
            const title = `alpha beta note ${i} ${words[Math.floor(rng() * words.length)]}`;
            const description = `description ${words[Math.floor(rng() * words.length)]} ${words[Math.floor(rng() * words.length)]}`;
            const url = `https://${domain}/resource/${i}`;
            resources.push({
              id,
              url,
              canonicalUrl: url,
              title,
              description,
              thumbnailUrl: "",
              faviconUrl: "",
              domain,
              type,
              source,
              notes: "",
              extractionStatus: "complete",
              extractionNotes: [],
              createdAt,
              updatedAt,
              lastOpenedAt: null,
              deletedAt: null,
            });

            const tagCount = 1 + Math.floor(rng() * 3);
            const usedTags = new Set<number>();
            for (let t = 0; t < tagCount; t++) {
              let ti = Math.floor(rng() * tagIds.length);
              if (usedTags.has(ti)) continue;
              usedTags.add(ti);
              resourceTags.push({ resourceId: id, tagId: tagIds[ti] });
            }
            if (rng() < 0.7) {
              const ci = Math.floor(rng() * collections.length);
              resourceCollections.push({
                resourceId: id,
                collectionId: collections[ci].id,
                addedAt: createdAt,
              });
            }
          }

          // Bulk insert in chunks.
          const chunkSize = 500;
          for (let i = 0; i < resources.length; i += chunkSize) {
            await db.resources.bulkAdd(resources.slice(i, i + chunkSize));
          }
          await db.collections.bulkAdd(collections);
          await db.tags.bulkAdd(tags);
          for (let i = 0; i < resourceTags.length; i += chunkSize) {
            await db.resourceTags.bulkAdd(resourceTags.slice(i, i + chunkSize));
          }
          for (let i = 0; i < resourceCollections.length; i += chunkSize) {
            await db.resourceCollections.bulkAdd(resourceCollections.slice(i, i + chunkSize));
          }

          // Memory before rebuild.
          const gc = (globalThis as any).gc;
          if (typeof gc === "function") gc();
          const heapBefore = (performance as any).memory
            ? (performance as any).memory.usedJSHeapSize
            : null;

          // Rebuild timing.
          const rebuildStart = performance.now();
          const index = await searchMod.rebuildSearchIndex(db);
          const rebuildEnd = performance.now();
          const rebuildMs = rebuildEnd - rebuildStart;

          if (typeof gc === "function") gc();
          const heapAfter = (performance as any).memory
            ? (performance as any).memory.usedJSHeapSize
            : null;

          // Correctness checks.
          const status = searchMod.getSearchIndexStatus();
          const docCount = index.mini.documentCount;
          const exact = searchMod.searchIndex(index, "alpha", { limit: Number.MAX_SAFE_INTEGER });
          const multi = searchMod.searchIndex(index, "alpha beta", {
            limit: Number.MAX_SAFE_INTEGER,
          });
          const prefix = searchMod.searchIndex(index, "alph", { limit: Number.MAX_SAFE_INTEGER });
          const fuzzy = searchMod.searchIndex(index, "alpa", { limit: Number.MAX_SAFE_INTEGER });
          const fallback = searchMod.searchIndex(index, "alpha omega", {
            limit: Number.MAX_SAFE_INTEGER,
          });
          const noResult = searchMod.searchIndex(index, "zzzznotfound", {
            limit: Number.MAX_SAFE_INTEGER,
          });

          function percentile(sorted: number[], p: number) {
            if (sorted.length === 0) return 0;
            const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
            return sorted[idx];
          }
          function stats(samples: number[]) {
            const s = [...samples].sort((a, b) => a - b);
            return {
              n: s.length,
              min: s[0],
              p50: percentile(s, 50),
              p95: percentile(s, 95),
              max: s[s.length - 1],
              mean: s.reduce((a, b) => a + b, 0) / s.length,
            };
          }

          // Warm-up + query latency.
          const queries = [
            { name: "exact", q: "alpha" },
            { name: "multiTerm", q: "alpha beta" },
            { name: "prefix", q: "alph" },
            { name: "fuzzy", q: "alpa" },
            { name: "andOrFallback", q: "alpha omega" },
            { name: "noResult", q: "zzzznotfound" },
          ];
          const querySamples: Record<string, number[]> = {};
          for (const q of queries) querySamples[q.name] = [];
          // Warm-up.
          for (const q of queries) searchMod.searchIndex(index, q.q, { limit: 100 });
          for (let iter = 0; iter < 15; iter++) {
            for (const q of queries) {
              const s = performance.now();
              searchMod.searchIndex(index, q.q, { limit: Number.MAX_SAFE_INTEGER });
              querySamples[q.name].push(performance.now() - s);
            }
          }
          const queryStats: Record<string, any> = {};
          for (const q of queries) queryStats[q.name] = stats(querySamples[q.name]);

          // Facet application latency.
          const firstType = types[0];
          const firstSource = sources[0];
          const firstDomain = domains[0];
          const firstCollection = collections[0].id;
          const firstTag = tagIds[0];
          const secondTag = tagIds[1];
          const facetCases = [
            { name: "type", opts: { q: "alpha", type: firstType } },
            { name: "source", opts: { q: "alpha", source: firstSource } },
            { name: "domain", opts: { q: "alpha", domain: firstDomain } },
            {
              name: "dateRange",
              opts: { q: "alpha", from: now, to: now + 400 * 24 * 60 * 60 * 1000 },
            },
            { name: "collectionDescendants", opts: { q: "alpha", collection: firstCollection } },
            { name: "tagOr", opts: { q: "alpha", tags: [firstTag, secondTag] } },
            { name: "unorganized", opts: { q: "alpha", unorganized: true } },
            {
              name: "combined",
              opts: {
                q: "alpha",
                type: firstType,
                source: firstSource,
                domain: firstDomain,
                from: now,
                to: now + 400 * 24 * 60 * 60 * 1000,
                collection: firstCollection,
                tags: [firstTag, secondTag],
              },
            },
          ];
          const facetSamples: Record<string, number[]> = {};
          for (const c of facetCases) facetSamples[c.name] = [];
          for (const c of facetCases) await searchMod.searchFaceted(db, c.opts);
          for (let iter = 0; iter < 15; iter++) {
            for (const c of facetCases) {
              const s = performance.now();
              await searchMod.searchFaceted(db, c.opts);
              facetSamples[c.name].push(performance.now() - s);
            }
          }
          const facetStats: Record<string, any> = {};
          for (const c of facetCases) facetStats[c.name] = stats(facetSamples[c.name]);

          // Cap check.
          const capped = await searchMod.searchFaceted(db, { q: "alpha" });
          const capInfo = {
            total: capped.total,
            returned: capped.length,
            truncated: capped.truncated,
            cap: capped.cap,
          };

          // Incremental update timings.
          async function timeCreate() {
            const id = makeId();
            const url = `https://domain1.example.com/incr-${id}`;
            const input = {
              url,
              title: "alpha incremental",
              description: "incr",
              type: "article",
              source: "extension",
              notes: "",
              extractionStatus: "complete",
              extractionNotes: [],
            };
            const s = performance.now();
            const res = await repoMod.createResource(db, input as any);
            await searchMod.syncResource(db, res.resource.id);
            return performance.now() - s;
          }
          async function timeUpdate(targetId: string) {
            const s = performance.now();
            await repoMod.updateResource(db, targetId, { title: "alpha updated" });
            await searchMod.syncResource(db, targetId);
            return performance.now() - s;
          }
          async function timeDelete(targetId: string) {
            const s = performance.now();
            await repoMod.softDeleteResource(db, targetId);
            await searchMod.onResourceSoftDeleted(db, targetId);
            return performance.now() - s;
          }
          const createSamples: number[] = [];
          const updateSamples: number[] = [];
          const deleteSamples: number[] = [];
          const updateTargets: string[] = [];
          const deleteTargets: string[] = [];
          for (let i = 0; i < 10; i++) {
            createSamples.push(await timeCreate());
          }
          // prepare targets by creating 20 more
          for (let i = 0; i < 10; i++) {
            const id = makeId();
            const url = `https://domain1.example.com/upd-${id}`;
            const res = await repoMod.createResource(db, {
              url,
              title: "alpha upd",
              description: "upd",
              type: "article",
              source: "extension",
              notes: "",
              extractionStatus: "complete",
              extractionNotes: [],
            } as any);
            await searchMod.syncResource(db, res.resource.id);
            updateTargets.push(res.resource.id);
          }
          for (const tid of updateTargets) updateSamples.push(await timeUpdate(tid));
          for (let i = 0; i < 10; i++) {
            const id = makeId();
            const url = `https://domain1.example.com/del-${id}`;
            const res = await repoMod.createResource(db, {
              url,
              title: "alpha del",
              description: "del",
              type: "article",
              source: "extension",
              notes: "",
              extractionStatus: "complete",
              extractionNotes: [],
            } as any);
            await searchMod.syncResource(db, res.resource.id);
            deleteTargets.push(res.resource.id);
          }
          for (const tid of deleteTargets) deleteSamples.push(await timeDelete(tid));

          // Tag rename sync.
          const tagRenameSamples: number[] = [];
          for (let i = 0; i < 5; i++) {
            const t = await tagsMod.createTag(db, `benchtag-${i}-${n}`);
            // attach to a resource
            const rid = resources[0].id;
            await relMod.addTagToResource(db, rid, t.tag.id);
            await searchMod.syncResourceMembership(db, rid);
            const s = performance.now();
            await tagsMod.renameTag(db, t.tag.id, `benchtag-renamed-${i}-${n}`);
            await searchMod.syncTagRename(db, t.tag.id);
            tagRenameSamples.push(performance.now() - s);
          }

          // Collection rename sync.
          const collRenameSamples: number[] = [];
          for (let i = 0; i < 5; i++) {
            const c = await collMod.createCollection(db, {
              name: `benchcoll-${i}-${n}`,
              parentId: null,
            });
            const rid = resources[1].id;
            await relMod.addResourceToCollection(db, rid, c.collection.id);
            await searchMod.syncResourceMembership(db, rid);
            const s = performance.now();
            (await collMod.renameCollection)
              ? await (collMod as any).renameCollection(
                  db,
                  c.collection.id,
                  `benchcoll-renamed-${i}-${n}`,
                )
              : await db.collections.update(c.collection.id, {
                  name: `benchcoll-renamed-${i}-${n}`,
                });
            await searchMod.syncCollectionRename(db, c.collection.id);
            collRenameSamples.push(performance.now() - s);
          }

          db.close();
          await db.delete();

          return {
            n,
            seed,
            rebuildMs,
            heapBefore,
            heapAfter,
            heapDelta: heapBefore !== null && heapAfter !== null ? heapAfter - heapBefore : null,
            status,
            docCount,
            correctness: {
              exactHits: exact.hits.length,
              multiHits: multi.hits.length,
              prefixHits: prefix.hits.length,
              fuzzyHits: fuzzy.hits.length,
              fallbackHits: fallback.hits.length,
              fallbackPartial: fallback.partial,
              noResultHits: noResult.hits.length,
            },
            capInfo,
            queryStats,
            facetStats,
            incremental: {
              create: stats(createSamples),
              update: stats(updateSamples),
              delete: stats(deleteSamples),
              tagRename: stats(tagRenameSamples),
              collectionRename: stats(collRenameSamples),
            },
          };
        } catch (e: any) {
          return { n, error: String(e?.message || e), stack: e?.stack };
        }
      },
      { n, seed },
    );

    console.log("SCALE_RESULT", JSON.stringify(r));
    results.push(r);
  }

  fs.writeFileSync("docs/SPRINT_6_BENCHMARK_RESULTS.json", JSON.stringify(results, null, 2));
  console.log("ALL_RESULTS", JSON.stringify(results));
});
