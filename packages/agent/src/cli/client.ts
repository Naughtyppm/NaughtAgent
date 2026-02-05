/**
 * Daemon 客户端
 *
 * CLI 通过此客户端连接到 Daemon 服务
 * 支持 HTTP API 和 WebSocket 实时通信
 */

import * as http from "http"
import * as crypto from "crypto"
import * as net from "net"
import type { Duplex } from "stream"
import { getDaemonStatus, ensureDaemon, getDefaultPort } from "./daemon"
import type { PermissionRequest, PermissionType } from "../permission"

// ============================================================================
// Types
// ============================================================================

export interface DaemonClientConfig {
  /** Daemon URL，默认从状态获取 */
  url?: string
  /** 工作目录 */
  cwd: string
  /** Agent 类型 */
  agentType?: "build" | "plan" | "explore"
  /** 自动确认 */
  autoConfirm?: boolean
  /** 权限确认回调 */
  onConfirm?: (request: PermissionRequest) => Promise<boolean>
}

export interface DaemonClientEvents {
  onText?: (content: string) => void
  onToolStart?: (id: string, name: string, input: unknown) => void
  onToolEnd?: (id: string, output: string, isError?: boolean) => void
  onError?: (error: Error) => void
  onDone?: (usage: { inputTokens: number; outputTokens: number }) => void
  onPermissionRequest?: (request: PermissionRequest) => void
}

interface WSMessage {
  type: string
  [key: string]: unknown
}

// ============================================================================
// Daemon Client
// ============================================================================

/**
 * 创建 Daemon 客户端
 */
export function createDaemonClient(config: DaemonClientConfig) {
  let wsSocket: Duplex | null = null
  let sessionId: string | null = null
  let isConnected = false

  /**
   * 确保 Daemon 运行并获取 URL
   */
  async function ensureConnection(): Promise<string> {
    let status = getDaemonStatus()

    if (!status.running) {
      console.log("正在启动 Daemon...")
      status = await ensureDaemon()
      if (!status.running) {
        throw new Error("无法启动 Daemon")
      }
      console.log(`Daemon 已启动: ${status.url}`)
    }

    return config.url || status.url || `http://127.0.0.1:${getDefaultPort()}`
  }

  /**
   * 通过 HTTP 查找或创建会话
   */
  async function findOrCreateSession(baseUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL("/sessions/find-or-create", baseUrl)
      const body = JSON.stringify({
        cwd: config.cwd,
        agentType: config.agentType || "build",
      })

      const req = http.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = ""
          res.on("data", (chunk) => (data += chunk))
          res.on("end", () => {
            try {
              const result = JSON.parse(data)
              if (result.id) {
                resolve(result.id)
              } else if (result.error) {
                reject(new Error(result.error.message))
              } else {
                reject(new Error("Invalid response"))
              }
            } catch (e) {
              reject(e)
            }
          })
        }
      )

      req.on("error", reject)
      req.write(body)
      req.end()
    })
  }

  /**
   * 连接 WebSocket
   */
  async function connectWebSocket(
    baseUrl: string,
    sessId: string
  ): Promise<Duplex> {
    return new Promise((resolve, reject) => {
      const wsUrl = baseUrl.replace("http://", "").replace("https://", "")
      const [host, portStr] = wsUrl.split(":")
      const port = parseInt(portStr, 10)

      const socket = net.createConnection({ host, port }, () => {
        // 发送 WebSocket 握手
        const key = crypto.randomBytes(16).toString("base64")
        const path = `/ws?sessionId=${sessId}&cwd=${encodeURIComponent(config.cwd)}`

        const request = [
          `GET ${path} HTTP/1.1`,
          `Host: ${host}:${port}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n")

        socket.write(request)
      })

      let handshakeComplete = false
      let buffer = Buffer.alloc(0)

      socket.on("data", (data: Buffer) => {
        if (!handshakeComplete) {
          // 检查握手响应
          const response = data.toString()
          if (response.includes("101 Switching Protocols")) {
            handshakeComplete = true
            isConnected = true
            // 找到 header 结束位置
            const headerEnd = data.indexOf("\r\n\r\n")
            if (headerEnd !== -1 && headerEnd + 4 < data.length) {
              buffer = data.slice(headerEnd + 4)
            }
            resolve(socket)
          } else {
            reject(new Error("WebSocket handshake failed"))
          }
        } else {
          buffer = Buffer.concat([buffer, data])
        }
      })

      socket.on("error", (err: Error) => {
        if (!handshakeComplete) {
          reject(err)
        }
      })

      socket.on("close", () => {
        isConnected = false
      })
    })
  }

  /**
   * 解析 WebSocket 帧
   */
  function parseFrame(buffer: Buffer): {
    payload: string
    totalLength: number
  } | null {
    if (buffer.length < 2) return null

    const secondByte = buffer[1]
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

    if (buffer.length < offset + payloadLength) return null

    const payload = buffer.slice(offset, offset + payloadLength).toString("utf-8")

    return {
      payload,
      totalLength: offset + payloadLength,
    }
  }

  /**
   * 发送 WebSocket 帧
   */
  function sendFrame(socket: Duplex, message: WSMessage): void {
    const data = JSON.stringify(message)
    const payload = Buffer.from(data, "utf-8")
    const length = payload.length

    // 客户端必须使用掩码
    const mask = crypto.randomBytes(4)
    const maskedPayload = Buffer.from(payload)
    for (let i = 0; i < maskedPayload.length; i++) {
      maskedPayload[i] ^= mask[i % 4]
    }

    let header: Buffer
    if (length < 126) {
      header = Buffer.alloc(6)
      header[0] = 0x81 // FIN + text
      header[1] = 0x80 | length // masked + length
      mask.copy(header, 2)
    } else if (length < 65536) {
      header = Buffer.alloc(8)
      header[0] = 0x81
      header[1] = 0x80 | 126
      header.writeUInt16BE(length, 2)
      mask.copy(header, 4)
    } else {
      header = Buffer.alloc(14)
      header[0] = 0x81
      header[1] = 0x80 | 127
      header.writeBigUInt64BE(BigInt(length), 2)
      mask.copy(header, 10)
    }

    socket.write(Buffer.concat([header, maskedPayload]))
  }

  /**
   * 发送消息并处理响应
   */
  async function send(
    message: string,
    events: DaemonClientEvents
  ): Promise<void> {
    // 确保连接
    const baseUrl = await ensureConnection()

    // 获取或创建会话
    if (!sessionId) {
      sessionId = await findOrCreateSession(baseUrl)
    }

    // 连接 WebSocket
    if (!wsSocket || !isConnected) {
      wsSocket = await connectWebSocket(baseUrl, sessionId)
    }

    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0)
      let resolved = false

      const cleanup = () => {
        if (wsSocket) {
          wsSocket.removeListener("data", onData)
        }
      }

      const onData = (data: Buffer) => {
        buffer = Buffer.concat([buffer, data])

        while (buffer.length >= 2) {
          const frame = parseFrame(buffer)
          if (!frame) break

          buffer = buffer.slice(frame.totalLength)

          try {
            const msg: WSMessage = JSON.parse(frame.payload)
            handleMessage(msg, events, resolve, reject, () => {
              resolved = true
              cleanup()
            })
          } catch {
            // 忽略解析错误
          }
        }
      }

      wsSocket!.on("data", onData)

      wsSocket!.on("close", () => {
        if (!resolved) {
          cleanup()
          reject(new Error("Connection closed"))
        }
      })

      wsSocket!.on("error", (err: Error) => {
        if (!resolved) {
          cleanup()
          reject(err)
        }
      })

      // 发送消息
      sendFrame(wsSocket!, { type: "send", message })
    })
  }

  /**
   * 处理服务端消息
   */
  function handleMessage(
    msg: WSMessage,
    events: DaemonClientEvents,
    resolve: () => void,
    reject: (err: Error) => void,
    cleanup: () => void
  ): void {
    switch (msg.type) {
      case "text":
        events.onText?.(msg.content as string)
        break

      case "tool_start":
        events.onToolStart?.(
          msg.id as string,
          msg.name as string,
          msg.input
        )
        break

      case "tool_end":
        events.onToolEnd?.(
          msg.id as string,
          msg.output as string,
          msg.isError as boolean | undefined
        )
        break

      case "permission_request":
        handlePermissionRequest(msg, events)
        break

      case "done":
        events.onDone?.(msg.usage as { inputTokens: number; outputTokens: number })
        cleanup()
        resolve()
        break

      case "error":
        const error = new Error(msg.message as string)
        events.onError?.(error)
        cleanup()
        reject(error)
        break

      case "pong":
        // 忽略
        break
    }
  }

  /**
   * 处理权限请求
   */
  async function handlePermissionRequest(
    msg: WSMessage,
    events: DaemonClientEvents
  ): Promise<void> {
    const request: PermissionRequest = {
      type: msg.permissionType as PermissionType,
      resource: msg.resource as string,
      description: msg.description as string,
    }

    events.onPermissionRequest?.(request)

    let allowed = config.autoConfirm || false

    if (!config.autoConfirm && config.onConfirm) {
      allowed = await config.onConfirm(request)
    }

    // 发送权限响应
    if (wsSocket && isConnected) {
      sendFrame(wsSocket, {
        type: "permission_response",
        requestId: msg.requestId as string,
        allowed,
      })
    }
  }

  /**
   * 关闭连接
   */
  function close(): void {
    if (wsSocket) {
      // 发送关闭帧
      const closeFrame = Buffer.alloc(6)
      closeFrame[0] = 0x88 // FIN + close
      closeFrame[1] = 0x80 // masked + 0 length
      crypto.randomBytes(4).copy(closeFrame, 2)
      wsSocket.write(closeFrame)
      wsSocket.end()
      wsSocket = null
    }
    isConnected = false
    sessionId = null
  }

  /**
   * 获取会话 ID
   */
  function getSessionId(): string | null {
    return sessionId
  }

  /**
   * 是否已连接
   */
  function connected(): boolean {
    return isConnected
  }

  return {
    send,
    close,
    getSessionId,
    connected,
  }
}

export type DaemonClient = ReturnType<typeof createDaemonClient>
