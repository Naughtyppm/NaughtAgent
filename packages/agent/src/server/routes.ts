/**
 * API 路由处理
 *
 * 路由注册 + 请求分发，handler 实现在 routes/ 子目录
 */

import type { IncomingMessage, ServerResponse } from "http"
import type {
  ServerConfig,
  HealthResponse,
  ActiveSession,
} from "./types"
import {
  sendError,
  sendJson,
  matchRoute,
  parseQueryString,
} from "./middleware"
import {
  createDaemonSessionManager,
  createScheduler,
  type Scheduler,
} from "../daemon"
import {
  handleListSessions,
  handleFindOrCreateSession,
  handleCreateSession,
  handleGetSession,
  handleGetMessages,
  handleDeleteSession,
} from "./routes/session"
import { handleSendMessage } from "./routes/message"
import {
  createTaskExecutor,
  handleListTasks,
  handleSubmitTask,
  handleGetTask,
  handleCancelTask,
} from "./routes/task"
import {
  handleExecuteSkill,
  handleListSkills,
} from "./routes/skill"

// ============================================================================
// Routes Handler
// ============================================================================

/**
 * 创建路由处理器
 */
export function createRoutes(config: ServerConfig) {
  const sessions = new Map<string, ActiveSession>()
  const daemonSessions = createDaemonSessionManager()

  daemonSessions.initialize().catch((err) => {
    console.error("Failed to initialize daemon sessions:", err)
  })

  const scheduler = createScheduler({
    maxConcurrentTasks: 3,
    maxQueueSize: 100,
    defaultTimeout: 300000,
    executor: createTaskExecutor(sessions, daemonSessions, config),
  })

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

      // 列出所有会话
      if (method === "GET" && url === "/sessions") {
        return await handleListSessions(res, sessions, daemonSessions, query.cwd)
      }

      // 按 cwd 查找或创建会话
      if (method === "POST" && url === "/sessions/find-or-create") {
        return await handleFindOrCreateSession(req, res, config, sessions, daemonSessions)
      }

      // 创建会话
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

      // 消息发送 / 获取消息历史
      const messageMatch = matchRoute("/sessions/:id/messages", url)
      if (messageMatch && method === "GET") {
        return handleGetMessages(res, messageMatch.id, sessions)
      }
      if (messageMatch && method === "POST") {
        return await handleSendMessage(req, res, messageMatch.id, sessions, daemonSessions, config)
      }

      // ============ 任务 API ============

      if (method === "GET" && url === "/tasks") {
        return handleListTasks(res, scheduler, query.sessionId, query.status)
      }

      if (method === "POST" && url === "/tasks") {
        return await handleSubmitTask(req, res, scheduler)
      }

      const taskMatch = matchRoute("/tasks/:id", url)
      if (taskMatch) {
        if (method === "GET") {
          return handleGetTask(res, taskMatch.id, scheduler)
        }
      }

      const cancelMatch = matchRoute("/tasks/:id/cancel", url)
      if (cancelMatch && method === "POST") {
        return handleCancelTask(res, cancelMatch.id, scheduler)
      }

      // ============ 技能 API ============

      const skillMatch = matchRoute("/skills/:name", url)
      if (skillMatch && method === "POST") {
        return await handleExecuteSkill(req, res, skillMatch.name, config)
      }

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
// Local Handlers (health/status - too small to extract)
// ============================================================================

function handleHealth(res: ServerResponse): void {
  const response: HealthResponse = {
    status: "ok",
    version: "0.1.0",
  }
  sendJson(res, 200, response)
}

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
