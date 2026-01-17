/**
 * 错误处理增强
 *
 * 提供重试机制、降级策略和超时处理
 */

import type { SubTaskConfig, SubTaskResult } from "./types"
import type { SubTaskRuntime } from "./runner"
import { runSubTask } from "./runner"

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number
  /** 重试延迟（毫秒） */
  delay: number
  /** 延迟倍数（指数退避） */
  backoffMultiplier?: number
  /** 最大延迟（毫秒） */
  maxDelay?: number
  /** 可重试的错误判断函数 */
  retryOn?: (error: string, attempt: number) => boolean
}

/**
 * 降级配置
 */
export interface FallbackConfig {
  /** 降级函数 */
  fallback: (error: string, config: SubTaskConfig) => SubTaskResult | Promise<SubTaskResult>
  /** 触发降级的条件 */
  fallbackOn?: (error: string) => boolean
}

/**
 * 超时配置
 */
export interface TimeoutConfig {
  /** 超时时间（毫秒） */
  timeout: number
  /** 超时后的处理 */
  onTimeout?: (config: SubTaskConfig) => SubTaskResult | Promise<SubTaskResult>
}

/**
 * 错误处理配置
 */
export interface ErrorHandlerConfig {
  /** 重试配置 */
  retry?: RetryConfig
  /** 降级配置 */
  fallback?: FallbackConfig
  /** 超时配置 */
  timeout?: TimeoutConfig
  /** 错误回调 */
  onError?: (error: string, attempt: number, config: SubTaskConfig) => void
}

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
}

/**
 * 默认可重试错误判断
 */
export function isRetryableError(error: string): boolean {
  const retryablePatterns = [
    /rate limit/i,
    /timeout/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /network/i,
    /503/i,
    /502/i,
    /429/i,
    /overloaded/i,
    /temporarily unavailable/i,
  ]
  return retryablePatterns.some((pattern) => pattern.test(error))
}

/**
 * 计算重试延迟
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  const { delay, backoffMultiplier = 1, maxDelay = Infinity } = config
  const calculatedDelay = delay * Math.pow(backoffMultiplier, attempt - 1)
  return Math.min(calculatedDelay, maxDelay)
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 带超时的 Promise
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutError))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

/**
 * 带错误处理的子任务执行
 */
export async function runWithErrorHandler(
  config: SubTaskConfig,
  runtime: SubTaskRuntime,
  errorConfig: ErrorHandlerConfig = {}
): Promise<SubTaskResult> {
  const { retry, fallback, timeout, onError } = errorConfig

  let lastError: string = ""
  let attempt = 0
  const maxAttempts = (retry?.maxRetries ?? 0) + 1

  while (attempt < maxAttempts) {
    attempt++

    try {
      // 执行任务（可能带超时）
      let resultPromise = runSubTask(config, runtime)

      if (timeout) {
        resultPromise = withTimeout(
          resultPromise,
          timeout.timeout,
          `Task timed out after ${timeout.timeout}ms`
        )
      }

      const result = await resultPromise

      // 检查结果是否成功
      if (result.success) {
        return result
      }

      // 任务返回失败
      lastError = result.error || "Task failed"

      // 检查是否应该重试
      if (retry && attempt < maxAttempts) {
        const shouldRetry = retry.retryOn
          ? retry.retryOn(lastError, attempt)
          : isRetryableError(lastError)

        if (shouldRetry) {
          onError?.(lastError, attempt, config)
          const delayMs = calculateDelay(attempt, retry)
          await sleep(delayMs)
          continue
        }
      }

      // 不重试，检查是否降级
      if (fallback) {
        const shouldFallback = fallback.fallbackOn
          ? fallback.fallbackOn(lastError)
          : true

        if (shouldFallback) {
          return await fallback.fallback(lastError, config)
        }
      }

      // 返回失败结果
      return result
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)

      // 检查是否是超时
      if (timeout?.onTimeout && lastError.includes("timed out")) {
        return await timeout.onTimeout(config)
      }

      // 检查是否应该重试
      if (retry && attempt < maxAttempts) {
        const shouldRetry = retry.retryOn
          ? retry.retryOn(lastError, attempt)
          : isRetryableError(lastError)

        if (shouldRetry) {
          onError?.(lastError, attempt, config)
          const delayMs = calculateDelay(attempt, retry)
          await sleep(delayMs)
          continue
        }
      }

      // 不重试，检查是否降级
      if (fallback) {
        const shouldFallback = fallback.fallbackOn
          ? fallback.fallbackOn(lastError)
          : true

        if (shouldFallback) {
          return await fallback.fallback(lastError, config)
        }
      }

      // 返回错误结果
      return {
        success: false,
        output: "",
        error: lastError,
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      }
    }
  }

  // 所有重试都失败
  if (fallback) {
    return await fallback.fallback(lastError, config)
  }

  return {
    success: false,
    output: "",
    error: `Failed after ${attempt} attempts: ${lastError}`,
    usage: { inputTokens: 0, outputTokens: 0 },
    duration: 0,
  }
}

/**
 * 创建带重试的执行器
 */
export function withRetry(
  retryConfig: Partial<RetryConfig> = {}
): (config: SubTaskConfig, runtime: SubTaskRuntime) => Promise<SubTaskResult> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig }

  return (config, runtime) =>
    runWithErrorHandler(config, runtime, { retry: fullConfig })
}

/**
 * 创建带降级的执行器
 */
export function withFallback(
  fallbackFn: FallbackConfig["fallback"],
  fallbackOn?: FallbackConfig["fallbackOn"]
): (config: SubTaskConfig, runtime: SubTaskRuntime) => Promise<SubTaskResult> {
  return (config, runtime) =>
    runWithErrorHandler(config, runtime, {
      fallback: { fallback: fallbackFn, fallbackOn },
    })
}

/**
 * 创建带超时的执行器
 */
export function withTimeout_(
  timeoutMs: number,
  onTimeout?: TimeoutConfig["onTimeout"]
): (config: SubTaskConfig, runtime: SubTaskRuntime) => Promise<SubTaskResult> {
  return (config, runtime) =>
    runWithErrorHandler(config, runtime, {
      timeout: { timeout: timeoutMs, onTimeout },
    })
}

/**
 * 组合多个错误处理策略
 */
export function combineErrorHandlers(
  ...handlers: ErrorHandlerConfig[]
): ErrorHandlerConfig {
  const combined: ErrorHandlerConfig = {}

  for (const handler of handlers) {
    if (handler.retry) {
      combined.retry = handler.retry
    }
    if (handler.fallback) {
      combined.fallback = handler.fallback
    }
    if (handler.timeout) {
      combined.timeout = handler.timeout
    }
    if (handler.onError) {
      const prevOnError = combined.onError
      combined.onError = (error, attempt, config) => {
        prevOnError?.(error, attempt, config)
        handler.onError?.(error, attempt, config)
      }
    }
  }

  return combined
}

/**
 * 错误处理构建器
 */
export class ErrorHandlerBuilder {
  private config: ErrorHandlerConfig = {}

  /**
   * 添加重试策略
   */
  retry(config: Partial<RetryConfig> = {}): ErrorHandlerBuilder {
    this.config.retry = { ...DEFAULT_RETRY_CONFIG, ...config }
    return this
  }

  /**
   * 添加降级策略
   */
  fallback(
    fallbackFn: FallbackConfig["fallback"],
    fallbackOn?: FallbackConfig["fallbackOn"]
  ): ErrorHandlerBuilder {
    this.config.fallback = { fallback: fallbackFn, fallbackOn }
    return this
  }

  /**
   * 添加超时处理
   */
  timeout(
    timeoutMs: number,
    onTimeout?: TimeoutConfig["onTimeout"]
  ): ErrorHandlerBuilder {
    this.config.timeout = { timeout: timeoutMs, onTimeout }
    return this
  }

  /**
   * 添加错误回调
   */
  onError(
    callback: (error: string, attempt: number, config: SubTaskConfig) => void
  ): ErrorHandlerBuilder {
    this.config.onError = callback
    return this
  }

  /**
   * 构建配置
   */
  build(): ErrorHandlerConfig {
    return { ...this.config }
  }

  /**
   * 执行任务
   */
  async execute(
    config: SubTaskConfig,
    runtime: SubTaskRuntime
  ): Promise<SubTaskResult> {
    return runWithErrorHandler(config, runtime, this.config)
  }
}

/**
 * 创建错误处理构建器
 */
export function errorHandler(): ErrorHandlerBuilder {
  return new ErrorHandlerBuilder()
}
