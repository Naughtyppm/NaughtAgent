/**
 * WebSocket 处理
 *
 * 实时双向通信，支持：
 * - 流式输出
 * - 权限确认
 * - 会话订阅和广播
 * - 心跳保活
 */

import type { IncomingMessage } from "http"
import type { Duplex } from "stream"
import * as crypto from "crypto"
import type {
  ServerConfig,
  WSClientMessage,
  WSServerMessage,
  ActiveSession,
} from "./types"
import { createRunner, type RunnerEventHandlers } from "../cli/runner"
import { parseQuery } from "./middleware"
import { createDaemonSessionManager } from "../daemon"
import type { AgentType } from "../agent"
import { setInteractionCallbacks } from "../interaction/callbacks"

// ============================================================================
// Types
// ============================================================================

/**
 * 扩展的 WebSocket 客户端消息
 */
interface WSSubscribeMessage {
  type: "subscribe"
  sessionId: string
}

interface WSUnsubscribeMessage {
  type: "unsubscribe"
  sessionId: string
}

type ExtendedWSClientMessage = WSClientMessage | WSSubscribeMessage | WSUnsubscribeMessage

// ============================================================================
// WebSocket Handler
// ============================================================================

/**
 * 创建 WebSocket 处理器
 */
export function createWebSocketHandler(
  config: ServerConfig,
  sessions: Map<string, ActiveSession>
) {
  const connections = new Map<string, WebSocketConnection>()
  const sessionSubscribers = new Map<string, Set<string>>() // sessionId -> connectionIds
  const daemonSessions = createDaemonSessionManager()

  // 初始化 daemon 会话管理器
  daemonSessions.initialize().catch((err) => {
    console.error("Failed to initialize daemon sessions in WebSocket:", err)
  })

  /**
   * 处理 WebSocket 升级请求
   */
  function handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    _head: Buffer
  ): void {
    const url = req.url || "/"

    // 验证路径
    if (!url.startsWith("/ws")) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
      socket.destroy()
      return
    }

    // 解析查询参数
    const query = parseQuery(url)
    const token = query.token
    const sessionId = query.sessionId
    const cwd = query.cwd

    // 验证 token（如果配置了 apiKey）
    if (config.apiKey && token !== config.apiKey) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
      socket.destroy()
      return
    }

    // 执行 WebSocket 握手
    const key = req.headers["sec-websocket-key"]
    if (!key) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n")
      socket.destroy()
      return
    }

    const acceptKey = generateAcceptKey(key)
    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n")

    socket.write(responseHeaders)

    // 创建连接
    const connectionId = generateId()
    const connection = new WebSocketConnection(
      connectionId,
      socket,
      config,
      sessions,
      daemonSessions,
      {
        sessionId,
        cwd,
        onSubscribe: (sessId) => subscribeToSession(connectionId, sessId),
        onUnsubscribe: (sessId) => unsubscribeFromSession(connectionId, sessId),
        broadcast: (sessId, message) => broadcastToSession(sessId, message, connectionId),
      }
    )
    connections.set(connectionId, connection)

    // 如果提供了 sessionId，自动订阅
    if (sessionId) {
      subscribeToSession(connectionId, sessionId)
    }

    socket.on("close", () => {
      // 取消所有订阅
      for (const [sessId, subscribers] of sessionSubscribers.entries()) {
        if (subscribers.has(connectionId)) {
          subscribers.delete(connectionId)
          if (subscribers.size === 0) {
            sessionSubscribers.delete(sessId)
          }
        }
      }
      connections.delete(connectionId)
    })
  }

  /**
   * 订阅会话
   */
  function subscribeToSession(connectionId: string, sessionId: string): void {
    let subscribers = sessionSubscribers.get(sessionId)
    if (!subscribers) {
      subscribers = new Set()
      sessionSubscribers.set(sessionId, subscribers)
    }
    subscribers.add(connectionId)
  }

  /**
   * 取消订阅会话
   */
  function unsubscribeFromSession(connectionId: string, sessionId: string): void {
    const subscribers = sessionSubscribers.get(sessionId)
    if (subscribers) {
      subscribers.delete(connectionId)
      if (subscribers.size === 0) {
        sessionSubscribers.delete(sessionId)
      }
    }
  }

  /**
   * 广播消息到会话的所有订阅者
   */
  function broadcastToSession(
    sessionId: string,
    message: WSServerMessage,
    excludeConnectionId?: string
  ): void {
    const subscribers = sessionSubscribers.get(sessionId)
    if (!subscribers) return

    for (const connId of subscribers) {
      if (connId === excludeConnectionId) continue
      const connection = connections.get(connId)
      if (connection) {
        connection.send(message)
      }
    }
  }

  /**
   * 关闭所有连接
   */
  function closeAll(): void {
    for (const connection of connections.values()) {
      connection.close()
    }
    connections.clear()
    sessionSubscribers.clear()
  }

  /**
   * 获取会话订阅者数量
   */
  function getSessionSubscriberCount(sessionId: string): number {
    return sessionSubscribers.get(sessionId)?.size || 0
  }

  return {
    handleUpgrade,
    closeAll,
    getConnectionCount: () => connections.size,
    getSessionSubscriberCount,
    broadcastToSession,
  }
}

// ============================================================================
// WebSocket Connection
// ============================================================================

interface ConnectionCallbacks {
  onSubscribe: (sessionId: string) => void
  onUnsubscribe: (sessionId: string) => void
  broadcast: (sessionId: string, message: WSServerMessage) => void
}

/**
 * WebSocket 连接
 */
class WebSocketConnection {
  private connectionId: string
  private socket: Duplex
  private config: ServerConfig
  private sessions: Map<string, ActiveSession>
  private daemonSessions: ReturnType<typeof createDaemonSessionManager>
  private callbacks: ConnectionCallbacks
  private sessionId: string | null
  private cwd: string | null
  private session: ActiveSession | null = null
  private isRunning = false
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private lastPongTime = Date.now()

  constructor(
    connectionId: string,
    socket: Duplex,
    config: ServerConfig,
    sessions: Map<string, ActiveSession>,
    daemonSessions: ReturnType<typeof createDaemonSessionManager>,
    options: {
      sessionId?: string
      cwd?: string
    } & ConnectionCallbacks
  ) {
    this.connectionId = connectionId
    this.socket = socket
    this.config = config
    this.sessions = sessions
    this.daemonSessions = daemonSessions
    this.callbacks = {
      onSubscribe: options.onSubscribe,
      onUnsubscribe: options.onUnsubscribe,
      broadcast: options.broadcast,
    }
    this.sessionId = options.sessionId || null
    this.cwd = options.cwd || null

    // 如果提供了 sessionId，获取现有会话
    if (options.sessionId && sessions.has(options.sessionId)) {
      this.session = sessions.get(options.sessionId)!
    }

    this.setupListeners()
    this.startHeartbeat()
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    // 每 30 秒发送一次 ping
    this.heartbeatInterval = setInterval(() => {
      // 检查上次 pong 时间，如果超过 60 秒没响应，关闭连接
      if (Date.now() - this.lastPongTime > 60000) {
        console.warn(`WebSocket connection ${this.connectionId} timed out`)
        this.close()
        return
      }
      this.sendPing()
    }, 30000)
  }

  /**
   * 设置事件监听
   */
  private setupListeners(): void {
    let buffer = Buffer.alloc(0)

    this.socket.on("data", (data: Buffer) => {
      buffer = Buffer.concat([buffer, data])

      // 尝试解析帧
      while (buffer.length >= 2) {
        const frame = this.parseFrame(buffer)
        if (!frame) break

        buffer = buffer.slice(frame.totalLength)
        this.handleFrame(frame)
      }
    })

    this.socket.on("close", () => {
      this.cleanup()
    })

    this.socket.on("error", () => {
      this.cleanup()
    })
  }

  /**
   * 解析 WebSocket 帧
   */
  private parseFrame(buffer: Buffer): {
    opcode: number
    payload: Buffer
    totalLength: number
  } | null {
    if (buffer.length < 2) return null

    const firstByte = buffer[0]
    const secondByte = buffer[1]

    const opcode = firstByte & 0x0f
    const masked = (secondByte & 0x80) !== 0
    let payloadLength = secondByte & 0x7f
    let offset = 2

    if (payloadLength === 126) {
      if (buffer.length < 4) return null
      payloadLength = buffer.readUInt16BE(2)
      offset = 4
    } else if (payloadLength === 127) {
      if (buffer.length < 10) return null
      payloadLength = Number(buffer.readBigUInt64BE(2))
      offset = 10
    }

    let maskKey: Buffer | null = null
    if (masked) {
      if (buffer.length < offset + 4) return null
      maskKey = buffer.slice(offset, offset + 4)
      offset += 4
    }

    if (buffer.length < offset + payloadLength) return null

    let payload = buffer.slice(offset, offset + payloadLength)

    // 解码掩码
    if (maskKey) {
      payload = Buffer.from(payload)
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4]
      }
    }

    return {
      opcode,
      payload,
      totalLength: offset + payloadLength,
    }
  }

  /**
   * 处理帧
   */
  private handleFrame(frame: { opcode: number; payload: Buffer }): void {
    switch (frame.opcode) {
      case 0x01: // 文本帧
        this.handleTextMessage(frame.payload.toString("utf-8"))
        break
      case 0x08: // 关闭帧
        this.close()
        break
      case 0x09: // Ping
        this.sendPong()
        break
      case 0x0a: // Pong
        this.lastPongTime = Date.now()
        break
    }
  }

  /**
   * 处理文本消息
   */
  private async handleTextMessage(text: string): Promise<void> {
    let message: ExtendedWSClientMessage

    try {
      message = JSON.parse(text)
    } catch {
      this.sendError("Invalid JSON message")
      return
    }

    switch (message.type) {
      case "send":
        await this.handleSend(message.message, message.model as string | undefined, message.thinking as { enabled: boolean; budgetTokens?: number } | undefined)
        break
      case "cancel":
        this.handleCancel()
        break
      case "ping":
        this.send({ type: "pong" })
        break
      case "permission_response":
        break
      case "question_response":
        this.handleQuestionResponse(message.requestId as string, message.value, message.cancelled as boolean | undefined)
        break
      case "subscribe":
        this.handleSubscribe((message as WSSubscribeMessage).sessionId)
        break
      case "unsubscribe":
        this.handleUnsubscribe((message as WSUnsubscribeMessage).sessionId)
        break
    }
  }

  /**
   * 处理订阅
   */
  private handleSubscribe(sessionId: string): void {
    this.callbacks.onSubscribe(sessionId)
    this.sessionId = sessionId

    // 尝试获取会话
    if (this.sessions.has(sessionId)) {
      this.session = this.sessions.get(sessionId)!
    }

    this.send({ type: "pong" }) // 确认订阅成功
  }

  /**
   * 处理取消订阅
   */
  private handleUnsubscribe(sessionId: string): void {
    this.callbacks.onUnsubscribe(sessionId)
    if (this.sessionId === sessionId) {
      this.sessionId = null
      this.session = null
    }
  }

  // 持久模式：等待用户输入的 resolver
  private pendingInputResolver: ((input: string | null) => void) | null = null
  // Question 工具：等待用户回答的 resolver
  private pendingQuestions = new Map<string, {
    resolve: (result: { answered: boolean; value: string | boolean | string[] | null; cancelled: boolean }) => void
    timeout: ReturnType<typeof setTimeout>
  }>()

  /**
   * 持久模式：等待用户通过 WS 发送下一条消息
   * 返回用户输入的文本，或 null 表示退出
   */
  private waitForInputFromWs(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.pendingInputResolver = resolve
    })
  }

  /**
   * 通过 WS 向前端发送问题，等待用户回答
   */
  private questionViaWs(question: { type: string; message: string; options?: Array<{ value: string; label: string; description?: string }>; default?: unknown }): Promise<{ answered: boolean; value: string | boolean | string[] | null; cancelled: boolean }> {
    const requestId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingQuestions.delete(requestId)
        resolve({ answered: false, value: null, cancelled: true })
      }, 300000) // 5 分钟超时

      this.pendingQuestions.set(requestId, { resolve, timeout })

      this.send({
        type: "question_request",
        requestId,
        questionType: question.type as "confirm" | "select" | "multiselect" | "text",
        message: question.message,
        options: question.options,
        default: question.default,
      })
    })
  }

  /**
   * 处理前端的问题回答
   */
  private handleQuestionResponse(requestId: string, value: unknown, cancelled?: boolean): void {
    const pending = this.pendingQuestions.get(requestId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingQuestions.delete(requestId)
      pending.resolve({
        answered: !cancelled,
        value: cancelled ? null : (value as string | boolean | string[] | null),
        cancelled: !!cancelled,
      })
    }
  }

  /**
   * 处理发送消息
   */
  private async handleSend(message: string, model?: string, thinking?: { enabled: boolean; budgetTokens?: number }): Promise<void> {

    // 如果 loop 正在等待用户输入，直接 resolve
    if (this.pendingInputResolver) {
      const resolver = this.pendingInputResolver
      this.pendingInputResolver = null
      this.isRunning = true  // loop 恢复运行
      resolver(message)
      return
    }

    if (this.isRunning) {
      this.sendError("Already running a task")
      return
    }

    // 确保有会话
    if (!this.session) {
      this.session = await this.createOrGetSession(model)
    }

    // 动态设置 model 配置
    if (model) {
      const runner = this.session.runner as ReturnType<typeof createRunner>
      runner.setModel(model)
    }

    // 动态设置 thinking 配置
    if (thinking?.enabled) {
      const runner = this.session.runner as ReturnType<typeof createRunner>
      runner.setThinking(thinking)
    }

    this.isRunning = true
    const runner = this.session.runner as ReturnType<typeof createRunner>
    const currentSessionId = this.session.id

    // 确保 WS 连接的 question 回调已注册
    // 当 session 来自 HTTP API 创建时，runner 内部没有 onQuestion 回调
    // 必须在这里显式注册，保证 question 工具能通过 WS 发送到前端
    setInteractionCallbacks({
      onQuestion: (q) => this.questionViaWs(q),
    })

    const handlers: RunnerEventHandlers = {
      onTextDelta: (delta) => {
        const msg: WSServerMessage = { type: "text_delta", delta }
        this.send(msg)
        this.callbacks.broadcast(currentSessionId, msg)
      },
      onThinking: (content) => {
        const msg: WSServerMessage = { type: "thinking", content }
        this.send(msg)
        this.callbacks.broadcast(currentSessionId, msg)
      },
      onThinkingEnd: () => {
        const msg: WSServerMessage = { type: "thinking_end" }
        this.send(msg)
        this.callbacks.broadcast(currentSessionId, msg)
      },
      onToolStart: (id, name, input) => {
        const msg: WSServerMessage = { type: "tool_start", id, name, input }
        this.send(msg)
        this.callbacks.broadcast(currentSessionId, msg)
      },
      onToolEnd: (id, output, isError) => {
        const msg: WSServerMessage = { type: "tool_end", id, output, isError }
        this.send(msg)
        this.callbacks.broadcast(currentSessionId, msg)
      },
      onDone: (usage) => {
        const msg: WSServerMessage = { type: "done", usage }
        this.send(msg)
        this.callbacks.broadcast(currentSessionId, msg)
        this.isRunning = false

        // 更新持久化会话
        const internalSession = runner.getSession()
        if (internalSession) {
          this.daemonSessions.updateSession(currentSessionId, {
            messageCount: internalSession.messages.length,
          }).catch(() => {})
        }
      },
      onError: (error) => {
        const msg: WSServerMessage = { type: "error", message: error.message }
        this.send(msg)
        this.callbacks.broadcast(currentSessionId, msg)
      },
      onAwaitInput: () => {
        // 通知客户端当前回合完毕，可以发送新消息
        this.send({ type: "done", usage: { inputTokens: 0, outputTokens: 0 } })
        this.isRunning = false
      },
      onPermissionRequest: () => {
        // 权限已移除，所有操作自动批准
      },
    }

    try {
      await runner.run(message, handlers)
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      this.send({ type: "error", message: msg })
    } finally {
      this.isRunning = false
      this.pendingInputResolver = null
    }
  }

  /**
   * 处理取消
   */
  private handleCancel(): void {
    // 如果正在等待用户输入，resolve null 退出循环
    if (this.pendingInputResolver) {
      const resolver = this.pendingInputResolver
      this.pendingInputResolver = null
      resolver(null)
    }
    if (this.session?.abortController) {
      this.session.abortController.abort()
    }
    this.isRunning = false
  }

  /**
   * 创建或获取会话
   */
  private async createOrGetSession(model?: string): Promise<ActiveSession> {
    // 如果有 sessionId，尝试从持久化存储恢复
    if (this.sessionId) {
      const persisted = await this.daemonSessions.getSession(this.sessionId)
      if (persisted) {
        const runner = createRunner({
          agentType: persisted.agentType,
          cwd: persisted.cwd,
          model,
          apiKey: this.config.claudeApiKey,
          baseURL: this.config.claudeBaseURL,
          waitForInput: () => this.waitForInputFromWs(),
          onQuestion: (q) => this.questionViaWs(q),
        })

        const session: ActiveSession = {
          id: persisted.id,
          createdAt: new Date(persisted.createdAt),
          agentType: persisted.agentType,
          cwd: persisted.cwd,
          runner,
        }

        this.sessions.set(persisted.id, session)
        return session
      }
    }

    // 如果有 cwd，尝试查找或创建
    if (this.cwd) {
      const persisted = await this.daemonSessions.getOrCreateSession(
        this.cwd,
        "build"
      )

      const runner = createRunner({
        agentType: persisted.agentType,
        cwd: persisted.cwd,
        model,
        apiKey: this.config.claudeApiKey,
        baseURL: this.config.claudeBaseURL,
        waitForInput: () => this.waitForInputFromWs(),
        onQuestion: (q) => this.questionViaWs(q),
      })

      const session: ActiveSession = {
        id: persisted.id,
        createdAt: new Date(persisted.createdAt),
        agentType: persisted.agentType,
        cwd: persisted.cwd,
        runner,
      }

      this.sessions.set(persisted.id, session)
      this.sessionId = persisted.id
      this.callbacks.onSubscribe(persisted.id)
      return session
    }

    // 创建新会话
    return this.createSession(model)
  }

  /**
   * 创建新会话
   */
  private createSession(model?: string): ActiveSession {
    const id = this.sessionId || generateId()
    const cwd = this.cwd || this.config.defaultCwd || process.cwd()
    const agentType: AgentType = "build"

    const runner = createRunner({
      agentType,
      cwd,
      model,
      apiKey: this.config.claudeApiKey,
      baseURL: this.config.claudeBaseURL,
      waitForInput: () => this.waitForInputFromWs(),
      onQuestion: (q) => this.questionViaWs(q),
    })

    const session: ActiveSession = {
      id,
      createdAt: new Date(),
      agentType,
      cwd,
      runner,
    }

    this.sessions.set(id, session)
    this.sessionId = id
    this.callbacks.onSubscribe(id)
    return session
  }

  /**
   * 发送消息
   */
  send(message: WSServerMessage): void {
    const data = JSON.stringify(message)
    this.sendFrame(0x01, Buffer.from(data, "utf-8"))
  }

  /**
   * 发送错误
   */
  private sendError(message: string): void {
    this.send({ type: "error", message })
  }

  /**
   * 发送 Ping
   */
  private sendPing(): void {
    this.sendFrame(0x09, Buffer.alloc(0))
  }

  /**
   * 发送 Pong
   */
  private sendPong(): void {
    this.sendFrame(0x0a, Buffer.alloc(0))
  }

  /**
   * 发送帧
   */
  private sendFrame(opcode: number, payload: Buffer): void {
    if (this.socket.destroyed) return

    const length = payload.length
    let header: Buffer

    if (length < 126) {
      header = Buffer.alloc(2)
      header[0] = 0x80 | opcode // FIN + opcode
      header[1] = length
    } else if (length < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x80 | opcode
      header[1] = 126
      header.writeUInt16BE(length, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x80 | opcode
      header[1] = 127
      header.writeBigUInt64BE(BigInt(length), 2)
    }

    this.socket.write(Buffer.concat([header, payload]))
  }

  /**
   * 关闭连接
   */
  close(): void {
    this.sendFrame(0x08, Buffer.alloc(0))
    this.socket.end()
    this.cleanup()
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    this.isRunning = false
    // 清理待回答的问题
    for (const pending of this.pendingQuestions.values()) {
      clearTimeout(pending.timeout)
      pending.resolve({ answered: false, value: null, cancelled: true })
    }
    this.pendingQuestions.clear()
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 生成 WebSocket Accept Key
 */
function generateAcceptKey(key: string): string {
  const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
  return crypto
    .createHash("sha1")
    .update(key + GUID)
    .digest("base64")
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
