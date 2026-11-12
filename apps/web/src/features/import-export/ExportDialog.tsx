/**
 * IMPORT-006 - export dialog.
 *
 * Two scopes reachable from Settings: the whole library, or one collection. The
 * `selected` and `filter` scopes already exist in `export/json.ts`; they need the
 * library chrome (IMPORT-009) to know what is selected.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { db as defaultDatabase } from "../../persistence/db.ts";
import type { FluidDeckDatabase } from "../../persistence/db.ts";
import { useToast } from "../../contexts/toast.tsx";
import { exportJson, downloadExport } from "../../export/json.ts";
import { listCollections } from "../../repositories/collections.ts";
import { DialogShell } from "../dialogs/DialogShell.tsx";

type ScopeKind = "all" | "collection";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Injectable for tests; defaults to the app database. */
  database?: FluidDeckDatabase;
}

export function ExportDialog({
  open,
  onOpenChange,
  database = defaultDatabase,
}: ExportDialogProps) {
  const { pushToast } = useToast();
  const [kind, setKind] = useState<ScopeKind>("all");
  const [collectionId, setCollectionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => listCollections(database),
    enabled: open,
  });

  const run = useMutation({
    mutationFn: async () => {
      const exported =
        kind === "all"
          ? await exportJson(database, { kind: "all" })
          : await exportJson(database, { kind: "collection", collectionId });
      downloadExport(exported);
      return exported.meta;
    },
    onSuccess: (meta) => pushToast(`Exported ${meta.resourceCount} resources`),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Export failed"),
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && run.isPending) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setKind("all");
      setCollectionId("");
      setError(null);
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title="Export library"
      description="Download a JSON file. Trashed items are never included."
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What to export</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="export-scope"
              checked={kind === "all"}
              onChange={() => setKind("all")}
            />
            Everything
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="export-scope"
              checked={kind === "collection"}
              onChange={() => setKind("collection")}
            />
            One collection
          </label>
        </fieldset>

        {kind === "collection" ? (
          <label className="block text-sm">
            <span>Collection</span>
            <select
              aria-label="Collection"
              value={collectionId}
              onChange={(event) => setCollectionId(event.target.value)}
              className="mt-1 block w-full rounded-md border px-3 py-1.5 text-sm"
            >
              <option value="">Choose a collection</option>
              {(collections.data ?? []).map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            {collections.isSuccess && collections.data.length === 0 ? (
              <span className="mt-1 block text-xs text-slate-500">No collections yet.</span>
            ) : null}
          </label>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={() => handleOpenChange(false)}
            disabled={run.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            onClick={() => run.mutate()}
            disabled={run.isPending || (kind === "collection" && collectionId === "")}
          >
            {run.isPending ? "Exporting." : "Export JSON"}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </DialogShell>
  );
}
