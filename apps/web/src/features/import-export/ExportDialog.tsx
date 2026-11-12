/**
 * IMPORT-006/007 - export dialog.
 *
 * Scopes reachable from Settings: the whole library or one collection. `selected`
 * and `filter` exist in the export service; they need the library chrome
 * (IMPORT-009) to know what is selected. HTML/Markdown/CSV builders load lazily so
 * the entry chunk carries only the JSON path.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { db as defaultDatabase } from "../../persistence/db.ts";
import type { FluidDeckDatabase } from "../../persistence/db.ts";
import { useToast } from "../../contexts/toast.tsx";
import { exportJson } from "../../export/json.ts";
import { downloadExport } from "../../export/source.ts";
import type { ExportFile } from "../../export/source.ts";
import { listCollections } from "../../repositories/collections.ts";
import { DialogShell } from "../dialogs/DialogShell.tsx";

type ScopeKind = "all" | "collection";
type Format = "json" | "html" | "markdown" | "csv";

const FORMATS: Array<{ value: Format; label: string }> = [
  { value: "json", label: "JSON (full fidelity)" },
  { value: "html", label: "HTML bookmarks" },
  { value: "markdown", label: "Markdown" },
  { value: "csv", label: "CSV" },
];

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
  const [format, setFormat] = useState<Format>("json");
  const [includeThumbnails, setIncludeThumbnails] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [collectionId, setCollectionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => listCollections(database),
    enabled: open,
  });

  const run = useMutation({
    mutationFn: async () => {
      const scope =
        kind === "all"
          ? ({ kind: "all" } as const)
          : ({ kind: "collection", collectionId } as const);
      let file: ExportFile;
      if (format === "json") {
        file = await exportJson(database, scope);
      } else {
        const { exportHtml, exportMarkdown, exportCsv } = await import("../../export/formats.ts");
        const options = { includeThumbnails, includeNotes };
        file =
          format === "html"
            ? await exportHtml(database, scope, options)
            : format === "markdown"
              ? await exportMarkdown(database, scope, options)
              : await exportCsv(database, scope, options);
      }
      downloadExport(file);
      return { ...file.meta, format };
    },
    onSuccess: (meta) => pushToast(`Exported ${meta.resourceCount} resources as ${meta.format}`),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Export failed"),
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && run.isPending) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setKind("all");
      setFormat("json");
      setIncludeThumbnails(false);
      setIncludeNotes(true);
      setCollectionId("");
      setError(null);
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title="Export library"
      description="Download the library as JSON, HTML bookmarks, Markdown or CSV. Trashed items are never included."
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

        <label className="block text-sm">
          <span>Format</span>
          <select
            aria-label="Format"
            value={format}
            onChange={(event) => setFormat(event.target.value as Format)}
            className="mt-1 block w-full rounded-md border px-3 py-1.5 text-sm"
          >
            {FORMATS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeThumbnails}
              onChange={(event) => setIncludeThumbnails(event.target.checked)}
            />
            Include thumbnails
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeNotes}
              disabled={format !== "markdown"}
              onChange={(event) => setIncludeNotes(event.target.checked)}
            />
            Include notes (Markdown only)
          </label>
        </div>

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
            {run.isPending ? "Exporting." : "Export file"}
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
