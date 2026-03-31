import type { Harness } from '../harness/types.js'
import { runHooks } from '../harness/hooks.js'
import { TOOL_DEFINITIONS, executeTool, requiresApproval } from './tools.js'
import type {
  AgentEvent,
  ToolStartEvent,
  ToolEndEvent,
  ApprovalRequiredEvent,
  HookSummary,
} from './types.js'
import type { ToolName } from './tools.js'
import { createProvider } from '../providers/index.js'
import type { AIProvider, NormalizedMessage, NormalizedContent, ProviderConfig } from '../providers/index.js'

export interface AgentEngineConfig {
  provider: ProviderConfig
  projectDir: string
  maxTurns?: number
}

const NORMALIZED_TOOLS = TOOL_DEFINITIONS.map(t => ({
  name: t.name,
  description: t.description ?? '',
  parameters: t.input_schema as Record<string, unknown>,
}))

export class AgentEngine {
  private ai: AIProvider
  private pendingApprovals = new Map<string, (approved: boolean) => void>()
  private filesChanged: string[] = []

  constructor(
    private readonly harness: Harness,
    private readonly config: AgentEngineConfig
  ) {
    this.ai = createProvider(config.provider)
  }

  async *run(task: string, agentType = 'feature'): AsyncGenerator<AgentEvent> {
    const systemPrompt = this.buildSystemPrompt(agentType)
    const messages: NormalizedMessage[] = [
      { role: 'user', content: [{ type: 'text', text: task }] },
    ]

    const maxTurns = this.config.maxTurns ?? 30
    let turns = 0

    while (turns < maxTurns) {
      turns++

      const response = await this.ai.chat(messages, NORMALIZED_TOOLS, systemPrompt)

      // Emit text blocks
      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          yield { type: 'text', data: { text: block.text } }
        }
      }

      const toolUses = response.content.filter(b => b.type === 'tool_use')

      if (response.stopReason === 'end_turn' || toolUses.length === 0) {
        yield {
          type: 'done',
          data: {
            summary: this.extractSummary(response.content),
            filesChanged: this.filesChanged,
          },
        }
        return
      }

      // Process tool calls
      const toolResults: NormalizedContent[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        const toolName = block.name as ToolName
        const toolInput = block.input

        // Approval gate
        if (requiresApproval(toolName, toolInput)) {
          const approvalEvent: ApprovalRequiredEvent = {
            type: 'approval_required',
            data: {
              toolName,
              input: toolInput,
              reason: `Command requires approval: ${toolInput['command']}`,
            },
          }
          yield approvalEvent

          const approved = await this.waitForApproval(block.id)
          if (!approved) {
            yield { type: 'approval_denied', data: { toolName } }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: 'User denied this operation.',
            })
            continue
          }
          yield { type: 'approval_granted', data: { toolName } }
        }

        const startEvent: ToolStartEvent = {
          type: 'tool_start',
          data: { toolName, input: toolInput },
        }
        yield startEvent

        let toolOutput: string
        let filePath: string | undefined

        try {
          const result = await executeTool(toolName, toolInput, this.config.projectDir)
          toolOutput = result.output
          filePath = result.filePath
          if (filePath) this.filesChanged.push(filePath)
        } catch (err) {
          toolOutput = `Error: ${String(err)}`
        }

        // Run hooks after writes
        const hookSummaries: HookSummary[] = []

        if (toolName === 'write_file' && filePath) {
          try {
            const hookResults = await runHooks(
              this.harness.hooks,
              'PostWrite',
              { filePath, projectDir: this.config.projectDir }
            )
            for (const r of hookResults) {
              hookSummaries.push({
                command: r.hook.command,
                passed: r.passed,
                output: (r.stdout || r.stderr).slice(0, 500),
              })
              if (!r.passed) {
                toolOutput += `\n\n[Hook: ${r.hook.command}]\n${r.stderr || r.stdout}`
              }
            }
          } catch (err) {
            toolOutput += `\n\n[Hook error: ${String(err)}]`
          }
        }

        const endEvent: ToolEndEvent = {
          type: 'tool_end',
          data: { toolName, output: toolOutput, hookResults: hookSummaries },
        }
        yield endEvent

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: toolOutput,
        })
      }

      // Add turn to messages
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })
    }

    yield {
      type: 'error',
      data: { message: `Exceeded max turns (${this.config.maxTurns ?? 30})`, recoverable: false },
    }
  }

  approve(id: string) {
    this.pendingApprovals.get(id)?.(true)
    this.pendingApprovals.delete(id)
  }

  deny(id: string) {
    this.pendingApprovals.get(id)?.(false)
    this.pendingApprovals.delete(id)
  }

  private waitForApproval(id: string): Promise<boolean> {
    return new Promise(resolve => {
      this.pendingApprovals.set(id, resolve)
    })
  }

  private buildSystemPrompt(agentType: string): string {
    const forbidden = this.harness.forbiddenZones
      .map(z => `- ${z.path}: ${z.reason}`)
      .join('\n')

    const conventions = this.harness.conventions
      .map(c => `### ${c.category}\n${c.rules.map(r => `- ${r}`).join('\n')}`)
      .join('\n\n')

    return `You are an expert ${this.harness.framework} developer acting as a ${agentType} agent.

## Project Context
${this.harness.systemContext}

## Conventions
${conventions}

${forbidden ? `## Forbidden Zones (DO NOT MODIFY)\n${forbidden}` : ''}

## Instructions
- Read existing code before modifying it
- Make the smallest change that solves the problem
- After writing a file, read the hook output and fix any errors before continuing
- Summarize what you changed at the end
`
  }

  private extractSummary(content: NormalizedContent[]): string {
    const last = [...content].reverse().find(b => b.type === 'text')
    return last?.type === 'text' ? last.text.slice(0, 500) : 'Task completed'
  }
}
