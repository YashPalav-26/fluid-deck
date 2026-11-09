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
}

export function parseRoute(search: string): RouteState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return { view: decodeViewState(search), trash: params.get("view") === "trash" };
}

export function buildRouteSearch(route: RouteState): string {
  const params = new URLSearchParams(encodeViewState(route.view));
  if (route.trash) params.set("view", "trash");
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function useViewState(): RouteState & {
  updateView: (patch: Partial<ViewState>, options?: { trash?: boolean }) => void;
  goAll: () => void;
  goTrash: () => void;
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
      });
    },
    [navigate, route],
  );

  const goAll = useCallback(() => navigate({ view: EMPTY_VIEW_STATE, trash: false }), [navigate]);
  const goTrash = useCallback(() => navigate({ view: route.view, trash: true }), [navigate, route]);

  return { ...route, updateView, goAll, goTrash };
}
