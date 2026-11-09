/** UI-009 — shared empty state for inbox/collections/tags/settings. */
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className="rounded-lg border border-dashed p-10 text-center dark:border-slate-700"
    >
      <h2 className="text-lg font-medium">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}
