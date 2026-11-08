# Development Workflow — Fluid Deck

## ADHD-Friendly Workflow

### Core Principles
- Lead with next action (not context/plan)
- Number multi-step tasks (one bounded action per step)
- End with one concrete next action (under 2 min)
- Suppress tangents (finish first, offer second separately)
- Restate state every turn
- Specific time estimates (no vague "some work")
- Make completed work visible (concrete terms)
- Matter-of-fact tone for errors (cause + fix)
- Cap visible lists to 5 items
- No preamble, no recap, no closing pleasantries

### Phase-Wise Development Lifecycle

| Phase | Objective | Key Activities | Gate |
|-------|-----------|----------------|------|
| 0 | Foundation & Audit | Env audit, skills, MCP, agents, cost strategy | Docs verified |
| 1 | Product Discovery | Deep research, competitive analysis, PRD, IA | PRD approved |
| 2 | Architecture | System design, DB schema, API contracts, threat model | Architecture approved |
| 3 | UI/UX Design | Design system, components, motion, accessibility | Design approved |
| 4 | Foundation | Next.js setup, TypeScript, React patterns, build config | Build green |
| 5 | Auth & Database | Auth flow, Prisma schema, migrations, RLS | Auth working |
| 6 | Backend | API routes, business logic, validation, tests | API tested |
| 7 | Frontend | Pages, components, state, integration, a11y | E2E passing |
| 8 | Advanced | Search, AI features, sync, performance | Features verified |
| 9 | Security & QA | Security audit, a11y audit, perf, load test | All green |
| 10 | Deployment | CI/CD, prod deploy, monitoring, smoke tests | Live + healthy |

## One Objective Per Turn
- Single clear goal per conversation turn
- Write plan to file before executing
- Complete or hand off cleanly

## Skill Activation Protocol
1. Check `/context` before major phase
2. Activate relevant skills (max 5 commands/batch)
3. Verify skill influenced output
4. Deactivate when phase complete

## Planning & Compacting Rules
- Write plan to `docs/` before implementation
- `/compact` after planning (summary in compact message)
- Never compact mid-implementation
- Compact after debugging before new feature
- Use `/compact Focus on [next task]`

## Agent Orchestration Rules

### Agent Inventory
- **8 Global agents:** General-purpose, Explore, Plan, Forge, Max, Gemini, Grok, PerplexityResearcher
- **32 ECC agents:** Specialized reviewers (React, TS, security, perf, etc.), builders, planners
- **3 Caveman agents:** cavecrew-investigator (locate), cavecrew-builder (1-2 file edits), cavecrew-reviewer (diff review)
- **Total:** 43 reported agents

### Phase-Wise Agent Recommendations

| Phase | Primary Agent | Reviewer Agents |
|-------|---------------|-----------------|
| 1 | ecc:planner / Research skill | ecc:agent-evaluator |
| 2 | ecc:architect / ecc:code-architect | ecc:security-reviewer, ecc:database-reviewer |
| 3 | ui-ux-pro-max / frontend-design | ecc:a11y-architect |
| 4 | ecc:react-build-resolver / ecc:nextjs-turbopack | ecc:react-review |
| 5 | ecc:prisma-patterns / database-migrations | ecc:database-reviewer |
| 6 | ecc:api-design / ecc:backend-patterns | ecc:security-reviewer, ecc:performance-optimizer |
| 7 | ecc:react-patterns / frontend-design | ecc:react-review, ecc:a11y-architect |
| 8 | ecc:performance-optimizer / Research | ecc:performance-optimizer |
| 9 | ecc:security-reviewer, ecc:a11y-architect, ecc:performance-optimizer (parallel) | ThreatModel |
| 10 | ecc:deployment-patterns | All reviewers (smoke test) |

### Parallel Execution Opportunities
1. **Independent research** — Multiple competitors/technologies in Phase 1
2. **Independent QA reviews** — Security, performance, accessibility in Phase 9 (run in parallel)
3. **Independent component work** — Separate UI components in Phase 7 (if truly independent)

### Anti-Patterns (Never)
- Same-file edits in parallel
- Uncoordinated frontend/backend agents
- Architecture decisions delegated
- Multiple agents on same PR without coordination

## Testing & Verification Requirements

| Layer | Tool | When |
|-------|------|------|
| Unit | Vitest | Every feature |
| Integration | Vitest + Testcontainers | API routes |
| E2E | Playwright / agent-browser | Critical user flows |
| Accessibility | Chrome DevTools Lighthouse + axe | Phase 9, every deploy |
| Performance | Chrome DevTools tracing | Phase 9, regressions |
| Security | ecc:security-reviewer + ThreatModel | Phase 9, pre-deploy |
| Database | Migration dry-run + RLS tests | Phase 5, every migration |

## Approval Gates

| Gate | Required | Artifacts |
|------|----------|-----------|
| Phase 0 → 1 | User | All 6 docs verified |
| Phase 1 → 2 | User | PRD, IA, competitive research |
| Phase 2 → 3 | User | Architecture, DB schema, API contracts, threat model |
| Phase 3 → 4 | User | Design system, component specs |
| Phase 4 → 5 | Build green | Next.js + TS + build passing |
| Phase 5 → 6 | Auth working | Auth flow, DB migrations applied |
| Phase 6 → 7 | API tested | Contract tests, integration tests |
| Phase 7 → 8 | E2E passing | Critical flows verified |
| Phase 8 → 9 | Features verified | Feature tests, perf baselines |
| Phase 9 → 10 | All green | Security, a11y, perf, load test reports |
| Phase 10 → Live | Smoke + health | Deploy verification |

## Session Recovery Procedure

1. Read `docs/PROJECT_PROGRESS.md` for current phase/status
2. Read `docs/ADR/*.md` for recent decisions
3. Run `/context` for live token usage
4. Check `/checkpoint` if available
5. Resume from last completed task in `PROJECT_PROGRESS.md`
6. Re-activate phase-appropriate skills