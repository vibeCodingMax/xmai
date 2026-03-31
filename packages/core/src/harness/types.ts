import { z } from 'zod'

export const FrameworkSchema = z.enum(['nextjs', 'react', 'vue', 'flutter', 'rust'])
export type Framework = z.infer<typeof FrameworkSchema>

export const HookTriggerSchema = z.enum([
  'PostEdit',    // After any file edit
  'PostWrite',   // After new file creation
  'PreBash',     // Before shell command (can block)
])
export type HookTrigger = z.infer<typeof HookTriggerSchema>

export const HookConfigSchema = z.object({
  trigger: HookTriggerSchema,
  /** Glob pattern to match modified file. If omitted, runs for all files. */
  pattern: z.string().optional(),
  /** Shell command to execute */
  command: z.string(),
  /** If true, agent waits for result before continuing */
  blocking: z.boolean().default(true),
  /** If true, failure aborts the agent turn */
  failOnError: z.boolean().default(false),
})
export type HookConfig = z.infer<typeof HookConfigSchema>

export const ConventionSchema = z.object({
  category: z.string(),
  rules: z.array(z.string()),
})
export type Convention = z.infer<typeof ConventionSchema>

export const ForbiddenZoneSchema = z.object({
  path: z.string(),
  reason: z.string(),
})
export type ForbiddenZone = z.infer<typeof ForbiddenZoneSchema>

export const HarnessSchema = z.object({
  framework: FrameworkSchema,
  name: z.string(),
  /** Injected as system context for every agent run */
  systemContext: z.string(),
  conventions: z.array(ConventionSchema),
  hooks: z.array(HookConfigSchema),
  /** Paths the agent must not modify without explicit approval */
  forbiddenZones: z.array(ForbiddenZoneSchema).default([]),
  /** Extra MCP servers to enable for this framework */
  mcpServers: z.array(z.string()).default([]),
})
export type Harness = z.infer<typeof HarnessSchema>

export const ProviderNameSchema = z.enum(['anthropic', 'openai', 'kiro'])
export type ProviderName = z.infer<typeof ProviderNameSchema>

export const ProjectConfigSchema = z.object({
  framework: FrameworkSchema,
  /** AI provider: kiro (local kiro-cli) | anthropic | openai */
  provider: ProviderNameSchema.default('kiro'),
  /** Path to harness template (defaults to built-in) */
  harnessPath: z.string().optional(),
  /** Override individual harness fields */
  overrides: HarnessSchema.partial().optional(),
  /** Model override — for kiro: auto | claude-sonnet-4.6 | deepseek-3.2 etc. */
  model: z.string().optional(),
})
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>
