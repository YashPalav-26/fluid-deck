/**
 * UI-003 - TanStack Query over Dexie (Phase 2.5 §4.1): Dexie is canonical,
 * Query is the async cache, URL is transient view state. Query keys are
 * semantic (`["resources", view, trash]`); every mutation invalidates the
 * affected keys after its Dexie commit — never before.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ViewState } from "@fluid-deck/core";
import { db } from "../persistence/db.ts";
import { getLibraryResources, viewDateBounds } from "../services/library.ts";
import { searchFaceted, syncResource } from "../services/search.ts";
import { listCollections } from "../repositories/collections.ts";
import { listTags } from "../repositories/tags.ts";
import {
  listDomains,
  markResourceOpened,
  restoreResource,
  softDeleteResource,
} from "../repositories/resources.ts";

export const queryKeys = {
  resources: (view: ViewState, trash: boolean) => ["resources", view, trash] as const,
  search: (view: ViewState) => ["search", view] as const,
  domains: ["domains"] as const,
  collections: ["collections"] as const,
  tags: ["tags"] as const,
};

export function useResources(view: ViewState, trash: boolean, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.resources(view, trash),
    queryFn: () => getLibraryResources(db, view, { trash }),
    enabled: options.enabled ?? true,
  });
}

/**
 * UI-004 keyword path. The query key carries the whole ViewState, so a
 * superseded query can never overwrite a newer result; `signal` is a second
 * guard for work that finishes after unmount.
 */
export function useSearchResults(view: ViewState, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.search(view),
    queryFn: async ({ signal }) => {
      const bounds = viewDateBounds(view.date);
      const result = await searchFaceted(db, {
        q: view.q,
        type: view.type,
        source: view.source,
        domain: view.domain,
        collection: view.collection,
        tags: view.tags,
        unorganized: view.unorganized,
        dateRange: bounds,
        sort: view.sort,
      });
      if (signal.aborted) throw new Error("Search superseded");
      return result;
    },
    enabled: options.enabled ?? true,
  });
}

export function useDomains() {
  return useQuery({ queryKey: queryKeys.domains, queryFn: () => listDomains(db) });
}

export function useCollections() {
  return useQuery({ queryKey: queryKeys.collections, queryFn: () => listCollections(db) });
}

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: () => listTags(db) });
}

/**
 * Invalidation helper shared by every resource mutation: after the Dexie
 * commit resolves, all resource lists refetch. Exported separately so the
 * invalidation contract is unit-testable without rendering hooks.
 */
export async function invalidateResourceQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["resources"] });
  await queryClient.invalidateQueries({ queryKey: ["search"] });
  await queryClient.invalidateQueries({ queryKey: ["domains"] });
}

export function useTrashResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteResource(db, id),
    onSuccess: (resource) => {
      void invalidateResourceQueries(queryClient);
      void syncResource(db, resource);
    },
  });
}

export function useRestoreResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreResource(db, id),
    onSuccess: (resource) => {
      void invalidateResourceQueries(queryClient);
      void syncResource(db, resource);
    },
  });
}

export function useMarkOpened() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markResourceOpened(db, id),
    onSuccess: (_data, id) => {
      void invalidateResourceQueries(queryClient);
      void syncResource(db, id);
    },
  });
}
