import { describe, expect, it } from "vitest";
import {
  decodeViewState,
  EMPTY_VIEW_STATE,
  encodeViewState,
  viewStateSchema,
} from "./view-state.ts";

const collectionId = "6f1c2c9a-6f2b-4c0f-9a1e-1c2b3a4d5e6f";

describe("ViewState URL codec (DB-008)", () => {
  it("round-trips a full deep link", () => {
    const state = {
      q: "typescript generics",
      type: "article" as const,
      collection: collectionId,
      tags: ["react", "types"],
      date: "custom:1700000000000:1700086400000" as const,
      source: "extension" as const,
      hasCode: true,
      hasImage: true,
      sort: "title-asc" as const,
    };
    const encoded = encodeViewState(state);
    expect(decodeViewState(encoded)).toEqual(state);
    expect(decodeViewState(`?${encoded}`)).toEqual(state);
  });

  it("omits defaults and an empty state encodes to an empty string", () => {
    expect(encodeViewState(EMPTY_VIEW_STATE)).toBe("");
    expect(decodeViewState("")).toEqual(EMPTY_VIEW_STATE);
  });

  it("uses the documented parameter names", () => {
    const encoded = encodeViewState({ ...EMPTY_VIEW_STATE, hasCode: true, tags: ["a", "b"] });
    expect(encoded).toContain("tags=a%2Cb");
    expect(encoded).toContain("has_code=true");
    expect(encoded).not.toContain("sort=");
  });

  it("decodes unknown or invalid values to defaults instead of throwing", () => {
    const state = decodeViewState(
      "q=hi&type=podcast&collection=not-a-uuid&tags=,ok,,&date=decade&source=cli&has_code=maybe&sort=sideways",
    );
    expect(state).toEqual({ ...EMPTY_VIEW_STATE, q: "hi", tags: ["ok"] });
  });

  it("rejects malformed state at the schema boundary", () => {
    expect(viewStateSchema.safeParse({ tags: "not-an-array" }).success).toBe(false);
    expect(viewStateSchema.safeParse({ date: "custom:x:y" }).success).toBe(false);
  });
});
