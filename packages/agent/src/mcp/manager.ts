/**
 * MCP Manager
 *
 * 管理多个 MCP 服务器连接
 */

import * as fs from "fs/promises"
import * as path from "path"
import type {
  McpServerConfig,
  McpConfig,
  McpTool,
  McpToolResult,
  McpResource,
  McpResourceContents,
  McpPrompt,
  McpGetPromptResult,
  McpClientEvent,
  McpEventHandler,
} from "./types"
import { McpClient, createMcpClient } from "./client"
import { loadMcpTools, unloadMcpTools, type McpToolWrapper } from "./tools"

// ============================================================================
// MCP Manager
// ============================================================================

/**
 * MCP 管理器
 *
 * 管理多个 MCP 服务器连接，提供统一的工具访问接口
 */
export class McpManager {
  private clients = new Map<string, McpClient>()
  private loadedTools = new Map<string, McpToolWrapper[]>()
  private eventHandlers: McpEventHandler[] = []

  /**
   * 添加服务器
   */
  async addServer(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      throw new Error(`Server already exists: ${config.name}`)
    }

    const client = createMcpClient(config)

    // 转发事件
    client.on((event) => {
      this.emit(event)
    })

    // 连接
    await client.connect()

    this.clients.set(config.name, client)

    // 加载工具
    const tools = await loadMcpTools(client)
    this.loadedTools.set(config.name, tools)
  }

  /**
   * 移除服务器
   */
  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name)
    if (!client) {
      return
    }

    // 卸载工具
    const tools = this.loadedTools.get(name)
    if (tools) {
      unloadMcpTools(client, tools)
      this.loadedTools.delete(name)
    }

    // 断开连接
    await client.disconnect()
    this.clients.delete(name)
  }

  /**
   * 获取客户端
   */
  getClient(name: string): McpClient | undefined {
    return this.clients.get(name)
  }

  /**
   * 获取所有客户端
   */
  getAllClients(): McpClient[] {
    return Array.from(this.clients.values())
  }

  /**
   * 获取所有服务器名称
   */
  getServerNames(): string[] {
    return Array.from(this.clients.keys())
  }

  /**
   * 检查服务器是否存在
   */
  hasServer(name: string): boolean {
    return this.clients.has(name)
  }

  // ==========================================================================
  // Tools
  // ==========================================================================

  /**
   * 获取所有工具
   */
  async getAllTools(): Promise<Array<McpTool & { serverName: string }>> {
    const allTools: Array<McpTool & { serverName: string }> = []

    for (const [name, client] of this.clients) {
      try {
        const { tools } = await client.listTools()
        for (const tool of tools) {
          allTools.push({ ...tool, serverName: name })
        }
      } catch {
        // 忽略获取失败的服务器
      }
    }

    return allTools
  }

  /**
   * 调用工具
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: unknown
  ): Promise<McpToolResult> {
    const client = this.clients.get(serverName)
    if (!client) {
      throw new Error(`Server not found: ${serverName}`)
    }

    return client.callTool(toolName, args)
  }

  /**
   * 重新加载工具
   */
  async reloadTools(serverName?: string): Promise<void> {
    const servers = serverName ? [serverName] : Array.from(this.clients.keys())

    for (const name of servers) {
      const client = this.clients.get(name)
      if (!client) continue

      // 卸载旧工具
      const oldTools = this.loadedTools.get(name)
      if (oldTools) {
        unloadMcpTools(client, oldTools)
      }

      // 加载新工具
      const newTools = await loadMcpTools(client)
      this.loadedTools.set(name, newTools)
    }
  }

  // ==========================================================================
  // Resources
  // ==========================================================================

  /**
   * 获取所有资源
   */
  async getAllResources(): Promise<Array<McpResource & { serverName: string }>> {
    const allResources: Array<McpResource & { serverName: string }> = []

    for (const [name, client] of this.clients) {
      try {
        const resources = await client.listResources()
        for (const resource of resources) {
          allResources.push({ ...resource, serverName: name })
        }
      } catch {
        // 忽略获取失败的服务器
      }
    }

    return allResources
  }

  /**
   * 读取资源
   */
  async readResource(
    serverName: string,
    uri: string
  ): Promise<McpResourceContents[]> {
    const client = this.clients.get(serverName)
    if (!client) {
      throw new Error(`Server not found: ${serverName}`)
    }

    return client.readResource(uri)
  }

  // ==========================================================================
  // Prompts
  // ==========================================================================

  /**
   * 获取所有提示模板
   */
  async getAllPrompts(): Promise<Array<McpPrompt & { serverName: string }>> {
    const allPrompts: Array<McpPrompt & { serverName: string }> = []

    for (const [name, client] of this.clients) {
      try {
        const prompts = await client.listPrompts()
        for (const prompt of prompts) {
          allPrompts.push({ ...prompt, serverName: name })
        }
      } catch {
        // 忽略获取失败的服务器
      }
    }

    return allPrompts
  }

  /**
   * 获取提示模板
   */
  async getPrompt(
    serverName: string,
    name: string,
    args?: Record<string, string>
  ): Promise<McpGetPromptResult> {
    const client = this.clients.get(serverName)
    if (!client) {
      throw new Error(`Server not found: ${serverName}`)
    }

    return client.getPrompt(name, args)
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * 添加事件处理器
   */
  on(handler: McpEventHandler): () => void {
    this.eventHandlers.push(handler)
    return () => {
      const index = this.eventHandlers.indexOf(handler)
      if (index !== -1) {
        this.eventHandlers.splice(index, 1)
      }
    }
  }

  /**
   * 触发事件
   */
  private emit(event: McpClientEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event)
      } catch {
        // 忽略处理器错误
      }
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    const names = Array.from(this.clients.keys())
    for (const name of names) {
      await this.removeServer(name)
    }
  }

  /**
   * 获取状态摘要
   */
  getStatus(): Array<{
    name: string
    state: string
    toolCount: number
  }> {
    const status: Array<{
      name: string
      state: string
      toolCount: number
    }> = []

    for (const [name, client] of this.clients) {
      const tools = this.loadedTools.get(name) || []
      status.push({
        name,
        state: client.state,
        toolCount: tools.length,
      })
    }

    return status
  }
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * 加载 MCP 配置
 */
export async function loadMcpConfig(cwd: string): Promise<McpConfig> {
  const configPath = path.join(cwd, ".naught", "mcp.json")

  try {
    const content = await fs.readFile(configPath, "utf-8")
    const config = JSON.parse(content) as McpConfig

    // 替换环境变量
    for (const server of config.servers) {
      if (server.env) {
        server.env = replaceEnvVars(server.env)
      }
      if (server.headers) {
        server.headers = replaceEnvVars(server.headers)
      }
    }

    return config
  } catch {
    // 配置文件不存在，返回空配置
    return { servers: [] }
  }
}

/**
 * 替换环境变量
 */
function replaceEnvVars(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(obj)) {
    result[key] = value.replace(/\$\{(\w+)\}/g, (_, name) => {
      return process.env[name] || ""
    })
  }

  return result
}

/**
 * 从配置初始化 MCP Manager
 */
export async function initMcpManager(cwd: string): Promise<McpManager> {
  const manager = new McpManager()
  const config = await loadMcpConfig(cwd)

  for (const serverConfig of config.servers) {
    try {
      await manager.addServer(serverConfig)
    } catch (error) {
      // 记录错误但继续加载其他服务器
      console.error(`Failed to connect to MCP server ${serverConfig.name}:`, error)
    }
  }

  return manager
}

// ============================================================================
// Singleton
// ============================================================================

let globalManager: McpManager | null = null

/**
 * 获取全局 MCP Manager
 */
export function getMcpManager(): McpManager {
  if (!globalManager) {
    globalManager = new McpManager()
  }
  return globalManager
}

/**
 * 设置全局 MCP Manager
 */
export function setMcpManager(manager: McpManager): void {
  globalManager = manager
}
