/**
 * UI-003 - one of four small global UI contexts (Phase 2.5 §4):
 * theme only. Persisted via the preferences store; `documentElement`
 * class is the single source of truth for Tailwind dark: variants.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { db } from "../persistence/db.ts";
import { getPreference, setPreference } from "../repositories/preferences.ts";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // UI-010: load the persisted theme preference once on mount (fixes the
  // Sprint 3 write-only behavior — the theme used to reset every reload).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getPreference(db, "theme").catch(() => undefined);
      if (!cancelled && (stored === "dark" || stored === "light")) {
        setTheme(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      // Fire-and-forget: theme is a preference, never worth blocking on.
      void setPreference(db, "theme", next).catch(() => undefined);
      return next;
    });
  }, []);

  const setStoredTheme = useCallback((next: Theme) => {
    setTheme(next);
    void setPreference(db, "theme", next).catch(() => undefined);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: setStoredTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
