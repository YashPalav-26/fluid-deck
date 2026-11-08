# User Journeys & Workflows — Fluid Deck

*Generated: 2026-11-07 | Based on: Product Vision + Competitive Research + Target Users + MVP Features + Information Architecture | Phase: 1.6*

---

## 1. Journey Design Principles

1. **Capture first, organize later** — Saving takes <2 seconds with zero mandatory fields
2. **Progressive disclosure** — Power features (bulk actions, smart filters) hidden until needed
3. **Keyboard-first** — Every action accessible via ⌘K and keyboard shortcuts
4. **Instant feedback** — Local-first means no spinners for core operations
5. **Recoverable by default** — Soft delete, duplicate handling, import preview, undo toasts
6. **Persona-aware defaults** — Alex sees code-aware fields; Maya sees visual fields; Sam sees AI-tool fields
7. **URL as truth** — Filter state shareable, bookmarkable, restorable

---

## 2. Primary Persona Scenarios

### Alex — Software Developer
- **Context**: Senior full-stack engineer, 15-25 saves/week
- **Triggers**: GitHub repo discovery, API docs, Stack Overflow answers, npm packages
- **Pain**: GitHub stars unsearchable; browser bookmarks lack code metadata; duplicates across sources
- **Needs**: Tech-stack auto-tags, code snippet extraction, CLI capture, local-first (company policy), import from GitHub stars + Notion

### Maya — Product Designer
- **Context**: Product designer at fintech, side freelance, 20-30 saves/week
- **Triggers**: Dribbble/Behance shots, Figma files, design systems, color palettes, competitor screenshots
- **Pain**: Pinterest public only; Figma work-only; browser bookmarks no visual preview; folder paralysis
- **Needs**: Type-aware cards (visual-first), perceptual hash dedup, color/brand extraction, import from Pinterest/Figma/Are.na, optional sync for personal+work separation

### Sam — AI Tool Explorer
- **Context**: ML engineer + newsletter writer, evaluates 10+ tools/week
- **Triggers**: New AI tool launches, model cards, prompt libraries, research papers, Discord discussions
- **Pain**: Tab overload; Raindrop no AI metadata; Notion tables rot; no "what's new this week" digest
- **Needs**: AI-specific auto-tags (model type, deployment, pricing), GitHub/HF metadata extraction, semantic search, background digest agents, CLI capture

---

## 3. End-to-End Journeys

### Journey 1: First-Time Onboarding and Initial Setup

| Aspect | Details |
|--------|---------|
| **User Goal** | Get Fluid Deck running with existing bookmarks imported, understand core mental model |
| **Persona** | All (first touch) |
| **Starting Point** | Fresh install — app opens to empty state |
| **Preconditions** | Extension installed (or installing); existing bookmarks in browser/Raindrop |

**Main Steps**
1. App loads → empty state screen: "Welcome to Fluid Deck. Save your first link or import existing bookmarks."
2. User chooses: [Import Bookmarks] or [Save Current Page] or [Watch 30s Demo]
3. If Import: Select source → Browser HTML / Raindrop JSON → File picker
4. Parser runs → Preview modal shows: resource count, collection count, tag count, duplicate conflicts
5. User reviews → [Import All] or [Customize...] for collection mapping
6. Import runs → Progress bar → Success toast + grid populated + collection tree built
7. Onboarding hints: ⌘K highlighted, first collection creation suggested, first save guided

**User Decisions**
- Import now vs save first vs watch demo
- Which source to import from (browser vs Raindrop vs both)
- Collection mapping: auto-map vs customize vs create new

**System Responses**
- Parse preview with conflict detection
- Progress feedback during import
- Success toast with counts
- Collection tree auto-expanded to show imported structure

**Expected Outcome**
- Library populated with user's existing resources
- Collection hierarchy reflects imported structure
- Tags indexed and available for filtering
- User understands: grid = resources, sidebar = collections, top bar = filters, ⌘K = everything

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| Import file corrupt | Clear error message; suggest re-export from source |
| Import hangs | Cancel button; partial import preserved; resume option |
| Duplicate conflicts overwhelming | "Skip all duplicates" option; summary at end |
| Extension not installed | Prompt with one-click install link |

**Friction Points**
- Users may not know how to export from browser/Raindrop → include inline instructions
- Collection mapping UI complexity → default to auto-map, advanced only on demand
- Empty state after failed import → clear "try again" path

---

### Journey 2: Saving a Resource Using the Browser Extension

| Aspect | Details |
|--------|---------|
| **User Goal** | Capture current page with rich metadata in <2 seconds |
| **Persona** | All (primary daily action) |
| **Starting Point** | User on any web page (GitHub, article, design, tool, video, PDF) |
| **Preconditions** | Extension installed; user logged in (if sync enabled Post-MVP) |

**Main Steps**
1. User triggers save: Extension icon click / ⌘⇧S / Right-click → "Save to Fluid Deck"
2. Popup opens (side panel or modal) — auto-filled:
   - Title, URL, Description, Thumbnail, Type (auto-detected)
3. User optionally edits: Title, Description
4. User selects Collection: Dropdown tree (defaults to last used) or "New Collection..."
5. User adds Tags: Autocomplete input (suggests existing, comma-separated)
6. User clicks [Save] (or [Save & Open] / [Save & Close])
7. System: URL normalization → duplicate check → insert or conflict modal
8. Toast: "Saved to [Collection]" → Popup closes → Grid updates instantly

**User Decisions**
- Which collection (or create new)
- Which tags (or none)
- Save variant: Save / Save & Open / Save & Close

**System Responses**
- Auto-fill metadata (title, desc, image, type)
- Collection dropdown with tree + inline create
- Tag autocomplete with usage counts
- Duplicate detection → modal with 4 choices
- Optimistic UI update → instant grid reflection

**Expected Outcome**
- Resource saved with rich metadata
- Appears in grid under correct collection + tags
- User stays in flow (popup closes, page unaffected)

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| Metadata extraction fails | Fallback: title from `<title>`, favicon, type=other; user can edit |
| Network error (Post-MVP sync) | Queue locally; retry on reconnect; toast "Saved locally, syncing..." |
| Extension permission denied | Inline prompt: "Enable extension access for this site" |
| Popup blocked by browser | Fallback to context menu save; notification "Popup blocked — use right-click" |

**Friction Points**
- Dynamic SPA content may not extract → manual edit fields prominent
- Duplicate modal adds step → "Skip" default for power users
- Collection tree in dropdown may be deep → search/filter in dropdown

---

### Journey 3: Editing Resource Metadata

| Aspect | Details |
|--------|---------|
| **User Goal** | View full metadata, update collection/tags/notes, copy resource info |
| **Persona** | All (frequent for organization) |
| **Starting Point** | User sees resource in grid (any view: collection, search, tag filter) |
| **Preconditions** | Resource exists in library |

**Main Steps**
1. User clicks resource card (or selects via Shift+Click → ⌘E)
2. Detail panel slides in (right sidebar desktop / modal mobile)
3. Panel shows: Full metadata (title, URL, description, thumbnail, type, source, created, updated)
4. Collections: Multi-select tree with current memberships checked
5. Tags: Autocomplete input showing current tags as removable chips
6. Notes: Free-text Markdown area for user annotations
7. Actions: [Open] [Copy URL] [Copy Markdown] [Delete] [Duplicate]
8. Changes auto-save on blur (no Save button)
9. Esc / Click outside → closes panel

**User Decisions**
- Add/remove collections (multi-select)
- Add/remove/edit tags
- Add notes (Markdown)
- Copy format: URL / Markdown / JSON

**System Responses**
- Instant auto-save on field blur
- Collection changes reflect in sidebar tree counts
- Tag changes update autocomplete index
- Notes rendered with Markdown preview toggle
- Copy actions toast "Copied!"

**Expected Outcome**
- Metadata updated without explicit save
- Grid reflects changes instantly (tag pills, collection path)
- User can copy resource in multiple formats for external use

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| Auto-save conflict (rare) | Toast "Conflict — reloaded latest"; panel refreshes |
| Markdown render error | Fallback to plain text; error badge on notes field |
| Panel closes accidentally | No data loss — auto-saved on blur |

**Friction Points**
- Multi-select tree for collections can be deep → search in tree
- Tag chips overflow at 3 → "+N" click expands
- Notes Markdown may confuse non-technical users → toolbar + preview

---

### Journey 4: Creating and Organizing Collections

| Aspect | Details |
|--------|---------|
| **User Goal** | Build hierarchy matching mental model; keep it maintainable at scale |
| **Persona** | All (Alex: tech stacks; Maya: pattern types; Jordan: PARA) |
| **Starting Point** | Sidebar collection tree (empty or existing) |
| **Preconditions** | App loaded; user has resources to organize |

**Main Steps**
**Method A: Inline in Sidebar**
1. Hover parent collection → [+] icon appears → click → type name → Enter
2. Right-click collection → "New subcollection" / "Rename" / "Delete" / "Move to..."
3. Drag-drop to reorder siblings or move between parents

**Method B: ⌘K "New Collection"**
1. ⌘K → Type "New Collection" → Enter
2. Input: Name, Parent (dropdown, defaults to root)
3. Creates and selects in tree

**Method C: At Save Time (Extension Popup)**
1. Collection dropdown → "New Collection..." → inline create
2. Auto-selects as target for current save

**User Decisions**
- Collection name and parent
- Hierarchy depth (recommend ≤3)
- When to create vs use tags

**System Responses**
- Inline create: immediate tree insertion
- Drag-drop: visual drop indicator; confirms on drop
- Delete: Confirmation modal → "Resources unassigned, not deleted"
- Rename: Inline edit; updates all references

**Expected Outcome**
- Collection tree reflects user's mental model
- Resources assignable to multiple collections
- Hierarchy stays shallow (≤3 levels recommended)

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| Drag-drop to invalid position | Snap back; toast "Can't move there" |
| Delete collection with resources | Confirmation shows resource count; resources moved to "Unorganized" |
| Circular reference attempt | Blocked; toast "Would create loop" |

**Friction Points**
- Deep nesting temptation → UI warning at level 3+
- "Move to..." target selection in large trees → searchable dropdown
- Bulk move not in MVP → ⌘K "Move Selected" for multi-select

---

### Journey 5: Applying and Managing Tags

| Aspect | Details |
|--------|---------|
| **User Goal** | Add cross-cutting facets; keep tag vocabulary clean |
| **Persona** | All (Alex: tech tags; Maya: style tags; Sam: AI capability tags) |
| **Starting Point** | Save/edit flow or ⌘K bulk actions |
| **Preconditions** | Resources exist; some tags may exist |

**Main Steps**
**At Save/Edit**
1. Tags input: type → autocomplete shows existing tags (usage count + prefix match)
2. Enter/comma → adds tag chip (removable)
3. New tag created on submit if not existing

**Via ⌘K Bulk Actions**
1. Multi-select resources (Shift+Click or checkbox)
2. ⌘K → "Tag Selected" → tag input → apply to all selected
3. ⌘K → "Merge Tags" → select source + target → confirm
4. ⌘K → "Rename Tag" → select tag → new name
5. ⌘K → "Delete Tag" → select tag → confirm (removes from all resources)

**User Decisions**
- Which existing tags to reuse vs create new
- When to merge similar tags (e.g., "react" + "reactjs")
- Tag naming convention (kebab-case vs spaces)

**System Responses**
- Autocomplete ranked by usage count
- Tag chips show on cards (max 3, "+N" overflow)
- Merge: source tag removed, target applied to all resources
- Rename: updates all references instantly
- Delete: removes from all resources; confirmation shows count

**Expected Outcome**
- Consistent tag vocabulary across library
- Tags work as filter facets + card badges
- Bulk operations keep vocabulary clean at scale

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| Merge creates duplicate tag name | Blocked; "Tag already exists" |
| Delete tag used by 1000+ resources | Confirmation: "Used by 1,234 resources. Delete anyway?" |
| Tag explosion (500+ tags) | Autocomplete still works; ⌘K "Manage Tags" for cleanup |

**Friction Points**
- No tag management page in MVP → ⌘K only (discoverability)
- Synonym management manual → "Merge Tags" workflow critical
- Tag naming inconsistency → suggest convention in autocomplete

---

### Journey 6: Searching and Filtering a Large Library

| Aspect | Details |
|--------|---------|
| **User Goal** | Find specific resource in <5 seconds among thousands |
| **Persona** | All (primary retrieval mechanism) |
| **Starting Point** | Any view (All Resources, Collection, Tag filter) |
| **Preconditions** | Library has 100+ resources |

**Main Steps**
1. User presses ⌘K or clicks search box
2. Types query: "react form validation" → Instant FTS5 results in ⌘K dropdown (top 10)
3. Press Enter → applies query filter → grid updates → filter chip appears: `Query: "react form validation" ✕`
4. Adds facets: clicks Type → selects "Article"; clicks Tags → selects "hooks" (multi-select)
5. Each adds filter chip → grid narrows instantly → URL updates
6. Sorts: clicks Sort → "Oldest" / "Title A-Z" / "Most Tagged"
7. Finds target → clicks card → opens in new tab
8. Optional: ⌘K "Save Search" → names it "React Form Articles" → appears in ⌘K Navigate

**User Decisions**
- Query terms (keywords, phrases)
- Which facets to apply (type, tags, date, source, has-code, has-image)
- Sort order
- Whether to save as named search

**System Responses**
- FTS5 search <200ms p95
- Facet counts update in dropdowns: `Type: Article (234) ▼`
- Filter chips removable individually or "Clear all"
- URL encodes full filter state (shareable/bookmarkable)
- Saved search appears in ⌘K Navigate + optional alert on new matches

**Expected Outcome**
- Target resource found in <5 seconds
- Filter combination shareable via URL
- Power users build saved searches for recurring needs

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| Zero results | "No matches. Try: broader filters, different terms, check spelling, import bookmarks" |
| Search slow (>500ms) | Fallback: show cached results; background re-index; toast "Indexing..." |
| Facet counts stale | Async refresh; toast "Updating counts..." |
| Saved search name conflict | "Name exists. Overwrite or choose different name?" |

**Friction Points**
- Users may not discover facets → chip dropdowns show counts as affordance
- Multi-select tags only (OR logic) → AND logic not in MVP
- Saved search alerts Post-MVP → only manual check in MVP

---

### Journey 7: Importing Bookmarks from Browsers or Raindrop

| Aspect | Details |
|--------|---------|
| **User Goal** | Bring existing library into Fluid Deck with full fidelity |
| **Persona** | Switchers (Alex: GitHub+Raindrop; Maya: Pinterest→Raindrop; Jordan: 4-tool ecosystem) |
| **Starting Point** | ⌘K → "Import" or Settings → Import |
| **Preconditions** | Export file from source (HTML/JSON) |

**Main Steps**
1. Select source: [Browser HTML] [Raindrop JSON] [Pocket] [Pinboard] (last two Post-MVP)
2. File picker / paste JSON
3. Parser runs → Preview modal:
   - Resources: 1,234
   - Collections: 12 (nested structure shown)
   - Tags: 89
   - Conflicts: 3 duplicates (URL matches existing)
4. [Customize...] → Map external collections → internal collections
   - Auto-map by name match
   - Manual override: dropdown per collection
   - "Create new" for unmatched
5. [Import All] → Progress bar → Success toast
   - Collection tree populated
   - Tags indexed
   - Grid shows imported resources (newest first)
6. Duplicate handling per conflict: Skip / Update metadata / Add to additional collections

**User Decisions**
- Which source to import from
- Collection mapping strategy (auto vs manual)
- Duplicate resolution per conflict or bulk

**System Responses**
- Parser handles browser HTML variations (Chrome/Firefox/Edge/Safari)
- Raindrop JSON parsed with nested collections + tags + metadata
- Preview shows exact counts before commit
- Progress modal with cancel
- Post-import: collection tree expanded, grid sorted newest first

**Expected Outcome**
- Full library imported with collections + tags preserved
- Duplicates handled per user choice
- User can start organizing immediately

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| File format unrecognized | "Unsupported format. Supported: HTML (browser), JSON (Raindrop)" |
| Parse error (malformed) | Error line/column shown; "Try re-exporting from source" |
| Import hangs (large file) | Chunked processing; progress %; cancel preserves partial |
| Duplicate conflicts overwhelming | "Apply to all: Skip / Update / Add collections" bulk option |
| Collection mapping lost | "Reset to auto-map" button |

**Friction Points**
- Browser HTML exports vary → parser must be robust
- Raindrop JSON schema changes → version detection + graceful degradation
- Pocket/Pinboard not in MVP → clear "Coming soon" in UI
- Large imports (10k+) → chunked with progress; virtual scroll after

---

### Journey 8: Exporting the Resource Library

| Aspect | Details |
|--------|---------|
| **User Goal** | Full data portability — backup, migrate, or share |
| **Persona** | All (Principle 5: personal control) |
| **Starting Point** | ⌘K → "Export" or Settings → Export |
| **Preconditions** | Library has resources |

**Main Steps**
1. Select format: [JSON] [HTML] [Markdown] [CSV] (BibTeX Post-MVP)
2. Select scope: [All Resources] [Current Filter] [Selected Resources] [Collection: X]
3. Options: [Include thumbnails] [Include notes] [Flatten collections]
4. [Export] → Generates file → Download starts
5. Toast: "Exported 1,234 resources to fluid-deck-2026-11-07.json"

**User Decisions**
- Format (JSON for backup/migration; HTML for browser import; MD for Obsidian/Notion; CSV for analysis)
- Scope (current filter = shareable curated list)
- Options (thumbnails = large file; notes = Markdown only; flatten = single-level collections)

**System Responses**
- JSON: Full fidelity (all fields, nested collections, tags, metadata)
- HTML: Netscape bookmark format + Fluid Deck extensions
- Markdown: One file per resource or single file with frontmatter
- CSV: Flat rows, one per resource, columns for all fields
- Progress for large exports → "Preparing..." → "Download ready"

**Expected Outcome**
- File downloads with correct format + scope
- Round-trip fidelity: JSON import → export → import preserves all data
- User owns data in portable formats

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| Export timeout (huge library) | Chunked generation; streaming download; toast "Large export — may take a minute" |
| Format generation error | Fallback to JSON; error logged; "Trying JSON format instead" |
| Download blocked by browser | Toast "Allow downloads from this site" with instructions |

**Friction Points**
- Format choice confusion → inline descriptions: "JSON = full backup; HTML = browser import; MD = Obsidian; CSV = spreadsheet"
- Thumbnail inclusion bloats file → default off; warning on enable
- Collection flattening loses hierarchy → preview shows structure

---

### Journey 9: Handling Duplicate URLs

| Aspect | Details |
|--------|---------|
| **User Goal** | Prevent library rot; choose intent when same URL saved again |
| **Persona** | All (frequent: Chrome drag-dupe, cross-source saves) |
| **Starting Point** | Save flow (extension, import, API Post-MVP) |
| **Preconditions** | Resource with canonical URL already exists |

**Main Steps**
1. URL normalized (strip UTM, www, fragments, sort params, decode punycode)
2. Check existing by canonical URL
3. If match found → Modal: "This URL is already saved."
4. Options:
   - [Update Metadata] — refresh title/desc/image/type from current page
   - [Add to Collections] — multi-select tree → adds membership
   - [Add Tags] — tag input → adds tags
   - [Skip] — do nothing
5. User choice applied → toast confirms action
6. Grid updates if metadata/collections/tags changed

**User Decisions**
- Which action matches intent (update vs organize vs tag vs ignore)
- For import: bulk "Apply to all conflicts"

**System Responses**
- Normalization rules visible in settings (advanced)
- Modal shows existing resource preview (title, current collections, tags)
- "Update Metadata" re-extracts from current page
- "Add to Collections" shows tree with current memberships checked
- Bulk option in import: "Apply to all 47 conflicts: [Skip] [Update] [Add Collections]"

**Expected Outcome**
- No duplicate resources in library
- User intent captured (metadata refresh vs organization vs tagging)
- Library stays clean without periodic cleanup

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| False positive (different pages same canonical) | User chooses "Skip" → both saved separately (different canonical after all) |
| False negative (same page different canonical) | Perceptual hash Post-MVP catches visual duplicates |
| Modal dismissed accidentally | Toast "Duplicate detected — saved as new" with "Undo" → merges |

**Friction Points**
- Normalization rules may surprise → settings to customize (Post-MVP)
- Import bulk conflicts → "Apply to all" essential
- Cross-source (GitHub + browser) → same URL, different metadata → "Update Metadata" merges best

---

### Journey 10: Deleting and Recovering Resources

| Aspect | Details |
|--------|---------|
| **User Goal** | Remove unwanted resources safely; recover mistakes |
| **Persona** | All |
| **Starting Point** | Grid view (any filter) or detail panel |
| **Preconditions** | Resources exist |

**Main Steps**
**Single Delete**
1. Right-click resource → "Delete" / Press ⌘⌫ / Detail panel → [Delete]
2. Confirmation: "Delete [Title]? Can restore from Trash for 30 days." → [Delete] [Cancel]
3. Resource → soft delete (deleted_at timestamp) → removed from grid/collections/search

**Bulk Delete**
1. Multi-select (Shift+Click or checkboxes)
2. ⌘K → "Delete Selected" → Confirmation shows count → [Delete] [Cancel]

**Recovery**
1. ⌘K → "Trash" → Virtual collection "Trash" (filter: deleted_at not null)
2. Grid shows deleted resources with "Deleted [date]" badge
3. Single: [Restore] / [Permanently Delete]
4. Bulk: Multi-select → [Restore] / [Purge]
5. Auto-purge: Configurable (default 30 days) → hard delete

**User Decisions**
- Single vs bulk delete
- Restore vs permanent delete
- Auto-purge timeline (settings)

**System Responses**
- Soft delete = instant (no network)
- Trash accessible via ⌘K only (not in sidebar tree)
- Restore: clears deleted_at → reappears in original collections
- Purge: hard delete → confirmation "Cannot be undone"
- Export includes deleted if "Include deleted" checked

**Expected Outcome**
- Accidental deletions recoverable for 30 days
- Intentional purges permanent
- Trash doesn't clutter main navigation

**Failure & Recovery**
| Failure | Recovery |
|---------|----------|
| Restore fails (collection deleted) | Resource restored to "Unorganized"; toast "Original collection gone — restored to Unorganized" |
| Purge accidental | No recovery — "Cannot be undone" confirmed twice |
| Auto-purge runs unexpectedly | Settings show next purge date; "Pause auto-purge" option |

**Friction Points**
- Trash hidden in ⌘K → discoverability low → empty state hints "Deleted something? Press ⌘K → Trash"
- Bulk purge confirmation fatigue → "Select all → Purge" requires double-confirm
- Collection deleted with resources → resources orphaned → "Unorganized" catch-all

---

## 4. Failure and Recovery Scenarios

| Scenario | Detection | User-Facing Recovery | System Recovery |
|----------|-----------|---------------------|-----------------|
| **Extension save fails** | Network/permission error | Toast "Save failed: [reason]. Retry?" + [Retry] | Queue locally; retry on reconnect |
| **Metadata extraction fails** | No title/desc/image extracted | Fallback fields filled; user edits manually | Log failure; telemetry (opt-in) |
| **Import file corrupt** | Parse error | "File corrupted. Re-export from source." | Partial import rolled back |
| **Duplicate URL conflict** | Canonical URL exists | Modal with 4 choices (update/add/skip) | User choice applied atomically |
| **Delete collection with resources** | User confirms delete | Resources → "Unorganized"; toast shows count | Non-destructive unassign |
| **Search zero results** | FTS5 returns empty | Suggestions: broaden, spelling, synonyms, import | No system action |
| **Storage quota exceeded** | IndexedDB QuotaExceededError | Modal: "Storage full. Export backup, then delete." | Block writes until space freed |
| **Data corruption detected** | Integrity check (startup) | Modal: "Corruption detected. Restore from backup?" | Offer backup restore; quarantine corrupt |
| **Offline save (Post-MVP)** | No network | Toast "Saved locally. Will sync when online." | Queue in outbox; sync on reconnect |

---

## 5. Critical Interaction Edge Cases

| Edge Case | MVP Handling | Post-MVP Consideration |
|-----------|--------------|------------------------|
| **Save without title/description** | Fallback: `<title>` tag; favicon; type=other; user edits in panel | Smart extraction from content scripts |
| **Save URL already exists** | Duplicate modal (Journey 9) | Perceptual hash for visual duplicates |
| **Save when offline** | Local-first = works; sync queue Post-MVP | Background sync with conflict resolution |
| **Extension permission denied** | Inline prompt to grant access | Pre-request permissions on install |
| **Metadata extraction failure** | Fallback fields; type=other | Content script retry; manual override |
| **Import malformed/duplicate records** | Preview shows conflicts; skip/update/add | Validation report; auto-dedup option |
| **Delete collection with resources** | Resources → Unorganized (non-destructive) | "Move to..." option before delete |
| **Search no results** | Suggestions + import prompt | Semantic search fallback |
| **Large collection (5000+)** | Virtual scroll; lazy tree; cached facets | Pagination; archive old collections |
| **Accidental deletion** | Soft delete + 30-day Trash + ⌘K recovery | Undo toast (5s) for single deletes |
| **Collection depth >3** | UI warning; allowed but discouraged | Auto-flatten suggestion |
| **Tag explosion (500+)** | Autocomplete still works; ⌘K bulk manage | Tag clustering; suggested merges |
| **Export huge library** | Chunked streaming download | Background export + notification |

---

## 6. Journey Prioritization

| Priority | Journeys | Reasoning |
|----------|----------|-----------|
| **Critical for MVP** | 1. Onboarding & Import<br>2. Extension Save<br>3. Search & Filter<br>4. Export | Core value loop: Import → Save → Find → Own your data. Without these, product fails. |
| **Important for MVP** | 5. Edit Metadata<br>6. Collections & Tags<br>7. Duplicate Handling<br>8. Delete & Recover | Essential for organization & trust. Users expect these; missing = friction. |
| **Post-MVP** | 9. Smart Collections (saved searches as collections)<br>10. Bulk Import/Export scheduling<br>11. Offline sync & conflict resolution<br>12. Background digest agents | Enhance power users; not required for core value. |

**Smallest Coherent MVP**: Journeys 1-4 must work flawlessly. Journeys 5-8 should work well. Journeys 9-12 can wait.

---

## 7. Workflow Simplification Opportunities

| Current Flow | Friction | Simplification |
|--------------|----------|----------------|
| **Save → Collection dropdown → scroll to find** | Deep trees hard to navigate | Default to last used; search in dropdown; "New Collection..." inline |
| **Tag input → type → autocomplete** | New users don't know existing tags | Show "Popular tags" on focus; suggest from page content |
| **Multi-select → ⌘K → Tag Selected** | Discoverability low | Floating toolbar on multi-select: [Tag] [Move] [Delete] [Export] |
| **Import → Customize mapping → per-collection dropdown** | Tedious for 20+ collections | Auto-map by name (90% accurate); "Apply to all unmatched: Create new" |
| **Export → Format → Scope → Options → Export** | Too many steps for common case | Quick Export: ⌘K "Export JSON" → downloads all instantly |
| **Delete → Confirm → Trash → Restore** | Too many steps for undo | Inline undo toast (5s): "Deleted. [Undo]" → single-click recovery |
| **Duplicate modal → 4 choices** | Decision paralysis | Smart default: "Add to current collection" (most common) |
| **Collection tree → drag-drop to reorganize** | Precision targeting hard | "Move to..." command with searchable target picker |

**Keyboard Shortcuts (MVP)**
- ⌘K — Command palette
- ⌘⇧S — Save current page (extension)
- ⌘E — Edit selected resource
- ⌘⌫ — Delete selected
- / — Focus search
- j/k — Navigate grid (Post-MVP)
- Enter — Open resource
- Shift+Click — Multi-select range
- Esc — Close panel/modal/palette

---

## 8. Unresolved Product Questions

| Question | Context | Impact |
|----------|---------|--------|
| **Undo toast duration?** | 5s vs 10s vs persistent | Recovery UX; test with users |
| **Auto-purge default: 30 days?** | Configurable; GDPR considerations | Trust; storage; compliance |
| **Duplicate modal default action?** | "Add to current collection" vs "Skip" | Power vs casual user balance |
| **Collection depth warning at 3?** | Hard limit vs soft warning | Flexibility vs IA hygiene |
| **Tag naming convention enforced?** | Kebab-case vs free-form | Consistency vs freedom |
| **Import collection mapping UI?** | Per-collection dropdown vs bulk | Time-to-value for switchers |
| **Export thumbnail default off?** | File size vs fidelity | User expectation |
| **Search AND logic for tags?** | MVP: OR only; AND Post-MVP | Precision retrieval |
| **Saved search alerts?** | Post-MPV only; how to notify? | Engagement; noise |

---

## 9. Conflicts with Previous Phase 1 Documentation

**None** — All journeys align with:
- Product Vision (Principles 1, 4, 5, 7, 8)
- MVP Feature Prioritization (18 Must-Have features)
- Information Architecture (navigation, content model, organization rules, flows)

**Minor Recommendations from Journey Analysis**:
1. **List View (V2)** — Alex/Maya need dense scanning for code/design resources → Include in MVP (score 11)
2. **Smart Collections as "Saved Search as Collection"** — Prevents database rot → Minimal implementation (score 11)
3. **Floating toolbar on multi-select** — Discoverability for bulk actions → Low complexity, high value
4. **Inline undo toast (5s)** — Better than Trash for single deletes → Low complexity

---

## 10. Documents Created/Updated

- **Created**: `docs/USER_JOURNEYS_AND_WORKFLOWS.md` (this file)
- **Updated**: `docs/PROJECT_PROGRESS.md` — Phase 1.6 marked complete

---

**Next Phase**: 1.7 — Technical Architecture & Database Schema (awaiting approval)