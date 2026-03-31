import { execa } from 'execa'
import * as readline from 'node:readline'
import type { Harness } from '../harness/types.js'
import { runHooks } from '../harness/hooks.js'
import { isGitRepo, getChangedFiles } from '../git/index.js'
import type { AgentEvent } from './types.js'

export interface KiroEngineConfig {
  projectDir: string
  model?: string
  agent?: string
  trustAllTools?: boolean
  verbose?: boolean
}

/**
 * KiroEngine — delegates execution to kiro-cli, then runs harness hooks
 * on every file kiro changed (detected via git diff).
 *
 * Improvements over original:
 * - Real-time streaming via readline (no more 30s black box)
 * - Post-execution hooks triggered on changed files
 * - Verbose error output including last N lines of kiro output
 */
export class KiroEngine {
  constructor(
    private readonly harness: Harness,
    private readonly config: KiroEngineConfig
  ) {}

  async *run(task: string, agentType = 'feature'): AsyncGenerator<AgentEvent> {
    const { projectDir, verbose = false } = this.config
    const prompt = this.buildPrompt(task, agentType)

    // Check kiro-cli is available
    const which = await execa('which', ['kiro-cli'], { reject: false })
    if (which.exitCode !== 0) {
      yield {
        type: 'error',
        data: {
          message: 'kiro-cli not found. Install from https://kiro.dev',
          recoverable: false,
        },
      }
      return
    }

    const args: string[] = ['chat', '--no-interactive']
    if (this.config.trustAllTools !== false) args.push('--trust-all-tools')
    if (this.config.model) args.push('--model', this.config.model)
    if (this.config.agent) args.push('--agent', this.config.agent)
    args.push(prompt)

    yield { type: 'thinking', data: { text: 'kiro' } }

    // Collect last N lines for error diagnostics without storing entire output
    const tailBuffer: string[] = []
    const TAIL_SIZE = 30

    try {
      const proc = execa('kiro-cli', args, {
        cwd: projectDir,
        all: true,
        reject: false,
      })

      // ── Real-time streaming via readline ──────────────────────────────────
      if (proc.all) {
        const rl = readline.createInterface({ input: proc.all, crlfDelay: Infinity })

        for await (const raw of rl) {
          const line = stripAnsi(raw)
          if (line.trim()) {
            // Keep rolling tail for error diagnostics
            tailBuffer.push(line)
            if (tailBuffer.length > TAIL_SIZE) tailBuffer.shift()

            yield { type: 'text', data: { text: line + '\n' } }
          }
        }
      }

      const result = await proc
      const exitCode = result.exitCode ?? 0

      if (exitCode !== 0) {
        const context = tailBuffer.slice(-20).join('\n')
        yield {
          type: 'error',
          data: {
            message: `kiro-cli exited with code ${exitCode}${context ? `\n\nLast output:\n${context}` : ''}`,
            recoverable: false,
          },
        }
        return
      }

      // ── Post-execution hooks on changed files ─────────────────────────────
      const changedFiles = yield* this.runPostHooks(projectDir, verbose)

      yield {
        type: 'done',
        data: {
          summary: 'kiro-cli completed the task',
          filesChanged: changedFiles,
        },
      }
    } catch (err) {
      const isNotFound = String(err).includes('ENOENT')
      yield {
        type: 'error',
        data: {
          message: isNotFound
            ? 'kiro-cli not found. Install from https://kiro.dev'
            : `Failed to run kiro-cli: ${String(err)}`,
          recoverable: false,
        },
      }
    }
  }

  /** Runs PostWrite hooks for each file changed by kiro (detected via git diff) */
  private async *runPostHooks(projectDir: string, verbose: boolean): AsyncGenerator<AgentEvent, string[]> {
    if (!(await isGitRepo(projectDir))) return []

    const changedFiles = await getChangedFiles(projectDir)
    if (changedFiles.length === 0) return []

    for (const relPath of changedFiles) {
      const filePath = `${projectDir}/${relPath}`

      yield {
        type: 'hook_start',
        data: { filePath: relPath },
      }

      const hookResults = await runHooks(
        this.harness.hooks,
        'PostWrite',
        { filePath, projectDir }
      )

      for (const r of hookResults) {
        const output = (r.stdout || r.stderr)
        const displayOutput = verbose ? output : output.split('\n').slice(0, 10).join('\n')

        yield {
          type: 'hook_end',
          data: {
            command: r.hook.command,
            passed: r.passed,
            output: displayOutput,
          },
        }
      }
    }

    return changedFiles
  }

  private buildPrompt(task: string, agentType: string): string {
    const conventions = this.harness.conventions
      .map(c => `### ${c.category}\n${c.rules.map(r => `- ${r}`).join('\n')}`)
      .join('\n\n')

    const forbidden = this.harness.forbiddenZones.length > 0
      ? `## Forbidden Zones — DO NOT MODIFY\n` +
        this.harness.forbiddenZones.map(z => `- ${z.path}: ${z.reason}`).join('\n')
      : ''

    const agentInstructions: Record<string, string> = {
      feature: 'Implement the requested feature end-to-end. Read existing code first, then write the minimal change needed.',
      bug: 'Fix the bug with the smallest possible change. Do NOT refactor surrounding code.',
      review: 'Review the code and output findings as [MUST] / [SUGGEST] / [OPTIONAL].',
      refactor: 'Refactor while preserving behavior. Run tests after.',
      test: 'Write comprehensive tests. Cover edge cases.',
      docs: 'Write clear documentation or code comments.',
    }

    return [
      `## Project Context (${this.harness.name})`,
      this.harness.systemContext,
      '',
      '## Conventions',
      conventions,
      '',
      forbidden,
      '',
      `## Agent Role: ${agentType}`,
      agentInstructions[agentType] ?? agentInstructions['feature']!,
      '',
      '## Task',
      task,
    ].filter(Boolean).join('\n')
  }
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHF]|\x1B\[[?][0-9;]*[hl]|\x1B\[[\d;]*[A-Za-z]/g, '')
}
