/** UI-002 / U3 - 8 types map to 7 card variants; `other` is the default. */
import { describe, expect, it } from "vitest";
import { RESOURCE_TYPES } from "@fluid-deck/core";
import { CARD_VARIANTS, cardVariantForType } from "./card-variant.ts";

describe("cardVariantForType", () => {
  it("maps every type into the 7-variant set", () => {
    for (const type of RESOURCE_TYPES) {
      expect(CARD_VARIANTS).toContain(cardVariantForType(type));
    }
    expect(cardVariantForType("other")).toBe("default");
    expect(cardVariantForType("github")).toBe("github");
    expect(new Set(RESOURCE_TYPES.map(cardVariantForType)).size).toBe(8);
  });
});
