/**
 * UI-009 acceptance: focus trap + focus restore (WCAG 2.2 AA).
 * DOM test via Testing Library + jsdom — proves rendered dialog behavior.
 */
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogShell } from "./DialogShell.tsx";

afterEach(() => cleanup());

describe("DialogShell", () => {
  it("moves focus into the dialog and restores it to the trigger on close", async () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <button type="button">Trigger</button>
        <DialogShell
          open={true}
          onOpenChange={onOpenChange}
          title="Settings"
          description="Change preferences"
        >
          <button type="button">Inner action</button>
        </DialogShell>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    });
    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("renders description and content", async () => {
    render(
      <DialogShell
        open={true}
        onOpenChange={() => undefined}
        title="Delete collection"
        description="This cannot be undone"
      >
        <p>Real content</p>
      </DialogShell>,
    );
    expect(await screen.findByRole("dialog", { name: "Delete collection" })).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone")).toBeInTheDocument();
    expect(screen.getByText("Real content")).toBeInTheDocument();
  });
});
