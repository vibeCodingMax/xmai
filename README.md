# xmai2.0

> AI 驱动的前端开发助手，让 Agent 接管 Next.js、React、Vue、Flutter、Rust 项目的日常编码工作。

---

## 目前已完成的功能

| 模块 | 功能 | 状态 |
|------|------|------|
| **KiroEngine** | 调用本地 kiro-cli，实时流式输出，无需 API Key | ✅ |
| **Hook 系统** | 写文件后自动触发 tsc / eslint / tests，变量替换，阻塞/非阻塞 | ✅ |
| **Git 集成** | 自动创建 `xmai/<task>` 分支、展示 diff、undo 回滚 | ✅ |
| **Intent Router** | 自动识别任务类型 → feature / bug / review / refactor / test / docs | ✅ |
| **会话日志** | 每次运行记录到 `.xmai/runs.jsonl`，支持 status 查看 | ✅ |
| **Harness 加载** | 内置模板 + 项目 overrides 合并，支持规范注入 | ✅ |
| **专职 Agent** | Feature / Bug / Review（kiro 版 + API 版） | ✅ |
| **CLI 命令** | run / review / status / undo / init / harness | ✅ |
| **框架 Harness** | Next.js、Vue 3、Flutter、Rust 内置模板 | ✅ |
| **多 Provider** | kiro（默认）/ Anthropic / OpenAI | ✅ |

---

## 解决什么问题

### 没有 xmai 时

```
你："帮我加一个用户角色筛选功能"

AI 回答了一段代码，但是：
  ✗ 没用你已有的 <Select> 组件，自己重新写了一个
  ✗ 用了 inline style，违反 Tailwind 规范
  ✗ 没有对应的测试文件
  ✗ 没有导出到 index.ts
  ✗ TypeScript 报了 3 个错

你：手动修了 4 个问题，花了 30 分钟
```

### 有 xmai 时

```
xmai run "给用户列表加角色筛选功能"

Agent：
  1. 读取 Harness → 知道项目用 Tailwind、已有 <Select>、组件放哪里
  2. 读取现有代码 → 复用已有组件和 API
  3. 生成完整实现 + 测试文件
  4. 自动跑 tsc → 发现错误 → 写到 hook_end 事件
  5. 自动创建 xmai/xxx 分支，展示 colored git diff
  6. 记录本次运行到 .xmai/runs.jsonl

你：3 分钟 review，merge
```

**核心价值：**

| 场景 | 没有 Agent | 有 Agent |
|------|-----------|---------|
| 新增组件 | 30 min 写 + 调 | 3 min 审查 diff |
| 修 Bug | 定位 + 修复 + 验证 | 描述现象，审查修改 |
| Code Review | 人工逐行 | 自动分级 MUST / SUGGEST / OPTIONAL |
| 写测试 | 手写，经常忘 | 随代码自动生成 |
| 规范一致性 | 靠记忆和 review | Harness 强制注入，AI 自动遵守 |

---

## 架构

```
xmai2.0/
├── apps/cli/src/
│   ├── index.ts          # 6 个 CLI 命令入口
│   └── render.ts         # 终端渲染：spinner、hook 输出、colored diff
│
├── packages/core/src/
│   ├── engine/
│   │   ├── kiro.ts       # KiroEngine：调 kiro-cli，实时流，跑 post hooks
│   │   ├── agent.ts      # AgentEngine：API 模式（Anthropic / OpenAI）
│   │   ├── intent.ts     # 任务分类器
│   │   ├── tools.ts      # 工具定义（read_file / write_file / bash / search）
│   │   └── types.ts      # AgentEvent 类型（含 hook_start/end、git_diff）
│   ├── harness/
│   │   ├── loader.ts     # 加载 + 合并 harness（内置 + 项目 overrides）
│   │   ├── hooks.ts      # runHooks：变量替换、pattern 匹配、阻塞执行
│   │   └── types.ts      # Harness / HookConfig / ProjectConfig schema
│   ├── git/index.ts      # isGitRepo / createAgentBranch / getDiff / undo
│   ├── session/log.ts    # appendRun / readRuns / lastRun → .xmai/runs.jsonl
│   └── providers/        # Anthropic + OpenAI provider 抽象
│
├── packages/agents/src/
│   ├── feature.ts        # FeatureAgent（API 版）
│   ├── bug.ts            # BugAgent（API 版）
│   ├── review.ts         # ReviewAgent（API 版）
│   └── kiro-agents.ts    # KiroFeatureAgent / KiroBugAgent / KiroReviewAgent
│
└── harnesses/
    ├── nextjs/harness.json   # App Router 规范 + tsc + eslint + vitest hooks
    ├── vue/harness.json      # Vue 3 + Pinia + vue-tsc hooks
    ├── flutter/harness.json  # Riverpod + dart format + flutter analyze
    └── rust/harness.json     # Tokio + cargo fmt + cargo clippy
```

---

## 快速开始

### 前置条件

```bash
node -v   # >= 20
pnpm -v   # >= 9
kiro-cli --version   # 本地已安装并登录
```

kiro-cli 安装：https://kiro.dev

### 安装 xmai

```bash
git clone https://github.com/yourname/xmai2.0
cd xmai2.0
pnpm install
pnpm build

# 全局链接（可选，让 xmai 命令全局可用）
npm link apps/cli
```

### 在你的项目初始化

```bash
cd your-project

# 交互式选择框架
xmai init

# 或直接指定
xmai init --framework nextjs --provider kiro
```

生成 `xmai.config.json`：

```json
{
  "framework": "nextjs",
  "provider": "kiro"
}
```

---

## 命令参考

### `xmai run [task]` — 执行开发任务

```bash
# 自然语言描述任务（自动识别类型）
xmai run "给用户列表加角色筛选功能"

# 中文任务也支持
xmai run "在 dashboard 页面的用户表格里，给每行添加删除按钮"

# 指定 Agent 类型
xmai run "登录按钮点击没反应" --agent bug
xmai run "重构 UserCard 组件" --agent refactor

# 指定项目目录（不在项目目录下时）
xmai run "加分页组件" --project /path/to/your/project

# 不自动创建分支（直接在当前分支操作）
xmai run "修改 Button 样式" --no-branch

# 显示完整 hook 输出
xmai run "重构 auth 模块" --verbose

# 使用 Anthropic API 而非 kiro
xmai run "给 checkout 加单测" --provider anthropic --model claude-sonnet-4-5
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--project <path>` | 项目目录 | 当前目录 |
| `--framework <name>` | 框架覆盖 | 读 config |
| `--agent <type>` | feature / bug / review / refactor / test | 自动识别 |
| `--provider <name>` | kiro / anthropic / openai | 读 config |
| `--model <name>` | 模型名称 | provider 默认 |
| `--no-branch` | 跳过自动建分支 | 默认建分支 |
| `--verbose` | 显示完整 hook 输出 | 只显示前 10 行 |

**任务自动识别逻辑：**

```
"给列表加筛选功能"          → feature
"登录按钮点击没反应"         → bug（含 fix / error / 修复 等关键词）
"重构 UserCard 组件"        → refactor
"审查 checkout 目录代码"     → review
"给 auth 模块加单元测试"     → test
"生成 README 文档"          → docs
```

---

### `xmai review [path]` — 代码审查

```bash
# 审查一个目录
xmai review src/components/features/checkout/

# 审查 git staged 的改动（commit 前快速检查）
xmai review --staged

# 审查当前工作区所有改动
xmai review --diff

# 指定项目目录
xmai review --staged --project /path/to/project
```

输出格式：
- `[MUST]` — 必须修改，阻塞合并
- `[SUGGEST]` — 建议改进，不阻塞
- `[OPTIONAL]` — 可选优化

---

### `xmai status` — 查看运行历史

```bash
xmai status
xmai status --project /path/to/project
```

输出最近 10 次运行：任务描述、时间、耗时、文件变更数、分支名。

---

### `xmai undo` — 撤销上次运行

```bash
xmai undo
```

交互确认后：
- 删除上次创建的 `xmai/<xxx>` 分支
- 切回原始分支

> 注意：只能撤销使用了 git 分支的运行（默认行为）。

---

### `xmai init` — 初始化配置

```bash
xmai init                          # 交互选择框架
xmai init --framework vue          # Vue 3
xmai init --framework flutter      # Flutter
xmai init --framework rust         # Rust
xmai init --framework nextjs --provider anthropic   # 使用 Anthropic API
```

---

### `xmai harness` — 查看当前 Harness

```bash
xmai harness
```

显示当前项目加载的：
- 规范分类（组件结构、命名、TypeScript 规范...）
- 自动运行的 Hooks（tsc / eslint / vitest...）
- 禁止修改的区域（auth 路由 / .env / 数据库迁移...）

---

## 支持的框架

| 框架 | 内置规范 | 自动 Hooks |
|------|---------|-----------|
| **Next.js** | App Router、组件目录、Tailwind、Zustand、路由规范 | tsc + eslint + vitest |
| **Vue 3** | Composition API、Pinia、`<script setup>`、命名规范 | vue-tsc + eslint |
| **Flutter** | Riverpod、Feature-first 结构、Dart 命名规范 | dart format + flutter analyze |
| **Rust** | 错误处理（Result）、async/await、模块结构、Clippy 规范 | cargo fmt + cargo clippy |

---

## Hook 系统

写文件后 Agent 自动运行检查命令，**不需要手动触发**。

### Hook 如何工作

```
kiro 写文件
    ↓
git diff --name-only HEAD（检测变更文件）
    ↓
对每个 .ts/.tsx 文件：
    匹配 hook pattern → 执行命令（{projectDir} 变量替换）
    ↓
hook_end 事件 → 渲染输出到终端
```

### 内置 Next.js Hooks

```json
[
  { "trigger": "PostWrite", "pattern": "**/*.{ts,tsx}", "command": "cd {projectDir} && npx tsc --noEmit" },
  { "trigger": "PostWrite", "pattern": "**/*.{ts,tsx}", "command": "cd {projectDir} && npx eslint --fix {filePath}" },
  { "trigger": "PostWrite", "pattern": "**/*.test.{ts,tsx}", "command": "cd {projectDir} && npx vitest run {filePath}" }
]
```

### 在项目里自定义 Hook

```json
// xmai.config.json
{
  "framework": "nextjs",
  "provider": "kiro",
  "overrides": {
    "hooks": [
      {
        "trigger": "PostWrite",
        "pattern": "**/*.{ts,tsx}",
        "command": "cd {projectDir} && npx tsc --noEmit 2>&1 | head -20",
        "blocking": true,
        "failOnError": false
      }
    ]
  }
}
```

变量：`{projectDir}` → 项目根目录绝对路径，`{filePath}` → 当前文件绝对路径

---

## 自定义 Harness（项目规范注入）

在 `xmai.config.json` 的 `overrides` 字段覆盖内置规范：

```json
{
  "framework": "nextjs",
  "provider": "kiro",
  "overrides": {
    "systemContext": "电商平台，使用 shadcn/ui 组件库，所有 API 调用走 React Query",
    "conventions": [
      {
        "category": "业务规范",
        "rules": [
          "所有价格展示必须用 formatPrice() 函数，禁止直接展示数字",
          "购物车操作统一走 useCart() hook，不能直接操作 store",
          "新页面必须在 app/ 目录下，文件名用 kebab-case"
        ]
      }
    ],
    "forbiddenZones": [
      { "path": "src/payment/**", "reason": "支付模块需要单独安全评审，不得修改" },
      { "path": ".env*", "reason": "环境变量文件禁止 Agent 读写" }
    ]
  }
}
```

**Harness 优先级（高到低）：**
1. `xmai.config.json` 的 `overrides`
2. 项目自定义 `harnessPath` 指向的 JSON
3. 内置框架模板（`harnesses/{framework}/harness.json`）

---

## 支持的 AI Provider

| Provider | 配置 | 适用场景 |
|----------|------|---------|
| **kiro**（默认） | 无需配置，使用本地 kiro-cli | 日常开发，免费额度 |
| **anthropic** | `export ANTHROPIC_API_KEY=sk-ant-...` | CI / 团队共享 |
| **openai** | `export OPENAI_API_KEY=sk-...` | GPT-4o 等模型 |

---

## 典型工作流

### 日常功能开发

```bash
cd your-project

# 1. 让 Agent 实现功能（自动建分支、自动跑类型检查）
xmai run "在订单列表页添加按状态筛选，状态：待付款/已付款/已发货/已完成"

# 2. 查看 diff（Agent 运行结束后自动展示，也可手动查看）
git diff main..xmai/xxx

# 3. Review 并合并
git checkout main && git merge xmai/xxx
```

### 修 Bug

```bash
xmai run "用户在 Safari 上点击提交按钮没有反应，控制台报 TypeError: Cannot read properties of undefined (reading 'value')" --agent bug
```

### Commit 前 Review

```bash
git add src/components/features/cart/
xmai review --staged
# 输出 [MUST] / [SUGGEST] / [OPTIONAL] 分级建议
```

### 撤销失败的 Agent 运行

```bash
xmai status        # 查看上次运行的分支名
xmai undo          # 删除 agent 分支，切回原分支
```

---

## Roadmap

### 近期（P2）
- [ ] **Stack Trace → 自动修复**：`xmai fix --trace "TypeError..."` — 解析报错定位到文件行，最小改动修复
- [ ] **React 框架 Harness**：补充 React（非 Next.js）内置模板

### 中期
- [ ] **Anthropic 流式输出**：API 模式下 token 级实时输出
- [ ] **测试感知**：hooks 检测到测试失败后，自动触发 bug agent 修复

### 长期
- [ ] **Figma MCP 集成**：设计稿 → 代码，直接生成组件
- [ ] **多 Agent 并行**：写代码 + 写测试同时进行
- [ ] **自动生成 PR 描述**：git 集成 → 提交时自动生成 PR title + body
