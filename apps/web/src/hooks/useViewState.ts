/**
 * UI-001 - hand-rolled URL-param routing (Phase 2.5 §1): ONE route.
 * ViewState lives in the URL (FR-SRH-003); back/forward works because
 * every change is a history push and `popstate` re-reads the URL.
 * No router library for a single-view SPA.
 *
 * `view=trash` is the one param outside the core ViewState schema: the
 * sidebar Trash entry needs it, and folding it into ViewState is a
 * SEARCH/UI-004 concern. Everything else round-trips through core.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeViewState, encodeViewState, EMPTY_VIEW_STATE } from "@fluid-deck/core";
import type { ViewState } from "@fluid-deck/core";

export interface RouteState {
  view: ViewState;
  trash: boolean;
  page: "inbox" | "settings" | null;
}

export function parseRoute(search: string): RouteState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const view = params.get("view");
  const page = view === "inbox" || view === "settings" ? view : null;
  return { view: decodeViewState(search), trash: view === "trash", page };
}

export function buildRouteSearch(route: RouteState): string {
  const params = new URLSearchParams(encodeViewState(route.view));
  if (route.trash) params.set("view", "trash");
  if (route.page) params.set("view", route.page);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function useViewState(): RouteState & {
  updateView: (patch: Partial<ViewState>, options?: { trash?: boolean }) => void;
  goAll: () => void;
  goTrash: () => void;
  goInbox: () => void;
  goSettings: () => void;
} {
  const [route, setRoute] = useState<RouteState>(() => parseRoute(window.location.search));
  // Synchronous mirror of `route`. Two writes in the same tick (e.g. a pending
  // search commit followed by a facet click) must merge onto the newest view,
  // not onto the view React rendered last.
  const routeRef = useRef(route);

  const applyRoute = useCallback((next: RouteState) => {
    routeRef.current = next;
    setRoute(next);
  }, []);

  useEffect(() => {
    const onPopState = () => applyRoute(parseRoute(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyRoute]);

  const navigate = useCallback(
    (next: RouteState) => {
      const nextSearch = buildRouteSearch(next);
      // Writing the same URL again would add a history entry that back/forward
      // has to step through for no visible change.
      if (nextSearch !== window.location.search) {
        window.history.pushState(null, "", nextSearch || window.location.pathname);
      }
      applyRoute(next);
    },
    [applyRoute],
  );

  const updateView = useCallback(
    (patch: Partial<ViewState>, options: { trash?: boolean } = {}) => {
      const current = routeRef.current;
      navigate({
        view: { ...current.view, ...patch },
        trash: options.trash ?? current.trash,
        page: null,
      });
    },
    [navigate],
  );

  const goAll = useCallback(
    () => navigate({ view: EMPTY_VIEW_STATE, trash: false, page: null }),
    [navigate],
  );
  // Trash is browse-only (the index excludes soft-deleted rows), so entering
  // it drops the search-specific params but keeps collection/tags/sort.
  const goTrash = useCallback(() => {
    const current = routeRef.current;
    navigate({
      view: {
        ...current.view,
        q: "",
        type: undefined,
        source: undefined,
        domain: undefined,
        date: undefined,
        unorganized: false,
        // Relevance needs a query; trash is browse-only.
        sort: current.view.sort === "relevance" ? "newest" : current.view.sort,
      },
      trash: true,
      page: null,
    });
  }, [navigate]);
  const goInbox = useCallback(
    () => navigate({ view: routeRef.current.view, trash: false, page: "inbox" }),
    [navigate],
  );
  const goSettings = useCallback(
    () => navigate({ view: routeRef.current.view, trash: false, page: "settings" }),
    [navigate],
  );

  return { ...route, updateView, goAll, goTrash, goInbox, goSettings };
}
