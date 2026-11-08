# Target Users & Personas — Fluid Deck

*Generated: 2026-11-07 | Based on: Product Vision + Competitive Research | Phase: 1.3*

---

## 1. User Segment Analysis

| Segment | Resources Saved | Primary Trigger | Current Workaround | Pain Severity | Adoption Likelihood |
|---------|-----------------|-----------------|-------------------|---------------|---------------------|
| **Software Developers** | GitHub repos, API docs, tutorials, dev tools, code snippets, Stack Overflow, technical blogs | Need to reference later during implementation/debugging | Browser bookmarks + GitHub stars + local files | High | High |
| **Designers/Creative Pros** | Dribbble/Behance shots, UI kits, color palettes, fonts, design systems, inspiration sites | Visual reference for active projects | Pinterest, Figma files, browser tabs, local folders | High | High |
| **Researchers/Knowledge Workers** | Academic papers, articles, reports, datasets, reference materials | Literature review, citation, future retrieval | Zotero, Pocket, browser bookmarks, Notion | High | Medium |
| **AI Enthusiasts/Tool Explorers** | AI tool sites, prompt libraries, model cards, research papers, newsletters | Rapidly evolving landscape, need to track/compare | Browser tabs, Notion, bookmarks, Discord saves | Medium | High |
| **Productivity-Focused Professionals** | Productivity tools, workflow articles, templates, courses, newsletters | Optimize personal/work systems | Browser bookmarks, Pocket, Notion, Raindrop | Medium | Medium |
| **CS/IT Students** | Tutorials, documentation, code examples, cheat sheets, project refs | Coursework, projects, interview prep | Browser bookmarks, GitHub stars, Notion, Obsidian | Medium | Medium |
| **Content Creators/Digital Collectors** | Reference articles, media assets, tools, trends, competitor content | Content creation, research, archiving | Browser bookmarks, Pinterest, Notion, local folders | Low-Medium | Low-Medium |

**Key Insight**: Developers and designers show highest pain + adoption likelihood. Researchers have high pain but entrenched tools (Zotero). AI enthusiasts are emerging high-value segment with weak current solutions.

---

## 2. Evidence-Informed Personas

### Persona 1: "Alex" — Full-Stack Developer

| Attribute | Details |
|-----------|---------|
| **Segment** | Software Developer |
| **Role** | Senior full-stack engineer at mid-size SaaS company |
| **Goals** | Ship features fast; maintain personal knowledge base of patterns/tools; reduce context-switching |
| **Saving Habits** | 15-25 saves/week. GitHub repos (star + save), API docs, technical blogs, Stack Overflow answers, npm packages, dev tools |
| **Current Workflow** | GitHub stars (repos), browser bookmarks (docs/articles), Notion (personal notes), local markdown files (code snippets). Uses Raycast for quick access |
| **Frustrations** | GitHub stars become unsearchable graveyard; browser bookmarks lack code-aware metadata (language, framework); can't search "that React hook for debouncing"; duplicates across stars/bookmarks/Notion; no cross-device sync for local files |
| **Org Preferences** | Implicit: by tech stack (React, Node, PostgreSQL), by purpose (learning, reference, production-ready). Wants auto-tagging but manual override |
| **Search Expectations** | "React form validation library" → shows saved repos + articles + docs filtered by type. Sub-2-second. Code snippet search |
| **Essential Fluid Deck Features** | GitHub-aware capture (auto-extract stars/topics/language), code snippet extraction, tech-stack auto-tags, CLI capture for terminal-discovered tools, local-first (company policy) |
| **Adoption Barriers** | Switching cost from GitHub stars + Notion; needs import from both; team sharing not needed but export for onboarding docs is |

> **Research-supported**: GitHub stars as broken bookmark system (competitive research); developer pain with scattered sources (product vision); local-first requirement (vision principle #5). **Inferred**: Raycast usage, 15-25 saves/week, specific search queries.

---

### Persona 2: "Maya" — Product Designer

| Attribute | Details |
|-----------|---------|
| **Segment** | Designer/Creative Professional |
| **Role** | Product designer at fintech startup; side freelance |
| **Goals** | Build visual reference library; find inspiration fast during design sprints; maintain design system references |
| **Saving Habits** | 20-30 saves/week. Dribbble/Behance shots, Figma community files, design system docs, color palettes, font specimens, UI pattern sites, competitor screenshots |
| **Current Workflow** | Pinterest boards (public inspiration), Figma files (work assets), browser bookmarks (reference sites), local folders (downloaded assets), Are.na (mood boards) |
| **Frustrations** | Pinterest = public only, no private collections; Figma = work-only, no personal; browser bookmarks = no visual preview; Are.na = no AI tagging, basic search; can't search "dark mode dashboard with sidebar"; folder paralysis across tools |
| **Org Preferences** | Visual-first: grid/masonry views. Collections by pattern type (navigation, forms, dashboards, onboarding). Tags by style (minimal, dense, playful, enterprise). Smart views: "recent inspiration," "design system refs" |
| **Search Expectations** | Visual similarity search ("show me more like this card"), color/brand search, type-aware filters (mobile vs desktop, web vs native). Sub-3-second visual results |
| **Essential Fluid Deck Features** | Type-aware cards (Dribbble shot ≠ Figma file ≠ article), visual grid/masonry, perceptual hash dedup (same screenshot saved twice), color/brand extraction, import from Pinterest/Figma/Are.na, optional sync for personal+work separation |
| **Adoption Barriers** | Heavy Pinterest/Figma investment; visual parity required; needs mobile capture for on-the-go inspiration (conferences, mobile browsing) |

> **Research-supported**: Designer segment from vision + competitive research (mymind/Raindrop/Are.na target designers); visual search gap (mymind has color/brand but no semantic); folder paralysis (competitive research). **Inferred**: 20-30 saves/week, specific tool stack, freelance separation need.

---

### Persona 3: "Dr. Chen" — Academic Researcher

| Attribute | Details |
|-----------|---------|
| **Segment** | Researcher/Knowledge Worker |
| **Role** | CS professor + ML researcher; publishes 3-4 papers/year |
| **Goals** | Maintain comprehensive literature library; trace idea evolution; cite accurately; share reading lists with students |
| **Saving Habits** | 10-15 saves/week (papers), 50+ during literature review. ArXiv papers, conference proceedings, blog posts, datasets, GitHub repos (code), survey articles |
| **Current Workflow** | Zotero (primary — citations, PDFs, tags), browser bookmarks (quick saves), Notion (reading notes/synthesis), Google Scholar library, local PDF folders |
| **Frustrations** | Zotero = citation-focused, not discovery; no visual preview of papers; can't search "that transformer attention visualization"; web content (blogs, GitHub) doesn't fit Zotero model; duplicate PDFs across Zotero/local; no semantic search across papers+web |
| **Org Preferences** | Collections by research topic (attention mechanisms, diffusion models, eval benchmarks). Tags by paper type (survey, novel-arch, benchmark, code). Smart filters: "has code," "recent," "highly cited" |
| **Search Expectations** | Semantic search: "papers on efficient attention for long context" → finds relevant saved papers + blog posts + GitHub repos. Citation-aware export (BibTeX) |
| **Essential Fluid Deck Features** | ArXiv/DOI metadata extraction (authors, venue, year, citations), PDF full-text indexing, citation export (BibTeX/CSL), semantic search across papers+web, import from Zotero/Google Scholar, reader mode for PDFs |
| **Adoption Barriers** | Zotero lock-in (10+ years of library, citation workflow); collaboration with students (shared libraries); BibTeX export non-negotiable; needs PDF annotation (highlight/notes) |

> **Research-supported**: Researcher segment from vision; Zotero as primary tool (competitive research); semantic search gap (only Fabric has it); citation needs. **Inferred**: 10-15 saves/week, specific topic tags, student sharing requirement.

---

### Persona 4: "Sam" — AI Tool Explorer

| Attribute | Details |
|-----------|---------|
| **Segment** | AI Enthusiast/Tool Explorer |
| **Role** | ML engineer + AI newsletter writer; evaluates 10+ new tools/week |
| **Goals** | Track rapidly evolving AI landscape; compare tools; build personal "AI toolbox"; reference for writing/speaking |
| **Saving Habits** | 30-50 saves/week. New AI tool launches, model cards (Hugging Face), prompt libraries, research papers, GitHub repos, Discord/Reddit discussions, newsletters, pricing pages |
| **Current Workflow** | Browser tabs (tab hoarder — 200+), Raindrop (bookmarks), Notion (comparison tables), Discord saved messages, GitHub stars, local screenshots |
| **Frustrations** | Tab overload; Raindrop = no AI-specific metadata (model type, pricing, API vs local); Notion = manual comparison tables rot; can't search "local LLM with function calling under 7B params"; no automated "what's new this week" digest |
| **Org Preferences** | Auto-categorize by: model type (LLM, embedding, diffusion), deployment (API, local, hybrid), capability (chat, code, image, audio), pricing tier. Smart collections: "local LLMs," "new this week," "has free tier" |
| **Search Expectations** | Faceted: "open-source embedding models with >1024 dim" → filtered results. Semantic: "alternatives to Pinecone for small scale" → saved articles + repos + discussions |
| **Essential Fluid Deck Features** | AI-specific auto-tags (model type, capability, deployment, pricing), GitHub/Hugging Face metadata extraction, semantic search across tools+papers+discussions, background agents for "new this week" digest, CLI capture for terminal-discovered tools |
| **Adoption Barriers** | Raindrop has free tier + import; needs clear AI-differentiated value; Discord/Reddit capture important; comparison table export (Markdown/CSV) for newsletter |

> **Research-supported**: Emerging segment from competitive research (Fabric targets "tab hoarders"); AI tool metadata gap (no competitor has model-type/deployment/pricing tags); background agents (Fabric has weekly digests). **Inferred**: 30-50 saves/week, newsletter use case, specific facet taxonomy.

---

### Persona 5: "Jordan" — Productivity Systems Builder

| Attribute | Details |
|-----------|---------|
| **Segment** | Productivity-Focused Professional |
| **Role** | Engineering manager; builds personal productivity system; mentors team |
| **Goals** | Curate high-signal resource library; reduce information overload; share curated lists with team; maintain "second brain" |
| **Saving Habits** | 8-12 saves/week. Productivity tools, workflow articles, templates, courses, newsletters, management books summaries, tool reviews |
| **Current Workflow** | Raindrop (bookmarks + highlights), Notion (second brain + templates), Pocket (read-later), Obsidian (linked notes), browser bookmarks (quick) |
| **Frustrations** | Raindrop = no local-first, subscription for full-text search; Notion = database rot, manual maintenance; Pocket = read-later not reference; Obsidian = steep learning curve; scattered across 4 tools; no unified search |
| **Org Preferences** | PARA-inspired: Projects, Areas, Resources, Archives. Collections by area (team-mgmt, personal-finance, health, learning). Smart filters: "actionable," "reference," "archive" |
| **Search Expectations** | Unified search across all saved content. "Meeting template" → finds Notion template + Raindrop article + saved PDF. Sub-2-second |
| **Essential Fluid Deck Features** | Local-first (privacy), import from Raindrop/Notion/Pocket, PARA-compatible collections + smart filters, unified search across types, export for team sharing (Markdown/CSV), optional sync for personal+work devices |
| **Adoption Barriers** | High switching cost (4-tool ecosystem); Raindrop Pro already paid; Notion as second brain deeply entrenched; needs clear "one tool replaces 3" value |

> **Research-supported**: Power user segment from vision; multi-tool fragmentation (competitive research); PARA methodology known in productivity space; local-first + privacy (vision principles). **Inferred**: 8-12 saves/week, specific PARA usage, team sharing need.

---

### Persona 6: "Taylor" — CS Student

| Attribute | Details |
|-----------|---------|
| **Segment** | CS/IT Student |
| **Role** | Junior CS major; internship hunting; side projects |
| **Goals** | Build portfolio of learning resources; prep for technical interviews; manage course materials + side project refs |
| **Saving Habits** | 10-20 saves/week (semester), 5-10 (break). Tutorials, LeetCode solutions, system design articles, GitHub repos (starter kits), documentation, cheat sheets, career resources |
| **Current Workflow** | Browser bookmarks (messy folders), GitHub stars (repos), Notion (course notes + interview prep), Obsidian (some), local PDF folders (downloaded lectures) |
| **Frustrations** | Browser bookmarks = folder paralysis; GitHub stars = no context (why starred?); Notion = manual org, doesn't capture web well; can't search "that DP pattern for interval problems"; no offline access in library/commute |
| **Org Preferences** | Simple: by course (CS101, Algorithms, Systems), by interview topic (DP, graphs, system design), by project. Tags: "tutorial," "reference," "practice," "portfolio" |
| **Search Expectations** | "System design practice" → saved articles + GitHub repos + notes. Offline access critical. Free/cheap pricing |
| **Essential Fluid Deck Features** | Free tier generous (student budget), offline-first (IndexedDB), GitHub-aware capture, simple collections + tags, import from browser/Notion, Markdown export for Obsidian/Notion sync, mobile PWA for campus |
| **Adoption Barriers** | Zero budget; entrenched free tools (browser, GitHub, Notion free); needs clear "better than free" value; mobile critical for campus |

> **Research-supported**: Student segment from competitive research (Are.na 50% student discount, Fabric targets students); budget sensitivity; offline need (competitive research: no competitor has true offline). **Inferred**: Semester-based saving patterns, specific course/interview taxonomy, Obsidian/Notion sync need.

---

## 3. Jobs-to-be-Done

### Capture Jobs
- **JTBD-C1**: When I discover a useful resource while browsing, I want to save it in <2 seconds with zero mandatory fields so I don't lose momentum.
- **JTBD-C2**: When I find a resource in terminal/CLI (npm package, GitHub repo, API endpoint), I want to save it without switching to browser so context is preserved.
- **JTBD-C3**: When I'm on mobile and see something valuable, I want to save it via share sheet so it syncs to my library automatically.
- **JTBD-C4**: When I have existing libraries in Raindrop/Pocket/Zotero/Notion, I want to import them once so I start with my history, not empty state.

### Organization Jobs
- **JTBD-O1**: When I save a resource, I want it auto-categorized by type/topic/source so I don't manually tag hundreds of items.
- **JTBD-O2**: When my library grows, I want dynamic views (smart collections) that update automatically so folders don't rot.
- **JTBD-O3**: When I save duplicates, I want them detected at save time so my library stays clean without periodic cleanup.
- **JTBD-O4**: When I need structure, I want collections + tags + filters that I can customize so my mental model matches the tool.

### Retrieval Jobs
- **JTBD-R1**: When I need a resource I saved months ago, I want to find it in <5 seconds by keyword, topic, type, or visual similarity so I don't re-search the web.
- **JTBD-R2**: When I remember "that article about X with the blue header," I want visual/color/brand search so vague memory retrieves the right item.
- **JTBD-R3**: When I search for a concept, I want semantic results (meaning-based) not just keyword matches so "efficient attention" finds "linear attention" papers.
- **JTBD-R4**: When I'm coding/designing/writing, I want inline previews (code snippets, thumbnails, reader mode) so I evaluate results without opening tabs.

### Portability Jobs
- **JTBD-P1**: When I want to leave Fluid Deck, I want full export (JSON/HTML/Markdown/CSV) so my data is never trapped.
- **JTBD-P2**: When I work across personal+work devices, I want optional encrypted sync so my library follows me without vendor lock-in.
- **JTBD-P3**: When I need to share a curated list (onboarding doc, reading list), I want clean export so recipients don't need Fluid Deck.
- **JTBD-P4**: When I self-host for privacy, I want a Docker sync server so I control my data entirely.

---

## 4. Segment Prioritization

| Segment | Problem Severity (1-5) | Frequency (1-5) | Product Fit (1-5) | MVP Feasibility (1-5) | Adoption Potential (1-5) | Diff. Opportunity (1-5) | **Total** | Priority |
|---------|------------------------|-----------------|-------------------|----------------------|--------------------------|------------------------|-----------|----------|
| Software Developers | 5 | 5 | 5 | 4 | 5 | 5 | **29** | **Primary** |
| Designers/Creative Pros | 5 | 5 | 5 | 4 | 5 | 4 | **28** | **Primary** |
| AI Enthusiasts/Tool Explorers | 4 | 5 | 5 | 3 | 4 | 5 | **26** | **Secondary** |
| Researchers/Knowledge Workers | 5 | 4 | 4 | 3 | 3 | 4 | **23** | **Secondary** |
| Productivity Professionals | 4 | 3 | 4 | 4 | 3 | 3 | **21** | **Defer** |
| CS/IT Students | 4 | 4 | 4 | 5 | 3 | 3 | **23** | **Defer** |
| Content Creators/Collectors | 3 | 3 | 3 | 4 | 2 | 2 | **17** | **Defer** |

**Scoring rationale**:
- **Problem Severity**: How acute is "finding > saving" + "scattered sources" + "metadata poverty" for this segment?
- **Frequency**: How often do they save/retrieve resources?
- **Product Fit**: How well does Fluid Deck's vision (local-first, auto-metadata, hybrid search, visual, portable) match their workflow?
- **MVP Feasibility**: Can core features serve this segment without deferred features (AI chatbot, collaboration, native mobile)?
- **Adoption Potential**: Willingness to switch + switching cost + budget availability.
- **Differentiation Opportunity**: How much does Fluid Deck's unique combo (local-first + universal capture + hybrid search + portability) beat incumbents for this segment?

**Primary**: Developers + Designers (highest scores, aligned with vision's "developers, designers, researchers, power users")
**Secondary**: AI Enthusiasts + Researchers (high fit, but Researchers have Zotero lock-in; AI enthusiasts are emerging)
**Defer**: Productivity pros (entrenched 4-tool stack), Students (budget + free-tool inertia), Content creators (lower pain)

---

## 5. User Needs by Priority

| Need | Priority | Connected Problem | Segment(s) |
|------|----------|-------------------|------------|
| Save from browser/CLI/API in <2s | Essential | Finding > saving; scattered sources | All |
| Auto-extract metadata (title, desc, image, type, tags) | Essential | Metadata poverty; manual tagging burden | All |
| Hybrid search: keyword + semantic + visual | Essential | Weak search; no semantic (except Fabric) | Developers, Designers, AI, Researchers |
| Local-first storage (SQLite/IndexedDB) | Essential | Personal control; privacy; no vendor lock-in | Developers, Researchers, Productivity |
| Collections + smart filters + saved searches | Essential | Collection paralysis; folder overload | All |
| Visual grid/list with type-aware cards | Essential | Visual clarity; scan don't read | Designers, Developers, AI, Researchers |
| Duplicate detection at save (URL + perceptual hash) | Essential | Duplicate waste | All |
| Import: HTML, JSON, Raindrop, Pocket, Pinboard, Zotero | Essential | Walled garden (mymind); switching cost | All |
| Export: JSON, HTML, Markdown, CSV, BibTeX | Essential | Personal control; portability | All |
| Optional encrypted sync (self-hostable) | Important | Personal control; cross-device | Developers, Designers, Researchers, Productivity |
| Code-aware capture (GitHub stars, npm, snippets) | Important | Scattered sources (GitHub + browser) | Developers, AI |
| AI-specific metadata (model type, deployment, pricing) | Important | No competitor has this | AI Enthusiasts |
| Citation metadata (DOI, authors, venue, BibTeX) | Important | Researcher workflow gap | Researchers |
| Reader mode (distraction-free + progress sync) | Important | Read-later ≠ reference; context loss | Researchers, Developers, Productivity |
| Mobile PWA + share target capture | Important | Mobile capture gap (Notion fails) | Designers, Students, AI |
| Keyboard-first command palette | Important | Power user efficiency | Developers, Designers, Productivity |
| Background agents (weekly digest, new tool alerts) | Optional | Information overload; staying current | AI, Researchers, Productivity |
| PDF annotation (highlights, notes) | Optional | Researcher citation workflow | Researchers |
| Team sharing / curated list publishing | Future | Out of scope per vision | — |
| AI chatbot/Q&A over local corpus | Future | Defer to Phase 8+ | — |
| Native iOS/Android apps | Future | PWA covers 80%; Phase 10+ | — |
| RSS/feed reader integration | Future | Separate category (Pocket territory) | — |

---

## 6. Adoption Barriers by Segment

| Segment | Primary Barrier | Secondary Barrier | Mitigation |
|---------|-----------------|-------------------|------------|
| Developers | GitHub stars + Notion switching cost | Team onboarding needs export | Import from both; Markdown export for docs |
| Designers | Pinterest/Figma visual parity | Mobile capture for conferences | Type-aware cards; PWA share target |
| Researchers | Zotero lock-in (10+ yrs, citations) | Student collaboration (shared libs) | Zotero import; BibTeX export; reader mode |
| AI Enthusiasts | Raindrop free tier + import | Discord/Reddit capture | AI-specific tags; CLI capture; digest agents |
| Productivity | 4-tool ecosystem (Raindrop/Notion/Pocket/Obsidian) | Raindrop Pro already paid | Import all 4; unified search replaces 3 |
| Students | Zero budget; free tool inertia | Mobile critical for campus | Generous free tier; offline PWA; student pricing |
| Content Creators | Low pain; Notion/Pinterest sufficient | No clear differentiator | Defer — not primary target |

---

## 7. Validation Questions (Require User Research)

| Assumption | Validation Method | Priority |
|------------|-------------------|----------|
| **Do users really need local-first storage?** | Survey: "How important is local-only data control?" (1-5); interview privacy-conscious devs | High |
| **Is optional sync important vs. required?** | A/B test landing page: "local-first + optional sync" vs "cloud sync included" | High |
| **Is hybrid search worth implementation complexity?** | Prototype: keyword vs keyword+semantic; measure task completion time + satisfaction | High |
| **How important is browser extension vs CLI vs API?** | Telemetry on capture methods (if prototype exists); survey developers on workflow | High |
| **Do users prefer folders, collections, tags, or combo?** | Card sort exercise with 20+ users; observe organization behavior in prototype | High |
| **Would developers use CLI/API capture?** | Interview 10 devs: "How often do you find tools in terminal?"; prototype CLI usage | Medium |
| **What makes users switch from Raindrop/browser bookmarks?** | Switch interview: recent switchers (Raindrop→other, browser→Raindrop); identify triggers | Medium |
| **Is visual similarity search (perceptual hash) valued?** | Prototype: show "similar cards" feature; measure engagement + qualitative feedback | Medium |
| **Do researchers need BibTeX export + PDF annotation?** | Interview 5 academic researchers; test Zotero import + BibTeX export fidelity | Medium |
| **Is AI-specific metadata (model type, pricing, deployment) valuable?** | Survey AI newsletter writers/tool explorers; track facet usage in prototype | Medium |
| **How generous must free tier be for students?** | Pricing sensitivity survey (Van Westendorp) with student segment | Low |
| **Is self-hosted sync server (Docker) a real need or nice-to-have?** | Interview privacy-advocate devs; measure "would pay for" vs "would use if free" | Low |

---

## 8. Summary for Decision-Makers

**Primary Target Audience**: Software Developers + Designers/Creative Professionals  
**Secondary**: AI Enthusiasts/Tool Explorers + Researchers/Knowledge Workers  
**Defer**: Productivity Professionals, CS Students, Content Creators

**Most Important Personas**: Alex (Developer), Maya (Designer), Sam (AI Explorer) — cover 3 primary/secondary segments with highest differentiation opportunity

**Top User Problems** (validated by competitive research):
1. Finding > Saving — retrieval fails at scale
2. Context loss — why saved? what part matters?
3. Scattered sources — GitHub + browser + Notion + tabs
4. Metadata poverty — no auto-tags, descriptions, thumbnails
5. Weak search — keyword only, no semantic/visual
6. Folder paralysis — organization collapses >50 items

**Jobs-to-be-Done**: 16 JTBDs across Capture (4), Organization (4), Retrieval (4), Portability (4)

**Recommended User Priorities**: Build for Alex + Maya first (highest score, clearest differentiation). Sam informs AI-specific metadata features. Dr. Chen informs citation/PDF needs but Zotero import is gate.

**Assumptions Requiring Validation**: 12 questions — top 5 are high priority (local-first, sync model, hybrid search value, capture methods, organization preferences)

**Documents Created**: `docs/TARGET_USERS_AND_PERSONAS.md` (this file)

---

**Next Phase**: 1.4 — Feature Discovery & MVP Prioritization (awaiting approval)