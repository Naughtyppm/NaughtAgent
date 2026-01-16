/**
 * Server 测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import * as http from "http"
import { createServer, type Server } from "../../src/server"

// 测试配置
const TEST_PORT = 13579
const TEST_API_KEY = "test-api-key"
const TEST_CLAUDE_KEY = "test-claude-key"

// HTTP 请求辅助函数
async function request(
  method: string,
  path: string,
  options?: {
    body?: unknown
    headers?: Record<string, string>
    auth?: boolean
  }
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options?.headers,
    }

    if (options?.auth !== false) {
      headers["Authorization"] = `Bearer ${TEST_API_KEY}`
    }

    const req = http.request(
      {
        hostname: "localhost",
        port: TEST_PORT,
        path,
        method,
        headers,
      },
      (res) => {
        let body = ""
        res.on("data", (chunk) => {
          body += chunk
        })
        res.on("end", () => {
          let data: unknown = body
          try {
            data = JSON.parse(body)
          } catch {
            // 保持原始字符串
          }
          resolve({ status: res.statusCode || 0, data })
        })
      }
    )

    req.on("error", reject)

    if (options?.body) {
      req.write(JSON.stringify(options.body))
    }

    req.end()
  })
}

describe("Server", () => {
  let server: Server

  beforeAll(async () => {
    server = createServer({
      port: TEST_PORT,
      host: "localhost",
      apiKey: TEST_API_KEY,
      claudeApiKey: TEST_CLAUDE_KEY,
      cors: true,
      autoConfirm: true,
    })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe("Health Check", () => {
    it("should return health status without auth", async () => {
      const { status, data } = await request("GET", "/health", { auth: false })
      expect(status).toBe(200)
      expect(data).toEqual({ status: "ok", version: "0.1.0" })
    })
  })

  describe("Authentication", () => {
    it("should reject requests without auth header", async () => {
      const { status, data } = await request("GET", "/sessions/test", { auth: false })
      expect(status).toBe(401)
      expect((data as any).error.code).toBe("UNAUTHORIZED")
    })

    it("should reject requests with invalid token", async () => {
      const { status, data } = await request("GET", "/sessions/test", {
        auth: false,
        headers: { Authorization: "Bearer invalid-key" },
      })
      expect(status).toBe(401)
      expect((data as any).error.code).toBe("UNAUTHORIZED")
    })

    it("should accept requests with valid token", async () => {
      const { status } = await request("GET", "/sessions/nonexistent")
      // 404 表示认证通过，只是会话不存在
      expect(status).toBe(404)
    })
  })

  describe("CORS", () => {
    it("should handle OPTIONS preflight", async () => {
      const { status } = await request("OPTIONS", "/sessions", { auth: false })
      expect(status).toBe(204)
    })
  })

  describe("Sessions", () => {
    let sessionId: string

    it("should create a session", async () => {
      const { status, data } = await request("POST", "/sessions", {
        body: { agentType: "build" },
      })

      expect(status).toBe(201)
      expect((data as any).id).toBeDefined()
      expect((data as any).agentType).toBe("build")
      sessionId = (data as any).id
    })

    it("should get a session", async () => {
      const { status, data } = await request("GET", `/sessions/${sessionId}`)

      expect(status).toBe(200)
      expect((data as any).id).toBe(sessionId)
      expect((data as any).messageCount).toBe(0)
    })

    it("should return 404 for non-existent session", async () => {
      const { status, data } = await request("GET", "/sessions/nonexistent")

      expect(status).toBe(404)
      expect((data as any).error.code).toBe("SESSION_NOT_FOUND")
    })

    it("should delete a session", async () => {
      // 先创建一个新会话
      const createRes = await request("POST", "/sessions", {
        body: { agentType: "plan" },
      })
      const newSessionId = (createRes.data as any).id

      // 删除会话
      const { status } = await request("DELETE", `/sessions/${newSessionId}`)
      expect(status).toBe(204)

      // 确认已删除
      const getRes = await request("GET", `/sessions/${newSessionId}`)
      expect(getRes.status).toBe(404)
    })
  })

  describe("Skills", () => {
    it("should list available skills", async () => {
      const { status, data } = await request("GET", "/skills")

      expect(status).toBe(200)
      expect((data as any).skills).toBeDefined()
      expect(Array.isArray((data as any).skills)).toBe(true)
    })

    it("should return 404 for non-existent skill", async () => {
      const { status, data } = await request("POST", "/skills/nonexistent", {
        body: {},
      })

      expect(status).toBe(404)
      expect((data as any).error.code).toBe("SKILL_NOT_FOUND")
    })
  })

  describe("404 Handling", () => {
    it("should return 404 for unknown routes", async () => {
      const { status, data } = await request("GET", "/unknown/route")

      expect(status).toBe(404)
      expect((data as any).error.code).toBe("NOT_FOUND")
    })
  })
})

describe("Server Lifecycle", () => {
  it("should start and stop correctly", async () => {
    const server = createServer({
      port: TEST_PORT + 1,
      host: "localhost",
      apiKey: "test",
      claudeApiKey: "test",
    })

    expect(server.isRunning()).toBe(false)

    await server.start()
    expect(server.isRunning()).toBe(true)

    const addr = server.getAddress()
    expect(addr).not.toBeNull()
    expect(addr?.port).toBe(TEST_PORT + 1)

    await server.stop()
    expect(server.isRunning()).toBe(false)
  })

  it("should track session count", async () => {
    const server = createServer({
      port: TEST_PORT + 2,
      host: "localhost",
      apiKey: TEST_API_KEY,
      claudeApiKey: "test",
    })

    await server.start()
    expect(server.getSessionCount()).toBe(0)

    // 创建会话
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "localhost",
          port: TEST_PORT + 2,
          path: "/sessions",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        },
        (res) => {
          res.on("data", () => {})
          res.on("end", () => resolve())
        }
      )
      req.on("error", reject)
      req.write(JSON.stringify({}))
      req.end()
    })

    expect(server.getSessionCount()).toBe(1)

    await server.stop()
  })
})
