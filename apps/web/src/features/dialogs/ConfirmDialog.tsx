/**
 * UI-009 — explicit-confirm dialog for destructive actions (U5 purge,
 * delete collection/tag). The confirm step text includes the count so
 * the user knows what will happen before committing.
 */
import { DialogShell } from "./DialogShell.tsx";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  isPending?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  isPending = false,
}: ConfirmDialogProps) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={title} description={description}>
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
          type="button"
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={onConfirm}
          disabled={isPending}
        >
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}
