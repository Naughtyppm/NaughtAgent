/**
 * MCP 连接重试策略
 *
 * 实现指数退避算法，用于 MCP 服务器连接失败时的自动重试
 */

import type { McpClient } from "./client"

// ============================================================================
// Types
// ============================================================================

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts: number
  /** 初始延迟（毫秒） */
  initialDelayMs: number
  /** 最大延迟（毫秒） */
  maxDelayMs: number
  /** 退避倍数 */
  backoffMultiplier: number
}

/**
 * 重试结果
 */
export interface RetryResult {
  /** 是否成功 */
  success: boolean
  /** 尝试次数 */
  attempts: number
  /** 最后的错误（如果失败） */
  lastError?: Error
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
}

// ============================================================================
// Retry Functions
// ============================================================================

/**
 * 延迟函数
 *
 * @param ms 延迟时间（毫秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 计算下一次重试的延迟时间
 *
 * 使用指数退避算法：delay = min(initialDelay * (backoffMultiplier ^ attempt), maxDelay)
 *
 * @param attempt 当前尝试次数（从 0 开始）
 * @param config 重试配置
 * @returns 延迟时间（毫秒）
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const delay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  return Math.min(delay, config.maxDelayMs)
}

/**
 * 带重试的连接
 *
 * 使用指数退避算法重试连接 MCP 服务器
 *
 * @param client MCP 客户端
 * @param config 重试配置
 * @returns 重试结果
 */
export async function connectWithRetry(
  client: McpClient,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<RetryResult> {
  let lastError: Error | null = null
  let attempt = 0

  for (attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      // 尝试连接
      await client.connect()

      // 连接成功
      return {
        success: true,
        attempts: attempt + 1,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // 如果还有重试机会，等待后重试
      if (attempt < config.maxAttempts - 1) {
        const delay = calculateBackoffDelay(attempt, config)

        console.warn(
          `[MCP Retry] Connection failed for ${client.name}, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxAttempts})`,
          lastError.message
        )

        await sleep(delay)
      }
    }
  }

  // 所有重试都失败了
  return {
    success: false,
    attempts: attempt,
    lastError: lastError || new Error("Unknown error"),
  }
}

/**
 * 带重试的异步操作
 *
 * 通用的重试包装器，可用于任何异步操作
 *
 * @param operation 要执行的异步操作
 * @param config 重试配置
 * @param operationName 操作名称（用于日志）
 * @returns 操作结果
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  operationName = "operation"
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < config.maxAttempts - 1) {
        const delay = calculateBackoffDelay(attempt, config)

        console.warn(
          `[Retry] ${operationName} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxAttempts})`,
          lastError.message
        )

        await sleep(delay)
      }
    }
  }

  // 所有重试都失败了
  throw new Error(
    `${operationName} failed after ${config.maxAttempts} attempts: ${lastError?.message}`
  )
}

/**
 * 创建重试配置
 *
 * @param partial 部分配置
 * @returns 完整的重试配置
 */
export function createRetryConfig(
  partial: Partial<RetryConfig> = {}
): RetryConfig {
  return {
    ...DEFAULT_RETRY_CONFIG,
    ...partial,
  }
}
