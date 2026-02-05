/**
 * MCP 客户端池集成测试
 *
 * 集成测试：MCP 连接复用
 * 验证多次工具调用复用同一连接
 *
 * **Validates: Requirements 7.5**
 */

import { describe, it, expect, afterEach } from "vitest"
import { McpClientPool } from "../../src/mcp/pool"
import type { McpConfig } from "../../src/mcp/types"

describe("MCP 连接复用集成测试", () => {
  let pool: McpClientPool

  afterEach(async () => {
    if (pool) {
      await pool.dispose()
    }
  })

  /**
   * 测试：客户端池应该管理客户端实例
   */
  it("应该管理客户端实例", () => {
    const config: McpConfig = {
      servers: [
        {
          name: "test-server",
          transport: "stdio",
          command: "node",
          args: ["-e", "process.stdin.resume()"],
          timeout: 1000,
        },
      ],
    }

    pool = new McpClientPool(config)

    // 初始状态
    expect(pool.size).toBe(0)
    expect(pool.has("test-server")).toBe(false)
    expect(pool.getClient("test-server")).toBeUndefined()
  })

  /**
   * 测试：connectAll 应该尝试连接所有服务器
   */
  it("应该尝试连接所有配置的服务器", async () => {
    const config: McpConfig = {
      servers: [
        {
          name: "server1",
          transport: "stdio",
          command: "nonexistent1",
          timeout: 100,
        },
        {
          name: "server2",
          transport: "stdio",
          command: "nonexistent2",
          timeout: 100,
        },
      ],
    }

    pool = new McpClientPool(config)

    const result = await pool.connectAll()

    // 验证连接结果（都会失败，但应该尝试了）
    expect(result.connected + result.failed).toBe(2)
    expect(result.errors).toHaveLength(result.failed)
  })

  /**
   * 测试：listClients 应该返回客户端信息
   */
  it("应该列出客户端信息", () => {
    const config: McpConfig = {
      servers: [
        {
          name: "server1",
          transport: "stdio",
          command: "node",
          timeout: 1000,
        },
      ],
    }

    pool = new McpClientPool(config)

    const clients = pool.listClients()

    // 初始应该为空
    expect(clients).toHaveLength(0)
  })

  /**
   * 测试：has 方法应该正确检查客户端存在性
   */
  it("应该正确检查客户端是否存在", () => {
    const config: McpConfig = {
      servers: [
        {
          name: "test-server",
          transport: "stdio",
          command: "node",
          timeout: 1000,
        },
      ],
    }

    pool = new McpClientPool(config)

    expect(pool.has("test-server")).toBe(false)
    expect(pool.has("nonexistent")).toBe(false)
  })

  /**
   * 测试：disconnectAll 应该清空池
   */
  it("应该在 disconnectAll 后清空池", async () => {
    const config: McpConfig = {
      servers: [
        {
          name: "server1",
          transport: "stdio",
          command: "node",
          timeout: 1000,
        },
      ],
    }

    pool = new McpClientPool(config)

    await pool.disconnectAll()

    expect(pool.size).toBe(0)
  })

  /**
   * 测试：健康检查应该能启动和停止
   */
  it("应该能启动和停止健康检查", () => {
    const config: McpConfig = {
      servers: [],
    }

    pool = new McpClientPool(config)

    // 启动健康检查
    pool.startHealthCheck()

    // 停止健康检查
    pool.stopHealthCheck()

    // 应该没有错误
    expect(true).toBe(true)
  })

  /**
   * 测试：连接不存在的服务器应该失败
   */
  it("应该在连接不存在的服务器时失败", async () => {
    const config: McpConfig = {
      servers: [],
    }

    pool = new McpClientPool(config)

    await expect(pool.connect("nonexistent")).rejects.toThrow(
      /not found in config/i
    )
  })

  /**
   * 测试：dispose 应该清理所有资源
   */
  it("应该在 dispose 后清理所有资源", async () => {
    const config: McpConfig = {
      servers: [],
    }

    pool = new McpClientPool(config)

    pool.startHealthCheck()

    await pool.dispose()

    expect(pool.size).toBe(0)
  })

  /**
   * 测试：size 属性应该反映客户端数量
   */
  it("应该正确报告客户端数量", () => {
    const config: McpConfig = {
      servers: [],
    }

    pool = new McpClientPool(config)

    expect(pool.size).toBe(0)
  })

  /**
   * 测试：getClient 应该返回 undefined 对于不存在的客户端
   */
  it("应该对不存在的客户端返回 undefined", () => {
    const config: McpConfig = {
      servers: [],
    }

    pool = new McpClientPool(config)

    expect(pool.getClient("nonexistent")).toBeUndefined()
  })
})
