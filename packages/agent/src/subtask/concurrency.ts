/**
 * 并发控制器
 *
 * 管理并行子 Agent 的并发数和资源分配。
 * 提供任务队列管理、最大并发数限制、超时控制和取消支持。
 *
 * @module subtask/concurrency
 * @see Requirements 4.1: 限制最大并发数（默认: 3，可配置）
 */

import type { SubAgentError } from "./errors"

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * 并发控制配置
 *
 * 控制并行执行的行为，包括并发数限制、错误处理策略和超时设置。
 *
 * @example
 * ```typescript
 * const config: ConcurrencyConfig = {
 *   maxConcurrency: 3,
 *   failFast: false,
 *   timeout: 60000,
 * }
 * ```
 */
export interface ConcurrencyConfig {
  /**
   * 最大并发数
   *
   * 同时运行的任务数量上限。
   * 默认值: 3
   *
   * @see Requirements 4.1
   */
  maxConcurrency: number

  /**
   * 遇错即停模式
   *
   * 当设置为 true 时，任何任务失败都会立即取消所有其他任务。
   * 当设置为 false 时，失败的任务不会影响其他任务的执行。
   *
   * @see Requirements 4.2
   */
  failFast: boolean

  /**
   * 单任务超时（毫秒）
   *
   * 单个任务的最大执行时间。超时后任务会被取消。
   * 如果不设置，则使用系统默认超时。
   *
   * @see Requirements 4.3, 4.4
   */
  timeout?: number
}

/**
 * 默认并发配置
 *
 * 提供合理的默认值：
 * - 3 个并发：平衡资源使用和执行效率
 * - 不启用 failFast：允许其他任务继续执行
 * - 无超时：使用系统默认超时
 */
export const DEFAULT_CONCURRENCY_CONFIG: ConcurrencyConfig = {
  maxConcurrency: 3,
  failFast: false,
  timeout: undefined,
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * 单个任务的执行结果
 *
 * 表示一个任务的执行状态和结果。
 *
 * @template R - 任务成功时的返回值类型
 */
export interface TaskResult<R> {
  /** 任务是否成功完成 */
  success: boolean

  /** 任务成功时的返回值 */
  value?: R

  /** 任务失败时的错误信息 */
  error?: string

  /** 结构化错误（如果有） */
  structuredError?: SubAgentError

  /** 任务执行时间（毫秒） */
  duration: number

  /** 任务状态 */
  status: TaskStatus
}

/**
 * 任务状态
 */
export type TaskStatus =
  | "pending"    // 等待执行
  | "running"    // 正在执行
  | "completed"  // 成功完成
  | "failed"     // 执行失败
  | "aborted"    // 被取消
  | "timeout"    // 超时

/**
 * 并发执行的总体结果
 *
 * 包含所有任务的执行结果和统计信息。
 *
 * @template R - 任务成功时的返回值类型
 *
 * @example
 * ```typescript
 * const result: ConcurrencyResult<string> = {
 *   results: [
 *     { success: true, value: "result1", duration: 100, status: "completed" },
 *     { success: false, error: "timeout", duration: 5000, status: "timeout" },
 *   ],
 *   completed: 1,
 *   failed: 1,
 *   aborted: 0,
 *   totalDuration: 5100,
 * }
 * ```
 */
export interface ConcurrencyResult<R> {
  /**
   * 所有任务的执行结果
   *
   * 结果顺序与输入任务顺序一致。
   */
  results: Array<TaskResult<R>>

  /** 成功完成的任务数 */
  completed: number

  /** 失败的任务数（包括超时） */
  failed: number

  /** 被取消的任务数 */
  aborted: number

  /** 总执行时间（毫秒） */
  totalDuration: number
}

// ============================================================================
// Controller Interface
// ============================================================================

/**
 * 并发任务执行器函数类型
 *
 * 用于并发控制器的任务执行函数。
 *
 * @template T - 输入项类型
 * @template R - 返回值类型
 * @param item - 要处理的输入项
 * @param signal - 取消信号，用于响应取消请求
 * @returns 任务执行结果的 Promise
 */
export type ConcurrencyTaskExecutor<T, R> = (item: T, signal: AbortSignal) => Promise<R>

/**
 * 进度回调函数类型
 *
 * @param progress - 当前进度信息
 */
export type ProgressCallback = (progress: ConcurrencyProgress) => void

/**
 * 并发执行进度信息
 *
 * @see Requirements 4.5: 报告进度
 */
export interface ConcurrencyProgress {
  /** 总任务数 */
  total: number

  /** 已完成任务数（包括成功和失败） */
  completed: number

  /** 成功完成的任务数 */
  succeeded: number

  /** 失败的任务数 */
  failed: number

  /** 正在运行的任务数 */
  running: number

  /** 等待执行的任务数 */
  pending: number

  /** 最近完成的任务索引 */
  lastCompletedIndex?: number

  /** 最近完成的任务结果 */
  lastCompletedResult?: TaskResult<unknown>
}

/**
 * 并发控制器接口
 *
 * 管理并行任务的执行，提供并发限制、超时控制和取消支持。
 *
 * @template T - 输入项类型
 * @template R - 返回值类型
 *
 * @see Requirements 4.1: 限制最大并发数
 * @see Requirements 4.2: 错误处理（failFast 模式）
 * @see Requirements 4.3, 4.4: 超时支持
 * @see Requirements 3.5: 取消支持
 *
 * @example
 * ```typescript
 * const controller = createConcurrencyController<string, number>()
 *
 * const result = await controller.run(
 *   ["task1", "task2", "task3"],
 *   async (item, signal) => {
 *     // 执行任务，检查 signal.aborted 以响应取消
 *     return item.length
 *   },
 *   { maxConcurrency: 2, timeout: 5000 }
 * )
 *
 * console.log(result.completed) // 成功完成的任务数
 * ```
 */
export interface ConcurrencyController<T, R> {
  /**
   * 并行执行任务
   *
   * 按照配置的并发数限制执行任务列表。
   * 支持超时控制和取消。
   *
   * @param items - 要处理的输入项列表
   * @param executor - 任务执行器函数
   * @param config - 可选的并发配置，覆盖默认配置
   * @returns 所有任务的执行结果
   *
   * @see Requirements 4.1, 4.2, 4.3, 4.4
   */
  run(
    items: T[],
    executor: ConcurrencyTaskExecutor<T, R>,
    config?: Partial<ConcurrencyConfig>
  ): Promise<ConcurrencyResult<R>>

  /**
   * 取消所有任务
   *
   * 立即取消所有正在运行和等待执行的任务。
   * 已完成的任务不受影响。
   *
   * @see Requirements 3.5
   */
  abort(): void

  /**
   * 获取当前状态
   *
   * @returns 当前的进度信息
   */
  getProgress(): ConcurrencyProgress

  /**
   * 设置进度回调
   *
   * 每当有任务完成时调用回调函数。
   *
   * @param callback - 进度回调函数
   * @see Requirements 4.5
   */
  onProgress(callback: ProgressCallback): void

  /**
   * 检查是否正在运行
   *
   * @returns 是否有任务正在执行
   */
  isRunning(): boolean
}

// ============================================================================
// Factory Function Type
// ============================================================================

/**
 * 创建并发控制器的工厂函数类型
 *
 * @template T - 输入项类型
 * @template R - 返回值类型
 * @param config - 可选的默认配置
 * @returns 并发控制器实例
 */
export type ConcurrencyControllerFactory = <T, R>(
  config?: Partial<ConcurrencyConfig>
) => ConcurrencyController<T, R>

// ============================================================================
// Queue Types (Internal)
// ============================================================================

/**
 * 任务队列项（内部使用）
 *
 * @template T - 输入项类型
 * @internal
 */
export interface QueuedTask<T> {
  /** 任务索引 */
  index: number

  /** 输入项 */
  item: T

  /** 任务状态 */
  status: TaskStatus

  /** 任务的 AbortController */
  abortController: AbortController

  /** 开始时间 */
  startTime?: number

  /** 结束时间 */
  endTime?: number

  /** 超时定时器 ID */
  timeoutId?: ReturnType<typeof setTimeout>
}

/**
 * 任务队列状态（内部使用）
 *
 * @template T - 输入项类型
 * @template R - 返回值类型
 * @internal
 */
export interface QueueState<T, R> {
  /** 所有任务 */
  tasks: Array<QueuedTask<T>>

  /** 任务结果 */
  results: Array<TaskResult<R> | null>

  /** 正在运行的任务数 */
  runningCount: number

  /** 下一个要执行的任务索引 */
  nextIndex: number

  /** 是否已取消 */
  aborted: boolean

  /** 主 AbortController */
  mainAbortController: AbortController

  /** 开始时间 */
  startTime: number
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * 并发执行选项
 *
 * 扩展的执行选项，包含进度回调和外部取消信号。
 */
export interface ConcurrencyRunOptions extends Partial<ConcurrencyConfig> {
  /** 进度回调 */
  onProgress?: ProgressCallback

  /** 外部取消信号 */
  signal?: AbortSignal
}

/**
 * 合并并发配置
 *
 * @param partial - 部分配置
 * @returns 完整配置
 */
export function mergeConcurrencyConfig(
  partial?: Partial<ConcurrencyConfig>
): ConcurrencyConfig {
  return {
    maxConcurrency: partial?.maxConcurrency ?? DEFAULT_CONCURRENCY_CONFIG.maxConcurrency,
    failFast: partial?.failFast ?? DEFAULT_CONCURRENCY_CONFIG.failFast,
    timeout: partial?.timeout ?? DEFAULT_CONCURRENCY_CONFIG.timeout,
  }
}

/**
 * 验证并发配置
 *
 * @param config - 要验证的配置
 * @returns 验证错误列表，空数组表示验证通过
 */
export function validateConcurrencyConfig(
  config: Partial<ConcurrencyConfig>
): string[] {
  const errors: string[] = []

  if (config.maxConcurrency !== undefined) {
    if (typeof config.maxConcurrency !== "number") {
      errors.push("maxConcurrency 必须是数字类型")
    } else if (!Number.isInteger(config.maxConcurrency) || config.maxConcurrency <= 0) {
      errors.push("maxConcurrency 必须是正整数")
    }
  }

  if (config.failFast !== undefined && typeof config.failFast !== "boolean") {
    errors.push("failFast 必须是布尔类型")
  }

  if (config.timeout !== undefined) {
    if (typeof config.timeout !== "number") {
      errors.push("timeout 必须是数字类型")
    } else if (config.timeout <= 0) {
      errors.push("timeout 必须是正数")
    }
  }

  return errors
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建并发控制器
 *
 * 管理并行任务的执行，提供并发限制、超时控制和取消支持。
 *
 * @template T - 输入项类型
 * @template R - 返回值类型
 * @param defaultConfig - 默认并发配置
 * @returns 并发控制器实例
 *
 * @see Requirements 4.1: 限制最大并发数
 * @see Requirements 4.2: 错误处理（failFast 模式）
 * @see Requirements 4.3, 4.4: 超时支持
 * @see Requirements 3.5: 取消支持
 */
export function createConcurrencyController<T, R>(
  defaultConfig?: Partial<ConcurrencyConfig>
): ConcurrencyController<T, R> {
  const baseConfig = mergeConcurrencyConfig(defaultConfig)
  let progressCallback: ProgressCallback | undefined
  let currentProgress: ConcurrencyProgress = {
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    running: 0,
    pending: 0,
  }
  let running = false
  let mainAbortController: AbortController | undefined

  function emitProgress(update: Partial<ConcurrencyProgress>): void {
    currentProgress = { ...currentProgress, ...update }
    progressCallback?.(currentProgress)
  }

  async function executeTask(
    item: T,
    index: number,
    executor: ConcurrencyTaskExecutor<T, R>,
    signal: AbortSignal,
    timeout?: number
  ): Promise<TaskResult<R>> {
    const startTime = Date.now()

    // 已取消则直接返回
    if (signal.aborted) {
      return {
        success: false,
        error: "Task was aborted before execution",
        duration: 0,
        status: "aborted",
      }
    }

    // 创建任务级 AbortController，链接到主信号
    const taskAbort = new AbortController()
    const onMainAbort = () => taskAbort.abort()
    signal.addEventListener("abort", onMainAbort, { once: true })

    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      // 设置超时
      const taskPromise = executor(item, taskAbort.signal)

      let result: R
      if (timeout && timeout > 0) {
        result = await new Promise<R>((resolve, reject) => {
          timeoutId = setTimeout(() => {
            taskAbort.abort()
            reject(new Error(`Task ${index} timed out after ${timeout}ms`))
          }, timeout)

          taskPromise.then(resolve, reject)
        })
      } else {
        result = await taskPromise
      }

      return {
        success: true,
        value: result,
        duration: Date.now() - startTime,
        status: "completed",
      }
    } catch (err) {
      const duration = Date.now() - startTime
      const errorMessage = err instanceof Error ? err.message : String(err)

      // 判断状态
      if (taskAbort.signal.aborted && errorMessage.includes("timed out")) {
        return {
          success: false,
          error: errorMessage,
          duration,
          status: "timeout",
        }
      }
      if (signal.aborted || taskAbort.signal.aborted) {
        return {
          success: false,
          error: errorMessage,
          duration,
          status: "aborted",
        }
      }
      return {
        success: false,
        error: errorMessage,
        duration,
        status: "failed",
      }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      signal.removeEventListener("abort", onMainAbort)
    }
  }

  return {
    async run(
      items: T[],
      executor: ConcurrencyTaskExecutor<T, R>,
      config?: Partial<ConcurrencyConfig>
    ): Promise<ConcurrencyResult<R>> {
      const mergedConfig = mergeConcurrencyConfig({
        ...baseConfig,
        ...config,
      })
      const { maxConcurrency, failFast, timeout } = mergedConfig

      running = true
      mainAbortController = new AbortController()
      const signal = mainAbortController.signal

      const results: Array<TaskResult<R>> = new Array(items.length)
      let completed = 0
      let succeeded = 0
      let failed = 0
      let aborted = 0
      let nextIndex = 0
      const startTime = Date.now()

      currentProgress = {
        total: items.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
        running: 0,
        pending: items.length,
      }

      // 空列表直接返回
      if (items.length === 0) {
        running = false
        return { results: [], completed: 0, failed: 0, aborted: 0, totalDuration: 0 }
      }

      return new Promise<ConcurrencyResult<R>>((resolve) => {
        let activeCount = 0
        let settled = false

        function settle(): void {
          if (settled) return
          settled = true
          running = false

          resolve({
            results,
            completed: succeeded,
            failed,
            aborted,
            totalDuration: Date.now() - startTime,
          })
        }

        function scheduleNext(): void {
          // 如果已经全部完成或已 settle
          if (settled) return

          // 检查是否所有任务都已处理完
          if (completed >= items.length) {
            settle()
            return
          }

          // 启动新任务直到达到并发上限或没有更多任务
          while (activeCount < maxConcurrency && nextIndex < items.length && !signal.aborted) {
            const idx = nextIndex++
            activeCount++

            emitProgress({
              running: activeCount,
              pending: items.length - nextIndex,
            })

            executeTask(items[idx], idx, executor, signal, timeout).then(
              (taskResult) => {
                results[idx] = taskResult
                activeCount--
                completed++

                if (taskResult.status === "completed") {
                  succeeded++
                } else if (taskResult.status === "aborted") {
                  aborted++
                } else {
                  failed++
                }

                emitProgress({
                  completed,
                  succeeded,
                  failed,
                  running: activeCount,
                  pending: Math.max(0, items.length - nextIndex),
                  lastCompletedIndex: idx,
                  lastCompletedResult: taskResult as TaskResult<unknown>,
                })

                // failFast: 任务失败时取消所有剩余任务
                if (failFast && !taskResult.success && !signal.aborted) {
                  mainAbortController!.abort()
                  // 标记所有未开始的任务为 aborted
                  for (let i = nextIndex; i < items.length; i++) {
                    if (!results[i]) {
                      results[i] = {
                        success: false,
                        error: `Aborted due to failFast (task ${idx} failed)`,
                        duration: 0,
                        status: "aborted",
                      }
                      completed++
                      aborted++
                    }
                  }
                  emitProgress({ completed, failed, pending: 0 })
                }

                scheduleNext()
              }
            )
          }

          // 如果主信号已取消且没有活跃任务，标记剩余为 aborted
          if (signal.aborted && activeCount === 0) {
            for (let i = 0; i < items.length; i++) {
              if (!results[i]) {
                results[i] = {
                  success: false,
                  error: "Aborted",
                  duration: 0,
                  status: "aborted",
                }
                completed++
                aborted++
              }
            }
            settle()
          }
        }

        scheduleNext()
      })
    },

    abort(): void {
      mainAbortController?.abort()
    },

    getProgress(): ConcurrencyProgress {
      return { ...currentProgress }
    },

    onProgress(callback: ProgressCallback): void {
      progressCallback = callback
    },

    isRunning(): boolean {
      return running
    },
  }
}
