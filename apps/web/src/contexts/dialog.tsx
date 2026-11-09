/**
 * UI-009 — dialog context reimplemented on Radix primitives (UI-003 API
 * preserved: `useDialog()` + `openDialog`/`closeDialog`/`closeTopDialog`).
 * Each entry renders an Radix `Dialog.Root`, which traps focus, restores
 * it to the trigger on close, and handles Esc stack natively.
 *
 * Concrete dialogs (ConfirmDialog, FormDialog) are used directly by
 * features via DialogShell; this context owns imperative stack entries.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

export interface DialogEntry {
  id: string;
  title: string;
  content: ReactNode;
}

interface DialogContextValue {
  dialogs: DialogEntry[];
  openDialog: (dialog: Omit<DialogEntry, "id">) => string;
  closeDialog: (id: string) => void;
  closeTopDialog: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<DialogEntry[]>([]);
  const counter = useRef(0);

  const closeDialog = useCallback((id: string) => {
    setDialogs((current) => current.filter((d) => d.id !== id));
  }, []);
  const closeTopDialog = useCallback(() => {
    setDialogs((current) => current.slice(0, -1));
  }, []);
  const openDialog = useCallback((dialog: Omit<DialogEntry, "id">) => {
    counter.current += 1;
    const id = `dialog-${counter.current}`;
    setDialogs((current) => [...current, { ...dialog, id }]);
    return id;
  }, []);

  return (
    <DialogContext.Provider value={{ dialogs, openDialog, closeDialog, closeTopDialog }}>
      {children}
      {dialogs.map((dialog) => (
        <DialogPrimitive.Root
          key={dialog.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) closeDialog(dialog.id);
          }}
        >
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <DialogPrimitive.Content
              aria-label={dialog.title}
              className="fixed top-1/2 left-1/2 z-50 max-h-[80dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg bg-white p-6 dark:bg-slate-900"
            >
              <DialogPrimitive.Title className="text-lg font-medium">
                {dialog.title}
              </DialogPrimitive.Title>
              <div className="mt-4">{dialog.content}</div>
              <DialogPrimitive.Close asChild>
                <button type="button" className="mt-6 rounded-md border px-3 py-1.5 text-sm">
                  Close
                </button>
              </DialogPrimitive.Close>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      ))}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useDialog must be used within DialogProvider");
  return value;
}
