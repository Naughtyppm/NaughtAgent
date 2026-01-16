/**
 * API 路由处理
 *
 * 处理 HTTP 请求，调用 Runner 执行 Agent
 */

import type { IncomingMessage, ServerResponse } from "http"
import type {
  ServerConfig,
  CreateSessionRequest,
  SessionResponse,
  SendMessageRequest,
  MessageResponse,
  ToolCallRecord,
  StreamEvent,
  ExecuteSkillRequest,
  SkillResponse,
  HealthResponse,
  ActiveSession,
  TaskResponse,
  TaskListResponse,
  SubmitTaskRequest,
} from "./types"
import {
  sendError,
  sendJson,
  parseBody,
  matchRoute,
  parseQueryString,
} from "./middleware"
import { createRunner, type RunnerEventHandlers } from "../cli/runner"
import { executeSkill, hasSkill, listSkills } from "../skill"
import {
  createDaemonSessionManager,
  createScheduler,
  type Scheduler,
  type Task,
  type TaskResult,
} from "../daemon"
import type { AgentType } from "../agent"

// ============================================================================
// Routes Handler
// ============================================================================

/**
 * 创建路由处理器
 */
export function createRoutes(config: ServerConfig) {
  const sessions = new Map<string, ActiveSession>()
  const daemonSessions = createDaemonSessionManager()

  // 初始化 daemon 会话管理器
  daemonSessions.initialize().catch((err) => {
    console.error("Failed to initialize daemon sessions:", err)
  })

  // 创建任务调度器
  const scheduler = createScheduler({
    maxConcurrentTasks: 3,
    maxQueueSize: 100,
    defaultTimeout: 300000,
    executor: createTaskExecutor(sessions, daemonSessions, config),
  })

  // 启动调度器
  scheduler.start()

  /**
   * 处理请求
   */
  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const fullUrl = req.url || "/"
    const [urlPath, queryString] = fullUrl.split("?")
    const url = urlPath
    const query = parseQueryString(queryString || "")
    const method = req.method || "GET"

    try {
      // 健康检查
      if (method === "GET" && url === "/health") {
        return handleHealth(res)
      }

      // Daemon 状态
      if (method === "GET" && url === "/daemon/status") {
        return handleDaemonStatus(res, sessions, scheduler)
      }

      // 列出所有会话（支持 ?cwd= 过滤）
      if (method === "GET" && url === "/sessions") {
        return await handleListSessions(res, sessions, daemonSessions, query.cwd)
      }

      // 按 cwd 查找或创建会话
      if (method === "POST" && url === "/sessions/find-or-create") {
        return await handleFindOrCreateSession(req, res, config, sessions, daemonSessions)
      }

      // 会话管理
      if (method === "POST" && url === "/sessions") {
        return await handleCreateSession(req, res, config, sessions, daemonSessions)
      }

      const sessionMatch = matchRoute("/sessions/:id", url)
      if (sessionMatch) {
        if (method === "GET") {
          return handleGetSession(res, sessionMatch.id, sessions)
        }
        if (method === "DELETE") {
          return await handleDeleteSession(res, sessionMatch.id, sessions, daemonSessions, scheduler)
        }
      }

      // 消息发送
      const messageMatch = matchRoute("/sessions/:id/messages", url)
      if (messageMatch && method === "POST") {
        return await handleSendMessage(req, res, messageMatch.id, sessions, daemonSessions, config)
      }

      // ============ 任务 API ============

      // 列出任务
      if (method === "GET" && url === "/tasks") {
        return handleListTasks(res, scheduler, query.sessionId, query.status)
      }

      // 提交任务
      if (method === "POST" && url === "/tasks") {
        return await handleSubmitTask(req, res, scheduler)
      }

      // 获取/取消任务
      const taskMatch = matchRoute("/tasks/:id", url)
      if (taskMatch) {
        if (method === "GET") {
          return handleGetTask(res, taskMatch.id, scheduler)
        }
      }

      // 取消任务
      const cancelMatch = matchRoute("/tasks/:id/cancel", url)
      if (cancelMatch && method === "POST") {
        return handleCancelTask(res, cancelMatch.id, scheduler)
      }

      // ============ 技能 API ============

      // 技能执行
      const skillMatch = matchRoute("/skills/:name", url)
      if (skillMatch && method === "POST") {
        return await handleExecuteSkill(req, res, skillMatch.name, config)
      }

      // 列出技能
      if (method === "GET" && url === "/skills") {
        return handleListSkills(res)
      }

      // 404
      sendError(res, 404, "NOT_FOUND", `Route not found: ${method} ${url}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      sendError(res, 500, "INTERNAL_ERROR", message)
    }
  }

  /**
   * 获取活跃会话
   */
  function getActiveSessions(): Map<string, ActiveSession> {
    return sessions
  }

  /**
   * 清理所有会话
   */
  function clearSessions(): void {
    for (const session of sessions.values()) {
      session.abortController?.abort()
    }
    sessions.clear()
  }

  /**
   * 获取 Daemon 会话管理器
   */
  function getDaemonSessionManager() {
    return daemonSessions
  }

  /**
   * 获取调度器
   */
  function getScheduler(): Scheduler {
    return scheduler
  }

  /**
   * 停止调度器
   */
  async function stopScheduler(): Promise<void> {
    await scheduler.stop()
  }

  return {
    handleRequest,
    getActiveSessions,
    clearSessions,
    getDaemonSessionManager,
    getScheduler,
    stopScheduler,
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * 健康检查
 */
function handleHealth(res: ServerResponse): void {
  const response: HealthResponse = {
    status: "ok",
    version: "0.1.0",
  }
  sendJson(res, 200, response)
}

/**
 * Daemon 状态
 */
function handleDaemonStatus(
  res: ServerResponse,
  sessions: Map<string, ActiveSession>,
  scheduler: Scheduler
): void {
  const stats = scheduler.getStats()
  const response = {
    status: "running",
    version: "0.1.0",
    pid: process.pid,
    uptime: Math.floor(process.uptime()),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    sessions: sessions.size,
    tasks: {
      queued: stats.queued,
      running: stats.executing,
      completed: stats.completed,
      failed: stats.failed,
      cancelled: stats.cancelled,
      total: stats.total,
    },
    workers: {
      active: stats.activeWorkers,
      total: stats.totalWorkers,
    },
  }
  sendJson(res, 200, response)
}

/**
 * 列出所有会话
 */
async function handleListSessions(
  res: ServerResponse,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>,
  filterCwd?: string
): Promise<void> {
  // 获取持久化的会话列表
  const persistedSessions = await daemonSessions.listSessions(filterCwd)

  // 合并活跃会话信息
  const list: SessionResponse[] = persistedSessions.map((ps) => {
    const activeSession = sessions.get(ps.id)
    let messageCount = ps.messageCount

    if (activeSession) {
      const runner = activeSession.runner as ReturnType<typeof createRunner>
      const internalSession = runner.getSession()
      messageCount = internalSession?.messages.length || messageCount
    }

    return {
      id: ps.id,
      createdAt: new Date(ps.createdAt).toISOString(),
      agentType: ps.agentType,
      cwd: ps.cwd,
      messageCount,
      name: ps.name,
      active: sessions.has(ps.id),
    }
  })

  sendJson(res, 200, { sessions: list })
}

/**
 * 按 cwd 查找或创建会话
 */
async function handleFindOrCreateSession(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>
): Promise<void> {
  const body = await parseBody<CreateSessionRequest>(req)
  const cwd = body.cwd || config.defaultCwd || process.cwd()
  const agentType: AgentType = body.agentType || "build"

  // 查找或创建持久化会话
  const persistedSession = await daemonSessions.getOrCreateSession(cwd, agentType)

  // 检查是否已有活跃会话
  let activeSession = sessions.get(persistedSession.id)

  if (!activeSession) {
    // 创建 Runner
    const runner = createRunner({
      agentType: persistedSession.agentType,
      cwd: persistedSession.cwd,
      apiKey: config.claudeApiKey,
      baseURL: config.claudeBaseURL,
      autoConfirm: config.autoConfirm,
    })

    activeSession = {
      id: persistedSession.id,
      createdAt: new Date(persistedSession.createdAt),
      agentType: persistedSession.agentType,
      cwd: persistedSession.cwd,
      runner,
    }

    sessions.set(persistedSession.id, activeSession)
  }

  const response: SessionResponse = {
    id: persistedSession.id,
    createdAt: new Date(persistedSession.createdAt).toISOString(),
    agentType: persistedSession.agentType,
    cwd: persistedSession.cwd,
    messageCount: persistedSession.messageCount,
  }

  sendJson(res, 200, response)
}

/**
 * 创建会话
 */
async function handleCreateSession(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>
): Promise<void> {
  const body = await parseBody<CreateSessionRequest>(req)

  const cwd = body.cwd || config.defaultCwd || process.cwd()
  const agentType: AgentType = body.agentType || "build"

  // 创建持久化会话
  const persistedSession = await daemonSessions.createSession(cwd, agentType)

  // 创建 Runner
  const runner = createRunner({
    agentType,
    cwd: persistedSession.cwd,
    apiKey: config.claudeApiKey,
    baseURL: config.claudeBaseURL,
    autoConfirm: config.autoConfirm,
  })

  const activeSession: ActiveSession = {
    id: persistedSession.id,
    createdAt: new Date(persistedSession.createdAt),
    agentType,
    cwd: persistedSession.cwd,
    runner,
  }

  sessions.set(persistedSession.id, activeSession)

  const response: SessionResponse = {
    id: persistedSession.id,
    createdAt: new Date(persistedSession.createdAt).toISOString(),
    agentType,
    cwd: persistedSession.cwd,
  }

  sendJson(res, 201, response)
}

/**
 * 获取会话
 */
function handleGetSession(
  res: ServerResponse,
  id: string,
  sessions: Map<string, ActiveSession>
): void {
  const session = sessions.get(id)

  if (!session) {
    sendError(res, 404, "SESSION_NOT_FOUND", `Session not found: ${id}`)
    return
  }

  const runner = session.runner as ReturnType<typeof createRunner>
  const internalSession = runner.getSession()

  const response: SessionResponse = {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    agentType: session.agentType,
    cwd: session.cwd,
    messageCount: internalSession?.messages.length || 0,
  }

  sendJson(res, 200, response)
}

/**
 * 删除会话
 */
async function handleDeleteSession(
  res: ServerResponse,
  id: string,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>,
  scheduler: Scheduler
): Promise<void> {
  const session = sessions.get(id)

  // 取消会话的所有任务
  scheduler.cancelSession(id)

  // 中止正在执行的任务
  if (session) {
    session.abortController?.abort()
    sessions.delete(id)
  }

  // 删除持久化会话
  const deleted = await daemonSessions.deleteSession(id)

  if (!session && !deleted) {
    sendError(res, 404, "SESSION_NOT_FOUND", `Session not found: ${id}`)
    return
  }

  res.statusCode = 204
  res.end()
}

/**
 * 发送消息
 */
async function handleSendMessage(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>,
  config: ServerConfig
): Promise<void> {
  let session = sessions.get(sessionId)

  // 如果会话不在内存中，尝试从持久化存储恢复
  if (!session) {
    const persistedSession = await daemonSessions.getSession(sessionId)

    if (!persistedSession) {
      sendError(res, 404, "SESSION_NOT_FOUND", `Session not found: ${sessionId}`)
      return
    }

    // 恢复会话
    const runner = createRunner({
      agentType: persistedSession.agentType,
      cwd: persistedSession.cwd,
      apiKey: config.claudeApiKey,
      baseURL: config.claudeBaseURL,
      autoConfirm: config.autoConfirm,
    })

    session = {
      id: persistedSession.id,
      createdAt: new Date(persistedSession.createdAt),
      agentType: persistedSession.agentType,
      cwd: persistedSession.cwd,
      runner,
    }

    sessions.set(sessionId, session)
  }

  const body = await parseBody<SendMessageRequest>(req)

  if (!body.message) {
    sendError(res, 400, "BAD_REQUEST", "Message is required")
    return
  }

  const runner = session.runner as ReturnType<typeof createRunner>

  if (body.stream) {
    // SSE 流式响应
    await handleStreamMessage(res, runner, body.message, session, daemonSessions)
  } else {
    // 非流式响应
    await handleNonStreamMessage(res, runner, body.message, session, daemonSessions)
  }
}

/**
 * 非流式消息处理
 */
async function handleNonStreamMessage(
  res: ServerResponse,
  runner: ReturnType<typeof createRunner>,
  message: string,
  session: ActiveSession,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>
): Promise<void> {
  let content = ""
  const toolCalls: ToolCallRecord[] = []
  const toolMap = new Map<string, ToolCallRecord>()
  let usage = { inputTokens: 0, outputTokens: 0 }

  const handlers: RunnerEventHandlers = {
    onText: (text) => {
      content += text
    },
    onToolStart: (id, name, input) => {
      const record: ToolCallRecord = { id, name, input, output: "" }
      toolMap.set(id, record)
      toolCalls.push(record)
    },
    onToolEnd: (id, output, isError) => {
      const record = toolMap.get(id)
      if (record) {
        record.output = output
        record.isError = isError
      }
    },
    onDone: (u) => {
      usage = u
    },
    onError: (error) => {
      throw error
    },
  }

  await runner.run(message, handlers)

  // 更新持久化会话的消息数
  const internalSession = runner.getSession()
  if (internalSession) {
    await daemonSessions.updateSession(session.id, {
      messageCount: internalSession.messages.length,
    })
  }

  const response: MessageResponse = {
    content,
    toolCalls,
    usage,
  }

  sendJson(res, 200, response)
}

/**
 * SSE 流式消息处理
 */
async function handleStreamMessage(
  res: ServerResponse,
  runner: ReturnType<typeof createRunner>,
  message: string,
  session: ActiveSession,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>
): Promise<void> {
  // 设置 SSE 头
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.statusCode = 200

  // 创建中止控制器
  const abortController = new AbortController()
  session.abortController = abortController

  const sendEvent = (event: StreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  const handlers: RunnerEventHandlers = {
    onText: (content) => {
      sendEvent({ type: "text", content })
    },
    onToolStart: (id, name, input) => {
      sendEvent({ type: "tool_start", id, name, input })
    },
    onToolEnd: (id, output, isError) => {
      sendEvent({ type: "tool_end", id, output, isError })
    },
    onDone: (usage) => {
      sendEvent({ type: "done", usage })
    },
    onError: (error) => {
      sendEvent({ type: "error", message: error.message })
    },
  }

  try {
    await runner.run(message, handlers)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    sendEvent({ type: "error", message })
  } finally {
    // 更新持久化会话的消息数
    const internalSession = runner.getSession()
    if (internalSession) {
      await daemonSessions.updateSession(session.id, {
        messageCount: internalSession.messages.length,
      })
    }

    session.abortController = undefined
    res.end()
  }
}

/**
 * 执行技能
 */
async function handleExecuteSkill(
  req: IncomingMessage,
  res: ServerResponse,
  skillName: string,
  config: ServerConfig
): Promise<void> {
  const body = await parseBody<ExecuteSkillRequest>(req)
  const cwd = body.cwd || config.defaultCwd || process.cwd()

  // 检查技能是否存在
  if (!hasSkill(skillName)) {
    sendError(res, 404, "SKILL_NOT_FOUND", `Skill not found: ${skillName}`)
    return
  }

  const startTime = Date.now()

  try {
    const result = await executeSkill(skillName, body.args || [], {
      cwd,
      apiKey: config.claudeApiKey,
      baseURL: config.claudeBaseURL,
    })

    const response: SkillResponse = {
      success: result.success,
      output: result.output,
      error: result.error,
      duration: Date.now() - startTime,
    }

    sendJson(res, 200, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const response: SkillResponse = {
      success: false,
      output: "",
      error: message,
      duration: Date.now() - startTime,
    }
    sendJson(res, 200, response)
  }
}

/**
 * 列出技能
 */
function handleListSkills(res: ServerResponse): void {
  const skills = listSkills().map((skill) => ({
    name: skill.name,
    description: skill.description,
    aliases: skill.aliases,
  }))

  sendJson(res, 200, { skills })
}

// ============================================================================
// Task Handlers
// ============================================================================

/**
 * 创建任务执行器
 */
function createTaskExecutor(
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>,
  config: ServerConfig
) {
  return async (task: Task, abortSignal: AbortSignal): Promise<TaskResult> => {
    // 获取或创建会话
    let session = sessions.get(task.sessionId)

    if (!session) {
      const persistedSession = await daemonSessions.getSession(task.sessionId)

      if (!persistedSession) {
        return {
          success: false,
          error: `Session not found: ${task.sessionId}`,
        }
      }

      // 恢复会话
      const runner = createRunner({
        agentType: persistedSession.agentType,
        cwd: persistedSession.cwd,
        apiKey: config.claudeApiKey,
        baseURL: config.claudeBaseURL,
        autoConfirm: config.autoConfirm,
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

    // 根据任务类型执行
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
    onText: (text) => {
      output += text
    },
    onDone: (u) => {
      usage = u
    },
    onError: (err) => {
      error = err.message
    },
  }

  try {
    // 检查是否已取消
    if (abortSignal.aborted) {
      return {
        success: false,
        error: "Task cancelled",
      }
    }

    await runner.run(message, handlers)

    // 更新持久化会话的消息数
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
function handleListTasks(
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
async function handleSubmitTask(
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
function handleGetTask(
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
function handleCancelTask(
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

  // 重新获取更新后的任务
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
