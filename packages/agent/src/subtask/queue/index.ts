/**
 * 任务队列模块
 *
 * 提供串行执行队列、优先级支持和取消/暂停机制
 */

export {
  type QueuedTask,
  type ExecutorStatus,
  type ExecutorEvent,
  type ExecutorEventListener,
  type TaskExecutorConfig,
  TaskExecutor,
  createTaskExecutor,
} from "./executor"
