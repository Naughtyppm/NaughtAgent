/**
 * 任务调度器
 *
 * 整合任务队列和 Worker Pool，提供统一的任务管理接口：
 * - 提交任务
 * - 查询任务状态
 * - 取消任务
 * - 监控统计
 */

import { EventEmitter } from "events"
import {
  createTaskQueue,
  TaskPriority,
  type Task,
  type TaskInput,
  type TaskResult,
  type TaskStatus,
  type TaskType,
  type TaskQueue,
} from "./queue"
import {
  createWorkerPool,
  type TaskExecutor,
  type WorkerPool,
  type Worker,
} from "./pool"

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 调度器配置
 */
export interface SchedulerConfig {
  /** 最大并行任务数，默认 3 */
  maxConcurrentTasks?: number
  /** 最大队列长度，默认 100 */
  maxQueueSize?: number
  /** 默认任务超时（ms），默认 300000 (5分钟) */
  defaultTimeout?: number
  /** 任务执行器 */
  executor: TaskExecutor
  /** 清理间隔（ms），默认 3600000 (1小时) */
  cleanupInterval?: number
  /** 任务最大保留时间（ms），默认 3600000 (1小时) */
  taskMaxAge?: number
}

/**
 * 提交任务选项
 */
export interface SubmitOptions {
  /** 优先级 */
  priority?: TaskPriority | number
  /** 超时时间（ms） */
  timeout?: number
}

/**
 * 调度器事件
 */
export interface SchedulerEvents {
  /** 任务提交 */
  taskSubmitted: (task: Task) => void
  /** 任务开始 */
  taskStarted: (task: Task) => void
  /** 任务完成 */
  taskCompleted: (task: Task, result: TaskResult) => void
  /** 任务失败 */
  taskFailed: (task: Task, error: Error) => void
  /** 任务取消 */
  taskCancelled: (task: Task) => void
  /** 调度器启动 */
  started: () => void
  /** 调度器停止 */
  stopped: () => void
}

/**
 * 调度器统计
 */
export interface SchedulerStats {
  /** 是否运行中 */
  running: boolean
  /** 队列中的任务数 */
  queued: number
  /** 执行中的任务数 */
  executing: number
  /** 已完成的任务数 */
  completed: number
  /** 失败的任务数 */
  failed: number
  /** 已取消的任务数 */
  cancelled: number
  /** 总任务数 */
  total: number
  /** 活跃 Worker 数 */
  activeWorkers: number
  /** 总 Worker 数 */
  totalWorkers: number
}

// ============================================================================
// 调度器实现
// ============================================================================

/**
 * 创建任务调度器
 */
export function createScheduler(config: SchedulerConfig) {
  const {
    maxConcurrentTasks = 3,
    maxQueueSize = 100,
    defaultTimeout = 300000,
    executor,
    cleanupInterval = 3600000,
    taskMaxAge = 3600000,
  } = config

  // 事件发射器
  const emitter = new EventEmitter()

  // 创建任务队列
  const queue: TaskQueue = createTaskQueue({
    maxSize: maxQueueSize,
    defaultTimeout,
  })

  // 创建 Worker Pool
  const pool: WorkerPool = createWorkerPool({
    maxWorkers: maxConcurrentTasks,
    executor,
    queue,
  })

  // 清理定时器
  let cleanupTimer: NodeJS.Timeout | null = null

  // 是否已启动
  let started = false

  /**
   * 设置事件转发
   */
  function setupEventForwarding(): void {
    // 队列事件
    queue.on("enqueued", (task) => {
      emitter.emit("taskSubmitted", task)
    })

    queue.on("cancelled", (task) => {
      emitter.emit("taskCancelled", task)
    })

    // Pool 事件
    pool.on("taskStarted", (_worker, task) => {
      emitter.emit("taskStarted", task)
    })

    pool.on("taskCompleted", (_worker, task, result) => {
      emitter.emit("taskCompleted", task, result)
    })

    pool.on("taskFailed", (_worker, task, error) => {
      emitter.emit("taskFailed", task, error)
    })
  }

  /**
   * 启动调度器
   */
  function start(): void {
    if (started) return

    setupEventForwarding()
    pool.start()

    // 启动定期清理
    cleanupTimer = setInterval(() => {
      queue.cleanup(taskMaxAge)
    }, cleanupInterval)

    started = true
    emitter.emit("started")
  }

  /**
   * 停止调度器（等待当前任务完成）
   */
  async function stop(): Promise<void> {
    if (!started) return

    // 停止清理定时器
    if (cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }

    // 停止 Pool
    await pool.stop()

    started = false
    emitter.emit("stopped")
  }

  /**
   * 强制停止调度器（取消所有任务）
   */
  async function forceStop(): Promise<void> {
    if (!started) return

    // 停止清理定时器
    if (cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }

    // 强制停止 Pool
    await pool.forceStop()

    started = false
    emitter.emit("stopped")
  }

  /**
   * 提交消息任务
   */
  function submitMessage(
    sessionId: string,
    message: string,
    context?: TaskInput["context"],
    options?: SubmitOptions
  ): Task {
    return queue.enqueue(
      sessionId,
      "message",
      { message, context },
      {
        priority: options?.priority ?? TaskPriority.HIGH,
        timeout: options?.timeout,
      }
    )
  }

  /**
   * 提交技能任务
   */
  function submitSkill(
    sessionId: string,
    skill: string,
    args?: Record<string, unknown>,
    options?: SubmitOptions
  ): Task {
    return queue.enqueue(
      sessionId,
      "skill",
      { skill, args },
      {
        priority: options?.priority ?? TaskPriority.NORMAL,
        timeout: options?.timeout,
      }
    )
  }

  /**
   * 提交子任务
   */
  function submitSubtask(
    sessionId: string,
    input: TaskInput,
    options?: SubmitOptions
  ): Task {
    return queue.enqueue(sessionId, "subtask", input, {
      priority: options?.priority ?? TaskPriority.LOW,
      timeout: options?.timeout,
    })
  }

  /**
   * 提交通用任务
   */
  function submit(
    sessionId: string,
    type: TaskType,
    input: TaskInput,
    options?: SubmitOptions
  ): Task {
    return queue.enqueue(sessionId, type, input, {
      priority: options?.priority,
      timeout: options?.timeout,
    })
  }

  /**
   * 取消任务
   */
  function cancel(taskId: string): boolean {
    return queue.cancel(taskId)
  }

  /**
   * 取消会话的所有任务
   */
  function cancelSession(sessionId: string): number {
    return queue.cancelSession(sessionId)
  }

  /**
   * 获取任务
   */
  function getTask(taskId: string): Task | null {
    return queue.getTask(taskId)
  }

  /**
   * 列出任务
   */
  function listTasks(filter?: {
    sessionId?: string
    status?: TaskStatus
    type?: TaskType
  }): Task[] {
    return queue.listTasks(filter)
  }

  /**
   * 获取会话的任务
   */
  function getSessionTasks(sessionId: string): Task[] {
    return queue.listTasks({ sessionId })
  }

  /**
   * 获取统计信息
   */
  function getStats(): SchedulerStats {
    const queueStatus = queue.getStatus()
    const poolStatus = pool.getStatus()

    return {
      running: started,
      queued: queueStatus.queued,
      executing: queueStatus.running,
      completed: queueStatus.completed,
      failed: queueStatus.failed,
      cancelled: queueStatus.cancelled,
      total: queueStatus.total,
      activeWorkers: poolStatus.activeWorkers,
      totalWorkers: poolStatus.totalWorkers,
    }
  }

  /**
   * 获取 Worker 状态
   */
  function getWorkers(): Worker[] {
    return pool.getWorkers()
  }

  /**
   * 是否正在运行
   */
  function isRunning(): boolean {
    return started
  }

  /**
   * 手动触发清理
   */
  function cleanup(): number {
    return queue.cleanup(taskMaxAge)
  }

  /**
   * 注册事件监听器
   */
  function on<K extends keyof SchedulerEvents>(
    event: K,
    listener: SchedulerEvents[K]
  ): void {
    emitter.on(event, listener as (...args: unknown[]) => void)
  }

  /**
   * 移除事件监听器
   */
  function off<K extends keyof SchedulerEvents>(
    event: K,
    listener: SchedulerEvents[K]
  ): void {
    emitter.off(event, listener as (...args: unknown[]) => void)
  }

  /**
   * 一次性事件监听
   */
  function once<K extends keyof SchedulerEvents>(
    event: K,
    listener: SchedulerEvents[K]
  ): void {
    emitter.once(event, listener as (...args: unknown[]) => void)
  }

  return {
    // 生命周期
    start,
    stop,
    forceStop,
    isRunning,

    // 任务提交
    submit,
    submitMessage,
    submitSkill,
    submitSubtask,

    // 任务管理
    cancel,
    cancelSession,
    getTask,
    listTasks,
    getSessionTasks,

    // 状态查询
    getStats,
    getWorkers,
    cleanup,

    // 事件
    on,
    off,
    once,
  }
}

export type Scheduler = ReturnType<typeof createScheduler>

// 重新导出类型
export { TaskPriority, type Task, type TaskResult, type TaskStatus, type TaskType }
