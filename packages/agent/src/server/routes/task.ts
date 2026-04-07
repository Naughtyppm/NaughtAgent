/**
 * 任务相关路由 handler
 */

import type { IncomingMessage, ServerResponse } from "http"
import type {
  ServerConfig,
  ActiveSession,
  TaskResponse,
  TaskListResponse,
  SubmitTaskRequest,
} from "../types"
import { sendError, sendJson, parseBody } from "../middleware"
import { createRunner, type RunnerEventHandlers } from "../../cli/runner"
import {
  type createDaemonSessionManager,
  type Scheduler,
  type Task,
  type TaskResult,
} from "../../daemon"
import { executeSkill, hasSkill } from "../../skill"

/**
 * 创建任务执行器
 */
export function createTaskExecutor(
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>,
  config: ServerConfig
) {
  return async (task: Task, abortSignal: AbortSignal): Promise<TaskResult> => {
    let session = sessions.get(task.sessionId)

    if (!session) {
      const persistedSession = await daemonSessions.getSession(task.sessionId)

      if (!persistedSession) {
        return {
          success: false,
          error: `Session not found: ${task.sessionId}`,
        }
      }

      const runner = createRunner({
        agentType: persistedSession.agentType,
        cwd: persistedSession.cwd,
        apiKey: config.claudeApiKey,
        baseURL: config.claudeBaseURL,
      })

      session = {
        id: persistedSession.id,
        createdAt: new Date(persistedSession.createdAt),
        agentType: persistedSession.agentType,
        cwd: persistedSession.cwd,
        runner,
      }

      sessions.set(task.sessionId, session)
    }

    const runner = session.runner as ReturnType<typeof createRunner>

    switch (task.type) {
      case "message":
        return executeMessageTask(runner, task, abortSignal, session, daemonSessions)

      case "skill":
        return executeSkillTask(task, config)

      case "subtask":
        return executeMessageTask(runner, task, abortSignal, session, daemonSessions)

      default:
        return {
          success: false,
          error: `Unknown task type: ${task.type}`,
        }
    }
  }
}

/**
 * 执行消息任务
 */
async function executeMessageTask(
  runner: ReturnType<typeof createRunner>,
  task: Task,
  abortSignal: AbortSignal,
  session: ActiveSession,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>
): Promise<TaskResult> {
  const message = task.input.message

  if (!message) {
    return {
      success: false,
      error: "Message is required",
    }
  }

  let output = ""
  let usage = { inputTokens: 0, outputTokens: 0 }
  let error: string | undefined

  const handlers: RunnerEventHandlers = {
    onTextDelta: (delta) => {
      output += delta
    },
    onDone: (u) => {
      usage = u
    },
    onError: (err) => {
      error = err.message
    },
  }

  try {
    if (abortSignal.aborted) {
      return {
        success: false,
        error: "Task cancelled",
      }
    }

    await runner.run(message, handlers)

    const internalSession = runner.getSession()
    if (internalSession) {
      await daemonSessions.updateSession(session.id, {
        messageCount: internalSession.messages.length,
      })
    }

    if (error) {
      return {
        success: false,
        output,
        error,
        usage,
      }
    }

    return {
      success: true,
      output,
      usage,
    }
  } catch (err) {
    return {
      success: false,
      output,
      error: err instanceof Error ? err.message : String(err),
      usage,
    }
  }
}

/**
 * 执行技能任务
 */
async function executeSkillTask(
  task: Task,
  config: ServerConfig
): Promise<TaskResult> {
  const skillName = task.input.skill

  if (!skillName) {
    return {
      success: false,
      error: "Skill name is required",
    }
  }

  if (!hasSkill(skillName)) {
    return {
      success: false,
      error: `Skill not found: ${skillName}`,
    }
  }

  try {
    const args = task.input.args
      ? Object.values(task.input.args).map(String)
      : []

    const result = await executeSkill(skillName, args, {
      cwd: process.cwd(),
      apiKey: config.claudeApiKey,
      baseURL: config.claudeBaseURL,
    })

    return {
      success: result.success,
      output: result.output,
      error: result.error,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * 列出任务
 */
export function handleListTasks(
  res: ServerResponse,
  scheduler: Scheduler,
  sessionId?: string,
  status?: string
): void {
  const filter: { sessionId?: string; status?: Task["status"] } = {}

  if (sessionId) {
    filter.sessionId = sessionId
  }

  if (status && ["queued", "running", "completed", "failed", "cancelled"].includes(status)) {
    filter.status = status as Task["status"]
  }

  const tasks = scheduler.listTasks(filter)
  const stats = scheduler.getStats()

  const response: TaskListResponse = {
    tasks: tasks.map(formatTaskResponse),
    stats: {
      queued: stats.queued,
      running: stats.executing,
      completed: stats.completed,
      failed: stats.failed,
      cancelled: stats.cancelled,
      total: stats.total,
    },
  }

  sendJson(res, 200, response)
}

/**
 * 提交任务
 */
export async function handleSubmitTask(
  req: IncomingMessage,
  res: ServerResponse,
  scheduler: Scheduler
): Promise<void> {
  const body = await parseBody<SubmitTaskRequest>(req)

  if (!body.sessionId) {
    sendError(res, 400, "BAD_REQUEST", "sessionId is required")
    return
  }

  const type = body.type || "message"

  if (type === "message" && !body.message) {
    sendError(res, 400, "BAD_REQUEST", "message is required for message tasks")
    return
  }

  if (type === "skill" && !body.skill) {
    sendError(res, 400, "BAD_REQUEST", "skill is required for skill tasks")
    return
  }

  try {
    let task: Task

    switch (type) {
      case "message":
        task = scheduler.submitMessage(
          body.sessionId,
          body.message!,
          undefined,
          {
            priority: body.priority,
            timeout: body.timeout,
          }
        )
        break

      case "skill":
        task = scheduler.submitSkill(
          body.sessionId,
          body.skill!,
          body.args,
          {
            priority: body.priority,
            timeout: body.timeout,
          }
        )
        break

      case "subtask":
        task = scheduler.submitSubtask(
          body.sessionId,
          {
            message: body.message,
            skill: body.skill,
            args: body.args,
          },
          {
            priority: body.priority,
            timeout: body.timeout,
          }
        )
        break

      default:
        sendError(res, 400, "BAD_REQUEST", `Invalid task type: ${type}`)
        return
    }

    sendJson(res, 201, formatTaskResponse(task))
  } catch (err) {
    if (err instanceof Error && err.message.includes("Queue is full")) {
      sendError(res, 503, "QUEUE_FULL", err.message)
    } else {
      throw err
    }
  }
}

/**
 * 获取任务
 */
export function handleGetTask(
  res: ServerResponse,
  taskId: string,
  scheduler: Scheduler
): void {
  const task = scheduler.getTask(taskId)

  if (!task) {
    sendError(res, 404, "TASK_NOT_FOUND", `Task not found: ${taskId}`)
    return
  }

  sendJson(res, 200, formatTaskResponse(task))
}

/**
 * 取消任务
 */
export function handleCancelTask(
  res: ServerResponse,
  taskId: string,
  scheduler: Scheduler
): void {
  const task = scheduler.getTask(taskId)

  if (!task) {
    sendError(res, 404, "TASK_NOT_FOUND", `Task not found: ${taskId}`)
    return
  }

  const cancelled = scheduler.cancel(taskId)

  if (!cancelled) {
    sendError(res, 400, "BAD_REQUEST", "Task cannot be cancelled (already completed or cancelled)")
    return
  }

  const updatedTask = scheduler.getTask(taskId)
  sendJson(res, 200, formatTaskResponse(updatedTask || task))
}

/**
 * 格式化任务响应
 */
function formatTaskResponse(task: Task): TaskResponse {
  return {
    id: task.id,
    sessionId: task.sessionId,
    status: task.status,
    priority: task.priority,
    type: task.type,
    createdAt: new Date(task.createdAt).toISOString(),
    startedAt: task.startedAt ? new Date(task.startedAt).toISOString() : undefined,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : undefined,
    result: task.result
      ? {
          success: task.result.success,
          output: task.result.output,
          error: task.result.error,
        }
      : undefined,
  }
}
