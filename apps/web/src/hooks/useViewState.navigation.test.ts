// @vitest-environment jsdom
/**
 * UI-004 - route navigation invariants that only show up under fast user
 * input: two writes in the same tick must merge (not clobber), the same URL
 * must not add a history entry, trash clears the search-only params, and
 * popstate re-reads the URL.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useViewState } from "./useViewState.ts";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(() => cleanup());

describe("useViewState navigation", () => {
  it("merges two writes made before React re-renders", () => {
    const { result } = renderHook(() => useViewState());

    act(() => {
      result.current.updateView({ q: "react" });
      result.current.updateView({ domain: "react.dev" });
    });

    expect(result.current.view.q).toBe("react");
    expect(result.current.view.domain).toBe("react.dev");
    expect(window.location.search).toContain("q=react");
    expect(window.location.search).toContain("domain=react.dev");
  });

  it("does not create a history entry for an unchanged URL", () => {
    const { result } = renderHook(() => useViewState());
    const before = window.history.length;

    act(() => result.current.updateView({ q: "react" }));
    act(() => result.current.updateView({ q: "react" }));

    expect(window.history.length).toBe(before + 1);
    expect(window.location.search).toBe("?q=react");
  });

  it("clears search-only params for trash and keeps collection/sort", () => {
    const { result } = renderHook(() => useViewState());

    act(() =>
      result.current.updateView({
        q: "react",
        sort: "relevance",
        type: "article",
        domain: "react.dev",
        collection: "11111111-1111-4111-8111-111111111111",
      }),
    );
    act(() => result.current.goTrash());

    expect(result.current.trash).toBe(true);
    expect(result.current.view.q).toBe("");
    expect(result.current.view.type).toBeUndefined();
    expect(result.current.view.domain).toBeUndefined();
    expect(result.current.view.sort).toBe("newest");
    expect(result.current.view.collection).toBe("11111111-1111-4111-8111-111111111111");
    expect(window.location.search).toBe(
      "?collection=11111111-1111-4111-8111-111111111111&view=trash",
    );
  });

  it("re-reads the URL on popstate", () => {
    const { result } = renderHook(() => useViewState());

    act(() => result.current.updateView({ q: "react" }));
    act(() => {
      window.history.replaceState(null, "", "/?q=css&domain=react.dev");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.view.q).toBe("css");
    expect(result.current.view.domain).toBe("react.dev");
  });
});
