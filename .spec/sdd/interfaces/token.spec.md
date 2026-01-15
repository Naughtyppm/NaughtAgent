# Interface Spec: Token 管理系统

> Token 计数、上下文截断、会话压缩

## 概述

Token 管理系统负责：
1. 估算消息的 Token 数量
2. 在接近限制时截断上下文
3. 压缩长会话历史

## 为什么需要 Token 管理

Claude API 有上下文窗口限制：
- Claude 3.5 Sonnet: 200K tokens
- 实际可用约 180K（留空间给输出）

如果不管理：
- 对话太长会报错
- 浪费 Token 在无关历史上
- 响应变慢

## Types

```typescript
/**
 * Token 计数结果
 */
interface TokenCount {
  /** 总 Token 数 */
  total: number
  /** 系统提示 Token */
  system: number
  /** 消息历史 Token */
  messages: number
  /** 工具定义 Token */
  tools: number
}

/**
 * Token 限制配置
 */
interface TokenLimits {
  /** 最大上下文 Token（默认 180000） */
  maxContext: number
  /** 保留给输出的 Token（默认 8192） */
  reserveOutput: number
  /** 触发压缩的阈值比例（默认 0.8） */
  compressThreshold: number
  /** 压缩后保留的消息数（默认 10） */
  keepRecentMessages: number
}

/**
 * 截断策略
 */
type TruncateStrategy =
  | "drop_old"      // 丢弃旧消息
  | "summarize"     // 摘要旧消息
  | "sliding_window" // 滑动窗口

/**
 * 截断结果
 */
interface TruncateResult {
  /** 截断后的消息 */
  messages: Message[]
  /** 被移除的消息数 */
  removedCount: number
  /** 截断后的 Token 数 */
  tokenCount: number
  /** 是否生成了摘要 */
  summarized: boolean
  /** 摘要内容（如果有） */
  summary?: string
}

/**
 * Token 管理器
 */
interface TokenManager {
  /** 计算 Token 数 */
  count(text: string): number

  /** 计算消息列表的 Token 数 */
  countMessages(messages: Message[]): number

  /** 计算完整上下文的 Token 数 */
  countContext(context: {
    system?: string
    messages: Message[]
    tools?: ToolDefinition[]
  }): TokenCount

  /** 检查是否需要截断 */
  needsTruncation(tokenCount: TokenCount, limits: TokenLimits): boolean

  /** 截断消息 */
  truncate(
    messages: Message[],
    targetTokens: number,
    strategy: TruncateStrategy
  ): TruncateResult

  /** 压缩会话（生成摘要） */
  compress(
    messages: Message[],
    keepRecent: number
  ): Promise<TruncateResult>
}
```

## Token 计数

### 估算方法

由于精确计算需要 tokenizer，我们使用估算：

```typescript
/**
 * 估算 Token 数
 *
 * 规则：
 * - 英文：约 4 字符 = 1 token
 * - 中文：约 1.5 字符 = 1 token
 * - 代码：约 3 字符 = 1 token
 * - JSON：约 3 字符 = 1 token
 */
function estimateTokens(text: string): number
```

### 消息 Token 计算

```typescript
// 每条消息有固定开销
const MESSAGE_OVERHEAD = 4  // role, content 等元数据

function countMessageTokens(message: Message): number {
  let tokens = MESSAGE_OVERHEAD

  if (message.role === "user") {
    tokens += estimateTokens(message.content)
  } else if (message.role === "assistant") {
    tokens += estimateTokens(message.content)
    // 工具调用
    for (const toolCall of message.toolCalls ?? []) {
      tokens += estimateTokens(toolCall.name)
      tokens += estimateTokens(JSON.stringify(toolCall.args))
    }
  } else if (message.role === "tool") {
    tokens += estimateTokens(message.content)
  }

  return tokens
}
```

### 工具定义 Token

```typescript
function countToolTokens(tools: ToolDefinition[]): number {
  let tokens = 0
  for (const tool of tools) {
    tokens += estimateTokens(tool.name)
    tokens += estimateTokens(tool.description)
    tokens += estimateTokens(JSON.stringify(tool.parameters))
  }
  return tokens
}
```

## 截断策略

### 1. drop_old（丢弃旧消息）

最简单，直接删除最旧的消息：

```typescript
function dropOld(messages: Message[], targetTokens: number): Message[] {
  const result: Message[] = []
  let tokens = 0

  // 从最新开始保留
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = countMessageTokens(messages[i])
    if (tokens + msgTokens > targetTokens) break
    result.unshift(messages[i])
    tokens += msgTokens
  }

  return result
}
```

### 2. sliding_window（滑动窗口）

保留最近 N 条消息：

```typescript
function slidingWindow(messages: Message[], keepCount: number): Message[] {
  return messages.slice(-keepCount)
}
```

### 3. summarize（摘要）

用 LLM 生成旧消息的摘要：

```typescript
async function summarize(
  messages: Message[],
  keepRecent: number,
  provider: Provider
): Promise<TruncateResult> {
  const oldMessages = messages.slice(0, -keepRecent)
  const recentMessages = messages.slice(-keepRecent)

  // 生成摘要
  const summary = await provider.chat({
    messages: [
      {
        role: "user",
        content: `请用 200 字以内总结以下对话的关键信息：\n\n${formatMessages(oldMessages)}`
      }
    ]
  })

  // 创建摘要消息
  const summaryMessage: Message = {
    role: "system",
    content: `[对话历史摘要]\n${summary.text}`
  }

  return {
    messages: [summaryMessage, ...recentMessages],
    removedCount: oldMessages.length,
    tokenCount: countMessages([summaryMessage, ...recentMessages]),
    summarized: true,
    summary: summary.text
  }
}
```

## 自动管理

### 在 Agent Loop 中集成

```typescript
async function* agentLoop(config: AgentLoopConfig) {
  const tokenManager = createTokenManager()
  const limits = config.tokenLimits ?? DEFAULT_LIMITS

  while (true) {
    // 计算当前 Token
    const tokenCount = tokenManager.countContext({
      system: config.systemPrompt,
      messages: session.messages,
      tools: config.tools
    })

    // 检查是否需要截断
    if (tokenManager.needsTruncation(tokenCount, limits)) {
      const result = await tokenManager.compress(
        session.messages,
        limits.keepRecentMessages
      )
      session.messages = result.messages

      yield {
        type: "context_compressed",
        removedCount: result.removedCount,
        summary: result.summary
      }
    }

    // 继续正常流程...
  }
}
```

## 默认配置

```typescript
const DEFAULT_TOKEN_LIMITS: TokenLimits = {
  maxContext: 180000,      // Claude 3.5 Sonnet
  reserveOutput: 8192,     // 留给输出
  compressThreshold: 0.8,  // 80% 时触发
  keepRecentMessages: 10,  // 保留最近 10 条
}
```

## 接口

```typescript
/**
 * 创建 Token 管理器
 */
function createTokenManager(limits?: Partial<TokenLimits>): TokenManager

/**
 * 估算文本 Token 数
 */
function estimateTokens(text: string): number

/**
 * 计算消息 Token 数
 */
function countMessageTokens(messages: Message[]): number
```

## 错误处理

| 场景 | 处理 |
|------|------|
| 单条消息超限 | 截断消息内容，添加 "[已截断]" |
| 压缩失败 | 回退到 drop_old 策略 |
| Token 估算偏差 | 预留 10% 缓冲 |

## 与现有系统集成

```
Agent Loop
    │
    ├── 每轮开始前
    │   └── TokenManager.countContext()
    │       └── 检查是否超限
    │
    ├── 超限时
    │   └── TokenManager.truncate() 或 compress()
    │       └── 更新 Session.messages
    │
    └── 继续执行
```
