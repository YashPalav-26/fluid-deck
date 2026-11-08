# Sprint 1 — Implementation Report (Engineering Foundation)

*Date: 2026-11-08 · Scope: Phase 4 Sprint 1 only (roadmap: M0–M2) · Sprint 2 NOT started.*

## 1. Objectives
Verified environment, pnpm monorepo with five packages, shared strict TS config, core + extension-core contract foundation, Vite/React/Tailwind web shell, WXT MV3 extension foundation, Vitest + Playwright, quality commands.

## 2. Implemented tasks (existing IDs)
| ID | Status | Evidence |
|---|---|---|
| ENV-001 | ✅ Done (audit doc update deferred, see §12) | `.nvmrc` = 26, root `engines.node` `>=26 <27` |
| ENV-002 | ✅ Done | pnpm 11.13.0 install + WXT Chrome/Firefox MV3 builds on Windows 11 |
| ENV-003 | ⏭ Deferred (optional task) | No global tsc/jq needed; project-local only |
| POC-001–005 | ✅ Done previously (gate passed) | `docs/validation/*`, `poc/extension-bridge/` untouched |
| SCAFFOLD-001 | ✅ Done | `git init`, `core.autocrlf=true`, `.gitignore` (node_modules/dist/.output/.wxt ignored) |
| SCAFFOLD-002 | ✅ Done | `pnpm-workspace.yaml` → `apps/*`, `packages/*` |
| SCAFFOLD-003 | ✅ Done | `tsconfig.base.json` + per-package tsconfig, `pnpm typecheck` green |
| SCAFFOLD-004 | ✅ Done | Vite 7 + React 19 + Tailwind 4 shell; dev server + build verified |
| SCAFFOLD-005 | ✅ Done | WXT 0.20.27 → `chrome-mv3` + `firefox-mv3` manifests |
| SCAFFOLD-006 | ✅ Done except CI stub | ESLint 9 flat + Prettier; no CI yet (no remote — see §11) |

Not in Sprint 1 (roadmap M3+): CORE-001/002 (full entity types + schemas), DB-001–008 (Dexie), UI-001+ (shell/routing/state), EXT-001+ (outbox, capture).

## 3. Files and packages created
Root: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`, `.prettierrc.json`, `.prettierignore`, `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`, `e2e/web-smoke.spec.ts`.

`apps/web`: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `components.json`, `src/{main.tsx,App.tsx,index.css}`.
`apps/extension`: `package.json`, `tsconfig.json`, `wxt.config.ts`, `entrypoints/{background.ts,popup/index.html,popup/main.ts}`.
`packages/core`: `package.json`, `tsconfig.json`, `src/{index.ts,index.test.ts}`.
`packages/ui`: `package.json`, `tsconfig.json`, `src/{index.ts,cn.ts,button.tsx}`.
`packages/extension-core`: `package.json`, `tsconfig.json`, `src/{index.ts,index.test.ts}`.

## 4. Dependency versions (installed, verified)
Node 26.13.0 · pnpm 11.13.0 · npm 12.2.2 · git 2.55.0 · TypeScript 5.9.3 · Vite 7.3.7 · @vitejs/plugin-react 5.2.0 · React / React DOM 19.3.1 · tailwindcss + @tailwindcss/vite 4.3.5 · WXT 0.20.27 · Zod 4.6.7 · Vitest 3.2.7 · @playwright/test 1.65.0 · ESLint 9.39.5 · typescript-eslint 8.72.1 · Prettier 3.9.10 · clsx 2.1.x · tailwind-merge 3.x.

## 5. Environment verification (Gate A)
| Item | Result |
|---|---|
| Node | v26.13.0 — satisfies Vite 7 (`^20.19 \|\| >=22.12`), WXT 0.20, React 19, TS 5.9, Vitest 3, Playwright 1.65 engines — no downgrade needed |
| pnpm | 11.13.0 (workspace install OK) |
| npm | 12.2.2 |
| git | 2.55.0.windows.3 — repo was NOT initialized; now `git init` + `autocrlf=true` |
| Windows | 10.0.26300 (Windows 11) |
| Browsers | Chrome 158 (Playwright `chromium` channel), Edge installed, Firefox 159.0.1 + Playwright Firefox 159 bundled |
| OneDrive | Dev server ~400ms start, Vite build ~1s, WXT build ~0.9s; no watcher/file-lock errors. Sync of `node_modules`, `.git`, `dist`, `.output` is wasted bandwidth → recommend OneDrive exclusions (not changed). `.gitignore` keeps outputs out of git; OneDrive still syncs them. |

Note: pnpm 11 requires the build-script allowlist in `pnpm-workspace.yaml` (`allowBuilds: esbuild, spawn-sync`); without it esbuild's postinstall is skipped.

## 6. Commands executed (actual)
`pnpm install` → 527 packages, exit 0 (after `allowBuilds` fix)
`pnpm typecheck` → 5/5 projects Done, exit 0
`pnpm test` → 2 files / 7 tests passed, exit 0
`pnpm build` → web `dist` + extension `chrome-mv3`/`firefox-mv3`, exit 0
`pnpm lint` → clean, exit 0
`pnpm exec prettier --check .` → all files conform
`pnpm test:e2e` → 1 passed, exit 0

## 7. Test results
- Vitest: `packages/core` 3 tests (constants, http(s)-only URL guard, resource schema accept/reject); `packages/extension-core` 4 tests (envelope accept/reject, wrong protocol/type/uuid, non-http draft, version gate + permanent-nack list). 7/7 pass.
- Playwright: `e2e/web-smoke.spec.ts` — heading "Fluid Deck" + env-status text visible. 1/1 pass.
- Extension runtime (bundled Chromium, `--load-extension`): background service worker started, wrote `fluid-deck:booted` to `storage.local`; popup rendered `Fluid Deck` / `Ready — fluiddeck.capture v1` (screenshot `apps/extension/.output/verify-popup.png`).

## 8. Build results
- Web: `dist/index.html` 0.40 kB; `index-*.css` 8.60 kB (2.49 kB gzip); `index-*.js` 339.47 kB (103.52 kB gzip) — inside the proposed ≤250 kB gzip budget.
- Extension: `chrome-mv3` 190.2 kB, `firefox-mv3` 190.3 kB (3 files: `background.js`, `chunks/popup-*.js`, `popup.html` + manifest). Manifests verified: both MV3; permissions `storage, activeTab, scripting, contextMenus`; `host_permissions: ["<all_urls>"]`; Chrome gets `background.service_worker`, Firefox gets `background.scripts` (event page) + `browser_specific_settings.gecko` (`id`, `data_collection_permissions.required: ["none"]`). No `content_security_policy` key: the Firefox MV3 default (`script-src 'self'; upgrade-insecure-requests`) applies.
- Edge uses the `chrome-mv3` output (same Chromium build target) — not separately built.

## 9. Firefox verification (manual, user-performed 2026-11-08)

**Background / manifest — PASS**, reported by the user after loading `apps/extension/.output/firefox-mv3/manifest.json` via `about:debugging#/runtime/this-firefox`:
- Add-on listed and enabled; background (event page) status **Running**.
- Log present: `[Fluid Deck] background ready — fluiddeck.capture v1`.
- Firefox accepted the manifest and the add-on ID `extension@fluiddeck.app`.

Independently reproduced on the same machine (Firefox 159, throwaway profile, headless) with console capture:
`npx web-ext@8 run --source-dir apps/extension/.output/firefox-mv3 --firefox "<Firefox>" --no-reload --args=-headless --pref devtools.console.stdout.chrome=true --pref devtools.console.stdout.content=true`
→ `Firefox stdout: console.info: "[Fluid Deck] background ready — fluiddeck.capture v1"` and `installTemporaryAddon: {"addon":{"id":"extension@fluiddeck.app"}}`.

**Popup — PASS pending one click.** The popup is a 3-line DOM write with no browser API and no framework; the identical built bundle produced `Fluid Deck` / `Ready — fluiddeck.capture v1` in Chromium (screenshot above, and `popup.html` → `chunks/popup-*.js` is the same file Firefox loads). Playwright cannot open the toolbar popup of a temporary Firefox add-on, so the visual confirmation in Firefox itself is still outstanding (one click: toolbar "Fluid Deck" icon → must read `Ready — fluiddeck.capture v1`).

## 10. CSP warning investigation (two "blocked … eval" warnings in the Firefox background console)
Result: **not from Fluid Deck. No change made; CSP not weakened.**

Evidence:
1. **Source scan of the artifact the user loaded** — `grep -rno -E "unsafe-eval|\beval\b|new Function|Function\("` over `.output/firefox-mv3` (background.js 94.5 kB, chunks/popup-*.js 94.6 kB, popup.html): **0 matches**. `background.ts` and `popup/main.ts` contain a `console.info` and a `textContent` assignment; `@fluid-deck/extension-core` is Zod-free constants + Zod schemas (Zod 4 does not eval). There are no dev/HMR scripts and no source maps in the output — this is the production build, not WXT dev tooling.
2. **No CSP override** — the manifest has no `content_security_policy` key, so Firefox's default MV3 policy applies; nothing in the project requests `unsafe-eval`.
3. **Clean-profile reproduction** — Firefox 159 with only this add-on, browser + content console piped to stdout: zero `Content-Security-Policy` lines, while the extension's own `console.info` was captured. So the warnings are not emitted by loading the extension, its background event page, or the manifest.
4. **Origin class** — CSP "blocked the loading of a resource at eval / inline" notices in Firefox are known to leak into the console from *other* sources: other installed add-ons (`preload.js`, `sandbox eval code` — Bugzilla 1655269), and DevTools' own evaluation path against a page whose CSP forbids `eval` (console entries name the emitting script, e.g. `sandbox eval code:9:350`, not an extension file). The same capture shows Firefox writing unrelated browser noise into that console (Nimbus experiment errors, `-foreground` flag warning), confirming the console aggregates non-extension messages.
5. **No functional impact** — background ran and persisted (`fluid-deck:booted`), the popup renders, no uncaught errors.

Conclusion: environment/devtool-side warnings, harmless, expected for an extension with the default MV3 CSP; a warning only becomes actionable if its text names a Fluid Deck file (`background.js` / `chunks/popup-*.js`). Paste those two lines if that ever happens. Nothing to fix, and adding `unsafe-eval` would violate the add-on policies (Firefox rejects extensions that ship it) — explicitly not done.

## 11. Known limitations
- Workspace packages are consumed as TypeScript source (`exports: "./src/index.ts"`); no per-package `dist`. `build` builds apps only; `typecheck` covers packages. Add `tsc` emit only if a package is published or consumed by Node.
- No CI stub (SCAFFOLD-006 remainder): repository has no remote yet.
- Automated extension loading uses Playwright's bundled Chromium only — branded Chrome/Edge ignore `--load-extension` (Chromium 137+). Store-build loading in Chrome/Edge remains manual.
- Firefox popup visual confirmation: one user click (§9). Background verification is complete.
- `docs/ENVIRONMENT_AUDIT.md` still claims "Non-LTS, pin 22/20" (conflict C-1). Not edited: approved Phase-1 record, corrections need explicit authorization.
- No Dexie/IndexedDB work (`DB-001` is M3 / Sprint 2). Only `DB_NAME`/`SCHEMA_VERSION` constants exist in `core`.

## 12. Deviations from architecture
None in dependency direction or stack. Verified boundaries (acyclic, downward only): `core` → (none); `ui` → `core`; `extension-core` → `core`; `web` → `core`, `ui`; `extension` → `core`, `extension-core`. No Dexie in UI, no `chrome.*`/`browser.*` in packages, no telemetry, no network calls, no backend/auth.

Deliberate scope choices: minimal domain example in `core` (full entity set is CORE-001/002 in Sprint 2); one UI primitive (`Button`) + `cn`; shadcn-compatible config only, no component library; extension has no capture flow (EXT-* is Sprint 3).

## 13. Remaining Sprint 1 items
- Firefox popup click-through confirmation (§9) — one interaction.
- CI stub for lint+typecheck (needs a git remote / decision).
- Optional: `ENVIRONMENT_AUDIT.md` C-1 correction (needs authorization).

## 14. Sprint 2 readiness
Ready. Sprint 2 (M3–M4) needs: `CORE-001/002` full entity types + Zod, `DB-001` Dexie v1 with the seven approved stores (`DATABASE_SCHEMA_AND_MIGRATIONS`), `DB-002/003` repositories + uniqueness, then `UI-001–003`. No structural change to this scaffold is required.

If the CSP warnings ever named an extension file, the fix would be a dependency swap, not a CSP change — keep that as the invariant when Dexie and MiniSearch land (Dexie ≥3 and MiniSearch are eval-free).

## Sprint 1 status: **COMPLETE** — background verification PASS, CSP warnings explained as environment-side, popup awaiting one Firefox click.
