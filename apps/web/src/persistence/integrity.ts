/**
 * DB-004 / FR-STO-008 — boot-time integrity check (Phase 2.2 §3.3).
 *
 * Reports: per-store counts, rows that fail schema validation (quarantined, never
 * deleted), join rows pointing at missing parents, and drifted `usageCount`s.
 * Reads only. Repairs are separate, explicit calls.
 */
import {
  collectionSchema,
  resourceCollectionSchema,
  resourceSchema,
  resourceTagSchema,
  tagSchema,
  type Collection,
  type Resource,
  type ResourceCollection,
  type ResourceTag,
  type Tag,
} from "@fluid-deck/core";
import { quarantineRecord } from "./quarantine.ts";
import { STORE_NAMES, type FluidDeckDatabase, type StoreName } from "./db.ts";

export interface IntegrityIssue {
  store: string;
  id: string;
  message: string;
}

export interface UsageMismatch {
  tagId: string;
  stored: number;
  actual: number;
}

export interface IntegrityReport {
  ok: boolean;
  checkedAt: number;
  counts: Record<StoreName, number>;
  invalid: IntegrityIssue[];
  orphanJoins: IntegrityIssue[];
  usageMismatches: UsageMismatch[];
}

function formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function record(invalid: IntegrityIssue[], store: string, id: string, reason: string): void {
  invalid.push({ store, id, message: reason });
  quarantineRecord({ store, id, reason, quarantinedAt: Date.now() });
}

export async function checkIntegrity(database: FluidDeckDatabase): Promise<IntegrityReport> {
  const counts = {} as Record<StoreName, number>;
  for (const store of STORE_NAMES) {
    counts[store] = await database.table(store).count();
  }

  const invalid: IntegrityIssue[] = [];

  const resources: Resource[] = [];
  for (const row of await database.resources.toArray()) {
    const parsed = resourceSchema.safeParse(row);
    if (parsed.success) resources.push(parsed.data);
    else record(invalid, "resources", row.id, formatIssues(parsed.error.issues));
  }

  const collections: Collection[] = [];
  for (const row of await database.collections.toArray()) {
    const parsed = collectionSchema.safeParse(row);
    if (parsed.success) collections.push(parsed.data);
    else record(invalid, "collections", row.id, formatIssues(parsed.error.issues));
  }

  const tags: Tag[] = [];
  for (const row of await database.tags.toArray()) {
    const parsed = tagSchema.safeParse(row);
    if (parsed.success) tags.push(parsed.data);
    else record(invalid, "tags", row.id, formatIssues(parsed.error.issues));
  }

  const resourceCollections: ResourceCollection[] = [];
  for (const row of await database.resourceCollections.toArray()) {
    const parsed = resourceCollectionSchema.safeParse(row);
    const id = `${row.resourceId}/${row.collectionId}`;
    if (parsed.success) resourceCollections.push(parsed.data);
    else record(invalid, "resourceCollections", id, formatIssues(parsed.error.issues));
  }

  const resourceTags: ResourceTag[] = [];
  for (const row of await database.resourceTags.toArray()) {
    const parsed = resourceTagSchema.safeParse(row);
    const id = `${row.resourceId}/${row.tagId}`;
    if (parsed.success) resourceTags.push(parsed.data);
    else record(invalid, "resourceTags", id, formatIssues(parsed.error.issues));
  }

  const resourceIds = new Set(resources.map((row) => row.id));
  const collectionIds = new Set(collections.map((row) => row.id));
  const tagIds = new Set(tags.map((row) => row.id));

  const orphanJoins: IntegrityIssue[] = [];
  for (const join of resourceCollections) {
    const id = `${join.resourceId}/${join.collectionId}`;
    if (!resourceIds.has(join.resourceId)) {
      orphanJoins.push({ store: "resourceCollections", id, message: "Resource does not exist" });
    }
    if (!collectionIds.has(join.collectionId)) {
      orphanJoins.push({ store: "resourceCollections", id, message: "Collection does not exist" });
    }
  }
  for (const join of resourceTags) {
    const id = `${join.resourceId}/${join.tagId}`;
    if (!resourceIds.has(join.resourceId)) {
      orphanJoins.push({ store: "resourceTags", id, message: "Resource does not exist" });
    }
    if (!tagIds.has(join.tagId)) {
      orphanJoins.push({ store: "resourceTags", id, message: "Tag does not exist" });
    }
  }

  const actualUsage = new Map<string, number>();
  for (const join of resourceTags) {
    actualUsage.set(join.tagId, (actualUsage.get(join.tagId) ?? 0) + 1);
  }
  const usageMismatches: UsageMismatch[] = [];
  for (const tag of tags) {
    const actual = actualUsage.get(tag.id) ?? 0;
    if (actual !== tag.usageCount) {
      usageMismatches.push({ tagId: tag.id, stored: tag.usageCount, actual });
    }
  }

  return {
    ok: invalid.length === 0 && orphanJoins.length === 0 && usageMismatches.length === 0,
    checkedAt: Date.now(),
    counts,
    invalid,
    orphanJoins,
    usageMismatches,
  };
}
