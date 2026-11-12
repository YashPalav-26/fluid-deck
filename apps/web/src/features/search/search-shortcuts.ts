/**
 * UI-004 - `/` focuses the shell search unless the user is already typing
 * somewhere else (input, textarea, select, contenteditable) or a dialog owns
 * the keyboard. Pure so the rule is testable without a DOM event.
 */
const EDITABLE_ROLES = new Set(["textbox", "searchbox", "combobox"]);

export function isEditableTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const element = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    getAttribute?: (name: string) => string | null;
  };
  const tag = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (element.isContentEditable === true) return true;
  const role = typeof element.getAttribute === "function" ? element.getAttribute("role") : null;
  return role !== null && EDITABLE_ROLES.has(role);
}
