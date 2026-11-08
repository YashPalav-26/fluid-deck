# Product Vision — Fluid Deck

## Executive Summary
Fluid Deck is a premium personal digital library and smart bookmark manager. It solves the problem of scattered, disorganized, and hard-to-rediscover internet resources by providing effortless capture, intelligent organization, and instant retrieval — all with visual clarity and personal control.

## Problem Statement
Users accumulate valuable resources across browsers, apps, and devices but cannot reliably find them when needed. Conventional bookmarks lack context, metadata, search, and cross-platform sync. Collections become overwhelming and unused.

## Product Vision
A personal knowledge hub where every saved resource is instantly findable, richly contextualized, and effortlessly organized — so users spend zero time managing bookmarks and all time using what they saved.

## Positioning Statement
**For** knowledge workers, developers, designers, researchers, and curious learners **who** collect hundreds of useful links across topics **Fluid Deck** is a **smart personal library** that **auto-organizes, enriches, and instantly retrieves resources** unlike browser bookmarks, Raindrop.io, or Notion which **require manual tagging, lack rich previews, or treat bookmarks as second-class notes**.

## Target Audience Hypotheses
| Segment | Trigger | Current Workaround |
|---------|---------|-------------------|
| Developers | Saving GitHub repos, docs, tools | Browser bookmarks + starred repos |
| Designers | Collecting inspiration, UI patterns | Pinterest, Figma files, browser tabs |
| Researchers | Accumulating papers, articles | Zotero, Pocket, browser bookmarks |
| Power users | Cross-topic resource management | Multiple tools, mental overhead |

## Core Problems (Prioritized)
1. **Finding is harder than saving** — Users save freely but cannot retrieve reliably
2. **Context loss** — Why was this saved? What part matters? Gone without notes
3. **Scattered sources** — Browser bookmarks, Pocket, starred repos, downloads, tabs
4. **Metadata poverty** — No auto-extracted tags, descriptions, thumbnails, categories
5. **Weak search** — Text-only, no filters by type/topic/date/source/quality
6. **Duplicate waste** — Same resource saved multiple times unknowingly
6. **Collection paralysis** — Folders grow unusable; users stop organizing

## Product Principles
1. **Effortless capture** — One click/keyboard shortcut from anywhere; no mandatory fields
2. **Intelligent organization** — Auto-categorize, tag, deduplicate; manual override always available
3. **Instant retrieval** — Sub-second search with filters; visual results with rich previews
4. **Visual clarity** — Thumbnail grid, card views, type icons; scan don't read
5. **Personal control** — Local-first option, export anytime, no vendor lock-in
6. **Reliable persistence** — Never lose a saved resource; conflict-free sync
7. **Privacy by default** — No tracking, no data selling, optional cloud sync
8. **Simplicity with depth** — Simple surface; power features discoverable, not forced

## Product Boundaries
**In Scope (MVP)**
- Save from browser extension, CLI, API
- Auto-extract metadata (title, description, image, tags, type)
- Full-text + faceted search
- Collections + smart filters (type, topic, date, source)
- Visual grid/list views
- Duplicate detection
- Export/import (JSON, HTML, Markdown)
- Local-first storage with optional sync

**Out of Scope (Explicit)**
- General note-taking (use Obsidian, Notion)
- Project/task management (use Linear, Todoist)
- Social features, sharing, collaboration
- AI chatbot or content generation
- RSS/feed reader
- Read-later/offline reading (Pocket/Omnivore territory)
- Team workspaces

## Differentiation Hypotheses
| vs Competitor | Fluid Deck Advantage |
|---------------|---------------------|
| Browser bookmarks | Auto-metadata, search, cross-browser, visual |
| Raindrop.io | Local-first, no subscription, richer previews, faster |
| Notion | Purpose-built for links, not documents; instant capture |
| Pinboard | Modern UX, visual, auto-organization, free tier |
| Pocket | Not read-later; library for reference + action |
| Are.na | Personal not social; developer/designer focused |

## Success Metrics (Proposed Targets)
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Time to save | < 2 seconds | Extension click → confirmed |
| Time to find | < 5 seconds | Query → open result |
| Metadata extraction rate | > 90% | Auto-fields populated / total saves |
| Search relevance (P@5) | > 80% | User click-through on top 5 |
| Duplicate detection | > 95% | Detected / actual duplicates |
| Data integrity | 0 loss | Automated integrity checks |
| Sync conflict rate | < 0.1% | Conflicts / sync operations |

## Open Questions
1. **Local-first vs cloud-first** — Primary storage model affects architecture
2. **Browser extension scope** — Chrome only? Firefox? Safari? Manifest v3?
3. **AI-assisted tagging** — Local embedding model? Cloud API? Defer to Phase 8?
4. **Pricing model** — Free + paid sync? One-time? Subscription?
5. **Mobile capture** — iOS Shortcuts? Android share target? PWA?
6. **Import priority** — Which existing tools to support first (Raindrop, Pocket, Pinboard)?
7. **Self-hosted option** — Docker image for privacy-conscious users?
8. **Offline support** — Service worker + IndexedDB for full offline access?

---
*Status: DRAFT — product vision only. Competitive research and PRD pending.*