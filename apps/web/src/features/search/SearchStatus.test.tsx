// @vitest-environment jsdom
/**
 * UI-004 - status line: loading, indexing, error, partial and the
 * count/truncation wording. Capped results must never read as complete.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchStatus } from "./SearchStatus.tsx";

const indexState = vi.hoisted(() => ({
  current: {
    ready: true,
    status: "ready" as string,
    progress: null as { done: number; total: number } | null,
  },
}));

vi.mock("../../hooks/search-index.ts", () => ({
  useSearchIndex: () => indexState.current,
}));

beforeEach(() => {
  indexState.current = { ready: true, status: "ready", progress: null };
});
afterEach(() => cleanup());

const base = {
  query: "react",
  total: 0,
  returned: 0,
  truncated: false,
  truncatedCount: 0,
  partial: false,
  isLoading: false,
  isError: false,
  onRetry: () => {},
};

describe("SearchStatus", () => {
  it("reports a plain match count", () => {
    render(<SearchStatus {...base} total={1} returned={1} />);
    expect(screen.getByTestId("search-status")).toHaveTextContent("1 match");
  });

  it("never presents a capped result set as complete", () => {
    render(<SearchStatus {...base} total={1234} returned={500} truncated truncatedCount={734} />);
    const status = screen.getByTestId("search-status");
    expect(status).toHaveTextContent("1,234 matches");
    expect(status).toHaveTextContent("showing the first 500");
    expect(status).toHaveTextContent("734 more matches are hidden");
  });

  it("shows loading while a query is in flight", () => {
    render(<SearchStatus {...base} isLoading />);
    expect(screen.getByTestId("search-status")).toHaveTextContent("Searching…");
  });

  it("shows indexing progress instead of an empty result set", () => {
    indexState.current = { ready: false, status: "indexing", progress: { done: 10, total: 40 } };
    render(<SearchStatus {...base} />);
    expect(screen.getByTestId("search-status")).toHaveTextContent("10 of 40 indexed");
  });

  it("flags partial results", () => {
    render(<SearchStatus {...base} total={3} returned={3} partial />);
    expect(screen.getByTestId("search-status")).toHaveTextContent("may be incomplete");
  });

  it("surfaces the error with a retry", () => {
    const onRetry = vi.fn();
    render(<SearchStatus {...base} isError onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Search failed");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("does not claim indexing when browsing without a query", () => {
    indexState.current = { ready: false, status: "indexing", progress: null };
    render(<SearchStatus {...base} query="" total={2} returned={2} />);
    expect(screen.getByTestId("search-status")).toHaveTextContent("2 matches");
  });

  it("keeps one stable live region so updates are announced", () => {
    const { rerender } = render(<SearchStatus {...base} total={1} returned={1} />);
    const status = screen.getByTestId("search-status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");

    // The same element must survive the switch to the error state, otherwise a
    // screen reader never hears the change.
    rerender(<SearchStatus {...base} isError onRetry={() => {}} />);
    expect(screen.getByTestId("search-status")).toBe(status);
    expect(screen.getByRole("alert")).toHaveTextContent("Search failed");
  });
});
