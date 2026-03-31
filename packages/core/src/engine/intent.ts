export type AgentType = 'feature' | 'bug' | 'review' | 'refactor' | 'test' | 'docs'

interface IntentPattern {
  type: AgentType
  patterns: RegExp[]
  keywords: string[]
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: 'bug',
    patterns: [/fix(ed)?/i, /error/i, /broken/i, /crash/i, /fail/i, /not working/i],
    keywords: ['bug', 'fix', 'broken', 'error', 'crash', 'issue', 'problem', 'wrong', '报错', '修复', 'bug'],
  },
  {
    type: 'review',
    patterns: [/review/i, /check/i, /audit/i, /analyze/i],
    keywords: ['review', 'check', 'audit', 'inspect', '审查', '检查'],
  },
  {
    type: 'refactor',
    patterns: [/refactor/i, /clean(up)?/i, /restructure/i, /reorganize/i],
    keywords: ['refactor', 'cleanup', 'clean up', 'restructure', '重构', '整理'],
  },
  {
    type: 'test',
    patterns: [/test(s|ing)?/i, /spec/i, /unit test/i, /e2e/i],
    keywords: ['test', 'tests', 'testing', 'spec', 'coverage', '测试', '单测'],
  },
  {
    type: 'docs',
    // Only match when the task is ABOUT generating docs, not when "文档" appears as a UI label
    patterns: [/generate doc/i, /write doc/i, /add doc/i, /jsdoc/i, /readme/i],
    keywords: ['readme', 'jsdoc', 'documentation', '生成文档', '写文档', '注释'],
  },
  {
    type: 'feature',
    patterns: [/add/i, /create/i, /implement/i, /build/i, /new/i, /添加/i, /新增/i],
    keywords: ['add', 'create', 'implement', 'build', 'new', 'feature', '添加', '新增', '实现', '创建', '卡片', '按钮', '页面'],
  },
]

/**
 * Classifies a task description into an agent type.
 * Defaults to 'feature' if no strong signal found.
 */
export function classifyIntent(task: string): AgentType {
  const lower = task.toLowerCase()

  const scores = new Map<AgentType, number>()

  for (const intent of INTENT_PATTERNS) {
    let score = 0
    for (const pattern of intent.patterns) {
      if (pattern.test(lower)) score += 2
    }
    for (const keyword of intent.keywords) {
      if (lower.includes(keyword)) score += 1
    }
    if (score > 0) scores.set(intent.type, score)
  }

  if (scores.size === 0) return 'feature'

  // Return the highest scoring intent
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'feature'
}
