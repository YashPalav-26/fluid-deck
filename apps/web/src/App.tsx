/**
 * UI-001/UI-002/UI-003 - single-route app: AppShell + sidebar + URL-param
 * routing + resource grid, fed by TanStack Query over Dexie.
 * Keyword search, command palette, details panel and settings are
 * explicitly later milestones (UI-004/UI-005/UI-009/UI-010).
 */
import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { ResourceGrid } from "./features/library/ResourceGrid.tsx";
import { useViewState } from "./hooks/useViewState.ts";
import {
  useMarkOpened,
  useResources,
  useRestoreResource,
  useTrashResource,
} from "./hooks/queries.ts";
import { useToast } from "./contexts/toast.tsx";
import { getDbLifecycle, subscribeDbLifecycle } from "./persistence/db.ts";
import type { DbLifecycle } from "./persistence/db.ts";
import type { IntegrityReport } from "./persistence/integrity.ts";

export function App({ integrity }: { integrity: IntegrityReport | null }) {
  const route = useViewState();
  const resources = useResources(route.view, route.trash);
  const trashResource = useTrashResource();
  const restoreResource = useRestoreResource();
  const markOpened = useMarkOpened();
  const { pushToast } = useToast();
  const [lifecycle, setLifecycle] = useState<DbLifecycle>(() => getDbLifecycle());

  useEffect(() => subscribeDbLifecycle(setLifecycle), []);

  const allResources = resources.data ?? [];

  return (
    <AppShell
      sidebar={
        <Sidebar
          route={route}
          updateView={route.updateView}
          goAll={route.goAll}
          goTrash={route.goTrash}
        />
      }
    >
      {lifecycle.status === "blocked" || lifecycle.status === "versionchange" ? (
        <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          {lifecycle.message ?? "Database is being upgraded in another tab."}
        </p>
      ) : null}
      {integrity && !integrity.ok ? (
        <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          Some records failed validation and were quarantined ({integrity.invalid.length} invalid,{" "}
          {integrity.orphanJoins.length} orphaned, {integrity.usageMismatches.length} tag-count
          mismatches). The rest of your library is usable.
        </p>
      ) : null}

      <ResourceGrid
        resources={allResources}
        totalCount={allResources.length}
        isLoading={resources.isLoading}
        isError={resources.isError}
        trashed={route.trash}
        emptyTitle={route.trash ? "Trash is empty" : "No resources yet"}
        onTrash={(id) => {
          trashResource.mutate(id, {
            onSuccess: () => pushToast("Moved to trash"),
            onError: () => pushToast("Could not move to trash"),
          });
        }}
        onRestore={(id) => {
          restoreResource.mutate(id, {
            onSuccess: () => pushToast("Restored"),
            onError: () => pushToast("Could not restore"),
          });
        }}
        onOpen={(id) => markOpened.mutate(id)}
      />
    </AppShell>
  );
}
