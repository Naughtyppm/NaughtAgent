/**
 * MCP 客户端池管理
 *
 * 管理多个 MCP 服务器连接，提供连接池、健康检查和自动重连功能
 */

import type {
  McpConfig,
  McpClientState,
  McpServerInfo,
} from "./types"
import { McpClient } from "./client"

// ============================================================================
// Types
// ============================================================================

/**
 * 客户端信息
 */
export interface ClientInfo {
  /** 服务器名称 */
  name: string
  /** 连接状态 */
  state: McpClientState
  /** 服务器信息 */
  serverInfo: McpServerInfo | null
}

/**
 * 健康检查配置
 */
export interface HealthCheckConfig {
  /** 检查间隔（毫秒） */
  interval: number
  /** 超时时间（毫秒） */
  timeout: number
}

// ============================================================================
// MCP Client Pool
// ============================================================================

/**
 * MCP 客户端池
 *
 * 管理多个 MCP 服务器连接，提供：
 * - 连接管理（连接、断开、重连）
 * - 健康检查（定期 ping）
 * - 客户端查询
 */
export class McpClientPool {
  /** 客户端存储 */
  private clients = new Map<string, McpClient>()

  /** 健康检查定时器 */
  private healthCheckTimer: NodeJS.Timeout | null = null

  /** 健康检查配置 */
  private healthCheckConfig: HealthCheckConfig = {
    interval: 30000, // 30 秒
    timeout: 5000, // 5 秒
  }

  /**
   * 创建客户端池
   *
   * @param config MCP 配置
   */
  constructor(private config: McpConfig) {}

  /**
   * 连接所有配置的服务器
   *
   * @returns 连接结果统计
   */
  async connectAll(): Promise<{
    connected: number
    failed: number
    errors: Array<{ server: string; error: Error }>
  }> {
    const results = {
      connected: 0,
      failed: 0,
      errors: [] as Array<{ server: string; error: Error }>,
    }

    // 并行连接所有服务器
    await Promise.allSettled(
      this.config.servers.map(async (serverConfig) => {
        try {
          await this.connect(serverConfig.name)
          results.connected++
        } catch (error) {
          results.failed++
          results.errors.push({
            server: serverConfig.name,
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      })
    )

    return results
  }

  /**
   * 连接单个服务器
   *
   * @param serverName 服务器名称
   */
  async connect(serverName: string): Promise<void> {
    // 查找服务器配置
    const serverConfig = this.config.servers.find(
      (s) => s.name === serverName
    )

    if (!serverConfig) {
      throw new Error(`Server not found in config: ${serverName}`)
    }

    // 如果已存在客户端，先断开
    const existingClient = this.clients.get(serverName)
    if (existingClient) {
      await existingClient.disconnect()
    }

    // 创建新客户端
    const client = new McpClient(serverConfig)

    // 连接到服务器（包含协议版本协商）
    await client.connect()

    // 存储客户端
    this.clients.set(serverName, client)
  }

  /**
   * 断开单个服务器
   *
   * @param serverName 服务器名称
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName)

    if (!client) {
      return
    }

    await client.disconnect()
    this.clients.delete(serverName)
  }

  /**
   * 断开所有服务器
   */
  async disconnectAll(): Promise<void> {
    // 并行断开所有连接
    await Promise.allSettled(
      Array.from(this.clients.keys()).map((name) => this.disconnect(name))
    )

    this.clients.clear()
  }

  /**
   * 重连服务器
   *
   * @param serverName 服务器名称
   */
  async reconnect(serverName: string): Promise<void> {
    await this.disconnect(serverName)
    await this.connect(serverName)
  }

  /**
   * 启动健康检查
   *
   * 定期 ping 所有连接的服务器，检测连接健康状态
   * 如果检测到不健康的连接，自动尝试重连
   */
  startHealthCheck(): void {
    // 如果已经在运行，先停止
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }

    this.healthCheckTimer = setInterval(async () => {
      for (const [name, client] of this.clients) {
        // 只检查已连接的客户端
        if (client.state !== "connected") {
          continue
        }

        try {
          // 发送 ping 请求（使用 listTools 作为健康检查）
          // MCP 协议没有标准的 ping 方法，使用 listTools 代替
          await Promise.race([
            client.listTools(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Health check timeout")),
                this.healthCheckConfig.timeout
              )
            ),
          ])
        } catch (error) {
          // 健康检查失败，尝试重连
          console.warn(
            `[McpClientPool] Health check failed for ${name}, reconnecting...`,
            error
          )

          try {
            await this.reconnect(name)
          } catch (reconnectError) {
            console.error(
              `[McpClientPool] Failed to reconnect ${name}:`,
              reconnectError
            )
          }
        }
      }
    }, this.healthCheckConfig.interval)
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * 获取客户端
   *
   * @param serverName 服务器名称
   * @returns 客户端实例，如果不存在返回 undefined
   */
  getClient(serverName: string): McpClient | undefined {
    return this.clients.get(serverName)
  }

  /**
   * 列出所有客户端
   *
   * @returns 客户端信息列表
   */
  listClients(): ClientInfo[] {
    return Array.from(this.clients.entries()).map(([name, client]) => ({
      name,
      state: client.state,
      serverInfo: client.serverInfo,
    }))
  }

  /**
   * 获取客户端数量
   */
  get size(): number {
    return this.clients.size
  }

  /**
   * 检查是否有指定的客户端
   *
   * @param serverName 服务器名称
   */
  has(serverName: string): boolean {
    return this.clients.has(serverName)
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    this.stopHealthCheck()
    await this.disconnectAll()
  }
}
