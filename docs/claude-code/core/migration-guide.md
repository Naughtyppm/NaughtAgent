# Phase 1 迁移指南

本文档提供 Phase 1 基础设施层升级的迁移指南，帮助开发者平滑升级到新版本。

## 概述

Phase 1 引入了以下新功能：
1. 多模态消息支持（图片、音频）
2. 会话分支、标签和成本追踪
3. 统一的错误处理和重试机制
4. 结构化日志和性能监控

**重要**：所有新功能都是向后兼容的，现有代码无需修改即可继续使用。

## 兼容性

### 向后兼容
- ✅ 所有现有 API 保持不变
- ✅ 所有新字段都是可选的
- ✅ 现有测试全部通过
- ✅ 性能不低于重构前

### 破坏性变更
- ❌ 无破坏性变更

## 迁移步骤

### 1. 消息协议扩展

#### 现有代码
现有的消息创建和处理代码无需修改：
```typescript
// 现有代码继续工作
const message: Message = {
  id: generateMessageId(),
  role: 'user',
  content: [{ type: 'text', text: 'Hello' }],
  timestamp: Date.now()
}
```

#### 新功能（可选）
如果需要使用多模态功能：
```typescript
import { createImageMessage, createAudioMessage, getImages } from './session/index.js'

// 创建图片消息
const imageMsg = createImageMessage(
  base64Data,
  'image/jpeg',
  'base64'  // 或 'url'
)

// 创建音频消息
const audioMsg = createAudioMessage(
  base64Data,
  'audio/wav'
)

// 提取图片
const images = getImages(message)
```

#### 支持的格式
- **图片**：JPEG、PNG、GIF、WebP
- **音频**：WAV、MP3
- **来源**：base64 编码或 URL

### 2. 会话管理增强

#### 现有代码
现有的会话管理代码无需修改：
```typescript
// 现有代码继续工作
const manager = new SessionManager()
const session = manager.create({ id: 'my-session' })
manager.addUserMessage('my-session', 'Hello')
```

#### 新功能：会话分支
```typescript
// 从第 5 条消息创建分支
const branch = manager.branch('parent-session', 4, {
  tags: ['experiment', 'refactor']
})

// 分支会话有独立的 ID
console.log(branch.id)  // 'session_xxx'

// 分支会话继承父会话的消息历史（到分支点）
console.log(branch.messages.length)  // 5

// 分支会话有独立的消息数组
manager.addUserMessage(branch.id, 'New message')
// 不影响父会话
```

#### 新功能：标签管理
```typescript
// 添加标签
manager.addTags('session-1', 'refactor', 'auth', 'backend')

// 删除标签
manager.removeTags('session-1', 'backend')

// 搜索会话（AND 逻辑）
const sessions = manager.findByTags(['refactor', 'auth'])

// 获取所有标签（用于自动补全）
const allTags = manager.getAllTags()  // ['auth', 'backend', 'refactor']
```

#### 新功能：成本追踪
```typescript
// 更新成本
manager.updateCost('session-1', 0.05)

// 获取单会话统计
const stats = manager.getCostStats('session-1')
console.log(`总成本: $${stats.total_cost_usd}`)
console.log(`轮次: ${stats.num_turns}`)
console.log(`每轮成本: $${stats.cost_per_turn}`)

// 获取总体统计
const totalStats = manager.getTotalCostStats()
console.log(`总会话数: ${totalStats.total_sessions}`)
console.log(`总成本: $${totalStats.total_cost_usd}`)

// 生成文本报告
const report = manager.generateCostReport()
console.log(report)

// 生成 JSON 报告
const jsonReport = manager.generateCostReport({ format: 'json' })

// 按标签筛选
const refactorReport = manager.generateCostReport({
  tags: ['refactor']
})
```

### 3. 错误处理统一

#### 现有代码
现有的错误处理代码可以继续使用：
```typescript
// 现有代码继续工作
try {
  await apiCall()
} catch (error) {
  console.error(error)
}
```

#### 推荐迁移
建议逐步迁移到新的错误处理方式：

**步骤 1：使用 AgentError**
```typescript
import { AgentError, ErrorCode } from './error/index.js'

// 抛出结构化错误
throw new AgentError(
  'Network request failed',
  ErrorCode.NETWORK_ERROR,
  true,  // 可恢复
  { url: 'https://api.example.com', statusCode: 500 }
)

// 捕获和处理
try {
  await apiCall()
} catch (error) {
  if (error instanceof AgentError) {
    console.error(`Error: ${error.message}`)
    console.error(`Code: ${error.code}`)
    console.error(`Recoverable: ${error.recoverable}`)
    console.error(`Suggestion: ${error.getRecoverySuggestion()}`)
    
    // 记录上下文信息
    if (error.context) {
      console.error('Context:', error.context)
    }
  }
}
```

**步骤 2：使用自动重试**
```typescript
import { withRetry, defaultRetryPolicy } from './error/index.js'

// 使用默认重试策略
const result = await withRetry(async () => {
  return await apiCall()
})

// 使用自定义重试策略
const result = await withRetry(
  async () => await apiCall(),
  {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.RATE_LIMIT
    ]
  }
)
```

#### 错误码参考
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

### 4. 日志与监控

#### 添加日志记录
```typescript
import { Logger, LogLevel } from './logging/index.js'

// 创建日志器
const logger = new Logger('my-module', {
  minLevel: LogLevel.INFO,  // 只输出 INFO 及以上级别
  format: 'json'            // JSON 格式输出
})

// 记录日志
logger.debug('Debug message', { detail: 'value' })
logger.info('User logged in', { userId: '123' })
logger.warn('Rate limit approaching', { remaining: 10 })
logger.error('Operation failed', { error: 'Connection timeout' })
```

#### 添加性能监控
```typescript
import { PerformanceMonitor } from './logging/index.js'

const monitor = new PerformanceMonitor()

// 测量异步操作
const result = await monitor.measure('db_query', async () => {
  return await db.query('SELECT * FROM users')
})

// 测量同步操作
const result = monitor.measureSync('calculation', () => {
  return complexCalculation()
})

// 获取统计数据
const stats = monitor.getStats('db_query')
if (stats) {
  console.log(`操作: ${stats.operation}`)
  console.log(`执行次数: ${stats.count}`)
  console.log(`平均耗时: ${stats.avg_duration}ms`)
  console.log(`成功率: ${(stats.success_rate * 100).toFixed(1)}%`)
  console.log(`错误率: ${(stats.error_rate * 100).toFixed(1)}%`)
}

// 获取所有统计
const allStats = monitor.getAllStats()

// 重置统计
monitor.reset('db_query')  // 重置单个操作
monitor.reset()            // 重置所有操作
```

#### 添加 TraceId 追踪
```typescript
import { withTraceId, generateTraceId, getCurrentTraceId } from './logging/index.js'

// 在 TraceId 上下文中执行
await withTraceId(generateTraceId(), async () => {
  logger.info('Request started')  // 自动包含 TraceId
  
  await step1()  // 所有日志都包含相同的 TraceId
  await step2()
  
  logger.info('Request completed')
})

// 手动设置 TraceId
import { setTraceId } from './logging/index.js'

setTraceId('trace_custom_id')
logger.info('Message')  // 包含 trace_custom_id

// 获取当前 TraceId
const traceId = getCurrentTraceId()
if (traceId) {
  console.log(`Current trace: ${traceId}`)
}
```

#### 日志级别配置
```typescript
// 开发环境：DEBUG 级别
const devLogger = new Logger('app', {
  minLevel: LogLevel.DEBUG,
  format: 'text'
})

// 生产环境：INFO 级别
const prodLogger = new Logger('app', {
  minLevel: LogLevel.INFO,
  format: 'json'
})

// 测试环境：自定义输出
const testLogger = new Logger('app', {
  minLevel: LogLevel.WARN,
  output: (entry) => {
    // 自定义输出逻辑
    testLogs.push(entry)
  }
})
```

## 最佳实践

### 1. 会话分支
```typescript
// ✅ 好的做法：在尝试不同方案时使用分支
const branch1 = manager.branch('main', 10, { tags: ['approach-1'] })
const branch2 = manager.branch('main', 10, { tags: ['approach-2'] })

// ❌ 避免：过度使用分支导致内存占用过高
// 建议：定期清理不需要的分支会话
```

### 2. 标签管理
```typescript
// ✅ 好的做法：使用有意义的标签
manager.addTags('session-1', 'refactor', 'auth', 'backend')

// ✅ 好的做法：使用标签组织会话
const authSessions = manager.findByTags(['auth'])
const refactorSessions = manager.findByTags(['refactor'])

// ❌ 避免：使用过于宽泛的标签
manager.addTags('session-1', 'work', 'code')  // 太宽泛
```

### 3. 成本追踪
```typescript
// ✅ 好的做法：在 Agent 循环中自动更新成本
async function runAgent(session: Session) {
  const result = await agent.run(session)
  
  // 计算成本（基于 Token 使用）
  const cost = calculateCost(result.usage)
  manager.updateCost(session.id, cost)
  
  return result
}

// ✅ 好的做法：定期生成成本报告
const report = manager.generateCostReport({
  tags: ['production'],
  format: 'json'
})
saveReport(report)
```

### 4. 错误处理
```typescript
// ✅ 好的做法：只重试可恢复的错误
const result = await withRetry(
  async () => await apiCall(),
  {
    retryableErrors: [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.RATE_LIMIT
    ]
  }
)

// ✅ 好的做法：提供有用的错误上下文
throw new AgentError(
  'Failed to fetch user data',
  ErrorCode.API_ERROR,
  true,
  {
    userId: '123',
    endpoint: '/api/users/123',
    statusCode: 500
  }
)

// ❌ 避免：重试不可恢复的错误
// 配置错误、认证错误等不应该重试
```

### 5. 日志记录
```typescript
// ✅ 好的做法：使用合适的日志级别
logger.debug('Detailed debug info', { data: complexObject })
logger.info('User action', { userId: '123', action: 'login' })
logger.warn('Approaching limit', { remaining: 10, limit: 100 })
logger.error('Operation failed', { error: error.message })

// ✅ 好的做法：包含有用的元数据
logger.info('API call', {
  method: 'POST',
  url: '/api/users',
  duration: 123,
  statusCode: 200
})

// ❌ 避免：记录敏感信息
logger.info('User login', {
  password: 'secret123'  // ❌ 不要记录密码
})
```

### 6. 性能监控
```typescript
// ✅ 好的做法：监控关键操作
await monitor.measure('llm_call', async () => {
  return await provider.chat(messages)
})

await monitor.measure('tool_execution', async () => {
  return await tool.execute(params)
})

// ✅ 好的做法：定期检查性能统计
const stats = monitor.getStats('llm_call')
if (stats && stats.avg_duration > 5000) {
  logger.warn('LLM call is slow', { avg_duration: stats.avg_duration })
}

// ❌ 避免：监控过于细粒度的操作
// 不要监控每个小函数，只监控关键路径
```

## 常见问题

### Q1: 现有代码需要修改吗？
**A**: 不需要。所有新功能都是向后兼容的，现有代码可以继续使用。

### Q2: 如何逐步迁移？
**A**: 建议按以下顺序迁移：
1. 先添加日志记录（最简单）
2. 再添加性能监控（有助于发现问题）
3. 然后使用错误处理（提高健壮性）
4. 最后使用会话分支和标签（根据需要）

### Q3: 日志会影响性能吗？
**A**: 影响很小。日志使用异步输出，JSON 序列化开销 < 1ms。生产环境建议使用 INFO 或 WARN 级别。

### Q4: TraceId 如何跨模块传递？
**A**: 使用 AsyncLocalStorage 自动传递，无需手动传参。只需在入口处使用 `withTraceId()`，所有子函数的日志都会自动包含 TraceId。

### Q5: 如何查看性能统计？
**A**: 使用 `monitor.getStats(operation)` 或 `monitor.getAllStats()` 获取统计数据。

### Q6: 会话分支会占用多少内存？
**A**: 分支使用浅拷贝，只复制消息数组的引用。内存占用约为原会话的 10-20%。

### Q7: 成本追踪的精度如何？
**A**: 成本追踪基于 Token 使用量计算，精度取决于 Token 计数的准确性。建议定期与实际账单对比校准。

### Q8: 如何自定义日志输出？
**A**: 创建 Logger 时提供自定义输出函数：
```typescript
const logger = new Logger('app', {
  output: (entry) => {
    // 输出到文件
    fs.appendFileSync('app.log', JSON.stringify(entry) + '\n')
  }
})
```

## 示例代码

完整的使用示例请参考：
- `packages/agent/examples/session-branching.ts` - 会话分支示例
- `packages/agent/examples/session-tags.ts` - 标签管理示例
- `packages/agent/examples/session-cost-tracking.ts` - 成本追踪示例

## 相关文档

- [消息协议](./message-protocol.md)
- [会话管理器](./session-manager.md)
- [错误处理系统](./error-handling.md)
- [日志与监控系统](./logging-monitoring.md)
- [Phase 1 完成报告](./phase-1-completion-report.md)

## 获取帮助

如果在迁移过程中遇到问题：
1. 查看相关文档
2. 查看示例代码
3. 查看测试用例
4. 提交 Issue

---

**最后更新**：2026-01-17  
**版本**：Phase 1
