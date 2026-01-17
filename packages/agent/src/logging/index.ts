/**
 * 日志与监控系统
 * 
 * 提供结构化日志记录、性能监控和请求链路追踪功能
 * 
 * @module logging
 * 
 * @example
 * ```typescript
 * import { Logger, PerformanceMonitor, withTraceId } from './logging/index.js'
 * 
 * // 创建日志器
 * const logger = new Logger('my-service')
 * 
 * // 记录日志
 * logger.info('Service started', { port: 3000 })
 * 
 * // 性能监控
 * const monitor = new PerformanceMonitor()
 * await monitor.measure('api_call', async () => {
 *   return await fetch('/api/data')
 * })
 * 
 * // TraceId 追踪
 * await withTraceId('trace_123', async () => {
 *   logger.info('Processing request') // 日志会包含 trace_id
 * })
 * ```
 */

// 日志器
export {
  Logger,
  LogLevel,
  createLogger
} from './logger.js'

export type {
  LogEntry,
  LoggerConfig
} from './logger.js'

// 性能监控
export {
  PerformanceMonitor,
  globalMonitor
} from './monitor.js'

export type {
  OperationStats
} from './monitor.js'

// TraceId 管理
export {
  generateTraceId,
  getCurrentTraceId,
  setTraceId,
  withTraceId,
  withNewTraceId
} from './trace.js'
