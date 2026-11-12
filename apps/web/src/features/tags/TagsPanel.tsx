/**
 * UI-007 — sidebar tag management: create/rename/merge/delete using the
 * Sprint 2 repository ops. U6 free-form names (trim, 1–200 chars) are
 * the repository's authority (`normalizeTagName`); this UI only surfaces
 * errors textually. Rename propagation + merge membership are asserted
 * in TagsPanel.test.tsx against a real (fake-indexeddb) database.
 */
import { useState } from "react";
import type { Tag } from "@fluid-deck/core";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "../../persistence/db.ts";
import { queryKeys, useTags } from "../../hooks/queries.ts";
import { createTag, deleteTag, listTags, mergeTags, renameTag } from "../../repositories/tags.ts";
import { listTaggedResources } from "../../repositories/relationships.ts";
import { syncTagRename, syncTagMerge, syncResourcesBatch } from "../../services/search.ts";
import { useToast } from "../../contexts/toast.tsx";
import { FormDialog } from "../../features/dialogs/FormDialog.tsx";
import { ConfirmDialog } from "../../features/dialogs/ConfirmDialog.tsx";
import { EmptyState } from "../../features/dialogs/EmptyState.tsx";

interface TagDialogState {
  kind: "create" | "rename" | "merge" | "delete";
  tag?: Tag;
}

export function TagsPanel({
  activeNames,
  onToggle,
}: {
  activeNames: string[];
  onToggle: (normalizedName: string) => void;
}) {
  const tags = useTags();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [dialog, setDialog] = useState<TagDialogState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tags });
    void queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    void queryClient.invalidateQueries({ queryKey: ["resources"] });
  };

  const handleSubmit = async (value: string) => {
    setIsPending(true);
    setFormError(null);
    try {
      if (dialog?.kind === "create") {
        await createTag(db, value.trim());
      } else if (dialog?.kind === "rename" && dialog.tag) {
        await renameTag(db, dialog.tag.id, value.trim());
        void syncTagRename(db, dialog.tag.id);
        pushToast("Tag renamed");
      } else if (dialog?.kind === "merge" && dialog.tag) {
        const targetId = mergeTarget;
        if (!targetId) throw new Error("Choose a tag to merge into");
        const count = await mergeTags(db, dialog.tag.id, targetId);
        void syncTagMerge(db, targetId);
        pushToast(`Merged ${count} resources`);
      }
      invalidate();
      setDialog(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save tag");
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async () => {
    if (!dialog?.tag) return;
    setIsPending(true);
    try {
      const tagged = await listTaggedResources(db, dialog.tag.id);
      await deleteTag(db, dialog.tag.id);
      void syncResourcesBatch(
        db,
        tagged.map((r) => r.id),
      );
      invalidate();
      setDialog(null);
      pushToast("Tag deleted");
    } catch {
      setFormError("Could not delete tag");
    } finally {
      setIsPending(false);
    }
  };

  if (tags.isLoading) return <p className="px-3 text-sm text-slate-500">Loading…</p>;
  const tagList = tags.data ?? [];

  if (!tagList.length) {
    return (
      <EmptyState
        title="No tags yet"
        description="Tag resources to find them quickly."
        action={
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={() => setDialog({ kind: "create" })}
          >
            New tag
          </button>
        }
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Tags</span>
        <button
          type="button"
          aria-label="New tag"
          className="rounded-md border px-2 py-0.5 text-xs"
          onClick={() => setDialog({ kind: "create" })}
        >
          + Add
        </button>
      </div>
      <ul>
        {tagList.map((tag) => {
          const active = activeNames.includes(tag.normalizedName);
          return (
            <li key={tag.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                className={`block w-full flex-1 rounded-md px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  active ? "bg-slate-100 font-medium dark:bg-slate-800" : ""
                }`}
                onClick={() => onToggle(tag.normalizedName)}
              >
                {tag.name}
                <span className="ml-1 text-xs text-slate-400">({tag.usageCount})</span>
              </button>
              <button
                type="button"
                aria-label={`Rename tag ${tag.name}`}
                className="text-xs text-slate-400 hover:text-slate-600"
                onClick={() => setDialog({ kind: "rename", tag })}
              >
                Rename
              </button>
              <button
                type="button"
                aria-label={`Merge tag ${tag.name}`}
                className="text-xs text-slate-400 hover:text-slate-600"
                onClick={() => setDialog({ kind: "merge", tag })}
              >
                Merge
              </button>
              <button
                type="button"
                aria-label={`Delete tag ${tag.name}`}
                className="text-xs text-slate-400 hover:text-red-600"
                onClick={() => setDialog({ kind: "delete", tag })}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>

      <FormDialog
        open={dialog?.kind === "create" || dialog?.kind === "rename"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialog?.kind === "rename" ? "Rename tag" : "New tag"}
        description="Free-form names: leading/trailing spaces are trimmed."
        inputLabel="Tag name"
        initialValue={dialog?.kind === "rename" ? (dialog.tag?.name ?? "") : ""}
        error={formError}
        isPending={isPending}
        onSubmit={handleSubmit}
      />
      <FormDialog
        open={dialog?.kind === "merge"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={`Merge "${dialog?.tag?.name ?? ""}" into…`}
        inputLabel="Target tag"
        initialValue=""
        error={formError}
        isPending={isPending}
        onSubmit={(value) => {
          const target = tagList.find(
            (t) => t.normalizedName === value.trim().normalize("NFC").toLowerCase(),
          );
          if (!target) {
            setFormError("No tag with that name");
            return;
          }
          void (async () => {
            setMergeTarget(target.id);
            await handleSubmit("");
          })();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={`Delete tag "${dialog?.tag?.name ?? ""}"?`}
        description="Memberships are removed; resources are kept."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}

export { listTags };
