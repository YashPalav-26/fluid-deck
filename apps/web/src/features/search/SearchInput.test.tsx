// @vitest-environment jsdom
/**
 * UI-004 - search input: 150ms debounce, instant clear, Escape, and the
 * rule that URL changes win over a stale draft.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "./SearchInput.tsx";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SearchInput", () => {
  it("debounces typing into a single query update", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);

    const input = screen.getByLabelText("Search resources");
    fireEvent.change(input, { target: { value: "r" } });
    fireEvent.change(input, { target: { value: "re" } });
    fireEvent.change(input, { target: { value: "react" } });
    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("react");
  });

  it("clears immediately from the clear button and from Escape", () => {
    const onChange = vi.fn();
    render(<SearchInput value="react" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByLabelText("Search resources")).toHaveValue("");

    onChange.mockClear();
    fireEvent.change(screen.getByLabelText("Search resources"), { target: { value: "css" } });
    act(() => vi.advanceTimersByTime(150));
    onChange.mockClear();
    fireEvent.keyDown(screen.getByLabelText("Search resources"), { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
    // The debounce timer for "css" must not fire a stale value afterwards.
    act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("adopts URL-driven changes without echoing them back", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="react" onChange={onChange} />);
    rerender(<SearchInput value="vue" onChange={onChange} />);
    act(() => vi.advanceTimersByTime(150));

    expect(screen.getByLabelText("Search resources")).toHaveValue("vue");
    expect(onChange).not.toHaveBeenCalled();
  });

  // Regression: a URL-driven reset (e.g. jumping to trash) must cancel a
  // queued keystroke instead of replaying it against the new URL.
  it("cancels a queued query when the URL changes underneath it", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} />);
    const input = screen.getByLabelText("Search resources");

    fireEvent.change(input, { target: { value: "react" } });
    act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(<SearchInput value="react" onChange={onChange} />);
    rerender(<SearchInput value="" onChange={onChange} />);
    act(() => vi.advanceTimersByTime(500));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("");
  });

  it("commits the pending draft on Enter and on blur", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    const input = screen.getByLabelText("Search resources");

    fireEvent.change(input, { target: { value: "css" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("css");

    act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "grid" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("grid");
  });

  it("is disabled with a reason in trash", () => {
    render(
      <SearchInput
        value=""
        onChange={() => {}}
        disabled
        disabledHint="Search covers library items."
      />,
    );
    const input = screen.getByLabelText("Search resources");
    expect(input).toBeDisabled();
    expect(screen.getByText("Search covers library items.")).toBeInTheDocument();
  });
});
