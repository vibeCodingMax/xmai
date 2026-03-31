import OpenAI from 'openai'
import type { AIProvider, NormalizedMessage, NormalizedTool, NormalizedResponse, NormalizedContent } from './types.js'

export class OpenAIProvider implements AIProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model = 'gpt-4o') {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  async chat(
    messages: NormalizedMessage[],
    tools: NormalizedTool[],
    system: string
  ): Promise<NormalizedResponse> {
    // Convert normalized messages → OpenAI format
    const oaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
    ]

    for (const msg of messages) {
      if (msg.role === 'user') {
        // Collect tool results + text from user messages
        const toolResults = msg.content.filter(c => c.type === 'tool_result')
        const texts = msg.content.filter(c => c.type === 'text')

        for (const tr of toolResults) {
          if (tr.type === 'tool_result') {
            oaiMessages.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id,
              content: tr.content,
            })
          }
        }

        if (texts.length > 0) {
          oaiMessages.push({
            role: 'user',
            content: texts.map(t => t.type === 'text' ? t.text : '').join('\n'),
          })
        }
      } else {
        // assistant: may have text + tool_use
        const toolUses = msg.content.filter(c => c.type === 'tool_use')
        const texts = msg.content.filter(c => c.type === 'text')

        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: texts.map(t => t.type === 'text' ? t.text : '').join('\n') || null,
        }

        if (toolUses.length > 0) {
          assistantMsg.tool_calls = toolUses
            .filter(c => c.type === 'tool_use')
            .map(c => {
              if (c.type !== 'tool_use') throw new Error('unreachable')
              return {
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              } satisfies OpenAI.ChatCompletionMessageToolCall
            })
        }

        oaiMessages.push(assistantMsg)
      }
    }

    const oaiTools: OpenAI.ChatCompletionTool[] = tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: oaiMessages,
      tools: oaiTools,
      tool_choice: 'auto',
    })

    const choice = response.choices[0]
    if (!choice) throw new Error('OpenAI returned no choices')

    const content: NormalizedContent[] = []
    const message = choice.message

    if (message.content) {
      content.push({ type: 'text', text: message.content })
    }

    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        if (tc.type !== 'function') continue
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        })
      }
    }

    const stopReason =
      choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens'
      : 'end_turn'

    return { content, stopReason }
  }
}
