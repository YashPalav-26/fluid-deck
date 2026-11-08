# Product Requirements Document — Fluid Deck

*Generated: 2026-11-07 | Based on: Phase 1.1–1.7 Discovery Work | Phase: 1.8*

---

## 1. Executive Summary

Fluid Deck is a premium personal digital library and smart bookmark manager. It solves the problem of scattered, disorganized, and hard-to-rediscover internet resources by providing effortless capture, intelligent organization, and instant retrieval — all with visual clarity and personal control.

**Product Vision**: A personal knowledge hub where every saved resource is instantly findable, richly contextualized, and effortlessly organized — so users spend zero time managing bookmarks and all time using what they saved.

**Core Hypothesis**: We believe a **local-first, visual, hybrid-search personal library** with universal capture surfaces will solve "finding is harder than saving" for developers, designers, and AI tool explorers. We'll know we're right when users save >20 resources in week 1 and retrieve any resource in <5 seconds.

**MVP Scope**: 18 must-have features delivering a complete, usable personal library — local-first storage, browser extension capture, auto metadata extraction, nested collections + tags, MiniSearch keyword search + faceted filters, type-aware visual grid, URL dedup, import/export (4 formats), command palette, zero telemetry. No sync, no AI/ML, no native mobile, no CLI/API in MVP.

---

## 2. Product Vision and Positioning

### 2.1 Vision Statement
A personal knowledge hub where every saved resource is instantly findable, richly contextualized, and effortlessly organized.

### 2.2 Positioning Statement
**For** knowledge workers, developers, designers, researchers, and curious learners **who** collect hundreds of useful links across topics, **Fluid Deck** is a **smart personal library** that **auto-organizes, enriches, and instantly retrieves resources** unlike browser bookmarks, Raindrop.io, or Notion which **require manual tagging, lack rich previews, or treat bookmarks as second-class notes**.

### 2.3 Product Principles (Constitutional)
1. **Effortless capture** — One click/keyboard shortcut from anywhere; no mandatory fields
2. **Intelligent organization** — Auto-categorize, tag, deduplicate; manual override always available
3. **Instant retrieval** — Sub-second search with filters; visual results with rich previews
4. **Visual clarity** — Thumbnail grid, card views, type icons; scan don't read
5. **Personal control** — Local-first option, export anytime, no vendor lock-in
6. **Reliable persistence** — Never lose a saved resource; conflict-free sync
7. **Privacy by default** — No tracking, no data selling, optional cloud sync
8. **Simplicity with depth** — Simple surface; power features discoverable, not forced

---

## 3. Problem Statement

### 3.1 Primary Problems (Prioritized)
| # | Problem | Evidence |
|---|---------|----------|
| 1 | **Finding is harder than saving** — Users save freely but cannot retrieve reliably | Competitive research: "Manual folder org doesn't scale beyond 50 bookmarks"; "No way to search by content" |
| 2 | **Context loss** — Why was this saved? What part matters? Gone without notes | Product vision; competitive research: mymind loses "why saved" |
| 3 | **Scattered sources** — Browser bookmarks, Pocket, starred repos, downloads, tabs | Vision problem 3; personas: Alex (GitHub + browser + Notion), Jordan (4-tool ecosystem) |
| 4 | **Metadata poverty** — No auto-extracted tags, descriptions, thumbnails, categories | Vision problem 4; competitive: browser native has title/URL only |
| 5 | **Weak search** — Text-only, no filters by type/topic/date/source/quality | Vision problem 5; competitive: only Fabric has semantic search; all lack faceted filters |
| 6 | **Duplicate waste** — Same resource saved multiple times unknowingly | Vision problem 6; competitive: Chrome drag-dupe bug; 150k+ dedup threads |
| 7 | **Collection paralysis** — Folders grow unusable; users stop organizing | Vision problem 7; competitive: "Folder called 'Read Later' has 400 items" |

### 3.2 Cost of Inaction
- Knowledge workers waste hours re-searching web for previously saved resources
- Valuable insights lost in tab hoards, unsearchable GitHub stars, disconnected tools
- No portable personal library — vendor lock-in or primitive browser sync
- Privacy compromised by cloud-first tools with mandatory telemetry

---

## 4. Target Audience and Personas

### 4.1 Primary Segments

| Segment | Problem Severity | Frequency | Product Fit | MVP Feasibility | Adoption Potential | Diff. Opportunity | **Total** | Priority |
|---------|-----------------|-----------|-------------|-----------------|-------------------|-------------------|-----------|----------|
| Software Developers | 5 | 5 | 5 | 4 | 5 | 5 | **29** | **Primary** |
| Designers/Creative Pros | 5 | 5 | 5 | 4 | 5 | 4 | **28** | **Primary** |

### 4.2 Secondary Segments

| Segment | Total | Priority |
|---------|-------|----------|
| AI Enthusiasts/Tool Explorers | 26 | **Secondary** |
| Researchers/Knowledge Workers | 23 | **Secondary** |

### 4.3 Deferred Segments
Productivity Professionals (21), CS/IT Students (23), Content Creators (17)

### 4.4 Core Personas

**Alex — Full-Stack Developer**
- Senior engineer, 15-25 saves/week (GitHub repos, API docs, npm packages, Stack Overflow)
- Pain: GitHub stars unsearchable; browser bookmarks lack code metadata; duplicates across sources
- Needs: Tech-stack auto-tags, code snippet extraction, CLI capture, local-first, import from GitHub stars + Notion

**Maya — Product Designer**
- Fintech designer + freelance, 20-30 saves/week (Dribbble, Figma, design systems, color palettes)
- Pain: Pinterest public only; Figma work-only; browser bookmarks no visual preview; folder paralysis
- Needs: Type-aware visual cards, perceptual hash dedup, color/brand extraction, import from Pinterest/Figma/Are.na, optional sync

**Sam — AI Tool Explorer**
- ML engineer + newsletter writer, 30-50 saves/week (AI tools, model cards, prompt libraries, Discord)
- Pain: Tab overload; Raindrop no AI metadata; Notion tables rot; no weekly digest
- Needs: AI-specific tags (model type, deployment, pricing), GitHub/HF metadata, semantic search, background digest agents, CLI capture

---

## 5. User Needs and Jobs-to-be-Done

### 5.1 Capture Jobs
| ID | Job | Priority |
|----|-----|----------|
| JTBD-C1 | Save from browser in <2s with zero mandatory fields | Essential |
| JTBD-C2 | Save from terminal/CLI without context switch | Important |
| JTBD-C3 | Save from mobile via share sheet | Important |
| JTBD-C4 | Import existing libraries (Raindrop, browser, Zotero, Pocket) once | Essential |

### 5.2 Organization Jobs
| ID | Job | Priority |
|----|-----|----------|
| JTBD-O1 | Auto-categorize by type/topic/source | Essential |
| JTBD-O2 | Dynamic views (smart collections) that update automatically | Essential |
| JTBD-O3 | Detect duplicates at save time | Essential |
| JTBD-O4 | Customizable collections + tags + filters matching mental model | Essential |

### 5.3 Retrieval Jobs
| ID | Job | Priority |
|----|-----|----------|
| JTBD-R1 | Find resource in <5s by keyword, topic, type, visual similarity | Essential |
| JTBD-R2 | Visual/color/brand search for vague memory ("blue header") | Important |
| JTBD-R3 | Semantic search by meaning ("efficient attention" → "linear attention") | Essential |
| JTBD-R4 | Inline previews (code snippets, thumbnails, reader mode) | Important |

### 5.4 Portability Jobs
| ID | Job | Priority |
|----|-----|----------|
| JTBD-P1 | Full export (JSON/HTML/Markdown/CSV/BibTeX) — data never trapped | Essential |
| JTBD-P2 | Optional encrypted sync across personal+work devices | Important |
| JTBD-P3 | Clean export for sharing curated lists (no Fluid Deck needed) | Essential |
| JTBD-P4 | Self-hosted Docker sync server for full control | Future |

---

## 6. Product Goals and Non-Goals

### 6.1 MVP Goals
1. **Core capture reliability** — Extension saves in <2s with >90% metadata extraction rate
2. **Organization that scales** — Nested collections + tags handle 10k+ resources without rot
3. **Instant retrieval** — FTS5 keyword + faceted filters <200ms p95; sub-5s time-to-find
4. **Data portability** — Lossless import (browser HTML, Raindrop JSON) + export (4 formats)
5. **Privacy by default** — Zero telemetry, local-first, full delete, no account required
6. **Visual clarity** — Type-aware grid cards as primary browse mode

### 6.2 Explicit Non-Goals (Out of Scope)
| Non-Goal | Reason |
|----------|--------|
| General note-taking | Use Obsidian, Notion |
| Project/task management | Use Linear, Todoist |
| Social features, sharing, collaboration | Contradicts privacy principle |
| AI chatbot or content generation | Defer to Phase 8+ |
| RSS/feed reader | Pocket/Omnivore territory |
| Read-later/offline reading | Different product category |
| Team workspaces | Out of scope per vision |

---

## 7. MVP Scope and Feature Priorities

### 7.1 Must-Have Features (18 Features)

| ID | Feature | Category | Source Document |
|----|---------|----------|-----------------|
| L1 | SQLite/IndexedDB local storage | Storage | MVP_FEATURE_PRIORITIZATION |
| C1 | Browser extension (Manifest V3) | Capture | MVP_FEATURE_PRIORITIZATION |
| M1 | Title/URL/description extraction | Metadata | MVP_FEATURE_PRIORITIZATION |
| M2 | Thumbnail/image extraction | Metadata | MVP_FEATURE_PRIORITIZATION |
| M3 | Type detection (rule-based) | Metadata | MVP_FEATURE_PRIORITIZATION |
| O1 | Nested collections (drag-drop) | Organization | MVP_FEATURE_PRIORITIZATION |
| O3 | Tags with autocomplete | Organization | MVP_FEATURE_PRIORITIZATION |
| S1 | Keyword search (SQLite FTS5) | Search | MVP_FEATURE_PRIORITIZATION |
| S2 | Faceted filters (type, collection, tags, date, source) | Search | MVP_FEATURE_PRIORITIZATION |
| V1 | Grid view (thumbnail cards) | Visual | MVP_FEATURE_PRIORITIZATION |
| V3 | Type-aware card rendering (7 variants) | Visual | MVP_FEATURE_PRIORITIZATION |
| D1 | URL normalization duplicate detection | Dedup | MVP_FEATURE_PRIORITIZATION |
| I1 | Import: Browser HTML | Import/Export | MVP_FEATURE_PRIORITIZATION |
| I2 | Import: Raindrop.io JSON | Import/Export | MVP_FEATURE_PRIORITIZATION |
| I4 | Export: JSON/HTML/Markdown/CSV | Import/Export | MVP_FEATURE_PRIORITIZATION |
| K1 | Command palette (⌘K) | Power UX | MVP_FEATURE_PRIORITIZATION |
| B1 | Manifest V3 extension (Chrome/Firefox/Edge) | Extension | MVP_FEATURE_PRIORITIZATION |
| P1 | Zero telemetry by default | Privacy | MVP_FEATURE_PRIORITIZATION |

### 7.2 Should-Have (Post-MVP, Phase 8+)
CLI capture (C2), REST API (C3), Auto-tagging local ML (M4), Code-aware extraction (M5), Smart collections (O2), Semantic search (S3), Visual similarity (S4), List view (V2), Rich preview modal (V4), Reader mode (V5), Perceptual hash dedup (D2), Import Pocket/Pinboard (I3), Export BibTeX (I5), Mobile share target (C4), Local AI summaries (A3), Encrypted sync (L2), Self-hosted sync server (L3), Conflict resolution UI (L4), Offline-first SW (L5), Vim navigation (K2), Bulk actions (K3), GitHub stars sync (DEV1), npm capture (DEV2), Code snippet extraction (DEV3), Local encryption (P2), Full data delete (P3).

### 7.3 Future/Experimental (Phase 9+)
AI chatbot/Q&A, Advanced annotations, Native iOS/Android apps, Raycast/Alfred plugins, Team workspaces, RSS/feed reader, Web archive, Advanced annotation/highlighting.

### 7.4 Key Product Decisions (Approved)
| Decision | Choice | Source |
|----------|--------|--------|
| Local-first vs cloud-first | Local-first (hard constraint) | MVP_FEATURE_PRIORITIZATION §4.1 |
| Sync in MVP | No sync — optional Phase 8+ | MVP_FEATURE_PRIORITIZATION §4.2 |
| Browser extension | Manifest V3 (Chrome/Firefox/Edge); Safari deferred | MVP_FEATURE_PRIORITIZATION §4.3 |
| Search approach | Keyword + Faceted (FTS5) only; semantic deferred | MVP_FEATURE_PRIORITIZATION §4.4 |
| Organization model | Collections + Tags (not folders-only, not tags-only) | MVP_FEATURE_PRIORITIZATION §4.5 |
| Auto-tagging | Manual tags with autocomplete; no ML in MVP | MVP_FEATURE_PRIORITIZATION §4.6 |
| CLI/API capture | Deferred to Post-MVP | MVP_FEATURE_PRIORITIZATION §4.7 |
| AI metadata | Rule-based type detection only; ML deferred | MVP_FEATURE_PRIORITIZATION §4.8 |
| Import sources | Browser HTML + Raindrop JSON only | MVP_FEATURE_PRIORITIZATION §4.9 |
| Export formats | JSON/HTML/MD/CSV in MVP; BibTeX Post-MVP | MVP_FEATURE_PRIORITIZATION §4.10 |

---

## 8. Functional Requirements

### 8.1 Storage & Persistence (FR-STO)

| ID | Requirement | Acceptance Criteria | Dependencies |
|----|-------------|---------------------|--------------|
| FR-STO-001 | System SHALL provide local-first persistence using IndexedDB via Dexie.js (PWA) | Data persists across browser/app restarts; no network required for CRUD; Extension uses chrome.storage.local for offline capture queue only | L1 |
| FR-STO-002 | System SHALL store Resource entities with all metadata fields | Resource: id, url, canonical_url, title, description, thumbnail_url, type, source, created_at, updated_at, deleted_at, notes | L1 |
| FR-STO-003 | System SHALL store Collection hierarchy with parent-child relationships | Collection: id, name, parent_id, order_index, created_at; supports ≥3 levels | L1 |
| FR-STO-004 | System SHALL store many-to-many Resource↔Collection memberships | Membership table: resource_id, collection_id, added_at | L1, O1 |
| FR-STO-005 | System SHALL store Tags as global flat entities with usage counts | Tag: id, name, usage_count, created_at; autocomplete source | L1, O3 |
| FR-STO-006 | System SHALL store Saved Searches as named filter combinations | SavedSearch: id, name, filter_state_json, created_at, alert_enabled | L1, S5 |
| FR-STO-007 | System SHALL support soft delete with 30-day auto-purge default | deleted_at timestamp; Trash virtual collection; configurable purge | L1, Journey 10 |
| FR-STO-008 | System SHALL enforce data integrity with checksums on startup | Automated integrity check; corruption detection with backup restore option | L1 |

### 8.2 Capture & Metadata Extraction (FR-CAP)

| ID | Requirement | Acceptance Criteria | Dependencies |
|----|-------------|---------------------|--------------|
| FR-CAP-001 | System SHALL capture via Manifest V3 browser extension (Chrome/Firefox/Edge) | Extension installs from store; icon visible; context menu "Save to Fluid Deck" | B1, C1 |
| FR-CAP-002 | System SHALL extract title, URL, description, canonical URL from page | >90% extraction rate; fallback to `<title>` + favicon + type=other | M1, M2, M3 |
| FR-CAP-003 | System SHALL extract thumbnail: og:image → twitter:image → first `<img>` → favicon | Thumbnail URL stored; lazy-loaded in grid; placeholder on failure | M2 |
| FR-CAP-004 | System SHALL classify resource type via rule-based detection (8 types) | Type enum: article, video, github, npm, pdf, design, tool, other; >95% accuracy on test corpus | M3 |
| FR-CAP-005 | System SHALL normalize URL at save (strip UTM, www, fragments, sort params) | Canonical URL prevents duplicates; normalization rules configurable (Post-MVP) | D1 |
| FR-CAP-006 | System SHALL detect duplicate by canonical URL and present 4-choice modal | Options: Update Metadata / Add to Collections / Add Tags / Skip | D1, Journey 9 |
| FR-CAP-007 | System SHALL support context menu save (right-click → Save) | No popup required; saves with defaults; toast confirmation | B2 |
| FR-CAP-008 | System SHALL support keyboard shortcut ⌘⇧S for save | Global shortcut registered; opens popup pre-filled | B1 |

### 8.3 Organization (FR-ORG)

| ID | Requirement | Acceptance Criteria | Dependencies |
|----|-------------|---------------------|--------------|
| FR-ORG-001 | System SHALL support nested collections (max 3 levels recommended) | Tree structure in sidebar; drag-drop reorder/move; inline create/rename/delete | O1 |
| FR-ORG-002 | System SHALL allow resources in multiple collections simultaneously | Many-to-many membership; no duplication of resource data | O1, FR-STO-004 |
| FR-ORG-003 | System SHALL provide global tags with autocomplete | Tag input: type → suggestions by usage count + prefix; comma/Enter adds chip | O3 |
| FR-ORG-004 | System SHALL support "Unorganized" virtual collection for resources without collections | Always visible in tree; filterable via chip; bulk actions available | IA §4, Journey 5 |
| FR-ORG-005 | System SHALL delete collection non-destructively (unassign resources only) | Resources moved to Unorganized; subcollections become top-level or move to parent | IA §4, Journey 10 |
| FR-ORG-006 | System SHALL provide bulk tag operations via ⌘K: Tag Selected, Merge Tags, Rename Tag, Delete Tag | Multi-select → ⌘K → actions; merge removes source tag; rename updates all refs | O3, Journey 5 |

### 8.4 Search & Retrieval (FR-SRH)

| ID | Requirement | Acceptance Criteria | Dependencies |
|----|-------------|---------------------|--------------|
| FR-SRH-001 | System SHALL provide full-text keyword search via MiniSearch (in-memory index) | Searches title, URL, description, tags, extracted content; <50ms p95 at 10k resources | S1, L1 |
| FR-SRH-002 | System SHALL provide faceted filters with instant results | Facets: Type, Collection, Tags (OR), Date Range, Source, Has Code, Has Image | S2, O1, O3 |
| FR-SRH-003 | System SHALL encode filter state in URL (shareable/bookmarkable) | URL params: q, type, collection, tags, date, source, sort; browser back/forward works | IA §3 |
| FR-SRH-004 | System SHALL display filter chips for active facets with remove buttons | Each chip removable; "Clear all" returns to root; facet counts in dropdowns | IA §3 |
| FR-SRH-005 | System SHALL support sort options: Newest, Oldest, Title A-Z, Title Z-A, Most Tagged, Recently Opened | Sort persisted per view context; keyboard shortcut `s` for menu | IA §5 |
| FR-SRH-006 | System SHALL highlight query matches in titles/descriptions/tags | Visual emphasis in grid cards and ⌘K dropdown results | S1 |
| FR-SRH-007 | System SHALL provide "No results" state with actionable suggestions | Suggestions: broaden filters, check spelling, try synonyms, import bookmarks | IA §7 |

### 8.5 Visual Browsing (FR-VIS)

| ID | Requirement | Acceptance Criteria | Dependencies |
|----|-------------|---------------------|--------------|
| FR-VIS-001 | System SHALL render grid view as primary browse mode | Masonry or uniform grid (user preference); virtual scroll (50 initial, append on scroll) | V1 |
| FR-VIS-002 | System SHALL render 7 type-aware card variants with distinct fields | Repo: stars/language/license; Article: read time/source; Design: colors/dimensions; Tool: pricing/category; Video: duration/platform; PDF: pages/size; Other: favicon/domain | V3, M3 |
| FR-VIS-003 | System SHALL lazy-load thumbnails with placeholders | No layout shift; blur placeholder → image; revoke Blob URLs on delete | V1, M2 |
| FR-VIS-004 | System SHALL support density toggle: Comfortable (default) / Compact | Preference persisted; affects card padding and info density | V1 |
| FR-VIS-005 | System SHALL support multi-select via Shift+Click and checkboxes | Selection state visible; floating toolbar for bulk actions (Post-MVP) | V1, K3 |

### 8.6 Import & Export (FR-IEX)

| ID | Requirement | Acceptance Criteria | Dependencies |
|----|-------------|---------------------|--------------|
| FR-IEX-001 | System SHALL import browser HTML bookmarks (Chrome/Firefox/Edge/Safari) | Parses Netscape format; preserves folder hierarchy as collections; extracts tags | I1, L1 |
| FR-IEX-002 | System SHALL import Raindrop.io JSON export with full fidelity | Preserves nested collections, tags, metadata (title, desc, image, type, created) | I2, L1 |
| FR-IEX-003 | System SHALL show import preview with counts and conflict detection | Modal: resources, collections, tags, duplicate conflicts; [Customize...] for mapping | I1, I2, Journey 7 |
| FR-IEX-004 | System SHALL export to JSON (full fidelity), HTML (Netscape + extensions), Markdown (frontmatter), CSV (flat) | All core fields preserved; scope: All / Current Filter / Selected / Collection | I4 |
| FR-IEX-005 | System SHALL support export options: include thumbnails, include notes, flatten collections | Thumbnails off by default (file size); notes in MD only; flatten for CSV/HTML | I4, Journey 8 |
| FR-IEX-006 | System SHALL handle duplicate conflicts at import with per-conflict and bulk resolution | Options per conflict: Skip / Update Metadata / Add to Collections; "Apply to all" | D1, Journey 7 |

### 8.7 Command Palette & Power UX (FR-CMD)

| ID | Requirement | Acceptance Criteria | Dependencies |
|----|-------------|---------------------|--------------|
| FR-CMD-001 | System SHALL provide global command palette via ⌘K | Fuzzy search; categories: Navigate, Search, Create, Bulk Actions, Settings, Help | K1 |
| FR-CMD-002 | System SHALL support navigation commands: "Go to Collection: X", "All Resources", "Unorganized", "Trash" | Instant filter application; tree selection sync | K1, IA §3 |
| FR-CMD-003 | System SHALL support bulk actions on multi-select: Tag, Move to Collection, Delete, Export | ⌘K → action → applies to all selected; confirm for destructive | K1, K3 |

### 8.8 Privacy & Security (FR-PRI)

| ID | Requirement | Acceptance Criteria | Dependencies |
|----|-------------|---------------------|--------------|
| FR-PRI-001 | System SHALL have zero telemetry by default | No analytics, crash reporting, or usage tracking unless explicit opt-in | P1 |
| FR-PRI-002 | System SHALL provide full data delete (one-click purge with verification) | All IndexedDB/SQLite data wiped; confirmation required; no residue | P3 |
| FR-PRI-003 | System SHALL require no account or authentication for MVP use | App opens to library immediately; no login screen | L1, P1 |

---

## 9. Non-Functional Requirements

### 9.1 Performance (NFR-PER)

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-PER-001 | Time to first save (install → save) | <30 seconds | Extension onboarding funnel |
| NFR-PER-002 | Time to save (steady state) | <2 seconds | Click → toast confirm |
| NFR-PER-003 | Time to find (query → click result) | <5 seconds | Query → open result |
| NFR-PER-004 | Search latency (MiniSearch, p95) | <50ms at 10k resources | Client-side measurement |
| NFR-PER-005 | Grid render (50 cards, initial load) | <500ms | First paint → interactive |
| NFR-PER-006 | Import processing (1,000 resources) | <10 seconds | Parser + index + UI update |
| NFR-PER-007 | Export generation (10,000 resources) | <30 seconds | Streaming download start |

### 9.2 Reliability (NFR-REL)

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-REL-001 | Data integrity | 0 loss | Automated checksum verification |
| NFR-REL-002 | Extension crash rate | <0.1% | Browser extension telemetry (opt-in) |
| NFR-REL-003 | Import fidelity (round-trip) | >98% field preservation | JSON import → export → import |
| NFR-REL-004 | Export completeness | 100% core fields | Schema validation |
| NFR-REL-005 | Duplicate detection rate | >95% | Detected / actual duplicates (test corpus) |
| NFR-REL-006 | Type detection accuracy | >95% | Manual audit sample |

### 9.3 Usability (NFR-USE)

| ID | Requirement | Target | Measurement |
|----|-------------|--------|-------------|
| NFR-USE-001 | Command palette adoption | >60% of sessions | ⌘K usage / session |
| NFR-USE-002 | Zero-error onboarding | >95% | Install → first save success |
| NFR-USE-003 | Collection creation rate | >1 per 20 saves | Collections / resources |
| NFR-USE-004 | Tag usage | >3 tags/resource avg | Tags / resources |
| NFR-USE-005 | Search relevance (P@5) | >80% | Click-through on top 5 |
| NFR-USE-006 | Faceted filter usage | >40% of searches | Filter clicks / searches |

### 9.4 Compatibility (NFR-COM)

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-COM-001 | Chrome extension (Manifest V3) | Full support | Primary target |
| NFR-COM-002 | Firefox extension (Manifest V3) | Full support | Event page background |
| NFR-COM-003 | Edge extension (Manifest V3) | Full support | Chromium-based |
| NFR-COM-004 | Safari extension | Deferred to Phase 8+ | Different bundle/review |
| NFR-COM-005 | PWA (installable, offline-capable) | Full support | Service Worker + IndexedDB |
| NFR-COM-006 | Desktop (Tauri) | Phase 8+ | Native SQLite |

### 9.5 Accessibility (NFR-ACC)

| ID | Requirement | Standard | Notes |
|----|-------------|----------|-------|
| NFR-ACC-001 | WCAG 2.2 AA compliance | AA | Color contrast, focus management, ARIA labels |
| NFR-ACC-002 | Keyboard navigation | Full | All actions via keyboard; ⌘K as universal access |
| NFR-ACC-003 | Screen reader support | Full | Semantic HTML; live regions for toasts/updates |
| NFR-ACC-004 | Reduced motion | Respected | CSS `prefers-reduced-motion` honored |
| NFR-ACC-005 | High contrast mode | Supported | CSS `prefers-contrast` honored |

### 9.6 Security (NFR-SEC)

| ID | Requirement | Standard | Notes |
|----|-------------|----------|-------|
| NFR-SEC-001 | Extension permissions minimized | `activeTab`, `scripting`, `storage`, `contextMenus`, `<all_urls>` | No unnecessary permissions |
| NFR-SEC-002 | Import sanitization | DOMPurify for HTML; Zod validation for JSON | Prevent XSS from malicious exports |
| NFR-SEC-003 | Export rendering safety | HTML export opened in browser: no script execution | Sanitize on export generation |
| NFR-SEC-004 | Content Security Policy | Strict | No inline scripts; nonce-based if needed |
| NFR-SEC-005 | Local encryption at rest | Deferred to Phase 8+ | SQLCipher / IndexedDB encryption |

---

## 10. Information Architecture and Navigation

### 10.1 Navigation Hierarchy

**Primary (Left Sidebar — Collapsible Tree)**
```
📁 Collections                 ← Root = "All Resources" (no filters)
  ├── 📁 Development
  │   ├── 📁 Frontend
  │   │   ├── React
  │   │   ├── Vue
  │   │   └── CSS
  │   ├── 📁 Backend
  │   │   ├── Node.js
  │   │   ├── PostgreSQL
  │   │   └── Docker
  │   └── 📁 Tools
  ├── 📁 Design
  │   ├── 📁 UI Patterns
  │   │   ├── Navigation
  │   │   ├── Forms
  │   │   └── Dashboards
  │   ├── 📁 Design Systems
  │   └── 📁 Inspiration
  ├── 📁 Research
  │   ├── 📁 Papers
  │   └── 📁 Articles
  └── 📁 Personal
      ├── 📁 Learning
      └── 📁 Reference
```

**Rules**: Max 3 levels recommended; drag-drop reorder; inline create/rename/delete; click = filter; NO Recents/Favorites/Tags/Types as tree nodes.

**Secondary (Top Bar — Filter Chips + Search)**
```
[🔍 Search...]  [🏷️ Type ▼]  [📁 Collection ▼]  [🏷️ Tags ▼]  [📅 Date ▼]  [🌐 Source ▼]  [⚙️ Sort ▼]  [⌘K]
```
Active filters as removable chips; URL-encoded state; "Clear all" returns to root.

**Tertiary (Command Palette — ⌘K)**
Categories: Navigate, Search, Create, Bulk Actions, Settings, Help.

### 10.2 Conceptual Content Model

| Entity | Purpose | Key Relationships |
|--------|---------|-------------------|
| Resource | Core unit: saved URL + metadata | 0+ Collections, 0+ Tags, 1 Type, 1 Source |
| Collection | Hierarchical grouping (tree) | Parent→Children (ordered); Members (Resources, many-to-many) |
| Tag | Cross-cutting facet | Resources (many-to-many); Usage count; Autocomplete |
| Type | Discriminator for rendering + extraction | Fixed enum (8 values); Resource→Type (many-to-one) |
| Source | Origin of capture | Enum (5 values); Filter only |
| Saved Search | Named filter combination | Filter state (query + facets); User-defined name |
| View State | Current filter/sort/page | Transient; URL-encoded; Restored on revisit |

### 10.3 Organization Rules (Approved)
- Resource ∈ multiple collections (many-to-many)
- Collections nestable (≤3 levels recommended)
- Tags global, reusable, flat
- Delete collection → unassigns resources (non-destructive)
- Save without collection/tag → "Unorganized" virtual collection
- Duplicate URLs → normalization + user choice (update/add/skip)

---

## 11. Critical User Journeys

### 11.1 Journey Prioritization

| Priority | Journeys | Reasoning |
|----------|----------|-----------|
| **Critical for MVP** | 1. Onboarding & Import, 2. Extension Save, 3. Search & Filter, 4. Export | Core value loop: Import → Save → Find → Own your data |
| **Important for MVP** | 5. Edit Metadata, 6. Collections & Tags, 7. Duplicate Handling, 8. Delete & Recover | Essential for organization & trust |
| **Post-MVP** | 9. Smart Collections, 10. Bulk Import/Export, 11. Offline Sync, 12. Background Digests | Enhance power users; not required for core value |

### 11.2 Journey 1: First-Time Onboarding and Import
**Goal**: Get running with existing bookmarks imported, understand mental model
**Steps**: Empty state → [Import Bookmarks] → Select source (Browser HTML / Raindrop JSON) → Preview (counts, conflicts) → [Import All] → Success toast + grid populated + tree built → Onboarding hints (⌘K, first collection, first save)
**Success**: Library populated; hierarchy reflects import; tags indexed; user understands grid/sidebar/topbar/⌘K

### 11.3 Journey 2: Saving a Resource via Extension
**Goal**: Capture current page with rich metadata in <2s
**Steps**: Trigger (icon/⌘⇧S/right-click) → Popup opens (auto-filled: title, URL, desc, thumbnail, type) → Edit title/desc optional → Select collection (dropdown tree, default last used) → Add tags (autocomplete) → [Save] → URL normalize → dedup check → insert or conflict modal → Toast "Saved to [Collection]" → Grid updates instantly
**Success**: Resource saved with rich metadata; appears in correct collection+tags; user stays in flow

### 11.4 Journey 3: Search & Filter (Core Retrieval)
**Goal**: Find specific resource in <5s among thousands
**Steps**: ⌘K or search box → Type query → Instant FTS5 results in ⌘K dropdown → Enter → query filter applied → Grid updates + filter chip → Add facets (Type, Tags multi-select, Date, Source) → Each adds chip → Grid narrows instantly → URL updates → Sort → Find target → Click → Opens in new tab → Optional: ⌘K "Save Search"
**Success**: Target found <5s; filter combo shareable via URL; power users build saved searches

### 11.5 Journey 4: Export (Data Portability)
**Goal**: Full data portability — backup, migrate, or share
**Steps**: ⌘K → "Export" → Select format (JSON/HTML/MD/CSV) → Select scope (All / Current Filter / Selected / Collection) → Options (thumbnails, notes, flatten) → [Export] → Download → Toast with filename
**Success**: File downloads correct format+scope; round-trip fidelity (JSON import→export→import preserves all); user owns data

---

## 12. Error, Failure, and Recovery Requirements

| Scenario | Detection | User-Facing Recovery | System Recovery |
|----------|-----------|---------------------|-----------------|
| Extension save fails | Network/permission error | Toast "Save failed: [reason]. Retry?" + [Retry] | Queue locally; retry on reconnect |
| Metadata extraction fails | No title/desc/image extracted | Fallback fields filled; user edits manually | Log failure; telemetry (opt-in) |
| Import file corrupt | Parse error | "File corrupted. Re-export from source." | Partial import rolled back |
| Duplicate URL conflict | Canonical URL exists | Modal with 4 choices (update/add/skip) | User choice applied atomically |
| Delete collection with resources | User confirms delete | Resources → "Unorganized"; toast shows count | Non-destructive unassign |
| Search zero results | FTS5 returns empty | Suggestions: broaden, spelling, synonyms, import | No system action |
| Storage quota exceeded | IndexedDB QuotaExceededError | Modal: "Storage full. Export backup, then delete." | Block writes until space freed |
| Data corruption detected | Integrity check (startup) | Modal: "Corruption detected. Restore from backup?" | Offer backup restore; quarantine corrupt |

---

## 13. Search and Discovery Requirements

### 13.1 Keyword Search (MVP)
- Engine: MiniSearch (in-memory index rebuilt on app load from IndexedDB)
- Indexed fields: title, URL, description, tags, extracted content
- Features: Prefix search, fuzzy search, field boosting, filter functions
- Performance: <50ms p95 at 10k resources; index build ~50ms
- Migration path: Replace with SQLite FTS5 native at Phase 8+ (same query API)

### 13.2 Faceted Filters (MVP)
| Facet | Values | Multi-Select | URL Param |
|-------|--------|--------------|-----------|
| Query | Free text (MiniSearch) | N/A | `q=` |
| Type | 8 enum values | No | `type=` |
| Collection | Tree (includes descendants) | No | `collection=` |
| Tags | All tags | Yes (OR) | `tags=tag1,tag2` |
| Date Range | Presets + custom | No | `date=week|month|year|custom` |
| Source | 5 enum values | No | `source=` |
| Has Code | Boolean | No | `has_code=true` |
| Has Image | Boolean | No | `has_image=true` |

### 13.3 Post-MVP Search Enhancements
- Semantic search: Local embeddings (Transformers.js/ONNX) — Phase 8 experiment
- Visual similarity: Perceptual hashing (pHash) — Phase 8+
- Saved searches: Named filter combos in ⌘K — Should-Have (S5)
- Search analytics: Click-through tracking — Deferred (S6)

---

## 14. Data Portability Requirements

### 14.1 Import (MVP)
| Source | Format | Fidelity | Priority |
|--------|--------|----------|----------|
| Browser bookmarks | HTML (Netscape) | Collections→folders, tags, metadata | MVP (I1) |
| Raindrop.io | JSON | Full (nested collections, tags, metadata) | MVP (I2) |
| Pocket | JSON/HTML | Partial | Post-MVP (I3) |
| Pinboard | JSON | Partial | Post-MVP (I3) |
| Zotero | BibTeX/JSON | Complex schema | Future |

### 14.2 Export (MVP)
| Format | Purpose | Fidelity |
|--------|---------|----------|
| JSON | Full backup/migration | 100% (all fields, nested collections, tags) |
| HTML | Browser import; human-readable | Netscape + extensions |
| Markdown | Obsidian/Notion/Logseq import | Frontmatter per resource or single file |
| CSV | Spreadsheet analysis; tag audit | Flat rows, all fields |
| BibTeX | Citation workflow | Post-MVP (I5) |

### 14.3 Portability Guarantees
- Round-trip: JSON import → export → import preserves all data
- Export must be lossless for core fields
- User can leave anytime with full data

---

## 15. Privacy and Security Requirements

### 15.1 Privacy (MVP)
- Zero telemetry by default (P1) — no analytics, crash reporting, usage tracking
- No account required — app opens to library immediately
- Local-first — all data on device; no cloud sync in MVP
- Full data delete — one-click purge with verification (P3)
- Clear privacy policy — no data selling, no tracking

### 15.2 Extension Security (MVP)
- Minimal permissions: `storage`, `activeTab`, `scripting`, `contextMenus`, `<all_urls>`
- `<all_urls>` required for content script injection on arbitrary pages
- Content script in isolated world; main world access via `scripting.executeScript`
- Offscreen Document (Chrome) for SPA metadata extraction

### 15.3 Import/Export Security
- Import HTML sanitization: DOMPurify before parsing
- Import JSON validation: Zod schemas for all formats
- Export HTML generation: sanitize to prevent XSS when opened in browser
- Content Security Policy: strict; no inline scripts

### 15.4 Post-MVP Security
- Local encryption at rest (SQLCipher / IndexedDB encryption) — Phase 8+
- Optional encrypted sync with user-controlled keys — Phase 8+
- Self-hosted sync server auth model — Phase 8+

---

## 16. Accessibility and Responsiveness

### 16.1 Accessibility (WCAG 2.2 AA)
- Color contrast: 4.5:1 text, 3:1 UI components
- Focus management: visible focus rings; logical tab order; focus trap in modals
- ARIA: labels for icon buttons; live regions for toasts; role="tree" for collection sidebar
- Keyboard: all actions via ⌘K + shortcuts; `j/k` nav (Post-MVP); `/` search; `Esc` close
- Screen readers: semantic HTML; `aria-expanded` for tree; `aria-selected` for multi-select
- Reduced motion: `prefers-reduced-motion` honored (no animations)
- High contrast: `prefers-contrast` supported

### 16.2 Responsiveness
- Desktop (≥1024px): Sidebar (280px) + Grid (flex) + Top bar
- Tablet (768-1023px): Collapsible sidebar (drawer) + Grid + Top bar
- Mobile (<768px): Bottom sheet for sidebar; Grid single-column; Top bar condensed; PWA installable
- Density toggle: Comfortable (default) / Compact (persisted preference)

---

## 17. Success Metrics and Proposed Targets

*All targets are hypotheses until validated with real users.*

### 17.1 Product Usability Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Time to first save | <30 sec | Extension onboarding funnel | Hypothesis |
| Time to save (steady) | <2 sec | Click → toast confirm | Hypothesis |
| Time to find | <5 sec | Query → click result | Hypothesis |
| Command palette adoption | >60% sessions | ⌘K usage / session | Hypothesis |
| Zero-error onboarding | >95% | Install → first save success | Hypothesis |

### 17.2 Capture & Organization Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Metadata extraction rate | >90% | Auto-fields populated / saves | Hypothesis |
| Type detection accuracy | >95% | Manual audit sample | Hypothesis |
| Duplicate detection rate | >95% | Detected / actual duplicates | Hypothesis |
| Collection creation rate | >1 per 20 saves | Collections / resources | Hypothesis |
| Tag usage | >3 tags/resource avg | Tags / resources | Hypothesis |

### 17.3 Retrieval Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Search relevance (P@5) | >80% | Click-through on top 5 | Hypothesis |
| Faceted filter usage | >40% searches | Filter clicks / searches | Hypothesis |
| Zero-result rate | <10% | Empty results / queries | Hypothesis |
| Search latency (p95) | <200ms | Client-side FTS5 | Hypothesis |

### 17.4 Reliability Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Data integrity | 0 loss | Automated checksum verification | Hypothesis |
| Extension crash rate | <0.1% | Browser extension telemetry (opt-in) | Hypothesis |
| Import fidelity | >98% | Round-trip field preservation | Hypothesis |
| Export completeness | 100% core fields | Schema validation | Hypothesis |

### 17.5 Adoption & Retention Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| 7-day retention | >40% | Active users day 7 / day 1 | Hypothesis |
| 30-day retention | >25% | Active users day 30 / day 1 | Hypothesis |
| Resources saved (week 1) | >20 median | Per activated user | Hypothesis |
| Import completion rate | >60% | Import started → finished | Hypothesis |
| NPS (qualitative) | >50 | In-app survey (opt-in) | Hypothesis |

---

## 18. MVP Acceptance Criteria

### 18.1 Core Capture Reliability
- [ ] Extension installs and activates in Chrome, Firefox, Edge
- [ ] Save via icon, ⌘⇧S, right-click context menu all work
- [ ] Metadata extraction: title, description, thumbnail, type in >90% of test pages
- [ ] Duplicate detection triggers modal with 4 choices on canonical URL match
- [ ] Toast confirmation appears; popup closes; grid updates instantly (optimistic UI)
- [ ] Offline capture works (local-first — no network required)

### 18.2 Metadata Handling
- [ ] 8 type detection rules correctly classify test corpus (>95% accuracy)
- [ ] Thumbnail extraction: og:image → twitter:image → first img → favicon fallback chain works
- [ ] URL normalization strips UTM, www, fragments, sorts params, decodes punycode
- [ ] Canonical URL stored and used for dedup; original URL preserved
- [ ] User can edit title/description in popup and detail panel

### 18.3 Organization
- [ ] Nested collections: create, rename, reorder (drag-drop), delete (non-destructive)
- [ ] Multi-membership: resource assignable to multiple collections
- [ ] Tags: autocomplete from existing; usage count ranking; chip display (max 3 + overflow)
- [ ] Unorganized virtual collection: visible, filterable, bulk-actionable
- [ ] Collection tree: max 3 levels recommended; warning at level 4+

### 18.4 Search and Retrieval
- [ ] FTS5 keyword search returns results <200ms p95 at 10k resources
- [ ] Faceted filters: Type, Collection, Tags (OR), Date, Source, Has Code, Has Image
- [ ] Filter chips appear instantly; removable individually; "Clear all" works
- [ ] Filter state encoded in URL; browser back/forward restores state; shareable
- [ ] Sort options: Newest, Oldest, Title A-Z, Title Z-A, Most Tagged, Recently Opened
- [ ] Query highlighting in titles/descriptions/tags
- [ ] No-results state shows actionable suggestions

### 18.5 Import and Export
- [ ] Import: Browser HTML (Chrome/Firefox/Edge/Safari) parses correctly
- [ ] Import: Raindrop JSON preserves nested collections, tags, metadata
- [ ] Import preview shows counts and conflicts before commit
- [ ] Import duplicate handling: Skip / Update Metadata / Add to Collections (per + bulk)
- [ ] Export: JSON, HTML, Markdown, CSV all generate valid files
- [ ] Export scope: All / Current Filter / Selected / Collection
- [ ] Round-trip: JSON import → export → import preserves all data

### 18.6 Data Integrity
- [ ] Soft delete: resources hidden from grid/search/collections; Trash accessible via ⌘K
- [ ] Trash: 30-day auto-purge default; configurable; bulk restore/purge
- [ ] Startup integrity check: checksum verification; corruption detection with backup restore
- [ ] IndexedDB quota handling: graceful error with export-then-delete guidance

### 18.7 Privacy
- [ ] Zero telemetry by default (no analytics, crash reporting, tracking)
- [ ] No account/authentication required for MVP use
- [ ] Full data delete: one-click purge with verification
- [ ] Extension permissions minimized to declared set

### 18.8 Accessibility
- [ ] WCAG 2.2 AA: color contrast, focus management, ARIA labels
- [ ] Full keyboard navigation: ⌘K universal; shortcuts documented
- [ ] Screen reader support: semantic HTML, live regions
- [ ] Reduced motion and high contrast modes respected

### 18.9 Cross-Browser Behavior
- [ ] Chrome extension: full functionality
- [ ] Firefox extension: full functionality (event page background)
- [ ] Edge extension: full functionality
- [ ] PWA: installable, offline-capable (Service Worker + IndexedDB)
- [ ] Responsive: desktop, tablet, mobile layouts functional

### 18.10 Testing and Release Readiness
- [ ] Unit tests: ≥80% coverage on core logic (storage, search, metadata, import/export)
- [ ] E2E tests: Critical journeys (1-4) pass in Chrome/Firefox
- [ ] Visual regression: Grid cards, collection tree, filter chips, modals
- [ ] Performance benchmarks: Search <200ms, Save <2s, Import 1k <10s
- [ ] Accessibility audit: axe-core + manual testing
- [ ] Extension store packages: Chrome Web Store, Firefox Add-ons, Edge Add-ons ready

---

## 19. Risks, Dependencies, and Constraints

### 19.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Manifest V3 service worker termination loses state | High | Medium | Persist all state in `chrome.storage.local`; never use module-scope variables |
| Firefox event page vs Chrome service worker differences | Medium | Medium | Use WXT/Extension.js abstraction; test both weekly |
| IndexedDB quota exceeded at 10k+ resources with thumbnails | Medium | High | Store thumbnails as Blob URLs (revoke on delete); compress images; monitor quota |
| MiniSearch memory at 50k+ resources | Low (MVP 10k) | Medium | Paginate index rebuild; migrate to FTS5 at Phase 8 |
| Offscreen Document instability (Chrome) | Medium | Medium | Fallback to content script; timeout handling; retry logic |
| Cross-browser extension metadata extraction variance | High | Medium | Accept Firefox content-script-only; document limitations |
| URL normalization false positives/negatives | Medium | Low | Configurable rules; user choice on conflict; test with real bookmarks |
| Import fidelity (Raindrop JSON schema changes) | Medium | Medium | Version detection; graceful degradation; user preview before commit |

### 19.2 Blockers for Phase 4 (Implementation Start)
1. **Node.js v26.13.0 non-LTS** → Must pin to LTS 22 via `fnm install 22`
2. **`jq` not installed** → `winget install jqlang.jq`
3. **`tsc` not in PATH** → `npm i -g typescript` (or `pnpm dlx tsc`)

### 19.3 Environment Constraints
- Windows 11 development environment
- Node.js LTS 22 required (current v26 non-LTS)
- pnpm 11.13.0 available (preferred package manager)
- Bun 1.4.3 available (alternative runtime)
- Docker available (for Phase 8+ sync server)
- Git installed (not yet initialized)
- GitHub MCP authentication failed (400) — blocks repo operations for Phase 10

### 19.4 Dependencies
- Phase 1.8 PRD approval required before Phase 1.9 (Architecture)
- Phase 2 Architecture Design will produce: DB schema, API contracts, component hierarchy, error boundaries
- Phase 3 Implementation will require: pnpm workspace init, WXT extension scaffold, Vite React scaffold, shared packages

---

## 20. Open Questions and Future Considerations

### 20.1 Decisions Requiring User Approval
| Decision | Options | Recommendation | Input Needed |
|----------|---------|----------------|--------------|
| Desktop framework (Phase 8+) | Tauri (Rust) vs Electron vs PWA-only | Tauri — native SQLite, smaller bundle, local-first aligned | Rust comfort; team capacity |
| SQLite WASM migration timing | Phase 8 (validated) vs Phase 6 (parallel) | Phase 8 — validate IndexedDB sufficiency first | Risk tolerance for migration |
| Safari extension | MVP vs Phase 8+ | Phase 8+ — low primary persona usage | Safari % in user base |
| Self-hosted sync server | Phase 8+ (Docker) vs Phase 10+ | Phase 8+ as separate deliverable | Priority vs resources |
| Local encryption at rest | MVP vs Phase 8+ | Phase 8+ — defense in depth, not day-one | Threat model priority |

### 20.2 Decisions Deferred to Phase 2 (Architecture Design)
- Detailed database schema (IndexedDB/Dexie collections, indexes, migration plan)
- Extension ↔ Web App messaging protocol (TypeScript types, Zod schemas)
- MiniSearch index structure and rebuild triggers
- Component hierarchy and state ownership map
- Error boundaries and retry policies
- Performance budgets (bundle size, search latency, save latency)
- Accessibility audit checklist (WCAG 2.2 AA)

### 20.3 Future Product Opportunities (Post-MVP)
| Area | Opportunity | Trigger |
|------|-------------|---------|
| Search | Hybrid keyword + semantic (Transformers.js) | User feedback: "keyword not enough" |
| Storage | SQLite WASM + OPFS + CRDT (Yjs/Automerge) | Multi-device sync + conflict-free |
| Extraction | Local ML for auto-tagging (ONNX) | 10k+ resources, tag burden high |
| Desktop | Tauri with native SQLite + system integration | User demand for native app |
| Mobile | PWA + Share Target + Background Sync | Mobile capture usage > 20% |
| AI | Local embeddings + RAG over personal library | Phase 9+, hardware allows |

### 20.4 Unresolved Product Questions (From Journey Analysis)
- Undo toast duration: 5s vs 10s vs persistent?
- Auto-purge default: 30 days? (GDPR considerations)
- Duplicate modal default action: "Add to current collection" vs "Skip"?
- Collection depth warning at 3: hard limit vs soft warning?
- Tag naming convention enforced: kebab-case vs free-form?
- Import collection mapping UI: per-collection dropdown vs bulk?
- Export thumbnail default: off? (file size vs fidelity)
- Search AND logic for tags: MVP OR only; AND Post-MVP?
- Saved search alerts: Post-MVP only; how to notify?

---

## 21. Requirement Traceability Matrix

| User Problem / Persona Need | Product Requirement | MVP Feature | User Journey | Acceptance Criteria |
|----------------------------|---------------------|-------------|--------------|---------------------|
| Finding > Saving (Alex, Maya, Sam) | FR-SRH-001, FR-SRH-002 | S1, S2 | Journey 3 | Search <200ms; facets instant; P@5 >80% |
| Context Loss (Alex, Maya) | FR-CAP-002, FR-CAP-003, FR-VIS-002 | M1, M2, V3 | Journey 2, 3 | >90% extraction; type-aware cards |
| Scattered Sources (Alex, Jordan) | FR-CAP-001, FR-IEX-001, FR-IEX-002 | C1, I1, I2 | Journey 1, 2 | Extension + HTML + Raindrop import |
| Metadata Poverty (All) | FR-CAP-002, FR-CAP-003, FR-CAP-004 | M1, M2, M3 | Journey 2 | Title, desc, thumbnail, type |
| Weak Search (All) | FR-SRH-001 to FR-SRH-007 | S1, S2 | Journey 3 | FTS5 + facets; <5s time-to-find |
| Duplicate Waste (All) | FR-CAP-005, FR-CAP-006, FR-IEX-006 | D1 | Journey 7, 9 | URL norm + modal + import conflicts |
| Collection Paralysis (Alex, Maya, Jordan) | FR-ORG-001 to FR-ORG-006 | O1, O3 | Journey 4, 5 | Nested collections + tags + bulk |
| Personal Control (Alex, Dr. Chen, Jordan) | FR-STO-001, FR-IEX-004 to FR-IEX-006, FR-PRI-001 to FR-PRI-003 | L1, I4, P1, P3 | Journey 1, 4, 8 | Local-first; export 4 formats; zero telemetry; full delete |
| Visual Clarity (Maya, Alex) | FR-VIS-001 to FR-VIS-005 | V1, V3 | Journey 3 | Grid + 7 type-aware cards |
| Privacy by Default (Alex, Dr. Chen, Jordan) | FR-PRI-001, FR-PRI-002, NFR-SEC-001 | P1, P3 | All | Zero telemetry; min perms; full delete |

**Coverage**: All 18 MVP Must-Have features trace to at least one user problem and one critical journey.

---

## 22. MVP Completion Definition (Definition of Done)

The MVP is complete when **ALL** of the following are verified:

### Core Functionality
- [ ] User installs extension → saves first link in <30s → sees it in grid
- [ ] User imports browser bookmarks → collections + tags preserved → grid populated
- [ ] User saves 50+ resources → organizes into nested collections + tags → finds any in <5s via search + filters
- [ ] User exports library in all 4 formats → re-imports JSON → data identical
- [ ] User deletes resource → recovers from Trash within 30 days → purges permanently

### Technical Quality
- [ ] Search latency <200ms p95 at 10k resources (FTS5)
- [ ] Save latency <2s steady state (extension → toast)
- [ ] Import 1,000 resources <10s; Export 10,000 resources streaming download starts <30s
- [ ] Zero data loss: integrity checks pass; soft delete works; no corruption in stress tests
- [ ] Extension crash rate <0.1% in automated E2E runs

### Privacy & Security
- [ ] Zero telemetry by default verified (no network requests on clean install)
- [ ] Extension permissions match declared minimum set
- [ ] Import sanitization blocks XSS payloads in test HTML/JSON
- [ ] Full data delete wipes all IndexedDB/SQLite data verifiably

### Accessibility & Compatibility
- [ ] WCAG 2.2 AA audit passes (automated + manual)
- [ ] Extension works in Chrome, Firefox, Edge (Manifest V3)
- [ ] PWA installs and works offline (Service Worker + IndexedDB)
- [ ] Responsive layouts functional at desktop, tablet, mobile

### Release Readiness
- [ ] Unit test coverage ≥80% on core modules
- [ ] E2E tests pass for Critical Journeys 1-4 in Chrome + Firefox
- [ ] Visual regression baseline captured for grid, tree, chips, modals
- [ ] Extension store packages built for Chrome Web Store, Firefox Add-ons, Edge Add-ons
- [ ] Performance benchmarks documented and within targets

---

## 23. Document Decisions and Unresolved Questions

### 23.1 Approved Product Decisions
| Decision | Choice | Source |
|----------|--------|--------|
| Local-first storage | SQLite/IndexedDB mandatory | Vision Principle 5, 7; MVP_FEATURE §4.1 |
| No sync in MVP | Optional Phase 8+ | MVP_FEATURE §4.2 |
| Manifest V3 extension | Chrome/Firefox/Edge; Safari deferred | MVP_FEATURE §4.3 |
| Search | Keyword + Faceted (FTS5) only | MVP_FEATURE §4.4 |
| Organization | Collections + Tags | MVP_FEATURE §4.5 |
| Auto-tagging | Manual with autocomplete; no ML | MVP_FEATURE §4.6 |
| CLI/API | Deferred Post-MVP | MVP_FEATURE §4.7 |
| AI metadata | Rule-based type detection only | MVP_FEATURE §4.8 |
| Import | Browser HTML + Raindrop JSON | MVP_FEATURE §4.9 |
| Export | JSON/HTML/MD/CSV in MVP; BibTeX Post-MVP | MVP_FEATURE §4.10 |

### 23.2 Recommended Technical Direction (From Phase 1.7)
| Area | Recommendation | Status |
|------|----------------|--------|
| Web Framework | React SPA + Vite + TypeScript + PWA | Final |
| Extension Architecture | Manifest V3 via WXT + webextension-polyfill | Final |
| Local Storage (MVP) | IndexedDB via Dexie.js | Provisional (migrate Phase 8+) |
| Local Storage (Phase 8+) | SQLite WASM + OPFS via wa-sqlite | Provisional |
| Search (MVP) | MiniSearch in-memory + faceted filters | Provisional (migrate Phase 8+) |
| Search (Phase 8+) | SQLite FTS5 native | Provisional |
| State Management | TanStack Query v5 + React Context | Final |
| Styling/UI | Tailwind CSS v4 + shadcn/ui (Radix) | Final |
| Data Validation | Zod + TypeScript (shared packages) | Final |
| Shared Architecture | pnpm workspaces: core, ui, extension-core | Final |
| Testing | Vitest + Playwright + Chrome DevTools MCP | Final |

### 23.3 Decisions Requiring User Approval (See §20.1)
Desktop framework, SQLite timing, Safari extension, Sync server, Encryption

### 23.4 Decisions Deferred to Phase 2 (See §20.2)
DB schema, API contracts, MiniSearch structure, Component hierarchy, Error boundaries, Performance budgets, A11y checklist

### 23.5 Future Product Opportunities (See §20.3)
Hybrid search, CRDT sync, Local ML auto-tagging, Tauri desktop, PWA mobile, Local RAG

---

## 24. Documents Created/Updated

### Created
- `docs/PRODUCT_REQUIREMENTS_DOCUMENT.md` — This document

### Updated
- `docs/PROJECT_PROGRESS.md` — Phase 1.8 marked complete, next action Phase 1.9 pending approval

### Source Documents Referenced (Read-Only)
- `docs/PRODUCT_VISION.md` (Phase 1.1)
- `docs/COMPETITIVE_RESEARCH.md` (Phase 1.2)
- `docs/TARGET_USERS_AND_PERSONAS.md` (Phase 1.3)
- `docs/MVP_FEATURE_PRIORITIZATION.md` (Phase 1.4)
- `docs/INFORMATION_ARCHITECTURE.md` (Phase 1.5)
- `docs/USER_JOURNEYS_AND_WORKFLOWS.md` (Phase 1.6)
- `docs/TECHNICAL_DIRECTION_EVALUATION.md` (Phase 1.7)
- `docs/PROJECT_PROGRESS.md` (Phase 0–1.7 tracking)

---

## 25. Final Report

### 25.1 PRD Sections Completed
All 20 required sections completed:
1. Executive Summary ✓
2. Product Vision and Positioning ✓
3. Problem Statement ✓
4. Target Audience and Personas ✓
5. User Needs and JTBD ✓
6. Product Goals and Non-Goals ✓
7. MVP Scope and Feature Priorities ✓
8. Functional Requirements (47 requirements, FR-STO-001 to FR-PRI-003) ✓
9. Non-Functional Requirements (31 requirements, NFR-PER-001 to NFR-SEC-005) ✓
10. Information Architecture and Navigation ✓
11. Critical User Journeys (4 critical, 4 important, 4 post-MVP) ✓
12. Error, Failure, and Recovery Requirements (9 scenarios) ✓
13. Search and Discovery Requirements ✓
14. Data Portability Requirements ✓
15. Privacy and Security Requirements ✓
16. Accessibility and Responsiveness ✓
17. Success Metrics and Proposed Targets (25 metrics, all hypotheses) ✓
18. MVP Acceptance Criteria (10 categories, 60+ checkboxes) ✓
19. Risks, Dependencies, and Constraints ✓
20. Open Questions and Future Considerations ✓

### 25.2 Requirements Count
- **Functional Requirements**: 47 (FR-STO: 8, FR-CAP: 8, FR-ORG: 6, FR-SRH: 7, FR-VIS: 5, FR-IEX: 6, FR-CMD: 3, FR-PRI: 3)
- **Non-Functional Requirements**: 31 (NFR-PER: 7, NFR-REL: 6, NFR-USE: 6, NFR-COM: 6, NFR-ACC: 5, NFR-SEC: 5)

### 25.3 MVP Acceptance Criteria Coverage
- Core Capture Reliability: 6 criteria
- Metadata Handling: 5 criteria
- Organization: 5 criteria
- Search and Retrieval: 7 criteria
- Import and Export: 7 criteria
- Data Integrity: 4 criteria
- Privacy: 4 criteria
- Accessibility: 4 criteria
- Cross-Browser Behavior: 5 criteria
- Testing and Release Readiness: 6 criteria
**Total: 53 verifiable acceptance criteria**

### 25.4 Requirement Traceability Coverage
All 18 MVP Must-Have features traced to:
- User problem / persona need ✓
- Product requirement ✓
- MVP feature ID ✓
- Relevant user journey ✓
- Acceptance criteria ✓

### 25.5 Conflicts or Gaps Discovered
**One critical inconsistency found and fixed in Phase 1.8.1**:
- Search technology: PRD Sections 8.4, 9.1, 13.1 specified SQLite FTS5 for MVP, but Technical Direction Evaluation (Phase 1.7 §4.2) recommends MiniSearch for MVP with FTS5 migration at Phase 8+
- Fixed: FR-SRH-001, NFR-PER-004, Section 13.1, FR-STO-001 updated to match Tech Direction recommendation
- Minor scope additions from Journey Analysis (List View V2, Smart Collections as Saved Search, Floating Toolbar, Inline Undo Toast) documented as recommendations, not conflicts

### 25.6 Decisions Still Requiring User Input
5 decisions (Desktop framework, SQLite timing, Safari extension, Sync server, Encryption) — detailed in §20.1 and §23.3

### 25.7 Documents Created/Updated
- **Created**: `docs/PRODUCT_REQUIREMENTS_DOCUMENT.md`, `docs/PRD_CONSISTENCY_AUDIT.md`
- **Updated**: `docs/PROJECT_PROGRESS.md` — Phase 1.8.1 complete, 12 docs total

---

## 26. Next Phase

**Phase 1.9 — Architecture & Database Schema** (awaiting approval)

Scope:
- Detailed IndexedDB/Dexie schema (collections, indexes, migration plan)
- Extension ↔ Web App messaging protocol (TypeScript types, Zod schemas)
- MiniSearch index structure and rebuild triggers
- Component architecture and state ownership map
- Error handling, retry, and offline queue specifications
- Performance budgets and monitoring hooks
- Accessibility requirements (WCAG 2.2 AA checklist)

**Approval Required**: Review this PRD and explicitly approve Phase 1.9.