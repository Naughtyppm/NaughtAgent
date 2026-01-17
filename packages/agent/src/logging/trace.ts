/**
 * TraceId 管理系统
 * 
 * 使用 AsyncLocalStorage 实现请求链路追踪，支持跨异步调用的上下文传递
 */

import { AsyncLocalStorage } from 'async_hooks'

/**
 * TraceId 存储
 */
const traceStorage = new AsyncLocalStorage<string>()

/**
 * 生成 TraceId
 * 
 * 格式: trace_timestamp_random
 * 
 * @returns 新的 TraceId
 * 
 * @example
 * ```typescript
 * const traceId = generateTraceId()
 * // => "trace_1705478400000_a1b2c3d"
 * ```
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 获取当前 TraceId
 * 
 * 从 AsyncLocalStorage 中获取当前上下文的 TraceId
 * 
 * @returns 当前 TraceId，如果不存在则返回 undefined
 * 
 * @example
 * ```typescript
 * const traceId = getCurrentTraceId()
 * if (traceId) {
 *   logger.info('Processing request', { trace_id: traceId })
 * }
 * ```
 */
export function getCurrentTraceId(): string | undefined {
  return traceStorage.getStore()
}

/**
 * 设置 TraceId
 * 
 * 使用 enterWith 方法设置当前上下文的 TraceId
 * 注意：这会影响当前执行上下文及其后续的所有异步操作
 * 
 * @param traceId 要设置的 TraceId
 * 
 * @example
 * ```typescript
 * setTraceId('trace_123')
 * // 后续所有操作都会使用这个 TraceId
 * ```
 */
export function setTraceId(traceId: string): void {
  traceStorage.enterWith(traceId)
}

/**
 * 在指定 TraceId 上下文中执行函数
 * 
 * 使用 AsyncLocalStorage.run 方法创建独立的 TraceId 上下文
 * 
 * @param traceId TraceId
 * @param fn 要执行的函数
 * @returns 函数执行结果
 * 
 * @example
 * ```typescript
 * await withTraceId('trace_123', async () => {
 *   // 在这个作用域内，getCurrentTraceId() 会返回 'trace_123'
 *   await processRequest()
 *   await saveResult()
 * })
 * ```
 */
export async function withTraceId<T>(
  traceId: string,
  fn: () => Promise<T>
): Promise<T> {
  return traceStorage.run(traceId, fn)
}

/**
 * 在新的 TraceId 上下文中执行函数
 * 
 * 自动生成新的 TraceId 并在该上下文中执行函数
 * 
 * @param fn 要执行的函数
 * @returns 包含 TraceId 和函数执行结果的对象
 * 
 * @example
 * ```typescript
 * const { traceId, result } = await withNewTraceId(async () => {
 *   return await processRequest()
 * })
 * console.log(`Request processed with trace: ${traceId}`)
 * ```
 */
export async function withNewTraceId<T>(
  fn: () => Promise<T>
): Promise<{ traceId: string; result: T }> {
  const traceId = generateTraceId()
  const result = await withTraceId(traceId, fn)
  return { traceId, result }
}
