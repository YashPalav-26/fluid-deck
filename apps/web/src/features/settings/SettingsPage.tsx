/**
 * UI-010 — settings screen: theme preference (persisted via the
 * preferences repository; resolves the Sprint 3 write-only bug), trash
 * retention pref (U5: default 30 days), and the danger-zone purge
 * (explicit ConfirmDialog, never automatic).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_PURGE_RETENTION_DAYS } from "@fluid-deck/core";
import { db } from "../../persistence/db.ts";
import { getPreference, setPreference } from "../../repositories/preferences.ts";
import { listTrashedResources, purgeDeletedResources } from "../../repositories/resources.ts";
import { useTheme } from "../../contexts/theme.tsx";
import { useToast } from "../../contexts/toast.tsx";
import { ConfirmDialog } from "../dialogs/ConfirmDialog.tsx";
import { EmptyState } from "../dialogs/EmptyState.tsx";
import { ImportDialog } from "../import-export/ImportDialog.tsx";
import { ExportDialog } from "../import-export/ExportDialog.tsx";

async function readPrefs() {
  const [theme, days] = await Promise.all([
    getPreference(db, "theme").catch(() => undefined),
    getPreference(db, "purgeRetentionDays").catch(() => undefined),
  ]);
  return {
    theme: theme === "dark" || theme === "light" ? theme : "light",
    days: Number(days) || DEFAULT_PURGE_RETENTION_DAYS,
  };
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: readPrefs });
  const [days, setDays] = useState(String(DEFAULT_PURGE_RETENTION_DAYS));
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const trashed = useQuery({
    queryKey: ["trashed-count"],
    queryFn: () => listTrashedResources(db),
  });

  useEffect(() => {
    if (prefs.data) setDays(String(prefs.data.days));
  }, [prefs.data]);

  const mutatePrefs = useMutation({
    mutationFn: async (values: { theme?: string; days?: string }) => {
      if (values.theme) {
        await setPreference(db, "theme", values.theme);
        setTheme(values.theme === "dark" ? "dark" : "light");
      }
      if (values.days) await setPreference(db, "purgeRetentionDays", values.days);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prefs"] });
      pushToast("Settings saved");
    },
    onError: () => pushToast("Could not save settings"),
  });

  const purge = useMutation({
    mutationFn: (retentionDays: number) =>
      purgeDeletedResources(db, { confirm: true, retentionDays }),
    onSuccess: ({ purged }) => {
      setPurgeOpen(false);
      pushToast(`Purged ${purged} items`);
      void queryClient.invalidateQueries({ queryKey: ["trashed-count"] });
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: () => pushToast("Purge failed"),
  });

  const trashedCount = trashed.data?.length ?? 0;

  return (
    <section aria-label="Settings">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-slate-500">Preferences are stored locally in this browser.</p>
      </header>

      <div className="max-w-xl space-y-8">
        <section aria-label="Appearance">
          <h3 className="text-base font-medium">Appearance</h3>
          <label className="mt-3 flex items-center justify-between gap-4">
            <span className="text-sm">Theme</span>
            <select
              aria-label="Theme"
              value={theme}
              onChange={(event) => mutatePrefs.mutate({ theme: event.target.value })}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </section>

        <section aria-label="Trash retention">
          <h3 className="text-base font-medium">Trash retention (U5)</h3>
          <p className="mt-1 text-sm text-slate-500">
            Items in trash older than this are eligible for purge (explicit confirm required).
          </p>
          <label className="mt-3 block">
            <span className="text-sm">Retention in days</span>
            <input
              type="number"
              min={0}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="mt-1 block w-40 rounded-md border px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            className="mt-3 rounded-md border px-3 py-1.5 text-sm"
            onClick={() => mutatePrefs.mutate({ days })}
            disabled={mutatePrefs.isPending}
          >
            Save retention
          </button>
        </section>

        <section aria-label="Import">
          <h3 className="text-base font-medium">Import</h3>
          <p className="mt-1 text-sm text-slate-500">
            Bring in browser bookmarks (HTML) or a Raindrop export (JSON). You see a preview and
            resolve duplicates before anything is saved.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md border px-3 py-1.5 text-sm"
            onClick={() => setImportOpen(true)}
          >
            Import bookmarks…
          </button>
        </section>

        <section aria-label="Export">
          <h3 className="text-base font-medium">Export</h3>
          <p className="mt-1 text-sm text-slate-500">
            Download everything, or one collection, as a JSON file with collections and tags.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md border px-3 py-1.5 text-sm"
            onClick={() => setExportOpen(true)}
          >
            Export JSON…
          </button>
        </section>

        <section aria-label="Danger zone">
          <h3 className="text-base font-medium text-red-600">Danger zone</h3>
          {trashedCount === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Trash is empty — nothing to purge.</p>
          ) : (
            <EmptyState
              title={`${trashedCount} item${trashedCount === 1 ? "" : "s"} in trash`}
              description={`Purging permanently deletes items older than ${days} days. This cannot be undone.`}
              action={
                <button
                  type="button"
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white"
                  onClick={() => setPurgeOpen(true)}
                >
                  Purge trash…
                </button>
              }
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={`Purge ${trashedCount} trashed items?`}
        description={`Permanently delete items older than ${days} days from trash. This cannot be undone.`}
        confirmLabel="Purge now"
        onConfirm={() => purge.mutate(Number(days) || DEFAULT_PURGE_RETENTION_DAYS)}
        isPending={purge.isPending}
      />

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </section>
  );
}
