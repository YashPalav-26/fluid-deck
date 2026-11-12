/**
 * UI-004 - search status line. One polite live region reports indexing,
 * loading, error, partial-index and count/truncation so screen readers hear
 * the same state sighted users see. Capped results are never presented as
 * the complete result set.
 */
import { useSearchIndex } from "../../hooks/search-index.ts";

interface SearchStatusProps {
  query: string;
  total: number;
  returned: number;
  truncated: boolean;
  truncatedCount: number;
  partial: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function SearchStatus({
  query,
  total,
  returned,
  truncated,
  truncatedCount,
  partial,
  isLoading,
  isError,
  onRetry,
}: SearchStatusProps) {
  const index = useSearchIndex();
  const hasQuery = query.trim() !== "";
  // Without a ready index a keyword query silently returns nothing; say so
  // instead of showing an empty result set.
  const indexing = hasQuery && !index.ready && index.status !== "error";

  if (isError) {
    return (
      <p
        data-testid="search-status"
        role="alert"
        className="mb-3 rounded-md border border-red-300 p-3 text-sm"
      >
        Search failed. Your data is untouched.{" "}
        <button type="button" className="underline" onClick={onRetry}>
          Try again
        </button>
      </p>
    );
  }

  let message = "";
  if (indexing) {
    const progress =
      index.progress && index.progress.total > 0
        ? ` (${index.progress.done} of ${index.progress.total} indexed)`
        : "";
    message = `Search index is still building${progress}. Keyword results may be incomplete.`;
  } else if (hasQuery && index.status === "error") {
    message = "Search index is unavailable — reload the app to rebuild it.";
  } else if (isLoading) {
    message = "Searching…";
  } else {
    message = `${total.toLocaleString()} match${total === 1 ? "" : "es"}`;
    if (truncated) message += ` · showing the first ${returned.toLocaleString()}`;
  }

  return (
    <div data-testid="search-status" role="status" aria-live="polite" className="mb-3 text-sm">
      <p className="text-slate-500">{message}</p>
      {truncated && !isLoading && !indexing ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          {truncatedCount.toLocaleString()} more matches are hidden by the{" "}
          {returned.toLocaleString()}-result limit. Narrow the search or add filters to see them.
        </p>
      ) : null}
      {partial && !indexing ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          The index was still updating, so this list may be incomplete.
        </p>
      ) : null}
    </div>
  );
}
