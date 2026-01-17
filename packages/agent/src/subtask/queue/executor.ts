/**
 * 任务执行器
 *
 * 提供串行执行队列，支持优先级和取消/暂停机制
 */

import type {
  SubTaskConfig,
  SubTaskResult,
  TaskExecution,
  TaskExecutionStatus,
} from "../types"
import type { SubTaskRuntime } from "../runner"
import { runSubTask } from "../runner"

/**
 * 队列任务
 */
export interface QueuedTask {
  /** 任务 ID */
  id: string
  /** 任务配置 */
  config: SubTaskConfig
  /** 运行时配置 */
  runtime: SubTaskRuntime
  /** 优先级（数字越大优先级越高） */
  priority: number
  /** 添加时间 */
  addedAt: number
  /** 取消控制器 */
  abortController: AbortController
  /** 完成回调 */
  resolve: (result: SubTaskResult) => void
  /** 错误回调 */
  reject: (error: Error) => void
}

/**
 * 执行器状态
 */
export type ExecutorStatus = "idle" | "running" | "paused" | "stopped"

/**
 * 执行器事件
 */
export type ExecutorEvent =
  | { type: "task_start"; task: QueuedTask }
  | { type: "task_end"; task: QueuedTask; result: SubTaskResult }
  | { type: "task_error"; task: QueuedTask; error: Error }
  | { type: "task_cancelled"; task: QueuedTask }
  | { type: "queue_empty" }
  | { type: "status_change"; status: ExecutorStatus }

/**
 * 执行器事件监听器
 */
export type ExecutorEventListener = (event: ExecutorEvent) => void

/**
 * 任务执行器配置
 */
export interface TaskExecutorConfig {
  /** 最大并发数（默认 1，串行执行） */
  concurrency?: number
  /** 任务超时时间（毫秒） */
  defaultTimeout?: number
  /** 失败重试次数 */
  retryCount?: number
  /** 重试延迟（毫秒） */
  retryDelay?: number
}

/**
 * 生成任务 ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 任务执行器
 */
export class TaskExecutor {
  private queue: QueuedTask[] = []
  private running: Map<string, QueuedTask> = new Map()
  private executions: Map<string, TaskExecution> = new Map()
  private status: ExecutorStatus = "idle"
  private listeners: Set<ExecutorEventListener> = new Set()
  private config: Required<TaskExecutorConfig>

  constructor(config: TaskExecutorConfig = {}) {
    this.config = {
      concurrency: config.concurrency ?? 1,
      defaultTimeout: config.defaultTimeout ?? 300000, // 5 minutes
      retryCount: config.retryCount ?? 0,
      retryDelay: config.retryDelay ?? 1000,
    }
  }

  /**
   * 获取执行器状态
   */
  getStatus(): ExecutorStatus {
    return this.status
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.queue.length
  }

  /**
   * 获取正在运行的任务数
   */
  getRunningCount(): number {
    return this.running.size
  }

  /**
   * 获取任务执行状态
   */
  getExecution(taskId: string): TaskExecution | undefined {
    return this.executions.get(taskId)
  }

  /**
   * 获取所有执行状态
   */
  getAllExecutions(): TaskExecution[] {
    return Array.from(this.executions.values())
  }

  /**
   * 添加事件监听器
   */
  on(listener: ExecutorEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 触发事件
   */
  private emit(event: ExecutorEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * 设置状态
   */
  private setStatus(status: ExecutorStatus): void {
    if (this.status !== status) {
      this.status = status
      this.emit({ type: "status_change", status })
    }
  }

  /**
   * 添加任务到队列
   */
  enqueue(
    config: SubTaskConfig,
    runtime: SubTaskRuntime,
    options: { priority?: number } = {}
  ): { taskId: string; promise: Promise<SubTaskResult> } {
    const taskId = generateTaskId()
    const abortController = new AbortController()

    // 合并 abort 信号
    const originalAbort = config.abort
    if (originalAbort) {
      originalAbort.addEventListener("abort", () => {
        abortController.abort()
      })
    }

    let resolve: (result: SubTaskResult) => void
    let reject: (error: Error) => void

    const promise = new Promise<SubTaskResult>((res, rej) => {
      resolve = res
      reject = rej
    })

    const task: QueuedTask = {
      id: taskId,
      config: { ...config, abort: abortController.signal },
      runtime,
      priority: options.priority ?? 0,
      addedAt: Date.now(),
      abortController,
      resolve: resolve!,
      reject: reject!,
    }

    // 记录执行状态
    this.executions.set(taskId, {
      id: taskId,
      mode: config.mode,
      status: "pending",
    })

    // 按优先级插入队列
    this.insertByPriority(task)

    // 尝试处理队列
    this.processQueue()

    return { taskId, promise }
  }

  /**
   * 按优先级插入队列
   */
  private insertByPriority(task: QueuedTask): void {
    // 找到第一个优先级小于当前任务的位置
    const index = this.queue.findIndex((t) => t.priority < task.priority)
    if (index === -1) {
      this.queue.push(task)
    } else {
      this.queue.splice(index, 0, task)
    }
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.status === "paused" || this.status === "stopped") {
      return
    }

    // 检查是否可以启动更多任务
    while (
      this.running.size < this.config.concurrency &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift()!
      this.running.set(task.id, task)
      this.setStatus("running")

      // 异步执行任务
      this.executeTask(task)
    }

    // 如果没有任务在运行且队列为空
    if (this.running.size === 0 && this.queue.length === 0) {
      this.setStatus("idle")
      this.emit({ type: "queue_empty" })
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: QueuedTask): Promise<void> {
    // 更新执行状态
    const execution = this.executions.get(task.id)!
    execution.status = "running"
    execution.startedAt = Date.now()

    this.emit({ type: "task_start", task })

    let retries = 0
    let lastError: Error | undefined

    while (retries <= this.config.retryCount) {
      try {
        // 检查是否已取消
        if (task.abortController.signal.aborted) {
          throw new Error("Task was cancelled")
        }

        // 设置超时
        const timeoutId = setTimeout(() => {
          task.abortController.abort()
        }, this.config.defaultTimeout)

        try {
          const result = await runSubTask(task.config, task.runtime)

          clearTimeout(timeoutId)

          // 更新执行状态
          execution.status = "done"
          execution.endedAt = Date.now()
          execution.result = result

          this.emit({ type: "task_end", task, result })
          task.resolve(result)

          // 清理
          this.running.delete(task.id)
          this.processQueue()
          return
        } finally {
          clearTimeout(timeoutId)
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // 检查是否是取消
        if (task.abortController.signal.aborted) {
          execution.status = "cancelled"
          execution.endedAt = Date.now()

          this.emit({ type: "task_cancelled", task })
          task.reject(new Error("Task was cancelled"))

          this.running.delete(task.id)
          this.processQueue()
          return
        }

        // 重试
        retries++
        if (retries <= this.config.retryCount) {
          await this.delay(this.config.retryDelay)
        }
      }
    }

    // 所有重试都失败
    execution.status = "error"
    execution.endedAt = Date.now()

    this.emit({ type: "task_error", task, error: lastError! })
    task.reject(lastError!)

    this.running.delete(task.id)
    this.processQueue()
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 取消任务
   */
  cancel(taskId: string): boolean {
    // 检查是否在队列中
    const queueIndex = this.queue.findIndex((t) => t.id === taskId)
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0]
      task.abortController.abort()

      const execution = this.executions.get(taskId)
      if (execution) {
        execution.status = "cancelled"
        execution.endedAt = Date.now()
      }

      this.emit({ type: "task_cancelled", task })
      task.reject(new Error("Task was cancelled"))
      return true
    }

    // 检查是否正在运行
    const runningTask = this.running.get(taskId)
    if (runningTask) {
      runningTask.abortController.abort()
      return true
    }

    return false
  }

  /**
   * 取消所有任务
   */
  cancelAll(): void {
    // 取消队列中的任务
    for (const task of this.queue) {
      task.abortController.abort()

      const execution = this.executions.get(task.id)
      if (execution) {
        execution.status = "cancelled"
        execution.endedAt = Date.now()
      }

      this.emit({ type: "task_cancelled", task })
      task.reject(new Error("Task was cancelled"))
    }
    this.queue = []

    // 取消正在运行的任务
    for (const task of this.running.values()) {
      task.abortController.abort()
    }
  }

  /**
   * 暂停执行器
   */
  pause(): void {
    if (this.status === "running" || this.status === "idle") {
      this.setStatus("paused")
    }
  }

  /**
   * 恢复执行器
   */
  resume(): void {
    if (this.status === "paused") {
      this.setStatus("idle")
      this.processQueue()
    }
  }

  /**
   * 停止执行器
   */
  stop(): void {
    this.setStatus("stopped")
    this.cancelAll()
  }

  /**
   * 清空队列（不取消正在运行的任务）
   */
  clear(): void {
    for (const task of this.queue) {
      task.abortController.abort()

      const execution = this.executions.get(task.id)
      if (execution) {
        execution.status = "cancelled"
        execution.endedAt = Date.now()
      }

      this.emit({ type: "task_cancelled", task })
      task.reject(new Error("Task was cancelled"))
    }
    this.queue = []
  }

  /**
   * 清空执行历史
   */
  clearHistory(): void {
    // 只保留 pending 和 running 状态的记录
    for (const [id, execution] of this.executions) {
      if (execution.status !== "pending" && execution.status !== "running") {
        this.executions.delete(id)
      }
    }
  }
}

/**
 * 创建任务执行器
 */
export function createTaskExecutor(config?: TaskExecutorConfig): TaskExecutor {
  return new TaskExecutor(config)
}
