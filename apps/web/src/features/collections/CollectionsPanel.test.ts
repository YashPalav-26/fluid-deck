/**
 * UI-006 - tree building and depth warning. Pure logic over the Sprint 2
 * collection rows; persistence/reorder correctness is covered by the
 * collections repository tests (Sprint 2, reorderCollection).
 */
import { describe, expect, it } from "vitest";
import { buildTree } from "./CollectionsPanel.tsx";
import type { Collection } from "@fluid-deck/core";

function make(c: Partial<Collection> & { id: string; name: string }): Collection {
  return {
    parentId: null,
    orderIndex: 1,
    createdAt: 1,
    updatedAt: 1,
    ...c,
  } as Collection;
}

describe("buildTree", () => {
  it("nests children by parentId with correct depths", () => {
    const root = make({ id: "a", name: "A" });
    const child = make({ id: "b", name: "B", parentId: "a" });
    const grandchild = make({ id: "c", name: "C", parentId: "b" });
    const tree = buildTree([root, child, grandchild]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.depth).toBe(1);
    expect(tree[0]?.children[0]?.depth).toBe(2);
    expect(tree[0]?.children[0]?.children[0]?.depth).toBe(3);
  });

  it("orders roots by orderIndex", () => {
    const first = make({ id: "1", name: "First", orderIndex: 1 });
    const second = make({ id: "2", name: "Second", orderIndex: 2 });
    expect(buildTree([second, first]).map((n) => n.collection.name)).toEqual(["First", "Second"]);
  });
});
