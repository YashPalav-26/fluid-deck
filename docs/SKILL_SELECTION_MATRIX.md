# Skill Selection Matrix — Fluid Deck

## Overview
- **80 global skills** evaluated (2026-11-07)
- **Verdicts:** 74 Keep, 2 Improve, 5 Update, 0 Retire
- **Project skills:** 0 (no `.claude/skills/` in project root)

## Relevant Verified Skills for Fluid Deck

| Skill | Verdict | Invocation | Phase | Purpose |
|-------|---------|------------|-------|---------|
| ponytail | Keep | `/ponytail` | All | YAGNI ladder, minimal deps |
| i-have-adhd | Keep | `/i-have-adhd` | All | ADHD-friendly workflow |
| ecc:deep-research | Keep | `/ecc:deep-research` | 1 | Multi-source research |
| ecc:competitive-platform-analysis | Keep | `/ecc:competitive-platform-analysis` | 1 | Competitor scoping |
| ecc:plan-prd | Keep | `/ecc:plan-prd` | 1 | PRD structure |
| ecc:token-budget-advisor | Keep | `/ecc:token-budget-advisor` | All | Depth control (25/50/75/100%) |
| ecc:context-budget | Keep | `/ecc:context-budget` | All | Live `/context` meter |
| ecc:strategic-compact | Keep | (auto) | All | Compaction at boundaries |
| ecc:cost-aware-llm-pipeline | Keep | `/ecc:cost-aware-llm-pipeline` | All | Model routing + budget |
| ecc:prompt-caching-strategy | Keep | `/ecc:prompt-caching-strategy` | All | Cache reuse patterns |
| frontend-design | Keep | `/frontend-design` | 3, 7 | UI/UX patterns |
| ui-ux-pro-max | Keep | `/ui-ux-pro-max` | 3, 7 | Comprehensive design system |
| motion-design | Keep | `/motion-design` | 3, 7 | Library-agnostic motion |
| vercel-react-best-practices | Keep | `/vercel-react-best-practices` | 4, 7 | Vercel-specific React |
| web-design-guidelines | Keep | `/web-design-guidelines` | 3, 7 | Vercel interface guidelines |
| ecc:nextjs-turbopack | Keep | `/ecc:nextjs-turbopack` | 4 | Next.js 16+ dev |
| ecc:typescript-patterns | Keep | `/ecc:typescript-patterns` | 4+ | TypeScript best practices |
| ecc:react-patterns | Keep | `/ecc:react-patterns` | 4+ | React patterns |
| ecc:react-build-resolver | Keep | `/ecc:react-build-resolver` | 4+ | Build failures |
| ecc:react-review | Keep | `/ecc:react-review` | 4+ | Code review |
| ecc:prisma-patterns | Keep | `/ecc:prisma-patterns` | 2, 5 | Prisma ORM |
| ecc:postgres-patterns | Keep | `/ecc:postgres-patterns` | 2, 5 | PostgreSQL |
| ecc:database-migrations | Keep | `/ecc:database-migrations` | 5 | Migration safety |
| ecc:api-design | Keep | `/ecc:api-design` | 2, 6 | API contracts |
| ecc:security-review | Keep | `/ecc:security-review` | 9 | Security audit |
| ecc:accessibility | Keep | `/ecc:accessibility` | 9 | WCAG 2.2 AA |
| ecc:performance-optimizer | Keep | `/ecc:performance-optimizer` | 9 | Perf optimization |
| ecc:e2e-testing | Keep | `/ecc:e2e-testing` | 9 | Playwright/agent-browser |
| ecc:deployment-patterns | Keep | `/ecc:deployment-patterns` | 10 | Deploy |
| Research | Keep | `/Research` | 1 | Multi-agent research |
| SystemsThinking | Keep | `/SystemsThinking` | 2 | Structural analysis |
| ThreatModel | Keep | `/ThreatModel` | 9 | Threat modeling |
| ISA | Keep | `/ISA` | 1, 2 | Ideal state artifacts |
| Interview | Keep | `/Interview` | 1 | Context refresh |
| caveman | Keep | `/caveman` | All | Token compression |
| cavecrew | Keep | `/cavecrew` | All | Delegation guide |
| extract-design-system | Keep | `/extract-design-system` | 3 | From Impeccable mocks |

## Phase-Wise Skill Recommendations

| Phase | Primary Skills | Supporting Skills |
|-------|----------------|-------------------|
| 0 (complete) | ponytail, i-have-adhd, ecc:token-budget-advisor, ecc:context-budget, ecc:strategic-compact | ecc:cost-aware-llm-pipeline, ecc:prompt-caching-strategy |
| 1: Product Discovery | ecc:deep-research, ecc:competitive-platform-analysis, ecc:plan-prd, Research, ISA, Interview | ecc:token-budget-advisor (50%), ecc:context-budget |
| 2: Architecture | SystemsThinking, ThreatModel, ecc:api-design, ecc:prisma-patterns, ecc:postgres-patterns, ecc:database-migrations | ISA, ecc:typescript-patterns |
| 3: UI/UX Design | ui-ux-pro-max, frontend-design, motion-design, extract-design-system, vercel-react-best-practices, web-design-guidelines | ecc:accessibility |
| 4: Foundation | ecc:nextjs-turbopack, ecc:typescript-patterns, ecc:react-patterns, ecc:react-build-resolver, vercel-react-best-practices | ponytail |
| 5: Auth & DB | ecc:prisma-patterns, ecc:postgres-patterns, ecc:database-migrations | ecc:security-review |
| 6: Backend | ecc:api-design, ecc:security-review | ecc:performance-optimizer |
| 7: Frontend | ecc:react-patterns, ecc:react-review, frontend-design, ui-ux-pro-max, motion-design | vercel-react-best-practices |
| 8: Advanced | ecc:performance-optimizer, Research | ecc:cost-aware-llm-pipeline |
| 9: Security & QA | ecc:security-review, ecc:accessibility, ecc:performance-optimizer, ecc:e2e-testing, ThreatModel | Chrome DevTools, Playwright |
| 10: Deployment | ecc:deployment-patterns | GitHub MCP (needs fix) |

## Design Overlap Rules

| Conflict | Rule |
|----------|------|
| Impeccable vs Taste | Use **Impeccable** for build (production), **Taste** for direction/consultation only |
| ui-ux-pro-max vs motion-design | Use **ui-ux-pro-max** for GSAP presets, **motion-design** for library-agnostic foundations |
| frontend-design vs vercel-react-best-practices | Use **frontend-design** for patterns, **vercel-react-best-practices** for Vercel-specific |
| ecc:react-patterns vs react-expert | Use **ecc:react-patterns** for Phase 4+ (ECC maintained), **react-expert** for expert consult |

## Skills to Avoid Activating Together

| Combination | Reason |
|-------------|--------|
| Impeccable + Taste (both active) | Overlap in design direction — Taste supersedes for consultation, Impeccable for build |
| ui-ux-pro-max + frontend-design (both primary) | Both cover UI patterns — pick one as primary |
| ecc:deep-research + Research (both full depth) | Both do multi-agent research — use one at a time |
| ponytail ultra + i-have-adhd | Conflicting output styles — use ponytail full + i-have-adhd |

## Five-Command Maximum Per Batch
```
Max 5 slash commands per manual activation batch
One task = one skill (or skill set); separate across turns
YAGNI — don't activate skills "just in case"
Verify activation — skill must visibly influence output
```

## Missing Optimization Skills (Not Installed)
- ecc:cost-tracking
- ecc:cost-report
- ecc:token-card
- ecc:context-and-decisions
- ecc:checkpoint (built-in CLI only)
- ecc:save-session
- ecc:resume-session