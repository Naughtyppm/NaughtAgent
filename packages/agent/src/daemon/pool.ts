/**
 * Worker Pool
 *
 * 并行任务执行器，支持：
 * - 限制最大并行数
 * - 同一会话串行执行
 * - 任务超时处理
 * - 优雅关闭
 */

import { EventEmitter } from "events"
import type { Task, TaskResult, TaskQueue } from "./queue"

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Worker 状态
 */
export type WorkerStatus = "idle" | "busy" | "stopping"

/**
 * Worker 定义
 */
export interface Worker {
  /** Worker ID */
  id: number
  /** 状态 */
  status: WorkerStatus
  /** 当前执行的任务 */
  currentTask?: Task
  /** 开始时间 */
  startedAt?: number
}

/**
 * 任务执行器函数
 */
export type TaskExecutor = (
  task: Task,
  abortSignal: AbortSignal
) => Promise<TaskResult>

/**
 * Pool 事件
 */
export interface PoolEvents {
  /** Worker 开始执行任务 */
  taskStarted: (worker: Worker, task: Task) => void
  /** Worker 完成任务 */
  taskCompleted: (worker: Worker, task: Task, result: TaskResult) => void
  /** Worker 任务失败 */
  taskFailed: (worker: Worker, task: Task, error: Error) => void
  /** Worker 空闲 */
  workerIdle: (worker: Worker) => void
  /** Pool 空闲（所有 worker 都空闲） */
  poolIdle: () => void
}

/**
 * Pool 配置
 */
export interface PoolConfig {
  /** 最大并行 Worker 数，默认 3 */
  maxWorkers?: number
  /** 任务执行器 */
  executor: TaskExecutor
  /** 任务队列 */
  queue: TaskQueue
}

// ============================================================================
// Worker Pool 实现
// ============================================================================

/**
 * 创建 Worker Pool
 */
export function createWorkerPool(config: PoolConfig) {
  const { maxWorkers = 3, executor, queue } = config

  // 事件发射器
  const emitter = new EventEmitter()

  // Workers
  const workers: Worker[] = []
  for (let i = 0; i < maxWorkers; i++) {
    workers.push({
      id: i,
      status: "idle",
    })
  }

  // 正在执行任务的会话（用于保证同一会话串行执行）
  const runningSessions = new Set<string>()

  // 是否正在运行
  let running = false

  // 是否正在关闭
  let shuttingDown = false

  /**
   * 启动 Pool
   */
  function start(): void {
    if (running) return

    running = true
    shuttingDown = false

    // 监听队列事件
    queue.on("enqueued", scheduleNext)

    // 尝试调度
    scheduleNext()
  }

  /**
   * 调度下一个任务
   */
  function scheduleNext(): void {
    if (!running || shuttingDown) return

    // 找到空闲的 worker
    const idleWorker = workers.find((w) => w.status === "idle")
    if (!idleWorker) return

    // 从队列获取任务（排除正在执行的会话）
    const task = queue.dequeue(runningSessions)
    if (!task) return

    // 执行任务
    executeTask(idleWorker, task)

    // 继续调度（可能还有空闲 worker）
    scheduleNext()
  }

  /**
   * 执行任务
   */
  async function executeTask(worker: Worker, task: Task): Promise<void> {
    // 更新 worker 状态
    worker.status = "busy"
    worker.currentTask = task
    worker.startedAt = Date.now()

    // 标记会话正在执行
    runningSessions.add(task.sessionId)

    emitter.emit("taskStarted", worker, task)

    let result: TaskResult
    let timeoutId: NodeJS.Timeout | undefined

    try {
      // 设置超时
      const timeoutPromise = new Promise<never>((_, reject) => {
        if (task.timeout && task.timeout > 0) {
          timeoutId = setTimeout(() => {
            task.abortController?.abort()
            reject(new Error(`Task timeout after ${task.timeout}ms`))
          }, task.timeout)
        }
      })

      // 执行任务
      const abortSignal = task.abortController?.signal || new AbortController().signal
      const executionPromise = executor(task, abortSignal)

      // 竞争：执行 vs 超时
      result = await Promise.race([
        executionPromise,
        timeoutPromise,
      ])

      // 清除超时
      if (timeoutId) clearTimeout(timeoutId)

      // 标记完成
      queue.complete(task.id, result)
      emitter.emit("taskCompleted", worker, task, result)
    } catch (error) {
      // 清除超时
      if (timeoutId) clearTimeout(timeoutId)

      const errorMessage = error instanceof Error ? error.message : String(error)

      // 检查是否是取消
      if (task.abortController?.signal.aborted) {
        result = {
          success: false,
          error: "Task cancelled",
        }
      } else {
        result = {
          success: false,
          error: errorMessage,
        }
      }

      queue.complete(task.id, result)
      emitter.emit("taskFailed", worker, task, error instanceof Error ? error : new Error(errorMessage))
    } finally {
      // 清理会话标记
      runningSessions.delete(task.sessionId)

      // 重置 worker 状态
      worker.status = shuttingDown ? "stopping" : "idle"
      worker.currentTask = undefined
      worker.startedAt = undefined

      emitter.emit("workerIdle", worker)

      // 检查是否所有 worker 都空闲
      if (workers.every((w) => w.status === "idle" || w.status === "stopping")) {
        emitter.emit("poolIdle")
      }

      // 继续调度
      if (!shuttingDown) {
        scheduleNext()
      }
    }
  }

  /**
   * 停止 Pool（等待当前任务完成）
   */
  async function stop(): Promise<void> {
    if (!running) return

    shuttingDown = true

    // 移除队列监听
    queue.off("enqueued", scheduleNext)

    // 等待所有 worker 完成
    const busyWorkers = workers.filter((w) => w.status === "busy")
    if (busyWorkers.length > 0) {
      await new Promise<void>((resolve) => {
        const checkIdle = () => {
          if (workers.every((w) => w.status !== "busy")) {
            emitter.off("workerIdle", checkIdle)
            resolve()
          }
        }
        emitter.on("workerIdle", checkIdle)
      })
    }

    running = false
    shuttingDown = false

    // 重置所有 worker 状态
    for (const worker of workers) {
      worker.status = "idle"
    }
  }

  /**
   * 强制停止（取消所有任务）
   */
  async function forceStop(): Promise<void> {
    if (!running) return

    shuttingDown = true

    // 移除队列监听
    queue.off("enqueued", scheduleNext)

    // 取消所有正在执行的任务
    for (const worker of workers) {
      if (worker.currentTask) {
        worker.currentTask.abortController?.abort()
      }
    }

    // 清空队列
    queue.clear()

    // 等待所有 worker 完成
    const busyWorkers = workers.filter((w) => w.status === "busy")
    if (busyWorkers.length > 0) {
      await new Promise<void>((resolve) => {
        const checkIdle = () => {
          if (workers.every((w) => w.status !== "busy")) {
            emitter.off("workerIdle", checkIdle)
            resolve()
          }
        }
        emitter.on("workerIdle", checkIdle)
      })
    }

    running = false
    shuttingDown = false

    // 重置所有 worker 状态
    for (const worker of workers) {
      worker.status = "idle"
    }
  }

  /**
   * 获取活跃 worker 数
   */
  function getActiveWorkers(): number {
    return workers.filter((w) => w.status === "busy").length
  }

  /**
   * 获取所有 worker 状态
   */
  function getWorkers(): Worker[] {
    return workers.map((w) => ({ ...w }))
  }

  /**
   * 获取 Pool 状态
   */
  function getStatus(): {
    running: boolean
    shuttingDown: boolean
    activeWorkers: number
    totalWorkers: number
    runningSessions: number
    queueLength: number
  } {
    return {
      running,
      shuttingDown,
      activeWorkers: getActiveWorkers(),
      totalWorkers: maxWorkers,
      runningSessions: runningSessions.size,
      queueLength: queue.getQueueLength(),
    }
  }

  /**
   * 是否正在运行
   */
  function isRunning(): boolean {
    return running
  }

  /**
   * 注册事件监听器
   */
  function on<K extends keyof PoolEvents>(event: K, listener: PoolEvents[K]): void {
    emitter.on(event, listener as (...args: unknown[]) => void)
  }

  /**
   * 移除事件监听器
   */
  function off<K extends keyof PoolEvents>(event: K, listener: PoolEvents[K]): void {
    emitter.off(event, listener as (...args: unknown[]) => void)
  }

  return {
    start,
    stop,
    forceStop,
    getActiveWorkers,
    getWorkers,
    getStatus,
    isRunning,
    on,
    off,
  }
}

export type WorkerPool = ReturnType<typeof createWorkerPool>
