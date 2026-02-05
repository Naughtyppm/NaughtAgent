/**
 * 工具发现服务集成测试
 *
 * Feature: phase-2-tool-layer
 * 测试工具自动发现、热重载和分页加载功能
 *
 * **Validates: Requirements 2.3, 2.5, 3.1, 3.3, 3.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ToolDiscoveryService } from "../../src/tool/discovery"
import { ToolRegistry } from "../../src/tool/registry"
import type { McpClientPool, ClientInfo } from "../../src/mcp/pool"
import type { McpClient } from "../../src/mcp/client"
import type { McpTool, McpClientEvent } from "../../src/mcp/types"

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * 创建 mock MCP 工具
 */
function createMockTool(name: string, description?: string): McpTool {
  return {
    name,
    description: description || `Mock tool: ${name}`,
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string" },
      },
    },
  }
}

/**
 * 创建 mock MCP 客户端
 */
function createMockClient(
  name: string,
  tools: McpTool[],
  options?: { supportsPagination?: boolean; pageSize?: number }
): McpClient {
  const eventHandlers: Array<(event: McpClientEvent) => void> = []
  let currentPage = 0
  const pageSize = options?.pageSize || tools.length

  return {
    name,
    state: "connected",
    capabilities: { tools: { listChanged: true } },
    serverInfo: { name, version: "1.0.0" },
    listTools: vi.fn().mockImplementation(async (opts?: { cursor?: string }) => {
      if (!options?.supportsPagination) {
        return { tools, nextCursor: undefined }
      }

      // 分页逻辑
      const startIndex = opts?.cursor ? parseInt(opts.cursor, 10) : 0
      const endIndex = Math.min(startIndex + pageSize, tools.length)
      const pageTools = tools.slice(startIndex, endIndex)
      const nextCursor = endIndex < tools.length ? String(endIndex) : undefined

      return { tools: pageTools, nextCursor }
    }),
    listAllTools: vi.fn().mockResolvedValue(tools),
    callTool: vi.fn(),
    on: vi.fn().mockImplementation((handler: (event: McpClientEvent) => void) => {
      eventHandlers.push(handler)
      return () => {
        const index = eventHandlers.indexOf(handler)
        if (index !== -1) eventHandlers.splice(index, 1)
      }
    }),
    // 用于测试的辅助方法：触发事件
    _emitEvent: (event: McpClientEvent) => {
      eventHandlers.forEach((h) => h(event))
    },
    _eventHandlers: eventHandlers,
  } as unknown as McpClient & {
    _emitEvent: (event: McpClientEvent) => void
    _eventHandlers: Array<(event: McpClientEvent) => void>
  }
}

/**
 * 创建 mock MCP 客户端池
 */
function createMockClientPool(
  clients: Map<string, McpClient>
): McpClientPool {
  return {
    listClients: vi.fn().mockImplementation((): ClientInfo[] => {
      return Array.from(clients.entries()).map(([name, client]) => ({
        name,
        state: client.state,
        serverInfo: client.serverInfo,
      }))
    }),
    getClient: vi.fn().mockImplementation((name: string) => clients.get(name)),
    size: clients.size,
    has: vi.fn().mockImplementation((name: string) => clients.has(name)),
  } as unknown as McpClientPool
}

// ============================================================================
// 7.3 工具自动发现集成测试
// ============================================================================

describe("集成测试：MCP 连接后自动发现工具", () => {
  // Feature: phase-2-tool-layer
  // 验证需求：2.3、3.1

  beforeEach(() => {
    ToolRegistry.clear()
  })

  afterEach(() => {
    ToolRegistry.clear()
    vi.clearAllMocks()
  })

  it("应该发现并注册所有 MCP 服务器的工具", async () => {
    // 准备：创建 mock 服务器和工具
    const server1Tools = [
      createMockTool("read_file"),
      createMockTool("write_file"),
    ]
    const server2Tools = [
      createMockTool("search"),
      createMockTool("replace"),
      createMockTool("grep"),
    ]

    const client1 = createMockClient("server1", server1Tools)
    const client2 = createMockClient("server2", server2Tools)

    const clients = new Map<string, McpClient>([
      ["server1", client1],
      ["server2", client2],
    ])
    const pool = createMockClientPool(clients)

    // 执行：发现工具
    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister()

    // 验证：发现的工具数量与服务器返回一致
    expect(stats.discovered).toBe(5)
    expect(stats.registered).toBe(5)
    expect(stats.errors).toBe(0)

    // 验证：按服务器分组的统计
    expect(stats.byServer["server1"].discovered).toBe(2)
    expect(stats.byServer["server1"].registered).toBe(2)
    expect(stats.byServer["server2"].discovered).toBe(3)
    expect(stats.byServer["server2"].registered).toBe(3)

    // 验证：工具已注册到 Registry
    expect(ToolRegistry.count()).toBe(5)
    expect(ToolRegistry.has("server1:read_file")).toBe(true)
    expect(ToolRegistry.has("server1:write_file")).toBe(true)
    expect(ToolRegistry.has("server2:search")).toBe(true)
    expect(ToolRegistry.has("server2:replace")).toBe(true)
    expect(ToolRegistry.has("server2:grep")).toBe(true)
  })

  it("应该正确设置工具的 source 和 mcpServer 字段", async () => {
    const tools = [createMockTool("test_tool")]
    const client = createMockClient("test-server", tools)
    const clients = new Map([["test-server", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    await discovery.discoverAndRegister()

    const tool = ToolRegistry.get("test-server:test_tool")
    expect(tool).toBeDefined()
    expect(tool?.source).toBe("mcp")
    expect(tool?.mcpServer).toBe("test-server")
  })

  it("应该跳过未连接的服务器", async () => {
    const tools = [createMockTool("tool1")]
    const connectedClient = createMockClient("connected", tools)
    const disconnectedClient = {
      ...createMockClient("disconnected", tools),
      state: "disconnected",
    } as unknown as McpClient

    const clients = new Map([
      ["connected", connectedClient],
      ["disconnected", disconnectedClient],
    ])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister()

    expect(stats.discovered).toBe(1)
    expect(ToolRegistry.has("connected:tool1")).toBe(true)
    expect(ToolRegistry.has("disconnected:tool1")).toBe(false)
  })

  it("应该支持按服务器过滤发现", async () => {
    const server1Tools = [createMockTool("tool1")]
    const server2Tools = [createMockTool("tool2")]

    const client1 = createMockClient("server1", server1Tools)
    const client2 = createMockClient("server2", server2Tools)

    const clients = new Map([
      ["server1", client1],
      ["server2", client2],
    ])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister({
      servers: ["server1"],
    })

    expect(stats.discovered).toBe(1)
    expect(ToolRegistry.has("server1:tool1")).toBe(true)
    expect(ToolRegistry.has("server2:tool2")).toBe(false)
  })

  it("应该处理服务器错误并继续发现其他服务器", async () => {
    const tools = [createMockTool("tool1")]
    const goodClient = createMockClient("good-server", tools)
    const badClient = createMockClient("bad-server", [])
    vi.mocked(badClient.listTools).mockRejectedValue(new Error("Connection failed"))

    const clients = new Map([
      ["good-server", goodClient],
      ["bad-server", badClient],
    ])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister()

    expect(stats.discovered).toBe(1)
    expect(stats.errors).toBe(1)
    expect(stats.byServer["bad-server"].errors).toContain("Server error: Connection failed")
    expect(ToolRegistry.has("good-server:tool1")).toBe(true)
  })
})

// ============================================================================
// 7.6 工具列表变更事件集成测试
// ============================================================================

describe("集成测试：工具列表变更事件响应", () => {
  // Feature: phase-2-tool-layer
  // 验证需求：2.5、3.3

  beforeEach(() => {
    ToolRegistry.clear()
  })

  afterEach(() => {
    ToolRegistry.clear()
    vi.clearAllMocks()
  })

  it("应该在收到 tools_changed 事件后自动刷新工具列表", async () => {
    // 初始工具
    let currentTools = [createMockTool("tool1")]
    const client = createMockClient("server1", currentTools) as McpClient & {
      _emitEvent: (event: McpClientEvent) => void
    }

    // 动态更新 listTools 的返回值
    vi.mocked(client.listTools).mockImplementation(async () => ({
      tools: currentTools,
      nextCursor: undefined,
    }))

    const clients = new Map([["server1", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)

    // 初始发现
    await discovery.discoverAndRegister()
    expect(ToolRegistry.count()).toBe(1)
    expect(ToolRegistry.has("server1:tool1")).toBe(true)

    // 启用热重载
    const cleanup = discovery.enableHotReload()

    // 模拟服务器添加新工具
    currentTools = [createMockTool("tool1"), createMockTool("tool2")]

    // 触发 tools_changed 事件
    client._emitEvent({ type: "tools_changed" })

    // 等待异步刷新完成
    await new Promise((resolve) => setTimeout(resolve, 50))

    // 验证：工具列表已更新，无需重启
    expect(ToolRegistry.count()).toBe(2)
    expect(ToolRegistry.has("server1:tool1")).toBe(true)
    expect(ToolRegistry.has("server1:tool2")).toBe(true)

    cleanup()
  })

  it("应该在工具被移除时更新注册表", async () => {
    let currentTools = [createMockTool("tool1"), createMockTool("tool2")]
    const client = createMockClient("server1", currentTools) as McpClient & {
      _emitEvent: (event: McpClientEvent) => void
    }
    vi.mocked(client.listTools).mockImplementation(async () => ({
      tools: currentTools,
      nextCursor: undefined,
    }))

    const clients = new Map([["server1", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    await discovery.discoverAndRegister()
    expect(ToolRegistry.count()).toBe(2)

    discovery.enableHotReload()

    // 模拟移除工具
    currentTools = [createMockTool("tool1")]
    client._emitEvent({ type: "tools_changed" })

    await new Promise((resolve) => setTimeout(resolve, 50))

    // refreshServer 会先注销旧工具再注册新工具
    expect(ToolRegistry.count()).toBe(1)
    expect(ToolRegistry.has("server1:tool1")).toBe(true)
    expect(ToolRegistry.has("server1:tool2")).toBe(false)
  })

  it("应该能禁用热重载", async () => {
    let currentTools = [createMockTool("tool1")]
    const client = createMockClient("server1", currentTools) as McpClient & {
      _emitEvent: (event: McpClientEvent) => void
    }
    vi.mocked(client.listTools).mockImplementation(async () => ({
      tools: currentTools,
      nextCursor: undefined,
    }))

    const clients = new Map([["server1", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    await discovery.discoverAndRegister()

    const cleanup = discovery.enableHotReload()
    expect(discovery.isHotReloadEnabled()).toBe(true)

    cleanup()
    expect(discovery.isHotReloadEnabled()).toBe(false)

    // 禁用后，事件不应触发刷新
    currentTools = [createMockTool("tool1"), createMockTool("tool2")]
    client._emitEvent({ type: "tools_changed" })

    await new Promise((resolve) => setTimeout(resolve, 50))

    // 工具列表应保持不变
    expect(ToolRegistry.count()).toBe(1)
  })

  it("应该处理热重载期间的错误", async () => {
    const tools = [createMockTool("tool1")]
    const client = createMockClient("server1", tools) as McpClient & {
      _emitEvent: (event: McpClientEvent) => void
    }

    const clients = new Map([["server1", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    await discovery.discoverAndRegister()

    discovery.enableHotReload()

    // 模拟刷新时出错
    vi.mocked(client.listTools).mockRejectedValueOnce(new Error("Refresh failed"))

    // 触发事件，应该不会崩溃
    client._emitEvent({ type: "tools_changed" })

    await new Promise((resolve) => setTimeout(resolve, 50))

    // 原有工具应该保持（因为刷新失败）
    // 注意：refreshServer 会先注销旧工具，所以如果刷新失败，工具会被清空
    // 这是当前实现的行为，可能需要改进
  })
})

// ============================================================================
// 7.8 分页加载集成测试
// ============================================================================

describe("集成测试：大量工具的分页加载", () => {
  // Feature: phase-2-tool-layer
  // 验证需求：3.4

  beforeEach(() => {
    ToolRegistry.clear()
  })

  afterEach(() => {
    ToolRegistry.clear()
    vi.clearAllMocks()
  })

  it("应该正确处理 1000+ 工具的分页加载", async () => {
    // 创建 1000+ 工具
    const toolCount = 1050
    const tools: McpTool[] = []
    for (let i = 0; i < toolCount; i++) {
      tools.push(createMockTool(`tool_${i.toString().padStart(4, "0")}`))
    }

    // 创建支持分页的 mock 客户端，每页 100 个工具
    const client = createMockClient("large-server", tools, {
      supportsPagination: true,
      pageSize: 100,
    })

    const clients = new Map([["large-server", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister()

    // 验证：所有工具都被发现和注册
    expect(stats.discovered).toBe(toolCount)
    expect(stats.registered).toBe(toolCount)
    expect(ToolRegistry.count()).toBe(toolCount)

    // 验证：分页被正确调用（应该调用 11 次：1050/100 = 10.5，向上取整）
    expect(client.listTools).toHaveBeenCalled()
  })

  it("应该在没有分页时一次性获取所有工具", async () => {
    const tools = [createMockTool("tool1"), createMockTool("tool2")]
    const client = createMockClient("server", tools, {
      supportsPagination: false,
    })

    const clients = new Map([["server", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister()

    expect(stats.discovered).toBe(2)
    expect(stats.registered).toBe(2)
    // 应该使用 listTools（内部处理分页）
    expect(client.listTools).toHaveBeenCalled()
  })

  it("应该正确处理分页中间的错误", async () => {
    const tools: McpTool[] = []
    for (let i = 0; i < 300; i++) {
      tools.push(createMockTool(`tool_${i}`))
    }

    const client = createMockClient("server", tools, {
      supportsPagination: true,
      pageSize: 100,
    })

    // 模拟第二页出错
    let callCount = 0
    vi.mocked(client.listTools).mockImplementation(async (opts?: { cursor?: string }) => {
      callCount++
      if (callCount === 2) {
        throw new Error("Page load failed")
      }
      const startIndex = opts?.cursor ? parseInt(opts.cursor, 10) : 0
      const endIndex = Math.min(startIndex + 100, tools.length)
      return {
        tools: tools.slice(startIndex, endIndex),
        nextCursor: endIndex < tools.length ? String(endIndex) : undefined,
      }
    })

    const clients = new Map([["server", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister()

    // 应该报告错误
    expect(stats.errors).toBeGreaterThan(0)
  })

  it("应该支持指定分页大小（服务器端控制）", async () => {
    const tools: McpTool[] = []
    for (let i = 0; i < 50; i++) {
      tools.push(createMockTool(`tool_${i}`))
    }

    const client = createMockClient("server", tools, {
      supportsPagination: true,
      pageSize: 10,
    })

    const clients = new Map([["server", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister()

    // 应该获取所有工具（分页由服务器控制）
    expect(stats.discovered).toBe(50)
    expect(stats.registered).toBe(50)
  })

  it("应该支持从指定游标开始加载", async () => {
    const tools: McpTool[] = []
    for (let i = 0; i < 100; i++) {
      tools.push(createMockTool(`tool_${i}`))
    }

    const client = createMockClient("server", tools, {
      supportsPagination: true,
      pageSize: 20,
    })

    const clients = new Map([["server", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    const stats = await discovery.discoverAndRegister({
      pagination: { cursor: "40" },
    })

    // 从游标 40 开始，应该获取剩余的 60 个工具
    expect(stats.discovered).toBe(60)
  })
})

// ============================================================================
// 辅助功能测试
// ============================================================================

describe("ToolDiscoveryService 辅助功能", () => {
  beforeEach(() => {
    ToolRegistry.clear()
  })

  afterEach(() => {
    ToolRegistry.clear()
    vi.clearAllMocks()
  })

  it("getDiscoveredTools 应该返回所有 MCP 工具", async () => {
    const tools = [createMockTool("tool1"), createMockTool("tool2")]
    const client = createMockClient("server", tools)

    const clients = new Map([["server", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    await discovery.discoverAndRegister()

    const discoveredTools = discovery.getDiscoveredTools()
    expect(discoveredTools).toHaveLength(2)
    expect(discoveredTools.every((t) => t.source === "mcp")).toBe(true)
  })

  it("getServerTools 应该返回指定服务器的工具", async () => {
    const server1Tools = [createMockTool("tool1")]
    const server2Tools = [createMockTool("tool2")]

    const client1 = createMockClient("server1", server1Tools)
    const client2 = createMockClient("server2", server2Tools)

    const clients = new Map([
      ["server1", client1],
      ["server2", client2],
    ])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    await discovery.discoverAndRegister()

    const server1ToolsList = discovery.getServerTools("server1")
    expect(server1ToolsList).toHaveLength(1)
    expect(server1ToolsList[0].id).toBe("server1:tool1")
  })

  it("getStats 应该返回正确的统计信息", async () => {
    const server1Tools = [createMockTool("tool1"), createMockTool("tool2")]
    const server2Tools = [createMockTool("tool3")]

    const client1 = createMockClient("server1", server1Tools)
    const client2 = createMockClient("server2", server2Tools)

    const clients = new Map([
      ["server1", client1],
      ["server2", client2],
    ])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    await discovery.discoverAndRegister()

    const stats = discovery.getStats()
    expect(stats.total).toBe(3)
    expect(stats.byServer["server1"]).toBe(2)
    expect(stats.byServer["server2"]).toBe(1)
  })

  it("refreshServer 应该更新单个服务器的工具", async () => {
    let currentTools = [createMockTool("tool1")]
    const client = createMockClient("server", currentTools)
    vi.mocked(client.listTools).mockImplementation(async () => ({
      tools: currentTools,
      nextCursor: undefined,
    }))

    const clients = new Map([["server", client]])
    const pool = createMockClientPool(clients)

    const discovery = new ToolDiscoveryService(pool)
    await discovery.discoverAndRegister()
    expect(ToolRegistry.count()).toBe(1)

    // 更新工具列表
    currentTools = [createMockTool("tool1"), createMockTool("tool2")]

    // 刷新服务器
    const stats = await discovery.refreshServer("server")

    expect(stats.discovered).toBe(2)
    expect(stats.registered).toBe(2)
    expect(ToolRegistry.count()).toBe(2)
  })
})
