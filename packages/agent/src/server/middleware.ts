/**
 * HTTP Server 中间件
 *
 * 认证、CORS、错误处理
 */

import type { IncomingMessage, ServerResponse } from "http"
import type { ErrorCode, ErrorResponse } from "./types"

// ============================================================================
// Types
// ============================================================================

export type NextFunction = () => Promise<void> | void

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: NextFunction
) => Promise<void> | void

// ============================================================================
// Auth Middleware
// ============================================================================

/**
 * 创建认证中间件
 *
 * 如果 apiKey 为空，则跳过认证（本地 daemon 模式）
 */
export function createAuthMiddleware(apiKey: string): Middleware {
  return async (req, res, next) => {
    // 如果没有配置 apiKey，跳过认证（本地模式）
    if (!apiKey) {
      await next()
      return
    }

    const authHeader = req.headers.authorization

    if (!authHeader) {
      sendError(res, 401, "UNAUTHORIZED", "Missing Authorization header")
      return
    }

    const [type, token] = authHeader.split(" ")

    if (type !== "Bearer" || token !== apiKey) {
      sendError(res, 401, "UNAUTHORIZED", "Invalid API key")
      return
    }

    await next()
  }
}

// ============================================================================
// CORS Middleware
// ============================================================================

/**
 * 创建 CORS 中间件
 */
export function createCorsMiddleware(): Middleware {
  return async (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    res.setHeader("Access-Control-Max-Age", "86400")

    // 处理预检请求
    if (req.method === "OPTIONS") {
      res.statusCode = 204
      res.end()
      return
    }

    await next()
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * 发送错误响应
 */
export function sendError(
  res: ServerResponse,
  statusCode: number,
  code: ErrorCode,
  message: string
): void {
  const body: ErrorResponse = {
    error: { code, message },
  }

  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(body))
}

/**
 * 发送 JSON 响应
 */
export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(data))
}

/**
 * 解析请求体
 */
export async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = ""

    req.on("data", (chunk) => {
      body += chunk.toString()
    })

    req.on("end", () => {
      try {
        if (!body) {
          resolve({} as T)
          return
        }
        resolve(JSON.parse(body) as T)
      } catch (error) {
        reject(new Error("Invalid JSON body"))
      }
    })

    req.on("error", reject)
  })
}

/**
 * 解析 URL 查询参数
 */
export function parseQuery(url: string): Record<string, string> {
  const query: Record<string, string> = {}
  const questionIndex = url.indexOf("?")

  if (questionIndex === -1) {
    return query
  }

  const queryString = url.slice(questionIndex + 1)
  return parseQueryString(queryString)
}

/**
 * 解析查询字符串（不含 ?）
 */
export function parseQueryString(queryString: string): Record<string, string> {
  const query: Record<string, string> = {}

  if (!queryString) {
    return query
  }

  const pairs = queryString.split("&")

  for (const pair of pairs) {
    const [key, value] = pair.split("=")
    if (key) {
      query[decodeURIComponent(key)] = decodeURIComponent(value || "")
    }
  }

  return query
}

/**
 * 解析路径参数
 * 例如: /sessions/:id -> { id: "xxx" }
 */
export function matchRoute(
  pattern: string,
  path: string
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean)
  const pathParts = path.split("?")[0].split("/").filter(Boolean)

  if (patternParts.length !== pathParts.length) {
    return null
  }

  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]

    if (patternPart.startsWith(":")) {
      // 参数
      params[patternPart.slice(1)] = pathPart
    } else if (patternPart !== pathPart) {
      // 不匹配
      return null
    }
  }

  return params
}
