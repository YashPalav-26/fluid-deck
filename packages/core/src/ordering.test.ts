import { describe, expect, it } from "vitest";
import {
  collectionDepth,
  compareOrder,
  isDepthWarning,
  needsResequence,
  orderBetween,
  ORDER_GAP,
  resequence,
} from "./ordering.ts";

describe("fractional ordering", () => {
  it("places the first sibling, appends and prepends deterministically", () => {
    expect(orderBetween(null, null)).toBe(ORDER_GAP);
    expect(orderBetween(null, 1024)).toBe(0);
    expect(orderBetween(1024, null)).toBe(2048);
  });

  it("returns the midpoint between neighbours", () => {
    expect(orderBetween(0, 1024)).toBe(512);
    expect(orderBetween(0, 1024)).toBeLessThan(1024);
    expect(orderBetween(0, 1024)).toBeGreaterThan(0);
  });

  it("survives repeated splits for a long time, then asks for resequencing", () => {
    const previous = 0;
    let next = 1024;
    let splits = 0;
    while (!needsResequence(previous, next)) {
      const mid = orderBetween(previous, next);
      expect(mid).toBeGreaterThan(previous);
      expect(mid).toBeLessThan(next);
      next = mid;
      splits += 1;
      if (splits > 100) break;
    }
    expect(splits).toBeGreaterThanOrEqual(30);
    expect(needsResequence(previous, next)).toBe(true);
  });

  it("resequences evenly", () => {
    expect(resequence(3)).toEqual([1024, 2048, 3072]);
    expect(resequence(0)).toEqual([]);
  });

  it("compares by position then id", () => {
    expect(compareOrder({ orderIndex: 1, id: "b" }, { orderIndex: 2, id: "a" })).toBeLessThan(0);
    expect(compareOrder({ orderIndex: 1, id: "a" }, { orderIndex: 1, id: "b" })).toBeLessThan(0);
    expect(compareOrder({ orderIndex: 1, id: "a" }, { orderIndex: 1, id: "a" })).toBe(0);
  });
});

describe("collection depth (U2)", () => {
  const parents = new Map<string, string | null>([
    ["root", null],
    ["level2", "root"],
    ["level3", "level2"],
    ["level4", "level3"],
  ]);

  it("counts levels from 1 at the root", () => {
    expect(collectionDepth("root", parents)).toBe(1);
    expect(collectionDepth("level3", parents)).toBe(3);
    expect(collectionDepth("level4", parents)).toBe(4);
  });

  it("warns at four levels but never blocks deeper trees", () => {
    expect(isDepthWarning(3)).toBe(false);
    expect(isDepthWarning(4)).toBe(true);
    expect(isDepthWarning(9)).toBe(true);
    expect(collectionDepth("level4", new Map([...parents, ["level5", "level4"]]))).toBe(4);
  });

  it("is cycle-safe", () => {
    const cyclic = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(collectionDepth("a", cyclic)).toBe(2);
  });
});
