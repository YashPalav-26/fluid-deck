import { describe, expect, it } from "vitest";
import {
  collectionInputSchema,
  collectionSchema,
  preferenceSchema,
  resourceCollectionSchema,
  resourceInputSchema,
  resourcePatchSchema,
  resourceSchema,
  resourceTagSchema,
  savedSearchInputSchema,
  savedSearchSchema,
  tagSchema,
} from "./schemas.ts";

const resource = {
  id: "6f1c2c9a-6f2b-4c0f-9a1e-1c2b3a4d5e6f",
  url: "https://www.example.com/a?utm_source=x",
  canonicalUrl: "https://example.com/a",
  title: "Example",
  description: "",
  thumbnailUrl: "",
  faviconUrl: "https://example.com/favicon.ico",
  domain: "example.com",
  type: "article",
  source: "extension",
  notes: "",
  extractionStatus: "complete",
  extractionNotes: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lastOpenedAt: null,
  deletedAt: null,
} as const;

describe("resource schema", () => {
  it("accepts a complete persisted record", () => {
    expect(resourceSchema.safeParse(resource).success).toBe(true);
  });

  it("rejects required-field omissions, bad ids and bad timestamps", () => {
    expect(resourceSchema.safeParse({ ...resource, title: undefined }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...resource, id: "not-a-uuid" }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...resource, createdAt: -1 }).success).toBe(false);
    expect(
      resourceSchema.safeParse({ ...resource, updatedAt: resource.createdAt - 1 }).success,
    ).toBe(false);
  });

  it("rejects non-http url schemes", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///c:/x", "/relative"]) {
      expect(resourceSchema.safeParse({ ...resource, url }).success).toBe(false);
      expect(resourceSchema.safeParse({ ...resource, canonicalUrl: url }).success).toBe(false);
    }
  });

  it("rejects an unknown resource type", () => {
    expect(resourceSchema.safeParse({ ...resource, type: "podcast" }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...resource, type: "github" }).success).toBe(true);
  });

  it("applies creation defaults to untrusted input and rejects unknown fields", () => {
    const parsed = resourceInputSchema.parse({ url: "https://example.com/a" });
    expect(parsed).toEqual({
      url: "https://example.com/a",
      title: "",
      description: "",
      thumbnailUrl: "",
      faviconUrl: "",
      type: "other",
      source: "extension",
      notes: "",
      extractionStatus: "complete",
      extractionNotes: [],
    });
    expect(resourceInputSchema.safeParse({ url: "https://example.com", id: "x" }).success).toBe(
      false,
    );
    expect(resourceInputSchema.safeParse({ url: "ftp://example.com" }).success).toBe(false);
  });

  it("allows user-editable patches only", () => {
    expect(resourcePatchSchema.safeParse({ title: "New", type: "video" }).success).toBe(true);
    expect(resourcePatchSchema.safeParse({ canonicalUrl: "https://x.test" }).success).toBe(false);
    expect(resourcePatchSchema.safeParse({ source: "import" }).success).toBe(false);
  });
});

describe("collection schema", () => {
  const collection = {
    id: "0f4c4a1e-1111-4a2b-8c3d-1234567890ab",
    name: "Reading",
    parentId: null,
    orderIndex: 1024,
    createdAt: 1,
    updatedAt: 1,
  };

  it("accepts a valid collection and a valid input", () => {
    expect(collectionSchema.safeParse(collection).success).toBe(true);
    expect(collectionInputSchema.parse({ name: " Reading " })).toEqual({
      name: "Reading",
      parentId: null,
    });
  });

  it("rejects empty names, bad parent ids and non-finite order", () => {
    expect(collectionSchema.safeParse({ ...collection, name: "" }).success).toBe(false);
    expect(collectionSchema.safeParse({ ...collection, name: "   " }).success).toBe(false);
    expect(collectionSchema.safeParse({ ...collection, parentId: "nope" }).success).toBe(false);
    expect(collectionSchema.safeParse({ ...collection, orderIndex: Number.NaN }).success).toBe(
      false,
    );
    expect(collectionInputSchema.safeParse({ name: "x", extra: true }).success).toBe(false);
  });
});

describe("tag schema", () => {
  const tag = {
    id: "3a2b1c0d-1111-4222-8333-444455556666",
    name: "Machine Learning",
    normalizedName: "machine learning",
    usageCount: 0,
    createdAt: 1,
  };

  it("keeps free-form display names and rejects an empty normalized name", () => {
    expect(tagSchema.safeParse(tag).success).toBe(true);
    expect(tagSchema.safeParse({ ...tag, name: "machine-learning" }).success).toBe(true);
    expect(tagSchema.safeParse({ ...tag, normalizedName: "" }).success).toBe(false);
    expect(tagSchema.safeParse({ ...tag, usageCount: -1 }).success).toBe(false);
  });
});

describe("relationship schemas", () => {
  const id = "6f1c2c9a-6f2b-4c0f-9a1e-1c2b3a4d5e6f";

  it("validates join rows", () => {
    expect(
      resourceCollectionSchema.safeParse({ resourceId: id, collectionId: id, addedAt: 1 }).success,
    ).toBe(true);
    expect(
      resourceCollectionSchema.safeParse({ resourceId: id, collectionId: "x", addedAt: 1 }).success,
    ).toBe(false);
    expect(resourceTagSchema.safeParse({ resourceId: id, tagId: id }).success).toBe(true);
  });
});

describe("saved searches and preferences", () => {
  it("validates saved searches including JSON filter state", () => {
    const saved = {
      id: "6f1c2c9a-6f2b-4c0f-9a1e-1c2b3a4d5e6f",
      name: "Unread articles",
      filterStateJson: '{"type":"article"}',
      createdAt: 1,
      alertEnabled: false,
    };
    expect(savedSearchSchema.safeParse(saved).success).toBe(true);
    expect(savedSearchSchema.safeParse({ ...saved, filterStateJson: "not json" }).success).toBe(
      false,
    );
    expect(savedSearchInputSchema.parse({ name: "x", filterStateJson: "{}" }).alertEnabled).toBe(
      false,
    );
  });

  it("validates preference rows", () => {
    expect(preferenceSchema.safeParse({ key: "theme", value: "dark" }).success).toBe(true);
    expect(preferenceSchema.safeParse({ key: "", value: "dark" }).success).toBe(false);
  });
});
