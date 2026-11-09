/**
 * UI-008 — capture inbox view: Dated and Linked tabs over the same
 * resource rows as the grid. The capture extension (M6) will feed this
 * view; today it reads existing Dexie data.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "../../persistence/db.ts";
import { getDatedResources, getLinkedResources } from "../../services/inbox.ts";
import { useMarkOpened } from "../../hooks/queries.ts";
import { EmptyState } from "../dialogs/EmptyState.tsx";

type InboxTab = "dated" | "linked";

export function InboxPage() {
  const [tab, setTab] = useState<InboxTab>("dated");
  const markOpened = useMarkOpened();
  const query = useQuery({
    queryKey: ["inbox", tab],
    queryFn: () => (tab === "dated" ? getDatedResources(db) : getLinkedResources(db)),
  });

  const resources = query.data ?? [];

  return (
    <section aria-label="Capture inbox">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold tracking-tight">Capture inbox</h2>
        <p className="text-sm text-slate-500">
          Newly captured resources land here before they are organized.
        </p>
      </header>

      <div role="tablist" aria-label="Inbox filters" className="mb-4 flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "dated"}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            tab === "dated" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : ""
          }`}
          onClick={() => setTab("dated")}
        >
          Dated
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "linked"}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            tab === "linked" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : ""
          }`}
          onClick={() => setTab("linked")}
        >
          Linked
        </button>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : resources.length === 0 ? (
        <EmptyState
          title="Inbox is empty"
          description="Save a page with the Fluid Deck extension and it will appear here."
        />
      ) : (
        <ul className="divide-y">
          {resources.map((resource) => (
            <li key={resource.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{resource.title}</p>
                <p className="truncate text-xs text-slate-500">{resource.domain}</p>
              </div>
              <a
                href={resource.url}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => markOpened.mutate(resource.id)}
              >
                Open
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
