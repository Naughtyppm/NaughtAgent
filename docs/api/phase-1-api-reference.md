# Phase 1 API 参考文档

本文档提供 Phase 1 新增 API 的快速参考。

## 消息协议 API

### 类型定义

```typescript
// 图片内容块
interface ImageBlock {
  type: "image"
  source: {
    type: "base64" | "url"
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
    data: string
  }
}

// 音频内容块
interface AudioBlock {
  type: "audio"
  source: {
    type: "base64"
    media_type: "audio/wav" | "audio/mp3"
    data: string
  }
}

// 停止原因
type StopReason = "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"

// 扩展的消息接口
interface Message {
  id: string
  role: MessageRole
  content: ContentBlock[]
  timestamp: number
  stop_reason?: StopReason  // 新增
}
```

### 工具函数

```typescript
// 创建图片消息
function createImageMessage(
  imageData: string,
  mediaType: ImageBlock["source"]["media_type"],
  sourceType: "base64" | "url" = "base64"
): Message

// 创建音频消息
function createAudioMessage(
  audioData: string,
  mediaType: AudioBlock["source"]["media_type"]
): Message

// 提取图片
function getImages(message: Message): ImageBlock[]

// 提取音频
function getAudios(message: Message): AudioBlock[]
```

## 会话管理 API

### Session 接口扩展

```typescript
interface Session {
  id: SessionID
  status: SessionStatus
  cwd: string
  messages: Message[]
  agentType: AgentType
  createdAt: number
  updatedAt: number
  usage: TokenUsage
  
  // 新增字段
  tags?: string[]              // 会话标签
  total_cost_usd?: number      // 总成本（美元）
  num_turns?: number           // 对话轮次
  parent_session_id?: string   // 父会话 ID
  branch_point?: number        // 分支点（消息索引）
}
```

### SessionManager 新方法

```typescript
class SessionManager {
  // 会话分支
  branch(
    sessionId: SessionID,
    fromIndex: number,
    options?: { tags?: string[] }
  ): Session
  
  // 标签管理
  addTags(sessionId: SessionID, ...tags: string[]): void
  removeTags(sessionId: SessionID, ...tags: string[]): void
  getAllTags(): string[]
  findByTags(tags: string[]): Session[]
  
  // 成本追踪
  updateCost(sessionId: SessionID, costUsd: number): void
  getCostStats(sessionId: SessionID): CostStats
  getTotalCostStats(): TotalCostStats
  generateCostReport(options?: ReportOptions): string
}
```

### 类型定义

```typescript
// 成本统计
interface CostStats {
  session_id: string
  total_cost_usd: number
  num_turns: number
  cost_per_turn: number
  total_input_tokens: number
  total_output_tokens: number
}

// 总体成本统计
interface TotalCostStats {
  total_sessions: number
  total_cost_usd: number
  total_turns: number
  avg_cost_per_session: number
  avg_cost_per_turn: number
  total_input_tokens: number
  total_output_tokens: number
}

// 报告选项
interface ReportOptions {
  sessionIds?: string[]
  tags?: string[]
  format?: 'text' | 'json'
}
```

## 错误处理 API

### AgentError 类

```typescript
class AgentError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public recoverable: boolean,
    public context?: Record<string, unknown>
  )
  
  // 获取恢复建议
  getRecoverySuggestion(): string
  
  // 序列化为 JSON
  toJSON(): Record<string, unknown>
}
```

### ErrorCode 枚举

```typescript
enum ErrorCode {
  // 网络错误（可恢复）
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  
  // API 错误（部分可恢复）
  API_ERROR = 'API_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  
  // 工具错误（可恢复）
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // 系统错误（不可恢复）
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR'
}
```

### 重试机制

```typescript
// 重试策略
interface RetryPolicy {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  retryableErrors: ErrorCode[]
}

// 默认重试策略
const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.TIMEOUT,
    ErrorCode.RATE_LIMIT
  ]
}

// 带重试的执行
async function withRetry<T>(
  fn: () => Promise<T>,
  policy?: RetryPolicy
): Promise<T>
```

## 日志与监控 API

### Logger 类

```typescript
// 日志级别
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// 日志配置
interface LoggerConfig {
  minLevel?: LogLevel
  format?: 'json' | 'text'
  output?: (entry: LogEntry) => void
}

// 日志条目
interface LogEntry {
  timestamp: Date
  level: LogLevel
  category: string
  message: string
  metadata?: Record<string, unknown>
  trace_id?: string
}

// Logger 类
class Logger {
  constructor(category: string, config?: LoggerConfig)
  
  debug(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(message: string, metadata?: Record<string, unknown>): void
}

// 工厂函数
function createLogger(category: string, config?: LoggerConfig): Logger
```

### PerformanceMonitor 类

```typescript
// 性能统计
interface PerformanceStats {
  operation: string
  count: number
  avg_duration: number
  success_rate: number
  error_rate: number
}

// PerformanceMonitor 类
class PerformanceMonitor {
  // 测量异步操作
  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T>
  
  // 测量同步操作
  measureSync<T>(operation: string, fn: () => T): T
  
  // 获取统计数据
  getStats(operation: string): PerformanceStats | null
  getAllStats(): PerformanceStats[]
  
  // 重置统计
  reset(operation?: string): void
}

// 全局实例
const monitor: PerformanceMonitor
```

### TraceId 管理

```typescript
// 生成 TraceId
function generateTraceId(): string

// 获取当前 TraceId
function getCurrentTraceId(): string | undefined

// 设置 TraceId
function setTraceId(traceId: string): void

// 在指定 TraceId 上下文中执行
async function withTraceId<T>(
  traceId: string,
  fn: () => Promise<T>
): Promise<T>
```

## 使用示例

### 完整示例：Agent 执行

```typescript
import { SessionManager } from './session/index.js'
import { Logger, PerformanceMonitor, withTraceId, generateTraceId } from './logging/index.js'
import { withRetry, AgentError, ErrorCode } from './error/index.js'

const manager = new SessionManager()
const logger = new Logger('agent')
const monitor = new PerformanceMonitor()

async function runAgent(input: string) {
  // 创建会话
  const session = manager.create({
    id: generateSessionId(),
    tags: ['production', 'user-request']
  })
  
  // 在 TraceId 上下文中执行
  await withTraceId(generateTraceId(), async () => {
    logger.info('Agent 开始执行', {
      sessionId: session.id,
      inputLength: input.length
    })
    
    try {
      // 添加用户消息
      manager.addUserMessage(session.id, input)
      
      // 调用 LLM（带重试和性能监控）
      const response = await monitor.measure('llm_call', async () => {
        return await withRetry(async () => {
          return await provider.chat(session.messages)
        })
      })
      
      // 添加助手消息
      manager.addAssistantMessage(session.id, response.content)
      
      // 更新成本
      const cost = calculateCost(response.usage)
      manager.updateCost(session.id, cost)
      
      logger.info('Agent 执行完成', {
        sessionId: session.id,
        cost: cost,
        outputLength: response.content.length
      })
      
      // 输出性能统计
      const stats = monitor.getStats('llm_call')
      if (stats) {
        logger.info('LLM 性能统计', {
          avgDuration: stats.avg_duration,
          successRate: stats.success_rate
        })
      }
      
      return response
      
    } catch (error) {
      if (error instanceof AgentError) {
        logger.error('Agent 执行失败', {
          code: error.code,
          recoverable: error.recoverable,
          suggestion: error.getRecoverySuggestion()
        })
      }
      throw error
    }
  })
}
```

## 导入路径

```typescript
// 消息协议
import {
  createImageMessage,
  createAudioMessage,
  getImages,
  getAudios
} from './session/index.js'

// 会话管理
import { SessionManager } from './session/index.js'

// 错误处理
import {
  AgentError,
  ErrorCode,
  withRetry,
  defaultRetryPolicy
} from './error/index.js'

// 日志监控
import {
  Logger,
  LogLevel,
  createLogger,
  PerformanceMonitor,
  monitor,
  generateTraceId,
  getCurrentTraceId,
  setTraceId,
  withTraceId
} from './logging/index.js'
```

## 相关文档

- [迁移指南](../core/migration-guide.md)
- [消息协议](../core/message-protocol.md)
- [会话管理器](../core/session-manager.md)
- [错误处理系统](../core/error-handling.md)
- [日志与监控系统](../core/logging-monitoring.md)

---

**最后更新**：2026-01-17  
**版本**：Phase 1
