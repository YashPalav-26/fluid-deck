/**
 * UI-003 - TanStack Query over Dexie (Phase 2.5 §4.1): Dexie is canonical,
 * Query is the async cache, URL is transient view state. Query keys are
 * semantic (`["resources", view, trash]`); every mutation invalidates the
 * affected keys after its Dexie commit — never before.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ViewState } from "@fluid-deck/core";
import { db } from "../persistence/db.ts";
import { getLibraryResources } from "../services/library.ts";
import { listCollections } from "../repositories/collections.ts";
import { listTags } from "../repositories/tags.ts";
import {
  markResourceOpened,
  restoreResource,
  softDeleteResource,
} from "../repositories/resources.ts";

export const queryKeys = {
  resources: (view: ViewState, trash: boolean) => ["resources", view, trash] as const,
  collections: ["collections"] as const,
  tags: ["tags"] as const,
};

export function useResources(view: ViewState, trash: boolean) {
  return useQuery({
    queryKey: queryKeys.resources(view, trash),
    queryFn: () => getLibraryResources(db, view, { trash }),
  });
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
}

export function useTrashResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteResource(db, id),
    onSuccess: () => void invalidateResourceQueries(queryClient),
  });
}

export function useRestoreResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreResource(db, id),
    onSuccess: () => void invalidateResourceQueries(queryClient),
  });
}

export function useMarkOpened() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markResourceOpened(db, id),
    onSuccess: () => void invalidateResourceQueries(queryClient),
  });
}
