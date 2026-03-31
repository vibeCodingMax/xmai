import { AgentEngine } from '@aiagent/core'
import type { AgentEvent } from '@aiagent/core'
import type { Harness } from '@aiagent/core'
import type { AgentEngineConfig } from '@aiagent/core'

/**
 * Feature Agent — implements new functionality end-to-end.
 *
 * Workflow:
 *   1. Understand existing code structure
 *   2. Plan the implementation
 *   3. Write code + tests
 *   4. Verify (hooks run automatically)
 */
export class FeatureAgent {
  private engine: AgentEngine

  constructor(harness: Harness, config: AgentEngineConfig) {
    this.engine = new AgentEngine(harness, config)
  }

  async *run(task: string): AsyncGenerator<AgentEvent> {
    const prompt = `
## Task
${task}

## Your Process
1. First, explore the relevant parts of the codebase to understand context
2. Plan your implementation (list the files you will create/modify)
3. Implement the changes
4. Verify everything compiles and tests pass

Start by exploring the project structure and relevant existing code.
`
    yield* this.engine.run(prompt, 'feature')
  }

  approve(id: string) { this.engine.approve(id) }
  deny(id: string) { this.engine.deny(id) }
}
