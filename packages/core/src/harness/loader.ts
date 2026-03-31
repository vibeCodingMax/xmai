import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Harness, Framework, ProjectConfig } from './types.js'
import { HarnessSchema } from './types.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** Built-in harness templates directory */
const BUILTIN_HARNESSES_DIR = resolve(__dirname, '../../../../harnesses')

/**
 * Loads and merges harness for a project.
 * Priority: project overrides > project harness file > built-in template
 */
export async function loadHarness(config: ProjectConfig): Promise<Harness> {
  const base = await loadBaseHarness(config.framework, config.harnessPath)

  if (!config.overrides) return base

  const merged = {
    ...base,
    ...config.overrides,
    hooks: [
      ...(base.hooks ?? []),
      ...(config.overrides.hooks ?? []),
    ],
    conventions: [
      ...(base.conventions ?? []),
      ...(config.overrides.conventions ?? []),
    ],
    forbiddenZones: [
      ...(base.forbiddenZones ?? []),
      ...(config.overrides.forbiddenZones ?? []),
    ],
  }

  return HarnessSchema.parse(merged)
}

async function loadBaseHarness(framework: Framework, customPath?: string): Promise<Harness> {
  const harnessPath = customPath
    ? resolve(customPath)
    : join(BUILTIN_HARNESSES_DIR, framework, 'harness.json')

  if (!existsSync(harnessPath)) {
    throw new Error(
      `Harness not found for framework "${framework}" at: ${harnessPath}\n` +
      `Run: aiagent init --framework ${framework}`
    )
  }

  const raw = await readFile(harnessPath, 'utf-8')
  return HarnessSchema.parse(JSON.parse(raw))
}

/**
 * Finds aiagent.config.json walking up from cwd
 */
export async function findProjectConfig(startDir = process.cwd()): Promise<ProjectConfig | null> {
  let dir = startDir

  while (true) {
    const configPath = join(dir, 'aiagent.config.json')
    if (existsSync(configPath)) {
      const raw = await readFile(configPath, 'utf-8')
      const { ProjectConfigSchema } = await import('./types.js')
      return ProjectConfigSchema.parse(JSON.parse(raw))
    }

    const parent = resolve(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
}
