/**
 * MCP Client 实现
 *
 * 连接 MCP 服务器，调用工具、获取资源和提示模板
 */

import type {
  McpServerConfig,
  McpTransport,
  McpClientState,
  McpClientEvent,
  McpEventHandler,
  McpServerCapabilities,
  McpServerInfo,
  McpInitializeResult,
  McpTool,
  McpToolResult,
  McpResource,
  McpResourceContents,
  McpPrompt,
  McpGetPromptResult,
  McpClientCapabilities,
} from "./types"
import { MCP_PROTOCOL_VERSION } from "./types"
import { createTransport } from "./transport"

// ============================================================================
// MCP Client
// ============================================================================

/**
 * MCP Client
 */
export class McpClient {
  private transport: (McpTransport & { start(): Promise<void> }) | null = null
  private _state: McpClientState = "disconnected"
  private _capabilities: McpServerCapabilities | null = null
  private _serverInfo: McpServerInfo | null = null
  private eventHandlers: McpEventHandler[] = []

  constructor(private config: McpServerConfig) {}

  /**
   * 获取连接状态
   */
  get state(): McpClientState {
    return this._state
  }

  /**
   * 获取服务器能力
   */
  get capabilities(): McpServerCapabilities | null {
    return this._capabilities
  }

  /**
   * 获取服务器信息
   */
  get serverInfo(): McpServerInfo | null {
    return this._serverInfo
  }

  /**
   * 获取服务器名称
   */
  get name(): string {
    return this.config.name
  }

  /**
   * 连接到服务器
   */
  async connect(): Promise<void> {
    if (this._state === "connected") {
      return
    }

    this._state = "connecting"

    try {
      // 创建传输层
      this.transport = createTransport(this.config)

      // 设置通知处理器
      this.transport.onNotification((method, params) => {
        this.handleNotification(method, params)
      })

      // 启动传输层
      await this.transport.start()

      // 初始化连接
      const result = await this.initialize()
      this._capabilities = result.capabilities
      this._serverInfo = result.serverInfo

      this._state = "connected"
      this.emit({ type: "connected", serverInfo: result.serverInfo })
    } catch (error) {
      this._state = "error"
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit({ type: "error", error: err })
      throw error
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this._state === "disconnected") {
      return
    }

    try {
      if (this.transport) {
        await this.transport.close()
        this.transport = null
      }
    } finally {
      this._state = "disconnected"
      this._capabilities = null
      this._serverInfo = null
      this.emit({ type: "disconnected" })
    }
  }

  /**
   * 初始化连接
   */
  private async initialize(): Promise<McpInitializeResult> {
    const clientCapabilities: McpClientCapabilities = {
      experimental: {},
    }

    const result = (await this.transport!.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: clientCapabilities,
      clientInfo: {
        name: "NaughtAgent",
        version: "0.1.0",
      },
    })) as McpInitializeResult

    // 发送 initialized 通知
    this.transport!.notify("notifications/initialized")

    return result
  }

  /**
   * 处理服务器通知
   */
  private handleNotification(method: string, _params: unknown): void {
    switch (method) {
      case "notifications/tools/list_changed":
        this.emit({ type: "tools_changed" })
        break
      case "notifications/resources/list_changed":
        this.emit({ type: "resources_changed" })
        break
      case "notifications/prompts/list_changed":
        this.emit({ type: "prompts_changed" })
        break
    }
  }

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

  /**
   * 确保已连接
   */
  private ensureConnected(): void {
    if (this._state !== "connected" || !this.transport) {
      throw new Error("Not connected to MCP server")
    }
  }

  // ==========================================================================
  // Tools
  // ==========================================================================

  /**
   * 列出可用工具（支持分页）
   *
   * @param options 分页选项
   * @returns 工具列表和下一页游标
   */
  async listTools(options?: {
    cursor?: string
  }): Promise<{ tools: McpTool[]; nextCursor?: string }> {
    this.ensureConnected()

    const params: Record<string, unknown> = {}
    if (options?.cursor) {
      params.cursor = options.cursor
    }

    const result = (await this.transport!.request(
      "tools/list",
      Object.keys(params).length > 0 ? params : undefined
    )) as {
      tools: McpTool[]
      nextCursor?: string
    }

    return {
      tools: result.tools || [],
      nextCursor: result.nextCursor,
    }
  }

  /**
   * 列出所有可用工具（自动处理分页）
   *
   * @returns 所有工具列表
   */
  async listAllTools(): Promise<McpTool[]> {
    const allTools: McpTool[] = []
    let cursor: string | undefined

    do {
      const result = await this.listTools({ cursor })
      allTools.push(...result.tools)
      cursor = result.nextCursor
    } while (cursor)

    return allTools
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: unknown = {}): Promise<McpToolResult> {
    this.ensureConnected()

    const result = (await this.transport!.request("tools/call", {
      name,
      arguments: args,
    })) as McpToolResult

    return result
  }

  // ==========================================================================
  // Resources
  // ==========================================================================

  /**
   * 列出可用资源
   */
  async listResources(): Promise<McpResource[]> {
    this.ensureConnected()

    const result = (await this.transport!.request("resources/list")) as {
      resources: McpResource[]
    }

    return result.resources || []
  }

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<McpResourceContents[]> {
    this.ensureConnected()

    const result = (await this.transport!.request("resources/read", {
      uri,
    })) as {
      contents: McpResourceContents[]
    }

    return result.contents || []
  }

  // ==========================================================================
  // Prompts
  // ==========================================================================

  /**
   * 列出提示模板
   */
  async listPrompts(): Promise<McpPrompt[]> {
    this.ensureConnected()

    const result = (await this.transport!.request("prompts/list")) as {
      prompts: McpPrompt[]
    }

    return result.prompts || []
  }

  /**
   * 获取提示模板
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<McpGetPromptResult> {
    this.ensureConnected()

    const result = (await this.transport!.request("prompts/get", {
      name,
      arguments: args,
    })) as McpGetPromptResult

    return result
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * 创建 MCP Client
 */
export function createMcpClient(config: McpServerConfig): McpClient {
  return new McpClient(config)
}
