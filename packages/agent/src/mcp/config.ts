/**
 * MCP 配置管理
 *
 * 提供配置加载、验证和热重载功能
 */

import * as fs from "fs"
import * as fsPromises from "fs/promises"
import * as path from "path"
import { z } from "zod"
import type { McpServerConfig, McpConfig } from "./types"

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * 传输类型 Schema
 */
const McpTransportTypeSchema = z.enum(["stdio", "sse"])

/**
 * MCP 服务器配置 Schema
 */
export const McpServerConfigSchema = z.object({
  /** 服务器名称（唯一标识） */
  name: z.string().min(1, "Server name is required"),
  /** 传输方式 */
  transport: McpTransportTypeSchema,
  /** stdio: 要执行的命令 */
  command: z.string().optional(),
  /** stdio: 命令参数 */
  args: z.array(z.string()).optional(),
  /** stdio: 环境变量 */
  env: z.record(z.string()).optional(),
  /** stdio: 工作目录 */
  cwd: z.string().optional(),
  /** sse: 服务器 URL */
  url: z.string().url().optional(),
  /** sse: HTTP 头 */
  headers: z.record(z.string()).optional(),
  /** 连接超时（毫秒） */
  timeout: z.number().int().positive().optional(),
}).refine(
  (data) => {
    // stdio 传输需要 command
    if (data.transport === "stdio" && !data.command) {
      return false
    }
    // sse 传输需要 url
    if (data.transport === "sse" && !data.url) {
      return false
    }
    return true
  },
  {
    message: "stdio transport requires 'command', sse transport requires 'url'",
  }
)

/**
 * MCP 配置设置 Schema
 */
export const McpSettingsSchema = z.object({
  /** 默认超时时间（毫秒） */
  defaultTimeout: z.number().int().positive().default(30000),
  /** 是否启用热重载 */
  hotReload: z.boolean().default(false),
  /** 重连配置 */
  reconnect: z.object({
    /** 是否启用自动重连 */
    enabled: z.boolean().default(true),
    /** 最大重试次数 */
    maxAttempts: z.number().int().positive().default(3),
    /** 初始延迟（毫秒） */
    initialDelayMs: z.number().int().positive().default(1000),
    /** 最大延迟（毫秒） */
    maxDelayMs: z.number().int().positive().default(30000),
    /** 退避倍数 */
    backoffMultiplier: z.number().positive().default(2),
  }).default({}),
}).default({})

/**
 * MCP 配置文件 Schema
 */
export const McpConfigSchema = z.object({
  /** 服务器列表 */
  servers: z.array(McpServerConfigSchema).default([]),
  /** 配置设置 */
  settings: McpSettingsSchema,
})

// ============================================================================
// Types
// ============================================================================

/**
 * MCP 配置设置
 */
export interface McpSettings {
  /** 默认超时时间（毫秒） */
  defaultTimeout: number
  /** 是否启用热重载 */
  hotReload: boolean
  /** 重连配置 */
  reconnect: {
    /** 是否启用自动重连 */
    enabled: boolean
    /** 最大重试次数 */
    maxAttempts: number
    /** 初始延迟（毫秒） */
    initialDelayMs: number
    /** 最大延迟（毫秒） */
    maxDelayMs: number
    /** 退避倍数 */
    backoffMultiplier: number
  }
}

/**
 * 扩展的 MCP 配置（包含 settings）
 */
export interface McpConfigWithSettings extends McpConfig {
  /** 配置设置 */
  settings: McpSettings
}

/**
 * 配置加载结果
 */
export interface ConfigLoadResult {
  /** 是否成功 */
  success: boolean
  /** 配置（成功时） */
  config?: McpConfigWithSettings
  /** 错误信息（失败时） */
  errors?: string[]
  /** 是否使用了默认值 */
  usedDefaults: boolean
}

/**
 * 配置变更事件
 */
export interface ConfigChangeEvent {
  /** 事件类型 */
  type: "added" | "removed" | "modified"
  /** 服务器名称 */
  serverName: string
  /** 旧配置（修改或移除时） */
  oldConfig?: McpServerConfig
  /** 新配置（添加或修改时） */
  newConfig?: McpServerConfig
}

/**
 * 配置变更处理器
 */
export type ConfigChangeHandler = (changes: ConfigChangeEvent[]) => void

// ============================================================================
// Default Values
// ============================================================================

/**
 * 默认配置设置
 */
export const DEFAULT_SETTINGS: McpSettings = {
  defaultTimeout: 30000,
  hotReload: false,
  reconnect: {
    enabled: true,
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: McpConfigWithSettings = {
  servers: [],
  settings: DEFAULT_SETTINGS,
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * 替换环境变量
 *
 * 支持 ${VAR_NAME} 格式的环境变量替换
 */
export function replaceEnvVars(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(obj)) {
    result[key] = value.replace(/\$\{(\w+)\}/g, (_, name) => {
      return process.env[name] || ""
    })
  }

  return result
}

/**
 * 处理服务器配置中的环境变量
 */
function processServerConfig(server: McpServerConfig): McpServerConfig {
  const processed = { ...server }

  if (processed.env) {
    processed.env = replaceEnvVars(processed.env)
  }
  if (processed.headers) {
    processed.headers = replaceEnvVars(processed.headers)
  }

  return processed
}

/**
 * 验证配置
 *
 * @param data 原始配置数据
 * @returns 验证结果
 */
export function validateConfig(data: unknown): ConfigLoadResult {
  try {
    const result = McpConfigSchema.safeParse(data)

    if (!result.success) {
      const errors = result.error.errors.map((e) => {
        const path = e.path.join(".")
        return path ? `${path}: ${e.message}` : e.message
      })

      // 返回默认配置并记录错误
      return {
        success: false,
        config: DEFAULT_CONFIG,
        errors,
        usedDefaults: true,
      }
    }

    // 处理环境变量
    const config: McpConfigWithSettings = {
      servers: result.data.servers.map(processServerConfig),
      settings: result.data.settings,
    }

    return {
      success: true,
      config,
      usedDefaults: false,
    }
  } catch (error) {
    return {
      success: false,
      config: DEFAULT_CONFIG,
      errors: [error instanceof Error ? error.message : String(error)],
      usedDefaults: true,
    }
  }
}

/**
 * 从 JSON 字符串加载配置
 *
 * @param jsonContent JSON 字符串
 * @returns 配置加载结果
 */
export function loadConfigFromJson(jsonContent: string): ConfigLoadResult {
  try {
    const data = JSON.parse(jsonContent)
    return validateConfig(data)
  } catch (error) {
    return {
      success: false,
      config: DEFAULT_CONFIG,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
      usedDefaults: true,
    }
  }
}

/**
 * 从文件加载 MCP 配置
 *
 * @param configPath 配置文件路径
 * @returns 配置加载结果
 */
export async function loadMcpConfigFromFile(configPath: string): Promise<ConfigLoadResult> {
  try {
    const content = await fsPromises.readFile(configPath, "utf-8")
    return loadConfigFromJson(content)
  } catch (error) {
    // 文件不存在或读取失败
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        success: true,
        config: DEFAULT_CONFIG,
        usedDefaults: true,
      }
    }

    return {
      success: false,
      config: DEFAULT_CONFIG,
      errors: [`Failed to read config file: ${error instanceof Error ? error.message : String(error)}`],
      usedDefaults: true,
    }
  }
}

/**
 * 从工作目录加载 MCP 配置
 *
 * 查找 .naughty/mcp.json 文件
 *
 * @param cwd 工作目录
 * @returns 配置加载结果
 */
export async function loadMcpConfig(cwd: string): Promise<ConfigLoadResult> {
  const configPath = path.join(cwd, ".naughty", "mcp.json")
  return loadMcpConfigFromFile(configPath)
}

// ============================================================================
// Config Comparison
// ============================================================================

/**
 * 比较两个配置，返回变更列表
 *
 * @param oldConfig 旧配置
 * @param newConfig 新配置
 * @returns 变更事件列表
 */
export function compareConfigs(
  oldConfig: McpConfigWithSettings,
  newConfig: McpConfigWithSettings
): ConfigChangeEvent[] {
  const changes: ConfigChangeEvent[] = []

  const oldServers = new Map(oldConfig.servers.map((s) => [s.name, s]))
  const newServers = new Map(newConfig.servers.map((s) => [s.name, s]))

  // 检查移除的服务器
  for (const [name, oldServer] of oldServers) {
    if (!newServers.has(name)) {
      changes.push({
        type: "removed",
        serverName: name,
        oldConfig: oldServer,
      })
    }
  }

  // 检查添加和修改的服务器
  for (const [name, newServer] of newServers) {
    const oldServer = oldServers.get(name)

    if (!oldServer) {
      changes.push({
        type: "added",
        serverName: name,
        newConfig: newServer,
      })
    } else if (!isServerConfigEqual(oldServer, newServer)) {
      changes.push({
        type: "modified",
        serverName: name,
        oldConfig: oldServer,
        newConfig: newServer,
      })
    }
  }

  return changes
}

/**
 * 比较两个服务器配置是否相等
 */
function isServerConfigEqual(a: McpServerConfig, b: McpServerConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ============================================================================
// Config Hot Reload
// ============================================================================

/**
 * 配置热重载器
 *
 * 监听配置文件变更，自动重新加载配置
 */
export class ConfigHotReloader {
  private watcher: fs.FSWatcher | null = null
  private currentConfig: McpConfigWithSettings
  private handlers: ConfigChangeHandler[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private debounceMs: number

  /**
   * 创建配置热重载器
   *
   * @param configPath 配置文件路径
   * @param initialConfig 初始配置
   * @param debounceMs 防抖延迟（毫秒）
   */
  constructor(
    private configPath: string,
    initialConfig: McpConfigWithSettings,
    debounceMs = 500
  ) {
    this.currentConfig = initialConfig
    this.debounceMs = debounceMs
  }

  /**
   * 获取当前配置
   */
  get config(): McpConfigWithSettings {
    return this.currentConfig
  }

  /**
   * 添加变更处理器
   *
   * @param handler 变更处理器
   * @returns 取消订阅函数
   */
  onChange(handler: ConfigChangeHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const index = this.handlers.indexOf(handler)
      if (index !== -1) {
        this.handlers.splice(index, 1)
      }
    }
  }

  /**
   * 启动监听
   */
  start(): void {
    if (this.watcher) {
      return
    }

    try {
      // 确保目录存在
      path.dirname(this.configPath)

      this.watcher = fs.watch(this.configPath, { persistent: false }, (eventType) => {
        if (eventType === "change" || eventType === "rename") {
          this.scheduleReload()
        }
      })

      this.watcher.on("error", (error) => {
        console.error(`[ConfigHotReloader] Watch error:`, error.message)
      })
    } catch (error) {
      // 文件不存在时，监听目录
      const dir = path.dirname(this.configPath)
      const filename = path.basename(this.configPath)

      try {
        this.watcher = fs.watch(dir, { persistent: false }, (_eventType, changedFilename) => {
          if (changedFilename === filename) {
            this.scheduleReload()
          }
        })

        this.watcher.on("error", (error) => {
          console.error(`[ConfigHotReloader] Watch error:`, error.message)
        })
      } catch {
        console.error(`[ConfigHotReloader] Failed to watch config directory: ${dir}`)
      }
    }
  }

  /**
   * 停止监听
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  /**
   * 调度重新加载（带防抖）
   */
  private scheduleReload(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.reload()
    }, this.debounceMs)
  }

  /**
   * 重新加载配置
   */
  async reload(): Promise<ConfigChangeEvent[]> {
    const result = await loadMcpConfigFromFile(this.configPath)

    if (!result.config) {
      return []
    }

    const changes = compareConfigs(this.currentConfig, result.config)

    if (changes.length > 0) {
      this.currentConfig = result.config
      this.notifyHandlers(changes)
    }

    return changes
  }

  /**
   * 通知所有处理器
   */
  private notifyHandlers(changes: ConfigChangeEvent[]): void {
    for (const handler of this.handlers) {
      try {
        handler(changes)
      } catch (error) {
        console.error(`[ConfigHotReloader] Handler error:`, error)
      }
    }
  }

  /**
   * 检查是否正在监听
   */
  get isWatching(): boolean {
    return this.watcher !== null
  }
}

/**
 * 创建配置热重载器
 *
 * @param cwd 工作目录
 * @param initialConfig 初始配置
 * @returns 配置热重载器
 */
export function createConfigHotReloader(
  cwd: string,
  initialConfig: McpConfigWithSettings
): ConfigHotReloader {
  const configPath = path.join(cwd, ".naughty", "mcp.json")
  return new ConfigHotReloader(configPath, initialConfig)
}
