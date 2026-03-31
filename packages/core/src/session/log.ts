import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface RunRecord {
  id: string
  timestamp: string
  task: string
  agentType: string
  provider: string
  branch: string | null
  filesChanged: string[]
  durationMs: number
}

function sessionDir(projectDir: string): string {
  return join(projectDir, '.xmai')
}

function logPath(projectDir: string): string {
  return join(sessionDir(projectDir), 'runs.jsonl')
}

export async function appendRun(projectDir: string, record: Omit<RunRecord, 'id'>): Promise<RunRecord> {
  const dir = sessionDir(projectDir)
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })

  const full: RunRecord = { id: randomBytes(4).toString('hex'), ...record }
  const line = JSON.stringify(full) + '\n'
  await writeFile(logPath(projectDir), line, { flag: 'a' })
  return full
}

export async function readRuns(projectDir: string): Promise<RunRecord[]> {
  const path = logPath(projectDir)
  if (!existsSync(path)) return []
  const content = await readFile(path, 'utf-8')
  return content
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as RunRecord)
    .reverse()  // newest first
}

export async function lastRun(projectDir: string): Promise<RunRecord | null> {
  const runs = await readRuns(projectDir)
  return runs[0] ?? null
}
