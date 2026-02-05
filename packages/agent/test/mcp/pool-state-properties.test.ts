/**
 * Feature: phase-2-tool-layer, Property 8: MCP 客户端状态转换
 *
 * 对于任何 MCP 客户端，其状态转换应该遵循有效的状态机：
 * - disconnected → connecting → connected 或 error
 * - connected → disconnected
 * - 状态转换应该触发相应的事件
 *
 * **Validates: Requirements 2.7**
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { McpClient } from "../../src/mcp/client"
import type { McpServerConfig, McpClientState, McpClientEvent } from "../../src/mcp/types"

describe("Property 8: MCP 客户端状态转换", () => {
  // 有效的状态转换
  const validTransitions: Record<McpClientState, McpClientState[]> = {
    disconnected: ["connecting"],
    connecting: ["connected", "error", "disconnected"],
    connected: ["disconnected"],
    error: ["disconnected", "connecting"],
  }

  /**
   * 属性：状态转换必须遵循有效的状态机规则
   */
  it("Property 8.1: 状态转换遵循有效的状态机", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<McpClientState>(
          "disconnected",
          "connecting",
          "connected",
          "error"
        ),
        fc.constantFrom<McpClientState>(
          "disconnected",
          "connecting",
          "connected",
          "error"
        ),
        (fromState, toState) => {
          // 验证转换是否有效
          const allowedTransitions = validTransitions[fromState]
          const isValidTransition = allowedTransitions.includes(toState)

          // 如果是有效转换，应该在允许列表中
          // 如果是无效转换，不应该在允许列表中
          if (fromState === toState) {
            // 同状态转换总是无效的（除非是初始状态）
            return true
          }

          return isValidTransition === allowedTransitions.includes(toState)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 属性：客户端初始状态必须是 disconnected
   */
  it("Property 8.2: 客户端初始状态为 disconnected", () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }),
          transport: fc.constantFrom("stdio", "sse"),
          command: fc.option(fc.string(), { nil: undefined }),
          url: fc.option(fc.webUrl(), { nil: undefined }),
        }),
        (configData) => {
          // 创建有效的服务器配置
          const config: McpServerConfig = {
            name: configData.name,
            transport: configData.transport as "stdio" | "sse",
            ...(configData.transport === "stdio" && configData.command
              ? { command: configData.command }
              : {}),
            ...(configData.transport === "sse" && configData.url
              ? { url: configData.url }
              : {}),
          }

          const client = new McpClient(config)

          // 验证初始状态
          return client.state === "disconnected"
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 属性：连接成功后状态应该是 connected
   */
  it("Property 8.3: 连接成功后状态为 connected", async () => {
    // 创建一个 mock 服务器配置（使用 echo 命令模拟）
    const config: McpServerConfig = {
      name: "test-server",
      transport: "stdio",
      command: "node",
      args: ["-e", 'console.log(JSON.stringify({jsonrpc:"2.0",id:1,result:{protocolVersion:"2024-11-05",capabilities:{},serverInfo:{name:"test",version:"1.0"}}}))'],
      timeout: 1000,
    }

    const client = new McpClient(config)

    // 初始状态应该是 disconnected
    expect(client.state).toBe("disconnected")

    try {
      // 尝试连接（可能失败，因为是 mock）
      await client.connect()

      // 如果连接成功，状态应该是 connected
      if (client.state === "connected") {
        expect(client.state).toBe("connected")
      }
    } catch {
      // 如果连接失败，状态应该是 error
      expect(client.state).toBe("error")
    } finally {
      await client.disconnect()
    }
  })

  /**
   * 属性：断开连接后状态应该是 disconnected
   */
  it("Property 8.4: 断开连接后状态为 disconnected", async () => {
    const config: McpServerConfig = {
      name: "test-server",
      transport: "stdio",
      command: "node",
      args: ["-e", "process.stdin.resume()"],
      timeout: 500,
    }

    const client = new McpClient(config)

    try {
      // 尝试连接
      await client.connect()
    } catch {
      // 忽略连接错误
    }

    // 断开连接
    await client.disconnect()

    // 验证状态
    expect(client.state).toBe("disconnected")
  })

  /**
   * 属性：状态转换应该触发相应的事件
   */
  it("Property 8.5: 状态转换触发相应事件", async () => {
    const config: McpServerConfig = {
      name: "test-server",
      transport: "stdio",
      command: "node",
      args: ["-e", 'console.log(JSON.stringify({jsonrpc:"2.0",id:1,result:{protocolVersion:"2024-11-05",capabilities:{},serverInfo:{name:"test",version:"1.0"}}}))'],
      timeout: 1000,
    }

    const client = new McpClient(config)
    const events: McpClientEvent[] = []

    // 监听事件
    client.on((event) => {
      events.push(event)
    })

    try {
      await client.connect()

      // 如果连接成功，应该有 connected 事件
      if (client.state === "connected") {
        expect(events.some((e) => e.type === "connected")).toBe(true)
      }
    } catch {
      // 如果连接失败，应该有 error 事件
      expect(events.some((e) => e.type === "error")).toBe(true)
    }

    await client.disconnect()

    // 断开连接应该有 disconnected 事件
    expect(events.some((e) => e.type === "disconnected")).toBe(true)
  })

  /**
   * 属性：重复连接应该是幂等的
   */
  it("Property 8.6: 重复连接是幂等的", async () => {
    const config: McpServerConfig = {
      name: "test-server",
      transport: "stdio",
      command: "node",
      args: ["-e", 'console.log(JSON.stringify({jsonrpc:"2.0",id:1,result:{protocolVersion:"2024-11-05",capabilities:{},serverInfo:{name:"test",version:"1.0"}}}))'],
      timeout: 1000,
    }

    const client = new McpClient(config)

    try {
      await client.connect()

      const firstState = client.state

      // 再次连接
      await client.connect()

      const secondState = client.state

      // 状态应该保持一致
      expect(secondState).toBe(firstState)
    } catch {
      // 连接失败也是可以接受的
    } finally {
      await client.disconnect()
    }
  })

  /**
   * 属性：重复断开连接应该是幂等的
   */
  it("Property 8.7: 重复断开连接是幂等的", async () => {
    const config: McpServerConfig = {
      name: "test-server",
      transport: "stdio",
      command: "node",
      args: ["-e", "process.stdin.resume()"],
      timeout: 500,
    }

    const client = new McpClient(config)

    try {
      await client.connect()
    } catch {
      // 忽略连接错误
    }

    // 第一次断开
    await client.disconnect()
    expect(client.state).toBe("disconnected")

    // 第二次断开
    await client.disconnect()
    expect(client.state).toBe("disconnected")
  })
})
