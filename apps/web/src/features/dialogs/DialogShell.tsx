/**
 * UI-009 — one accessible dialog shell on Radix primitives.
 * Radix provides focus trap, focus restore, Esc stack, `aria-modal`.
 * All M5 dialogs (confirm, form, settings-adjacent) build on this.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useRef, type ReactNode } from "react";

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: DialogShellProps) {
  // These dialogs are opened by plain buttons, not by a Radix `Dialog.Trigger`,
  // so Radix has no trigger to restore focus to and the focus would fall back
  // to the document. Remember the last focused element outside the dialog and
  // put the focus back when it closes.
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) return;
    const remember = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== document.body) restoreFocusTo.current = target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          aria-label={title}
          onCloseAutoFocus={(event) => {
            const target = restoreFocusTo.current;
            if (target && target.isConnected) {
              event.preventDefault();
              target.focus();
            }
          }}
          className="fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg bg-white p-6 shadow-lg focus:outline-none dark:bg-slate-900"
        >
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              className="mt-6 rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Close
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
