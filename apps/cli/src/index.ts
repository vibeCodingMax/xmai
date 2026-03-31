#!/usr/bin/env node
import { program } from 'commander'
import chalk from 'chalk'
import { input, confirm, select } from '@inquirer/prompts'
import { execa } from 'execa'
import {
  loadHarness, findProjectConfig, classifyIntent,
  isGitRepo, createAgentBranch, currentBranch, getDiff, getChangedFiles,
  deleteAgentBranch, appendRun, readRuns, lastRun,
} from '@aiagent/core'
import type { ProjectConfig, ProviderName, KiroEngineConfig, AgentEngineConfig, ProviderConfig } from '@aiagent/core'
import {
  FeatureAgent, BugAgent, ReviewAgent,
  KiroFeatureAgent, KiroBugAgent, KiroReviewAgent,
} from '@aiagent/agents'
import type { ReviewOptions } from '@aiagent/agents'
import { renderEvent } from './render.js'

const VERSION = '0.1.0'

function resolveProvider(configProvider?: ProviderName): { provider: ProviderName; apiKey: string } {
  const anthropicKey = process.env['ANTHROPIC_API_KEY']
  const openaiKey = process.env['OPENAI_API_KEY']
  if (configProvider === 'openai' && openaiKey) return { provider: 'openai', apiKey: openaiKey }
  if (configProvider === 'anthropic' && anthropicKey) return { provider: 'anthropic', apiKey: anthropicKey }
  if (anthropicKey) return { provider: 'anthropic', apiKey: anthropicKey }
  if (openaiKey) return { provider: 'openai', apiKey: openaiKey }
  console.error(chalk.red('No API key.\n  export ANTHROPIC_API_KEY=... or OPENAI_API_KEY=...'))
  process.exit(1)
}

program
  .name('aiagent')
  .description('AI development assistant — powered by kiro-cli, Anthropic, or OpenAI')
  .version(VERSION)

// ─── run ────────────────────────────────────────────────────────────────────
program
  .command('run [task]')
  .description('Run the agent on a task')
  .option('-p, --project <path>', 'project directory', process.cwd())
  .option('-f, --framework <name>', 'framework override')
  .option('-a, --agent <type>', 'agent type (feature|bug|review|refactor|test)')
  .option('--provider <name>', 'provider (kiro|anthropic|openai)')
  .option('--model <model>', 'model override')
  .option('--no-branch', 'skip auto git branch creation')
  .option('--verbose', 'show full hook output')
  .action(async (taskArg: string | undefined, opts) => {
    const startTime = Date.now()

    let projectConfig: ProjectConfig | null = await findProjectConfig(opts.project)
    if (!projectConfig) {
      if (!opts.framework) {
        console.error(chalk.red('No aiagent.config.json found.\nRun: aiagent init --framework nextjs'))
        process.exit(1)
      }
      projectConfig = { framework: opts.framework as ProjectConfig['framework'], provider: 'kiro' }
    }

    if (opts.framework) projectConfig.framework = opts.framework as ProjectConfig['framework']
    if (opts.provider) projectConfig.provider = opts.provider as ProviderName
    if (opts.model) projectConfig.model = opts.model

    const provider = projectConfig.provider ?? 'kiro'
    if (provider !== 'kiro') {
      const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
      if (!process.env[envKey]) {
        console.error(chalk.red(`Missing: ${envKey}`))
        process.exit(1)
      }
    }

    const task = taskArg ?? await input({ message: 'What should the agent do?' })
    if (!task.trim()) process.exit(0)

    const agentType = opts.agent ?? classifyIntent(task)

    // ── Git: create branch ──────────────────────────────────────────────────
    let agentBranch: string | null = null
    let originalBranch: string | null = null

    if (opts.branch !== false && await isGitRepo(opts.project)) {
      originalBranch = await currentBranch(opts.project)
      agentBranch = await createAgentBranch(opts.project, task)
    }

    // ── Print header ────────────────────────────────────────────────────────
    console.log(chalk.gray(`\nProject:   ${opts.project}`))
    console.log(chalk.gray(`Framework: ${projectConfig.framework}`))
    console.log(chalk.gray(`Provider:  ${provider}${projectConfig.model ? ` / ${projectConfig.model}` : ''}`))
    console.log(chalk.gray(`Agent:     ${agentType}`))
    if (agentBranch) console.log(chalk.gray(`Branch:    ${agentBranch}`))
    console.log(chalk.bold(`\nTask: ${task}\n`))
    console.log(chalk.gray('─'.repeat(60)))

    const harness = await loadHarness(projectConfig)

    // ── Build engine config ─────────────────────────────────────────────────
    let filesChanged: string[] = []

    if (provider === 'kiro') {
      const kiroConfig: KiroEngineConfig = {
        projectDir: opts.project,
        ...(projectConfig.model ? { model: projectConfig.model } : {}),
        trustAllTools: true,
        verbose: opts.verbose ?? false,
      }

      let generator: AsyncGenerator<import('@aiagent/core').AgentEvent>
      switch (agentType) {
        case 'bug':   generator = new KiroBugAgent(harness, kiroConfig).run(task); break
        case 'review':
          generator = new KiroReviewAgent(harness, kiroConfig).run({ targets: [opts.project] } as ReviewOptions)
          break
        default:      generator = new KiroFeatureAgent(harness, kiroConfig).run(task)
      }

      for await (const event of generator) {
        if (event.type === 'done') {
          filesChanged = event.data['filesChanged'] as string[]
        }
        renderEvent(event)
      }
    } else {
      const { apiKey } = resolveProvider(provider)
      const providerConfig: ProviderConfig = {
        provider,
        apiKey,
        ...(projectConfig.model ? { model: projectConfig.model } : {}),
      }
      const engineConfig: AgentEngineConfig = { provider: providerConfig, projectDir: opts.project }

      let agent: FeatureAgent | BugAgent | ReviewAgent
      let generator: AsyncGenerator<import('@aiagent/core').AgentEvent>

      switch (agentType) {
        case 'bug':
          agent = new BugAgent(harness, engineConfig)
          generator = (agent as BugAgent).run(task)
          break
        case 'review':
          agent = new ReviewAgent(harness, engineConfig)
          generator = (agent as ReviewAgent).run({ targets: [opts.project] })
          break
        default:
          agent = new FeatureAgent(harness, engineConfig)
          generator = (agent as FeatureAgent).run(task)
      }

      for await (const event of generator) {
        if (event.type === 'approval_required') {
          renderEvent(event)
          const approved = await confirm({ message: 'Allow this operation?', default: false })
          if ('approve' in agent) {
            const id = event.data['toolName'] as string
            if (approved) (agent as FeatureAgent).approve(id)
            else (agent as FeatureAgent).deny(id)
          }
          continue
        }
        if (event.type === 'done') filesChanged = event.data['filesChanged'] as string[]
        renderEvent(event)
      }
    }

    // ── Show git diff ───────────────────────────────────────────────────────
    if (agentBranch && await isGitRepo(opts.project)) {
      const diff = await getDiff(opts.project)
      const changed = await getChangedFiles(opts.project)
      if (changed.length > 0) {
        renderEvent({ type: 'git_diff', data: { diff, filesChanged: changed } })
      }
    }

    // ── Persist session record ──────────────────────────────────────────────
    await appendRun(opts.project, {
      timestamp: new Date().toISOString(),
      task,
      agentType,
      provider,
      branch: agentBranch,
      filesChanged,
      durationMs: Date.now() - startTime,
    })

    if (agentBranch) {
      console.log(chalk.gray(`\nBranch: ${chalk.cyan(agentBranch)}`))
      console.log(chalk.gray(`  git diff ${originalBranch}..${agentBranch}   to see all changes`))
      console.log(chalk.gray(`  aiagent undo                       to discard and return to ${originalBranch}`))
    }
  })

// ─── review ──────────────────────────────────────────────────────────────────
program
  .command('review [path]')
  .description('Review code: a directory, staged changes, or working tree diff')
  .option('-p, --project <path>', 'project directory', process.cwd())
  .option('--staged', 'review git staged changes')
  .option('--diff', 'review git working tree diff (unstaged)')
  .option('--provider <name>', 'provider override')
  .action(async (reviewPath: string | undefined, opts) => {
    const projectConfig: ProjectConfig = await findProjectConfig(opts.project)
      ?? { framework: 'nextjs', provider: 'kiro' }
    if (opts.provider) projectConfig.provider = opts.provider as ProviderName

    let gitDiff: string | undefined
    let targets: string[] = [reviewPath ?? opts.project]

    if (opts.staged) {
      const r = await execa('git', ['diff', '--staged'], { cwd: opts.project, reject: false })
      gitDiff = r.stdout
      targets = ['staged changes']
      if (!gitDiff.trim()) { console.log(chalk.yellow('No staged changes.')); return }
    } else if (opts.diff) {
      const r = await execa('git', ['diff', 'HEAD'], { cwd: opts.project, reject: false })
      gitDiff = r.stdout
      targets = ['working tree changes']
      if (!gitDiff.trim()) { console.log(chalk.yellow('No working tree changes.')); return }
    }

    const harness = await loadHarness(projectConfig)
    const task = gitDiff != null && gitDiff.length > 0
      ? `Review the following git diff and give feedback:\n\n${gitDiff.slice(0, 12000)}`
      : `Review the code in: ${targets.join(', ')}`

    const kiroConfig: KiroEngineConfig = { projectDir: opts.project, trustAllTools: true }

    console.log(chalk.bold(`\nReviewing: ${targets.join(', ')}\n`) + chalk.gray('─'.repeat(60)))

    for await (const event of new KiroReviewAgent(harness, kiroConfig).run({ targets })) {
      renderEvent(event)
    }
  })

// ─── status ──────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show recent agent runs in this project')
  .option('-p, --project <path>', 'project directory', process.cwd())
  .action(async (opts) => {
    const runs = await readRuns(opts.project)
    if (!runs.length) {
      console.log(chalk.gray('No runs yet. Try: aiagent run "add a button"'))
      return
    }

    console.log(chalk.bold(`\nRecent runs (${opts.project})\n`))
    for (const r of runs.slice(0, 10)) {
      const time = new Date(r.timestamp).toLocaleString()
      const dur = `${(r.durationMs / 1000).toFixed(0)}s`
      const files = r.filesChanged.length ? chalk.gray(`${r.filesChanged.length} files`) : chalk.gray('no changes')
      const branch = r.branch ? chalk.cyan(r.branch) : chalk.gray('no branch')
      console.log(`  ${chalk.gray(r.id)}  ${chalk.white(r.task.slice(0, 50))}`)
      console.log(`        ${chalk.gray(time)}  ${dur}  ${files}  ${branch}`)
      console.log()
    }
  })

// ─── undo ────────────────────────────────────────────────────────────────────
program
  .command('undo')
  .description('Undo the last agent run (deletes agent branch, returns to original)')
  .option('-p, --project <path>', 'project directory', process.cwd())
  .action(async (opts) => {
    const last = await lastRun(opts.project)
    if (!last) { console.log(chalk.gray('No runs to undo.')); return }
    if (!last.branch) {
      console.log(chalk.yellow(`Last run "${last.task}" had no branch — cannot auto-undo.`))
      console.log(chalk.gray(`Changed files: ${last.filesChanged.join(', ')}`))
      return
    }

    console.log(chalk.yellow(`\nUndo: "${last.task}"`))
    console.log(chalk.gray(`  Branch to delete: ${last.branch}`))

    const ok = await confirm({ message: 'Proceed?', default: false })
    if (!ok) return

    const origin = await currentBranch(opts.project)
    const returnTo = origin === last.branch ? 'main' : origin
    const done = await deleteAgentBranch(opts.project, last.branch, returnTo)
    if (done) {
      console.log(chalk.green(`✓ Deleted ${last.branch}, back on ${returnTo}`))
    } else {
      console.log(chalk.red(`Failed to delete branch. Run: git checkout ${returnTo} && git branch -D ${last.branch}`))
    }
  })

// ─── init ────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize aiagent in a project')
  .option('-f, --framework <name>', 'framework (nextjs|react|vue|flutter|rust)')
  .option('--provider <name>', 'AI provider (kiro|anthropic|openai)', 'kiro')
  .action(async (opts) => {
    const { writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')

    const framework = opts.framework ?? await select({
      message: 'Select framework:',
      choices: [
        { value: 'nextjs', name: 'Next.js (App Router)' },
        { value: 'react', name: 'React' },
        { value: 'vue', name: 'Vue 3' },
        { value: 'flutter', name: 'Flutter' },
        { value: 'rust', name: 'Rust' },
      ],
    })

    const config: ProjectConfig = {
      framework: framework as ProjectConfig['framework'],
      provider: opts.provider as ProviderName,
    }

    await writeFile(join(process.cwd(), 'aiagent.config.json'), JSON.stringify(config, null, 2))
    console.log(chalk.green(`\n✓ aiagent.config.json created (${framework} / ${opts.provider})`))
    if (opts.provider === 'kiro') {
      console.log(chalk.gray('Ready. Run: aiagent run "your task"'))
    } else {
      const envVar = opts.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
      console.log(chalk.gray(`Next: export ${envVar}=<key> && aiagent run`))
    }
  })

// ─── harness ─────────────────────────────────────────────────────────────────
program
  .command('harness')
  .description('Show the active harness for this project')
  .action(async () => {
    const config = await findProjectConfig()
    if (!config) { console.error(chalk.red('No aiagent.config.json')); process.exit(1) }
    const h = await loadHarness(config)
    console.log(chalk.bold(`\n${h.name}`) + chalk.gray(`  (${h.framework} / ${config.provider ?? 'kiro'})`))
    console.log(chalk.bold('\nConventions:'))
    for (const c of h.conventions) {
      console.log(chalk.cyan(`  ${c.category}`) + chalk.gray(`  ${c.rules.length} rules`))
    }
    if (h.hooks.length) {
      console.log(chalk.bold('\nHooks:'))
      for (const hook of h.hooks) {
        console.log(chalk.gray(`  [${hook.trigger}] ${hook.command.slice(0, 70)}`))
      }
    }
    if (h.forbiddenZones.length) {
      console.log(chalk.bold('\nForbidden:'))
      for (const z of h.forbiddenZones) {
        console.log(chalk.red(`  ${z.path}`) + chalk.gray(`  — ${z.reason}`))
      }
    }
  })

program.parse()
