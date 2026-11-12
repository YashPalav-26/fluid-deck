/**
 * SEARCH-001 — the single shared tokenizer used at both index time and query
 * time (Phase 2.4 §2 / ADR-007). Pure TypeScript: NFC-normalized, lowercased,
 * splits on punctuation/non-alphanumerics (incl. hyphen and URL delimiters),
 * splits CamelCase while retaining the joined token, no stop words, no
 * stemming, diacritics retained. Prefix + fuzzy are applied by MiniSearch at
 * query time, not here.
 *
 * Single-sourcing this function is the whole design: divergent tokenization
 * between index and query is the most common search bug.
 */

/** Approved field boosts (Phase 2.4 §1 / §3.1). Relative ordering matters. */
export const SEARCH_FIELD_WEIGHTS = {
  title: 3,
  tagsText: 2,
  description: 1,
  urlText: 0.6,
  collectionsText: 0.5,
  typeText: 0.4,
} as const;
export type SearchFieldName = keyof typeof SEARCH_FIELD_WEIGHTS;

const CAMEL_BOUNDARY_1 = /([\p{Ll}\p{N}])([A-Z])/gu;
const CAMEL_BOUNDARY_2 = /([A-Z]+)([A-Z][\p{Ll}])/gu;

/**
 * Splits text into normalized terms. Returns `[]` for non-string or empty input.
 * Diacritics are retained (NFC-normalized only); no stop words or stemming.
 */
export function tokenize(input: unknown): string[] {
  if (typeof input !== "string") return [];
  const normalized = input.normalize("NFC");
  if (normalized.length === 0) return [];

  const runs = normalized.split(/[^\p{L}\p{N}]+/u);
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (token: string) => {
    const t = token.normalize("NFC").toLowerCase();
    if (t.length === 0) return;
    if (seen.has(t)) return;
    seen.add(t);
    result.push(t);
  };

  for (const run of runs) {
    if (run.length === 0) continue;
    const spaced = run.replace(CAMEL_BOUNDARY_2, "$1 $2").replace(CAMEL_BOUNDARY_1, "$1 $2");
    const parts = spaced.split(/\s+/).filter((part) => part.length > 0);
    for (const part of parts) add(part);
    // Retain the joined token only when CamelCase actually split the run.
    if (parts.length > 1) add(run);
  }

  return result;
}
