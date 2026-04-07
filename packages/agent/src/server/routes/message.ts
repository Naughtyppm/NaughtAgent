/**
 * 消息相关路由 handler
 */

import type { IncomingMessage, ServerResponse } from "http"
import type {
  ServerConfig,
  SendMessageRequest,
  MessageResponse,
  ToolCallRecord,
  StreamEvent,
  ActiveSession,
} from "../types"
import { sendError, sendJson, parseBody } from "../middleware"
import { createRunner, type RunnerEventHandlers } from "../../cli/runner"
import type { createDaemonSessionManager } from "../../daemon"

/**
 * 发送消息
 */
export async function handleSendMessage(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  sessions: Map<string, ActiveSession>,
  daemonSessions: ReturnType<typeof createDaemonSessionManager>,
  config: ServerConfig
): Promise<void> {
  let session = sessions.get(sessionId)

  if (!session) {
    const persistedSession = await daemonSessions.getSession(sessionId)

    if (!persistedSession) {
      sendError(res, 404, "SESSION_NOT_FOUND", `Session not found: ${sessionId}`)
      return
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

    sessions.set(sessionId, session)
  }

  const body = await parseBody<SendMessageRequest>(req)

  if (!body.message) {
    sendError(res, 400, "BAD_REQUEST", "Message is required")
    return
  }

  const runner = session.runner as ReturnType<typeof createRunner>

  if (body.stream) {
    await handleStreamMessage(res, runner, body.message, session, daemonSessions)
  } else {
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
    onTextDelta: (delta) => {
      content += delta
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
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.statusCode = 200

  const abortController = new AbortController()
  session.abortController = abortController

  const sendEvent = (event: StreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  const handlers: RunnerEventHandlers = {
    onTextDelta: (delta) => {
      sendEvent({ type: "text_delta", delta })
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
