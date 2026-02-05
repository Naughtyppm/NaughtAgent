import { Tool } from "./tool"
import { createLogger } from "../logging/logger"
import { createTruncator, type TruncationConfig, type ToolOutputTruncator } from "../token/truncator"

/**
 * 工具注册表日志器
 */
const logger = createLogger("tool-registry")

/**
 * 弃用警告已发出的工具 ID 集合
 * 避免重复警告
 */
const deprecationWarned = new Set<string>()

/**
 * 截断配置
 */
export interface RegistryTruncationConfig {
  /** 是否启用截断 */
  enabled: boolean
  /** 截断配置 */
  config?: Partial<TruncationConfig>
}

/**
 * 工具注册表
 */
export namespace ToolRegistry {
  /**
   * 工具存储条目
   * 包含工具定义和元数据
   */
  export interface ToolEntry {
    /** 工具定义 */
    tool: Tool.Definition
    /** 元数据 */
    metadata: {
      /** 注册时间 */
      registeredAt: Date
      /** 工具来源 */
      source: "builtin" | "mcp" | "custom"
      /** MCP 服务器名称（仅 MCP 工具） */
      mcpServer?: string
    }
  }

  /**
   * 工具过滤器
   */
  export interface ToolFilter {
    /** 按来源过滤 */
    source?: "builtin" | "mcp" | "custom"
    /** 按 MCP 服务器过滤 */
    mcpServer?: string
    /** 按标签过滤（预留） */
    tags?: string[]
  }

  /**
   * 工具变更事件
   */
  export type ToolChangeEvent =
    | { type: "registered"; tool: Tool.Definition }
    | { type: "unregistered"; id: string }
    | { type: "updated"; tool: Tool.Definition }

  /**
   * 注册表状态
   */
  interface RegistryState {
    /** 所有工具条目 */
    tools: Map<string, ToolEntry>
    /** 按来源索引 */
    bySource: Map<"builtin" | "mcp" | "custom", Set<string>>
    /** 按 MCP 服务器索引 */
    byMcpServer: Map<string, Set<string>>
    /** 变更监听器 */
    listeners: Set<(event: ToolChangeEvent) => void>
    /** 截断配置 */
    truncation: RegistryTruncationConfig
    /** 截断器实例 */
    truncator: ToolOutputTruncator | null
  }

  /**
   * 全局注册表状态
   */
  const state: RegistryState = {
    tools: new Map(),
    bySource: new Map([
      ["builtin", new Set()],
      ["mcp", new Set()],
      ["custom", new Set()],
    ]),
    byMcpServer: new Map(),
    listeners: new Set(),
    truncation: { enabled: false },
    truncator: null,
  }

  /**
   * 注册工具（支持单个或批量）
   *
   * 如果工具未经过 Tool.define() 处理，会发出弃用警告
   */
  export function register<T>(
    tool: Tool.Definition<T> | Tool.Definition<T>[]
  ): void {
    const toolsToRegister = Array.isArray(tool) ? tool : [tool]

    for (const t of toolsToRegister) {
      const toolDef = t as Tool.Definition

      // 检测旧格式工具并发出弃用警告（每个工具只警告一次）
      if (!toolDef._defined && !deprecationWarned.has(toolDef.id)) {
        deprecationWarned.add(toolDef.id)
        logger.warn(
          `Tool "${toolDef.id}" was registered without using Tool.define(). ` +
            `This is deprecated and will be removed in a future version. ` +
            `Please use Tool.define() to create tool definitions.`,
          { toolId: toolDef.id, source: toolDef.source || "unknown" }
        )
      }

      // 创建工具条目
      const entry: ToolEntry = {
        tool: toolDef,
        metadata: {
          registeredAt: new Date(),
          source: toolDef.source || "builtin",
          mcpServer: toolDef.mcpServer,
        },
      }

      // 存储工具
      state.tools.set(toolDef.id, entry)

      // 更新来源索引
      const sourceSet = state.bySource.get(entry.metadata.source)
      if (sourceSet) {
        sourceSet.add(toolDef.id)
      }

      // 更新 MCP 服务器索引
      if (entry.metadata.mcpServer) {
        let serverSet = state.byMcpServer.get(entry.metadata.mcpServer)
        if (!serverSet) {
          serverSet = new Set()
          state.byMcpServer.set(entry.metadata.mcpServer, serverSet)
        }
        serverSet.add(toolDef.id)
      }

      // 触发注册事件
      notifyListeners({ type: "registered", tool: toolDef })
    }
  }

  /**
   * 注销工具
   */
  export function unregister(id: string): boolean {
    const entry = state.tools.get(id)
    if (!entry) {
      return false
    }

    // 从主存储中删除
    state.tools.delete(id)

    // 从来源索引中删除
    const sourceSet = state.bySource.get(entry.metadata.source)
    if (sourceSet) {
      sourceSet.delete(id)
    }

    // 从 MCP 服务器索引中删除
    if (entry.metadata.mcpServer) {
      const serverSet = state.byMcpServer.get(entry.metadata.mcpServer)
      if (serverSet) {
        serverSet.delete(id)
        // 如果服务器没有工具了，删除服务器索引
        if (serverSet.size === 0) {
          state.byMcpServer.delete(entry.metadata.mcpServer)
        }
      }
    }

    // 触发注销事件
    notifyListeners({ type: "unregistered", id })

    return true
  }

  /**
   * 获取工具
   */
  export function get(id: string): Tool.Definition | undefined {
    const entry = state.tools.get(id)
    return entry?.tool
  }

  /**
   * 列出所有工具（支持过滤）
   */
  export function list(filter?: ToolFilter): Tool.Definition[] {
    let entries = Array.from(state.tools.values())

    // 按来源过滤
    if (filter?.source) {
      entries = entries.filter((e) => e.metadata.source === filter.source)
    }

    // 按 MCP 服务器过滤
    if (filter?.mcpServer) {
      entries = entries.filter((e) => e.metadata.mcpServer === filter.mcpServer)
    }

    // 按标签过滤（预留，暂不实现）
    // if (filter?.tags && filter.tags.length > 0) {
    //   entries = entries.filter((e) => {
    //     // 标签过滤逻辑
    //   })
    // }

    return entries.map((e) => e.tool)
  }

  /**
   * 获取所有工具 ID
   */
  export function ids(): string[] {
    return Array.from(state.tools.keys())
  }

  /**
   * 检查工具是否存在
   */
  export function has(id: string): boolean {
    return state.tools.has(id)
  }

  /**
   * 获取工具数量（支持过滤）
   */
  export function count(filter?: ToolFilter): number {
    if (!filter) {
      return state.tools.size
    }

    // 使用索引优化查询
    if (filter.source && !filter.mcpServer) {
      return state.bySource.get(filter.source)?.size || 0
    }

    if (filter.mcpServer && !filter.source) {
      return state.byMcpServer.get(filter.mcpServer)?.size || 0
    }

    // 需要多条件过滤，使用 list 方法
    return list(filter).length
  }

  /**
   * 执行工具
   * 
   * 如果启用了截断，会在工具返回结果后自动截断输出
   */
  export async function execute(
    id: string,
    params: unknown,
    ctx: Tool.Context
  ): Promise<Tool.Result> {
    const tool = get(id)
    if (!tool) {
      throw new Error(`Tool not found: ${id}`)
    }
    
    const result = await tool.execute(params, ctx)
    
    // 如果启用了截断，应用截断
    if (state.truncation.enabled && state.truncator && result.output) {
      const truncated = applyTruncation(id, result.output, state.truncator)
      if (truncated.truncated) {
        return {
          ...result,
          output: truncated.content,
          metadata: {
            ...result.metadata,
            truncation: {
              originalTokens: truncated.originalTokens,
              finalTokens: truncated.finalTokens,
              truncated: true,
            },
          },
        }
      }
    }
    
    return result
  }

  /**
   * 配置截断
   * 
   * @param config 截断配置
   */
  export function configureTruncation(config: RegistryTruncationConfig): void {
    state.truncation = config
    if (config.enabled) {
      state.truncator = createTruncator(config.config)
    } else {
      state.truncator = null
    }
  }

  /**
   * 获取截断配置
   */
  export function getTruncationConfig(): RegistryTruncationConfig {
    return { ...state.truncation }
  }

  /**
   * 应用截断到工具输出
   */
  function applyTruncation(
    toolId: string,
    output: string,
    truncator: ToolOutputTruncator
  ): { content: string; truncated: boolean; originalTokens: number; finalTokens: number } {
    // 根据工具类型选择截断方法
    switch (toolId) {
      case "read":
        // 文件读取使用文件内容截断
        return truncator.truncateFileContent(output, "file")
      case "bash":
        // bash 输出使用命令输出截断
        return truncator.truncateBashOutput(output, "")
      case "grep":
        // grep 结果使用通用截断（grep 工具已经格式化了输出）
        return truncator.truncate(output)
      default:
        // 其他工具使用通用截断
        return truncator.truncate(output)
    }
  }

  /**
   * 监听工具变更
   */
  export function onChange(
    handler: (event: ToolChangeEvent) => void
  ): () => void {
    state.listeners.add(handler)
    // 返回清理函数
    return () => {
      state.listeners.delete(handler)
    }
  }

  /**
   * 清空注册表（用于测试）
   */
  export function clear(): void {
    state.tools.clear()
    state.bySource.get("builtin")?.clear()
    state.bySource.get("mcp")?.clear()
    state.bySource.get("custom")?.clear()
    state.byMcpServer.clear()
    // 清空弃用警告记录
    deprecationWarned.clear()
    // 重置截断配置
    state.truncation = { enabled: false }
    state.truncator = null
    // 不清空监听器，因为测试可能需要保留
  }

  /**
   * 重置弃用警告记录（用于测试）
   * 允许同一工具再次触发弃用警告
   */
  export function resetDeprecationWarnings(): void {
    deprecationWarned.clear()
  }

  /**
   * 检查工具是否已触发弃用警告（用于测试）
   */
  export function hasDeprecationWarning(id: string): boolean {
    return deprecationWarned.has(id)
  }

  /**
   * 通知所有监听器
   */
  function notifyListeners(event: ToolChangeEvent): void {
    for (const listener of state.listeners) {
      try {
        listener(event)
      } catch (error) {
        // 监听器错误不应影响注册表操作
        console.error("Error in tool change listener:", error)
      }
    }
  }
}
