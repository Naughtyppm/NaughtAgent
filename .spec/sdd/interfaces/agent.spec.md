# Interface Spec: Agent System

> Agent 定义和管理的接口规格

## Types

```typescript
/**
 * Agent 模式
 */
type AgentMode = "primary" | "subagent"

/**
 * Agent 类型标识
 */
type AgentType = "build" | "plan" | "explore" | "general"

/**
 * Agent 定义
 */
interface AgentDefinition {
  /** Agent 类型标识 */
  type: AgentType
  /** Agent 模式 */
  mode: AgentMode
  /** 显示名称 */
  name: string
  /** Agent 描述 */
  description: string
  /** 系统提示词 */
  systemPrompt: string
  /** 可用工具列表 */
  tools: string[]
  /** 权限配置 */
  permissions: PermissionSet
  /** 模型配置（可选，覆盖默认） */
  model?: ModelConfig
}

/**
 * Agent 实例
 */
interface Agent {
  /** Agent 定义 */
  definition: AgentDefinition
  /** 所属会话 */
  session: Session
  /** 执行单次对话轮次 */
  run(input: string): AsyncGenerator<AgentEvent>
  /** 中止执行 */
  abort(): void
}

/**
 * Agent 事件（流式输出）
 */
type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; result: ToolResult }
  | { type: "error"; error: Error }
  | { type: "done"; usage: TokenUsage }

/**
 * Token 使用统计
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * 模型配置
 */
interface ModelConfig {
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
}
```

## Agent Types

### build (Primary)

- **用途**: 默认全功能 Agent，可编辑文件、执行命令
- **工具**: 全部工具
- **权限**: 文件编辑需确认，危险命令需确认

### plan (Primary)

- **用途**: 只读分析和规划，不执行修改
- **工具**: read, glob, grep, question, todo
- **权限**: 拒绝所有写操作

### explore (Subagent)

- **用途**: 快速代码探索和搜索
- **工具**: read, glob, grep
- **权限**: 只读

### general (Subagent)

- **用途**: 通用多步骤子任务
- **工具**: 继承父 Agent
- **权限**: 继承父 Agent

## Contracts

### AgentDefinition

#### 前置条件

1. `type` 必须是有效的 AgentType
2. `tools` 中的工具必须已注册
3. `systemPrompt` 必须非空

#### 后置条件

1. 创建的 Agent 必须遵循 `permissions` 约束
2. Agent 只能调用 `tools` 列表中的工具

#### 不变量

1. Primary Agent 可以启动 Subagent
2. Subagent 不能启动其他 Agent
3. Agent 的权限不能超过其定义

### Agent

#### 前置条件

1. `run`: 必须有有效的 Session
2. `run`: input 必须是非空字符串

#### 后置条件

1. `run` 必须最终产生 `done` 事件
2. `abort` 后必须尽快停止并产生 `done` 事件

#### 不变量

1. Agent 执行期间 Session 状态一致
2. 所有 `tool_call` 必须有对应的 `tool_result`

## State Machine

```
[Created] --> [Running] --> [Done]
                 |
                 v
            [Aborted]
```

- **Created**: Agent 已创建，未开始执行
- **Running**: 正在执行，产生事件流
- **Done**: 正常完成
- **Aborted**: 被中止

## Error Handling

| 错误场景 | 处理方式 |
|---------|---------|
| 工具调用失败 | 产生 error 事件，继续执行 |
| 权限拒绝 | 产生 error 事件，继续执行 |
| LLM 调用失败 | 产生 error 事件，终止执行 |
| 超时 | 自动 abort |
