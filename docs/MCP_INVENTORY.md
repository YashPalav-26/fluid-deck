# MCP Inventory

## Connected Servers

### Context7
- **Status:** Connected
- **Capabilities:** Fetch current library documentation, API docs, setup instructions
- **Purpose:** Up-to-date code examples for React, Next.js, Prisma, Tailwind, and other libraries
- **Phase:** All phases requiring verified library documentation
- **Priority:** Essential

### Exa
- **Status:** Connected
- **Capabilities:** Web search, advanced search with date filters, content crawling
- **Purpose:** Competitive research, market analysis, technology evaluation
- **Phase:** Phase 1 (Research), Phase 2 (Architecture)
- **Priority:** Essential

### Firecrawl
- **Status:** Connected
- **Capabilities:** Web search, page scraping, Alexandria data providers, research paper search, developer search, government search
- **Purpose:** Multi-source research, competitor analysis, academic papers
- **Phase:** Phase 1 (Research)
- **Priority:** Essential

### Chrome DevTools MCP
- **Status:** Connected
- **Capabilities:** Browser automation, page navigation, element interaction, console inspection, network monitoring, Lighthouse audits, performance tracing, screenshots
- **Purpose:** Browser testing, accessibility auditing, performance analysis, visual verification
- **Phase:** Phase 9 (QA), Phase 10 (Deployment verification)
- **Priority:** Essential

### Postman MCP
- **Status:** Connected
- **Capabilities:** API design, collection management, mock servers, monitoring, CI integration, spec generation
- **Purpose:** API contract definition, testing, mocking
- **Phase:** Phase 2 (Architecture), Phase 6 (Backend), Phase 9 (Testing)
- **Priority:** Essential

### REA
- **Status:** Connected
- **Capabilities:** Reverse engineering, binary analysis, native code inspection
- **Purpose:** Not needed for this project (web application)
- **Phase:** N/A
- **Priority:** Optional

### Playwright MCP
- **Status:** Connected
- **Capabilities:** Browser automation, form filling, screenshots, network interception
- **Purpose:** E2E testing alternative to Chrome DevTools
- **Phase:** Phase 9 (Testing)
- **Priority:** Useful

## Failed Servers

### GitHub
- **Status:** Failed to connect (400 bad request)
- **Error:** "Authorization header is badly formatted"
- **Impact:** Cannot access repositories, issues, or PRs via MCP
- **Fix needed:** Re-authenticate or regenerate GitHub token
- **Phase:** Phase 10 (Deployment)
- **Priority:** Essential — must fix before deployment phase

### autoharness:stage_skill
- **Status:** Failed to connect (CONNECTION_CLOSED)
- **Error:** "Connection closed"
- **Impact:** Cannot use skill staging automation
- **Fix needed:** Restart MCP client or check server status
- **Phase:** Skill development workflows
- **Priority:** Low — not required for Fluid Deck

## Capability Distinction
- **Installed skills** = Claude Code skills (`.claude/skills/`, plugin caches)
- **Connected MCP servers** = External tool integrations (Context7, Exa, Firecrawl, etc.)
- **Available MCP tools** = Functions exposed by connected servers
- **External plugins** = Marketplace plugins (ECC, superpowers, etc.)
- **Specialized agents** = Subagents for delegation

An installed skill does not automatically mean its associated MCP integration is connected.