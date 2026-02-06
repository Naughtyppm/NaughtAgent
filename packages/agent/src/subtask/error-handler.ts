/**
 * 错误处理增强
 *
 * 提供重试机制、降级策略和超时处理
 *
 * @module subtask/error-handler
 * @see Requirements 7.3: 自动重试支持
 * @see Requirements 7.4: 综合错误报告
 */

import type { SubTaskConfig, SubTaskResult } from "./types"
import type { SubTaskRuntime } from "./runner"
import { runSubTask } from "./runner"
import {
  SubAgentErrorType,
  type SubAgentError,
  type SubAgentErrorContext,
  isSubAgentError,
  fromError,
  createRetryExhaustedError,
  createTimeoutError,
  createLLMError,
  formatErrorMessage,
} from "./errors"
import type { SubAgentEventListener } from "./events"

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
  /** 可重试的 SubAgentError 类型 */
  retryableErrorTypes?: SubAgentErrorType[]
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
  /** 重试事件监听器（用于 UI 集成） */
  onRetry?: SubAgentEventListener
  /** Agent ID（用于事件发射） */
  agentId?: string
}

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
  retryableErrorTypes: [
    SubAgentErrorType.LLM_ERROR,
    SubAgentErrorType.TIMEOUT,
    SubAgentErrorType.CONCURRENCY_ERROR,
  ],
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
 * 检查 SubAgentError 是否可重试
 *
 * @param error - SubAgentError 对象
 * @param retryableTypes - 可重试的错误类型列表（可选，默认使用 DEFAULT_RETRY_CONFIG）
 * @returns 是否可重试
 *
 * @see Requirements 7.3: 自动重试支持
 */
export function isRetryableSubAgentError(
  error: SubAgentError,
  retryableTypes: SubAgentErrorType[] = DEFAULT_RETRY_CONFIG.retryableErrorTypes!
): boolean {
  return retryableTypes.includes(error.type)
}

/**
 * 统一的错误重试判断
 *
 * 支持字符串错误和 SubAgentError 两种格式。
 * 对于 SubAgentError，同时检查错误类型和原始错误消息。
 */
export function shouldRetryError(
  error: string | SubAgentError,
  retryableTypes?: SubAgentErrorType[]
): boolean {
  if (typeof error === "string") {
    return isRetryableError(error)
  }
  // 对于 SubAgentError，检查类型是否可重试，同时也检查原始消息
  // 这确保了向后兼容性：如果错误消息不匹配可重试模式，即使类型可重试也不重试
  return isRetryableSubAgentError(error, retryableTypes) && isRetryableError(error.message)
}

/**
 * 将错误转换为 SubAgentError 格式
 *
 * @param error - 原始错误（字符串或 Error 对象）
 * @param context - 错误上下文信息
 * @returns SubAgentError 对象
 *
 * @see Requirements 7.1: 结构化错误返回
 */
export function convertToSubAgentError(
  error: string | Error,
  context: Partial<SubAgentErrorContext> = {}
): SubAgentError {
  if (typeof error === "string") {
    // 根据错误消息推断类型
    if (error.toLowerCase().includes("timeout") || error.toLowerCase().includes("timed out")) {
      return createTimeoutError(context.timeoutMs || 0, context)
    }
    return createLLMError(error, context)
  }

  // 如果已经是 SubAgentError，直接返回
  if (isSubAgentError(error)) {
    return error
  }

  // 使用 fromError 转换
  return fromError(error, SubAgentErrorType.LLM_ERROR, context)
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

// ============================================================================
// Retry Event Types
// ============================================================================

/**
 * 重试事件（用于 UI 集成）
 *
 * @see Requirements 7.3: 自动重试支持
 */
export interface RetryEvent {
  type: "retry"
  id: string
  attempt: number
  maxAttempts: number
  error: string
  delay: number
}

/**
 * 发射重试事件
 */
function emitRetryEvent(
  listener: SubAgentEventListener | undefined,
  agentId: string,
  attempt: number,
  maxAttempts: number,
  error: string,
  delay: number
): void {
  if (listener) {
    // 使用 thinking 事件类型传递重试信息（兼容现有事件系统）
    listener({
      type: "thinking",
      id: agentId,
      message: `重试中 (${attempt}/${maxAttempts}): ${error}，等待 ${delay}ms...`,
    })
  }
}

// ============================================================================
// Comprehensive Error Report
// ============================================================================

/**
 * 重试尝试记录
 */
export interface RetryAttempt {
  /** 尝试次数 */
  attempt: number
  /** 错误信息 */
  error: string
  /** 错误类型 */
  errorType?: SubAgentErrorType
  /** 时间戳 */
  timestamp: number
  /** 延迟时间（毫秒） */
  delay: number
}

/**
 * 综合错误报告
 *
 * 当所有重试都失败时，返回包含所有尝试详情的报告
 *
 * @see Requirements 7.4: 综合错误报告
 */
export interface ComprehensiveErrorReport {
  /** 最终错误 */
  finalError: SubAgentError
  /** 所有重试尝试 */
  attempts: RetryAttempt[]
  /** 总耗时（毫秒） */
  totalDuration: number
  /** 总重试次数 */
  totalRetries: number
  /** 是否因超时失败 */
  timedOut: boolean
  /** 部分结果（如果有） */
  partialResult?: Partial<SubTaskResult>
}

/**
 * 创建综合错误报告
 *
 * @param attempts - 所有重试尝试记录
 * @param startTime - 开始时间
 * @param context - 错误上下文
 * @param partialResult - 部分结果（可选）
 * @returns 综合错误报告
 *
 * @see Requirements 7.4: 综合错误报告
 */
export function createComprehensiveErrorReport(
  attempts: RetryAttempt[],
  startTime: number,
  context: Partial<SubAgentErrorContext> = {},
  partialResult?: Partial<SubTaskResult>
): ComprehensiveErrorReport {
  const lastAttempt = attempts[attempts.length - 1]
  const totalDuration = Date.now() - startTime
  const timedOut = lastAttempt?.errorType === SubAgentErrorType.TIMEOUT

  const finalError = createRetryExhaustedError(
    attempts.length,
    lastAttempt?.error || "Unknown error",
    {
      ...context,
      duration: totalDuration,
      completedSteps: partialResult?.steps?.length,
    }
  )

  return {
    finalError,
    attempts,
    totalDuration,
    totalRetries: attempts.length,
    timedOut,
    partialResult,
  }
}

/**
 * 将综合错误报告转换为 SubTaskResult
 */
export function errorReportToResult(report: ComprehensiveErrorReport): SubTaskResult {
  const errorMessage = formatErrorMessage(report.finalError)
  const attemptsSummary = report.attempts
    .map((a) => `  尝试 ${a.attempt}: ${a.error}`)
    .join("\n")

  return {
    success: false,
    output: report.partialResult?.output || "",
    error: `${errorMessage}\n\n重试历史:\n${attemptsSummary}`,
    usage: report.partialResult?.usage || { inputTokens: 0, outputTokens: 0 },
    duration: report.totalDuration,
    steps: report.partialResult?.steps,
  }
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
 *
 * 支持重试、降级、超时处理，并发射重试事件用于 UI 集成。
 *
 * @see Requirements 7.3: 自动重试支持
 * @see Requirements 7.4: 综合错误报告
 */
export async function runWithErrorHandler(
  config: SubTaskConfig,
  runtime: SubTaskRuntime,
  errorConfig: ErrorHandlerConfig = {}
): Promise<SubTaskResult> {
  const { retry, fallback, timeout, onError, onRetry, agentId } = errorConfig
  const startTime = Date.now()

  let lastError: string = ""
  let lastSubAgentError: SubAgentError | undefined
  let attempt = 0
  const maxAttempts = (retry?.maxRetries ?? 0) + 1
  const retryAttempts: RetryAttempt[] = []
  let partialResult: Partial<SubTaskResult> | undefined

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

      // 保存部分结果
      if (result.output || result.steps?.length) {
        partialResult = {
          output: result.output,
          steps: result.steps,
          usage: result.usage,
        }
      }

      // 转换为结构化错误
      lastSubAgentError = convertToSubAgentError(lastError, {
        agentId,
        agentType: config.mode,
        duration: Date.now() - startTime,
      })

      // 检查是否应该重试
      if (retry && attempt < maxAttempts) {
        const shouldRetry = retry.retryOn
          ? retry.retryOn(lastError, attempt)
          : shouldRetryError(lastSubAgentError, retry.retryableErrorTypes)

        if (shouldRetry) {
          const delayMs = calculateDelay(attempt, retry)

          // 记录重试尝试
          retryAttempts.push({
            attempt,
            error: lastError,
            errorType: lastSubAgentError.type,
            timestamp: Date.now(),
            delay: delayMs,
          })

          // 发射重试事件
          if (agentId) {
            emitRetryEvent(onRetry, agentId, attempt, maxAttempts, lastError, delayMs)
          }

          onError?.(lastError, attempt, config)
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

      // 转换为结构化错误
      lastSubAgentError = convertToSubAgentError(
        error instanceof Error ? error : lastError,
        {
          agentId,
          agentType: config.mode,
          duration: Date.now() - startTime,
          timeoutMs: timeout?.timeout,
        }
      )

      // 检查是否是超时
      if (timeout?.onTimeout && lastError.includes("timed out")) {
        return await timeout.onTimeout(config)
      }

      // 检查是否应该重试
      if (retry && attempt < maxAttempts) {
        const shouldRetry = retry.retryOn
          ? retry.retryOn(lastError, attempt)
          : shouldRetryError(lastSubAgentError, retry.retryableErrorTypes)

        if (shouldRetry) {
          const delayMs = calculateDelay(attempt, retry)

          // 记录重试尝试
          retryAttempts.push({
            attempt,
            error: lastError,
            errorType: lastSubAgentError.type,
            timestamp: Date.now(),
            delay: delayMs,
          })

          // 发射重试事件
          if (agentId) {
            emitRetryEvent(onRetry, agentId, attempt, maxAttempts, lastError, delayMs)
          }

          onError?.(lastError, attempt, config)
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
        duration: Date.now() - startTime,
      }
    }
  }

  // 所有重试都失败 - 创建综合错误报告
  if (retryAttempts.length > 0) {
    const report = createComprehensiveErrorReport(
      retryAttempts,
      startTime,
      {
        agentId,
        agentType: config.mode,
      },
      partialResult
    )
    return errorReportToResult(report)
  }

  // 降级处理
  if (fallback) {
    return await fallback.fallback(lastError, config)
  }

  return {
    success: false,
    output: "",
    error: `Failed after ${attempt} attempts: ${lastError}`,
    usage: { inputTokens: 0, outputTokens: 0 },
    duration: Date.now() - startTime,
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
   * 添加重试事件监听器（用于 UI 集成）
   *
   * @see Requirements 7.3: 自动重试支持
   */
  onRetry(listener: SubAgentEventListener): ErrorHandlerBuilder {
    this.config.onRetry = listener
    return this
  }

  /**
   * 设置 Agent ID（用于事件发射）
   */
  withAgentId(agentId: string): ErrorHandlerBuilder {
    this.config.agentId = agentId
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
