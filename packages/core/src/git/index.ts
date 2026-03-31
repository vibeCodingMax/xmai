import { execa } from 'execa'

/** Returns true if the directory is inside a git repository */
export async function isGitRepo(dir: string): Promise<boolean> {
  const result = await execa('git', ['rev-parse', '--git-dir'], {
    cwd: dir,
    reject: false,
  })
  return result.exitCode === 0
}

/** Returns list of files changed vs HEAD (uncommitted changes) */
export async function getChangedFiles(dir: string): Promise<string[]> {
  const result = await execa(
    'git', ['diff', '--name-only', 'HEAD'],
    { cwd: dir, reject: false }
  )
  if (result.exitCode !== 0) return []
  return result.stdout.split('\n').map(f => f.trim()).filter(Boolean)
}

/** Returns unified diff vs HEAD */
export async function getDiff(dir: string): Promise<string> {
  const result = await execa(
    'git', ['diff', 'HEAD', '--stat', '--patch'],
    { cwd: dir, reject: false }
  )
  return result.stdout
}

/**
 * Creates a new branch named xmai/<sanitized-task>.
 * Returns the branch name. If creation fails (e.g. not a git repo),
 * returns null silently — caller should continue without branching.
 */
export async function createAgentBranch(dir: string, task: string): Promise<string | null> {
  if (!(await isGitRepo(dir))) return null

  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')  // handle Chinese chars
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  const branch = `xmai/${slug}`

  // Check if branch already exists — append timestamp if so
  const existing = await execa('git', ['branch', '--list', branch], { cwd: dir, reject: false })
  const finalBranch = existing.stdout.trim() ? `${branch}-${Date.now()}` : branch

  const result = await execa('git', ['checkout', '-b', finalBranch], { cwd: dir, reject: false })
  if (result.exitCode !== 0) return null

  return finalBranch
}

/** Returns the current branch name */
export async function currentBranch(dir: string): Promise<string> {
  const result = await execa('git', ['branch', '--show-current'], { cwd: dir, reject: false })
  return result.stdout.trim() || 'HEAD'
}

/** Switches back to a branch and deletes the agent branch */
export async function deleteAgentBranch(dir: string, agentBranch: string, returnTo: string): Promise<boolean> {
  const checkout = await execa('git', ['checkout', returnTo], { cwd: dir, reject: false })
  if (checkout.exitCode !== 0) return false
  await execa('git', ['branch', '-D', agentBranch], { cwd: dir, reject: false })
  return true
}
