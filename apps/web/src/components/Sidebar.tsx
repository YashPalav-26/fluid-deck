/**
 * UI-001 - sidebar navigation. Lists collections and tags from Dexie and
 * sets URL view state on selection (FR-SRH-003). Collection/tag
 * management (create/rename/merge) is M5 (UI-006/UI-007) — this is
 * navigation only.
 */
import { useCollections, useTags } from "../hooks/queries.ts";
import type { RouteState } from "../hooks/useViewState.ts";

interface SidebarProps {
  route: RouteState;
  updateView: (patch: Partial<RouteState["view"]>, options?: { trash?: boolean }) => void;
  goAll: () => void;
  goTrash: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ route, updateView, goAll, goTrash, onNavigate }: SidebarProps) {
  const collections = useCollections();
  const tags = useTags();
  const { view, trash } = route;

  const linkClass = (active: boolean) =>
    `block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
      active ? "bg-slate-100 font-medium dark:bg-slate-800" : ""
    }`;

  return (
    <nav aria-label="Library" className="flex h-full flex-col gap-6 overflow-auto p-4">
      <div>
        <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Library
        </h2>
        <button
          type="button"
          aria-current={!trash && !view.collection && view.tags.length === 0 ? "page" : undefined}
          className={linkClass(!trash && !view.collection && view.tags.length === 0)}
          onClick={() => {
            goAll();
            onNavigate?.();
          }}
        >
          All resources
        </button>
        <button
          type="button"
          aria-current={trash ? "page" : undefined}
          className={linkClass(trash)}
          onClick={() => {
            goTrash();
            onNavigate?.();
          }}
        >
          Trash
        </button>
      </div>

      <div>
        <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Collections
        </h2>
        {collections.isLoading ? (
          <p className="px-3 text-sm text-slate-500">Loading…</p>
        ) : collections.data?.length ? (
          <ul>
            {collections.data.map((collection) => (
              <li key={collection.id}>
                <button
                  type="button"
                  aria-current={view.collection === collection.id ? "page" : undefined}
                  className={linkClass(view.collection === collection.id)}
                  onClick={() => {
                    updateView({ collection: collection.id }, { trash: false });
                    onNavigate?.();
                  }}
                >
                  {collection.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 text-sm text-slate-500">No collections yet</p>
        )}
      </div>

      <div>
        <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Tags
        </h2>
        {tags.isLoading ? (
          <p className="px-3 text-sm text-slate-500">Loading…</p>
        ) : tags.data?.length ? (
          <ul>
            {tags.data.map((tag) => {
              const active = view.tags.includes(tag.normalizedName);
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    className={linkClass(active)}
                    onClick={() => {
                      updateView(
                        {
                          tags: active
                            ? view.tags.filter((name) => name !== tag.normalizedName)
                            : [...view.tags, tag.normalizedName],
                        },
                        { trash: false },
                      );
                      onNavigate?.();
                    }}
                  >
                    {tag.name}
                    <span className="ml-1 text-xs text-slate-400">({tag.usageCount})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-3 text-sm text-slate-500">No tags yet</p>
        )}
      </div>
    </nav>
  );
}
