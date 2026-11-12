/**
 * UI-001/UI-002/UI-003 shell + M5 additions (UI-005 palette, UI-008 inbox,
 * UI-010 settings) + UI-004 search. Single-route app: content is the grid,
 * inbox, or settings depending on the `view` URL param
 * (`?view=trash|inbox|settings`).
 *
 * Search routing rule: a non-empty `q` goes through the faceted Search
 * Service; an empty `q` stays on the lighter browse query, because the
 * faceted path recomputes facet counts over every candidate (~1.4-2.9s at
 * 10k) and would regress plain browsing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "./components/AppShell.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { ResourceGrid } from "./features/library/ResourceGrid.tsx";
import { InboxPage } from "./features/inbox/InboxPage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";
import { CommandPalette } from "./features/palette/CommandPalette.tsx";
import { SearchInput } from "./features/search/SearchInput.tsx";
import { SearchFilters } from "./features/search/SearchFilters.tsx";
import { SearchStatus } from "./features/search/SearchStatus.tsx";
import { isEditableTarget } from "./features/search/search-shortcuts.ts";
import { useViewState } from "./hooks/useViewState.ts";
import { useSearchIndex } from "./hooks/search-index.ts";
import {
  useCollections,
  useDomains,
  useMarkOpened,
  useResources,
  useRestoreResource,
  useSearchResults,
  useTags,
  useTrashResource,
  queryKeys,
} from "./hooks/queries.ts";
import { useToast } from "./contexts/toast.tsx";
import { useTheme } from "./contexts/theme.tsx";
import { getDbLifecycle, subscribeDbLifecycle } from "./persistence/db.ts";
import type { DbLifecycle } from "./persistence/db.ts";
import type { IntegrityReport } from "./persistence/integrity.ts";

export function App({ integrity }: { integrity: IntegrityReport | null }) {
  const route = useViewState();
  const query = route.view.q;
  const searching = query.trim() !== "" && !route.trash;
  const index = useSearchIndex();
  // Keyword search cannot run before the index exists; gating on it means the
  // query executes once the index is ready instead of caching an empty result.
  const indexBlocked = searching && !index.ready;
  const search = useSearchResults(route.view, { enabled: searching && !indexBlocked });
  const resources = useResources(route.view, route.trash, { enabled: !searching });
  const domains = useDomains();
  const collections = useCollections();
  const tags = useTags();
  const trashResource = useTrashResource();
  const restoreResource = useRestoreResource();
  const markOpened = useMarkOpened();
  const { pushToast } = useToast();
  const { toggleTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<DbLifecycle>(() => getDbLifecycle());
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeDbLifecycle(setLifecycle), []);

  // UI-005 Ctrl/Cmd+K palette; UI-004 `/` focuses search unless typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      const target = searchInputRef.current;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isEditableTarget(event.target) &&
        target !== null &&
        !target.disabled &&
        document.querySelector('[role="dialog"]') === null
      ) {
        event.preventDefault();
        target.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Empty <-> non-empty query swaps the sort default: relevance needs a
  // query, newest is the browse default. Explicit user choices are kept.
  const handleQueryChange = useCallback(
    (next: string) => {
      const wasEmpty = route.view.q.trim() === "";
      const isEmpty = next.trim() === "";
      let sort = route.view.sort;
      if (wasEmpty && !isEmpty && sort === "newest") sort = "relevance";
      else if (isEmpty && sort === "relevance") sort = "newest";
      route.updateView({ q: next, sort });
    },
    [route],
  );

  const clearFilters = useCallback(
    () =>
      route.updateView({
        type: undefined,
        source: undefined,
        domain: undefined,
        date: undefined,
        collection: undefined,
        tags: [],
        unorganized: false,
      }),
    [route],
  );

  const gridResources = searching ? (search.data ?? []) : (resources.data ?? []);
  const totalCount = searching ? (search.data?.total ?? 0) : gridResources.length;

  return (
    <AppShell
      onOpenPalette={() => setPaletteOpen(true)}
      headerSearch={
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          inputRef={searchInputRef}
          disabled={route.trash}
          disabledHint="Search covers library items. Restore an item to search it."
        />
      }
      sidebar={
        <Sidebar
          route={route}
          updateView={route.updateView}
          goAll={route.goAll}
          goTrash={route.goTrash}
          goInbox={route.goInbox}
          goSettings={route.goSettings}
        />
      }
    >
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        actions={{
          goAll: route.goAll,
          goTrash: route.goTrash,
          goInbox: route.goInbox,
          goSettings: route.goSettings,
          selectCollection: (id) => route.updateView({ collection: id }, { trash: false }),
          selectTag: (name) => route.updateView({ tags: [name] }, { trash: false }),
          newCollection: () => route.goAll(),
          newTag: () => route.goAll(),
          toggleTheme,
        }}
      />
      {lifecycle.status === "blocked" || lifecycle.status === "versionchange" ? (
        <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          {lifecycle.message ?? "Database is being upgraded in another tab."}
        </p>
      ) : null}
      {integrity && !integrity.ok ? (
        <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          Some records failed validation and were quarantined ({integrity.invalid.length} invalid,{" "}
          {integrity.orphanJoins.length} orphaned, {integrity.usageMismatches.length} tag-count
          mismatches). The rest of your library is usable.
        </p>
      ) : null}

      {route.page === "settings" ? (
        <SettingsPage />
      ) : route.page === "inbox" ? (
        <InboxPage />
      ) : (
        <>
          {route.trash ? null : (
            <SearchFilters
              view={route.view}
              onChange={route.updateView}
              onClear={clearFilters}
              collections={collections.data ?? []}
              tags={tags.data ?? []}
              domains={domains.data ?? []}
              counts={search.data?.facetCounts}
            />
          )}
          {searching ? (
            <SearchStatus
              query={query}
              total={search.data?.total ?? 0}
              returned={search.data?.resources.length ?? 0}
              truncated={search.data?.truncated ?? false}
              truncatedCount={search.data?.truncatedCount ?? 0}
              partial={search.data?.partial ?? false}
              isLoading={search.isLoading}
              isError={search.isError}
              onRetry={() => void search.refetch()}
            />
          ) : null}
          <ResourceGrid
            resources={gridResources}
            totalCount={totalCount}
            isLoading={
              searching
                ? indexBlocked
                  ? index.status !== "error"
                  : search.isLoading
                : resources.isLoading
            }
            isError={searching ? search.isError : resources.isError}
            trashed={route.trash}
            emptyTitle={
              route.trash
                ? "Trash is empty"
                : searching
                  ? index.status === "error"
                    ? "Search is unavailable"
                    : `No matches for “${query.trim()}”`
                  : "No resources yet"
            }
            emptyHint={
              searching
                ? index.status === "error"
                  ? "The search index could not be built. Reload the app to try again."
                  : "Try fewer words or clear a filter."
                : undefined
            }
            onTrash={(id) => {
              trashResource.mutate(id, {
                onSuccess: () => pushToast("Moved to trash"),
                onError: () => pushToast("Could not move to trash"),
              });
            }}
            onRestore={(id) => {
              restoreResource.mutate(id, {
                onSuccess: () => pushToast("Restored"),
                onError: () => pushToast("Could not restore"),
              });
            }}
            onOpen={(id) => markOpened.mutate(id)}
          />
        </>
      )}
    </AppShell>
  );
}
export { queryKeys };
