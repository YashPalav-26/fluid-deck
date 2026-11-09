# Git Checkpoint Report — Fluid Deck

## Original checkpoint

- Commit: `7899782`
- Full hash: `78997825acd457fc9d1b0b473f259a16ddd7e97f`
- Message: `chore: establish Fluid Deck foundation and database checkpoint`
- Files: 83, insertions 16821
- Preserved as-is — not amended, not rebased, not rewritten

## Why shared packages were omitted

Post-commit audit found `packages/` untracked while committed
`apps/web` and `apps/extension` already import `@fluid-deck/core`,
`@fluid-deck/ui`, and `@fluid-deck/extension-core`. The original
checkpoint therefore could not typecheck, test, or build from a clean
checkout. No source, configuration, or dependency change caused this —
the staging scope simply excluded the workspace packages.

## Follow-up commit

- Commit: `ce99623`
- Full hash: `ce99623105089b2a36b205a9ab74d8bc896b7a54`
- Message: `fix: include missing shared workspace packages`
- Files: 23, insertions 1265
- Separate commit only — original checkpoint untouched
- No remote created, nothing pushed

## Exact files in follow-up commit

- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/core/src/constants.ts`
- `packages/core/src/index.test.ts`
- `packages/core/src/index.ts`
- `packages/core/src/ordering.test.ts`
- `packages/core/src/ordering.ts`
- `packages/core/src/preferences.ts`
- `packages/core/src/schemas.test.ts`
- `packages/core/src/schemas.ts`
- `packages/core/src/url.test.ts`
- `packages/core/src/url.ts`
- `packages/core/src/view-state.test.ts`
- `packages/core/src/view-state.ts`
- `packages/extension-core/package.json`
- `packages/extension-core/tsconfig.json`
- `packages/extension-core/src/index.test.ts`
- `packages/extension-core/src/index.ts`
- `packages/ui/package.json`
- `packages/ui/tsconfig.json`
- `packages/ui/src/button.tsx`
- `packages/ui/src/cn.ts`
- `packages/ui/src/index.ts`

## Exclusions confirmed

- `poc/` — intentionally excluded, still untracked, untouched
- `.claude/`, `.remember/`, `.freebuff/` — not in either commit
- `node_modules/` (root and per-package) — ignored, not committed
- Build output `dist/`, `.output/` — ignored, not committed
- No credentials or secrets found in staged package files
- No application, package, dependency, or lockfile changes in follow-up

## Workspace validation

- `pnpm-workspace.yaml` declares `apps/*` and `packages/*`
- Package names in `package.json` match application imports:
  `@fluid-deck/core`, `@fluid-deck/extension-core`, `@fluid-deck/ui`
- All three packages export `./src/index.ts`, present in follow-up commit

## Verification

- `pnpm install --frozen-lockfile` — PASS, lockfile up to date
- `pnpm typecheck` — PASS, 5/5 projects
- `pnpm test` — PASS, 14 files / 100 tests
- `pnpm build` — PASS, web 104.79 kB gzip; chrome-mv3 194.91 kB;
  firefox-mv3 195.03 kB (only upstream zod comment warnings)
- `git ls-files packages/` — 23 files tracked after follow-up
- `git log --oneline -5` — `ce99623` on top of `7899782`

## Final repository status

- Branch: `main`
- HEAD: `ce99623 fix: include missing shared workspace packages`
- Tracked tree: clean
- Untracked at time of writing: `poc/`, plus this report and the
  `docs/PROJECT_PROGRESS.md` update (uncommitted, awaiting approval)
- Sprint 3: not started
