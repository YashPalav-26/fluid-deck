/**
 * UI-001 sidebar, upgraded for M5: navigation (All / Trash / Inbox /
 * Settings) plus UI-006 collections tree and UI-007 tag management.
 *
 * Props keep the Sprint 3 surface; page navigation flows through
 * dedicated goInbox/goSettings callbacks.
 */
import type { RouteState } from "../hooks/useViewState.ts";
import { CollectionsPanel } from "../features/collections/CollectionsPanel.tsx";
import { TagsPanel } from "../features/tags/TagsPanel.tsx";
import { useShell } from "../contexts/shell.tsx";

interface SidebarProps {
  route: RouteState;
  updateView: (patch: Partial<RouteState["view"]>, options?: { trash?: boolean }) => void;
  goAll: () => void;
  goTrash: () => void;
  goInbox: () => void;
  goSettings: () => void;
  onNavigate?: () => void;
}

export function Sidebar({
  route,
  updateView,
  goAll,
  goTrash,
  goInbox,
  goSettings,
  onNavigate,
}: SidebarProps) {
  const { setSidebarOpen } = useShell();
  const { view, trash, page } = route;

  const linkClass = (active: boolean) =>
    `block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
      active ? "bg-slate-100 font-medium dark:bg-slate-800" : ""
    }`;

  const closeAfter = () => {
    // Only collapse the overlay sidebar on small screens; on desktop the
    // sidebar stays docked (AppShell renders it `md:static`).
    if (window.matchMedia?.("(max-width: 767px)").matches) {
      setSidebarOpen(false);
    }
    onNavigate?.();
  };

  return (
    <nav aria-label="Library" className="flex h-full flex-col gap-6 overflow-auto p-4">
      <div>
        <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Library
        </h2>
        <button
          type="button"
          aria-current={
            !trash && !page && !view.collection && view.tags.length === 0 ? "page" : undefined
          }
          className={linkClass(!trash && !page && !view.collection && view.tags.length === 0)}
          onClick={() => {
            goAll();
            closeAfter();
          }}
        >
          All resources
        </button>
        <button
          type="button"
          aria-current={page === "inbox" ? "page" : undefined}
          className={linkClass(page === "inbox")}
          onClick={() => {
            goInbox();
            closeAfter();
          }}
        >
          Capture inbox
        </button>
        <button
          type="button"
          aria-current={trash ? "page" : undefined}
          className={linkClass(trash)}
          onClick={() => {
            goTrash();
            closeAfter();
          }}
        >
          Trash
        </button>
        <button
          type="button"
          aria-current={page === "settings" ? "page" : undefined}
          className={linkClass(page === "settings")}
          onClick={() => {
            goSettings();
            closeAfter();
          }}
        >
          Settings
        </button>
      </div>

      <section aria-label="Collections">
        <CollectionsPanel
          activeId={view.collection ?? null}
          onSelect={(id) => {
            updateView({ collection: id ?? undefined }, { trash: false });
            closeAfter();
          }}
        />
      </section>

      <section aria-label="Tags">
        <TagsPanel
          activeNames={view.tags}
          onToggle={(normalizedName) => {
            updateView(
              {
                tags: view.tags.includes(normalizedName)
                  ? view.tags.filter((name) => name !== normalizedName)
                  : [...view.tags, normalizedName],
              },
              { trash: false },
            );
            closeAfter();
          }}
        />
      </section>
    </nav>
  );
}
