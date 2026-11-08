# MVP Feature Prioritization — Fluid Deck

*Generated: 2026-11-07 | Based on: Product Vision + Competitive Research + Target Users | Phase: 1.4*

---

## 1. Candidate Feature Discovery

Identified **52 candidate features** across 14 categories:

### Capture & Saving (5)
| ID | Feature | Description |
|----|---------|-------------|
| C1 | Browser extension (Manifest V3) | One-click save from Chrome/Firefox/Edge/Safari |
| C2 | CLI capture tool | Save from terminal (npm packages, GitHub URLs, API endpoints) |
| C3 | REST API | Programmatic save for integrations, Raycast/Alfred plugins |
| C4 | Mobile share target | Save from iOS/Android share sheet |
| C5 | Desktop global shortcut | System-wide hotkey for instant capture |

### Automatic Metadata Extraction (5)
| ID | Feature | Description |
|----|---------|-------------|
| M1 | Title/URL/description extraction | Standard OG/meta tag parsing |
| M2 | Thumbnail/image extraction | Favicon, OG image, screenshot fallback |
| M3 | Type detection | Article, video, GitHub repo, npm package, PDF, design file, tool |
| M4 | Auto-tagging (local ML) | Topic classification, tech stack detection, content categorization |
| M5 | Code-aware extraction | GitHub stars/topics/language, npm metadata, code snippets, headings |

### Organization & Collections (4)
| ID | Feature | Description |
|----|---------|-------------|
| O1 | Nested collections | Hierarchical folders with drag-drop |
| O2 | Smart collections (saved searches) | Dynamic views based on query (type:repo AND tag:react) |
| O3 | Tags with autocomplete | Free-form tags + suggested from existing |
| O4 | PARA-compatible structure | Projects, Areas, Resources, Archives preset |

### Search & Retrieval (6)
| ID | Feature | Description |
|----|---------|-------------|
| S1 | Keyword search (SQLite FTS5) | Title, URL, description, tags, full-text |
| S2 | Faceted filters | Type, topic, date, source, collection, has-code |
| S3 | Semantic search (local embeddings) | Meaning-based: "React form library" finds "React Hook Form" |
| S4 | Visual similarity search | Perceptual hash: "show me cards like this one" |
| S5 | Saved searches | Persistent named queries with alerts |
| S6 | Search analytics | Click-through tracking for relevance tuning |

### Visual Browsing & Previews (5)
| ID | Feature | Description |
|----|---------|-------------|
| V1 | Grid view (thumbnail cards) | Masonry/grid with type-aware rendering |
| V2 | List view (dense) | Compact list for power scanning |
| V3 | Type-aware card rendering | Repo cards ≠ Article cards ≠ Design cards ≠ Tool cards |
| V4 | Rich preview modal | Instant article/video/readme preview without leaving |
| V5 | Reader mode | Distraction-free reading with progress sync |

### Duplicate Detection (3)
| ID | Feature | Description |
|----|---------|-------------|
| D1 | URL normalization | Canonicalize (strip UTM, www, trailing slash, fragments) |
| D2 | Perceptual hash (pHash) | Visual duplicate detection for screenshots/images |
| D3 | Cross-source dedup | Detect same resource saved from GitHub + browser + API |

### Import & Export (5)
| ID | Feature | Description |
|----|---------|-------------|
| I1 | Import: HTML (browser bookmarks) | Chrome/Firefox/Edge/Safari HTML export |
| I2 | Import: Raindrop.io JSON | Full fidelity including collections/tags |
| I3 | Import: Pocket/Pinboard | Major competitor formats |
| I4 | Export: JSON/HTML/Markdown/CSV | Full data portability |
| I5 | Export: BibTeX | Citation export for researchers |

### Browser Extension (3)
| ID | Feature | Description |
|----|---------|-------------|
| B1 | Manifest V3 extension | Chrome/Firefox/Edge/Safari |
| B2 | Context menu save | Right-click → "Save to Fluid Deck" |
| B3 | Page action popup | Preview metadata before save, edit tags/collection |

### AI-Assisted Organization (4)
| ID | Feature | Description |
|----|---------|-------------|
| A1 | Local auto-tagging (ONNX/Transformers.js) | Topic classification without cloud |
| A2 | Smart collection suggestions | "You have 12 React items — create collection?" |
| A3 | Local AI summaries | 2-3 sentence summary per card (Phase 8+) |
| A4 | Background digest agents | Weekly "new this week" email/notification (Phase 8+) |

### Local-First Storage & Sync (5)
| ID | Feature | Description |
|----|---------|-------------|
| L1 | SQLite (Node) / IndexedDB (browser) | Local-first persistence |
| L2 | Optional encrypted sync | End-to-end encrypted, user controls keys |
| L3 | Self-hosted sync server (Docker) | User runs own sync infrastructure |
| L4 | Conflict resolution UI | Merge/keep-both/choose for sync conflicts |
| L5 | Offline-first (Service Worker + IndexedDB) | Full read/write offline |

### Keyboard & Power User UX (3)
| ID | Feature | Description |
|----|---------|-------------|
| K1 | Command palette (⌘K) | Global search, actions, navigation |
| K2 | Vim-style navigation | j/k, gg, G, / for search |
| K3 | Bulk actions | Multi-select → tag, move, delete, export |

### Developer-Focused Capture (4)
| ID | Feature | Description |
|----|---------|-------------|
| DEV1 | GitHub stars sync | Import starred repos with metadata |
| DEV2 | npm package capture | `fd save npm:package-name` |
| DEV3 | Code snippet extraction | Save code blocks from articles/docs |
| DEV4 | API docs deep linking | Save specific API endpoint sections |

### Privacy, Security, Data Ownership (3)
| ID | Feature | Description |
|----|---------|-------------|
| P1 | Zero telemetry by default | No tracking unless explicitly opted in |
| P2 | Local encryption at rest | SQLCipher / IndexedDB encryption |
| P3 | Full data delete | One-click purge with verification |

---

## 2. Evaluation & Prioritization (MoSCoW + Impact/Effort)

### Evaluation Criteria
- **User Problem Severity** (1-5): How directly does this solve a top-6 problem?
- **Frequency** (1-5): Daily vs weekly vs occasional use
- **Primary Persona Value** (1-5): Alex + Maya + Sam weight
- **Differentiation** (1-5): Unique vs commodity
- **Implementation Complexity** (1-5): 1=trivial, 5=major R&D
- **Technical Risk** (1-5): Unknowns, dependencies, failure modes
- **Dependencies** (count): Blocking features required first

### Scoring (Higher = More MVP-Critical)
`MVP Score = (Severity + Frequency + Persona + Differentiation) - (Complexity + Risk + Dependencies)`

---

### Must-Have (MVP) — Score ≥ 12

| ID | Feature | Sev | Freq | Persona | Diff | Complex | Risk | Deps | Score | Rationale |
|----|---------|-----|------|---------|------|---------|------|------|-------|-----------|
| L1 | SQLite/IndexedDB local storage | 5 | 5 | 5 | 4 | 2 | 1 | 0 | **16** | Foundation for everything; hard constraint from vision |
| C1 | Browser extension (MV3) | 5 | 5 | 5 | 3 | 2 | 1 | L1 | **15** | Primary capture surface; table stakes |
| M1 | Title/URL/description extraction | 5 | 5 | 5 | 2 | 1 | 1 | C1 | **15** | Core metadata; zero-cost with extension |
| M2 | Thumbnail/image extraction | 4 | 5 | 5 | 3 | 2 | 1 | C1 | **14** | Visual clarity principle; enables grid view |
| M3 | Type detection | 5 | 5 | 5 | 4 | 2 | 1 | M1 | **14** | Enables type-aware cards, smart filters |
| O1 | Nested collections | 5 | 5 | 4 | 2 | 1 | 1 | L1 | **14** | Primary org model; solves folder paralysis |
| S1 | Keyword search (FTS5) | 5 | 5 | 5 | 2 | 2 | 1 | L1 | **14** | Solves "finding > saving" core problem |
| S2 | Faceted filters | 5 | 4 | 5 | 3 | 2 | 1 | S1 | **14** | Precision retrieval; differentiates from browser |
| V1 | Grid view (type-aware) | 5 | 5 | 5 | 4 | 2 | 1 | M3 | **14** | Visual clarity principle; primary browse mode |
| V3 | Type-aware card rendering | 5 | 5 | 5 | 4 | 2 | 1 | M3 | **14** | Alex (repos), Maya (design), Sam (tools) need diff cards |
| D1 | URL normalization dedup | 5 | 4 | 4 | 3 | 1 | 1 | C1 | **13** | Prevents duplicate waste at save time |
| I1 | Import: HTML (browser) | 4 | 3 | 5 | 3 | 2 | 1 | L1 | **12** | Lowers switching cost for primary personas |
| I2 | Import: Raindrop JSON | 4 | 3 | 5 | 4 | 2 | 1 | L1 | **12** | Strongest incumbent import; high switcher value |
| I4 | Export: JSON/HTML/MD/CSV | 5 | 2 | 5 | 5 | 1 | 1 | L1 | **15** | Personal control principle; portability mandate |
| K1 | Command palette (⌘K) | 4 | 5 | 5 | 4 | 2 | 1 | V1 | **15** | Power user UX; differentiates from basic tools |
| B1 | Manifest V3 extension | 5 | 5 | 5 | 3 | 2 | 1 | L1 | **15** | Required for C1; cross-browser target |
| B2 | Context menu save | 4 | 4 | 5 | 2 | 1 | 1 | B1 | **13** | Effortless capture principle |
| B3 | Page action popup | 4 | 4 | 4 | 3 | 2 | 1 | B1 | **11** | Edit before save; context preservation |

---

### Should-Have (Post-MVP) — Score 8-11

| ID | Feature | Sev | Freq | Persona | Diff | Complex | Risk | Deps | Score | Rationale |
|----|---------|-----|------|---------|------|---------|------|------|-------|-----------|
| C2 | CLI capture tool | 4 | 4 | 5 | 5 | 2 | 1 | L1, API | **13** | Alex/Sam high value; but needs API first |
| C3 | REST API | 4 | 3 | 5 | 4 | 3 | 2 | L1 | **11** | Enables CLI, Raycast, integrations |
| M4 | Auto-tagging (local ML) | 4 | 4 | 4 | 5 | 4 | 3 | L1, M3 | **10** | Intelligent org principle; but R&D risk |
| M5 | Code-aware extraction | 4 | 4 | 5 | 5 | 3 | 2 | M3 | **13** | Alex/Sam killer feature; moderate complexity |
| O2 | Smart collections | 4 | 4 | 4 | 4 | 2 | 1 | O1, S2 | **11** | Dynamic views; prevents database rot |
| O3 | Tags with autocomplete | 4 | 4 | 4 | 2 | 1 | 1 | O1 | **12** | Flexible org; low complexity |
| O4 | PARA preset | 3 | 3 | 3 | 2 | 1 | 1 | O1 | **9** | Jordan persona; nice preset |
| S3 | Semantic search (local) | 5 | 4 | 4 | 5 | 5 | 4 | L1, S1 | **9** | Major differentiator; but high R&D risk |
| S4 | Visual similarity search | 3 | 3 | 4 | 4 | 4 | 3 | V1, D2 | **7** | Defer — low frequency, high complexity |
| S5 | Saved searches | 3 | 3 | 4 | 2 | 1 | 1 | S2 | **10** | Power user feature; low cost |
| S6 | Search analytics | 2 | 2 | 2 | 2 | 2 | 1 | S1 | **5** | Internal tooling; defer |
| V2 | List view (dense) | 3 | 4 | 4 | 2 | 1 | 1 | V1 | **11** | Alex/Maya want dense scanning |
| V4 | Rich preview modal | 4 | 3 | 4 | 3 | 2 | 2 | V1 | **10** | Instant preview; needs content fetch |
| V5 | Reader mode | 4 | 3 | 4 | 3 | 3 | 2 | V4 | **9** | Researchers/developers; builds on V4 |
| D2 | Perceptual hash dedup | 3 | 3 | 3 | 4 | 4 | 3 | V1 | **6** | Defer — visual dedup is nice-to-have |
| D3 | Cross-source dedup | 3 | 3 | 4 | 3 | 3 | 2 | D1, I1, I2 | **8** | Defer — requires multiple importers |
| I3 | Import: Pocket/Pinboard | 3 | 2 | 3 | 3 | 2 | 1 | L1 | **8** | Lower priority than Raindrop/browser |
| I5 | Export: BibTeX | 3 | 2 | 3 | 4 | 1 | 1 | L1, I4 | **10** | Dr. Chen gate; low cost once export works |
| C4 | Mobile share target | 4 | 3 | 4 | 3 | 3 | 2 | PWA | **9** | Maya/Designers need; requires PWA |
| C5 | Desktop global shortcut | 3 | 3 | 4 | 3 | 2 | 1 | Native app | **10** | Raycast/Alfred covers 80% |
| A1 | Local auto-tagging | 4 | 4 | 4 | 5 | 4 | 3 | M4 | **10** | Same as M4; bundled |
| A2 | Smart collection suggestions | 3 | 2 | 3 | 3 | 2 | 1 | O2, M4 | **8** | Assistive; defer |
| K2 | Vim navigation | 2 | 3 | 4 | 2 | 1 | 1 | K1 | **9** | Niche power user; low cost |
| K3 | Bulk actions | 3 | 3 | 4 | 2 | 2 | 1 | O1, V1 | **9** | Manage at scale; moderate value |
| DEV1 | GitHub stars sync | 4 | 3 | 5 | 4 | 3 | 2 | API, I2 | **11** | Alex high value; auth complexity |
| DEV2 | npm capture | 3 | 2 | 4 | 4 | 2 | 1 | C2, C3 | **10** | Sam/Alex; needs CLI |
| DEV3 | Code snippet extraction | 3 | 3 | 4 | 4 | 3 | 2 | M5 | **9** | Nice-to-have; parsing complexity |
| DEV4 | API docs deep link | 2 | 2 | 3 | 3 | 3 | 2 | M5 | **5** | Too specific for MVP |
| L2 | Optional encrypted sync | 4 | 4 | 5 | 4 | 4 | 3 | L1 | **10** | Core differentiator; but Phase 8 scope |
| L3 | Self-hosted sync server | 3 | 2 | 3 | 4 | 4 | 3 | L2 | **5** | Separate Docker image; not core app |
| L4 | Conflict resolution UI | 3 | 2 | 3 | 3 | 3 | 2 | L2 | **6** | Only needed with sync |
| L5 | Offline-first (SW) | 4 | 3 | 4 | 3 | 3 | 2 | L1 | **9** | PWA requirement; defer to Phase 8 |
| P1 | Zero telemetry | 4 | 1 | 5 | 5 | 1 | 1 | — | **13** | Privacy principle; easy win |
| P2 | Local encryption at rest | 3 | 2 | 4 | 4 | 3 | 2 | L1 | **8** | Defense in depth; not day-one critical |
| P3 | Full data delete | 3 | 1 | 4 | 4 | 1 | 1 | L1 | **10** | GDPR/privacy; low cost |

---

### Future / Experimental — Score < 8 or High Uncertainty

| ID | Feature | Reason for Deferral |
|----|---------|---------------------|
| A3 | Local AI summaries | Requires viable local LLM; Phase 8+ after embeddings proven |
| A4 | Background digest agents | Needs scheduling infra; low frequency; Phase 8+ |
| S4 | Visual similarity search | pHash collision risk at scale; unproven user value |
| C4 | Mobile share target | Requires PWA + native manifest; Phase 8 |
| C5 | Desktop global shortcut | Native app or Raycast plugin covers; not core |
| L3 | Self-hosted sync server | Separate product; Docker image Phase 9+ |
| L5 | Offline-first SW | Service worker complexity; PWA Phase 8 |
| DEV4 | API docs deep link | Too narrow; generic snippet capture covers |
| S6 | Search analytics | Internal; no user-facing value |
| P2 | Local encryption | SQLCipher adds bundle size; evaluate need post-MVP |

---

## 3. MVP Feature Specifications (Must-Have)

### L1 — SQLite/IndexedDB Local Storage
- **What**: Local-first persistence layer. SQLite (Node/Electron/Tauri) or IndexedDB (PWA). Schema: resources, collections, tags, saved_searches, sync_metadata.
- **Problem**: Personal control (Principle 5), no vendor lock-in, privacy by default (Principle 7)
- **Persona**: Alex (company policy), Dr. Chen (privacy), Jordan (local-first)
- **Why MVP**: Hard constraint from vision; all other features depend on it
- **Dependencies**: None (foundation)
- **Risks**: Cross-platform SQLite (sql.js vs native), IndexedDB quota limits

### C1 + B1 + B2 + B3 — Browser Extension (Manifest V3)
- **What**: Cross-browser extension (Chrome, Firefox, Edge, Safari). Service worker background. Popup for preview/edit. Context menu. Keyboard shortcut.
- **Problem**: Effortless capture (Principle 1), scattered sources (Problem 3)
- **Persona**: All — primary capture surface
- **Why MVP**: Table stakes; without it, no browser capture
- **Dependencies**: L1 (storage), M1-M3 (metadata)
- **Risks**: Manifest V3 service worker limits (no persistent background), Safari extension distribution complexity

### M1 + M2 + M3 — Core Metadata Extraction
- **What**: Title, URL, description, canonical URL, thumbnail/favicon/OG image, type classification (article, video, github, npm, pdf, design, tool, other)
- **Problem**: Metadata poverty (Problem 4), context loss (Problem 2)
- **Persona**: All — enables everything downstream
- **Why MVP**: Zero marginal cost with extension; enables type-aware cards, smart filters
- **Dependencies**: C1 (capture surface)
- **Risks**: Dynamic content (SPA), paywall/blocked content, type classification accuracy

### O1 + O3 — Nested Collections + Tags
- **What**: Hierarchical collections with drag-drop reorder. Free-form tags with autocomplete from existing. Collection-tree sidebar + tag cloud/filter.
- **Problem**: Collection paralysis (Problem 6), folder overload (Frustration)
- **Persona**: Alex (tech stacks), Maya (pattern types), Jordan (PARA)
- **Why MVP**: Primary organization model; solves folder paralysis with flexible hierarchy
- **Dependencies**: L1 (storage), M3 (type for smart defaults)
- **Risks**: Deep nesting UX, tag explosion without management

### S1 + S2 — Keyword Search + Faceted Filters
- **What**: SQLite FTS5 virtual table for full-text search (title, URL, description, tags, extracted content). Facets: type, collection, tags, date range, source, has-code, has-image.
- **Problem**: Finding > Saving (Problem 1), Weak search (Problem 5)
- **Persona**: All — core retrieval mechanism
- **Why MVP**: Solves primary problem; differentiates from browser bookmarks
- **Dependencies**: L1 (storage), M1-M3 (searchable fields), O1/O3 (filter dimensions)
- **Risks**: FTS5 performance at 10k+ items, Unicode/tokenization edge cases

### V1 + V3 — Grid View + Type-Aware Cards
- **What**: Masonry/grid layout. Card variants: GitHub repo (stars, language, license), Article (read time, source), Design (colors, dimensions), Tool (pricing, category), Video (duration, platform), PDF (pages, size).
- **Problem**: Visual clarity (Principle 4), scan don't read
- **Persona**: Maya (visual first), Alex (repo cards), Sam (tool cards), Dr. Chen (paper cards)
- **Why MVP**: Primary browse mode; major differentiator vs text-only tools
- **Dependencies**: M3 (type detection), M2 (thumbnails), L1/O1 (data)
- **Risks**: Card variant explosion, image loading performance, responsive breakpoints

### D1 — URL Normalization Duplicate Detection
- **What**: Canonicalize at save: strip UTM params, normalize www, remove fragments, decode punycode, sort query params. Check existing before insert.
- **Problem**: Duplicate waste (Problem 6), Chrome drag-dupe bug
- **Persona**: All — prevents library rot
- **Why MVP**: Prevents problem at source; zero UI cost
- **Dependencies**: C1 (capture), L1 (storage)
- **Risks**: False positives (different pages same canonical URL), legitimate UTM tracking needs

### I1 + I2 + I4 — Import (HTML, Raindrop) + Export (JSON/HTML/MD/CSV)
- **What**: Parse browser HTML bookmarks export. Parse Raindrop JSON export (collections, tags, metadata). Export full library to all formats with fidelity.
- **Problem**: Walled garden (Frustration), switching cost, personal control (Principle 5)
- **Persona**: Alex (GitHub+Raindrop), Maya (Pinterest→Raindrop→Fluid), Jordan (4-tool ecosystem)
- **Why MVP**: Lowers adoption barrier; export is non-negotiable for personal control
- **Dependencies**: L1 (storage), O1/O3 (org model)
- **Risks**: Raindrop JSON schema changes, HTML export variations across browsers, tag/collection mapping fidelity

### K1 — Command Palette (⌘K)
- **What**: Global command palette: search resources, create collection, navigate, bulk actions, settings. Fuzzy search. Keyboard-first.
- **Problem**: Power user efficiency, folder paralysis (fast navigation)
- **Persona**: Alex (Raycast user), Maya, Jordan
- **Why MVP**: Differentiates from basic tools; power user expectation
- **Dependencies**: V1 (navigation target), S1 (search backend), O1 (actions)
- **Risks**: Command explosion, discoverability vs clutter

### P1 — Zero Telemetry by Default
- **What**: No analytics, crash reporting, or usage tracking unless user explicitly opts in. Clear privacy policy.
- **Problem**: Privacy by default (Principle 7), personal control
- **Persona**: Alex (company policy), Dr. Chen, Jordan
- **Why MVP**: Principle alignment; trust signal; trivial implementation
- **Dependencies**: None
- **Risks**: None — pure policy/code omission

---

## 4. Key Product Decisions

### 4.1 Local-First vs Cloud-First
| Aspect | Local-First (Chosen) | Cloud-First |
|--------|---------------------|-------------|
| **Data sovereignty** | User owns data | Vendor owns data |
| **Privacy** | Default | Opt-in at best |
| **Offline** | Native | Requires sync |
| **Sync complexity** | Optional layer | Core architecture |
| **Architecture** | SQLite/IndexedDB first | Distributed DB first |
| **Cost** | Near-zero marginal | Ongoing infrastructure |

**MVP Recommendation**: **Local-first**. Hard constraint from vision (Principle 5, 7). Cloud sync as optional Layer 2 (L2).

**Missing Validation**: User willingness to self-manage backups; "local-first" comprehension in mainstream users.

---

### 4.2 Optional Synchronization
| Option | Pros | Cons |
|--------|------|------|
| **No sync (MVP)** | Simpler; ships faster; true local-first | Multi-device users blocked |
| **Cloud sync (built-in)** | Seamless; competitive parity | Infrastructure cost; privacy concerns; vendor lock-in |
| **Optional encrypted sync (Post-MVP)** | User controls keys; self-hostable; privacy-preserving | Complex conflict resolution; delayed value |

**MVP Recommendation**: **No sync in MVP**. Build L1 solid. Optional encrypted sync (L2) as Phase 8+ feature with self-hosted Docker option (L3).

**Missing Validation**: How many primary users actually need multi-device vs single-machine?

---

### 4.3 Browser Extension vs Web-Only Capture
| Option | Pros | Cons |
|--------|------|------|
| **Extension (Chosen)** | Native UX; context menu; page access; offline capture | Manifest V3 complexity; store review; cross-browser maintenance |
| **Web-only + bookmarklet** | Zero install; universal | No page metadata access; no context menu; poor mobile |
| **PWA share target only** | Mobile native | No desktop browser capture |

**MVP Recommendation**: **Manifest V3 extension (Chrome/Firefox/Edge)**. Safari deferred (different bundle). Bookmarklet as fallback.

**Missing Validation**: Safari user % in primary personas; Manifest V3 service worker reliability for capture.

---

### 4.4 Keyword Search vs Hybrid Search
| Option | Pros | Cons |
|--------|------|------|
| **Keyword only (MVP - FTS5)** | Proven; fast; zero ML risk; works offline | No semantic understanding |
| **Hybrid (Post-MVP)** | "React form lib" finds "React Hook Form"; major differentiator | Local embedding model R&D; performance; bundle size |
| **Cloud semantic** | Better quality; no local compute | Privacy violation; cost; offline broken |

**MVP Recommendation**: **Keyword + Faceted (FTS5) only**. Semantic search (S3) as Phase 8 experiment with Transformers.js/ONNX. Do not block MVP on unproven local embeddings.

**Missing Validation**: Local embedding model (BGE/E5/MiniLM) performance in browser/Node at 10k docs; user-perceived value vs keyword+filters.

---

### 4.5 Folders vs Tags vs Collections
| Model | Pros | Cons |
|-------|------|------|
| **Folders only (Browser)** | Simple mental model | Rigid; single parent; scales poorly |
| **Tags only (mymind)** | Flexible; multi-facet | No hierarchy; discovery hard; "tag soup" |
| **Collections + Tags (Chosen)** | Hierarchy + flexibility; saved searches as dynamic collections | Slightly more complex UI |

**MVP Recommendation**: **Nested Collections + Tags**. Collections = hierarchy (folders done right). Tags = cross-cutting facets. Smart Collections (O2) = saved searches as first-class collections (Post-MVP).

**Missing Validation**: Card sort with 20+ users; observed behavior in prototype.

---

### 4.6 Automatic Tagging vs User-Controlled Organization
| Approach | Pros | Cons |
|----------|------|------|
| **Full auto (mymind)** | Zero effort; serendipity | Opaque; no control; walled garden; errors unfixable |
| **Suggestions only (Raindrop)** | User control; low risk | Manual review needed; not "intelligent" |
| **Hybrid (Chosen)** | Auto-suggest at save; user accepts/edits; manual always available; local model | Requires local ML (M4) — Post-MVP |

**MVP Recommendation**: **Manual tags with autocomplete (O3)**. No auto-tagging in MVP. Local auto-tagging (M4/A1) as Phase 8 experiment — user must be able to disable/override completely.

**Missing Validation**: User trust in auto-tags; correction workload vs manual tagging.

---

### 4.7 CLI/API Capture for Developers
| Option | Pros | Cons |
|--------|------|------|
| **None (MVP)** | Simpler; extension covers 90% | Misses terminal workflow (Alex, Sam) |
| **CLI only (Post-MVP)** | `fd save <url>`; terminal-native | Needs API; auth; separate distribution |
| **REST API (Post-MVP)** | Enables CLI, Raycast, plugins, integrations | Auth design; rate limits; versioning |

**MVP Recommendation**: **Defer to Post-MVP**. Extension + context menu covers browser capture. CLI/API (C2, C3) as Phase 5+ after core library is solid. Raycast/Alfred plugins can use API.

**Missing Validation**: Terminal discovery frequency for Alex/Sam; CLI adoption vs extension.

---

### 4.8 AI-Assisted Metadata & Discovery
| Feature | MVP | Post-MVP | Future |
|---------|-----|----------|--------|
| Type detection (M3) | ✅ Rule-based | — | — |
| Auto-tags (M4/A1) | ❌ | ✅ Local ML | — |
| Semantic search (S3) | ❌ | ✅ Experiment | — |
| AI summaries (A3) | ❌ | ❌ | ✅ Phase 9+ |
| Digest agents (A4) | ❌ | ❌ | ✅ Phase 9+ |

**MVP Recommendation**: **Rule-based type detection only**. No ML in MVP. All AI features deferred with clear "local-first" constraint if added later.

**Missing Validation**: Local model quality threshold for user acceptance; compute/battery cost on laptop.

---

### 4.9 Import from Raindrop & Browser Bookmarks
| Source | Priority | Effort | Value |
|--------|----------|--------|-------|
| Browser HTML | MVP (I1) | Low | Universal; every user has |
| Raindrop JSON | MVP (I2) | Medium | Strongest incumbent; high switcher overlap |
| Pocket | Post-MVP (I3) | Medium | Declining user base |
| Pinboard | Post-MVP (I3) | Medium | Niche; loyal users |
| Zotero | Future | High | Dr. Chen gate; complex schema |
| Notion | Future | High | Manual anyway; API rate limits |

**MVP Recommendation**: **Browser HTML + Raindrop JSON only**. Covers 80% of switchers. Pocket/Pinboard as Post-MVP.

**Missing Validation**: Raindrop JSON schema stability; import fidelity user satisfaction.

---

### 4.10 Export & Data Portability
| Format | MVP | Purpose |
|--------|-----|---------|
| JSON | ✅ | Full fidelity backup/migration |
| HTML | ✅ | Browser import; human-readable |
| Markdown | ✅ | Obsidian/Notion/Logseq import |
| CSV | ✅ | Spreadsheet analysis; tag audit |
| BibTeX | Post-MVP | Dr. Chen citation workflow |

**MVP Recommendation**: **All four (JSON/HTML/MD/CSV) in MVP**. BibTeX as Post-MVP (I5). Export must be lossless for core fields.

**Missing Validation**: Round-trip fidelity (export→import) for each format; Obsidian/Notion Markdown compatibility.

---

## 5. MVP Boundaries

### Explicitly INCLUDED (Must-Have)
| Category | Features |
|----------|----------|
| Storage | SQLite (Node) / IndexedDB (PWA) — local-first |
| Capture | Browser extension (MV3, Chrome/Firefox/Edge) + context menu + popup |
| Metadata | Title, URL, description, thumbnail, type detection (rule-based) |
| Organization | Nested collections (drag-drop), tags with autocomplete |
| Search | FTS5 keyword + faceted filters (type, collection, tags, date, source) |
| Visual | Grid view with type-aware cards (repo, article, design, tool, video, PDF, other) |
| Dedup | URL normalization at save |
| Import | Browser HTML, Raindrop JSON |
| Export | JSON, HTML, Markdown, CSV |
| Power UX | Command palette (⌘K), keyboard navigation |
| Privacy | Zero telemetry, local-only, full delete |

### Explicitly EXCLUDED (Not in MVP)
| Category | Features | Reason |
|----------|----------|--------|
| Sync | Cloud sync, self-hosted server, conflict UI | Optional layer; Phase 8+ |
| AI/ML | Auto-tagging, semantic search, summaries, digest agents | Unproven local quality; R&D risk |
| Mobile | PWA share target, native apps | Extension + PWA later; Phase 8+ |
| Capture | CLI, REST API, desktop shortcut, mobile share | Post-MVP; extension covers 90% |
| Advanced org | Smart collections, PARA preset, tag management UI | Post-MVP |
| Advanced search | Visual similarity, saved searches, analytics | Low frequency / high complexity |
| Advanced visual | List view, rich preview modal, reader mode | Post-MVP |
| Advanced dedup | Perceptual hash, cross-source | Post-MVP |
| Dev capture | GitHub stars sync, npm capture, snippets, API deep-link | Post-MVP |
| Import | Pocket, Pinboard, Zotero, Notion | Lower priority |
| Export | BibTeX | Researcher gate; Post-MVP |
| Security | Local encryption at rest | Defense in depth; not day-one |

### Postponed (Evaluated, Not Rejected)
All "Should-Have" and "Future" features above — revisited after MVP user feedback.

### Complexity Traps Avoided
- ❌ Vector database (Chroma, Pinecone, etc.) — semantic search deferred
- ❌ Complex AI pipeline (embedding → index → query) — not in MVP
- ❌ Multi-device sync (CRDT, conflict resolution) — optional layer
- ❌ Collaboration (auth, perms, realtime) — out of scope per vision
- ❌ Native mobile apps (iOS/Android) — PWA + share target covers 80%
- ❌ Self-hosted infrastructure (Docker, k8s) — separate deliverable
- ❌ Web archive (permanent page copies) — storage cost; Raindrop Pro does
- ❌ RSS/feed reader — separate product category

### Smallest Coherent Product
A user can:
1. Install extension → save links from browser
2. See them in visual grid with rich cards
3. Organize into collections + tags
4. Find instantly via search + filters
5. Import existing bookmarks (browser/Raindrop)
6. Export anytime in 4 formats
7. All data lives locally — no account, no cloud, no tracking

This is a **complete, usable personal library** — not a demo.

---

## 6. MVP Success Criteria (Hypotheses)

### Product Usability Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Time to first save | < 30 sec (install → save) | Extension onboarding funnel | Hypothesis |
| Time to save (steady) | < 2 sec | Click → toast confirm | Hypothesis |
| Time to find | < 5 sec | Query → click result | Hypothesis |
| Command palette adoption | > 60% of sessions | ⌘K usage / session | Hypothesis |
| Zero-error onboarding | > 95% | Install → first save success | Hypothesis |

### Capture & Organization Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Metadata extraction rate | > 90% | Auto-fields populated / saves | Hypothesis |
| Type detection accuracy | > 95% | Manual audit sample | Hypothesis |
| Duplicate detection rate | > 95% | Detected / actual duplicates | Hypothesis |
| Collection creation rate | > 1 per 20 saves | Collections / resources | Hypothesis |
| Tag usage | > 3 tags/resource avg | Tags / resources | Hypothesis |

### Retrieval Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Search relevance (P@5) | > 80% | Click-through on top 5 | Hypothesis |
| Faceted filter usage | > 40% of searches | Filter clicks / searches | Hypothesis |
| Zero-result rate | < 10% | Empty results / queries | Hypothesis |
| Search latency (p95) | < 200ms | Client-side FTS5 | Hypothesis |

### Reliability Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| Data integrity | 0 loss | Automated checksum verification | Hypothesis |
| Extension crash rate | < 0.1% | Browser extension telemetry (opt-in) | Hypothesis |
| Import fidelity | > 98% | Round-trip field preservation | Hypothesis |
| Export completeness | 100% core fields | Schema validation | Hypothesis |

### Adoption & Retention Metrics
| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| 7-day retention | > 40% | Active users day 7 / day 1 | Hypothesis |
| 30-day retention | > 25% | Active users day 30 / day 1 | Hypothesis |
| Resources saved (week 1) | > 20 | Median per activated user | Hypothesis |
| Import completion rate | > 60% | Import started → finished | Hypothesis |
| NPS (qualitative) | > 50 | In-app survey (opt-in) | Hypothesis |

> **All targets are hypotheses until validated with real users.**

---

## 7. Documentation Updates

Created: `docs/MVP_FEATURE_PRIORITIZATION.md` (this file)  
Updated: `docs/PROJECT_PROGRESS.md` — Phase 1.4 marked complete, next action Phase 1.5

---

## 8. Unresolved Decisions Requiring Input

| Decision | Options | Recommendation | Input Needed |
|----------|---------|----------------|--------------|
| **Safari extension in MVP?** | Include / Defer to Post-MVP | Defer — different bundle, review complexity | Safari user % in primary personas |
| **Electron vs Tauri vs PWA for desktop?** | Electron (mature) / Tauri (smaller, Rust) / PWA (web-only) | Tauri — local-first native, smaller bundle, SQLite native | Team Rust comfort; Tauri plugin ecosystem maturity |
| **SQLite in browser (sql.js vs native WASM)?** | sql.js (WASM) / native Node / IndexedDB only | IndexedDB for PWA; native SQLite (better-sqlite3) for Tauri | Performance at 10k+ items; WASM bundle size |
| **Manifest V3 service worker for capture?** | Service worker / Offscreen document / Declarative net request | Offscreen document for DOM access; SW for network | Chrome 120+ offscreen stability; Firefox parity |
| **Pricing model hint for MVP?** | Free forever / Free + paid sync / One-time license | Free MVP; paid sync later | Business model validation; competitor pricing anchor |

---

## 9. Summary Report

1. **Total candidate features evaluated**: 52 across 14 categories
2. **MVP Must-Have features**: 18 features (L1, C1, B1-B3, M1-M3, O1, O3, S1-S2, V1, V3, D1, I1, I2, I4, K1, P1)
3. **Post-MVP Should-Have features**: 25 features (CLI, API, smart collections, semantic search, reader mode, sync, dev capture, etc.)
4. **Future/Experimental features**: 9 features (AI summaries, digest agents, visual similarity, native mobile, self-host sync server, etc.)
5. **Key product decisions**:
   - Local-first storage (SQLite/IndexedDB) — hard constraint
   - No sync in MVP — optional Phase 8+
   - Manifest V3 extension (Chrome/Firefox/Edge) — Safari deferred
   - Keyword + Faceted search only — semantic search deferred
   - Collections + Tags (not folders-only, not tags-only)
   - Manual tags with autocomplete — no auto-tagging in MVP
   - CLI/API deferred — extension covers 90%
   - Rule-based type detection only — ML deferred
   - Import: Browser HTML + Raindrop JSON only
   - Export: JSON/HTML/MD/CSV in MVP — BibTeX Post-MVP
6. **Biggest MVP risks**:
   - Manifest V3 service worker capture reliability
   - SQLite/IndexedDB performance at scale (10k+ items)
   - Type detection accuracy on dynamic/modern sites
   - Raindrop import fidelity (schema changes)
   - Cross-browser extension maintenance burden
7. **Documents created/updated**: `MVP_FEATURE_PRIORITIZATION.md`, `PROJECT_PROGRESS.md`
8. **Unresolved decisions requiring input**: 5 (Safari, desktop framework, SQLite impl, MV3 capture, pricing hint)

---

**Next Phase**: 1.5 — Architecture & Technical Design (awaiting approval)

---

**Fact-Forcing Gate Compliance:**
- **Supersedes**: No existing file (new document for Phase 1.4)
- **Linked from**: `docs/PROJECT_PROGRESS.md` (updated in this phase), will be referenced by Phase 1.5 Architecture
- **User verbatim instruction**: "/SystemsThinking /ponytail /i-have-adhd # Phase 1.4 — Feature Discovery & MVP Prioritization ... Create: `docs/MVP_FEATURE_PRIORITIZATION.md` Update: `docs/PROJECT_PROGRESS.md` ... Stop after Phase 1.4. Do not begin Phase 1.5 until I review the results and explicitly approve it."