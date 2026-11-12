/**
 * UI-004 - `/` focuses the shell search only when the user is not already
 * typing, so it must recognise every editable surface.
 */
import { describe, expect, it } from "vitest";
import { isEditableTarget } from "./search-shortcuts.ts";

describe("isEditableTarget", () => {
  it("treats text entry controls as editable", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(
      isEditableTarget({
        tagName: "DIV",
        getAttribute: (name: string) => (name === "role" ? "textbox" : null),
      }),
    ).toBe(true);
  });

  it("treats ordinary elements and non-elements as safe to hijack", () => {
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget({ tagName: "DIV", getAttribute: () => null })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});
