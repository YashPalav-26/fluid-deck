/**
 * UI-009 — small name/label form dialog (new collection, rename collection,
 * new tag, rename/merge tag). Validates with the repo layer; the dialog
 * surfaces Zod errors textually, never silently.
 */
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { DialogShell } from "./DialogShell.tsx";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialValue?: string;
  inputLabel: string;
  error?: string | null;
  isPending?: boolean;
  onSubmit: (value: string) => void;
  children?: ReactNode;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue = "",
  inputLabel,
  error,
  isPending = false,
  onSubmit,
  children,
}: FormDialogProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value);
  };

  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">{inputLabel}</span>
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            autoFocus
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        {children}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            disabled={isPending}
          >
            Save
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
