# Phase 1: 基础设施层对齐 - 设计文档

## 架构设计

### 整体架构

```
基础设施层
├── 消息协议 (session/message.ts)
│   ├── 基础类型 (已有)
│   └── 多模态扩展 (新增)
│
├── 会话管理 (session/)
│   ├── Session 接口 (扩展)
│   ├── SessionManager (增强)
│   └── Storage (兼容)
│
├── 错误处理 (error/) [新建]
│   ├── AgentError 类
│   ├── ErrorCode 枚举
│   └── Retry 机制
│
└── 日志监控 (logging/) [新建]
    ├── Logger 类
    ├── PerformanceMonitor 类
    └── TraceId 管理
```

## 详细设计

### 1. 消息协议扩展

#### 1.1 新增类型定义

```typescript
// packages/agent/src/session/message.ts

/**
 * 图片内容块
 */
export interface ImageBlock {
  type: "image"
  source: {
    type: "base64" | "url"
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
    data: string  // base64 数据或 URL
  }
}

/**
 * 音频内容块
 */
export interface AudioBlock {
  type: "audio"
  source: {
    type: "base64"
    media_type: "audio/wav" | "audio/mp3"
    data: string  // base64 数据
  }
}

/**
 * 更新 ContentBlock 联合类型
 */
export type ContentBlock = 
  | TextBlock 
  | ToolUseBlock 
  | ToolResultBlock
  | ImageBlock      // 新增
  | AudioBlock      // 新增

/**
 * 停止原因
 */
export type StopReason = "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"

/**
 * 扩展 Message 接口
 */
export interface Message {
  id: string
  role: MessageRole
  content: ContentBlock[]
  timestamp: number
  stop_reason?: StopReason  // 新增：仅 assistant 消息有
}

/**
 * 扩展 ToolResultBlock
 */
export interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: string | ContentBlock[]  // 支持多模态结果
  is_error?: boolean
}
```

#### 1.2 工具函数

```typescript
/**
 * 创建图片消息
 */
export function createImageMessage(
  imageData: string,
  mediaType: ImageBlock["source"]["media_type"],
  sourceType: "base64" | "url" = "base64"
): Message {
  return {
    id: generateMessageId(),
    role: "user",
    content: [{
      type: "image",
      source: { type: sourceType, media_type: mediaType, data: imageData }
    }],
    timestamp: Date.now()
  }
}

/**
 * 创建音频消息
 */
export function createAudioMessage(
  audioData: string,
  mediaType: AudioBlock["source"]["media_type"]
): Message {
  return {
    id: generateMessageId(),
    role: "user",
    content: [{
      type: "audio",
      source: { type: "base64", media_type: mediaType, data: audioData }
    }],
    timestamp: Date.now()
  }
}

/**
 * 从消息中提取图片
 */
export function getImages(message: Message): ImageBlock[] {
  return message.content.filter(
    (block): block is ImageBlock => block.type === "image"
  )
}

/**
 * 从消息中提取音频
 */
export function getAudios(message: Message): AudioBlock[] {
  return message.content.filter(
    (block): block is AudioBlock => block.type === "audio"
  )
}
```

### 2. 会话管理增强

#### 2.1 扩展 Session 接口

```typescript
// packages/agent/src/session/session.ts

export interface Session {
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
  parent_session_id?: string   // 父会话 ID（分支时）
  branch_point?: number        // 分支点（消息索引）
}
```

#### 2.2 SessionManager 新方法

```typescript
// packages/agent/src/session/manager.ts

export class SessionManager {
  /**
   * 从指定点创建会话分支（同步方法）
   * 
   * 注意：SessionManager 是内存管理器，所有操作都是同步的
   * 持久化由独立的 Storage 层处理（异步）
   */
  branch(
    sessionId: SessionID,
    fromIndex: number,
    options?: { tags?: string[] }
  ): Session {
    const parent = this.getOrThrow(sessionId)
    
    // 验证索引
    if (fromIndex < 0 || fromIndex >= parent.messages.length) {
      throw new Error(`Invalid branch point: ${fromIndex}`)
    }
    
    // 创建分支会话
    const branched: Session = {
      ...createSession({
        cwd: parent.cwd,
        agentType: parent.agentType
      }),
      messages: parent.messages.slice(0, fromIndex + 1),
      tags: options?.tags || [...(parent.tags || []), 'branch'],
      parent_session_id: sessionId,
      branch_point: fromIndex
    }
    
    // 注册到内存
    this.sessions.set(branched.id, branched)
    return branched
  }
  
  /**
   * 按标签搜索会话（同步方法）
   */
  findByTags(tags: string[]): Session[] {
    const all = this.list()
    return all.filter(session => 
      tags.every(tag => session.tags?.includes(tag))
    )
  }
  
  /**
   * 更新会话成本（同步方法）
   */
  updateCost(session: Session, costUsd: number): void {
    session.total_cost_usd = (session.total_cost_usd || 0) + costUsd
    session.updatedAt = Date.now()
  }
}
```

### 3. 错误处理系统

#### 3.1 目录结构

```
packages/agent/src/error/
├── index.ts          # 导出
├── types.ts          # 错误类型定义
└── retry.ts          # 重试机制
```

#### 3.2 错误类型

```typescript
// packages/agent/src/error/types.ts

/**
 * 错误码
 */
export enum ErrorCode {
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

/**
 * Agent 错误类
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public recoverable: boolean,
    public context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AgentError'
  }
  
  /**
   * 获取恢复建议
   */
  getRecoverySuggestion(): string {
    switch (this.code) {
      case ErrorCode.RATE_LIMIT:
        return '请稍后重试，或升级到更高的 API 配额'
      case ErrorCode.PERMISSION_DENIED:
        return '请检查权限设置，或手动批准该操作'
      case ErrorCode.TOOL_EXECUTION_ERROR:
        return '工具执行失败，请检查输入参数或工具配置'
      default:
        return '请查看错误日志获取更多信息'
    }
  }
}
```

#### 3.3 重试机制

```typescript
// packages/agent/src/error/retry.ts

/**
 * 重试策略
 */
export interface RetryPolicy {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  retryableErrors: ErrorCode[]
}

/**
 * 默认重试策略
 */
export const defaultRetryPolicy: RetryPolicy = {
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

/**
 * 睡眠函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带重试的执行
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = defaultRetryPolicy
): Promise<T> {
  let lastError: Error
  let delay = policy.initialDelay
  
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      // 检查是否可重试
      if (error instanceof AgentError) {
        if (!policy.retryableErrors.includes(error.code)) {
          throw error
        }
      }
      
      // 最后一次尝试
      if (attempt === policy.maxAttempts) {
        throw error
      }
      
      // 等待后重试
      await sleep(delay)
      delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelay)
    }
  }
  
  throw lastError!
}
```

### 4. 日志与监控系统

#### 4.1 目录结构

```
packages/agent/src/logging/
├── index.ts          # 导出
├── logger.ts         # 日志器
├── monitor.ts        # 性能监控
└── trace.ts          # TraceId 管理
```

#### 4.2 日志器

```typescript
// packages/agent/src/logging/logger.ts

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: Date
  level: LogLevel
  category: string
  message: string
  metadata?: Record<string, unknown>
  trace_id?: string
}

/**
 * 日志器
 */
export class Logger {
  constructor(
    private category: string,
    private minLevel: LogLevel = LogLevel.INFO
  ) {}
  
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata)
  }
  
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata)
  }
  
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata)
  }
  
  error(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, metadata)
  }
  
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) return
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category: this.category,
      message,
      metadata,
      trace_id: getCurrentTraceId()
    }
    
    // 输出日志（可配置输出目标）
    console.log(JSON.stringify(entry))
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    return levels.indexOf(level) >= levels.indexOf(this.minLevel)
  }
}
```

#### 4.3 性能监控

```typescript
// packages/agent/src/logging/monitor.ts

/**
 * 性能指标
 */
interface Metric {
  count: number
  total_duration: number
  success_count: number
  error_count: number
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private metrics = new Map<string, Metric>()
  
  /**
   * 测量操作性能
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now()
    
    try {
      const result = await fn()
      const duration = Date.now() - start
      
      this.record(operation, { duration, success: true })
      return result
    } catch (error) {
      const duration = Date.now() - start
      this.record(operation, { duration, success: false })
      throw error
    }
  }
  
  /**
   * 获取统计数据
   */
  getStats(operation: string) {
    const metric = this.metrics.get(operation)
    if (!metric) return null
    
    return {
      operation,
      count: metric.count,
      avg_duration: metric.total_duration / metric.count,
      success_rate: metric.success_count / metric.count,
      error_rate: metric.error_count / metric.count
    }
  }
  
  private record(operation: string, data: { duration: number; success: boolean }): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        total_duration: 0,
        success_count: 0,
        error_count: 0
      })
    }
    
    const metric = this.metrics.get(operation)!
    metric.count++
    metric.total_duration += data.duration
    
    if (data.success) {
      metric.success_count++
    } else {
      metric.error_count++
    }
  }
}

/**
 * TraceId 管理（基于 AsyncLocalStorage）
 */
// packages/agent/src/logging/trace.ts
import { AsyncLocalStorage } from 'async_hooks'

const traceStorage = new AsyncLocalStorage<string>()

/**
 * 生成 TraceId
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 获取当前 TraceId
 */
export function getCurrentTraceId(): string | undefined {
  return traceStorage.getStore()
}

/**
 * 设置 TraceId
 */
export function setTraceId(traceId: string): void {
  traceStorage.enterWith(traceId)
}

/**
 * 在指定 TraceId 上下文中执行函数
 */
export async function withTraceId<T>(
  traceId: string,
  fn: () => Promise<T>
): Promise<T> {
  return traceStorage.run(traceId, fn)
}
```

## 数据模型

### 会话存储格式

```json
{
  "id": "session_xxx",
  "status": "idle",
  "cwd": "/path/to/project",
  "messages": [...],
  "agentType": "build",
  "createdAt": 1234567890,
  "updatedAt": 1234567890,
  "usage": {
    "inputTokens": 1000,
    "outputTokens": 500
  },
  "tags": ["refactor", "auth"],
  "total_cost_usd": 0.05,
  "num_turns": 10,
  "parent_session_id": "session_yyy",
  "branch_point": 5
}
```

## 接口设计

### 公开 API

```typescript
// 消息协议
export { createImageMessage, createAudioMessage, getImages, getAudios }

// 会话管理
export { SessionManager }
sessionManager.branch(sessionId, fromIndex, options)
sessionManager.findByTags(tags)
sessionManager.updateCost(session, costUsd)

// 错误处理
export { AgentError, ErrorCode, withRetry, defaultRetryPolicy }

// 日志监控
export { Logger, LogLevel, PerformanceMonitor }
```

## 迁移策略

### 1. 会话数据迁移

```typescript
/**
 * 自动迁移旧格式会话
 */
function migrateSession(oldSession: any): Session {
  return {
    ...oldSession,
    tags: oldSession.tags || [],
    total_cost_usd: oldSession.total_cost_usd || 0,
    num_turns: oldSession.num_turns || oldSession.messages.length / 2
  }
}
```

### 2. API 兼容性

- 所有现有 API 保持不变
- 新字段都是可选的
- 提供工具函数简化迁移

## 测试策略

### 单元测试

- 每个新类型都有创建和解析测试
- 每个新方法都有正常和异常测试
- 边界条件测试

### 集成测试

- 会话分支的端到端测试
- 错误重试的集成测试
- 日志和监控的集成测试

### 性能测试

- 消息序列化性能基准
- 会话分支性能测试
- 日志写入性能测试

## 实施顺序

1. **消息协议扩展** - 基础类型，影响最小
2. **会话管理增强** - 依赖消息协议
3. **错误处理统一** - 独立模块
4. **日志与监控** - 独立模块
5. **集成测试** - 验证所有模块协作

## 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 破坏现有消息格式 | 高 | 向后兼容设计，完整测试 |
| 会话存储格式变更 | 中 | 自动迁移脚本 |
| 性能回归 | 中 | 性能基准测试 |
| 日志影响性能 | 低 | 异步写入，可配置级别 |
