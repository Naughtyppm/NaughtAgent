# Interface Spec: Provider System

> LLM 调用的接口规格

## Overview

Provider 是 Agent 的"大脑"，负责调用 LLM API。初期只支持 Anthropic/Claude。

## Types

```typescript
/**
 * 模型配置
 */
interface ModelConfig {
  /** 提供商 ID */
  provider: "anthropic"
  /** 模型 ID */
  model: string  // e.g., "claude-sonnet-4-20250514"
  /** 温度参数 (0-1) */
  temperature?: number
  /** 最大输出 token */
  maxTokens?: number
}

/**
 * 消息角色
 */
type MessageRole = "system" | "user" | "assistant"

/**
 * 消息内容块
 */
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }

/**
 * 消息
 */
interface Message {
  role: MessageRole
  content: string | ContentBlock[]
}

/**
 * 工具定义（给 LLM 的）
 */
interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

/**
 * 流式事件
 */
type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_use_delta"; id: string; input: string }
  | { type: "tool_use_end"; id: string }
  | { type: "message_end"; usage: TokenUsage }
  | { type: "error"; error: Error }

/**
 * Token 使用统计
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/**
 * 调用参数
 */
interface ChatParams {
  model: ModelConfig
  messages: Message[]
  system?: string
  tools?: ToolDefinition[]
  abortSignal?: AbortSignal
}

/**
 * Provider 接口
 */
interface Provider {
  /** 流式调用 */
  stream(params: ChatParams): AsyncGenerator<StreamEvent>
  /** 非流式调用（简化场景） */
  chat(params: ChatParams): Promise<{ content: ContentBlock[]; usage: TokenUsage }>
}
```

## Anthropic Implementation

### 配置

```typescript
interface AnthropicConfig {
  apiKey: string
  baseURL?: string  // 默认 https://api.anthropic.com，支持代理
  defaultModel?: string
}
```

### 初始化

```typescript
const provider = createAnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,  // 可选，用于 Kiro 代理
})
```

## Contracts

### ChatParams

#### 前置条件

1. `messages` 不能为空
2. `model.model` 必须是有效的模型 ID
3. 如果有 `tools`，每个工具必须有 `name` 和 `input_schema`

#### 后置条件

1. `stream()` 必须最终产生 `message_end` 事件
2. `chat()` 返回的 `content` 至少包含一个块

### Provider

#### 不变量

1. 所有 `tool_use_start` 必须有对应的 `tool_use_end`
2. `usage` 中的 token 数必须 >= 0
3. 网络错误时产生 `error` 事件，不抛异常（流式）

## Stream Flow

```
stream() 调用
    │
    ├─→ { type: "text", text: "Let me..." }
    ├─→ { type: "text", text: " help you" }
    ├─→ { type: "tool_use_start", id: "call_1", name: "read" }
    ├─→ { type: "tool_use_delta", id: "call_1", input: '{"file' }
    ├─→ { type: "tool_use_delta", id: "call_1", input: 'Path":"/src"}' }
    ├─→ { type: "tool_use_end", id: "call_1" }
    └─→ { type: "message_end", usage: {...} }
```

## Tool Call Format

### LLM 返回的 tool_use

```json
{
  "type": "tool_use",
  "id": "toolu_01ABC",
  "name": "read",
  "input": {
    "filePath": "/src/index.ts"
  }
}
```

### 返回给 LLM 的 tool_result

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01ABC",
  "content": "<file>\n    1\tconsole.log('hello')\n</file>"
}
```

## Error Handling

| 错误场景 | 处理方式 |
|---------|---------|
| API Key 无效 | 抛出 AuthError |
| 网络超时 | 抛出 NetworkError |
| 速率限制 | 抛出 RateLimitError，包含 retry-after |
| 模型不存在 | 抛出 InvalidModelError |
| 上下文超长 | 抛出 ContextLengthError |

## Supported Models

初期支持：

| 模型 | ID | 用途 |
|------|-----|------|
| Claude Sonnet 4 | claude-sonnet-4-20250514 | 默认，平衡性能和成本 |
| Claude Haiku | claude-haiku-4-20250514 | 快速，用于子任务 |
| Claude Opus 4.5 | claude-opus-4-5-20250219 | 最强，复杂任务 |

## Usage Example

```typescript
const provider = createAnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// 流式调用
for await (const event of provider.stream({
  model: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  system: "You are a coding assistant.",
  messages: [{ role: "user", content: "Read the file src/index.ts" }],
  tools: [ReadTool.definition],
})) {
  if (event.type === "text") {
    process.stdout.write(event.text)
  }
  if (event.type === "tool_use_start") {
    console.log(`\nCalling tool: ${event.name}`)
  }
}
```
