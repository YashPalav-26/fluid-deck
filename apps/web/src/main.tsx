import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { App } from "./App.tsx";
import { ThemeProvider } from "./contexts/theme.tsx";
import { ShellProvider } from "./contexts/shell.tsx";
import { DialogProvider } from "./contexts/dialog.tsx";
import { ToastProvider } from "./contexts/toast.tsx";
import { db, openDatabase } from "./persistence/db.ts";
import { checkIntegrity } from "./persistence/integrity.ts";
import type { IntegrityReport } from "./persistence/integrity.ts";
import { startInbox } from "./bridge/inbox.ts";
import { invalidateResourceQueries } from "./hooks/queries.ts";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");
const appRoot: HTMLElement = rootElement;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});

function render(app: React.ReactNode) {
  createRoot(appRoot).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ShellProvider>
            <DialogProvider>
              <ToastProvider>
                {app}
                <Toaster richColors={false} closeButton={false} />
              </ToastProvider>
            </DialogProvider>
          </ShellProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

/**
 * DB-004 boot wiring (UI-001): open Dexie once, run the read-only
 * integrity check, then render. A database failure renders an explicit
 * error screen — never a blank page, never an auto-delete.
 */
async function bootstrap(): Promise<void> {
  try {
    await openDatabase();
    const integrity: IntegrityReport = await checkIntegrity(db);
    // EXT-004: the capture inbox attaches only after IndexedDB is open, so an
    // inbound deliver can never race a closed database. A bridge failure must
    // not take down the app shell.
    try {
      startInbox({
        database: db,
        onCommitted: () => void invalidateResourceQueries(queryClient),
      });
    } catch (error) {
      console.error("[Fluid Deck] capture bridge unavailable", error);
    }
    render(<App integrity={integrity} />);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    render(
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Database unavailable</h1>
        <p role="alert" className="text-sm text-slate-600">
          Fluid Deck could not open its local database ({message}). Your data has not been deleted.
          Free some storage space and reload, or restore from a JSON backup.
        </p>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </main>,
    );
  }
}

void bootstrap();
