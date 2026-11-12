// @vitest-environment jsdom
/**
 * UI-004 - facet/sort controls are dumb: each control reports a ViewState
 * patch, so the URL stays authoritative. Covers type/sort/tags/collection
 * and the "clear filters" affordance.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_VIEW_STATE } from "@fluid-deck/core";
import type { Collection, Tag } from "@fluid-deck/core";
import { SearchFilters } from "./SearchFilters.tsx";

afterEach(() => cleanup());

const collections: Collection[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Reading",
    parentId: null,
    orderIndex: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Papers",
    parentId: "11111111-1111-4111-8111-111111111111",
    orderIndex: 0,
    createdAt: 0,
    updatedAt: 0,
  },
];

const tags: Tag[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "React",
    normalizedName: "react",
    usageCount: 2,
    createdAt: 0,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "CSS",
    normalizedName: "css",
    usageCount: 1,
    createdAt: 0,
  },
];

function renderFilters(patch: Record<string, unknown> = {}, onChange = vi.fn(), onClear = vi.fn()) {
  render(
    <SearchFilters
      view={{ ...EMPTY_VIEW_STATE, ...patch }}
      onChange={onChange}
      onClear={onClear}
      collections={collections}
      tags={tags}
      domains={["example.com", "other.org"]}
    />,
  );
  return { onChange, onClear };
}

describe("SearchFilters", () => {
  it("reports type, source, domain and date as ViewState patches", () => {
    const { onChange } = renderFilters();

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "video" } });
    expect(onChange).toHaveBeenLastCalledWith({ type: "video" });

    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "extension" } });
    expect(onChange).toHaveBeenLastCalledWith({ source: "extension" });

    fireEvent.change(screen.getByLabelText("Domain"), { target: { value: "other.org" } });
    expect(onChange).toHaveBeenLastCalledWith({ domain: "other.org" });

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "week" } });
    expect(onChange).toHaveBeenLastCalledWith({ date: "week" });

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ type: undefined });
  });

  it("indents descendant collections and reports the selected id", () => {
    const { onChange } = renderFilters();
    const select = screen.getByLabelText("Collection");
    const options = within(select).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Any collection",
      "Reading",
      "— Papers",
    ]);

    fireEvent.change(select, { target: { value: collections[1]!.id } });
    expect(onChange).toHaveBeenLastCalledWith({ collection: collections[1]!.id });
  });

  it("ORs tag checkboxes and toggles unorganized", () => {
    const { onChange } = renderFilters({ tags: ["react"] });
    fireEvent.click(screen.getByRole("checkbox", { name: /^CSS/ }));
    expect(onChange).toHaveBeenLastCalledWith({ tags: ["react", "css"] });

    fireEvent.click(screen.getByRole("checkbox", { name: /^React/ }));
    expect(onChange).toHaveBeenLastCalledWith({ tags: [] });

    fireEvent.click(screen.getByRole("checkbox", { name: /^Unorganized/ }));
    expect(onChange).toHaveBeenLastCalledWith({ unorganized: true });
  });

  it("offers relevance only when a query is present", () => {
    renderFilters();
    expect(within(screen.getByLabelText("Sort")).queryByText("Relevance")).toBeNull();
    cleanup();

    const onChange = vi.fn();
    renderFilters({ q: "react" }, onChange);
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "relevance" } });
    expect(onChange).toHaveBeenLastCalledWith({ sort: "relevance" });
  });

  it("enables clear only when a filter is active", () => {
    const { onClear } = renderFilters();
    const clear = screen.getByRole("button", { name: "Clear filters" });
    expect(clear).toBeDisabled();

    cleanup();
    const active = renderFilters({ type: "article" });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(active.onClear).toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });
});
