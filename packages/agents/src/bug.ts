import { AgentEngine } from '@xmai/core'
import type { AgentEvent, Harness, AgentEngineConfig } from '@xmai/core'

/**
 * Bug Agent — diagnoses and fixes issues with minimal blast radius.
 *
 * Principles:
 * - Smallest possible change that fixes the root cause
 * - Never refactor surrounding code
 * - Always verify the fix with tests
 */
export class BugAgent {
  private engine: AgentEngine

  constructor(harness: Harness, config: AgentEngineConfig) {
    this.engine = new AgentEngine(harness, config)
  }

  async *run(issue: string): AsyncGenerator<AgentEvent> {
    const prompt = `
## Bug Report
${issue}

## Your Process
1. Reproduce: understand the error message or symptom
2. Locate: find the exact file and line causing the issue
3. Root cause: understand WHY it fails (don't just fix the symptom)
4. Fix: make the minimum change needed
5. Verify: run the relevant test or command to confirm the fix

IMPORTANT: Do NOT refactor, rename, or "improve" code that is not directly related to the bug.
`
    yield* this.engine.run(prompt, 'bug')
  }

  approve(id: string) { this.engine.approve(id) }
  deny(id: string) { this.engine.deny(id) }
}
