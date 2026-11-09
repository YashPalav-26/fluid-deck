/**
 * UI-005 / K1 — command palette. `cmdk` filters its item list (it is not
 * a search index; keyword retrieval is M7 / SEARCH-002). Every action
 * mutates Dexie and then invalidates TanStack queries post-commit,
 * or navigates by setting URL view state.
 */
import { Command } from "cmdk";
import { useCollectionItems, useTagItems } from "./palette-items.ts";

export interface PaletteActions {
  goAll: () => void;
  goTrash: () => void;
  goInbox: () => void;
  goSettings: () => void;
  selectCollection: (id: string) => void;
  selectTag: (normalizedName: string) => void;
  newCollection: () => void;
  newTag: () => void;
  toggleTheme: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: PaletteActions;
}

export function CommandPalette({ open, onOpenChange, actions }: CommandPaletteProps) {
  const collections = useCollectionItems();
  const tags = useTagItems();

  const run = (fn: () => void) => () => {
    fn();
    onOpenChange(false);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="fixed top-[20%] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-lg border bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <Command.Input
        autoFocus
        placeholder="Type a command or navigate…"
        className="w-full border-b px-4 py-3 text-sm outline-none dark:border-slate-700"
        aria-label="Command palette"
      />
      <Command.List className="max-h-64 overflow-auto py-2" aria-label="Commands">
        <Command.Empty className="px-4 py-3 text-sm text-slate-500">
          No matching commands.
        </Command.Empty>

        <Command.Group heading="Navigate">
          <Command.Item value="Go to all resources" onSelect={run(actions.goAll)}>
            Go to all resources
          </Command.Item>
          <Command.Item value="Go to trash" onSelect={run(actions.goTrash)}>
            Go to trash
          </Command.Item>
          <Command.Item value="Open capture inbox" onSelect={run(actions.goInbox)}>
            Open capture inbox
          </Command.Item>
          <Command.Item value="Open settings" onSelect={run(actions.goSettings)}>
            Open settings
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Create">
          <Command.Item value="New collection" onSelect={run(actions.newCollection)}>
            New collection
          </Command.Item>
          <Command.Item value="New tag" onSelect={run(actions.newTag)}>
            New tag
          </Command.Item>
          <Command.Item value="Toggle theme" onSelect={run(actions.toggleTheme)}>
            Toggle theme
          </Command.Item>
        </Command.Group>

        {collections.length > 0 ? (
          <Command.Group heading="Collections">
            {collections.map((collection) => (
              <Command.Item
                key={collection.id}
                value={`collection ${collection.name}`}
                onSelect={run(() => actions.selectCollection(collection.id))}
              >
                {collection.name}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {tags.length > 0 ? (
          <Command.Group heading="Tags">
            {tags.map((tag) => (
              <Command.Item
                key={tag.id}
                value={`tag ${tag.name}`}
                onSelect={run(() => actions.selectTag(tag.normalizedName))}
              >
                {tag.name}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}
