# Phase 5.3 总结：Skills 技能系统

> 完成时间：2026-01-15

## 做了什么

实现了 Skills 技能系统，提供预定义的快捷命令：

### 核心模块

| 模块 | 文件 | 说明 |
|------|------|------|
| 类型定义 | `src/skill/types.ts` | SkillDefinition, SkillParameter, SkillResult 等 |
| 注册表 | `src/skill/registry.ts` | Skill 注册、查询、别名支持 |
| 执行器 | `src/skill/executor.ts` | 命令解析、参数处理、工作流执行 |

### 内置 Skills

| Skill | 别名 | 说明 |
|-------|------|------|
| `/commit` | `/ci` | 生成 commit 消息并提交 |
| `/pr` | `/pull-request` | 生成 PR 描述 |
| `/review` | `/cr`, `/code-review` | 代码审查 |
| `/test` | `/t` | 运行测试并分析结果 |

### 测试覆盖

- 测试文件：4 个
- 测试用例：77 个
- 核心模块覆盖率：100%

## 能干什么

### 命令解析

```typescript
import { parseSkillCommand } from "@naughtagent/agent"

// 解析 /command 语法
parseSkillCommand("/commit")
// => { name: "commit", args: [], namedArgs: {} }

parseSkillCommand("/pr --base=develop")
// => { name: "pr", args: [], namedArgs: { base: "develop" } }

parseSkillCommand('/commit "fix: bug"')
// => { name: "commit", args: ["fix: bug"], namedArgs: {} }
```

### Skill 注册和执行

```typescript
import {
  registerSkill,
  executeSkill,
  initSkills,
  createSkillExecutor,
} from "@naughtagent/agent"

// 初始化内置 Skills
initSkills()

// 执行 Skill
const result = await executeSkill("/commit --all", [], { cwd: "/project" }, runtime)

// 或创建执行器实例
const executor = createSkillExecutor(runtime)
await executor.execute("/review")
```

### 自定义 Skill

```typescript
import { registerSkill } from "@naughtagent/agent"

registerSkill({
  name: "deploy",
  description: "Deploy to production",
  aliases: ["d"],
  parameters: [
    { name: "env", description: "Environment", default: "staging" }
  ],
  workflow: {
    name: "deploy",
    description: "Deploy workflow",
    steps: [
      {
        name: "build",
        type: "tool",
        tool: { name: "bash", params: { command: "npm run build" } }
      },
      {
        name: "deploy",
        type: "tool",
        tool: {
          name: "bash",
          params: (ctx) => ({ command: `npm run deploy:${ctx.params.env}` })
        }
      }
    ]
  }
})
```

## 在 Agent 中的作用

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                    CLI / Runner                      │
│                                                      │
│  输入: "/commit --all"                               │
│                                                      │
│  1. 检测是否是 Skill 命令                            │
│     isSkillCommand("/commit --all") → true          │
│                                                      │
│  2. 解析命令                                         │
│     parseSkillCommand() → { name, args, namedArgs } │
│                                                      │
│  3. 执行 Skill                                       │
│     executeSkill() → SkillResult                    │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                  Skill Executor                      │
│                                                      │
│  1. 查找 Skill 定义                                  │
│     getSkill("commit") → SkillDefinition            │
│                                                      │
│  2. 构建参数                                         │
│     { all: "true", ...defaults }                    │
│                                                      │
│  3. 注册并执行 Workflow                              │
│     runWorkflowTask(skill.workflow, params)         │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                  Workflow Engine                     │
│                                                      │
│  /commit 工作流步骤：                                │
│                                                      │
│  1. stage-all (条件)                                │
│     └─ 如果 --all，执行 git add -A                  │
│                                                      │
│  2. get-diff (工具)                                 │
│     └─ git diff --staged                            │
│                                                      │
│  3. check-empty (条件)                              │
│     └─ 检查是否有变更                               │
│                                                      │
│  4. generate-message (LLM)                          │
│     └─ 根据 diff 生成 commit 消息                   │
│                                                      │
│  5. confirm (工具: question)                        │
│     └─ 询问用户确认                                 │
│                                                      │
│  6. do-commit (工具)                                │
│     └─ git commit -m "..."                          │
└─────────────────────────────────────────────────────┘
    │
    ▼
输出结果
```

### 与其他模块的关系

```
┌─────────────────────────────────────────────────────┐
│                     Skill                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   types     │  │  registry   │  │  executor   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                          │                │          │
│                          │                │          │
│  ┌─────────────────────────────────────────────┐    │
│  │              builtin skills                  │    │
│  │  commit │ pr │ review │ test                │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│                    SubTask                           │
│                                                      │
│  Workflow 模式：执行 Skill 定义的工作流              │
│  - 步骤执行                                          │
│  - 条件分支                                          │
│  - 上下文传递                                        │
└─────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐    ┌─────────────────────┐
│       Tool          │    │      Provider       │
│                     │    │                     │
│  bash, question     │    │  LLM 调用           │
│  等工具执行         │    │  生成消息/分析      │
└─────────────────────┘    └─────────────────────┘
```

## 当前整体能力

### 能做什么

- ✅ 文件操作：读/写/编辑/搜索
- ✅ 命令执行：bash 命令
- ✅ 对话管理：多轮对话、历史持久化
- ✅ Agent 循环：LLM → Tool → LLM
- ✅ 权限控制：危险操作确认
- ✅ 上下文感知：项目结构、Git 状态
- ✅ Token 管理：计数、截断
- ✅ 安全防护：路径限制、命令过滤
- ✅ 用户体验：Diff 预览、撤销操作
- ✅ 子任务系统：API/Workflow/Agent 三种模式
- ✅ 交互工具：question 提问、todo 任务管理
- ✅ **Skills 技能**：/commit, /pr, /review, /test

### 不能做什么

- ❌ Rules 索引：按需加载项目规则
- ❌ HTTP Server：REST API 服务
- ❌ MCP 协议：连接外部工具服务器

## 下一步建议

### Phase 5.4: Rules 索引系统

让 Agent 按需加载项目规则：

1. **Rules 索引** - 规则文件索引和元数据
2. **按需加载** - 根据任务类型加载相关规则
3. **触发条件** - 规则的适用场景定义
4. **动态指令发现** - 读取 Justfile/Makefile/scripts

### Phase 5.5: 外部集成

与外部系统集成：

1. **HTTP Server** - VS Code 插件通过 HTTP 调用
2. **MCP Client** - 连接 MCP 工具服务器

## 文件清单

```
packages/agent/src/skill/
├── index.ts           # 模块导出
├── types.ts           # 类型定义
├── registry.ts        # Skill 注册表
├── executor.ts        # Skill 执行器
└── builtin/
    ├── index.ts       # 内置 Skills 导出
    ├── commit.ts      # /commit
    ├── pr.ts          # /pr
    ├── review.ts      # /review
    └── test.ts        # /test

packages/agent/test/skill/
├── registry.test.ts   # 注册表测试 (19 用例)
├── executor.test.ts   # 执行器测试 (25 用例)
├── builtin.test.ts    # 内置 Skills 测试 (25 用例)
└── index.test.ts      # 模块测试 (8 用例)
```
