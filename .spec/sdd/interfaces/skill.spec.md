# Interface Spec: Skills 技能系统

> Phase 5.3 Skills - 基于 Workflow 的快捷命令

## 概述

Skills 是预定义的快捷命令，让用户通过 `/command` 语法快速执行常见任务。

```bash
naughtagent /commit          # 生成 commit 消息并提交
naughtagent /pr              # 生成 PR 描述
naughtagent /review          # 代码审查
naughtagent /test            # 运行测试并分析
```

Skills 基于 Workflow 模式实现，每个 Skill 是一个预定义的工作流。

---

## 1. Types

```typescript
/**
 * Skill 定义
 */
interface SkillDefinition {
  /** Skill 名称（不含 /） */
  name: string
  /** 描述 */
  description: string
  /** 别名 */
  aliases?: string[]
  /** 参数定义 */
  parameters?: SkillParameter[]
  /** 工作流定义 */
  workflow: WorkflowDefinition
}

/**
 * Skill 参数
 */
interface SkillParameter {
  /** 参数名 */
  name: string
  /** 描述 */
  description: string
  /** 是否必需 */
  required?: boolean
  /** 默认值 */
  default?: string
}

/**
 * Skill 执行结果
 */
interface SkillResult {
  /** 是否成功 */
  success: boolean
  /** 输出内容 */
  output: string
  /** 错误信息 */
  error?: string
  /** 执行的步骤 */
  steps?: SubTaskStep[]
}

/**
 * Skill 注册表
 */
interface SkillRegistry {
  /** 注册 Skill */
  register(skill: SkillDefinition): void
  /** 获取 Skill */
  get(name: string): SkillDefinition | undefined
  /** 列出所有 Skills */
  list(): SkillDefinition[]
  /** 检查是否存在 */
  has(name: string): boolean
}

/**
 * Skill 执行器
 */
interface SkillExecutor {
  /** 执行 Skill */
  execute(name: string, args?: string[], ctx?: { cwd: string }): Promise<SkillResult>
  /** 解析命令行 */
  parse(input: string): { name: string; args: string[] } | null
}
```

---

## 2. 内置 Skills

### 2.1 /commit - 生成 Commit 消息

```typescript
{
  name: "commit",
  description: "Generate commit message and commit staged changes",
  aliases: ["ci"],
  parameters: [
    { name: "message", description: "Override generated message", required: false }
  ],
  workflow: {
    name: "commit",
    steps: [
      // 1. 获取 staged diff
      {
        name: "get-diff",
        type: "tool",
        tool: { name: "bash", params: { command: "git diff --staged" } }
      },
      // 2. 检查是否有变更
      {
        name: "check-empty",
        type: "condition",
        condition: {
          check: (ctx) => ctx.results["get-diff"]?.trim() !== "",
          then: "generate-message",
          else: "no-changes"
        }
      },
      // 3. 生成 commit 消息
      {
        name: "generate-message",
        type: "llm",
        llm: {
          prompt: (ctx) => `根据以下 git diff 生成 commit 消息。
使用 Conventional Commits 格式：<type>(<scope>): <description>

类型：feat, fix, docs, style, refactor, test, chore

Diff:
${ctx.results["get-diff"]}

只输出 commit 消息，不要其他内容。`,
          outputFormat: "text"
        }
      },
      // 4. 确认
      {
        name: "confirm",
        type: "tool",
        tool: {
          name: "question",
          params: (ctx) => ({
            type: "confirm",
            message: `Commit message:\n${ctx.results["generate-message"]}\n\nProceed?`,
            default: true
          })
        }
      },
      // 5. 执行 commit
      {
        name: "do-commit",
        type: "condition",
        condition: {
          check: (ctx) => ctx.results["confirm"]?.value === true,
          then: "execute-commit",
          else: "cancelled"
        }
      },
      {
        name: "execute-commit",
        type: "tool",
        tool: {
          name: "bash",
          params: (ctx) => ({
            command: `git commit -m "${ctx.results["generate-message"].replace(/"/g, '\\"')}"`
          })
        }
      },
      // 错误处理
      {
        name: "no-changes",
        type: "llm",
        llm: { prompt: "No staged changes. Use `git add` first." }
      },
      {
        name: "cancelled",
        type: "llm",
        llm: { prompt: "Commit cancelled." }
      }
    ]
  }
}
```

### 2.2 /pr - 生成 PR 描述

```typescript
{
  name: "pr",
  description: "Generate PR description based on commits",
  aliases: ["pull-request"],
  parameters: [
    { name: "base", description: "Base branch", default: "main" }
  ],
  workflow: {
    name: "pr",
    steps: [
      // 1. 获取当前分支
      {
        name: "get-branch",
        type: "tool",
        tool: { name: "bash", params: { command: "git branch --show-current" } }
      },
      // 2. 获取 commits
      {
        name: "get-commits",
        type: "tool",
        tool: {
          name: "bash",
          params: (ctx) => ({
            command: `git log ${ctx.params.base || "main"}..HEAD --oneline`
          })
        }
      },
      // 3. 获取 diff 统计
      {
        name: "get-diff-stat",
        type: "tool",
        tool: {
          name: "bash",
          params: (ctx) => ({
            command: `git diff ${ctx.params.base || "main"}..HEAD --stat`
          })
        }
      },
      // 4. 生成 PR 描述
      {
        name: "generate-pr",
        type: "llm",
        llm: {
          prompt: (ctx) => `生成 PR 描述。

分支: ${ctx.results["get-branch"]}
Commits:
${ctx.results["get-commits"]}

变更统计:
${ctx.results["get-diff-stat"]}

使用以下格式：
## Summary
[简要描述这个 PR 做了什么]

## Changes
- [变更点1]
- [变更点2]

## Testing
[如何测试这些变更]`,
          outputFormat: "text"
        }
      },
      // 5. 输出结果
      {
        name: "output",
        type: "llm",
        llm: {
          prompt: (ctx) => `PR Description:\n\n${ctx.results["generate-pr"]}`
        }
      }
    ]
  }
}
```

### 2.3 /review - 代码审查

```typescript
{
  name: "review",
  description: "Review staged changes or specified files",
  aliases: ["cr"],
  parameters: [
    { name: "files", description: "Files to review (default: staged)", required: false }
  ],
  workflow: {
    name: "review",
    steps: [
      // 1. 获取要审查的代码
      {
        name: "get-code",
        type: "tool",
        tool: {
          name: "bash",
          params: (ctx) => ({
            command: ctx.params.files
              ? `git diff HEAD -- ${ctx.params.files}`
              : "git diff --staged"
          })
        }
      },
      // 2. 检查是否有内容
      {
        name: "check-empty",
        type: "condition",
        condition: {
          check: (ctx) => ctx.results["get-code"]?.trim() !== "",
          then: "do-review",
          else: "no-code"
        }
      },
      // 3. 执行审查
      {
        name: "do-review",
        type: "llm",
        llm: {
          prompt: (ctx) => `请审查以下代码变更，指出：
1. 潜在的 bug 或问题
2. 代码风格问题
3. 性能问题
4. 安全问题
5. 改进建议

代码变更：
${ctx.results["get-code"]}

请用中文回复，格式清晰。`,
          outputFormat: "text"
        }
      },
      // 错误处理
      {
        name: "no-code",
        type: "llm",
        llm: { prompt: "No code to review. Stage some changes or specify files." }
      }
    ]
  }
}
```

### 2.4 /test - 运行测试

```typescript
{
  name: "test",
  description: "Run tests and analyze results",
  aliases: ["t"],
  parameters: [
    { name: "pattern", description: "Test file pattern", required: false }
  ],
  workflow: {
    name: "test",
    steps: [
      // 1. 检测测试框架
      {
        name: "detect-framework",
        type: "tool",
        tool: {
          name: "bash",
          params: { command: "cat package.json | grep -E '(vitest|jest|mocha)' || echo 'unknown'" }
        }
      },
      // 2. 运行测试
      {
        name: "run-tests",
        type: "tool",
        tool: {
          name: "bash",
          params: (ctx) => {
            const pattern = ctx.params.pattern || ""
            // 简单检测
            if (ctx.results["detect-framework"]?.includes("vitest")) {
              return { command: `pnpm test ${pattern}` }
            }
            return { command: `npm test ${pattern}` }
          }
        }
      },
      // 3. 分析结果
      {
        name: "analyze",
        type: "llm",
        llm: {
          prompt: (ctx) => `分析以下测试结果，总结：
1. 测试是否通过
2. 失败的测试（如果有）
3. 可能的原因和修复建议

测试输出：
${ctx.results["run-tests"]}`,
          outputFormat: "text"
        }
      }
    ]
  }
}
```

---

## 3. Skill 执行器

### 3.1 命令解析

```typescript
// 解析 /command arg1 arg2
function parseSkillCommand(input: string): { name: string; args: string[] } | null {
  const match = input.match(/^\/(\w+)(?:\s+(.*))?$/)
  if (!match) return null

  const name = match[1]
  const argsStr = match[2] || ""
  const args = argsStr.split(/\s+/).filter(Boolean)

  return { name, args }
}
```

### 3.2 执行流程

```
用户输入: /commit
    │
    ▼
解析命令 → { name: "commit", args: [] }
    │
    ▼
查找 Skill → SkillRegistry.get("commit")
    │
    ▼
构建参数 → { ...defaultParams, ...argsToParams(args) }
    │
    ▼
执行 Workflow → runWorkflowTask(skill.workflow, params)
    │
    ▼
返回结果
```

---

## 4. 与 CLI 集成

```typescript
// CLI 检测 Skill 命令
async function handleInput(input: string) {
  // 检查是否是 Skill 命令
  const skillCommand = parseSkillCommand(input)
  if (skillCommand) {
    const result = await skillExecutor.execute(
      skillCommand.name,
      skillCommand.args,
      { cwd: process.cwd() }
    )
    console.log(result.output)
    return
  }

  // 否则作为普通 Agent 输入
  await agent.run(input)
}
```

---

## 5. 文件结构

```
src/
├── skill/
│   ├── index.ts        # 导出
│   ├── types.ts        # 类型定义
│   ├── registry.ts     # Skill 注册表
│   ├── executor.ts     # Skill 执行器
│   └── builtin/        # 内置 Skills
│       ├── commit.ts
│       ├── pr.ts
│       ├── review.ts
│       └── test.ts
```

---

## 6. 扩展性

用户可以自定义 Skills：

```typescript
// .naught/skills/my-skill.ts
export default {
  name: "deploy",
  description: "Deploy to production",
  workflow: {
    steps: [
      { name: "build", type: "tool", tool: { name: "bash", params: { command: "npm run build" } } },
      { name: "deploy", type: "tool", tool: { name: "bash", params: { command: "npm run deploy" } } },
    ]
  }
}
```

加载自定义 Skills：
```typescript
const customSkills = await loadSkillsFromDir(".naught/skills")
customSkills.forEach(skill => skillRegistry.register(skill))
```
