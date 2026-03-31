# aiagent2.0

AI-powered development assistant that replaces frontend engineers for Next.js, React, Vue, Flutter, and Rust projects.

## Architecture

```
packages/core     → Harness system + Agent engine (framework-agnostic)
packages/agents   → Specialized agents (Feature, Bug, Review)
apps/cli          → CLI interface
harnesses/        → Framework-specific harness templates
```

## Key Concepts

- **Harness**: Framework-specific context injected into every agent run (conventions, rules, forbidden zones)
- **Agent Engine**: Executes tasks using Claude API + tools, runs hooks automatically
- **Hooks**: Shell commands triggered after tool use (tsc, lint, tests)
- **Intent Router**: Classifies tasks → routes to Feature/Bug/Review agent

## Conventions

- All packages use `NodeNext` module resolution
- Errors use `Result<T, E>` pattern — no throwing from agent code
- Harness templates live in `/harnesses/{framework}/`
- Each agent returns `AsyncGenerator<AgentEvent>`

## Forbidden

- Do NOT add UI (this is CLI/SDK only)
- Do NOT add unnecessary abstractions for one-off operations
- Do NOT use `any` type
