/**
 * MCP 传输层实现
 *
 * 支持 stdio 和 SSE 两种传输方式
 */

import { spawn, type ChildProcess } from "child_process"
import * as http from "http"
import * as https from "https"
import type {
  McpTransport,
  McpServerConfig,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from "./types"
import { DEFAULT_TIMEOUT } from "./types"

// ============================================================================
// Stdio Transport
// ============================================================================

/**
 * Stdio 传输层
 * 通过子进程的 stdin/stdout 通信
 */
export class StdioTransport implements McpTransport {
  private process: ChildProcess | null = null
  private pendingRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private notificationHandler: ((method: string, params: unknown) => void) | null = null
  private nextId = 1
  private buffer = ""
  private _connected = false

  constructor(private config: McpServerConfig) {}

  get connected(): boolean {
    return this._connected
  }

  /**
   * 启动子进程
   */
  async start(): Promise<void> {
    if (!this.config.command) {
      throw new Error("Command is required for stdio transport")
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"))
      }, this.config.timeout || DEFAULT_TIMEOUT)

      this.process = spawn(this.config.command!, this.config.args || [], {
        cwd: this.config.cwd,
        env: { ...process.env, ...this.config.env },
        stdio: ["pipe", "pipe", "pipe"],
      })

      this.process.on("error", (error) => {
        clearTimeout(timeout)
        this._connected = false
        reject(error)
      })

      this.process.on("exit", (code) => {
        this._connected = false
        // 拒绝所有待处理的请求
        for (const [, { reject }] of this.pendingRequests) {
          reject(new Error(`Process exited with code ${code}`))
        }
        this.pendingRequests.clear()
      })

      this.process.stdout?.on("data", (data: Buffer) => {
        this.handleData(data.toString())
      })

      this.process.stderr?.on("data", (data: Buffer) => {
        // 记录错误输出但不中断
        console.error(`[MCP ${this.config.name}] stderr:`, data.toString())
      })

      // 等待进程启动
      this.process.stdout?.once("data", () => {
        clearTimeout(timeout)
        this._connected = true
        resolve()
      })

      // 如果进程立即退出，也算启动成功（可能是快速响应）
      setTimeout(() => {
        if (this.process && !this._connected) {
          clearTimeout(timeout)
          this._connected = true
          resolve()
        }
      }, 100)
    })
  }

  /**
   * 处理接收到的数据
   */
  private handleData(data: string): void {
    this.buffer += data

    // 尝试解析完整的 JSON 消息（按行分割）
    const lines = this.buffer.split("\n")
    this.buffer = lines.pop() || ""

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const message = JSON.parse(line)
        this.handleMessage(message)
      } catch {
        // 忽略无法解析的行
      }
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(message: JsonRpcResponse | JsonRpcNotification): void {
    if ("id" in message && message.id !== undefined) {
      // 响应
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
      }
    } else if ("method" in message) {
      // 通知
      this.notificationHandler?.(message.method, message.params)
    }
  }

  /**
   * 发送请求
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.process || !this._connected) {
      throw new Error("Not connected")
    }

    const id = this.nextId++
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, this.config.timeout || DEFAULT_TIMEOUT)

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })

      this.process!.stdin?.write(JSON.stringify(request) + "\n")
    })
  }

  /**
   * 发送通知
   */
  notify(method: string, params?: unknown): void {
    if (!this.process || !this._connected) {
      return
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    }

    this.process.stdin?.write(JSON.stringify(notification) + "\n")
  }

  /**
   * 设置通知处理器
   */
  onNotification(handler: (method: string, params: unknown) => void): void {
    this.notificationHandler = handler
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    this._connected = false

    if (this.process) {
      this.process.kill()
      this.process = null
    }

    // 拒绝所有待处理的请求
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error("Connection closed"))
    }
    this.pendingRequests.clear()
  }
}

// ============================================================================
// SSE Transport
// ============================================================================

/**
 * SSE 传输层
 * 通过 HTTP POST 发送请求，SSE 接收响应
 */
export class SseTransport implements McpTransport {
  private pendingRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private notificationHandler: ((method: string, params: unknown) => void) | null = null
  private nextId = 1
  private _connected = false
  private eventSourceRequest: http.ClientRequest | null = null

  constructor(private config: McpServerConfig) {}

  get connected(): boolean {
    return this._connected
  }

  /**
   * 建立 SSE 连接
   */
  async start(): Promise<void> {
    if (!this.config.url) {
      throw new Error("URL is required for SSE transport")
    }

    // 建立 SSE 连接接收服务器推送
    await this.connectSse()
    this._connected = true
  }

  /**
   * 建立 SSE 连接
   */
  private async connectSse(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.url!)
      const isHttps = url.protocol === "https:"
      const httpModule = isHttps ? https : http

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...this.config.headers,
        },
      }

      const timeout = setTimeout(() => {
        reject(new Error("SSE connection timeout"))
      }, this.config.timeout || DEFAULT_TIMEOUT)

      this.eventSourceRequest = httpModule.request(options, (res) => {
        clearTimeout(timeout)

        if (res.statusCode !== 200) {
          reject(new Error(`SSE connection failed: ${res.statusCode}`))
          return
        }

        let buffer = ""

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString()

          // 解析 SSE 事件
          const events = buffer.split("\n\n")
          buffer = events.pop() || ""

          for (const event of events) {
            this.handleSseEvent(event)
          }
        })

        res.on("end", () => {
          this._connected = false
        })

        resolve()
      })

      this.eventSourceRequest.on("error", (error) => {
        clearTimeout(timeout)
        this._connected = false
        reject(error)
      })

      this.eventSourceRequest.end()
    })
  }

  /**
   * 处理 SSE 事件
   */
  private handleSseEvent(event: string): void {
    const lines = event.split("\n")
    let data = ""

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        data += line.slice(6)
      }
    }

    if (!data) return

    try {
      const message = JSON.parse(data)
      this.handleMessage(message)
    } catch {
      // 忽略无法解析的事件
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(message: JsonRpcResponse | JsonRpcNotification): void {
    if ("id" in message && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
      }
    } else if ("method" in message) {
      this.notificationHandler?.(message.method, message.params)
    }
  }

  /**
   * 发送请求
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this._connected) {
      throw new Error("Not connected")
    }

    const id = this.nextId++
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, this.config.timeout || DEFAULT_TIMEOUT)

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })

      // 发送 HTTP POST 请求
      this.sendHttpRequest(request).catch((error) => {
        this.pendingRequests.delete(id)
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  /**
   * 发送 HTTP 请求
   */
  private async sendHttpRequest(request: JsonRpcRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.url!)
      const isHttps = url.protocol === "https:"
      const httpModule = isHttps ? https : http
      const body = JSON.stringify(request)

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...this.config.headers,
        },
      }

      const req = httpModule.request(options, (res) => {
        if (res.statusCode !== 200 && res.statusCode !== 202) {
          reject(new Error(`HTTP request failed: ${res.statusCode}`))
          return
        }
        resolve()
      })

      req.on("error", reject)
      req.write(body)
      req.end()
    })
  }

  /**
   * 发送通知
   */
  notify(method: string, params?: unknown): void {
    if (!this._connected) {
      return
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    }

    this.sendHttpRequest(notification as unknown as JsonRpcRequest).catch(() => {
      // 忽略通知发送失败
    })
  }

  /**
   * 设置通知处理器
   */
  onNotification(handler: (method: string, params: unknown) => void): void {
    this.notificationHandler = handler
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    this._connected = false

    if (this.eventSourceRequest) {
      this.eventSourceRequest.destroy()
      this.eventSourceRequest = null
    }

    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error("Connection closed"))
    }
    this.pendingRequests.clear()
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * 创建传输层
 */
export function createTransport(config: McpServerConfig): McpTransport & { start(): Promise<void> } {
  switch (config.transport) {
    case "stdio":
      return new StdioTransport(config)
    case "sse":
      return new SseTransport(config)
    default:
      throw new Error(`Unknown transport type: ${config.transport}`)
  }
}
