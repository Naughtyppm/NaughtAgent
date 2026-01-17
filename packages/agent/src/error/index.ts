/**
 * 错误处理模块
 * 
 * 提供统一的错误分类、处理和重试机制
 * 
 * @module error
 * 
 * @example
 * ```typescript
 * import { AgentError, ErrorCode, withRetry } from './error/index.js'
 * 
 * // 创建错误
 * throw new AgentError(
 *   'Network request failed',
 *   ErrorCode.NETWORK_ERROR,
 *   true,
 *   { url: 'https://api.example.com' }
 * )
 * 
 * // 使用重试
 * const result = await withRetry(async () => {
 *   return await fetchData()
 * })
 * ```
 */

export { AgentError, ErrorCode } from './types.js'
export { withRetry, defaultRetryPolicy, type RetryPolicy } from './retry.js'
