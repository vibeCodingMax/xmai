export * from './types.js'
export { AnthropicProvider } from './anthropic.js'
export { OpenAIProvider } from './openai.js'

import type { ProviderConfig, AIProvider } from './types.js'
import { AnthropicProvider } from './anthropic.js'
import { OpenAIProvider } from './openai.js'

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
}

export function createProvider(config: ProviderConfig): AIProvider {
  const model = config.model ?? DEFAULT_MODELS[config.provider]

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config.apiKey, model)
    case 'openai':
      return new OpenAIProvider(config.apiKey, model)
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}
