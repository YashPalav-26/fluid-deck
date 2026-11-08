# Information Architecture — Fluid Deck

*Generated: 2026-11-07 | Based on: Product Vision + Competitive Research + Target Users + MVP Features | Phase: 1.5*

---

## 1. IA Principles

1. **Retrieval over storage** — Every IA decision optimizes for finding, not saving
2. **Hierarchy for organization, facets for retrieval** — Collections = tree; Tags/Type/Date = filters
3. **Progressive disclosure** — Simple by default; power features in ⌘K and filter chips
4. **State in URL** — Filter combinations are shareable/bookmarkable
5. **Local-first = no loading skeletons for core ops** — Instant feedback
6. **Zero mandatory fields at capture** — Organization is optional, not required
7. **Portability = trust** — Import/export are first-class, not hidden

---

## 2. Conceptual Content Model

| Entity | Purpose | Relationships | User Interaction |
|--------|---------|---------------|------------------|
| **Resource** | Core unit: a saved URL with metadata | Belongs to 0+ Collections; has 0+ Tags; has 1 Type; has 1 Source | Save, view, edit metadata, move, tag, delete, open |
| **Collection** | Hierarchical grouping (tree) | Parent → Children (ordered); Members (Resources, many-to-many) | Create, rename, reorder (drag-drop), delete, navigate |
| **Tag** | Cross-cutting facet | Resources (many-to-many); Usage count; Autocomplete index | Apply at save/edit; filter by; autocomplete suggests; merge/rename via bulk actions |
| **Type** | Discriminator for rendering + extraction | Fixed enum (7 values); Resource → Type (many-to-one) | Filter by; determines card variant; auto-detected at save |
| **Source** | Origin of capture | Enum (Extension, CLI, API, Import, Share); Resource → Source | Filter by; analytics (internal) |
| **Saved Search** | Named filter combination | Filter state (query + facets); User-defined name | Create from current filters; appears in ⌘K; optional alert |
| **View State** | Current filter/sort/page | Transient; URL-encoded; Restored on revisit | Updated by every filter/search/sort action |

---

## 3. Navigation Hierarchy

### Primary Navigation (Left Sidebar — Collapsible Tree)

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

**Rules**:
- Maximum 3 levels deep recommended (UI shows ... for deeper)
- Drag-drop to reorder siblings and move subtrees
- Inline create (Enter), rename (click), delete (⌘⌫)
- Right-click → "New subcollection", "Rename", "Delete", "Move to..."
- Click collection → applies collection filter (shows resources in this collection + descendants)
- **No "Recents", "Favorites", "Tags", "Types" as tree nodes**

### Secondary Navigation (Top Bar — Filter Chips + Search)

```
[🔍 Search resources...]  [🏷️ Type: Article ▼]  [📁 Collection: React ▼]  [🏷️ Tags: hooks, forms ▼]  [📅 Date: Any ▼]  [🌐 Source: Extension ▼]  [⚙️ Sort: Newest ▼]  [⌘K]
```

**Filter Chips Behavior**:
- Each active filter shows as removable chip: `Type: Article ✕`
- Click chip dropdown → change value or add additional value (multi-select for tags)
- "Clear all" returns to "All Resources" (root collection, no filters)
- Filter state encoded in URL: `/?collection=react&type=article&tags=hooks,forms&sort=date_desc`

### Command Palette (⌘K) — Universal Action Surface

**Categories**:
1. **Navigate** — "Go to Collection: React", "All Resources", "Unorganized"
2. **Search** — "Search: react hooks", "Search: type:article tag:design"
3. **Create** — "New Collection", "New Tag", "Save Current Page"
4. **Bulk Actions** — "Tag Selected", "Move to Collection", "Delete Selected", "Export Selected"
5. **Settings** — "Import", "Export", "Preferences", "Keyboard Shortcuts"
6. **Help** — "Shortcuts", "Documentation", "Report Issue"

---

## 4. Organization Rules

### Collections (Nested, Multi-Membership Allowed)

| Rule | Decision | Rationale |
|------|----------|-----------|
| Can a resource belong to multiple collections? | **Yes** | A React article belongs in "Frontend → React" AND "Learning → Articles". Single-parent folders cause duplication. |
| Can collections be nested? | **Yes** (max 3 levels recommended) | Matches mental models: Domain → Subdomain → Topic |
| Can tags be reused across collections? | **Yes** — tags are global | Tags are cross-cutting facets, not collection-scoped |
| What happens when a collection is deleted? | **Resources unassigned from that collection only** (not deleted). Subcollections become top-level or move to parent. | Non-destructive; user intent is "remove this grouping" not "delete these resources" |
| Can users save a resource without assigning a collection or tag? | **Yes** — goes to "Unorganized" virtual collection | Zero mandatory fields (Principle 1). Organization is optional. |
| How are unorganized resources discovered? | **Virtual "Unorganized" collection** in tree (always visible at bottom) + filter chip "Collection: Unorganized" | Explicit, discoverable, actionable (bulk organize from there) |
| How should duplicate URLs behave? | **URL normalization at save** → if exists: prompt "Update metadata / Add to collections / Skip" | Prevents library rot at source. User chooses intent. |

### Tags (Global, Flat, Autocomplete)

| Rule | Decision |
|------|----------|
| Tag creation | Inline at save/edit + ⌘K "New Tag" |
| Tag autocomplete | Suggests existing tags by usage count + prefix match |
| Tag management | Bulk actions: merge, rename, delete (via ⌘K or settings) |
| Tag display | Filter chips + resource card badges (max 3 shown, "+N" overflow) |
| Special tags | "⭐" = Favorite; "📌" = Pinned (sort to top) — convention, not enforced |

### Resource Types (Fixed Enum, Auto-Detected)

| Type | Detection Rules | Card Variant |
|------|-----------------|--------------|
| `article` | `<article>`, blog patterns, medium.com, dev.to | Read time, source, author |
| `video` | youtube.com, vimeo.com, loom.com, `.mp4` | Duration, platform, thumbnail |
| `github` | github.com/*/* (not raw) | Stars, language, license, description |
| `npm` | npmjs.com/package/*, registry.npmjs.org | Version, downloads, description |
| `pdf` | `.pdf`, `application/pdf` | Pages, size, title |
| `design` | figma.com, dribbble.com, behance.net | Thumbnail, author, platform |
| `tool` | Pricing page patterns, SaaS domains, "pricing", "signup" | Category, pricing, CTA |
| `other` | Fallback | Favicon, domain, description |

### Search & Faceted Filters

| Facet | Values | Multi-Select | URL Param |
|-------|--------|--------------|-----------|
| Query | Free text (FTS5) | N/A | `q=` |
| Type | 8 enum values | No | `type=` |
| Collection | Tree (includes descendants) | No | `collection=` |
| Tags | All tags | Yes (OR logic) | `tags=tag1,tag2` |
| Date Range | Presets + custom | No | `date=week|month|year|custom:start:end` |
| Source | 5 enum values | No | `source=` |
| Has Code | Boolean | No | `has_code=true` |
| Has Image | Boolean | No | `has_image=true` |

**Sort Options**: Newest, Oldest, Title A-Z, Title Z-A, Most Tagged, Recently Opened

---

## 5. Browsing and Discovery Structure

### Grid View (Primary)

- **Layout**: Masonry (variable height) or Uniform Grid (user preference, persisted)
- **Card Variants**: 7 type-specific renderers (see table above)
- **Card Elements**: Thumbnail (lazy-loaded), Title (truncate 2 lines), Type badge, Tag pills (max 3), Collection path (hover), Save date (relative)
- **Interactions**: Click → open resource (new tab); Shift+Click → multi-select; Right-click → context menu (open, copy, move, tag, delete); Hover → quick actions (star, open, preview)
- **Virtual Scroll**: Load 50 → append on scroll
- **Density**: Comfortable (default) / Compact (⌘K toggle)

### Search Results

- Same grid view, filtered by query + facets
- Query highlights in title/description/tags
- "No results" state: suggestions (broaden filters, check spelling, try synonyms, import bookmarks)
- Search latency target: <200ms p95 (client-side FTS5)

### Faceted Filtering

- Filter chips update instantly (no "Apply" button)
- Facet counts shown in dropdown: `Type: Article (234) ▼`
- Multi-select for tags only (OR logic)
- "Clear" button per facet + "Clear all" global

### Sorting

- Default: Newest first
- Sort persisted per view context (collection, search, tag)
- Keyboard: `s` → sort menu

### Empty States

| Context | Message | Primary Action |
|---------|---------|----------------|
| All Resources (0 items) | "Your library is empty. Save your first link or import existing bookmarks." | [Import Bookmarks] [Save Current Page] |
| Collection (0 items) | "No resources in this collection yet. Save links here or drag existing resources in." | [Save to This Collection] |
| Search (0 results) | "No matches for 'query'. Try: broader filters, different terms, or check spelling." | [Clear Filters] [Import Bookmarks] |
| Tag filter (0 results) | "No resources tagged 'tag'." | [Browse All Tags] |

### Loading States

- Initial load: Skeleton grid (gray cards) → fade in real cards
- Filter change: Instant (client-side) — no loading state
- Search: Debounced 150ms → skeleton if >100ms
- Import: Progress modal with cancel
- Export: Toast "Export ready" → download

### Large Libraries (10,000+ Resources)

- Virtual scroll essential (render 50, buffer 100)
- Collection tree: lazy-load children on expand
- Tag autocomplete: debounced, indexed
- Search: FTS5 handles 100k+ rows easily on modern hardware
- Filter counts: cached, updated async
- Command palette: fuzzy search on indexed titles/URLs

---

## 6. Key Information Architecture Flows

### 1. First-Time User Entering Fluid Deck

```
Landing (0 resources)
  ├─ Empty state: "Welcome to Fluid Deck. Save your first link or import bookmarks."
  │   ├─ [Import Bookmarks] → Import flow (see Flow 7)
  │   ├─ [Save Current Page] → Opens extension popup on current tab
  │   └─ [Watch 30s Demo] → Video modal
  ├─ User clicks [Import Bookmarks]
  │   ├─ Select source: Browser HTML / Raindrop JSON
  │   ├─ File picker → parse → preview (counts: resources, collections, tags)
  │   ├─ [Import] → Progress → Success toast + grid populated
  │   └─ Collection tree auto-populated from import
  └─ User sees populated grid + collection tree
      ├─ Can click collections to filter
      ├─ Can search / filter
      └─ ⌘K hints shown on first hover
```

### 2. Saving a Resource Through Browser Extension

```
User on any page → Clicks extension icon (or ⌘⇧S / right-click → Save)
  ├─ Popup opens (side panel or modal)
  │   ├─ Auto-filled: Title, URL, Description, Thumbnail, Type
  │   ├─ Editable: Title, Description
  │   ├─ Collection: Dropdown (tree) + "New Collection..." — defaults to last used
  │   ├─ Tags: Autocomplete input (comma-separated) — suggests from existing
  │   ├─ [Save] button (primary)
  │   └─ [Save & Open] / [Save & Close] variants
  ├─ On [Save]:
  │   ├─ URL normalization → check duplicate
  │   │   ├─ If new: Insert → toast "Saved to [Collection]" → close popup
  │   │   └─ If exists: Modal "Already saved. Update metadata? Add to collections? Skip?"
  │   └─ Grid updates instantly (optimistic UI)
  └─ Keyboard: Tab through fields, Enter to save, Esc to cancel
```

### 3. Viewing and Editing Saved Metadata

```
User clicks resource card (or selects → ⌘E)
  ├─ Detail panel slides in (right sidebar) or modal
  │   ├─ Full metadata: Title, URL, Description, Thumbnail, Type, Source, Created, Updated
  │   ├─ Collections: Multi-select tree (current memberships checked)
  │   ├─ Tags: Autocomplete input (current tags as removable chips)
  │   ├─ Notes: Free-text user notes (Markdown supported)
  │   ├─ Actions: [Open] [Copy URL] [Copy Markdown] [Delete] [Duplicate]
  │   └─ Auto-save on blur (no explicit Save button)
  └─ Esc / Click outside → close panel
```

### 4. Creating and Organizing Collections

```
Method A: Inline in sidebar
  ├─ Hover collection → [+] icon → type name → Enter → creates child
  ├─ Right-click collection → "New subcollection"
  ├─ Drag-drop to reorder / move between parents
  └─ Right-click → "Rename" / "Delete" (with confirmation)

Method B: ⌘K "New Collection"
  ├─ Input: Name, Parent (dropdown, defaults to root)
  └─ Creates and selects in tree

Method C: At save time (extension popup)
  ├─ Collection dropdown → "New Collection..." → inline create
  └─ Auto-selects as target for current save
```

### 5. Applying and Reusing Tags

```
At save/edit:
  ├─ Tags input: type → autocomplete shows existing tags (usage count)
  ├─ Enter/comma → adds tag chip
  ├─ Click chip ✕ → removes
  └─ New tag created on submit if not existing

Via ⌘K:
  ├─ "Tag Selected" → multi-select resources → tag input → apply
  ├─ "Merge Tags" → select source + target → confirm
  ├─ "Rename Tag" → select tag → new name
  └─ "Delete Tag" → select tag → confirm (removes from all resources)
```

### 6. Finding a Resource Through Search and Filters

```
User presses ⌘K or clicks search box
  ├─ Types query: "react form validation"
  │   ├─ Instant FTS5 results in ⌘K dropdown (top 10)
  │   ├─ Press Enter → applies query filter → grid updates
  │   └─ Filter chips show: `Query: "react form validation" ✕`
  ├─ Adds facets: clicks Type → selects "Article"; clicks Tags → selects "hooks"
  │   ├─ Each adds filter chip
  │   ├─ Grid narrows instantly
  │   └─ URL updates: `/?q=react+form+validation&type=article&tags=hooks`
  ├─ Sorts: clicks Sort → "Oldest"
  ├─ Finds target → clicks card → opens in new tab
  └─ Optional: ⌘K "Save Search" → names it "React Form Articles" → appears in ⌘K Navigate
```

### 7. Importing an Existing Bookmark Library

```
⌘K → "Import" (or Settings → Import)
  ├─ Select source: [Browser HTML] [Raindrop JSON] [Pocket] [Pinboard]
  ├─ File picker / paste JSON
  ├─ Parser runs → Preview modal:
  │   ├─ Resources: 1,234
  │   ├─ Collections: 12 (nested structure shown)
  │   ├─ Tags: 89
  │   ├─ Conflicts: 3 duplicates (URL matches existing)
  │   └─ [Import All] [Customize...]
  ├─ [Customize...] → Map external collections → internal collections
  │   ├─ Auto-map by name match
  │   ├─ Manual override: dropdown per collection
  │   └─ "Create new" for unmatched
  ├─ [Import All] → Progress bar → Success toast
  │   ├─ Collection tree populated
  │   ├─ Tags indexed
  │   └─ Grid shows imported resources (newest first)
  └─ Duplicate handling: Skip / Update metadata / Add to additional collections
```

### 8. Exporting the User's Library

```
⌘K → "Export" (or Settings → Export)
  ├─ Select format: [JSON] [HTML] [Markdown] [CSV]
  ├─ Select scope: [All Resources] [Current Filter] [Selected Resources] [Collection: X]
  ├─ Options: [Include thumbnails] [Include notes] [Flatten collections]
  ├─ [Export] → Generates file → Download starts
  └─ Toast: "Exported 1,234 resources to fluid-deck-2026-11-07.json"
```

### 9. Handling Duplicate URLs

```
At save (extension/API/import):
  ├─ URL normalized (strip UTM, www, fragments, sort params)
  ├─ Check existing by canonical URL
  ├─ If match found:
  │   ├─ Modal: "This URL is already saved."
  │   │   ├─ [Update Metadata] — refresh title/desc/image/type
  │   │   ├─ [Add to Collections] — multi-select tree → adds membership
  │   │   ├─ [Add Tags] — tag input → adds tags
  │   │   └─ [Skip] — do nothing
  │   └─ User choice applied → toast confirms
  └─ If no match: Normal save flow
```

### 10. Recovering or Managing Deleted Resources

```
Deleted resources → Soft delete (flag: deleted_at timestamp)
  ├─ Not shown in grid, search, collections
  ├─ ⌘K "Trash" → Virtual collection "Trash" (filter: deleted_at not null)
  │   ├─ Grid shows deleted resources with "Deleted [date]" badge
  │   ├─ Actions: [Restore] [Permanently Delete]
  │   └─ Bulk: multi-select → [Restore] / [Purge]
  ├─ Auto-purge: Configurable (default 30 days) → hard delete
  └─ Export includes deleted if "Include deleted" checked
```

---

## 7. Empty, Loading, Error, and Edge States

| State | Context | UI Treatment |
|-------|---------|--------------|
| **Empty Library** | All Resources, 0 items | Onboarding illustration + [Import] [Save Current Page] [Demo] |
| **Empty Collection** | Collection filter, 0 members | "No resources in [Collection]. Drag here or save directly." |
| **Empty Search** | Query + filters, 0 results | Suggestions: broaden, check spelling, try synonyms, import |
| **Empty Tag** | Tag filter, 0 resources | "No resources tagged '[tag]'. Browse all tags →" |
| **Initial Load** | App start | Skeleton grid (6-8 cards) → fade in real data |
| **Filter Change** | Any facet change | Instant (client-side) — no loader |
| **Search Debounce** | Typing in search | 150ms debounce → skeleton if >100ms |
| **Import Progress** | Import running | Modal with progress bar, item count, cancel |
| **Export Progress** | Large export | Toast "Preparing..." → "Download ready" |
| **Extension Error** | Save fails | Toast "Save failed: [reason]. Retry?" + queue for retry |
| **Duplicate Conflict** | Save matches existing | Modal with 4 options (see Flow 9) |
| **Storage Quota** | IndexedDB full | Modal: "Storage full. Export backup, then delete items." |
| **Corrupt Data** | Integrity check fails | Modal: "Data corruption detected. Restore from backup?" |
| **Offline** | No network | Banner: "Offline — changes sync when online" (Post-MVP) |

---

## 8. Scalability Considerations

| Scale | Navigation | Organization | Retrieval | Performance Risks | Mitigations |
|-------|------------|--------------|-----------|-------------------|-------------|
| **50 resources** | Tree fully expanded | Manual org easy | Search instant | None | Default settings work |
| **500 resources** | Tree scrolls | Tags useful | Facets essential | Tag autocomplete latency | Debounce + index |
| **5,000 resources** | Tree: collapse by default | Smart collections needed | Search + facets primary | Virtual scroll essential | WASM FTS5; lazy tree |
| **10,000+ resources** | Tree: search in ⌘K | Auto-tagging valuable | Hybrid search (semantic) | FTS5 memory; tag count | Pagination; archive old |

**Navigation Clutter**: 
- Tree collapses auto at >20 top-level collections
- ⌘K "Go to Collection" fuzzy-searches tree
- Tags never in tree — only filter chips + autocomplete

**Organization Friction**:
- At 500+: bulk actions (⌘K) essential
- At 5000+: smart collections (Post-MVP) prevent rot
- At 10k+: auto-tagging (Post-MVP) reduces manual work

**Retrieval Bottlenecks**:
- FTS5 handles 100k+ rows <50ms on modern laptop
- Facet counts: pre-computed on write, cached
- Tag autocomplete: trigram index or prefix trie
- Command palette: MiniSearch or Fuse.js on titles/URLs

---

## 9. Open Questions and Unresolved Decisions

| Question | Context | Recommendation | Validation Needed |
|----------|---------|----------------|-------------------|
| **Safari extension in MVP?** | Phase 1.4 decision: deferred | Defer — different bundle, review complexity | Safari user % in primary personas (Alex/Maya) |
| **List view (V2) in MVP?** | Score 11 (Should-Have), low complexity | Include — Alex/Maya need dense scanning | Prototype both; measure task completion |
| **Smart collections (O2) in MVP?** | Score 11, prevents database rot | Include as "Saved Search as Collection" | Test if users create saved searches organically |
| **Perceptual hash (D2) complexity?** | Score 6, high uncertainty | Defer — prototype collision rate at 1k images | Benchmark pHash in WASM/Node |
| **Collection depth limit?** | UX vs flexibility | Recommend max 3; allow more with warning | Card sort: observe natural hierarchy depth |
| **Tag management UI in MVP?** | Merge/rename/delete needed at scale | ⌘K bulk actions only; no dedicated page | Observe tag explosion in prototype |
| **URL state persistence?** | Shareable filters | Yes — encode all filters in URL | Test browser back/forward behavior |
| **Keyboard shortcuts beyond ⌘K?** | Vim nav (K2 score 9) | Add `j/k` nav, `/` search, `?` help | Survey power users |
| **Resource detail: panel vs modal?** | Screen real estate | Right panel (desktop) / Modal (mobile) | Test both; measure context retention |

---

## 10. Summary Report

### Proposed Navigation Hierarchy
- **Primary**: Collapsible collection tree (left sidebar) — root = "All Resources"
- **Secondary**: Filter chips + search (top bar) — Type, Collection, Tags, Date, Source, Sort
- **Tertiary**: Command palette (⌘K) — universal navigate/search/create/bulk/settings
- **No**: Recents, Favorites, Tags, Types as separate nav items (they're filters/saved searches)

### Conceptual Content Model
- **Resource** (core): URL + metadata + user context (collections, tags, notes)
- **Collection** (tree): Hierarchical, multi-membership allowed, drag-drop
- **Tag** (flat): Global facets, autocomplete, bulk manage via ⌘K
- **Type** (enum): 8 values, auto-detected, drives card rendering + filter
- **Source** (enum): 5 values, filter only
- **Saved Search** (virtual): Named filter combos, appear in ⌘K

### Organization Rules
- Resources ∈ multiple collections (many-to-many)
- Collections nestable (recommend ≤3 levels)
- Tags global, reusable, flat
- Delete collection → unassigns resources (non-destructive)
- Save without collection/tag → "Unorganized" virtual collection
- Duplicate URLs → normalization + user choice (update/add/skip)

### Key User Flows Documented
All 10 flows specified with decision points:
1. First-time user onboarding
2. Extension save (with duplicate handling)
3. View/edit metadata (right panel, auto-save)
4. Create/organize collections (inline + ⌘K + at-save)
5. Apply/reuse tags (autocomplete + ⌘K bulk)
6. Search + filter (instant, URL-encoded, saveable)
7. Import (HTML/Raindrop, preview, mapping, dedup)
8. Export (4 formats, scoped, options)
9. Duplicate handling (modal with 4 choices)
10. Trash/Recovery (soft delete, 30-day auto-purge)

### Scalability Findings
- **50-500**: Default IA works; tree expanded
- **500-5,000**: Tree collapses; ⌘K navigation; virtual scroll; facet counts cached
- **5,000-10,000+**: Smart collections needed; auto-tagging valuable; semantic search experiment
- **Navigation clutter**: Solved by collapsible tree + ⌘K fuzzy search
- **Organization friction**: Solved by bulk actions + smart collections (Post-MVP)
- **Retrieval bottlenecks**: FTS5 handles 100k+; tag autocomplete needs trigram index

### Conflicts with Approved MVP
**None** — all proposals align with 18 Must-Have features and 10 Key Product Decisions.
- List view (V2) recommended for MVP inclusion (score 11, low complexity) — minor scope addition
- Smart collections (O2) recommended as "Saved Search as Collection" — minimal implementation

### Documents Created/Updated
- `docs/INFORMATION_ARCHITECTURE.md` — Created
- `docs/PROJECT_PROGRESS.md` — Updated (Phase 1.5 complete)

---

**Next Phase**: 1.6 — Technical Architecture & Database Schema (awaiting approval)