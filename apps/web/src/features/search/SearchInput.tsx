/**
 * UI-004 - header search input (Frontend architecture §1: debounced 150ms).
 * The input owns only the draft text; the query itself lives in the URL, so
 * back/forward and refresh stay authoritative.
 *
 * Two rules keep those sources from fighting:
 * - the pending debounce is cancelled whenever the URL value changes, so an
 *   external navigation (trash, back/forward, palette) can never be undone by
 *   a queued keystroke;
 * - clearing bypasses the debounce so the grid returns immediately.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Search, X } from "lucide-react";

const DEBOUNCE_MS = 150;

interface SearchInputProps {
  value: string;
  onChange: (q: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  disabledHint?: string;
}

export function SearchInput({
  value,
  onChange,
  inputRef,
  disabled = false,
  disabledHint,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const cancelPending = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // The URL wins over the draft: adopt its value and drop anything queued.
  useEffect(() => {
    cancelPending();
    setDraft(value);
  }, [value, cancelPending]);

  // Never fire a queued keystroke after unmount.
  useEffect(() => cancelPending, [cancelPending]);

  const schedule = useCallback((next: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onChangeRef.current(next);
    }, DEBOUNCE_MS);
  }, []);

  const emitNow = useCallback(
    (next: string) => {
      cancelPending();
      setDraft(next);
      onChangeRef.current(next);
    },
    [cancelPending],
  );

  return (
    <div role="search" className="min-w-0 flex-1 md:max-w-md">
      <label htmlFor="shell-search" className="sr-only">
        Search resources
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          id="shell-search"
          ref={inputRef}
          type="search"
          value={draft}
          disabled={disabled}
          placeholder={disabled ? "Search unavailable" : "Search resources…"}
          aria-describedby={disabled && disabledHint ? "shell-search-hint" : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            schedule(next);
          }}
          onBlur={() => {
            // Commit a pending draft before a facet/sort control takes over,
            // otherwise that control's URL write would drop the typed query.
            if (draft !== value) emitNow(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && draft !== "") {
              event.preventDefault();
              emitNow("");
            } else if (event.key === "Enter" && draft !== value) {
              event.preventDefault();
              emitNow(draft);
            }
          }}
          className="w-full rounded-md border py-1.5 pr-8 pl-8 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-900 dark:disabled:bg-slate-800"
        />
        {draft !== "" && !disabled ? (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:text-slate-100"
            onClick={() => emitNow("")}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {disabled && disabledHint ? (
        <p id="shell-search-hint" className="mt-1 text-xs text-slate-500">
          {disabledHint}
        </p>
      ) : null}
    </div>
  );
}
