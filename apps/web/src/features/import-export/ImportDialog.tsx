/**
 * IMPORT-005 — preview-first import dialog.
 *
 * Flow: pick a file -> validate (IMPORT-003) -> read-only preview (counts +
 * conflicts) -> per-conflict resolution or "apply to all" -> commit (IMPORT-004
 * with IMPORT-005 resolutions). Nothing is written before the user confirms, and
 * dismissal leaves the database untouched. Conflicts are re-checked inside the
 * commit transaction, so a stale preview can never act on the wrong row.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db as defaultDatabase } from "../../persistence/db.ts";
import type { FluidDeckDatabase } from "../../persistence/db.ts";
import { useToast } from "../../contexts/toast.tsx";
import { commitImport } from "../../import/commit.ts";
import type { ImportCommitResult } from "../../import/commit.ts";
import { previewImport } from "../../import/preview.ts";
import type { ImportConflictResolution, ImportPreview } from "../../import/preview.ts";
import {
  ImportValidationError,
  validateHtmlImport,
  validateRaindropImport,
} from "../../import/validate.ts";
import type { ValidatedImport } from "../../import/validate.ts";
import { DialogShell } from "../dialogs/DialogShell.tsx";

const RESOLUTIONS: Array<{ value: ImportConflictResolution; label: string }> = [
  { value: "skip", label: "Skip" },
  { value: "update", label: "Update metadata" },
  { value: "add-to-collections", label: "Add to collections" },
];

type Stage = "idle" | "preview" | "done";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Injectable for tests; defaults to the app database. */
  database?: FluidDeckDatabase;
}

export function ImportDialog({
  open,
  onOpenChange,
  database = defaultDatabase,
}: ImportDialogProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [stage, setStage] = useState<Stage>("idle");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState<ValidatedImport | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ImportConflictResolution>>({});
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const reset = () => {
    setStage("idle");
    setReading(false);
    setError(null);
    setValidated(null);
    setPreview(null);
    setResolutions({});
    setResult(null);
  };

  const commit = useMutation({
    mutationFn: async () => {
      if (!validated) throw new Error("No validated import to commit");
      return commitImport(database, validated, {
        defaultResolution: "skip",
        resolutions: new Map(Object.entries(resolutions)),
      });
    },
    onSuccess: (outcome) => {
      setResult(outcome);
      setStage("done");
      // Invalidate only after the Dexie commit resolved.
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["domains"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      pushToast(`Imported ${outcome.created} resources`);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Import failed");
    },
  });

  async function handleFile(file: File) {
    setError(null);
    try {
      setReading(true);
      const text = await file.text();
      const parsed = /\.json$/i.test(file.name)
        ? validateRaindropImport(text)
        : validateHtmlImport(text);
      const next = await previewImport(database, parsed);
      setValidated(parsed);
      setPreview(next);
      setResolutions(
        Object.fromEntries(next.conflicts.map((conflict) => [conflict.canonicalUrl, "skip"])),
      );
      setStage("preview");
    } catch (cause) {
      setValidated(null);
      setPreview(null);
      setStage("idle");
      setError(
        cause instanceof ImportValidationError
          ? cause.message
          : "Could not read that file as a bookmark export",
      );
    } finally {
      setReading(false);
    }
  }

  function applyToAll(resolution: ImportConflictResolution) {
    if (!preview) return;
    setResolutions(
      Object.fromEntries(preview.conflicts.map((conflict) => [conflict.canonicalUrl, resolution])),
    );
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && commit.isPending) return;
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={handleOpenChange}
      title="Import bookmarks"
      description="Preview an HTML bookmark export or a Raindrop JSON export before anything is saved."
    >
      {stage === "idle" ? (
        <div className="space-y-3">
          <label className="block text-sm">
            <span>Bookmark file</span>
            <input
              type="file"
              accept=".html,.htm,.json,text/html,application/json"
              className="mt-2 block w-full text-sm"
              disabled={reading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleFile(file);
              }}
            />
          </label>
          <p className="text-xs text-slate-500">
            {reading
              ? "Reading and validating…"
              : "Nothing is written until you confirm the preview."}
          </p>
        </div>
      ) : null}

      {stage === "preview" && preview ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-slate-500">New resources</dt>
              <dd className="font-medium">{preview.counts.newResources}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Conflicts</dt>
              <dd className="font-medium">{preview.counts.duplicates}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Collections</dt>
              <dd className="font-medium">{preview.counts.collections}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Tags</dt>
              <dd className="font-medium">{preview.counts.tags}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Skipped during validation</dt>
              <dd className="font-medium">{preview.counts.skipped}</dd>
            </div>
          </dl>

          {preview.conflicts.length > 0 ? (
            <section aria-label="Conflicts" className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Apply to all</span>
                {RESOLUTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs"
                    onClick={() => applyToAll(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <ul className="max-h-56 space-y-3 overflow-auto pr-1">
                {preview.conflicts.map((conflict) => (
                  <li key={conflict.canonicalUrl}>
                    <fieldset>
                      <legend className="w-full truncate text-sm">
                        {conflict.incoming.title || conflict.incoming.url}
                      </legend>
                      <p className="truncate text-xs text-slate-500">
                        Already saved: {conflict.existing.title || conflict.existing.url}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3">
                        {RESOLUTIONS.map((option) => (
                          <label key={option.value} className="flex items-center gap-1 text-xs">
                            <input
                              type="radio"
                              name={`conflict-${conflict.resourceIndex}`}
                              value={option.value}
                              checked={resolutions[conflict.canonicalUrl] === option.value}
                              onChange={() =>
                                setResolutions((current) => ({
                                  ...current,
                                  [conflict.canonicalUrl]: option.value,
                                }))
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              onClick={() => handleOpenChange(false)}
              disabled={commit.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              onClick={() => commit.mutate()}
              disabled={commit.isPending}
            >
              {commit.isPending ? "Importing…" : "Import now"}
            </button>
          </div>
        </div>
      ) : null}

      {stage === "done" && result ? (
        <div className="space-y-4">
          <p className="text-sm">
            Imported {result.created} new resources. {result.updated} updated,{" "}
            {result.addedToCollections} added to collections, {result.duplicates} duplicate
            {result.duplicates === 1 ? "" : "s"} matched.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
              onClick={() => handleOpenChange(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </DialogShell>
  );
}
