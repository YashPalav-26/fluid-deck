/**
 * UI-002 - one resource card. Text-only rendering for all third-party
 * fields (Security §4: no dangerouslySetInnerHTML); the only external
 * link is the resource URL itself, http(s)-only by repository validation.
 *
 * EXT-003: the media slot is always present (`aspect-video`), so a missing,
 * unsafe, or failed thumbnail swaps to the placeholder instead of collapsing
 * the card or showing a broken-image glyph.
 */
import { memo, useState } from "react";
import { ImageOff } from "lucide-react";
import { httpUrlSchema, type Resource } from "@fluid-deck/core";
import { cardVariantForType } from "./card-variant.ts";

interface ResourceCardProps {
  resource: Resource;
  trashed?: boolean;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onOpen?: (id: string) => void;
}

/** Runtime guard: only absolute http(s) thumbnails reach the DOM. */
function safeThumbnailUrl(raw: string): string | undefined {
  return raw && httpUrlSchema.safeParse(raw).success ? raw : undefined;
}

export const ResourceCard = memo(function ResourceCard({
  resource,
  trashed = false,
  onTrash,
  onRestore,
  onOpen,
}: ResourceCardProps) {
  const variant = cardVariantForType(resource.type);
  const thumbnailUrl = safeThumbnailUrl(resource.thumbnailUrl);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = thumbnailUrl !== undefined && failedUrl !== thumbnailUrl;

  return (
    <article
      data-testid="resource-card"
      data-variant={variant}
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <div
        data-testid="resource-thumbnail"
        className="relative aspect-video w-full overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800"
      >
        {showImage ? (
          <img
            data-testid="resource-thumbnail-image"
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setFailedUrl(thumbnailUrl)}
          />
        ) : (
          <div
            data-testid="thumbnail-placeholder"
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 dark:from-slate-800 dark:to-slate-700 dark:text-slate-500"
          >
            <ImageOff className="h-6 w-6" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {resource.type}
        </span>
        <span className="truncate text-xs text-slate-500">{resource.domain}</span>
      </div>
      <h3 className="text-base font-medium text-slate-900 dark:text-slate-100">
        <a
          href={resource.url}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => onOpen?.(resource.id)}
        >
          {resource.title}
        </a>
      </h3>
      {resource.description ? (
        <p className="line-clamp-3 text-sm text-slate-600 dark:text-slate-400">
          {resource.description}
        </p>
      ) : null}
      <div className="mt-auto flex items-center gap-2 pt-1">
        {trashed && onRestore ? (
          <button
            type="button"
            className="rounded-md border px-2 py-1 text-xs"
            onClick={() => onRestore(resource.id)}
          >
            Restore
          </button>
        ) : null}
        {!trashed && onTrash ? (
          <button
            type="button"
            aria-label={`Move ${resource.title} to trash`}
            className="rounded-md border px-2 py-1 text-xs"
            onClick={() => onTrash(resource.id)}
          >
            Trash
          </button>
        ) : null}
      </div>
    </article>
  );
});
