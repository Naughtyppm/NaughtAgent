/**
 * 重试机制
 * 
 * 提供带指数退避的重试功能
 */

import { AgentError, ErrorCode } from './types.js'

/**
 * 重试策略配置
 */
export interface RetryPolicy {
  /** 最大重试次数 */
  maxAttempts: number
  /** 初始延迟（毫秒） */
  initialDelay: number
  /** 最大延迟（毫秒） */
  maxDelay: number
  /** 退避倍数 */
  backoffMultiplier: number
  /** 可重试的错误码列表 */
  retryableErrors: ErrorCode[]
}

/**
 * 默认重试策略
 * 
 * - 最多重试 3 次
 * - 初始延迟 1 秒
 * - 最大延迟 10 秒
 * - 指数退避倍数 2
 * - 仅重试网络相关错误
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
 * 
 * @param ms - 睡眠时间（毫秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 检查错误是否可重试
 * 
 * @param error - 错误对象
 * @param policy - 重试策略
 * @returns 是否可重试
 */
function isRetryable(error: unknown, policy: RetryPolicy): boolean {
  if (error instanceof AgentError) {
    return policy.retryableErrors.includes(error.code)
  }
  return false
}

/**
 * 带重试的执行函数
 * 
 * 使用指数退避策略自动重试失败的操作
 * 
 * @param fn - 要执行的异步函数
 * @param policy - 重试策略（可选，默认使用 defaultRetryPolicy）
 * @returns 函数执行结果
 * @throws 如果所有重试都失败，抛出最后一次的错误
 * 
 * @example
 * ```typescript
 * const result = await withRetry(async () => {
 *   return await fetchData()
 * })
 * ```
 * 
 * @example
 * ```typescript
 * // 自定义重试策略
 * const result = await withRetry(
 *   async () => await fetchData(),
 *   {
 *     maxAttempts: 5,
 *     initialDelay: 2000,
 *     maxDelay: 30000,
 *     backoffMultiplier: 2,
 *     retryableErrors: [ErrorCode.NETWORK_ERROR, ErrorCode.TIMEOUT]
 *   }
 * )
 * ```
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
      if (!isRetryable(error, policy)) {
        throw error
      }
      
      // 最后一次尝试失败
      if (attempt === policy.maxAttempts) {
        throw error
      }
      
      // 等待后重试（指数退避）
      await sleep(delay)
      delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelay)
    }
  }
  
  // 理论上不会到达这里，但为了类型安全
  throw lastError!
}
