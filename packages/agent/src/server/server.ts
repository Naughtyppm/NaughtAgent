/**
 * HTTP Server 主体
 *
 * 创建和管理 HTTP 服务器，集成路由和 WebSocket
 */

import * as http from "http"
import type { ServerConfig } from "./types"
import { createRoutes } from "./routes"
import { createWebSocketHandler } from "./websocket"
import {
  createAuthMiddleware,
  createCorsMiddleware,
  sendError,
  type Middleware,
} from "./middleware"

// ============================================================================
// Server
// ============================================================================

/**
 * 创建 HTTP Server
 */
export function createServer(config: ServerConfig) {
  const {
    port = 3000,
    host = "localhost",
    apiKey,
    cors = true,
  } = config

  // 创建路由处理器
  const routes = createRoutes(config)

  // 创建 WebSocket 处理器
  const wsHandler = createWebSocketHandler(config, routes.getActiveSessions())

  // 中间件
  const middlewares: Middleware[] = []

  if (cors) {
    middlewares.push(createCorsMiddleware())
  }

  // 认证中间件（排除健康检查）
  const authMiddleware = createAuthMiddleware(apiKey)

  // 创建 HTTP 服务器
  const server = http.createServer(async (req, res) => {
    const url = req.url || "/"

    try {
      // 执行 CORS 中间件
      for (const middleware of middlewares) {
        let nextCalled = false
        await middleware(req, res, () => {
          nextCalled = true
        })
        if (!nextCalled) return // 中间件已处理响应
      }

      // 健康检查不需要认证
      if (url === "/health" && req.method === "GET") {
        await routes.handleRequest(req, res)
        return
      }

      // 认证
      let authPassed = false
      await authMiddleware(req, res, () => {
        authPassed = true
      })
      if (!authPassed) return

      // 处理请求
      await routes.handleRequest(req, res)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      sendError(res, 500, "INTERNAL_ERROR", message)
    }
  })

  // 处理 WebSocket 升级
  server.on("upgrade", (req, socket, head) => {
    wsHandler.handleUpgrade(req, socket, head)
  })

  // 服务器状态
  let isRunning = false

  return {
    /**
     * 启动服务器
     */
    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.listen(port, host, () => {
          isRunning = true
          resolve()
        })
        server.on("error", reject)
      })
    },

    /**
     * 停止服务器
     */
    async stop(): Promise<void> {
      // 关闭 WebSocket 连接
      wsHandler.closeAll()

      // 停止调度器
      await routes.stopScheduler()

      // 清理会话
      routes.clearSessions()

      // 关闭服务器
      return new Promise((resolve, reject) => {
        server.close((err) => {
          isRunning = false
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    },

    /**
     * 获取服务器地址
     */
    getAddress(): { host: string; port: number } | null {
      const addr = server.address()
      if (!addr || typeof addr === "string") {
        return null
      }
      return { host: addr.address, port: addr.port }
    },

    /**
     * 是否正在运行
     */
    isRunning(): boolean {
      return isRunning
    },

    /**
     * 获取活跃会话数
     */
    getSessionCount(): number {
      return routes.getActiveSessions().size
    },

    /**
     * 获取 WebSocket 连接数
     */
    getConnectionCount(): number {
      return wsHandler.getConnectionCount()
    },

    /**
     * 获取底层 HTTP 服务器（用于测试）
     */
    getHttpServer(): http.Server {
      return server
    },
  }
}

export type Server = ReturnType<typeof createServer>
