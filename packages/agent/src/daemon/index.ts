/**
 * Daemon 模块
 *
 * 后台服务相关功能：
 * - 会话管理
 * - 任务队列
 * - Worker Pool
 * - 调度器
 */

// 会话管理
export {
  createDaemonSessionManager,
  normalizeCwd,
  type DaemonSessionManager,
  type PersistedSession,
} from "./sessions"

// 任务队列
export {
  createTaskQueue,
  TaskPriority,
  type TaskQueue,
  type Task,
  type TaskStatus,
  type TaskType,
  type TaskInput,
  type TaskResult,
  type TokenUsage,
  type QueueConfig,
  type QueueEvents,
} from "./queue"

// Worker Pool
export {
  createWorkerPool,
  type WorkerPool,
  type Worker,
  type WorkerStatus,
  type TaskExecutor,
  type PoolConfig,
  type PoolEvents,
} from "./pool"

// 调度器
export {
  createScheduler,
  type Scheduler,
  type SchedulerConfig,
  type SchedulerEvents,
  type SchedulerStats,
  type SubmitOptions,
} from "./scheduler"
