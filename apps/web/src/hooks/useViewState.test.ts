/**
 * UI-001 - URL-param routing: view state round-trips through the URL,
 * so copying a URL reproduces the view and back/forward restores it.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_VIEW_STATE } from "@fluid-deck/core";
import { buildRouteSearch, parseRoute } from "./useViewState.ts";

describe("parseRoute / buildRouteSearch", () => {
  it("round-trips a filtered view", () => {
    const collection = "123e4567-e89b-12d3-a456-426614174000";
    const route = {
      view: { ...EMPTY_VIEW_STATE, collection, type: "article" as const, sort: "oldest" as const },
      trash: false,
    };
    const search = buildRouteSearch(route);
    expect(search).toContain(`collection=${collection}`);
    expect(parseRoute(search)).toEqual(route);
  });

  it("keeps the trash flag outside the core ViewState schema", () => {
    const route = parseRoute("?view=trash");
    expect(route.trash).toBe(true);
    expect(buildRouteSearch(route)).toContain("view=trash");
  });

  it("drops invalid values instead of throwing", () => {
    expect(parseRoute("?type=nope&sort=nope")).toEqual({
      view: EMPTY_VIEW_STATE,
      trash: false,
    });
  });
});
