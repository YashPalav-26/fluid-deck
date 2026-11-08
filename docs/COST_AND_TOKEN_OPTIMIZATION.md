# Cost & Token Optimization — Fluid Deck

## Verified Optimization Skills

| Skill | Status | Notes |
|-------|--------|-------|
| ponytail | ✅ Active (full) | YAGNI ladder, reduces code/output |
| ecc:token-budget-advisor | ✅ Loaded | Depth selector (25/50/75/100%) |
| ecc:context-budget | ✅ Loaded | Live `/context` meter |
| ecc:cost-aware-llm-pipeline | ✅ Loaded | Model routing + budget tracking |
| ecc:prompt-caching-strategy | ✅ Loaded | Cache reuse patterns |
| ecc:strategic-compact | ✅ Plugin-installed | Auto-suggests `/compact` at logical boundaries |
| ecc:cost-tracking | ❌ Missing | Not installed |
| ecc:cost-report | ❌ Missing | Not installed |
| ecc:token-card | ❌ Missing | Not installed |
| ecc:context-and-decisions | ❌ Missing | Not installed |
| ecc:checkpoint | ❌ Missing | Built-in `/checkpoint` CLI only |
| ecc:save-session | ❌ Missing | Not installed |
| ecc:resume-session | ❌ Missing | Not installed |

## Context Management Rules

| Rule | Action |
|------|--------|
| Read targeted sections | Use `Read` with `offset`/`limit` for large files |
| Summarize research | Write findings to `docs/` before compacting |
| Preserve decisions | Write ADRs to `docs/ADR/` |
| Never compact mid-implementation | Lose variable names, file paths |
| Compact after planning | Plan written to file → `/compact` |
| Compact after debugging | Clear error traces before new work |
| Use `/context` | Check live usage before major tasks |

## Skill Activation Rules

1. **Max 5 slash commands** per activation batch
2. **One task = one skill** (or skill set); separate across turns
3. **YAGNI** — don't activate skills "just in case"
4. **Avoid overlap** — `impeccable` not `taste` for build; `ecc:react-patterns` not `ecc:react-expert` for Phase 4
5. **Verify activation** — skill must visibly influence output

## Agent Orchestration Rules

| Scenario | Use Agent |
|----------|-----------|
| Independent competitor research | Yes (parallel) |
| Security review (Phase 9) | Yes (parallel with perf/accessibility) |
| Architecture decisions | No — primary agent |
| Same-file edits | Never parallel |
| Uncoordinated frontend/backend | Never |

## MCP Usage Strategy

| MCP | Use When | Avoid |
|-----|----------|-------|
| Context7 | Library version/API lookup | General questions |
| Exa | Competitive/market research | Documentation |
| Firecrawl | Multi-source extraction | Single-page lookup |
| Chrome DevTools | Perf/Lighthouse/accessibility | Simple navigation |
| Playwright | E2E flows | Screenshots only |
| Postman | API contract/mock/monitor | Ad-hoc requests |
| GitHub | Repo ops (when auth fixed) | Never — broken |

## Checkpoint Strategy

| Artifact | Purpose | Phase Boundary |
|----------|---------|----------------|
| `docs/PROJECT_PROGRESS.md` | Phase + task tracking | Every phase |
| `docs/ADR/*.md` | Technical decisions | When made |
| `/checkpoint` CLI | Session state snapshot | Before `/compact` |
| `docs/COST_AND_TOKEN_OPTIMIZATION.md` | Spend log | Per phase |

## Quality Safeguards (Never Skip)

- Security review (Phase 9)
- Database integrity / migration safety
- Authentication / authorization testing
- Critical error handling paths
- Regression tests for core flows
- Accessibility (WCAG 2.2 AA)
- Deployment verification (smoke + health checks)

## Fluid Deck Operating Protocol

1. **Start Phase 1** — run `/context`, set depth 50%, activate `ecc:deep-research` + `ecc:plan-prd`
2. **Before each phase** — check `/context`, write plan to file
3. **After planning** — `/compact` with summary
4. **Agent use** — specialist only for independent parallel work; reviewers at phase end
5. **MCP use** — purpose-driven; cache Context7 results in `docs/`
6. **Track spend** — log in `COST_AND_TOKEN_OPTIMIZATION.md`
7. **Never skip** — security, auth, a11y, db integrity, deploy verification