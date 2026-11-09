/**
 * UI-003 acceptance: mutations invalidate the resource queries AFTER the
 * Dexie commit, so the grid refetches fresh data. Tested at the
 * QueryClient level (no DOM): fetch -> write via repository ->
 * invalidateResourceQueries -> refetch reflects the write.
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { EMPTY_VIEW_STATE } from "@fluid-deck/core";
import { useTestDatabase } from "../testing/database-fixture.ts";
import { createResource, softDeleteResource } from "../repositories/resources.ts";
import { getLibraryResources } from "../services/library.ts";
import { invalidateResourceQueries, queryKeys } from "./queries.ts";

const fixture = useTestDatabase();

describe("resource query invalidation", () => {
  it("refetches after a committed write when invalidated", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = queryKeys.resources(EMPTY_VIEW_STATE, false);
    const fetcher = () => getLibraryResources(fixture.db, EMPTY_VIEW_STATE);

    const created = await createResource(fixture.db, {
      url: "https://example.com/invalidate",
      title: "Invalidated",
      description: "",
      thumbnailUrl: "",
      faviconUrl: "",
      type: "article",
      source: "other",
      notes: "",
      extractionStatus: "complete",
      extractionNotes: [],
    });

    const first = await client.fetchQuery({ queryKey: key, queryFn: fetcher });
    expect(first.map((r) => r.id)).toEqual([created.resource.id]);

    await softDeleteResource(fixture.db, created.resource.id);
    await invalidateResourceQueries(client);

    const second = await client.fetchQuery({ queryKey: key, queryFn: fetcher });
    expect(second).toEqual([]);
  });

  it("keeps semantic query keys per view", () => {
    expect(queryKeys.resources(EMPTY_VIEW_STATE, false)[0]).toBe("resources");
    expect(queryKeys.collections).toEqual(["collections"]);
    expect(queryKeys.tags).toEqual(["tags"]);
  });
});
