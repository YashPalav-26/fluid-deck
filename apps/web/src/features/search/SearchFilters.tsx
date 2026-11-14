/**
 * UI-004 - facet + sort controls. Dumb: every control writes ViewState
 * through `onChange`, so the URL stays the single source of truth and the
 * search/browse services do all filtering. Facet option lists are
 * database-driven (collections, tags, domains passed in from Query).
 */
import type { Collection, Tag, ViewState } from "@fluid-deck/core";
import { RESOURCE_SOURCES, RESOURCE_TYPES, VIEW_SORT_OPTIONS } from "@fluid-deck/core";
import { buildTree } from "../collections/CollectionsPanel.tsx";
import type { FacetCounts } from "../../services/search.ts";

const SORT_LABELS: Record<(typeof VIEW_SORT_OPTIONS)[number], string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
  "most-tagged": "Most tagged",
  "recently-opened": "Recently opened",
  relevance: "Relevance",
};

interface SearchFiltersProps {
  view: ViewState;
  onChange: (patch: Partial<ViewState>) => void;
  onClear: () => void;
  collections: Collection[];
  tags: Tag[];
  domains: string[];
  counts?: FacetCounts;
}

/** Depth-first flatten of the collection tree, so children are indented under parents. */
function collectionOptions(collections: Collection[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (nodes: ReturnType<typeof buildTree>) => {
    for (const node of nodes) {
      out.push({
        id: node.collection.id,
        label: `${"— ".repeat(node.depth - 1)}${node.collection.name}`,
      });
      walk(node.children);
    }
  };
  walk(buildTree(collections));
  return out;
}

const controlClass =
  "rounded-md border px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-slate-700 dark:bg-slate-900";

export function SearchFilters({
  view,
  onChange,
  onClear,
  collections,
  tags,
  domains,
  counts,
}: SearchFiltersProps) {
  const hasFilters =
    view.type !== undefined ||
    view.source !== undefined ||
    view.domain !== undefined ||
    view.date !== undefined ||
    view.collection !== undefined ||
    view.tags.length > 0 ||
    view.unorganized;

  const toggleTag = (normalizedName: string) => {
    const next = view.tags.includes(normalizedName)
      ? view.tags.filter((name) => name !== normalizedName)
      : [...view.tags, normalizedName];
    onChange({ tags: next });
  };

  const customDate = view.date?.startsWith("custom:") === true;

  return (
    <section
      aria-label="Search filters"
      className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border p-3 dark:border-slate-800"
    >
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Type
        <select
          className={controlClass}
          value={view.type ?? ""}
          onChange={(event) =>
            onChange({ type: (event.target.value || undefined) as ViewState["type"] })
          }
        >
          <option value="">Any type</option>
          {RESOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
              {counts ? ` (${counts.type[type] ?? 0})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Source
        <select
          className={controlClass}
          value={view.source ?? ""}
          onChange={(event) =>
            onChange({ source: (event.target.value || undefined) as ViewState["source"] })
          }
        >
          <option value="">Any source</option>
          {RESOURCE_SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
              {counts ? ` (${counts.source[source] ?? 0})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Date
        <select
          className={controlClass}
          value={customDate ? "custom" : (view.date ?? "")}
          onChange={(event) =>
            onChange({ date: (event.target.value || undefined) as ViewState["date"] })
          }
        >
          <option value="">Any date</option>
          <option value="week">Past week</option>
          <option value="month">Past month</option>
          <option value="year">Past year</option>
          {customDate ? (
            <option value="custom" disabled>
              Custom range
            </option>
          ) : null}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Domain
        <select
          className={`${controlClass} max-w-40`}
          value={view.domain ?? ""}
          onChange={(event) => onChange({ domain: event.target.value || undefined })}
        >
          <option value="">Any domain</option>
          {domains.map((domain) => (
            <option key={domain} value={domain}>
              {domain}
              {counts ? ` (${counts.domain[domain] ?? 0})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Collection
        <select
          className={`${controlClass} max-w-44`}
          value={view.collection ?? ""}
          onChange={(event) => onChange({ collection: event.target.value || undefined })}
        >
          <option value="">Any collection</option>
          {collectionOptions(collections).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Sort
        <select
          className={controlClass}
          value={view.sort}
          onChange={(event) => onChange({ sort: event.target.value as ViewState["sort"] })}
        >
          {VIEW_SORT_OPTIONS.filter((option) => option !== "relevance" || view.q.trim() !== "").map(
            (option) => (
              <option key={option} value={option}>
                {SORT_LABELS[option]}
              </option>
            ),
          )}
        </select>
      </label>

      <label className="flex items-center gap-2 py-1.5 text-sm">
        <input
          type="checkbox"
          checked={view.unorganized}
          onChange={(event) => onChange({ unorganized: event.target.checked })}
        />
        Unorganized
        {counts ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">({counts.unorganized})</span>
        ) : null}
      </label>

      <details className="basis-full">
        <summary className="cursor-pointer text-xs text-slate-500">
          Tags{view.tags.length > 0 ? ` (${view.tags.length} selected)` : ""}
        </summary>
        <fieldset className="mt-2 flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
          <legend className="sr-only">Filter by tags (any of the selected tags)</legend>
          {tags.length === 0 ? (
            <p className="text-xs text-slate-500">No tags yet.</p>
          ) : (
            tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={view.tags.includes(tag.normalizedName)}
                  onChange={() => toggleTag(tag.normalizedName)}
                />
                {tag.name}
                {counts ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({counts.tag[tag.id] ?? 0})
                  </span>
                ) : null}
              </label>
            ))
          )}
        </fieldset>
      </details>

      <button
        type="button"
        className="rounded-md border px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:border-slate-700"
        disabled={!hasFilters}
        onClick={onClear}
      >
        Clear filters
      </button>
    </section>
  );
}
