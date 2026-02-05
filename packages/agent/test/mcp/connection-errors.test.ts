/**
 * MCP 连接失败的单元测试
 *
 * 测试 MCP 服务器不可达时返回 ConnectionError
 *
 * **Validates: Requirements 8.2**
 */

import { describe, it, expect } from "vitest"
import { McpClient } from "../../src/mcp/client"
import { connectWithRetry } from "../../src/mcp/retry"
import type { McpServerConfig } from "../../src/mcp/types"

describe("MCP 连接失败测试", () => {
  /**
   * 测试：MCP 服务器不可达返回 ConnectionError
   */
  it("应该在服务器不可达时返回错误", async () => {
    const config: McpServerConfig = {
      name: "unreachable-server",
      transport: "stdio",
      command: "nonexistent-command-that-does-not-exist",
      timeout: 500,
    }

    const client = new McpClient(config)

    // 尝试连接应该失败
    await expect(client.connect()).rejects.toThrow()

    // 验证状态
    expect(client.state).toBe("error")
  })

  /**
   * 测试：stdio 传输连接失败
   */
  it("应该在 stdio 命令不存在时失败", async () => {
    const config: McpServerConfig = {
      name: "invalid-stdio",
      transport: "stdio",
      command: "this-command-does-not-exist",
      timeout: 500,
    }

    const client = new McpClient(config)

    await expect(client.connect()).rejects.toThrow()
  })

  /**
   * 测试：SSE 传输连接失败
   */
  it("应该在 SSE URL 无效时失败", async () => {
    const config: McpServerConfig = {
      name: "invalid-sse",
      transport: "sse",
      url: "http://localhost:99999/nonexistent",
      timeout: 500,
    }

    const client = new McpClient(config)

    await expect(client.connect()).rejects.toThrow()
  })

  /**
   * 测试：连接超时
   */
  it("应该在连接超时时失败", async () => {
    const config: McpServerConfig = {
      name: "timeout-server",
      transport: "stdio",
      command: "node",
      args: ["-e", "setTimeout(() => {}, 10000)"], // 长时间运行
      timeout: 100, // 短超时
    }

    const client = new McpClient(config)

    await expect(client.connect()).rejects.toThrow(/timeout/i)
  })

  /**
   * 测试：重试后仍然失败
   */
  it("应该在所有重试失败后返回错误", async () => {
    const config: McpServerConfig = {
      name: "retry-fail-server",
      transport: "stdio",
      command: "nonexistent-command",
      timeout: 100,
    }

    const client = new McpClient(config)

    const result = await connectWithRetry(client, {
      maxAttempts: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
    })

    // 验证结果
    expect(result.success).toBe(false)
    expect(result.attempts).toBe(3)
    expect(result.lastError).toBeDefined()
    expect(result.lastError?.message).toBeTruthy()
  })

  /**
   * 测试：连接失败后状态应该是 error
   */
  it("应该在连接失败后设置状态为 error", async () => {
    const config: McpServerConfig = {
      name: "error-state-server",
      transport: "stdio",
      command: "invalid-command",
      timeout: 500,
    }

    const client = new McpClient(config)

    try {
      await client.connect()
    } catch {
      // 忽略错误
    }

    expect(client.state).toBe("error")
  })

  /**
   * 测试：连接失败后应该触发 error 事件
   */
  it("应该在连接失败时触发 error 事件", async () => {
    const config: McpServerConfig = {
      name: "event-error-server",
      transport: "stdio",
      command: "nonexistent",
      timeout: 500,
    }

    const client = new McpClient(config)
    let errorEvent: Error | null = null

    client.on((event) => {
      if (event.type === "error") {
        errorEvent = event.error
      }
    })

    try {
      await client.connect()
    } catch {
      // 忽略错误
    }

    expect(errorEvent).toBeDefined()
    expect(errorEvent).toBeInstanceOf(Error)
  })

  /**
   * 测试：缺少必需配置时应该失败
   */
  it("应该在 stdio 缺少 command 时失败", async () => {
    const config: McpServerConfig = {
      name: "no-command",
      transport: "stdio",
      // 缺少 command
    }

    const client = new McpClient(config)

    await expect(client.connect()).rejects.toThrow(/command.*required/i)
  })

  /**
   * 测试：缺少 URL 时应该失败
   */
  it("应该在 SSE 缺少 URL 时失败", async () => {
    const config: McpServerConfig = {
      name: "no-url",
      transport: "sse",
      // 缺少 url
    }

    const client = new McpClient(config)

    await expect(client.connect()).rejects.toThrow(/url.*required/i)
  })
})
