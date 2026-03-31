import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execa } from 'execa'
import type Anthropic from '@anthropic-ai/sdk'

export type ToolName = 'read_file' | 'write_file' | 'bash' | 'list_files' | 'search_code'

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates parent directories if needed)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'bash',
    description: 'Run a shell command in the project directory. Use for tests, type checks, builds. Do NOT use for installing packages without user approval.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run' },
      },
      required: ['command'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
        pattern: { type: 'string', description: 'Glob pattern filter (optional)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for text patterns across project files using ripgrep',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'Directory to search in' },
        filePattern: { type: 'string', description: 'File glob pattern (e.g. "*.tsx")' },
      },
      required: ['pattern', 'path'],
    },
  },
]

export interface ToolResult {
  output: string
  /** Set only for write_file — the absolute path written */
  filePath?: string
  /** Set only for write_file — diff of what changed */
  diff?: FileDiff
}

export interface FileDiff {
  isNew: boolean
  linesAdded: number
  linesRemoved: number
  patch: string
}

export async function executeTool(
  name: ToolName,
  input: Record<string, unknown>,
  projectDir: string
): Promise<ToolResult> {
  const abs = (p: string) => resolve(projectDir, p as string)

  switch (name) {
    case 'read_file': {
      const path = abs(input['path'] as string)
      if (!existsSync(path)) return { output: `Error: file not found: ${path}` }
      const content = await readFile(path, 'utf-8')
      // filePath intentionally NOT returned — reads must not trigger PostWrite hooks
      return { output: content }
    }

    case 'write_file': {
      const path = abs(input['path'] as string)
      const newContent = input['content'] as string

      const diff = await computeDiff(path, newContent)

      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, newContent, 'utf-8')

      return { output: `Written: ${path}`, filePath: path, diff }
    }

    case 'bash': {
      const command = input['command'] as string
      const result = await execa('sh', ['-c', command], {
        cwd: projectDir,
        reject: false,
        all: true,
      })
      const output = result.all ?? result.stdout ?? result.stderr ?? ''
      // Append exit code when non-zero so agent knows the command failed
      const suffix = result.exitCode !== 0 ? `\n[Exit code: ${result.exitCode}]` : ''
      return { output: output.slice(0, 8000) + suffix }
    }

    case 'list_files': {
      const { glob } = await import('glob')
      const pattern = (input['filePattern'] as string | undefined) ?? '**/*'
      const files = await glob(pattern, {
        cwd: abs(input['path'] as string),
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.next/**'],
      })
      return { output: files.sort().join('\n') }
    }

    case 'search_code': {
      const result = await execa(
        'rg',
        [
          '--line-number',
          '--max-count', '20',
          ...(input['filePattern'] ? ['-g', input['filePattern'] as string] : []),
          input['pattern'] as string,
          abs(input['path'] as string),
        ],
        { reject: false }
      )
      return { output: result.stdout.slice(0, 6000) || 'No matches found' }
    }
  }
}

/** Computes a unified diff between existing file content and new content */
async function computeDiff(filePath: string, newContent: string): Promise<FileDiff> {
  if (!existsSync(filePath)) {
    const lines = newContent.split('\n').length
    return { isNew: true, linesAdded: lines, linesRemoved: 0, patch: '' }
  }

  const oldContent = await readFile(filePath, 'utf-8')
  if (oldContent === newContent) {
    return { isNew: false, linesAdded: 0, linesRemoved: 0, patch: '' }
  }

  // Use system diff for a proper unified patch
  const result = await execa(
    'diff',
    ['-u', '--label', filePath, '--label', filePath, '-', '-'],
    {
      input: oldContent + '\x00' + newContent,  // not ideal but works for display
      reject: false,
    }
  ).catch(() => null)

  // Fall back to simple line count when diff isn't available
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  // Generate minimal line-count diff using built-in comparison
  let added = 0
  let removed = 0
  const patch = computeSimplePatch(oldContent, newContent, filePath)

  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)
  for (const l of newLines) if (!oldSet.has(l)) added++
  for (const l of oldLines) if (!newSet.has(l)) removed++

  void result  // suppress unused warning

  return { isNew: false, linesAdded: added, linesRemoved: removed, patch }
}

function computeSimplePatch(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  const patch: string[] = [`--- ${filePath}`, `+++ ${filePath}`]
  const maxLines = Math.max(oldLines.length, newLines.length)
  let inHunk = false
  const CONTEXT = 3

  for (let i = 0; i < maxLines; i++) {
    const o = oldLines[i]
    const n = newLines[i]
    if (o !== n) {
      if (!inHunk) {
        const start = Math.max(0, i - CONTEXT)
        patch.push(`@@ -${start + 1} +${start + 1} @@`)
        for (let c = start; c < i; c++) {
          if (oldLines[c] !== undefined) patch.push(` ${oldLines[c]}`)
        }
        inHunk = true
      }
      if (o !== undefined) patch.push(`-${o}`)
      if (n !== undefined) patch.push(`+${n}`)
    } else {
      if (inHunk) {
        patch.push(` ${o ?? ''}`)
        if (i - (patch.lastIndexOf(`@@ -`) ?? 0) > CONTEXT * 2) inHunk = false
      }
    }
  }

  return patch.slice(0, 200).join('\n')  // cap at 200 lines
}

export function requiresApproval(name: ToolName, input: Record<string, unknown>): boolean {
  if (name !== 'bash') return false
  const command = (input['command'] as string).toLowerCase()
  return (
    command.includes('npm install') ||
    command.includes('pnpm add') ||
    command.includes('yarn add') ||
    command.includes('rm -rf') ||
    command.includes('git push') ||
    command.includes('git reset') ||
    command.includes('sudo ')
  )
}
