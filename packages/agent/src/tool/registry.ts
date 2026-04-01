/**
 * 工具注册表（class 实现）
 *
 * 重写自原来的 namespace ToolRegistry（全局单例）。
 * 现在每个 Runner 创建独立的 ToolRegistry 实例，消灭全局状态。
 *
 * 关键改进：
 * 1. class 实例化 → 每 Runner 独立，Daemon 多会话无竞态
 * 2. 权限检查在 execute() 内拦截 → 工具被拒绝时真的不执行
 * 3. clone() 支持 → 子代理继承父工具集
 */

import { Tool } from "./tool.js"
import { createLogger } from "../logging/logger.js"
import {
  createTruncator,
  type TruncationConfig,
  type ToolOutputTruncator,
} from "../token/truncator.js"

const logger = createLogger("tool-registry")

// ─── 类型定义 ──────────────────────────────────────────

export type ToolSource = "builtin" | "mcp" | "custom"

export interface ToolEntry {
  tool: Tool.Definition
  metadata: {
    registeredAt: Date
    source: ToolSource
    mcpServer?: string
  }
}

export interface ToolFilter {
  source?: ToolSource
  mcpServer?: string
}

export type ToolChangeEvent =
  | { type: "registered"; tool: Tool.Definition }
  | { type: "unregistered"; id: string }

export interface TruncationOptions {
  enabled: boolean
  config?: Partial<TruncationConfig>
}

/**
 * 权限检查器函数签名
 * 返回 true 表示允许执行，false 表示拒绝
 */
export type PermissionChecker = (
  toolName: string,
  input: unknown,
) => boolean | Promise<boolean>

/**
 * 工具执行上下文（扩展 Tool.Context，增加权限检查）
 */
export interface ExecutionContext extends Tool.Context {
  /** 权限检查器（可选，不提供时默认允许） */
  permissionChecker?: PermissionChecker
}

// ─── ToolRegistry 类 ───────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, ToolEntry>()
  private bySource = new Map<ToolSource, Set<string>>([
    ["builtin", new Set()],
    ["mcp", new Set()],
    ["custom", new Set()],
  ])
  private byMcpServer = new Map<string, Set<string>>()
  private listeners = new Set<(event: ToolChangeEvent) => void>()
  private truncationConfig: TruncationOptions = { enabled: false }
  private truncator: ToolOutputTruncator | null = null

  /**
   * 注册工具（支持单个或批量）
   *
   * 泛型签名让调用方保持类型安全，内部存储为 Tool.Definition（无参数约束），
   * 因为 isConcurrencySafe 的函数签名在 TParams 上逆变不兼容 unknown。
   */
  register<TParams>(tool: Tool.Definition<TParams> | Tool.Definition<TParams>[]): this {
    const tools = Array.isArray(tool) ? tool : [tool]

    for (const t of tools) {
      const entry: ToolEntry = {
        tool: t as Tool.Definition,
        metadata: {
          registeredAt: new Date(),
          source: t.source || "builtin",
          mcpServer: t.mcpServer,
        },
      }

      this.tools.set(t.id, entry)

      // 更新来源索引
      this.bySource.get(entry.metadata.source)?.add(t.id)

      // 更新 MCP 服务器索引
      if (entry.metadata.mcpServer) {
        let serverSet = this.byMcpServer.get(entry.metadata.mcpServer)
        if (!serverSet) {
          serverSet = new Set()
          this.byMcpServer.set(entry.metadata.mcpServer, serverSet)
        }
        serverSet.add(t.id)
      }

      this.notifyListeners({ type: "registered", tool: entry.tool })
    }

    return this
  }

  /**
   * 注销工具
   */
  unregister(id: string): boolean {
    const entry = this.tools.get(id)
    if (!entry) return false

    this.tools.delete(id)
    this.bySource.get(entry.metadata.source)?.delete(id)

    if (entry.metadata.mcpServer) {
      const serverSet = this.byMcpServer.get(entry.metadata.mcpServer)
      if (serverSet) {
        serverSet.delete(id)
        if (serverSet.size === 0) {
          this.byMcpServer.delete(entry.metadata.mcpServer)
        }
      }
    }

    this.notifyListeners({ type: "unregistered", id })
    return true
  }

  /**
   * 获取工具定义
   */
  get(id: string): Tool.Definition | undefined {
    return this.tools.get(id)?.tool
  }

  /**
   * 按名称列表获取多个工具定义
   */
  getByNames(names: string[]): Tool.Definition[] {
    const result: Tool.Definition[] = []
    for (const name of names) {
      const tool = this.get(name)
      if (tool) result.push(tool)
    }
    return result
  }

  /**
   * 列出所有工具（支持过滤）
   */
  list(filter?: ToolFilter): Tool.Definition[] {
    let entries = Array.from(this.tools.values())

    if (filter?.source) {
      entries = entries.filter((e) => e.metadata.source === filter.source)
    }
    if (filter?.mcpServer) {
      entries = entries.filter(
        (e) => e.metadata.mcpServer === filter.mcpServer,
      )
    }

    return entries.map((e) => e.tool)
  }

  /**
   * 获取所有工具 ID
   */
  ids(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 检查工具是否存在
   */
  has(id: string): boolean {
    return this.tools.has(id)
  }

  /**
   * 获取工具数量
   */
  count(filter?: ToolFilter): number {
    if (!filter) return this.tools.size
    if (filter.source && !filter.mcpServer) {
      return this.bySource.get(filter.source)?.size ?? 0
    }
    if (filter.mcpServer && !filter.source) {
      return this.byMcpServer.get(filter.mcpServer)?.size ?? 0
    }
    return this.list(filter).length
  }

  /**
   * 执行工具
   *
   * 核心改进：权限检查在这里拦截，不是事后通知。
   * 如果 ctx.permissionChecker 返回 false，工具不会被执行。
   */
  async execute(
    id: string,
    params: unknown,
    ctx: ExecutionContext,
  ): Promise<Tool.Result> {
    const tool = this.get(id)
    if (!tool) {
      return {
        title: "Error",
        output: `Tool not found: ${id}`,
        isError: true,
      }
    }

    // 权限检查（在工具执行前拦截）
    if (ctx.permissionChecker) {
      const allowed = await ctx.permissionChecker(id, params)
      if (!allowed) {
        logger.info(`Permission denied for tool: ${id}`)
        return {
          title: "Permission Denied",
          output: `Permission denied for tool: ${id}. The user declined this operation.`,
          isError: true,
        }
      }
    }

    // 执行工具
    const result = await tool.execute(params, ctx)

    // 输出截断
    if (
      this.truncationConfig.enabled &&
      this.truncator &&
      result.output
    ) {
      const truncated = this.applyTruncation(id, result.output)
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
   * 配置输出截断
   */
  configureTruncation(options: TruncationOptions): void {
    this.truncationConfig = options
    this.truncator = options.enabled
      ? createTruncator(options.config)
      : null
  }

  /**
   * 监听工具变更
   * 返回取消订阅函数
   */
  onChange(handler: (event: ToolChangeEvent) => void): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.tools.clear()
    for (const set of this.bySource.values()) set.clear()
    this.byMcpServer.clear()
    this.truncationConfig = { enabled: false }
    this.truncator = null
  }

  /**
   * 克隆注册表（子代理用）
   * 工具定义共享引用（不深拷贝），但注册表状态独立。
   */
  clone(): ToolRegistry {
    const cloned = new ToolRegistry()
    for (const [id, entry] of this.tools) {
      cloned.tools.set(id, { ...entry })
      cloned.bySource.get(entry.metadata.source)?.add(id)
      if (entry.metadata.mcpServer) {
        let serverSet = cloned.byMcpServer.get(entry.metadata.mcpServer)
        if (!serverSet) {
          serverSet = new Set()
          cloned.byMcpServer.set(entry.metadata.mcpServer, serverSet)
        }
        serverSet.add(id)
      }
    }
    // 截断配置也继承
    if (this.truncationConfig.enabled) {
      cloned.configureTruncation(this.truncationConfig)
    }
    return cloned
  }

  // ─── 私有方法 ────────────────────────────────────────

  private notifyListeners(event: ToolChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        logger.error("Error in tool change listener:", { error })
      }
    }
  }

  private applyTruncation(
    toolId: string,
    output: string,
  ): {
    content: string
    truncated: boolean
    originalTokens: number
    finalTokens: number
  } {
    if (!this.truncator) {
      return { content: output, truncated: false, originalTokens: 0, finalTokens: 0 }
    }

    switch (toolId) {
      case "read":
        return this.truncator.truncateFileContent(output, "file")
      case "bash":
        return this.truncator.truncateBashOutput(output, "")
      default:
        return this.truncator.truncate(output)
    }
  }
}

// ─── 全局默认实例（兼容旧代码，A5 重写后删除） ───

/**
 * @deprecated 旧代码兼容层。A5 Runner 重写后删除。
 */
const _defaultRegistry = new ToolRegistry()

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ToolRegistryCompat {
  export const clear = () => _defaultRegistry.clear()
  export const register = <TParams>(tool: Tool.Definition<TParams> | Tool.Definition<TParams>[]) => _defaultRegistry.register(tool)
  export const get = (id: string) => _defaultRegistry.get(id)
  export const getByNames = (names: string[]) => _defaultRegistry.getByNames(names)
  export const list = (filter?: ToolFilter) => _defaultRegistry.list(filter)
  export const has = (id: string) => _defaultRegistry.has(id)
  export const ids = () => _defaultRegistry.ids()
  export const count = (filter?: ToolFilter) => _defaultRegistry.count(filter)
  export const unregister = (id: string) => _defaultRegistry.unregister(id)
  export const execute = (id: string, params: unknown, ctx: ExecutionContext) =>
    _defaultRegistry.execute(id, params, ctx)
  /** 获取底层实例（用于需要实例的新代码） */
  export const getInstance = () => _defaultRegistry
}
