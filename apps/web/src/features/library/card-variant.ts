/** UI-002 / U3 - 8 resource types render as 7 card variants. */
import type { ResourceType } from "@fluid-deck/core";

export const CARD_VARIANTS = [
  "article",
  "video",
  "github",
  "npm",
  "pdf",
  "design",
  "tool",
  "default",
] as const;

export type CardVariant = (typeof CARD_VARIANTS)[number];

/** `other` has no dedicated variant (U3) and renders as the default card. */
export function cardVariantForType(type: ResourceType): CardVariant {
  return type === "other" ? "default" : type;
}
