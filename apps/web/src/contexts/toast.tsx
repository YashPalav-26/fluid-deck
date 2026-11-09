/**
 * UI-009 — toast context (Phase 2.5 §4): transient feedback only.
 * Internals swapped to Sonner (zero-dep, aria-live); the `useToast()` API
 * (pushToast / dismissToast / toasts) is preserved from Sprint 3 so
 * existing consumers don't change. Toasts never carry user content and
 * never substitute for a Dexie commit message.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

export interface Toast {
  id: string;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  pushToast: (message: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    sonnerToast.dismiss();
  }, []);
  const pushToast = useCallback((message: string) => {
    counter.current += 1;
    const id = `toast-${counter.current}`;
    setToasts((current) => [...current.slice(-2), { id, message }]);
    sonnerToast(message, { id });
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, pushToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}
