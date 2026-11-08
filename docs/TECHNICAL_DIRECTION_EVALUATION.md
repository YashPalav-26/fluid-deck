# Technical Direction Evaluation — Fluid Deck

*Generated: 2026-11-07 | Based on: Product Vision + Competitive Research + Target Users + MVP Features + Information Architecture + User Journeys | Phase: 1.7*

---

## 1. Evaluation Context

### Source Documents (Treated as Truth)
- `docs/PRODUCT_VISION.md` — 8 principles, local-first hard constraint, MVP boundaries
- `docs/COMPETITIVE_RESEARCH.md` — 6 competitors analyzed, 5 differentiation opportunities identified
- `docs/TARGET_USERS_AND_PERSONAS.md` — Primary: Developers + Designers; Secondary: AI Enthusiasts + Researchers
- `docs/MVP_FEATURE_PRIORITIZATION.md` — 18 Must-Have features, 10 key product decisions
- `docs/INFORMATION_ARCHITECTURE.md` — 7 entities, navigation hierarchy, 10 flows, scalability to 10k+
- `docs/USER_JOURNEYS_AND_WORKFLOWS.md` — 10 journeys, 4 Critical MVP, 13 edge cases
- `docs/PROJECT_PROGRESS.md` — Phase 1.6 complete, 9 docs created
- `docs/ENVIRONMENT_AUDIT.md` — Windows 11, Node v26.13.0 (non-LTS), Bun/pnpm/npm, missing tsc/jq
- `docs/MCP_INVENTORY.md` — 7 connected, GitHub failed (400), autoharness failed

### Key MVP Constraints (from Phase 1.4 Decisions)
1. **Local-first storage** — SQLite/IndexedDB mandatory (Principle 5, 7)
2. **No sync in MVP** — Optional encrypted sync Phase 8+
3. **Manifest V3 extension** — Chrome/Firefox/Edge; Safari deferred
4. **Keyword + Faceted search only** — FTS5; semantic search deferred
5. **Collections + Tags** — Not folders-only, not tags-only
6. **Manual tags with autocomplete** — No auto-tagging in MVP
7. **CLI/API deferred** — Extension covers 90% of capture
8. **Rule-based type detection only** — ML deferred
9. **Import: Browser HTML + Raindrop JSON only**
10. **Export: JSON/HTML/MD/CSV in MVP** — BibTeX Post-MVP

---

## 2. Application Structure Evaluation

### 2.1 Web Application Framework

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **React SPA (Vite)** | Simple; no SSR complexity; full control over bundle; works offline naturally; smaller bundle; easier extension integration | No SSR SEO (not needed for private app); manual routing | **RECOMMENDED** |
| Next.js (App Router) | SSR/SSG; file-based routing; Turbopack dev; built-in optimizations | SSR adds complexity for local-first; hydration mismatches with IndexedDB; larger bundle; server not needed | Deferred |
| Tauri + React | Native desktop; small bundle; Rust backend for SQLite; system integration | Rust learning curve; separate desktop build; PWA covers 80% | Phase 8+ |

**Recommendation: React SPA with Vite + TypeScript**

- Local-first app doesn't need SSR — everything runs client-side
- Extension shares code with web app more easily in SPA architecture
- Vite provides fast HMR, optimized builds, simple config
- PWA manifests enables offline + installable
- Tauri as Phase 8+ for native desktop with native SQLite

### 2.2 Browser Extension Architecture

| Aspect | Chrome (MV3) | Firefox (MV3) | Edge (MV3) | Safari |
|--------|-------------|--------------|-----------|--------|
| Background | Service Worker | Event Page (non-persistent) | Service Worker | Both supported |
| Persistence | `chrome.storage.local` | `browser.storage.local` | Same as Chrome | `browser.storage.local` |
| DOM access | Offscreen Document | Content script / background page | Offscreen Document | Content script |
| Build target | `dist/chrome` | `dist/firefox` | `dist/edge` | `dist/safari` (deferred) |

**Recommendation: Cross-browser Manifest V3 with Extension.js or WXT**

- Use `webextension-polyfill` for unified `browser.*` API with promises
- Build per-browser outputs (Chrome/Firefox/Edge) from single source
- Background: Service Worker (Chrome/Edge) + Event Page (Firefox) via conditional manifest
- Metadata extraction: Offscreen Document (Chrome) / Content Script (Firefox) for DOM access
- Popup: Side panel preferred (more space) + action popup fallback
- **Safari deferred** — different bundle, review process, lower primary persona usage

### 2.3 Shared Code Between Web App and Extension

| Strategy | Implementation |
|----------|----------------|
| **Shared packages (monorepo)** | `packages/core` — types, utilities, storage abstraction, metadata extraction logic, search logic |
| **Web app** | `apps/web` — React SPA, UI components, views |
| **Extension** | `apps/extension` — Manifest V3, background, popup, content scripts, offscreen |
| **Build tool** | Turborepo or Nx for monorepo; or pnpm workspaces + Vite multi-target |

**Recommendation: pnpm workspaces + Vite (lightweight, no extra tooling)**

```
fluid-deck/
├── packages/
│   ├── core/           # Shared: types, storage, search, metadata, validation
│   ├── ui/             # Shared: React components (cards, chips, palette)
│   └── extension-core/ # Extension-specific shared (messaging, storage bridge)
├── apps/
│   ├── web/            # Vite React SPA + PWA
│   └── extension/      # WXT or Extension.js for MV3 cross-browser
└── package.json        # pnpm workspace root
```

### 2.4 Client-Side State Management

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **TanStack Query + React Context** | Server-state patterns work for local DB; caching, invalidation, optimistic updates built-in; DevTools | Slight learning curve | **RECOMMENDED** |
| Zustand/Jotai | Simpler, lighter | Less structure for async local DB operations | Alternative |
| Redux Toolkit | Powerful | Overkill for local-first; boilerplate | No |

**Recommendation: TanStack Query (v5) + React Context for global UI state**

- Treat IndexedDB/SQLite as "server" — queries, mutations, cache invalidation map perfectly
- Optimistic updates for instant UI (save → grid updates immediately)
- Background sync queue (Post-MVP) fits mutation pattern
- DevTools for debugging state transitions

### 2.5 Styling and UI Component Approach

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Tailwind CSS + shadcn/ui** | Utility-first; small bundle (purged); accessible components; copy-paste customizable; dark mode built-in | Learning curve if new | **RECOMMENDED** |
| CSS Modules + custom | Full control | Reinventing components; more CSS | No |
| Material UI / Chakra | Complete | Heavy bundle; opinionated styling | No |

**Recommendation: Tailwind CSS v4 + shadcn/ui (Radix primitives)**

- Type-aware cards need flexible styling — Tailwind excels
- Command palette, filter chips, virtual grid — all shadcn components
- Bundle size minimal with purging
- Easy theming for density (comfortable/compact) and dark mode

---

## 3. Local-First Storage Evaluation

### 3.1 Options Compared

| Criteria | IndexedDB (Dexie.js) | SQLite WASM + OPFS (wa-sqlite) | SQLite WASM + OPFS (official) | sql.js + absurd-sql |
|----------|---------------------|--------------------------------|-------------------------------|---------------------|
| **Browser Support** | All (IE10+) | Chrome 102+, FF 111+, Safari 17+ | Chrome 102+, FF 111+, Safari 17+ | Chrome 91+, FF 79+, Safari 15.2+ |
| **Storage Limit** | Dynamic (quota) | OPFS (dynamic, larger) | OPFS (dynamic, larger) | IndexedDB (quota) |
| **Transactions** | Limited (no cross-store) | Full ACID | Full ACID | Full ACID (via absurd-sql) |
| **Query Performance** | Good for key-value; slow for complex joins | Excellent (native SQL) | Excellent (native SQL) | Good |
| **Full-Text Search** | Manual (Dexie full-text) | **FTS5 native** | **FTS5 native** | FTS5 native |
| **Migration Complexity** | Schema versioning manual | Standard SQL migrations | Standard SQL migrations | Standard SQL migrations |
| **Backup/Export** | Export entire DB | Export OPFS file | Export OPFS file | Export IndexedDB blob |
| **10k+ Resources** | Good with indexes | Excellent | Excellent | Good |
| **Extension ↔ Web App Access** | Same origin = shared | Same origin = shared OPFS | Same origin = shared OPFS | Same origin = shared |
| **Bundle Size** | ~25 KB (Dexie) | ~800 KB (wa-sqlite WASM) | ~1 MB (official WASM) | ~1 MB (sql.js + absurd-sql) |
| **Maturity (2026)** | Very mature | **Production-ready (Notion, PowerSync)** | Beta (official) | Deprecated (absurd-sql unmaintained) |

### 3.2 Critical Finding: Extension vs Web App Storage Isolation

**Browser extensions and web pages have DIFFERENT origins** — they **cannot** share IndexedDB or OPFS directly.

| Architecture | Extension Storage | Web App Storage | Sync Mechanism |
|--------------|-------------------|-----------------|----------------|
| **Option A: Separate DBs** | IndexedDB (extension origin) | IndexedDB/OPFS (web origin) | Background sync via messaging |
| **Option B: Single Source of Truth** | Extension writes to web app via `chrome.runtime.sendMessage` | Web app is primary | Extension = thin capture client |

### 3.3 Recommended Approach: Web App as Primary + Extension as Capture Client

```
┌─────────────────────────────────────────────────────────────┐
│  WEB APP (Primary) — https://fluid-deck.local / PWA         │
│  • IndexedDB (Dexie.js) for MVP                             │
│  • SQLite WASM + OPFS (Post-MVP, when browser support OK)   │
│  • Full UI, search, organization, import/export             │
└─────────────────────────────────────────────────────────────┘
                              ↑
                    chrome.runtime.sendMessage
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  EXTENSION (Capture Only) — Manifest V3                     │
│  • No local DB — captures metadata, sends to web app        │
│  • Offline queue in chrome.storage.local (few KB)           │
│  • Popup/offscreen extracts metadata → POST to web app      │
└─────────────────────────────────────────────────────────────┘
```

**Why this works for MVP:**
- Extension stays simple — no DB, no migrations, no sync logic
- Web app owns all storage, search, organization logic
- `chrome.storage.local` for offline capture queue (survives service worker restart)
- Web app can be PWA — works offline after first load
- Extension-to-web communication: `runtime.sendMessage` + `runtime.onMessage`

**Post-MPV Evolution:**
- When OPFS support is universal (Safari 17+, FF 111+), migrate web app to SQLite WASM + OPFS
- Extension can then also use OPFS via shared origin (if PWA installed) or keep thin client model

### 3.4 Storage Recommendation Summary

| Phase | Web App Storage | Extension Storage | Rationale |
|-------|-----------------|-------------------|-----------|
| **MVP** | **IndexedDB (Dexie.js)** | `chrome.storage.local` (queue only) | Universal support; Dexie mature; FTS5 via custom index or Dexie full-text; simple |
| **Phase 8+** | **SQLite WASM + OPFS (wa-sqlite)** | Same or thin client | FTS5 native; better performance at 10k+; SQL migrations; Notion-validated |

**IndexedDB FTS5 Workaround for MVP:** Use Dexie.js with custom full-text index (tokenize on write, query via index) OR use MiniSearch/Fuse.js for client-side search on loaded data. For 10k items, MiniSearch is fast enough (<50ms).

---

## 4. Search Technology Evaluation

### 4.1 Options Compared

| Approach | Keyword | Faceted | Semantic | Visual | Complexity | MVP Fit |
|----------|---------|---------|----------|--------|------------|---------|
| **SQLite FTS5** | ✅ Native | ✅ Via columns | ❌ | ❌ | Low (if SQLite) | Phase 8+ |
| **IndexedDB + Dexie Full-Text** | ✅ Custom | ✅ Via indexes | ❌ | ❌ | Medium | Possible |
| **MiniSearch / Fuse.js (client-side)** | ✅ Fast | ✅ Manual | ❌ | ❌ | **Low** | **MVP** |
| **Transformers.js (local embeddings)** | ❌ | ❌ | ✅ | ❌ | High (R&D) | Phase 8+ |
| **Perceptual Hash (pHash)** | ❌ | ❌ | ❌ | ✅ Dedup | Medium | Phase 8+ |
| **Hybrid (keyword + semantic)** | ✅ | ✅ | ✅ | ❌ | Very High | Future |

### 4.2 MVP Recommendation: MiniSearch + Faceted Filters

**Why MiniSearch for MVP:**
- Pure JS, ~8 KB gzipped, runs in browser/extension
- In-memory index built on app load from IndexedDB (fast for 10k items)
- Supports: prefix search, fuzzy search, field boosting, filter functions
- Faceted filters applied post-search (in-memory, instant)
- No WASM, no Web Workers needed for MVP scale

**Architecture:**
```
IndexedDB (source of truth)
    ↓ App load / data change
MiniSearch Index (in memory, ~50ms for 10k docs)
    ↓ User types
Instant results → Grid updates
    ↓ Facet filter applied
Filtered results → Grid updates
```

**FTS5 Migration Path (Phase 8+):**
- When migrating to SQLite WASM + OPFS, replace MiniSearch with native FTS5
- Same query API, just backend swap
- MiniSearch index building logic becomes FTS5 population

### 4.3 Search Features by Phase

| Feature | MVP (MiniSearch) | Phase 8+ (SQLite FTS5) | Phase 9+ (Hybrid) |
|---------|------------------|------------------------|-------------------|
| Keyword search | ✅ | ✅ Native | ✅ |
| Faceted filters | ✅ In-memory | ✅ SQL WHERE | ✅ |
| Prefix/fuzzy | ✅ | ✅ FTS5 prefix | ✅ |
| Semantic search | ❌ | ❌ | ✅ Transformers.js |
| Visual similarity | ❌ | ❌ | ✅ pHash |
| Saved searches | ✅ Client state | ✅ DB | ✅ |

---

## 5. Browser Extension Architecture (Detailed)

### 5.1 Manifest V3 Cross-Browser Strategy

```json
// manifest.config.ts (WXT or Extension.js config)
export default defineManifestConfig({
  manifest: {
    name: "Fluid Deck",
    version: "1.0.0",
    manifest_version: 3,
    background: {
      service_worker: "background.ts",  // Chrome/Edge
      type: "module"
    },
    // Firefox uses background.scripts instead — handled by build tool
    action: {
      default_popup: "popup.html",
      default_title: "Save to Fluid Deck"
    },
    side_panel: {
      default_path: "sidepanel.html"
    },
    permissions: ["storage", "activeTab", "scripting", "contextMenus"],
    host_permissions: ["<all_urls>"],
    offscreen: {
      reasons: ["DOM_PARSER", "MEDIA_CAPTURE"],
      justification: "Extract page metadata for saving"
    },
    commands: {
      "_execute_action": { suggested_key: { default: "Ctrl+Shift+S" } }
    }
  }
})
```

### 5.2 Capture Flow (Extension → Web App)

```
User clicks extension icon / ⌘⇧S / right-click
         │
         ▼
┌────────────────────────────────────────┐
│ POPUP / SIDEPANEL (React)              │
│ • Auto-filled metadata (from content)  │
│ • Collection dropdown (fetched from    │
│   web app via runtime.sendMessage)     │
│ • Tag autocomplete (from web app)      │
└────────────────────────────────────────┘
         │ User clicks Save
         ▼
┌────────────────────────────────────────┐
│ EXTENSION BACKGROUND                   │
│ • Normalize URL                        │
│ • Send {url, metadata, collection,    │
│   tags} to web app via                │
│   runtime.sendMessage                 │
│ • If web app unreachable: queue in    │
│   chrome.storage.local                │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ WEB APP (Service Worker / Main Thread) │
│ • Receive message                      │
│ • Duplicate check (URL normalization)  │
│ • Insert into IndexedDB                │
│ • Rebuild MiniSearch index             │
│ • Respond: {success, resourceId}       │
└────────────────────────────────────────┘
         │
         ▼
Extension shows toast "Saved!" → closes popup
```

### 5.3 Metadata Extraction Strategy

| Source | Method | Fallback |
|--------|--------|----------|
| **Title** | `<title>` + `og:title` + `twitter:title` | Document title |
| **Description** | `meta[name=description]` + `og:description` | First 200 chars of visible text |
| **Image** | `og:image` + `twitter:image` + first `<img>` | Favicon |
| **Type** | Rule-based: domain patterns + meta tags | `other` |
| **Canonical URL** | `<link rel=canonical>` + `og:url` | Current URL |
| **Favicon** | `/favicon.ico` + `<link rel=icon>` | Default icon |

**Implementation:** Content script extracts → sends to popup via `runtime.sendMessage` → popup shows preview. For SPAs/dynamic content: Offscreen Document (Chrome) loads page, waits for network idle, extracts.

### 5.4 Cross-Browser MVP Support Assessment

| Browser | Support Level | Effort | Recommendation |
|---------|---------------|--------|----------------|
| **Chrome** | Full MV3, service worker, offscreen | Low | **MVP** |
| **Edge** | Same as Chrome (Chromium) | Low | **MVP** |
| **Firefox** | MV3, event page (not service worker), no offscreen | Medium | **MVP** |
| **Safari** | MV3, different review process, lower market share in primary personas | High | **Defer to Phase 8+** |

**Verdict: Chrome + Firefox + Edge in MVP. Safari deferred.**

- Firefox uses `background.scripts` (event page) — WXT/Extension.js handles this automatically
- Offscreen Document not available in Firefox — use content script for metadata extraction (slightly less reliable for SPAs)
- 90%+ of primary personas (devs, designers) use Chrome/Edge/Firefox

---

## 6. Metadata Extraction Evaluation

### 6.1 Extraction Pipeline

```
Page Load
    │
    ├── Content Script (runs at document_idle)
    │     ├── Extract: title, meta tags, og:*, twitter:*, JSON-LD, microdata
    │     ├── Detect type: domain rules + content heuristics
    │     ├── Find images: og:image, twitter:image, first content img, favicon
    │     └── Send to popup/background via runtime.sendMessage
    │
    ├── Offscreen Document (Chrome only, for SPAs)
    │     ├── Navigate to URL in offscreen
    │     ├── Wait for network idle (configurable timeout)
    │     ├── Execute same extraction logic
    │     └── Return to background
    │
    └── Background / Popup
          ├── Merge results (content script + offscreen)
          ├── Normalize URL (strip UTM, www, fragments, sort params)
          ├── Present to user for edit/confirm
          └── On save → send to web app
```

### 6.2 Type Detection Rules (Rule-Based, No ML)

| Type | Detection Priority |
|------|-------------------|
| `github` | `github.com/owner/repo` (not raw, not gist) |
| `npm` | `npmjs.com/package/*` or `registry.npmjs.org/*` |
| `pdf` | `.pdf` extension or `Content-Type: application/pdf` |
| `video` | `youtube.com`, `vimeo.com`, `loom.com`, `.mp4`, `.webm` |
| `design` | `figma.com`, `dribbble.com`, `behance.net`, `penpot.app` |
| `article` | `<article>` tag, `blog`, `medium.com`, `dev.to`, `substack.com`, word count > 500 |
| `tool` | Pricing page patterns, `pricing`, `signup`, SaaS domain patterns |
| `other` | Fallback |

### 6.3 Graceful Fallback Strategy

| Failure Mode | Fallback |
|--------------|----------|
| Content script blocked (CSP) | Popup shows "Limited access — edit manually" with title from `document.title` |
| Offscreen document fails | Use content script result only |
| No metadata extracted | Type = `other`, title = `<title>`, image = favicon, user edits |
| Dynamic content (SPA) | Offscreen Document (Chrome) / Content script best-effort (Firefox) |
| Cross-origin iframe | Skip — only main frame metadata |

**Key Principle:** Never block save. Always allow user to edit/override. Save with minimal metadata rather than fail.

---

## 7. Important Technical Choices — Decision Matrix

| # | Decision Area | Options Considered | Recommended | Reasoning | Risks | Confidence | Status |
|---|---------------|-------------------|-------------|-----------|-------|------------|--------|
| 1 | **Web Framework** | React SPA (Vite) vs Next.js vs Tauri | **React SPA (Vite)** | Local-first needs no SSR; simpler; smaller bundle; easier extension code sharing | None major | High | **Final** |
| 2 | **Local Storage** | IndexedDB (Dexie) vs SQLite WASM+OPFS | **IndexedDB (MVP) → SQLite WASM+OPFS (Phase 8+)** | Universal support now; Dexie mature; FTS5 via MiniSearch; OPFS when Safari/FF ready | IndexedDB query limits at scale | High | **Provisional** (migrate Phase 8+) |
| 3 | **Extension Arch** | Manifest V3 cross-browser (WXT/Extension.js) | **WXT + webextension-polyfill** | Handles Chrome SW / Firefox event page; single codebase; TypeScript; hot reload | Firefox offscreen not available | High | **Final** |
| 4 | **Search** | MiniSearch vs FTS5 vs Transformers.js | **MiniSearch (MVP) → FTS5 (Phase 8+)** | Zero deps, fast, in-memory, fuzzy/prefix; FTS5 when SQLite adopted | MiniSearch memory at 50k+ | High | **Provisional** |
| 5 | **State Mgmt** | TanStack Query + Context vs Zustand vs Redux | **TanStack Query + React Context** | Treats local DB as server; optimistic updates; cache invalidation; DevTools | Learning curve | High | **Final** |
| 6 | **Data Validation** | Zod (schemas) + TypeScript | **Zod + TypeScript** | Runtime validation for import/export/messages; shared schemas in `packages/core` | Bundle size (~8 KB) | High | **Final** |
| 7 | **Schema Migrations** | Dexie migration API (MVP) → SQL migrations (Phase 8+) | **Dexie versioned migrations** | Built-in; simple for MVP; SQL standard later | Dexie migrations limited | Medium | **Provisional** |
| 8 | **Metadata Extraction** | Rule-based (domain + meta) + Offscreen (Chrome) | **Rule-based + Offscreen + Content Script** | No ML in MVP; deterministic; graceful fallback | SPA extraction reliability | High | **Final** |
| 9 | **Shared Packages** | pnpm workspaces: core, ui, extension-core | **pnpm workspaces (3 packages)** | Lightweight; no Turborepo/Nx overhead; TypeScript project references | Manual build orchestration | High | **Final** |
| 10 | **Testing Strategy** | Vitest (unit) + Playwright (E2E) + Chrome DevTools MCP (visual) | **Vitest + Playwright + visual regression** | Fast unit; real browser E2E; visual CI; accessibility | Playwright config for extension | High | **Final** |

---

## 8. Security and Privacy Evaluation

### 8.1 Threat Model (Local-First)

| Asset | Threat | Mitigation (MVP) | Mitigation (Post-MVP) |
|-------|--------|------------------|----------------------|
| **Local Data (IndexedDB)** | Browser exploit / malicious site reads DB | Same-origin policy isolates; no sensitive PII in bookmarks | SQLCipher / IndexedDB encryption (Phase 8+) |
| **Extension Permissions** | Over-privileged access | Minimal: `activeTab`, `scripting`, `storage`, `contextMenus` | Optional host permissions per domain |
| **Imported Data (HTML/JSON)** | XSS via malicious bookmark | Sanitize on import; DOMPurify for HTML export render | Content Security Policy strict |
| **Metadata from Pages** | XSS via crafted og:title/description | Sanitize all extracted text; render as text not HTML | Same |
| **Export Files** | Data exfiltration | User-initiated only; no auto-export | Same |
| **Sync (Future)** | MITM / server breach | N/A (no sync in MVP) | E2E encryption; user holds keys; self-host option |
| **Telemetry** | Privacy violation | **Zero telemetry by default** (P1, MVP) | Opt-in only, local-first analytics |

### 8.2 Extension Permission Minimization

```json
// manifest.json permissions — MVP minimum
"permissions": [
  "storage",           // chrome.storage.local for offline queue
  "activeTab",         // Current tab only on user action
  "scripting",         // Inject content script for metadata
  "contextMenus"       // Right-click "Save to Fluid Deck"
],
"host_permissions": [
  "<all_urls>"         // Required for content script on any page
]
```

**Note:** `<all_urls>` host permission is required for content script injection on arbitrary pages. Alternative: request permission on first save per domain (optional_permissions API) — adds friction. MVP uses `<all_urls>` with clear privacy policy.

### 8.3 Risks Requiring Phase 2 Security Design

1. **Import HTML/JSON sanitization** — Malicious bookmark export could contain scripts
2. **Export rendering** — HTML export opened in browser could execute if not sanitized
3. **Cross-origin metadata extraction** — Content script in isolated world, but main world access via `scripting.executeScript`
4. **Sync conflict resolution** — Future: how to present conflicts without leaking data
5. **Self-hosted sync server auth** — How to authenticate without central account

---

## 9. Feasibility and Risk Analysis

### 9.1 Environment Assessment

| Component | Current State | Required for Phase 4 | Blocker? |
|-----------|---------------|----------------------|----------|
| **OS** | Windows 11 | Any | No |
| **Node.js** | v26.13.0 (non-LTS) | **LTS 22 or 20** | **YES** — must pin via fnm/nvm |
| **npm** | 12.2.2 | ✅ | No |
| **pnpm** | 11.13.0 | ✅ (preferred) | No |
| **Bun** | 1.4.3 | ✅ (alternative runtime) | No |
| **Git** | Installed | ✅ | No |
| **jq** | Missing | **Install via winget** | **YES** — for JSON processing in scripts |
| **tsc** | Missing from PATH | **Install globally** (`npm i -g typescript`) | **YES** — for type checking |
| **GitHub MCP** | Failed (400 auth) | Fix before Phase 10 | Phase 10 only |
| **autoharness** | Connection closed | Not needed for Fluid Deck | No |

### 9.2 Technical Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Manifest V3 service worker termination loses state** | High | Medium | Persist all state in `chrome.storage.local`; never use module-scope variables |
| **Firefox event page vs Chrome service worker differences** | Medium | Medium | Use WXT/Extension.js abstraction; test both weekly |
| **IndexedDB quota exceeded at 10k+ resources with thumbnails** | Medium | High | Store thumbnails as Blob URLs (revoke on delete); compress images; monitor quota |
| **MiniSearch memory at 50k+ resources** | Low (MVP target 10k) | Medium | Paginate index rebuild; migrate to FTS5 at Phase 8 |
| **Offscreen Document instability (Chrome)** | Medium | Medium | Fallback to content script; timeout handling; retry logic |
| **Cross-browser extension metadata extraction variance** | High | Medium | Accept Firefox content-script-only; document limitations |
| **URL normalization false positives/negatives** | Medium | Low | Configurable rules; user choice on conflict; test with real bookmarks |
| **Import fidelity (Raindrop JSON schema changes)** | Medium | Medium | Version detection; graceful degradation; user preview before commit |
| **PWA offline + extension online sync conflict** | Low (no sync MVP) | N/A | Design conflict resolution in Phase 8 sync spec |

### 9.3 Prerequisites for Phase 4 (Implementation Start)

1. **Pin Node.js to LTS** — `fnm install 22` or `nvm install 22` → `fnm use 22`
2. **Install jq** — `winget install jqlang.jq`
3. **Install TypeScript globally** — `npm i -g typescript` (or use `pnpm dlx tsc`)
4. **Initialize pnpm workspace** — `pnpm init` + workspace config
5. **Set up WXT extension scaffold** — `pnpm create wxt@latest apps/extension`
6. **Set up Vite React scaffold** — `pnpm create vite@latest apps/web --template react-ts`
7. **Configure shared `packages/core`** — Types, Zod schemas, storage abstraction

---

## 10. Technical Direction Recommendation — Decision Matrix

### 10.1 Summary Decision Matrix

| Evaluation Area | Recommended Direction | Provisional/Final | Confidence |
|----------------|----------------------|-------------------|------------|
| **Web Application** | React SPA + Vite + TypeScript + PWA | Final | High |
| **Browser Extension** | Manifest V3 via WXT (Chrome/Firefox/Edge) | Final | High |
| **Local Storage (MVP)** | IndexedDB via Dexie.js | Provisional (migrate Phase 8+) | High |
| **Local Storage (Phase 8+)** | SQLite WASM + OPFS via wa-sqlite | Provisional | Medium |
| **Search (MVP)** | MiniSearch (in-memory) + faceted filters | Provisional (migrate Phase 8+) | High |
| **Search (Phase 8+)** | SQLite FTS5 native | Provisional | Medium |
| **State Management** | TanStack Query v5 + React Context | Final | High |
| **Styling/UI** | Tailwind CSS v4 + shadcn/ui (Radix) | Final | High |
| **Data Validation** | Zod + TypeScript (shared packages) | Final | High |
| **Schema Migrations** | Dexie versioned (MVP) → SQL (Phase 8+) | Provisional | Medium |
| **Metadata Extraction** | Rule-based + Content Script + Offscreen (Chrome) | Final | High |
| **Shared Architecture** | pnpm workspaces: core, ui, extension-core | Final | High |
| **Testing** | Vitest + Playwright + Chrome DevTools MCP | Final | High |
| **Desktop (Phase 8+)** | Tauri + native SQLite | Deferred | Medium |

### 10.2 Decisions Requiring Your Approval

| Decision | Options | Recommendation | Input Needed |
|----------|---------|----------------|--------------|
| **Desktop framework for Phase 8+** | Tauri (Rust) vs Electron vs PWA-only | Tauri — native SQLite, smaller bundle, local-first aligned | Rust comfort level; team capacity |
| **SQLite WASM timing** | Phase 8 (after MVP feedback) vs Phase 6 (parallel) | Phase 8 — validate IndexedDB sufficiency first | Risk tolerance for migration |
| **Safari extension** | Include in MVP vs Phase 8+ | Phase 8+ — low primary persona usage | Safari % in your user base |
| **Self-hosted sync server** | Phase 8+ (Docker) vs Phase 10+ | Phase 8+ as separate deliverable | Priority vs resources |
| **Local encryption at rest** | MVP (P2) vs Phase 8+ | Phase 8+ — defense in depth, not day-one | Threat model priority |

### 10.3 Decisions Deferred to Phase 2 (Architecture Design)

- Detailed database schema (IndexedDB/Dexie collections)
- API contracts (extension ↔ web app messaging types)
- MiniSearch index structure and rebuild strategy
- Component hierarchy and state ownership
- Error boundaries and retry policies
- Performance budgets (bundle size, search latency, save latency)
- Accessibility audit checklist (WCAG 2.2 AA)

### 10.4 Future Optimization Opportunities

| Area | Opportunity | Trigger |
|------|-------------|---------|
| **Search** | Hybrid keyword + semantic (Transformers.js) | User feedback: "keyword not enough" |
| **Storage** | SQLite WASM + OPFS + CRDT (Yjs/Automerge) | Multi-device sync + conflict-free |
| **Extraction** | Local ML for auto-tagging (ONNX) | 10k+ resources, tag burden high |
| **Desktop** | Tauri with native SQLite + system integration | User demand for native app |
| **Mobile** | PWA + Share Target + Background Sync | Mobile capture usage > 20% |
| **AI** | Local embeddings + RAG over personal library | Phase 9+, hardware allows |

---

## 11. Documents Created/Updated

### Created
- `docs/TECHNICAL_DIRECTION_EVALUATION.md` — This document

### Updated
- `docs/PROJECT_PROGRESS.md` — Phase 1.7 marked complete, next action Phase 1.8 pending approval

---

## 12. Final Report

### 12.1 Technologies and Approaches Evaluated

1. **Web Framework**: React SPA (Vite) vs Next.js vs Tauri → **React SPA**
2. **Local Storage**: IndexedDB (Dexie) vs SQLite WASM+OPFS (wa-sqlite/official) vs sql.js → **IndexedDB MVP → SQLite WASM Phase 8+**
3. **Browser Extension**: Manifest V3 cross-browser via WXT → **WXT + webextension-polyfill**
4. **Search**: MiniSearch vs FTS5 vs Transformers.js → **MiniSearch MVP → FTS5 Phase 8+**
5. **State Management**: TanStack Query vs Zustand vs Redux → **TanStack Query + Context**
6. **Data Validation**: Zod + TypeScript → **Zod + TypeScript**
7. **Schema Migrations**: Dexie vs SQL → **Dexie MVP → SQL Phase 8+**
8. **Metadata Extraction**: Rule-based + Content Script + Offscreen → **Rule-based + dual strategy**
9. **Shared Code**: pnpm workspaces (core, ui, extension-core) → **pnpm workspaces**
10. **Testing**: Vitest + Playwright + Chrome DevTools MCP → **Vitest + Playwright + visual**

### 12.2 Recommended Application and Extension Direction

- **Web App**: React SPA + Vite + TypeScript + PWA (Tailwind + shadcn/ui)
- **Extension**: Manifest V3 via WXT (Chrome/Firefox/Edge), side panel + popup, content script + offscreen for metadata
- **Communication**: Extension → Web App via `runtime.sendMessage`; Web App owns all storage/logic

### 12.3 Recommended Local Persistence Approach

| Phase | Approach | Rationale |
|-------|----------|-----------|
| **MVP** | IndexedDB (Dexie.js) + MiniSearch | Universal browser support; mature; sufficient for 10k resources |
| **Phase 8+** | SQLite WASM + OPFS (wa-sqlite) + FTS5 | Native SQL; better performance at scale; Notion-validated; standard migrations |

**Critical**: Extension and Web App have separate origins — Extension is thin capture client; Web App is primary storage.

### 12.4 Recommended Search Approach

| Phase | Approach | Rationale |
|-------|----------|-----------|
| **MVP** | MiniSearch (in-memory index rebuilt on load) | Zero WASM; ~8 KB; fuzzy/prefix/filter; fast for 10k |
| **Phase 8+** | SQLite FTS5 (native) | Full-text search in SQL; no memory index; ACID with data |

### 12.5 Key Security and Privacy Findings

- **Zero telemetry by default** (MVP feature P1) — aligns with Principle 7
- **Minimal extension permissions** — `activeTab`, `scripting`, `storage`, `contextMenus`, `<all_urls>`
- **Import/Export sanitization required** — DOMPurify for HTML; Zod validation for JSON
- **Sync deferred** — E2E encryption + self-host option designed in Phase 2
- **No sensitive PII in bookmarks** — but defense-in-depth encryption Phase 8+

### 12.6 Main Technical Risks and Blockers

**Blockers (Must Fix Before Phase 4):**
1. Node.js v26.13.0 non-LTS → pin to LTS 22 via fnm/nvm
2. `jq` not installed → `winget install jqlang.jq`
3. `tsc` not in PATH → `npm i -g typescript`

**Risks (Monitor During Implementation):**
1. Manifest V3 service worker lifecycle — persist state in `chrome.storage.local`
2. Firefox vs Chrome background differences — WXT abstraction + weekly cross-browser testing
3. IndexedDB quota with thumbnails — compress, monitor, revoke Blob URLs
4. Offscreen Document reliability — fallback to content script; timeout handling
5. MiniSearch memory at scale — migrate to FTS5 at Phase 8 trigger (20k+ resources)

### 12.7 Decisions Requiring Your Approval

1. **Desktop framework** — Tauri (Rust) vs Electron vs PWA-only for Phase 8+
2. **SQLite WASM migration timing** — Phase 8 (validated) vs Phase 6 (parallel)
3. **Safari extension** — MVP vs Phase 8+ (deferred)
4. **Self-hosted sync server** — Phase 8+ vs Phase 10+
5. **Local encryption at rest** — MVP vs Phase 8+

### 12.8 Documents Created/Updated

- **Created**: `docs/TECHNICAL_DIRECTION_EVALUATION.md`
- **Updated**: `docs/PROJECT_PROGRESS.md` — Phase 1.7 complete

---

## 13. Next Phase

**Phase 1.8 — Architecture & Database Schema** (awaiting approval)

Scope:
- Detailed IndexedDB/Dexie schema (collections, indexes, migration plan)
- Extension ↔ Web App messaging protocol (TypeScript types, Zod schemas)
- MiniSearch index structure and rebuild triggers
- Component architecture and state ownership map
- Error handling, retry, and offline queue specifications
- Performance budgets and monitoring hooks
- Accessibility requirements (WCAG 2.2 AA)

**Approval Required**: Review this evaluation and explicitly approve Phase 1.8.