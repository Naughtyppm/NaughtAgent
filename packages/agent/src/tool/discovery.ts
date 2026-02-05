/**
 * 工具发现服务
 *
 * 负责从 MCP 服务器发现工具并注册到 ToolRegistry
 * 支持自动发现、热重载、分页加载
 */

import type { McpClientPool } from "../mcp/pool"
import type { McpClientEvent } from "../mcp/types"
import { wrapMcpTool } from "../mcp/adapter"
import { ToolRegistry } from "./registry"
import type { Tool } from "./tool"

// ============================================================================
// Types
// ============================================================================

/**
 * 工具发现统计信息
 */
export interface DiscoveryStats {
  /** 发现的工具总数 */
  discovered: number
  /** 成功注册的工具数 */
  registered: number
  /** 发生错误的数量 */
  errors: number
  /** 按服务器分组的统计 */
  byServer: Record<
    string,
    {
      discovered: number
      registered: number
      errors: string[]
    }
  >
}

/**
 * 分页选项
 */
export interface PaginationOptions {
  /** 每页大小 */
  pageSize?: number
  /** 游标（用于继续加载） */
  cursor?: string
}

/**
 * 工具发现选项
 */
export interface DiscoveryOptions {
  /** 分页选项（预留，当前 MCP 客户端不支持） */
  pagination?: PaginationOptions
  /** 是否跳过已注册的工具 */
  skipExisting?: boolean
  /** 服务器过滤（只发现指定服务器的工具） */
  servers?: string[]
}

/**
 * 热重载清理函数
 */
export type HotReloadCleanup = () => void

// ============================================================================
// ToolDiscoveryService
// ============================================================================

/**
 * 工具发现服务
 *
 * 从 MCP 服务器发现工具并注册到 ToolRegistry
 */
export class ToolDiscoveryService {
  private hotReloadEnabled = false
  private hotReloadCleanups: Map<string, () => void> = new Map()

  constructor(private clientPool: McpClientPool) {}

  // ==========================================================================
  // 工具发现
  // ==========================================================================

  /**
   * 发现并注册所有 MCP 服务器的工具
   *
   * 支持分页加载，可处理大量工具（1000+）的情况
   *
   * @param options 发现选项
   * @returns 发现统计信息
   */
  async discoverAndRegister(options: DiscoveryOptions = {}): Promise<DiscoveryStats> {
    const stats: DiscoveryStats = {
      discovered: 0,
      registered: 0,
      errors: 0,
      byServer: {},
    }

    // 获取所有已连接的客户端
    const clients = this.clientPool.listClients()
    const connectedClients = clients.filter((c) => c.state === "connected")

    // 过滤服务器
    const targetClients = options.servers
      ? connectedClients.filter((c) => options.servers!.includes(c.name))
      : connectedClients

    // 遍历所有客户端发现工具
    for (const clientInfo of targetClients) {
      const serverStats = {
        discovered: 0,
        registered: 0,
        errors: [] as string[],
      }

      try {
        const client = this.clientPool.getClient(clientInfo.name)
        if (!client) {
          serverStats.errors.push("Client not found")
          stats.errors++
          continue
        }

        // 使用分页获取工具列表
        const tools = await this.fetchToolsWithPagination(client, options.pagination)

        serverStats.discovered = tools.length
        stats.discovered += tools.length

        // 注册工具
        for (const tool of tools) {
          try {
            const toolId = `${clientInfo.name}:${tool.name}`

            // 检查是否跳过已存在的工具
            if (options.skipExisting && ToolRegistry.has(toolId)) {
              continue
            }

            // 包装并注册工具
            const wrappedTool = wrapMcpTool({
              tool,
              client,
              serverName: clientInfo.name,
            })

            ToolRegistry.register(wrappedTool)
            serverStats.registered++
            stats.registered++
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error)
            serverStats.errors.push(`Tool ${tool.name}: ${errorMsg}`)
            stats.errors++
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        serverStats.errors.push(`Server error: ${errorMsg}`)
        stats.errors++
      }

      stats.byServer[clientInfo.name] = serverStats
    }

    return stats
  }

  /**
   * 使用分页获取工具列表
   *
   * @param client MCP 客户端
   * @param pagination 分页选项
   * @returns 所有工具列表
   */
  private async fetchToolsWithPagination(
    client: ReturnType<typeof this.clientPool.getClient>,
    pagination?: PaginationOptions
  ): Promise<import("../mcp/types").McpTool[]> {
    if (!client) {
      return []
    }

    const allTools: import("../mcp/types").McpTool[] = []
    let cursor = pagination?.cursor

    // 使用分页获取工具，循环直到没有更多页
    do {
      const result = await client.listTools({ cursor })
      allTools.push(...result.tools)
      cursor = result.nextCursor
    } while (cursor)

    return allTools
  }

  // ==========================================================================
  // 单个服务器刷新
  // ==========================================================================

  /**
   * 刷新单个服务器的工具
   *
   * 注销该服务器的旧工具，重新发现并注册新工具
   *
   * @param serverName 服务器名称
   * @returns 发现统计信息
   */
  async refreshServer(serverName: string): Promise<DiscoveryStats> {
    // 注销该服务器的所有旧工具
    const existingTools = ToolRegistry.list({ mcpServer: serverName })
    for (const tool of existingTools) {
      ToolRegistry.unregister(tool.id)
    }

    // 重新发现并注册
    return this.discoverAndRegister({
      servers: [serverName],
      skipExisting: false,
    })
  }

  // ==========================================================================
  // 热重载
  // ==========================================================================

  /**
   * 启用热重载
   *
   * 监听所有客户端的 tools_changed 事件，自动刷新工具列表
   *
   * @returns 清理函数
   */
  enableHotReload(): HotReloadCleanup {
    if (this.hotReloadEnabled) {
      return () => this.disableHotReload()
    }

    this.hotReloadEnabled = true

    // 为每个客户端设置事件监听
    const clients = this.clientPool.listClients()

    for (const clientInfo of clients) {
      const client = this.clientPool.getClient(clientInfo.name)
      if (!client) continue

      // 监听 tools_changed 事件
      const handler = async (event: McpClientEvent) => {
        if (event.type === "tools_changed") {
          try {
            await this.refreshServer(clientInfo.name)
          } catch (error) {
            console.error(
              `[ToolDiscovery] Failed to refresh server ${clientInfo.name}:`,
              error
            )
          }
        }
      }

      // 注册事件处理器，保存清理函数
      const cleanup = client.on(handler)
      this.hotReloadCleanups.set(clientInfo.name, cleanup)
    }

    return () => this.disableHotReload()
  }

  /**
   * 禁用热重载
   */
  disableHotReload(): void {
    if (!this.hotReloadEnabled) return

    // 清理所有监听器
    for (const cleanup of this.hotReloadCleanups.values()) {
      cleanup()
    }
    this.hotReloadCleanups.clear()

    this.hotReloadEnabled = false
  }

  /**
   * 检查热重载是否启用
   */
  isHotReloadEnabled(): boolean {
    return this.hotReloadEnabled
  }

  // ==========================================================================
  // 工具查询
  // ==========================================================================

  /**
   * 获取所有已发现的 MCP 工具
   */
  getDiscoveredTools(): Tool.Definition[] {
    return ToolRegistry.list({ source: "mcp" })
  }

  /**
   * 获取指定服务器的工具
   */
  getServerTools(serverName: string): Tool.Definition[] {
    return ToolRegistry.list({ mcpServer: serverName })
  }

  /**
   * 获取工具数量统计
   */
  getStats(): {
    total: number
    byServer: Record<string, number>
  } {
    const mcpTools = ToolRegistry.list({ source: "mcp" })
    const byServer: Record<string, number> = {}

    for (const tool of mcpTools) {
      const server = tool.mcpServer || "unknown"
      byServer[server] = (byServer[server] || 0) + 1
    }

    return {
      total: mcpTools.length,
      byServer,
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * 创建工具发现服务
 */
export function createToolDiscoveryService(
  clientPool: McpClientPool
): ToolDiscoveryService {
  return new ToolDiscoveryService(clientPool)
}
