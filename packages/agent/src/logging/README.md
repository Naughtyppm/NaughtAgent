# 日志与监控系统

提供结构化日志记录、性能监控和请求链路追踪功能。

## 功能特性

- **结构化日志**：支持多级别日志（DEBUG/INFO/WARN/ERROR）
- **性能监控**：记录操作耗时、成功率等指标
- **链路追踪**：使用 TraceId 追踪请求链路
- **灵活配置**：支持自定义日志格式和输出目标

## 快速开始

### 日志记录

```typescript
import { Logger, LogLevel } from './logging/index.js'

// 创建日志器
const logger = new Logger('my-service', {
  minLevel: LogLevel.INFO,
  format: 'json' // 或 'text'
})

// 记录日志
logger.info('Service started', { port: 3000 })
logger.warn('High memory usage', { usage: '85%' })
logger.error('Failed to connect', { error: err.message })
```

### 性能监控

```typescript
import { PerformanceMonitor } from './logging/index.js'

const monitor = new PerformanceMonitor()

// 测量异步操作
const result = await monitor.measure('api_call', async () => {
  return await fetch('/api/data')
})

// 获取统计数据
const stats = monitor.getStats('api_call')
console.log(`平均耗时: ${stats.avg_duration}ms`)
console.log(`成功率: ${stats.success_rate * 100}%`)
```

### TraceId 追踪

```typescript
import { withTraceId, getCurrentTraceId } from './logging/index.js'

// 在指定 TraceId 上下文中执行
await withTraceId('trace_123', async () => {
  // 所有日志都会包含这个 TraceId
  logger.info('Processing request')
  await processData()
})

// 自动生成新的 TraceId
const { traceId, result } = await withNewTraceId(async () => {
  return await handleRequest()
})
```

## API 文档

### Logger

#### 构造函数

```typescript
new Logger(category: string, config?: LoggerConfig)
```

- `category`: 日志分类名称
- `config.minLevel`: 最小日志级别（默认 INFO）
- `config.format`: 输出格式，'json' 或 'text'（默认 'json'）
- `config.output`: 自定义输出函数

#### 方法

- `debug(message, metadata?)`: 记录 DEBUG 级别日志
- `info(message, metadata?)`: 记录 INFO 级别日志
- `warn(message, metadata?)`: 记录 WARN 级别日志
- `error(message, metadata?)`: 记录 ERROR 级别日志
- `setMinLevel(level)`: 设置最小日志级别
- `getMinLevel()`: 获取当前最小日志级别

### PerformanceMonitor

#### 方法

- `measure<T>(operation, fn)`: 测量异步操作性能
- `measureSync<T>(operation, fn)`: 测量同步操作性能
- `getStats(operation)`: 获取指定操作的统计数据
- `getAllStats()`: 获取所有操作的统计数据
- `reset(operation)`: 重置指定操作的统计数据
- `resetAll()`: 重置所有统计数据

#### 统计数据结构

```typescript
interface OperationStats {
  operation: string
  count: number          // 执行次数
  avg_duration: number   // 平均耗时（毫秒）
  success_rate: number   // 成功率（0-1）
  error_rate: number     // 错误率（0-1）
}
```

### TraceId 管理

#### 函数

- `generateTraceId()`: 生成新的 TraceId
- `getCurrentTraceId()`: 获取当前 TraceId
- `setTraceId(traceId)`: 设置当前 TraceId
- `withTraceId(traceId, fn)`: 在指定 TraceId 上下文中执行函数
- `withNewTraceId(fn)`: 在新的 TraceId 上下文中执行函数

## 使用示例

### 完整的请求处理流程

```typescript
import { Logger, PerformanceMonitor, withNewTraceId } from './logging/index.js'

const logger = new Logger('api')
const monitor = new PerformanceMonitor()

async function handleRequest(req) {
  const { traceId, result } = await withNewTraceId(async () => {
    logger.info('Request received', { 
      method: req.method, 
      path: req.path 
    })

    // 数据库查询
    const data = await monitor.measure('db_query', async () => {
      logger.debug('Querying database')
      return await db.query('SELECT * FROM users')
    })

    // API 调用
    const enriched = await monitor.measure('api_call', async () => {
      logger.debug('Calling external API')
      return await enrichData(data)
    })

    logger.info('Request completed', { status: 200 })
    return enriched
  })

  // 记录性能指标
  const dbStats = monitor.getStats('db_query')
  const apiStats = monitor.getStats('api_call')
  
  logger.info('Performance metrics', {
    trace_id: traceId,
    db_avg: dbStats.avg_duration,
    api_avg: apiStats.avg_duration
  })

  return result
}
```

### 错误处理

```typescript
try {
  await monitor.measure('risky_operation', async () => {
    logger.info('Starting risky operation')
    await doSomethingRisky()
  })
} catch (error) {
  logger.error('Operation failed', {
    error: error.message,
    stack: error.stack
  })
  
  // 检查失败率
  const stats = monitor.getStats('risky_operation')
  if (stats.error_rate > 0.5) {
    logger.warn('High error rate detected', {
      operation: 'risky_operation',
      error_rate: stats.error_rate
    })
  }
}
```

### 自定义日志输出

```typescript
// 输出到文件
import fs from 'fs'

const fileLogger = new Logger('app', {
  format: 'json',
  output: (entry) => {
    const line = JSON.stringify(entry) + '\n'
    fs.appendFileSync('app.log', line)
  }
})

// 同时输出到控制台和文件
const multiLogger = new Logger('app', {
  output: (entry) => {
    console.log(JSON.stringify(entry))
    fs.appendFileSync('app.log', JSON.stringify(entry) + '\n')
  }
})
```

## 设计原则

1. **最小侵入**：日志记录不影响主流程性能
2. **类型安全**：完整的 TypeScript 类型定义
3. **易于测试**：支持自定义输出函数，便于测试
4. **上下文传递**：使用 AsyncLocalStorage 实现跨异步调用的上下文传递

## 性能考虑

- 日志级别过滤在记录前进行，避免不必要的序列化
- TraceId 使用 AsyncLocalStorage，性能开销极小
- 性能监控使用内存存储，适合短期统计

## 最佳实践

1. **合理设置日志级别**：生产环境使用 INFO，开发环境使用 DEBUG
2. **避免敏感信息**：不要在日志中记录密码、密钥等敏感信息
3. **结构化元数据**：使用 metadata 参数而不是拼接字符串
4. **定期清理监控数据**：长期运行的服务应定期调用 `resetAll()`
5. **使用 TraceId**：在所有异步操作中使用 TraceId 便于问题追踪

## 测试

运行测试：

```bash
npm test -- test/logging
```

测试覆盖：
- 日志级别过滤
- 日志格式化
- 性能监控
- TraceId 传递
- 集成场景
