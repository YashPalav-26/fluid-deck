# Sprint 7 — IMPORT-003 Implementation Report (Validation, Sanitization, Input Caps)

*Date: 2026-11-12 · Scope: IMPORT-003 only · No commits, staging, or pushes performed.*

## 1. Scope and verdict

IMPORT-003 is the trust boundary between the two parsers (IMPORT-001 Netscape HTML,
IMPORT-002 Raindrop JSON) and Dexie persistence. It adds one standalone module that

1. enforces the approved file-size, record-count and nesting caps,
2. sanitizes HTML with DOMPurify before it reaches the Netscape parser,
3. validates every record against the strict core Zod schemas,
4. re-applies canonical-URL dedup, and
5. returns an explicit `ValidatedImport` contract that keeps import-only metadata out of
   `resourceInputSchema` / `createResource`.

There is no persistence, UI, migration or export code in this task.

**Verdict: PASS WITH CONDITIONS.**

- IMPORT-003 code, focused tests, lint, formatting and build are green (§7).
- The repo-wide full suite and web typecheck are **not** green because of the known,
  pre-existing `apps/web/src/services/search.test.ts` failure. No IMPORT-003 file
  contributes an error. This is diagnosed again in §8, not fixed here.
- One approved dependency was missing from the workspace: `dompurify`. It is required by
  the plan (§IMPORT-003) and PRD NFR-SEC-002. It was installed (§3). This is a deviation
  from the "already in workspace" claim in the plan and readiness review.

## 2. Acceptance criteria

| Criterion (SPRINT_7_IMPLEMENTATION_PLAN §IMPORT-003) | Result |
| --- | --- |
| Validate all imported resources against Zod schemas | PASS — `resourceInputSchema` per record; `collectionInputSchema.shape.name` and `tagSchema.shape.usageCount` for the rest |
| Sanitize HTML with DOMPurify | PASS — allowlist sanitizer runs before `parseHtmlBookmarks`; JSON never goes through DOMPurify (text-only) |
| Enforce canonical URL dedup caps | PASS — dedup re-applied with `canonicalizeUrl`; first record wins, later ones become warnings |
| Malformed fixtures rejected with descriptive errors | PASS — file-level `ImportValidationError` codes and per-record warnings (§6) |
| Valid fixtures pass Zod | PASS — Chrome HTML 10 resources / 3 collections; Raindrop small 50/3/4 |
| DOMPurify sanitizes HTML export output | PASS — `<script>`, handlers and `javascript:` hrefs are removed before parsing |
| Test with 1k resource corpus | PASS by boundary test — 100,000-record cap accepted and 100,001 rejected; the 500-record `large.json` fixture validates |
| Validation separate from persistence | PASS — no Dexie/repository import; only pure helpers from `repositories/tags.ts` |
| Unsafe schemes and malformed URLs blocked | PASS — `javascript:`, `data:`, `file:`, relative URLs rejected |
| Partial imports preserve valid records | PASS — bad records skipped with warnings; valid siblings survive |
| No schema change, UI, orchestration, export, unrelated refactor | PASS |
| No silent change to approved caps or policy | PASS — values quoted from source in §4 |

## 3. Changed files

New (untracked, nothing staged):

- `apps/web/src/import/validate.ts` — caps, sanitizer, both validators, `ValidatedImport` contract.
- `apps/web/src/import/validate.test.ts` — 19 focused tests (jsdom, DOMPurify needs a DOM).

Modified:

- `apps/web/src/import/raindrop.ts` — `parseRaindropJson` split into a `JSON.parse` wrapper plus
  new exported `parseRaindropPayload(payload)`. Behavior is unchanged; the 17 existing tests pass
  unmodified. IMPORT-003 needs the payload form so depth/prototype guards run before parsing.
- `apps/web/src/repositories/tags.ts` — `displayTagName` exported (was module-private); no logic
  change. Tag display/normalization must not be re-implemented in the import path.
- `apps/web/package.json`, `pnpm-lock.yaml` — added `dompurify ^3.4.17`.
- `docs/PROJECT_PROGRESS.md` — progress entry.

Unmodified: `apps/web/src/import/parser.ts` (IMPORT-001) and both parsers' test files.

## 4. Exact limits enforced

No limit was invented. Each row names its approved source.

| Limit | Value | Source |
| --- | --- | --- |
| HTML import size | 50 MB (52,428,800 bytes) | `SECURITY_AND_PRIVACY_ARCHITECTURE.md` §7; readiness condition 6 |
| Raindrop import size | 20 MB (20,971,520 bytes) | same |
| Records per import | 100,000 | same |
| Raindrop JSON nesting depth | 20 | same |
| Text field length (`title`, `description`, `notes`) | `MAX_TEXT_LENGTH` = 8,192 chars | `packages/core/src/constants.ts`, enforced by `resourceInputSchema` |
| Name/collection/tag name length | `MAX_NAME_LENGTH` = 200 chars | same; collection names via `collectionInputSchema.shape.name`, tag names via the same `nameSchema` shared by `tagSchema.shape.name` |
| Collection depth | warns at `COLLECTION_WARNING_DEPTH` = 4, never blocks | `packages/core/src/constants.ts` + U2 "warn, never block" |
| Tag count per import | **no cap** | no approved cap exists; none invented |

Enforcement order and semantics:

- Size is measured on UTF-8 bytes with `TextEncoder` **before** any parsing.
- HTML records are counted with `/<a\s/gi` **before** parsing, then the parsed
  resources + collections + tags are counted again after.
- Raindrop records are counted as `items.length + collections.length + tags.length` after
  `JSON.parse` but **before** payload parsing, so a hostile record count cannot reach the parser.
- Over-cap HTML/Raindrop: exactly the cap passes, cap + 1 throws.

## 5. Sanitization policy

Two formats, two policies — deliberately not interchangeable.

**HTML (Netscape export) — DOMPurify before parsing.**

- Allowlist tags: `a, p, h1, h3, dl, dt, dd, title`.
- Allowlist attributes: `href, rel`.
- Everything else is dropped: `<script>`, `<iframe>`, `<img onerror>`, inline event handlers,
  inline styles, unknown tags.
- Unsafe `href` schemes are removed by DOMPurify, and the parser's existing `http(s)` check is
  the second line of defense, so a `javascript:` bookmark can never become a resource.
- Sanitizing before parsing (rather than after) is what the PRD requires; it also means the parser
  never sees hostile markup at all.

**Raindrop JSON — Zod only, no DOMPurify.**

- JSON string fields (`title`, `description`, `notes`) are plain text. The app renders them as
  text, never `dangerouslySetInnerHTML` (SECURITY_AND_PRIVACY_ARCHITECTURE T2), so HTML inside
  them is inert and is stored verbatim. Sanitizing it would corrupt legitimate text
  (e.g. a saved code snippet).
- URLs go through `canonicalizeUrl` + `httpUrlSchema`: only `http`/`https` survive.
- Collections and tags have no HTML surface.
- `__proto__` and `constructor` keys are deleted by the depth walk before parsing; the walk is
  iterative and cycle-safe, so a deeply nested or hostile payload cannot exhaust the stack.

## 6. Validated output contract

```ts
type ImportFormat = "html" | "raindrop";

interface ImportResourceMeta {
  createdAt?: number;              // source timestamp; not a core field
  collectionSourceIds: string[];   // source collection ids; resolved at commit
  tags: string[];                  // per-resource tag names
}

interface ValidatedImportResource {
  input: z.output<typeof resourceInputSchema>; // persistence-ready, strict
  meta: ImportResourceMeta;                    // import-only, never merged into input
}

interface ValidatedImportCollection {
  name: string;
  sourceId: string | null;         // source collection id; null for flat HTML folders
  parentSourceId: string | null;   // null for top level
  orderIndex: number;
}

interface ValidatedImportTag {
  name: string;                    // display spelling (NFC, trimmed, collapsed)
  normalizedName: string;          // U7 identity
  usageCount: number;
}

interface ValidatedImport {
  format: ImportFormat;
  resources: ValidatedImportResource[];
  collections: ValidatedImportCollection[];
  tags: ValidatedImportTag[];
  warnings: ImportWarning[];       // { kind: "resource"|"collection"|"tag", index?, reason }
}
```

Guarantees for IMPORT-004:

- Every `input` is the **output** of `resourceInputSchema`, so it can be handed to
  `createResource` unchanged. Tests assert this and assert that re-adding `createdAt` to `input`
  is rejected by the strict schema.
- `collections[].sourceId` was added during IMPORT-004 (additive) so `meta.collectionSourceIds`
  can be resolved to the imported collection rows; HTML folders carry `null`.
- `source` is always `"import"`, `extractionStatus` `"complete"`, `extractionNotes` `[]`.
- `canonicalUrl`/`domain`/`id` are not emitted: `createResource` derives them.
- `warnings` is deterministic and ordered by source order; it never throws for record-level
  problems.

File-level failures throw `ImportValidationError` with a stable code:
`file_too_large`, `too_many_records`, `invalid_json`, `json_too_deep`, `unsupported_export`.

## 7. Verification evidence

Commands run from the repository root on 2026-11-12.

| Gate | Command | Result |
| --- | --- | --- |
| Focused import suite | `pnpm vitest run apps/web/src/import/` | **3 files / 54 tests passed** (18 Netscape + 17 Raindrop + 19 IMPORT-003) |
| Full suite | `pnpm test` | **423 tests passed, 49 of 50 files**; only failure is the pre-existing `apps/web/src/services/search.test.ts` transform error at line 134 |
| Web typecheck | `pnpm --filter @fluid-deck/web typecheck` | Only pre-existing `src/services/search.test.ts` errors (134 TS1232, 162 TS2339 `openTxn`, 164 TS18048). Zero errors in `src/import/*` |
| Lint | `pnpm exec eslint apps/web/src/import/validate.ts apps/web/src/import/validate.test.ts apps/web/src/import/raindrop.ts apps/web/src/repositories/tags.ts` | Clean |
| Formatting | `pnpm exec prettier --write` on the changed TS/JSON files | Clean |
| Production build | `pnpm build` | Exit 0; web built in 10.07 s; `dist/assets/index-CL66jt9h.js` **216.86 kB gzip** (unchanged from UI-004) |
| Whitespace | `git diff --check` | Exit 0 |

Bundle note: DOMPurify is tree-shaken out of the entry chunk because nothing in the app imports
`validate.ts` yet. IMPORT-005 (import UI) will be the first real consumer and will surface its cost.

Test coverage by requirement:

- Both formats: Chrome HTML fixture, Raindrop small/large/malformed fixtures.
- Malicious payloads: `<script>`, `onclick`, `<img onerror>`, HTML inside JSON text.
- Unsafe schemes: `javascript:`, `data:`, `file:`, relative URL.
- Oversized: file byte caps, 8,193-char field, 100,001 records, 17-deep JSON.
- Boundaries: exactly 100,000 records accepted, 16 nested arrays accepted / 17 rejected,
  exactly 50 MB / 20 MB accepted.
- Invalid schemas: collection and tag rejection with warnings; malformed JSON and unsupported export.
- Partial failure: malformed fixture yields 4 valid resources plus 7 warnings.
- Contract: strict-schema acceptance of every `input`, metadata isolation, strict schema rejecting
  leaked metadata.

## 8. Known limitations and risks

1. **Pre-existing red gate.** `apps/web/src/services/search.test.ts` still fails to transform
   (`Unexpected "fake-indexeddb/auto"` at line 134, an import placed after statements) and
   produces the only web typecheck errors. It was diagnosed again this session and left untouched.
   It is isolated: every other file in all 50 suites passes.
2. **DOMPurify was not actually installed.** The plan and readiness review claim it was "already in
   the workspace"; `pnpm why dompurify` found nothing. It is required by the plan and PRD
   NFR-SEC-002, so it was added. This is the only dependency change.
3. **Tag counts are not capped** because no approved number exists. A hostile export could declare
   up to the 100,000-record cap worth of tags. Resource records are robust to this; tag-table
   insertion cost is IMPORT-004's problem. A cap needs a product decision, not an invented number.
4. **Collection depth only warns.** Per U2 the import continues; a 1,000-deep chain will import
   flattened with a warning. Resolution/re-parenting is IMPORT-004's job.
5. **Dangling collection parents are preserved**, not resolved. A `parentSourceId` that points at a
   skipped collection stays in the contract for IMPORT-004 to handle.
6. **HTML metadata is dropped by the allowlist.** `ADD_DATE`, `ICON`, and similar Netscape
   attributes are outside the approved allowlist and never reach the parser. This matches the
   existing parser (it returns no `createdAt` for HTML), but means HTML creation dates are lost.
7. **`unorganized` HTML folders are kept as collections** (e.g. "Unorganized", "Development"),
   preserving IMPORT-001 behavior. Treating them as a special bucket would be a policy change.
8. **Warnings are not localized or user-facing copy.** IMPORT-005 owns presentation.
9. **No performance measurement on a real 100k-file import.** The caps are enforced, but the
   end-to-end time is not claimed; that belongs with IMPORT-004's batch/checkpoint work.

## 9. Handoff

- **Next dependency-ready task: IMPORT-004** — 500-row batch transactions with checkpoint resume.
  It consumes `ValidatedImport` directly: `resources[].input` goes to `createResource`,
  `meta` supplies timestamps/tags/collection membership, and `collections` supplies the tree with
  `parentSourceId`.
- IMPORT-004 must not re-validate or merge `meta` into the resource; the contract exists precisely
  so that step is impossible to get wrong.

---

## M9-006 reconciliation (2026-11-14)

**2026-11-14 status (M9-006):** the limitation "DOMPurify was not actually installed" is resolved - `dompurify@^3.4.17` was added while implementing this task (`8eb27fb`, lockfile `1e0e841`), which is why the plan's "no new dependencies" wording is inaccurate.
