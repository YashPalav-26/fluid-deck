/**
 * U1 (approved) — fractional ordering for collections.
 *
 * Siblings are spaced `ORDER_GAP` apart and new positions are midpoints. Floating
 * point is not infinite: once two neighbours are closer than `MIN_ORDER_GAP` the
 * caller must resequence the sibling list (`resequence`) inside the same
 * transaction, then compute the midpoint again.
 */
import { COLLECTION_WARNING_DEPTH } from "./constants.ts";

export const ORDER_GAP = 1024;
export const MIN_ORDER_GAP = 1e-6;

/** Position for a new sibling. `null` means "no neighbour on that side". */
export function orderBetween(previous: number | null, next: number | null): number {
  if (previous === null && next === null) return ORDER_GAP;
  if (previous === null) return (next as number) - ORDER_GAP;
  if (next === null) return previous + ORDER_GAP;
  return previous + (next - previous) / 2;
}

/** True when the gap is too small to keep subdividing reliably. */
export function needsResequence(previous: number, next: number): boolean {
  return next - previous < MIN_ORDER_GAP;
}

/** Evenly spaced positions for `count` siblings. */
export function resequence(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * ORDER_GAP);
}

export interface Ordered {
  orderIndex: number;
  id: string;
}

/** Deterministic sibling comparison: position, then id as the tie-break. */
export function compareOrder(a: Ordered, b: Ordered): number {
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 1 for a top-level collection. Cycle-safe: a corrupt cycle returns its walk length. */
export function collectionDepth(
  id: string,
  parentById: ReadonlyMap<string, string | null>,
): number {
  let depth = 1;
  const seen = new Set<string>([id]);
  let current = parentById.get(id) ?? null;
  while (current !== null) {
    if (seen.has(current)) return depth;
    seen.add(current);
    depth += 1;
    current = parentById.get(current) ?? null;
  }
  return depth;
}

/** U2: warn at four levels, never block. */
export function isDepthWarning(depth: number): boolean {
  return depth >= COLLECTION_WARNING_DEPTH;
}
