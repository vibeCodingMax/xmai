import { execa } from 'execa'
import { minimatch } from 'minimatch'
import type { HookConfig, HookTrigger } from './types.js'

export interface HookResult {
  hook: HookConfig
  stdout: string
  stderr: string
  exitCode: number
  passed: boolean
}

export interface HookContext {
  filePath?: string
  projectDir: string
}

/**
 * Substitutes {projectDir} and {filePath} placeholders in hook commands.
 * Unknown placeholders are left as-is so the shell can report them clearly.
 */
function substituteVars(command: string, ctx: HookContext): string {
  return command
    .replace(/\{projectDir\}/g, ctx.projectDir)
    .replace(/\{filePath\}/g, ctx.filePath ?? '')
}

/**
 * Runs all hooks matching a trigger and optional file path.
 * Blocking hooks run sequentially; non-blocking fire-and-forget.
 */
export async function runHooks(
  hooks: HookConfig[],
  trigger: HookTrigger,
  context: HookContext
): Promise<HookResult[]> {
  const matching = hooks.filter(h => {
    if (h.trigger !== trigger) return false
    if (h.pattern && context.filePath) {
      return minimatch(context.filePath, h.pattern, { matchBase: true })
    }
    return true
  })

  const results: HookResult[] = []

  for (const hook of matching) {
    if (hook.blocking) {
      const result = await executeHook(hook, context)
      results.push(result)
      if (!result.passed && hook.failOnError) {
        throw new HookError(hook, result)
      }
    } else {
      executeHook(hook, context).catch(() => {})
    }
  }

  return results
}

async function executeHook(hook: HookConfig, context: HookContext): Promise<HookResult> {
  const command = substituteVars(hook.command, context)

  try {
    const result = await execa('sh', ['-c', command], {
      cwd: context.projectDir,
      reject: false,
      all: true,
    })

    return {
      hook,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
      passed: result.exitCode === 0,
    }
  } catch (err) {
    return {
      hook,
      stdout: '',
      stderr: String(err),
      exitCode: 1,
      passed: false,
    }
  }
}

export class HookError extends Error {
  constructor(
    public readonly hook: HookConfig,
    public readonly result: HookResult
  ) {
    super(
      `Hook failed: ${hook.command}\n` +
      `Exit code: ${result.exitCode}\n` +
      `${result.stderr || result.stdout}`
    )
    this.name = 'HookError'
  }
}
