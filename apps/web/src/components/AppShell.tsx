/**
 * UI-001 - app shell: sidebar + header + main (Phase 2.5 §1). One layout,
 * one route; dialogs and toasts are overlays, not pages. Below 768px the
 * sidebar becomes an overlay panel toggled from the header.
 */
import type { ReactNode } from "react";
import { APP_NAME } from "@fluid-deck/core";
import { useShell } from "../contexts/shell.tsx";
import { useTheme } from "../contexts/theme.tsx";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  onOpenPalette?: () => void;
}

export function AppShell({ sidebar, children, onOpenPalette }: AppShellProps) {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useShell();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-dvh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <button
        type="button"
        aria-label="Toggle navigation"
        aria-expanded={sidebarOpen}
        className="fixed top-3 left-3 z-40 rounded-md border bg-white px-2 py-1 text-sm dark:bg-slate-900 md:hidden"
        onClick={toggleSidebar}
      >
        ☰
      </button>

      {sidebarOpen ? (
        <aside className="fixed inset-y-0 left-0 z-30 w-64 border-r bg-white dark:border-slate-800 dark:bg-slate-950 md:static md:z-auto">
          {sidebar}
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-4 py-3 pl-12 md:pl-4 dark:border-slate-800">
          <h1 className="text-lg font-semibold tracking-tight">{APP_NAME}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="⌘K — open command palette"
              className="rounded-md border px-2 py-1 text-sm"
              onClick={onOpenPalette}
            >
              ⌘K
            </button>
            <button
              type="button"
              className="hidden rounded-md border px-2 py-1 text-sm md:block"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "Hide" : "Show"} sidebar
            </button>
            <button
              type="button"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              className="rounded-md border px-2 py-1 text-sm"
              onClick={toggleTheme}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
