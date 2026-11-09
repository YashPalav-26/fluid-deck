/**
 * UI-003 - shell context: sidebar visibility only (Phase 2.5 §4).
 * The sidebar collapses to an overlay panel below 768px; this context
 * owns open/closed so header and sidebar stay in sync.
 */
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface ShellContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);

  return (
    <ShellContext.Provider value={{ sidebarOpen, setSidebarOpen, toggleSidebar }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used within ShellProvider");
  return value;
}
