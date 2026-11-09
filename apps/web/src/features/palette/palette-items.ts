/** UI-005 — palette data hooks over the existing TanStack collections/tags queries. */
import { useCollections, useTags } from "../../hooks/queries.ts";

export function useCollectionItems() {
  return useCollections().data ?? [];
}

export function useTagItems() {
  return useTags().data ?? [];
}
