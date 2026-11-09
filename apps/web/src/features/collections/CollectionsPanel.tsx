/**
 * UI-006 — sidebar collection management: nested tree, create/rename/delete,
 * keyboard-accessible drag reorder (U1 fractional indexing via Sprint 2's
 * `reorderCollection`), depth warning at 4 levels (U2: warn-only, never
 * blocks). Review state lives in TanStack Query; every mutation
 * invalidates the collections query after its Dexie commit.
 */
import { useState } from "react";
import type { Collection } from "@fluid-deck/core";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { db } from "../../persistence/db.ts";
import { useCollections } from "../../hooks/queries.ts";
import {
  createCollection,
  deleteCollection,
  getCollectionDepth,
  listSiblings,
  renameCollection,
  reorderCollection,
} from "../../repositories/collections.ts";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../hooks/queries.ts";
import { useToast } from "../../contexts/toast.tsx";
import { FormDialog } from "../../features/dialogs/FormDialog.tsx";
import { ConfirmDialog } from "../../features/dialogs/ConfirmDialog.tsx";
import { EmptyState } from "../../features/dialogs/EmptyState.tsx";
import { isDepthWarning } from "@fluid-deck/core";

interface Node {
  collection: Collection;
  children: Node[];
  depth: number;
}

export function buildTree(collections: Collection[]): Node[] {
  const childrenByParent = new Map<string | null, Collection[]>();
  for (const c of collections) {
    const key = c.parentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(c);
    childrenByParent.set(key, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex);
  }
  const make = (parentId: string | null, depth: number): Node[] =>
    (childrenByParent.get(parentId) ?? []).map((collection) => ({
      collection,
      depth,
      children: make(collection.id, depth + 1),
    }));
  return make(null, 1);
}

interface SortableNodeProps {
  node: Node;
  onSelect: (id: string) => void;
  activeId: string | null;
}

function SortableNode({ node, onSelect, activeId }: SortableNodeProps) {
  const { collection, children, depth } = node;
  const active = activeId === collection.id;
  const control = useSortable({ id: collection.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = control;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li style={style} ref={setNodeRef} {...attributes} {...listeners}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`block w-full flex-1 rounded-md px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
            active ? "bg-slate-100 font-medium dark:bg-slate-800" : ""
          }`}
          onClick={() => onSelect(collection.id)}
          aria-label={`Collection ${collection.name}`}
          aria-current={active ? "page" : undefined}
        >
          {collection.name}
        </button>
        {isDepthWarning(depth) ? (
          <span
            role="note"
            aria-label={`Depth warning: ${collection.name} is at level ${depth}`}
            className="text-xs text-amber-600"
            title={`Depth warning: nesting reaches ${depth} levels (U2)`}
          >
            ⚠
          </span>
        ) : null}
      </div>
      {children.length > 0 ? (
        <ul className="ml-3 border-l pl-2">
          {children.map((child) => (
            <SortableNode
              key={child.collection.id}
              node={child}
              onSelect={onSelect}
              activeId={activeId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface CollectionDialogState {
  kind: "create" | "rename" | "delete";
  parentId?: string | null;
  collection?: Collection;
}

export function CollectionsPanel({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const collections = useCollections();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [dialog, setDialog] = useState<CollectionDialogState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    void queryClient.invalidateQueries({ queryKey: ["resources"] });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    try {
      const moved = await db.collections.get(String(active.id));
      if (!moved) return;
      const siblings = await listSiblings(db, moved.parentId);
      const ids = siblings.map((c) => c.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1) return;
      ids.splice(from, 1);
      ids.splice(to, 0, String(active.id));
      const newIndex = ids.indexOf(String(active.id));
      await reorderCollection(db, String(active.id), {
        previousId: newIndex > 0 ? ids[newIndex - 1]! : null,
        nextId: newIndex < ids.length - 1 ? ids[newIndex + 1]! : null,
      });
      invalidate();
    } catch {
      pushToast("Could not reorder collection");
    }
  };

  const handleDialogSubmit = async (value: string) => {
    setIsPending(true);
    setFormError(null);
    try {
      if (dialog?.kind === "create") {
        const parentId = dialog.parentId ?? null;
        if (parentId) {
          const depth = await getCollectionDepth(db, parentId);
          if (isDepthWarning(depth + 1)) {
            setFormError(
              `Depth warning: this collection will be at level ${depth + 1} (warn at 4). You can still create it.`,
            );
          }
        }
        await createCollection(db, { name: value.trim(), parentId });
      } else if (dialog?.kind === "rename" && dialog.collection) {
        await renameCollection(db, dialog.collection.id, value.trim());
      }
      invalidate();
      setDialog(null);
      pushToast("Saved");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save");
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async () => {
    if (!dialog?.collection) return;
    setIsPending(true);
    try {
      await deleteCollection(db, dialog.collection.id);
      invalidate();
      setDialog(null);
      pushToast("Collection deleted");
    } catch {
      setFormError("Could not delete collection");
    } finally {
      setIsPending(false);
    }
  };

  if (collections.isLoading) return <p className="px-3 text-sm text-slate-500">Loading…</p>;
  const tree = buildTree(collections.data ?? []);

  if (!collections.data?.length) {
    return (
      <EmptyState
        title="No collections yet"
        description="Create one to organize resources."
        action={
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={() => setDialog({ kind: "create", parentId: null })}
          >
            New collection
          </button>
        }
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Collections
        </span>
        <button
          type="button"
          aria-label="New collection"
          className="rounded-md border px-2 py-0.5 text-xs"
          onClick={() => setDialog({ kind: "create", parentId: null })}
        >
          + Add
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={collections.data.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-0.5">
            {tree.map((node) => (
              <SortableNode
                key={node.collection.id}
                node={node}
                onSelect={onSelect}
                activeId={activeId}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <ul className="mt-2 space-y-0.5 px-3">
        {collections.data.map((c) => (
          <li key={c.id} className="flex gap-1">
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-600"
              onClick={() => setDialog({ kind: "rename", collection: c })}
            >
              Rename
            </button>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-red-600"
              onClick={() => setDialog({ kind: "delete", collection: c })}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <FormDialog
        open={dialog?.kind === "create" || dialog?.kind === "rename"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialog?.kind === "rename" ? "Rename collection" : "New collection"}
        inputLabel="Name"
        initialValue={dialog?.kind === "rename" ? (dialog.collection?.name ?? "") : ""}
        error={formError}
        isPending={isPending}
        onSubmit={handleDialogSubmit}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={`Delete "${dialog?.collection?.name ?? ""}"?`}
        description="Collections are deleted; resources are kept (they lose this membership)."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}
