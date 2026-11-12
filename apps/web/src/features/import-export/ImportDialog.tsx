/**
 * IMPORT-005 — preview-first import dialog.
 * IMPORT-009 — file picker, per-batch progress, warnings, error summary + re-run.
 *
 * Flow: pick a file -> validate (IMPORT-003) -> read-only preview (counts +
 * conflicts) -> per-conflict resolution or "apply to all" -> commit (IMPORT-004
 * with IMPORT-005 resolutions) -> summary. Nothing is written before the user
 * confirms, and dismissal leaves the database untouched. Conflicts are
 * re-checked inside the commit transaction, so a stale preview can never act on
 * the wrong row. A failed run keeps its checkpoint, so "Re-run" resumes.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db as defaultDatabase } from "../../persistence/db.ts";
import type { FluidDeckDatabase } from "../../persistence/db.ts";
import { useToast } from "../../contexts/toast.tsx";
import { ImportCommitError, commitImport } from "../../import/commit.ts";
import type { ImportCommitProgress, ImportCommitResult } from "../../import/commit.ts";
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

/** The plan caps the summary at three rows; more detail is in the preview counts. */
const MAX_PROBLEMS = 3;
const MAX_WARNINGS = 5;

type Stage = "idle" | "preview" | "done";

interface ImportProblem {
  title: string;
  messages: string[];
  hint: string;
}

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
  const [problem, setProblem] = useState<ImportProblem | null>(null);
  const [validated, setValidated] = useState<ValidatedImport | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ImportConflictResolution>>({});
  const [progress, setProgress] = useState<ImportCommitProgress | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage("idle");
    setReading(false);
    setProblem(null);
    setValidated(null);
    setPreview(null);
    setResolutions({});
    setProgress(null);
    setResult(null);
  };

  // After a failed run or "Import another file", put focus back on the picker.
  useEffect(() => {
    if (open && !problem && stage === "idle" && !reading) fileInput.current?.focus();
  }, [open, problem, stage, reading]);

  const commit = useMutation({
    mutationFn: async () => {
      if (!validated) throw new Error("No validated import to commit");
      return commitImport(database, validated, {
        defaultResolution: "skip",
        resolutions: new Map(Object.entries(resolutions)),
        onProgress: setProgress,
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
      const known = cause instanceof ImportCommitError;
      setProgress(null);
      setProblem({
        title: "Import stopped",
        messages: [known ? cause.message : "The import could not be completed."],
        hint:
          known && cause.committed > 0
            ? "Re-run to resume from the last saved batch; nothing is duplicated."
            : "Nothing was saved. Re-run to try again.",
      });
    },
  });

  async function handleFile(file: File) {
    setProblem(null);
    setProgress(null);
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
      const known = cause instanceof ImportValidationError;
      setProblem({
        title: "This file could not be imported",
        messages: [known ? cause.message : "Could not read that file as a bookmark export."].slice(
          0,
          MAX_PROBLEMS,
        ),
        hint: known
          ? "File corrupted. Re-export from source."
          : "Export your bookmarks again, then re-run the import.",
      });
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

  function retry() {
    setProblem(null);
    setProgress(null);
    // A failed commit keeps the parsed file and its resolutions: resume from the preview.
    setStage(preview ? "preview" : "idle");
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
      {problem ? (
        <div role="alert" aria-labelledby="import-problem-title" className="space-y-3">
          <h3
            id="import-problem-title"
            className="text-sm font-semibold text-red-700 dark:text-red-400"
          >
            {problem.title}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {problem.messages.slice(0, MAX_PROBLEMS).map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">{problem.hint}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => handleOpenChange(false)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-slate-100 dark:text-slate-900"
              onClick={retry}
            >
              Re-run
            </button>
          </div>
        </div>
      ) : null}

      {!problem && stage === "idle" ? (
        <div className="space-y-3">
          <label className="block text-sm">
            <span>Bookmark file</span>
            <input
              ref={fileInput}
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
          <p className="text-xs text-slate-500" role="status" aria-live="polite">
            {reading
              ? "Reading and validating…"
              : "Nothing is written until you confirm the preview."}
          </p>
        </div>
      ) : null}

      {!problem && stage === "preview" && preview ? (
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

          {validated && validated.warnings.length > 0 ? (
            <details className="rounded-md border border-amber-300 p-2 text-xs dark:border-amber-700">
              <summary className="cursor-pointer text-amber-800 dark:text-amber-300">
                {validated.warnings.length} item
                {validated.warnings.length === 1 ? "" : "s"} skipped or adjusted during validation
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {validated.warnings.slice(0, MAX_WARNINGS).map((warning, index) => (
                  <li key={index}>
                    {warning.kind}
                    {warning.index === undefined ? "" : ` #${warning.index + 1}`}: {warning.reason}
                  </li>
                ))}
                {validated.warnings.length > MAX_WARNINGS ? (
                  <li>… {validated.warnings.length - MAX_WARNINGS} more</li>
                ) : null}
              </ul>
            </details>
          ) : null}

          {preview.conflicts.length > 0 ? (
            <section aria-label="Conflicts" className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Apply to all</span>
                {RESOLUTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
                    onClick={() => applyToAll(option.value)}
                    disabled={commit.isPending}
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
                              disabled={commit.isPending}
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

          {commit.isPending ? (
            <div className="space-y-1">
              <progress
                aria-label="Import progress"
                className="h-2 w-full"
                max={progress?.total ?? validated?.resources.length ?? 0}
                value={progress?.processed ?? 0}
              />
              <p className="text-xs text-slate-500" role="status" aria-live="polite">
                {progress
                  ? `Batch ${progress.batch}: ${progress.processed} of ${progress.total} resources`
                  : "Preparing import…"}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => handleOpenChange(false)}
              disabled={commit.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-slate-100 dark:text-slate-900"
              onClick={() => commit.mutate()}
              disabled={commit.isPending}
            >
              {commit.isPending ? "Importing…" : "Import now"}
            </button>
          </div>
        </div>
      ) : null}

      {!problem && stage === "done" && result ? (
        <div className="space-y-4">
          <p className="text-sm">
            Imported {result.created} new resources. {result.updated} updated,{" "}
            {result.addedToCollections} added to collections, {result.duplicates} duplicate
            {result.duplicates === 1 ? "" : "s"} matched.
          </p>
          {result.resumedFrom > 0 ? (
            <p className="text-xs text-slate-500">
              Resumed from item {result.resumedFrom + 1} using the saved checkpoint.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={reset}
            >
              Import another file
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-slate-100 dark:text-slate-900"
              onClick={() => handleOpenChange(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </DialogShell>
  );
}
