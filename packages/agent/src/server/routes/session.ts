/**
 * 会话相关路由 handler
 */

import type { IncomingMessage, ServerResponse } from "http"
import type {
  ServerConfig,
  CreateSessionRequest,
  SessionResponse,
  ActiveSession,
} from "../types"
import { sendError, sendJson, parseBody } from "../middleware"
import { createRunner } from "../../cli/runner"
import type { createDaemonSessionManager, Scheduler } from "../../daemon"
import type { AgentType } from "../../agent"

/**
 * 列出所有会话
 */
export async function handleListSessions(
  res: ServerResponse,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>,
  filterCwd?: string
): Promise<void> {
  const persistedSessions = await daemonSessions.listSessions(filterCwd)

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
export async function handleFindOrCreateSession(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>
): Promise<void> {
  const body = await parseBody<CreateSessionRequest>(req)
  const cwd = body.cwd || config.defaultCwd || process.cwd()
  const agentType: AgentType = body.agentType || "build"

  const persistedSession = await daemonSessions.getOrCreateSession(cwd, agentType)

  let activeSession = sessions.get(persistedSession.id)

  if (!activeSession) {
    const runner = createRunner({
      agentType: persistedSession.agentType,
      cwd: persistedSession.cwd,
      apiKey: config.claudeApiKey,
      baseURL: config.claudeBaseURL,
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
export async function handleCreateSession(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>
): Promise<void> {
  const body = await parseBody<CreateSessionRequest>(req)

  const cwd = body.cwd || config.defaultCwd || process.cwd()
  const agentType: AgentType = body.agentType || "build"

  const persistedSession = await daemonSessions.createSession(cwd, agentType)

  const runner = createRunner({
    agentType,
    cwd: persistedSession.cwd,
    apiKey: config.claudeApiKey,
    baseURL: config.claudeBaseURL,
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
export function handleGetSession(
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
 * 获取会话消息历史（简化格式供前端展示）
 */
export function handleGetMessages(
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
  if (!internalSession) {
    sendJson(res, 200, { messages: [] })
    return
  }

  const messages = internalSession.messages.map((msg) => {
    const textParts = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
    const text = textParts.join("\n")

    const toolUses = msg.content
      .filter((b): b is { type: "tool_use"; id: string; name: string; input: unknown } => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name }))

    const toolResults = msg.content
      .filter((b): b is { type: "tool_result"; tool_use_id: string; content: string } => b.type === "tool_result")
      .map((b) => ({ toolUseId: b.tool_use_id, content: typeof b.content === "string" ? b.content.slice(0, 200) : "" }))

    return {
      role: msg.role,
      text,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
      timestamp: msg.timestamp,
    }
  })

  sendJson(res, 200, { messages })
}

/**
 * 删除会话
 */
export async function handleDeleteSession(
  res: ServerResponse,
  id: string,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>,
  scheduler: Scheduler
): Promise<void> {
  const session = sessions.get(id)

  scheduler.cancelSession(id)

  if (session) {
    session.abortController?.abort()
    sessions.delete(id)
  }

  const deleted = await daemonSessions.deleteSession(id)

  if (!session && !deleted) {
    sendError(res, 404, "SESSION_NOT_FOUND", `Session not found: ${id}`)
    return
  }

  res.statusCode = 204
  res.end()
}
