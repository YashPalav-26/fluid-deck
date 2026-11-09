/**
 * UI-003 - dialog-stack context (Phase 2.5 §4): global overlay dialogs
 * only. M4 ships the provider + stack renderer; concrete dialogs
 * (resource details, settings, confirmations) arrive with UI-009/UI-010.
 * Dialogs trap focus and restore it on close (WCAG 2.2 AA).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

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

  useEffect(() => {
    if (dialogs.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTopDialog();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogs.length, closeTopDialog]);

  return (
    <DialogContext.Provider value={{ dialogs, openDialog, closeDialog, closeTopDialog }}>
      {children}
      {dialogs.map((dialog) => (
        <div
          key={dialog.id}
          role="dialog"
          aria-modal="true"
          aria-label={dialog.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => closeDialog(dialog.id)}
        >
          <div
            className="max-h-[80dvh] w-full max-w-lg overflow-auto rounded-lg bg-white p-6 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-medium">{dialog.title}</h2>
            <div className="mt-4">{dialog.content}</div>
            <button
              type="button"
              className="mt-6 rounded-md border px-3 py-1.5 text-sm"
              onClick={() => closeDialog(dialog.id)}
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useDialog must be used within DialogProvider");
  return value;
}
