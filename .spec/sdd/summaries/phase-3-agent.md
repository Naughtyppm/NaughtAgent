# Phase 3: Agent 能力总结

> 日期: 2026-01-15
> 状态: ✅ 完成

## 做了什么

实现了 Agent 系统的核心能力，包括：

### 1. Agent 定义 (`src/agent/agent.ts`)

- **AgentType**: build / plan / explore 三种类型
- **AgentMode**: primary（主 Agent）/ subagent（子 Agent）
- **AgentDefinition**: Agent 配置结构
- **AgentEvent**: 流式事件类型（text / tool_start / tool_end / error / done）
- **BUILTIN_AGENTS**: 内置 Agent 定义

### 2. 系统提示构建 (`src/agent/prompt.ts`)

- **getSystemPrompt()**: 获取 Agent 类型对应的系统提示
- **buildSystemPrompt()**: 构建完整系统提示（含工作目录、可用工具等）
- 每种 Agent 有定制的提示词：
  - **build**: 全功能，可编辑文件、执行命令
  - **plan**: 只读分析，不执行修改
  - **explore**: 快速代码探索

### 3. Agent Loop (`src/agent/loop.ts`)

核心执行循环，实现 LLM → Tool → LLM 的迭代：

```
用户输入
    ↓
添加到 Session
    ↓
┌─────────────────────────────┐
│  调用 LLM                    │
│      ↓                      │
│  有工具调用？                │
│      ├─ 是 → 执行工具        │
│      │       ↓              │
│      │   添加结果到 Session  │
│      │       ↓              │
│      │   继续循环 ──────────→│
│      │                      │
│      └─ 否 → 结束循环        │
└─────────────────────────────┘
    ↓
返回最终响应
```

**功能特性：**
- 流式事件输出（AsyncGenerator）
- 工具执行和错误处理
- Token 使用统计
- 最大步数限制（防止无限循环）
- 中止执行支持

## 能干什么

### 输入
- 用户文本输入
- Agent 类型选择
- 工作目录配置

### 输出
- 流式事件：
  - `text`: LLM 文本响应
  - `tool_start`: 工具开始执行
  - `tool_end`: 工具执行完成
  - `error`: 错误信息
  - `done`: 执行完成 + Token 统计

### 示例用法

```typescript
import {
  createAgentLoop,
  getAgentDefinition,
  createSession,
  Provider
} from '@naughtagent/agent'

// 创建 Provider
const provider = Provider.createAnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// 创建会话
const session = createSession({ cwd: '/my/project' })

// 获取 Agent 定义
const definition = getAgentDefinition('build')

// 创建 Agent Loop
const loop = createAgentLoop({
  definition,
  session,
  provider,
  runConfig: {
    sessionId: session.id,
    cwd: session.cwd,
  },
})

// 运行并处理事件
for await (const event of loop.run('帮我创建一个 hello.ts 文件')) {
  switch (event.type) {
    case 'text':
      console.log('AI:', event.content)
      break
    case 'tool_start':
      console.log(`执行工具: ${event.name}`)
      break
    case 'tool_end':
      console.log(`工具结果: ${event.result.output}`)
      break
    case 'done':
      console.log(`完成! Token: ${event.usage.inputTokens} + ${event.usage.outputTokens}`)
      break
  }
}
```

## 在 Agent 中的作用

```
┌─────────────────────────────────────────────────────────────┐
│                        NaughtAgent                          │
├─────────────────────────────────────────────────────────────┤
│  Phase 4: CLI / Permission / Server  ← 用户入口（待开发）    │
├─────────────────────────────────────────────────────────────┤
│  Phase 3: Agent Loop                 ← 大脑：决策和执行      │ ★ 本阶段
│           ├─ 接收用户输入                                    │
│           ├─ 调用 LLM 生成响应                               │
│           ├─ 执行工具调用                                    │
│           └─ 返回结果                                        │
├─────────────────────────────────────────────────────────────┤
│  Phase 2: Session / Message          ← 记忆：对话历史        │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: Tool / Provider            ← 手和嘴：操作和调用    │
└─────────────────────────────────────────────────────────────┘
```

Agent Loop 是整个系统的"大脑"，它：
1. 接收用户输入
2. 利用 Session 维护对话上下文
3. 调用 Provider 与 LLM 交互
4. 使用 Tool 执行具体操作
5. 协调整个执行流程

## 当前整体能力

**能做：**
- ✅ 读写编辑文件
- ✅ 执行 shell 命令
- ✅ 搜索代码（glob + grep）
- ✅ 调用 Claude API
- ✅ 维护对话上下文
- ✅ 多轮对话
- ✅ Agent 循环执行
- ✅ 多 Agent 类型支持

**不能做：**
- ❌ CLI 命令行交互
- ❌ 权限确认（危险操作前询问用户）
- ❌ HTTP API 服务
- ❌ MCP 协议支持
- ❌ 技能系统（/commit 等）

## 测试覆盖

| 测试文件 | 用例数 | 覆盖内容 |
|---------|--------|---------|
| `test/agent/agent.test.ts` | 12 | Agent 定义、类型、列表 |
| `test/agent/prompt.test.ts` | 9 | 系统提示构建 |
| `test/agent/loop.test.ts` | 8 | Agent Loop 执行 |

**覆盖率：**
- Agent 模块: 91.26% 语句 / 74% 分支 / 94.11% 函数

## 文件清单

```
src/agent/
├── agent.ts      # Agent 定义和类型
├── prompt.ts     # 系统提示构建
├── loop.ts       # Agent Loop 核心循环
└── index.ts      # 模块导出

test/agent/
├── agent.test.ts  # Agent 定义测试
├── prompt.test.ts # 提示构建测试
└── loop.test.ts   # Loop 执行测试
```

## 下一步建议

进入 **Phase 4: 交互能力**：

1. **CLI 命令行** - 让用户可以通过命令行使用 Agent
2. **Permission 权限系统** - 危险操作前询问用户确认
3. **Server HTTP 服务** - 为 VS Code 插件提供 API

推荐开发顺序：
1. CLI 入口（最小可用）
2. Permission 系统
3. HTTP Server
