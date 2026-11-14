# Sprint 7 — IMPORT-002 Implementation Report (Raindrop.io JSON Parser)

*Date: 2026-11-12 · Scope: IMPORT-002 only · No commits, staging, or pushes performed.*

## 1. Scope and verdict

IMPORT-002 parses a Raindrop.io JSON export into validated Fluid Deck resource inputs plus
collection/tag membership data. Parsing is deliberately separate from persistence; IMPORT-003
(sanitize + validate) and IMPORT-004 (commit orchestration) consume this output.

**Verdict: PASS WITH CONDITIONS.**

- Parser, fixtures and focused tests are complete and green.
- Full-suite, web typecheck and repository lint are **not globally green** because of a
  pre-existing, unrelated failure in `apps/web/src/services/search.test.ts`
  (untracked Sprint 6 search work). No IMPORT-002 file contributes an error. See §8.
- The approved plan listed `e2e/fixtures/import/raindrop/{small,large,malformed}.json` as
  "pre-existing, read-only". They did not exist in the working tree, so they were generated
  deterministically for this task (§5). This is the only deviation from the plan text.

## 2. Acceptance criteria

| Criterion (SPRINT_7_IMPLEMENTATION_PLAN §IMPORT-002) | Result |
| --- | --- |
| Raindrop JSON fixtures parse correctly | PASS — small 50/3/4, large 500/12/10 |
| Nested collections preserved (tree + parentId) | PASS — `parentSourceId` round-trips source `_id`, verified for 3-level chains |
| Tags preserved with `usageCount` | PASS — supplied `count` preferred, derived membership count as fallback |
| Metadata preserved (`title`, `description`, `excerpt`, `image`, `type`, `created`, `link`, `metadata`) | PASS — see §4 mapping; no invented fields |
| Canonical URL dedup + caps | PASS — dedup through `canonicalizeUrl`; duplicates kept out of `resources` and reported. Caps are enforced by IMPORT-003 (§9) |
| No crashes on malformed fields | PASS — 8 malformed inputs exercised; invalid records skipped and reported |
| Parsing separate from persistence | PASS — pure function, no Dexie/repository import |
| No new dependencies | PASS — `zod` and `@fluid-deck/core` were already workspace deps |
| No schema migration, UI, orchestration, export, unrelated refactor | PASS — one new module + one test file + three fixtures |
| Netscape parser untouched | PASS — `apps/web/src/import/parser.ts` unmodified |

## 3. Changed files

New (all untracked, nothing staged):

- `apps/web/src/import/raindrop.ts` — parser, `RaindropParseError`, typed result.
- `apps/web/src/import/raindrop.test.ts` — 17 focused tests.
- `e2e/fixtures/import/raindrop/small.json` — 50 resources / 3 collections / 4 tags.
- `e2e/fixtures/import/raindrop/large.json` — 500 resources / 12 collections / 10 tags.
- `e2e/fixtures/import/raindrop/malformed.json` — hand-authored edge cases.

Modified: `docs/PROJECT_PROGRESS.md` (progress entry only).

## 4. Field mapping

Export shape: `{ result, items[], collections[], tags[] }`, or a bare `items` array.

| Raindrop field | Fluid Deck output | Notes |
| --- | --- | --- |
| `link` / `url` | `url` | Trimmed; must canonicalize to http(s) or the item is skipped |
| — | `canonicalUrl` (dedup key) | Not emitted on the resource; used by the parser for dedup. Repository re-derives on commit |
| `title` | `title` | `""` when missing or wrong type |
| `description` + `excerpt` | `description` | Joined with a blank line, de-duplicated, empty when both absent |
| `note` | `notes` | `""` when missing |
| `image` / `cover` (string or `{src}`) | `thumbnailUrl` | Only http(s) values; otherwise `""` |
| — | `faviconUrl` | Always `""` (not an exported field) |
| `ext` then `type` | `type` | Exact case-insensitive `RESOURCE_TYPES` match, otherwise `"other"` (`link`/`document` → `other`) |
| `created_at` / `created` | `createdAt` (extra field, epoch ms) | Numbers below 1e12 read as epoch seconds (documented shortcut) |
| `collection.$id` / `collectionId` | `collectionSourceIds: string[]` | Membership only; parent linking happens at commit |
| `tags[]` (string or `{tag}`) | `tags: string[]` | Trimmed, case-insensitive de-dupe, first spelling wins |
| `collections[]` | `ParsedRaindropCollection { sourceId, name, parentSourceId, orderIndex }` | `_id`/`id` → `sourceId`; `parent`/`parentId` → `parentSourceId`; `sort` → `orderIndex` |
| `tags[]` (top level) | `ParsedRaindropTag { name, usageCount }` | `count` used when present, else derived membership count; resource-only tags appended so none are lost |

Fixed values: `source: "import"`, `extractionStatus: "complete"`, `extractionNotes: []`.
Every emitted resource is validated by `resourceInputSchema` before being returned.

## 5. Fixtures

The plan named the three files but they were absent. They are generated from a deterministic
script (fixed date arithmetic, no randomness) and hand-shaped to the documented structure:

- `small.json` — 50 items, 3 collections (one nested under collection 1), 4 tags with counts.
  Exercises note/excerpt/cover/ext alternation so mapping branches are all hit.
- `large.json` — 500 items, 12 collections in interleaved parent chains
  (`2→1, 3→2, 6→5, … 12→11`), 10 tags with counts.
- `malformed.json` — valid item, null link, non-URL link, missing title, wrong field types
  (`title: 42`, `tags: "not-an-array"`, `created: true`, `cover: 7`), duplicate with UTM params,
  a bare string item, invalid collection records (missing id / missing name), and malformed tags
  (numeric name, bare string, repeated name).

## 6. Behavior on bad input

- Unparseable JSON → `RaindropParseError("Invalid Raindrop JSON: file is not valid JSON")`.
- Valid JSON without an `items` array (including `null`) →
  `RaindropParseError("Unsupported Raindrop export: expected an items array")`.
- Individual bad records never throw. They are appended to `skipped` with
  `kind`, `index`, a stable `reason`, and `link` where applicable.
- Reasons currently emitted: `item is not an object`, `item has no link`,
  `item link is not an http(s) URL`, `duplicate canonical URL`,
  `item does not fit the resource schema`, `collection is not an object`,
  `collection needs an id and a name`, `tag has no usable name`.
- Dedup semantics: first record for a canonical URL wins; later ones are skipped. Tracking
  params and fragments are removed by `canonicalizeUrl`, so those variants collapse. Duplicate
  items do not inflate tag counts.

## 7. Verification evidence

Commands run from the repository root on 2026-11-12:

| Gate | Command | Result |
| --- | --- | --- |
| Focused import suite | `pnpm vitest run apps/web/src/import/` | **2 files / 35 tests passed** (18 Netscape + 17 Raindrop) |
| Full suite | `pnpm test` | 48 of 49 files passed, **404 tests passed**, 1 suite failed: `apps/web/src/services/search.test.ts` (pre-existing transform failure) |
| Web typecheck | `pnpm --filter @fluid-deck/web typecheck` | Fails only on pre-existing `src/services/search.test.ts` (134 TS1232, 162 TS2339 `openTxn`, 164 TS18048). No errors in `src/import/*` |
| Lint (new files) | `pnpm exec eslint apps/web/src/import/raindrop.ts apps/web/src/import/raindrop.test.ts` | Clean |
| Formatting | `pnpm exec prettier --write` on the two TS files and three fixtures | Clean (files rewritten, then re-verified by the passing suite) |
| Production build | `pnpm build` | Exit 0, web bundle built in 9.65 s |
| Whitespace | `git diff --check` | Exit 0 |

Not run: `pnpm test:e2e` — there is no user-visible surface in this task, and E2E import flows
belong to IMPORT-005+.

## 8. Known limitations and risks

1. **Pre-existing red gate.** `apps/web/src/services/search.test.ts` (Sprint 6, unrelated) fails
   to transform and has three typecheck errors. Until that lands, the repo-wide "all green"
   claim cannot be made. IMPORT-002 itself is clean.
2. **Caps are not enforced here.** Plan wording ("caps canonical URL dedup") is satisfied for
   dedup only. Item/collection counts and text-length limits are IMPORT-003's job; the parser
   returns everything it was given.
3. **`metadata` object is not consumed.** The plan's mapping list mentions `metadata`, but the
   export's `metadata` is a heterogeneous bag with no approved Fluid Deck destination field.
   Nothing is invented; if a later task needs it, it is still present in the raw file.
4. **`type` fidelity is lossy by design.** Raindrop `type` values (`link`, `article`, `video`,
   `document`) do not map 1:1 onto the eight approved resource types. Non-matching values become
   `other`; `ext` wins when both exist.
5. **Timestamp shortcut.** Values below `1e12` are treated as epoch seconds. Documented in code
   with a `shortcut:` comment; safe for all real Raindrop exports, which use ISO strings.
6. **`faviconUrl` is always empty.** Raindrop does not export a favicon URL, and the parser does
   not fetch one (no network access by design).
7. **Collection parent dangling references are preserved.** A `parentSourceId` pointing at a
   skipped/absent collection is kept as-is; resolving or re-parenting is IMPORT-003/004 work.
8. **No cap/dedup on tag spelling variants beyond case.** `"AI"` and `"ai"` collapse; `"ai "`
   collapses via trim; `"ai-tools"` vs `"ai tools"` do not.

## 9. Handoff

- **Next dependency-ready task: IMPORT-003** — Zod validation + DOMPurify sanitization + caps.
  It depends on both IMPORT-001 and IMPORT-002 and is the correct place for count/length limits,
  dangling-parent resolution policy, and text sanitization.
- IMPORT-002 output is a stable seam: `ParsedRaindropResource` is a superset of
  `ResourceInput` (`createdAt`, `collectionSourceIds`, `tags` are extra), so the committer must
  strip those extras before calling `createResource`.

---

## M9-006 reconciliation (2026-11-14)

**2026-11-14 status (M9-006):** the files this report lists as untracked are now committed - `apps/web/src/import/raindrop.ts` (`2c63ab9`) and `apps/web/src/import/raindrop.test.ts` (`7ae8b54`) - together with the raindrop fixtures (`39b0943`, `b0fc453`, `c5b0675`). The parsing behaviour described here is unchanged.
