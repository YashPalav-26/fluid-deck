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
import { useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: RouteState) => {
    window.history.pushState(null, "", buildRouteSearch(next) || window.location.pathname);
    setRoute(next);
  }, []);

  const updateView = useCallback(
    (patch: Partial<ViewState>, options: { trash?: boolean } = {}) => {
      navigate({
        view: { ...route.view, ...patch },
        trash: options.trash ?? route.trash,
        page: null,
      });
    },
    [navigate, route],
  );

  const goAll = useCallback(
    () => navigate({ view: EMPTY_VIEW_STATE, trash: false, page: null }),
    [navigate],
  );
  const goTrash = useCallback(
    () => navigate({ view: route.view, trash: true, page: null }),
    [navigate, route],
  );
  const goInbox = useCallback(
    () => navigate({ view: route.view, trash: false, page: "inbox" }),
    [navigate, route],
  );
  const goSettings = useCallback(
    () => navigate({ view: route.view, trash: false, page: "settings" }),
    [navigate, route],
  );

  return { ...route, updateView, goAll, goTrash, goInbox, goSettings };
}
