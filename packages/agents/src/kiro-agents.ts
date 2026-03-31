import { KiroEngine } from '@xmai/core'
import type { KiroEngineConfig } from '@xmai/core'
import type { AgentEvent, Harness } from '@xmai/core'
import type { ReviewOptions } from './review.js'

export class KiroFeatureAgent {
  private engine: KiroEngine
  constructor(harness: Harness, config: KiroEngineConfig) {
    this.engine = new KiroEngine(harness, config)
  }
  async *run(task: string): AsyncGenerator<AgentEvent> {
    yield* this.engine.run(task, 'feature')
  }
}

export class KiroBugAgent {
  private engine: KiroEngine
  constructor(harness: Harness, config: KiroEngineConfig) {
    this.engine = new KiroEngine(harness, config)
  }
  async *run(issue: string): AsyncGenerator<AgentEvent> {
    yield* this.engine.run(issue, 'bug')
  }
}

export class KiroReviewAgent {
  private engine: KiroEngine
  constructor(harness: Harness, config: KiroEngineConfig) {
    this.engine = new KiroEngine(harness, config)
  }
  async *run(options: ReviewOptions): AsyncGenerator<AgentEvent> {
    const task = `Review these files: ${options.targets.join(', ')}\nFocus: ${(options.focus ?? ['types', 'security', 'conventions']).join(', ')}`
    yield* this.engine.run(task, 'review')
  }
}
