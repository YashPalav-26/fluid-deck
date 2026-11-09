/**
 * UI-002 - resource grid. Acceptance: 500-item cap + windowing.
 * The service caps results at RESOURCE_GRID_CAP (500); this grid renders
 * a 50-card window that grows on scroll (append-on-scroll, Phase 2.5),
 * so DOM size stays bounded without a virtualization library — the
 * >500 threshold that would require one is never reached.
 */
import { useEffect, useRef, useState } from "react";
import type { Resource } from "@fluid-deck/core";
import { GRID_WINDOW_SIZE, nextWindowSize, windowedResources } from "../../services/library.ts";
import { ResourceCard } from "./ResourceCard.tsx";

interface ResourceGridProps {
  resources: Resource[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  trashed?: boolean;
  emptyTitle: string;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onOpen?: (id: string) => void;
}

export function ResourceGrid({
  resources,
  totalCount,
  isLoading,
  isError,
  trashed = false,
  emptyTitle,
  onTrash,
  onRestore,
  onOpen,
}: ResourceGridProps) {
  const [visibleCount, setVisibleCount] = useState(GRID_WINDOW_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset the window whenever the underlying result set changes identity.
  useEffect(() => {
    setVisibleCount(GRID_WINDOW_SIZE);
  }, [resources]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((current) => nextWindowSize(current));
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [resources.length]);

  if (isLoading) {
    return (
      <div data-testid="grid-loading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p data-testid="grid-error" role="alert" className="rounded-lg border p-6 text-sm">
        Could not load your library. Your data is untouched — reload to try again.
      </p>
    );
  }

  if (resources.length === 0) {
    return (
      <div data-testid="grid-empty" className="rounded-lg border border-dashed p-10 text-center">
        <h2 className="text-lg font-medium">{emptyTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Save a page with the Fluid Deck extension, or import your bookmarks.
        </p>
      </div>
    );
  }

  const visible = windowedResources(resources, visibleCount);

  return (
    <div>
      <p data-testid="grid-count" className="mb-3 text-sm text-slate-500">
        Showing {visible.length} of {totalCount} resources
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((resource) => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            trashed={trashed}
            onTrash={onTrash}
            onRestore={onRestore}
            onOpen={onOpen}
          />
        ))}
      </div>
      {visible.length < resources.length ? <div ref={sentinelRef} aria-hidden="true" /> : null}
      {totalCount > resources.length ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          Grid shows the first {resources.length} of {totalCount} — narrow the view to see more.
        </p>
      ) : null}
    </div>
  );
}
