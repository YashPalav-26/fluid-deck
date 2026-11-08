# Environment Audit

## Working Directory
- **Path:** `C:\Users\ADMIN\OneDrive\Documents\Github-Projex\fluid-deck`
- **Git status:** Not a git repository
- **Existing files:** docs/ directory only (3 files before reconciliation)
- **Project skills:** 0 (no `.claude/skills/` in project root)

## Windows & Shell
- **OS:** Windows 11 Home Single Language 10.0.26300
- **Primary shell:** PowerShell 7+
- **Bash available:** Git Bash (POSIX sh)

## Toolchain Versions
| Tool | Version | Status | Notes |
|------|---------|--------|-------|
| Node.js | v26.13.0 | Available | **Non-LTS** — pin to 22/20 before Phase 4 |
| npm | 12.2.2 | Available | |
| pnpm | 11.13.0 | Available | |
| Bun | 1.4.3 | Available | Preferred runtime |
| Python | 3.14.2 | Available | |
| tsc | — | **Missing** | Install globally before Phase 4 |
| jq | — | **Missing** | Install via winget for JSON processing |

## Skill Ecosystem
- **Global skills:** 80 SKILL.md files in `~/.claude/skills/`
- **Plugin cache + marketplaces:** 1,298 SKILL.md files
- **Total unique skills:** ~1,000+ after deduplication
- **Key categories:** Frontend, backend, database, security, testing, performance, documentation, deployment, cost optimization, ADHD workflow

## MCP Servers
| Server | Status | Purpose |
|--------|--------|---------|
| Context7 | Connected | Fetch current library/docs/API docs |
| Exa | Connected | Web search, agent-based research |
| Firecrawl | Connected | Web search, scraping, research papers |
| Chrome DevTools | Connected | Browser automation, debugging, Lighthouse |
| Postman | Connected | API design, testing, mocking, monitoring |
| REA | Connected | Reverse engineering, binary analysis (not needed for this project) |
| Playwright | Connected | Browser automation |
| GitHub | Failed (400) | Auth header error — needs fix before Phase 10 |

## OneDrive Considerations
- Project lives in OneDrive synced folder
- Git operations may be slower due to sync
- Avoid simultaneous edits from multiple machines
- Consider `git config core.autocrlf true` for line endings

## Development Readiness
- **Ready for:** Documentation, research, planning, architecture design
- **Not ready for:** Build/compile (missing tsc), npm installs (not executed), git operations (not initialized)
- **Recommendation:** Install `tsc` globally before Phase 4. Fix GitHub MCP auth before Phase 10.