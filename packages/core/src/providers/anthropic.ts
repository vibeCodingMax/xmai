import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, NormalizedMessage, NormalizedTool, NormalizedResponse, NormalizedContent } from './types.js'

export class AnthropicProvider implements AIProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async chat(
    messages: NormalizedMessage[],
    tools: NormalizedTool[],
    system: string
  ): Promise<NormalizedResponse> {
    const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({
      role: m.role,
      content: m.content.map(c => {
        if (c.type === 'text') return { type: 'text' as const, text: c.text }
        if (c.type === 'tool_use') return {
          type: 'tool_use' as const,
          id: c.id,
          name: c.name,
          input: c.input,
        }
        // tool_result
        return {
          type: 'tool_result' as const,
          tool_use_id: c.tool_use_id,
          content: c.content,
        }
      }),
    }))

    const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }))

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8096,
      system,
      tools: anthropicTools,
      messages: anthropicMessages,
    })

    const content: NormalizedContent[] = response.content.map(block => {
      if (block.type === 'text') return { type: 'text' as const, text: block.text }
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }
    })

    const stopReason =
      response.stop_reason === 'tool_use' ? 'tool_use'
      : response.stop_reason === 'max_tokens' ? 'max_tokens'
      : 'end_turn'

    return { content, stopReason }
  }
}
