# Fluid Deck — Phase 3 Task Breakdown

*IDs unique across all rows. Effort = engineering hours. No circular dependencies (verified).*

## ENV — Environment (M0)
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| ENV-001 | Pin Node v26 LTS (.nvmrc/engines); update ENVIRONMENT_AUDIT (C-1) | High | — | 1 | Pin file exists; CI uses same | M0 |
| ENV-002 | Verify pnpm workspace + WXT build matrix on Windows | High | ENV-001 | 2 | `pnpm --version` + smoke build log | M0 |
| ENV-003 | Optional: install jq/tsc-global decision | Low | — | 0.5 | Decision recorded; deferred OK | M0 |

## POC — Bridge Proof of Concept (M1) 🔒 Phase 4 gate
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| POC-001 | Minimal MV3 ext (content script + background) per browser | High | ENV-002 | 6 | Loads unpacked in 3 browsers | M1 |
| POC-002 | Stub web page: origin check + nonce + Zod + ack receiver | High | POC-001 | 4 | Rejects wrong-origin/bad-nonce payloads (manual test) | M1 |
| POC-003 | Outbox stub (chrome.storage.local) + ack-after-commit flow | High | POC-002 | 4 | Ack only after stub "commit"; lost-ack → dedup, no dup row | M1 |
| POC-004 | 30-cell matrix run (3 browsers × 2 states × 5 cases) | High | POC-003 | 4 | Matrix doc: 30/30 green; failures documented | M1 |
| POC-005 | Browser-adjustment report (Firefox events, Edge parity) | Medium | POC-004 | 2 | Report lists per-browser deltas | M1 |

## SCAFFOLD — Monorepo Foundation (M2)
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| SCAFFOLD-001 | Git init + .gitignore + autocrlf; remote TBD | High | POC-004 | 1 | `git status` clean; DEC-012 considered | M2 |
| SCAFFOLD-002 | pnpm-workspace.yaml (apps/web, apps/extension, packages/*) | High | SCAFFOLD-001 | 1 | Workspace lints/builds | M2 |
| SCAFFOLD-003 | TS config (base + per-package) + path aliases | High | SCAFFOLD-002 | 2 | `tsc --noEmit` green | M2 |
| SCAFFOLD-004 | Vite app shell (apps/web) + Tailwind v4 + shadcn init | High | SCAFFOLD-003 | 3 | Dev server renders; build ≤250KB gzip (proposed) | M2 |
| SCAFFOLD-005 | WXT config (apps/extension) + per-browser manifests | High | POC-005 | 3 | Builds Chrome/Firefox/Edge zips | M2 |
| SCAFFOLD-006 | Lint/format (ESLint+Prettier) + CI stub | Medium | SCAFFOLD-004 | 2 | CI runs lint+typecheck | M2 |

## CORE / DB — Domain & Database (M3)
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| CORE-001 | `packages/core` types (Resource/Collection/Tag/etc.) | High | SCAFFOLD-003 | 3 | Imports nothing; unit tests | M3 |
| CORE-002 | Zod schemas (all entities + prefs + ViewState) | High | CORE-001 | 4 | Invalid fixtures rejected | M3 |
| DB-001 | Dexie v1 init (7 stores, Phase 2.2 schema verbatim) | High | CORE-002 | 3 | Schema snapshot test | M3 |
| DB-002 | Repositories (resources, collections, tags, joins) | High | DB-001 | 6 | fake-indexeddb round-trip pass | M3 |
| DB-003 | Unique canonicalUrl + tag/collection name enforcement | High | DB-002 | 3 | Dup inserts rejected (tests) | M3 |
| DB-004 | Migration v1→v2 additive test + boot integrity check | High | DB-001 | 3 | FR-STO-008 check passes | M3 |
| DB-005 | Quarantine + guarded full-delete + backup restore | High | DB-002 | 4 | Corrupt row quarantined; no auto-delete | M3 |
| DB-006 | Multi-tab blocked-upgrade UX (blocked event) | Medium | DB-001 | 2 | Manual 2-tab test | M3 |
| DB-007 | Canonicalization impl + U4 SPA exception list | High | CORE-002 | 4 | Dedup corpus green (incl. SPA cases) | M3 |
| DB-008 | Preferences store + ViewState URL codec | Medium | CORE-002 | 2 | Deep-link round-trip | M3 |

## UI — Frontend Foundation (M4–M5)
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| UI-001 | App shell + sidebar + URL-param routing | High | DB-008 | 5 | One route; back/forward works | M4 |
| UI-002 | Resource grid + cards (7 variants, U3) | High | UI-001 | 6 | 500-item cap + windowing | M4 |
| UI-003 | TanStack queries + 4 Contexts (theme/shell/dialog/toast) | High | UI-001 | 4 | Invalidation on write (test) | M4 |
| UI-004 | Search UI (input, ⌘K, `/`, facets, sort) | High | SEARCH-002 | 5 | URL state; empty/error states | M7* |
| UI-005 | Command palette (K1) | Medium | UI-003 | 3 | Keyboard-only pass | M5 |
| UI-006 | Collection management (nest, reorder U1) | High | DB-002 | 5 | Reorder persists; depth warn U2 | M5 |
| UI-007 | Tag management + rename/merge | High | DB-002 | 4 | Rename propagates (test) | M5 |
| UI-008 | Capture inbox (dated/linked views) | High | DB-002 | 3 | Inbox query returns dated+linked | M5 |
| UI-009 | Dialogs + notifications (toast) + empty states | Medium | UI-003 | 3 | Focus trap/restore (a11y test) | M5 |
| UI-010 | Settings screen (prefs, purge U5, danger zone) | High | DB-008 | 3 | Purge default per U5 decision | M5 |
| UI-011 | Responsive + keyboard map (s, Esc-stack) + 200% zoom | High | UI-001 | 4 | Manual + axe-core pass | M9 |

## SEARCH — Search & Indexing (M7)
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| SEARCH-001 | Shared tokenizer (single impl, `core`) | High | CORE-001 | 2 | Tokenizer unit tests | M7 |
| SEARCH-002 | MiniSearch build (fields/weights per 2.4) | High | SEARCH-001 | 4 | Query tests (AND/OR, pin) | M7 |
| SEARCH-003 | Startup rebuild (chunked, post-paint, "Indexing…") | High | SEARCH-002 | 3 | Degraded browse-only mode | M7 |
| SEARCH-004 | Incremental update on write (post-commit) | High | SEARCH-002 | 2 | No stale results after edit | M7 |
| SEARCH-005 | Faceted filtering + 500-hit cap | High | SEARCH-002 | 3 | Cap enforced; windowing engaged | M7 |
| SEARCH-006 | Benchmark: 1k/5k/10k (build, p95, memory) | High | SEARCH-003 | 4 | Report vs budgets (proposed) | M7 |
| SEARCH-007 | Worker seam decision (only if >500ms @10k) | Low | SEARCH-006 | 1 | Decision recorded | M7 |
| SEARCH-008 | Search failure recovery (empty index → rebuild) | Medium | SEARCH-003 | 2 | Corrupt-index rebuild test | M7 |

## EXT — Capture & Resource Management (M6)
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| EXT-001 | `packages/extension-core` outbox state machine | High | POC-004 | 4 | Unit tests (ack/dedup/retry) | M6 |
| EXT-002 | Metadata extraction (title/URL/desc M1) | High | CORE-002 | 4 | Fixture pages extract correctly | M6 |
| EXT-003 | Thumbnails (M2; 429→placeholder) | Medium | EXT-002 | 3 | Placeholder on failure | M6 |
| EXT-004 | Production bridge wiring (web side) | High | EXT-001 | 4 | End-to-end click→saved (Playwright) | M6 |
| EXT-005 | Context menu B1 + shortcut B2 + share B3 | Medium | EXT-004 | 3 | All 3 triggers save | M6 |
| EXT-006 | Extension popup UI (save status, queue count) | Medium | EXT-004 | 3 | "Saved" only after ack | M6 |
| EXT-007 | Extension-core sharing with web (no dup logic) | Medium | EXT-001 | 1 | Shared pkg imported by both | M6 |

## IMPORT — Import & Export (M8)
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| IMPORT-001 | HTML bookmark parser | High | DB-002 | 4 | Chrome/FF/Edge fixtures parse | M8 |
| IMPORT-002 | Raindrop JSON parser | High | DB-002 | 3 | Fixtures parse; caps enforced | M8 |
| IMPORT-003 | Validation+sanitize (DOMPurify+Zod+caps) | High | IMPORT-001 | 3 | Malicious fixtures rejected | M8 |
| IMPORT-004 | Batch transactions (500-row, checkpoint resume) | High | IMPORT-003 | 4 | Kill-mid-import → resume, no dup | M8 |
| IMPORT-005 | Import preview + duplicate summary | Medium | IMPORT-004 | 3 | Preview counts match commit | M8 |
| IMPORT-006 | Export JSON (streaming, >1k) | High | DB-002 | 4 | 10k export ≤30s (proposed) | M8 |
| IMPORT-007 | Export HTML/Markdown/CSV (inbox + collections) | High | IMPORT-006 | 4 | Round-trip HTML/JSON pass | M8 |
| IMPORT-008 | Import/export e2e (Playwright) | Medium | IMPORT-006 | 3 | Round-trip test green | M8 |
| IMPORT-009 | Import screens (file picker, progress, errors) | Medium | IMPORT-005 | 2 | Error states shown | M8 |

## TEST — Quality Assurance (M9–M10)
| ID | Description | P | Deps | Hrs | Acceptance / Verification | Milestone |
|---|---|---|---|---|---|---|
| TEST-001 | Vitest config + coverage gates | High | SCAFFOLD-006 | 2 | CI runs unit+repo suites | M9 |
| TEST-002 | Playwright e2e (capture→search→export) | High | EXT-004 | 4 | 3 core journeys green | M9 |
| TEST-003 | axe-core a11y suite + keyboard e2e | High | UI-011 | 3 | 0 critical violations | M9 |
| TEST-004 | Manual SR pass (NVDA/VO) + contrast audit | High | TEST-003 | 3 | Sign-off recorded | M9 |
| TEST-005 | Perf suite (startup/grid/search/import/export) | High | SEARCH-006 | 3 | Report vs proposed budgets | M9 |
| TEST-006 | Security pass (CSP, telemetry audit, dep CVE scan) | High | TEST-001 | 3 | 0 high findings; zero-egress verified | M9 |
| TEST-007 | Store listing + privacy policy + permissions doc | High | EXT-005 | 2 | `<all_urls>` justified in listing | M10 |
| TEST-008 | MVP release tag + smoke checklist | High | TEST-002 | 2 | All §12 gates green | M10 |

*UI-004 depends on SEARCH-002 (counted under M7). Total tasks: 64; sum ≈ 209.5h + reviews.*
