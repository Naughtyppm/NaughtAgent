# 扩展与生态层

扩展与生态层提供 MCP 集成、子代理系统、技能系统等扩展能力。

## 1. MCP（Model Context Protocol）

### MCP 客户端架构

```
┌─────────────────────────────────────┐
│           McpManager                │
│  ├── clients: Map<name, McpClient>  │
│  ├── loadedTools: Map<name, Tool[]> │
│  └── eventHandlers: Handler[]       │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│           McpClient                 │
│  ├── transport: stdio | sse | ws    │
│  ├── state: connecting | connected  │
│  └── methods:                       │
│      - listTools()                  │
│      - callTool(name, args)         │
│      - listResources()              │
│      - readResource(uri)            │
│      - listPrompts()                │
│      - getPrompt(name, args)        │
└─────────────────────────────────────┘
```

### MCP 配置

```json
// .naught/mcp.json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "env": {}
    }
  ]
}
```

### 已实现能力

| 能力 | 状态 | 说明 |
|------|------|------|
| 工具发现 | ✅ | 自动加载 MCP 服务器的工具 |
| 工具调用 | ✅ | 调用 MCP 工具 |
| 资源访问 | ✅ | 读取 MCP 资源 |
| 提示模板 | ✅ | 使用 MCP 提示 |
| 连接池 | ✅ | 复用连接 |
| 重试机制 | ✅ | 自动重连 |

## 2. 子代理系统

### 子代理模式

| 模式 | 工具 | 特点 |
|------|------|------|
| 无窗口调用 | `ask_llm` | 单次 LLM 调用，无独立上下文 |
| 独立子代理 | `run_agent` | 独立上下文窗口，可调用工具 |
| 分叉代理 | `fork_agent` | 继承当前上下文，独立执行 |
| 并行执行 | `parallel_agents` | 多个子任务并行 |
| 多代理协作 | `multi_agent` | 多 Agent 协作完成复杂任务 |
| 工作流 | `run_workflow` | 预定义多阶段流程 |

### 并发控制

```typescript
// subtask/concurrency.ts
interface ConcurrencyConfig {
  maxConcurrent: number      // 最大并发数
  timeout: number            // 单任务超时
  retries: number            // 重试次数
}

interface ConcurrencyController {
  submit(task: Task): Promise<TaskResult>
  waitAll(): Promise<ConcurrencyResult>
  cancel(): void
}
```

### 子代理事件

```typescript
// subtask/events.ts
type SubAgentEvent =
  | { type: "start"; prompt: string; agentType: string }
  | { type: "config"; maxTurns: number }
  | { type: "turn"; turn: number; content: string }
  | { type: "tool"; name: string; input: unknown; output: unknown }
  | { type: "end"; success: boolean; output: string; duration: number }
```

## 3. 技能系统

### 技能定义

```typescript
// skill/types.ts
interface SkillDefinition {
  name: string               // 技能名称（不含 /）
  description: string
  aliases?: string[]         // 别名
  parameters?: SkillParameter[]
  workflow: WorkflowDefinition
}

interface SkillParameter {
  name: string
  description: string
  required?: boolean
  default?: string
}
```

### 技能执行

```typescript
// skill/executor.ts
interface SkillResult {
  success: boolean
  output: string
  error?: string
  steps?: SubTaskStep[]
  usage?: TokenUsage
  duration?: number
}
```

### 内置技能（待扩展）

| 技能 | 说明 |
|------|------|
| `/commit` | 生成 commit message 并提交 |
| `/review` | 代码审查 |
| `/test` | 生成测试用例 |
| `/doc` | 生成文档 |

## 4. Hooks 系统（待实现）

### 设计方案

```typescript
interface Hook {
  name: string
  when: HookTrigger
  then: HookAction
}

type HookTrigger =
  | { type: "fileEdited"; patterns: string[] }
  | { type: "fileCreated"; patterns: string[] }
  | { type: "preToolUse"; toolTypes: string[] }
  | { type: "postToolUse"; toolTypes: string[] }
  | { type: "promptSubmit" }
  | { type: "agentStop" }

type HookAction =
  | { type: "askAgent"; prompt: string }
  | { type: "runCommand"; command: string }
```

## 5. 关键文件索引

| 文件 | 职责 |
|------|------|
| `mcp/manager.ts` | MCP 管理器 |
| `mcp/client.ts` | MCP 客户端 |
| `mcp/tools.ts` | MCP 工具加载 |
| `subtask/` | 子代理系统（25+ 文件） |
| `tool/subagent/` | 子代理工具定义 |
| `skill/types.ts` | 技能类型 |
| `skill/executor.ts` | 技能执行器 |
| `skill/registry.ts` | 技能注册表 |
