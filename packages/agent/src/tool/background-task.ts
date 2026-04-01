/**
 * 后台任务管理 - TaskOutput 和 TaskStop 工具
 *
 * 配合 bash 工具的 run_in_background 功能使用。
 * bash 工具启动后台命令后，通过 registerBackgroundTask 注册任务，
 * LLM 使用 TaskOutputTool 查看输出、TaskStopTool 停止任务。
 */

import { z } from "zod"
import { Tool } from "./tool"

// ─── 后台任务数据结构 ─────────────────────────────

export interface BackgroundTask {
  /** 任务 ID（由 bash 工具生成） */
  id: string
  /** 执行的命令 */
  command: string
  /** 累积输出（stdout + stderr） */
  output: string
  /** 任务状态 */
  status: "running" | "completed" | "failed"
  /** 退出码（仅完成/失败时有值） */
  exitCode?: number
  /** 启动时间戳（ms） */
  startTime: number
  /** 停止回调（由 bash 工具在注册时提供） */
  kill?: () => void
  /** 完成 Promise（用于 block=true 的等待） */
  completion?: Promise<void>
}

// ─── 任务注册表（module-level 单例） ─────────────────

const tasks = new Map<string, BackgroundTask>()

/**
 * 注册一个后台任务
 * 由 bash 工具在启动后台命令时调用
 */
export function registerBackgroundTask(task: BackgroundTask): void {
  tasks.set(task.id, task)
}

/**
 * 更新后台任务的部分字段
 * 由 bash 工具在任务状态变化时调用
 */
export function updateBackgroundTask(
  id: string,
  update: Partial<BackgroundTask>
): void {
  const task = tasks.get(id)
  if (task) {
    Object.assign(task, update)
  }
}

/**
 * 追加任务输出
 * 由 bash 工具在收到 stdout/stderr 数据时调用
 */
export function appendTaskOutput(id: string, chunk: string): void {
  const task = tasks.get(id)
  if (task) {
    task.output += chunk
  }
}

/**
 * 获取后台任务（内部使用）
 */
export function getBackgroundTask(id: string): BackgroundTask | undefined {
  return tasks.get(id)
}

/**
 * 获取所有后台任务（用于调试/列表）
 */
export function getAllBackgroundTasks(): BackgroundTask[] {
  return Array.from(tasks.values())
}

// ─── TaskOutput 工具 ────────────────────────────────

const TASK_OUTPUT_DESCRIPTION = `Get the output of a background task started with bash's run_in_background.

Use this to check progress or get results of background commands.
- block=true (default): waits for the task to complete, then returns full output
- block=false: returns immediately with whatever output is available so far
- timeout: max wait time in ms when blocking (default 30000)`

export const TaskOutputTool = Tool.define(
  {
    id: "task_output",
    description: TASK_OUTPUT_DESCRIPTION,
    parameters: z.object({
      task_id: z.string().describe("The ID of the background task"),
      block: z
        .boolean()
        .default(true)
        .describe("Whether to wait for task completion (default true)"),
      timeout: z
        .number()
        .default(30_000)
        .describe("Max wait time in milliseconds when blocking (default 30000)"),
    }),

    // 只读 + 并发安全：不修改文件系统，可与其他工具并行
    isConcurrencySafe: true,
    isReadOnly: true,

    async execute(params, _ctx) {
      const { task_id, block, timeout } = params
      const task = tasks.get(task_id)

      if (!task) {
        // 列出可用的任务 ID 帮助 LLM 纠正
        const available = Array.from(tasks.keys())
        const hint =
          available.length > 0
            ? `\nAvailable task IDs: ${available.join(", ")}`
            : "\nNo background tasks registered."
        return {
          title: "task_output",
          output: `Error: No background task found with ID "${task_id}".${hint}`,
          isError: true,
        }
      }

      // 非阻塞模式：立即返回当前输出
      if (!block) {
        return {
          title: `task_output [${task_id}]`,
          output: formatTaskOutput(task),
          metadata: {
            taskId: task_id,
            status: task.status,
            exitCode: task.exitCode,
          },
        }
      }

      // 阻塞模式：等待任务完成（或超时）
      if (task.status === "running" && task.completion) {
        // 用 Promise.race 实现超时等待
        const timeoutPromise = new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), timeout)
        )

        const result = await Promise.race([
          task.completion.then(() => "done" as const),
          timeoutPromise,
        ])

        if (result === "timeout") {
          return {
            title: `task_output [${task_id}]`,
            output:
              formatTaskOutput(task) +
              `\n\n[Timed out waiting after ${timeout}ms. Task is still running. Use block=false to check later.]`,
            metadata: {
              taskId: task_id,
              status: task.status,
              timedOut: true,
            },
          }
        }
      }

      // 任务已完成（或等待后完成）
      return {
        title: `task_output [${task_id}]`,
        output: formatTaskOutput(task),
        metadata: {
          taskId: task_id,
          status: task.status,
          exitCode: task.exitCode,
        },
      }
    },
  },
  {
    // TaskOutput 自身不需要超时控制（内部有 timeout 参数）
    enableTimeout: false,
  }
)

// ─── TaskStop 工具 ─────────────────────────────────

const TASK_STOP_DESCRIPTION = `Stop a background task that was started with bash's run_in_background.

Use this to terminate a long-running background command that is no longer needed.`

export const TaskStopTool = Tool.define({
  id: "task_stop",
  description: TASK_STOP_DESCRIPTION,
  parameters: z.object({
    task_id: z.string().describe("The ID of the background task to stop"),
  }),

  async execute(params, _ctx) {
    const { task_id } = params
    const task = tasks.get(task_id)

    if (!task) {
      const available = Array.from(tasks.keys())
      const hint =
        available.length > 0
          ? `\nAvailable task IDs: ${available.join(", ")}`
          : "\nNo background tasks registered."
      return {
        title: "task_stop",
        output: `Error: No background task found with ID "${task_id}".${hint}`,
        isError: true,
      }
    }

    // 已经不在运行
    if (task.status !== "running") {
      return {
        title: `task_stop [${task_id}]`,
        output: `Task "${task_id}" is already ${task.status} (exit code: ${task.exitCode ?? "N/A"}).`,
        metadata: {
          taskId: task_id,
          status: task.status,
          exitCode: task.exitCode,
        },
      }
    }

    // 执行停止
    if (task.kill) {
      task.kill()
      task.status = "failed"
      const elapsed = Date.now() - task.startTime
      return {
        title: `task_stop [${task_id}]`,
        output: `Task "${task_id}" has been stopped.\nCommand: ${task.command}\nRan for: ${formatDuration(elapsed)}`,
        metadata: {
          taskId: task_id,
          status: "failed",
          elapsed,
        },
      }
    }

    // kill 回调不可用（不应发生，但做防御性处理）
    return {
      title: `task_stop [${task_id}]`,
      output: `Warning: Task "${task_id}" has no kill handler. Cannot stop it programmatically.`,
      isError: true,
    }
  },
})

// ─── 辅助函数 ──────────────────────────────────────

/**
 * 格式化任务输出（包含状态头信息）
 */
function formatTaskOutput(task: BackgroundTask): string {
  const elapsed = Date.now() - task.startTime
  const lines: string[] = []

  // 状态行
  if (task.status === "running") {
    lines.push(`[Task ${task.id}: running for ${formatDuration(elapsed)}]`)
  } else if (task.status === "completed") {
    lines.push(
      `[Task ${task.id}: completed in ${formatDuration(elapsed)} (exit code: ${task.exitCode})]`
    )
  } else {
    lines.push(
      `[Task ${task.id}: failed after ${formatDuration(elapsed)} (exit code: ${task.exitCode ?? "N/A"})]`
    )
  }

  // 命令
  lines.push(`[Command: ${task.command}]`)
  lines.push("")

  // 输出内容
  if (task.output) {
    lines.push(task.output)
  } else {
    lines.push("(no output yet)")
  }

  return lines.join("\n")
}

/**
 * 格式化持续时间为人类可读文本
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  return `${minutes}m${remainSeconds}s`
}
