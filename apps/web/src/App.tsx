/**
 * UI-001/UI-002/UI-003 shell + M5 additions (UI-005 palette, UI-008 inbox,
 * UI-010 settings). Single-route app: content is the grid, inbox, or
 * settings depending on the `view` URL param (`?view=trash|inbox|settings`).
 * Keyword search, resource details and extension capture are later
 * milestones (UI-004 / M6 / M7).
 */
import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { ResourceGrid } from "./features/library/ResourceGrid.tsx";
import { InboxPage } from "./features/inbox/InboxPage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";
import { CommandPalette } from "./features/palette/CommandPalette.tsx";
import { useViewState } from "./hooks/useViewState.ts";
import {
  useMarkOpened,
  useResources,
  useRestoreResource,
  useTrashResource,
  queryKeys,
} from "./hooks/queries.ts";
import { useToast } from "./contexts/toast.tsx";
import { useTheme } from "./contexts/theme.tsx";
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
  const { toggleTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<DbLifecycle>(() => getDbLifecycle());

  useEffect(() => subscribeDbLifecycle(setLifecycle), []);

  // UI-005: Ctrl/Cmd+K opens the command palette.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const allResources = resources.data ?? [];

  return (
    <AppShell
      onOpenPalette={() => setPaletteOpen(true)}
      sidebar={
        <Sidebar
          route={route}
          updateView={route.updateView}
          goAll={route.goAll}
          goTrash={route.goTrash}
          goInbox={route.goInbox}
          goSettings={route.goSettings}
        />
      }
    >
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        actions={{
          goAll: route.goAll,
          goTrash: route.goTrash,
          goInbox: route.goInbox,
          goSettings: route.goSettings,
          selectCollection: (id) => route.updateView({ collection: id }, { trash: false }),
          selectTag: (name) => route.updateView({ tags: [name] }, { trash: false }),
          newCollection: () => route.goAll(),
          newTag: () => route.goAll(),
          toggleTheme,
        }}
      />
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

      {route.page === "settings" ? (
        <SettingsPage />
      ) : route.page === "inbox" ? (
        <InboxPage />
      ) : (
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
      )}
    </AppShell>
  );
}
export { queryKeys };
