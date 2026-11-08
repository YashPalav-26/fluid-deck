import { APP_NAME, DB_NAME, SCHEMA_VERSION } from "@fluid-deck/core";
import { Button } from "@fluid-deck/ui";

/**
 * Sprint 1 shell only: proves Vite + React + Tailwind + workspace packages work.
 * Real routing/grid/state land in Sprint 2 (UI-001..UI-003).
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">
          Local-first library
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{APP_NAME}</h1>
        <p className="text-slate-600">
          Capture, organize and revisit your internet resources. Everything stays on this device.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Foundation status</h2>
        <p data-testid="env-status" className="mt-1 text-sm text-slate-600">
          Development environment OK — web app running, shared packages loaded.
        </p>
        <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-900">Database</dt>
            <dd className="font-mono">{DB_NAME}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Schema</dt>
            <dd className="font-mono">v{SCHEMA_VERSION}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Telemetry</dt>
            <dd>none, ever</dd>
          </div>
        </dl>
        <Button className="mt-5" onClick={() => alert("Sprint 2 adds the first real action.")}>
          Placeholder action
        </Button>
      </section>
    </main>
  );
}
