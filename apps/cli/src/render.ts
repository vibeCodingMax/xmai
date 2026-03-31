import chalk from 'chalk'
import type { AgentEvent } from '@xmai/core'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let spinnerIdx = 0

export function renderEvent(event: AgentEvent): void {
  switch (event.type) {

    case 'thinking': {
      const frame = SPINNER_FRAMES[spinnerIdx++ % SPINNER_FRAMES.length]!
      process.stdout.write(chalk.gray(`\r${frame} thinking...`))
      break
    }

    case 'text':
      // Clear any spinner line first
      process.stdout.write('\r\x1b[K')
      process.stdout.write(chalk.white(event.data['text'] as string))
      break

    case 'tool_start': {
      const name = event.data['toolName'] as string
      const input = event.data['input'] as Record<string, unknown>
      const preview = getInputPreview(name, input)
      const icon = TOOL_ICONS[name] ?? '⚙'
      console.log(chalk.cyan(`\n  ${icon}  ${chalk.bold(name)}`) + chalk.gray(`  ${preview}`))
      break
    }

    case 'tool_end': {
      const hookResults = event.data['hookResults'] as Array<{
        command: string; passed: boolean; output: string
      }> | undefined
      if (hookResults?.length) renderHookResults(hookResults)
      break
    }

    case 'write_preview': {
      const { path, isNew, linesAdded, linesRemoved, diff } = event.data as {
        path: string; isNew: boolean; linesAdded: number; linesRemoved: number; diff: string
      }
      const label = isNew ? chalk.green('new file') : chalk.yellow('modified')
      const stats = isNew
        ? chalk.green(`+${linesAdded}`)
        : `${chalk.green(`+${linesAdded}`)} ${chalk.red(`-${linesRemoved}`)}`
      console.log(chalk.gray(`\n  📄  ${path}`) + `  ${label}  ${stats}`)
      if (diff && !isNew) {
        renderDiff(diff)
      }
      break
    }

    case 'hook_start': {
      const file = event.data['filePath'] as string | undefined
      if (file) process.stdout.write(chalk.gray(`\n  🔧  hooks → ${file}\n`))
      break
    }

    case 'hook_end': {
      const { command, passed, output } = event.data as {
        command: string; passed: boolean; output: string
      }
      const icon = passed ? chalk.green('  ✓') : chalk.red('  ✗')
      const label = chalk.gray(trimCommand(command))
      console.log(`${icon}  ${label}`)
      if (!passed && output.trim()) {
        console.log(chalk.red(indent(output.trim().split('\n').slice(0, 12).join('\n'), 6)))
      }
      break
    }

    case 'git_diff': {
      const { diff, filesChanged } = event.data as { diff: string; filesChanged: string[] }
      if (!filesChanged.length) break

      console.log(chalk.bold('\n─── Changes ──────────────────────────────────────'))
      renderDiff(diff)
      console.log(chalk.gray(`${filesChanged.length} file(s) changed`))
      break
    }

    case 'approval_required': {
      const input = event.data['input'] as Record<string, unknown>
      const cmd = input['command'] as string
      console.log(chalk.yellow('\n  ⚠   Approval required'))
      console.log(chalk.yellow(`      ${chalk.bold(cmd)}`))
      break
    }

    case 'approval_granted':
      console.log(chalk.green('  ✓  Approved'))
      break

    case 'approval_denied':
      console.log(chalk.red('  ✗  Denied — skipping'))
      break

    case 'done': {
      const files = event.data['filesChanged'] as string[]
      console.log(chalk.green('\n✅  Done'))
      if (files.length > 0) {
        console.log(chalk.gray(`\nChanged (${files.length}):`))
        for (const f of files) console.log(chalk.gray(`  ${f}`))
      }
      break
    }

    case 'error': {
      const msg = event.data['message'] as string
      console.error(chalk.red(`\n❌  ${msg.split('\n')[0]}`))
      const rest = msg.split('\n').slice(1).join('\n').trim()
      if (rest) console.error(chalk.gray(indent(rest, 4)))
      break
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read_file: '📖',
  write_file: '✏️ ',
  bash: '⚡',
  list_files: '📂',
  search_code: '🔍',
}

function getInputPreview(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
    case 'write_file': {
      const parts = String(input['path'] ?? '').split('/')
      return parts.slice(-2).join('/')
    }
    case 'bash': {
      const cmd = String(input['command'] ?? '')
      return cmd.length > 72 ? cmd.slice(0, 69) + '…' : cmd
    }
    case 'search_code':
      return `"${input['pattern']}" in ${String(input['path']).split('/').pop()}`
    default:
      return ''
  }
}

function renderHookResults(results: Array<{ command: string; passed: boolean; output: string }>) {
  for (const h of results) {
    const icon = h.passed ? chalk.green('  ✓') : chalk.red('  ✗')
    console.log(`${icon}  ${chalk.gray(trimCommand(h.command))}`)
    if (!h.passed && h.output.trim()) {
      console.log(chalk.red(indent(h.output.trim().split('\n').slice(0, 10).join('\n'), 6)))
    }
  }
}

function renderDiff(diff: string) {
  const lines = diff.split('\n').slice(0, 80)
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      console.log(chalk.green(line))
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      console.log(chalk.red(line))
    } else if (line.startsWith('@@')) {
      console.log(chalk.cyan(line))
    } else {
      console.log(chalk.gray(line))
    }
  }
  if (diff.split('\n').length > 80) {
    console.log(chalk.gray('  … (truncated, run git diff for full output)'))
  }
}

function trimCommand(cmd: string): string {
  // Show only the last meaningful segment (after &&)
  const parts = cmd.split('&&')
  return (parts[parts.length - 1] ?? cmd).trim().slice(0, 80)
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text.split('\n').map(l => pad + l).join('\n')
}
