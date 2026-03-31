import { AgentEngine } from '@xmai/core'
import type { AgentEvent, Harness, AgentEngineConfig } from '@xmai/core'

export interface ReviewOptions {
  /** File paths or PR diff to review */
  targets: string[]
  /** Review focus areas */
  focus?: ('types' | 'performance' | 'security' | 'conventions' | 'tests')[]
}

/**
 * Review Agent — audits code against the project harness conventions.
 *
 * Output format:
 * - [MUST] Critical issues that block merge
 * - [SUGGEST] Improvements worth considering
 * - [OPTIONAL] Nice-to-haves
 */
export class ReviewAgent {
  private engine: AgentEngine

  constructor(harness: Harness, config: AgentEngineConfig) {
    this.engine = new AgentEngine(harness, config)
  }

  async *run(options: ReviewOptions): AsyncGenerator<AgentEvent> {
    const focus = options.focus ?? ['types', 'performance', 'security', 'conventions', 'tests']
    const focusStr = focus.join(', ')

    const prompt = `
## Code Review Request
Files to review: ${options.targets.join(', ')}
Focus areas: ${focusStr}

## Your Process
1. Read each file in full
2. Check against project conventions (from your context)
3. Identify issues by severity

## Output Format
For each issue, use:
- **[MUST]** — blocks merge, must fix
- **[SUGGEST]** — improves quality, worth discussing
- **[OPTIONAL]** — nice to have, low priority

## Check For
- Type safety: no \`any\`, proper null handling, correct generics
- Performance: unnecessary re-renders, N+1 queries, large bundle imports
- Security: XSS vectors, missing auth checks, exposed secrets
- Conventions: matches project structure and naming rules
- Tests: critical paths have test coverage

End with a one-line verdict: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
`
    yield* this.engine.run(prompt, 'review')
  }
}
