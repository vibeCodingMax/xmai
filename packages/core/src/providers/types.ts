/** Normalized message format shared across providers */
export interface NormalizedMessage {
  role: 'user' | 'assistant'
  content: NormalizedContent[]
}

export type NormalizedContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

export interface NormalizedTool {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema object
}

export interface NormalizedResponse {
  content: NormalizedContent[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
}

export interface AIProvider {
  chat(
    messages: NormalizedMessage[],
    tools: NormalizedTool[],
    system: string
  ): Promise<NormalizedResponse>
}

export type ProviderName = 'anthropic' | 'openai'

export interface ProviderConfig {
  provider: ProviderName
  apiKey: string
  model?: string
}
