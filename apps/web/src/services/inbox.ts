/**
 * UI-008 — capture inbox service: dated (createdAt desc) and linked
 * (parentId chain lands on an existing collection) views over live
 * resources. Thin composition over Sprint 2 repositories.
 */
import type { Resource } from "@fluid-deck/core";
import type { FluidDeckDatabase } from "../persistence/db.ts";
import { listResources } from "../repositories/resources.ts";

export async function getDatedResources(database: FluidDeckDatabase): Promise<Resource[]> {
  const resources = await listResources(database);
  return [...resources].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export async function getLinkedResources(database: FluidDeckDatabase): Promise<Resource[]> {
  const resources = await getDatedResources(database);
  const joins = await database.resourceCollections.toArray();
  const linkedIds = new Set(joins.map((j) => j.resourceId));
  return resources.filter((r) => linkedIds.has(r.id));
}
