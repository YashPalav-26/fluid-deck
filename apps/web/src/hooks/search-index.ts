import { useSyncExternalStore } from "react";
import { getSearchIndexState, subscribeSearchIndexState } from "../services/search.ts";

export function useSearchIndex() {
  return useSyncExternalStore(subscribeSearchIndexState, getSearchIndexState, getSearchIndexState);
}

export { getSearchIndexState, subscribeSearchIndexState } from "../services/search.ts";
