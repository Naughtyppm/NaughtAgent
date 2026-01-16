/**
 * 任务队列
 *
 * 优先级队列实现，支持：
 * - 按优先级排序（数字越小越优先）
 * - 任务状态管理
 * - 任务取消
 * - 超时处理
 */

import { EventEmitter } from "events"

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 任务状态
 */
export type TaskStatus =
  | "queued" // 排队中
  | "running" // 执行中
  | "completed" // 已完成
  | "failed" // 失败
  | "cancelled" // 已取消

/**
 * 任务优先级
 */
export enum TaskPriority {
  /** 最高优先级 - 用户交互任务 */
  HIGH = 0,
  /** 中等优先级 - 技能任务 */
  NORMAL = 10,
  /** 低优先级 - 后台任务 */
  LOW = 20,
}

/**
 * 任务类型
 */
export type TaskType = "message" | "skill" | "subtask"

/**
 * 任务输入
 */
export interface TaskInput {
  /** 用户消息 */
  message?: string
  /** 技能名称 */
  skill?: string
  /** 技能参数 */
  args?: Record<string, unknown>
  /** 上下文 */
  context?: {
    files?: string[]
    selection?: string
  }
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * 任务结果
 */
export interface TaskResult {
  /** 是否成功 */
  success: boolean
  /** 输出内容 */
  output?: string
  /** 错误信息 */
  error?: string
  /** Token 使用 */
  usage?: TokenUsage
}

/**
 * 任务定义
 */
export interface Task {
  /** 任务 ID */
  id: string
  /** 所属会话 ID */
  sessionId: string
  /** 任务状态 */
  status: TaskStatus
  /** 优先级（数字越小越优先） */
  priority: number
  /** 任务类型 */
  type: TaskType
  /** 任务输入 */
  input: TaskInput
  /** 创建时间 */
  createdAt: number
  /** 开始执行时间 */
  startedAt?: number
  /** 完成时间 */
  completedAt?: number
  /** 执行结果 */
  result?: TaskResult
  /** 超时时间（ms） */
  timeout?: number
  /** 取消信号 */
  abortController?: AbortController
}

/**
 * 队列事件
 */
export interface QueueEvents {
  /** 任务入队 */
  enqueued: (task: Task) => void
  /** 任务开始执行 */
  started: (task: Task) => void
  /** 任务完成 */
  completed: (task: Task) => void
  /** 任务失败 */
  failed: (task: Task, error: Error) => void
  /** 任务取消 */
  cancelled: (task: Task) => void
  /** 队列为空 */
  empty: () => void
}

/**
 * 队列配置
 */
export interface QueueConfig {
  /** 最大队列长度，默认 100 */
  maxSize?: number
  /** 默认任务超时（ms），默认 300000 (5分钟) */
  defaultTimeout?: number
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成任务 ID
 */
function generateTaskId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `task-${timestamp}-${random}`
}

// ============================================================================
// 任务队列实现
// ============================================================================

/**
 * 创建任务队列
 */
export function createTaskQueue(config: QueueConfig = {}) {
  const { maxSize = 100, defaultTimeout = 300000 } = config

  // 事件发射器
  const emitter = new EventEmitter()

  // 队列存储（按优先级排序）
  const queue: Task[] = []

  // 所有任务索引（包括已完成的）
  const tasks = new Map<string, Task>()

  // 按会话分组的任务
  const sessionTasks = new Map<string, Set<string>>()

  /**
   * 添加任务到队列
   */
  function enqueue(
    sessionId: string,
    type: TaskType,
    input: TaskInput,
    options: {
      priority?: number
      timeout?: number
    } = {}
  ): Task {
    if (queue.length >= maxSize) {
      throw new Error(`Queue is full (max: ${maxSize})`)
    }

    const task: Task = {
      id: generateTaskId(),
      sessionId,
      status: "queued",
      priority: options.priority ?? TaskPriority.NORMAL,
      type,
      input,
      createdAt: Date.now(),
      timeout: options.timeout ?? defaultTimeout,
      abortController: new AbortController(),
    }

    // 添加到索引
    tasks.set(task.id, task)

    // 添加到会话任务集合
    let sessionTaskSet = sessionTasks.get(sessionId)
    if (!sessionTaskSet) {
      sessionTaskSet = new Set()
      sessionTasks.set(sessionId, sessionTaskSet)
    }
    sessionTaskSet.add(task.id)

    // 按优先级插入队列
    insertByPriority(task)

    emitter.emit("enqueued", task)

    return task
  }

  /**
   * 按优先级插入队列
   */
  function insertByPriority(task: Task): void {
    // 找到第一个优先级比当前任务低的位置
    let insertIndex = queue.length
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].priority > task.priority) {
        insertIndex = i
        break
      }
    }
    queue.splice(insertIndex, 0, task)
  }

  /**
   * 获取下一个待执行的任务
   *
   * @param excludeSessionIds 排除的会话 ID（这些会话已有任务在执行）
   */
  function dequeue(excludeSessionIds?: Set<string>): Task | null {
    for (let i = 0; i < queue.length; i++) {
      const task = queue[i]

      // 跳过已排除会话的任务（同一会话只能有一个任务执行）
      if (excludeSessionIds?.has(task.sessionId)) {
        continue
      }

      // 从队列移除
      queue.splice(i, 1)

      // 更新状态
      task.status = "running"
      task.startedAt = Date.now()

      emitter.emit("started", task)

      return task
    }

    return null
  }

  /**
   * 标记任务完成
   */
  function complete(taskId: string, result: TaskResult): boolean {
    const task = tasks.get(taskId)
    if (!task || task.status !== "running") {
      return false
    }

    task.status = result.success ? "completed" : "failed"
    task.completedAt = Date.now()
    task.result = result

    if (result.success) {
      emitter.emit("completed", task)
    } else {
      emitter.emit("failed", task, new Error(result.error || "Unknown error"))
    }

    // 检查队列是否为空
    if (queue.length === 0) {
      emitter.emit("empty")
    }

    return true
  }

  /**
   * 取消任务
   */
  function cancel(taskId: string): boolean {
    const task = tasks.get(taskId)
    if (!task) {
      return false
    }

    // 只能取消排队中或执行中的任务
    if (task.status !== "queued" && task.status !== "running") {
      return false
    }

    // 触发取消信号
    task.abortController?.abort()

    // 如果在队列中，移除
    const queueIndex = queue.findIndex((t) => t.id === taskId)
    if (queueIndex !== -1) {
      queue.splice(queueIndex, 1)
    }

    task.status = "cancelled"
    task.completedAt = Date.now()
    task.result = {
      success: false,
      error: "Task cancelled",
    }

    emitter.emit("cancelled", task)

    return true
  }

  /**
   * 取消会话的所有任务
   */
  function cancelSession(sessionId: string): number {
    const taskIds = sessionTasks.get(sessionId)
    if (!taskIds) {
      return 0
    }

    let cancelled = 0
    for (const taskId of taskIds) {
      if (cancel(taskId)) {
        cancelled++
      }
    }

    return cancelled
  }

  /**
   * 获取任务
   */
  function getTask(taskId: string): Task | null {
    return tasks.get(taskId) || null
  }

  /**
   * 列出任务
   */
  function listTasks(filter?: {
    sessionId?: string
    status?: TaskStatus
    type?: TaskType
  }): Task[] {
    let result = Array.from(tasks.values())

    if (filter?.sessionId) {
      result = result.filter((t) => t.sessionId === filter.sessionId)
    }

    if (filter?.status) {
      result = result.filter((t) => t.status === filter.status)
    }

    if (filter?.type) {
      result = result.filter((t) => t.type === filter.type)
    }

    // 按创建时间倒序
    return result.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 获取队列状态
   */
  function getStatus(): {
    queued: number
    running: number
    completed: number
    failed: number
    cancelled: number
    total: number
  } {
    const status = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: tasks.size,
    }

    for (const task of tasks.values()) {
      status[task.status]++
    }

    return status
  }

  /**
   * 获取队列长度
   */
  function getQueueLength(): number {
    return queue.length
  }

  /**
   * 清理已完成的任务（释放内存）
   */
  function cleanup(maxAge: number = 3600000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [taskId, task] of tasks) {
      // 只清理已完成的任务
      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled"
      ) {
        const age = now - (task.completedAt || task.createdAt)
        if (age > maxAge) {
          tasks.delete(taskId)

          // 从会话任务集合中移除
          const sessionTaskSet = sessionTasks.get(task.sessionId)
          if (sessionTaskSet) {
            sessionTaskSet.delete(taskId)
            if (sessionTaskSet.size === 0) {
              sessionTasks.delete(task.sessionId)
            }
          }

          cleaned++
        }
      }
    }

    return cleaned
  }

  /**
   * 清空队列
   */
  function clear(): void {
    // 取消所有排队中的任务
    for (const task of queue) {
      task.abortController?.abort()
      task.status = "cancelled"
      task.completedAt = Date.now()
      task.result = {
        success: false,
        error: "Queue cleared",
      }
      emitter.emit("cancelled", task)
    }

    queue.length = 0
  }

  /**
   * 注册事件监听器
   */
  function on<K extends keyof QueueEvents>(event: K, listener: QueueEvents[K]): void {
    emitter.on(event, listener as (...args: unknown[]) => void)
  }

  /**
   * 移除事件监听器
   */
  function off<K extends keyof QueueEvents>(event: K, listener: QueueEvents[K]): void {
    emitter.off(event, listener as (...args: unknown[]) => void)
  }

  return {
    enqueue,
    dequeue,
    complete,
    cancel,
    cancelSession,
    getTask,
    listTasks,
    getStatus,
    getQueueLength,
    cleanup,
    clear,
    on,
    off,
  }
}

export type TaskQueue = ReturnType<typeof createTaskQueue>
