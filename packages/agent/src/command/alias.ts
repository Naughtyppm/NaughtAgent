/**
 * 别名管理器 (Alias Manager)
 *
 * 负责：
 * - 命令别名的持久化存储
 * - 别名解析和查找
 * - 冲突检测（与内置命令）
 * - 别名的增删改查
 *
 * 需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import * as os from "os"

// ============================================================================
// Types
// ============================================================================

/**
 * 别名定义
 */
export interface AliasDefinition {
  /** 别名名称 */
  name: string
  /** 目标命令 */
  command: string
  /** 描述（可选） */
  description?: string
  /** 创建时间 */
  createdAt: number
}

/**
 * 别名配置
 */
export interface AliasConfig {
  /** 别名文件路径 */
  aliasFile: string
  /** 内置命令列表（用于冲突检测） */
  builtinCommands: string[]
}

/**
 * 别名管理器接口
 */
export interface AliasManager {
  /** 加载别名 */
  load(): Promise<Map<string, AliasDefinition>>

  /** 同步加载别名 */
  loadSync(): Map<string, AliasDefinition>

  /** 保存别名 */
  save(aliases: Map<string, AliasDefinition>): Promise<void>

  /** 添加别名 */
  add(name: string, command: string, description?: string): Promise<boolean>

  /** 移除别名 */
  remove(name: string): Promise<boolean>

  /** 获取所有别名 */
  getAll(): Promise<AliasDefinition[]>

  /** 解析别名 */
  resolve(name: string): Promise<string | null>

  /** 检查是否与内置命令冲突 */
  hasConflict(name: string): boolean
}

// ============================================================================
// Constants
// ============================================================================

/** 默认别名文件路径 */
export const DEFAULT_ALIAS_FILE = path.join(
  os.homedir(),
  ".naughtyagent",
  "aliases.json"
)

/** 默认内置命令列表 */
export const DEFAULT_BUILTIN_COMMANDS = [
  "help",
  "exit",
  "quit",
  "clear",
  "history",
  "refresh",
  "config",
  "model",
  "context",
  "compact",
  "cost",
  "doctor",
  "init",
  "login",
  "logout",
  "mcp",
  "permissions",
  "pr-comments",
  "resume",
  "review",
  "status",
  "terminal",
  "vim",
  "bug",
  "listen",
  "memory",
  "think",
  "alias",
]

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建别名管理器
 */
export function createAliasManager(config?: Partial<AliasConfig>): AliasManager {
  const aliasFile = config?.aliasFile ?? DEFAULT_ALIAS_FILE
  const builtinCommands = config?.builtinCommands ?? DEFAULT_BUILTIN_COMMANDS

  // 内存缓存
  let cache: Map<string, AliasDefinition> | null = null

  return {
    async load(): Promise<Map<string, AliasDefinition>> {
      try {
        const content = await fs.readFile(aliasFile, "utf-8")
        const data = JSON.parse(content) as Record<string, AliasDefinition>
        cache = new Map(Object.entries(data))
        return cache
      } catch {
        cache = new Map()
        return cache
      }
    },

    loadSync(): Map<string, AliasDefinition> {
      try {
        if (!fsSync.existsSync(aliasFile)) {
          cache = new Map()
          return cache
        }
        const content = fsSync.readFileSync(aliasFile, "utf-8")
        const data = JSON.parse(content) as Record<string, AliasDefinition>
        cache = new Map(Object.entries(data))
        return cache
      } catch {
        cache = new Map()
        return cache
      }
    },

    async save(aliases: Map<string, AliasDefinition>): Promise<void> {
      // 确保目录存在
      const dir = path.dirname(aliasFile)
      await fs.mkdir(dir, { recursive: true })

      // 转换为对象并保存
      const data: Record<string, AliasDefinition> = {}
      for (const [key, value] of aliases) {
        data[key] = value
      }
      await fs.writeFile(aliasFile, JSON.stringify(data, null, 2), "utf-8")
      cache = aliases
    },

    async add(name: string, command: string, description?: string): Promise<boolean> {
      // 检查冲突
      if (this.hasConflict(name)) {
        return false
      }

      // 加载现有别名
      const aliases = cache ?? await this.load()

      // 添加新别名
      aliases.set(name, {
        name,
        command,
        description,
        createdAt: Date.now(),
      })

      // 保存
      await this.save(aliases)
      return true
    },

    async remove(name: string): Promise<boolean> {
      const aliases = cache ?? await this.load()

      if (!aliases.has(name)) {
        return false
      }

      aliases.delete(name)
      await this.save(aliases)
      return true
    },

    async getAll(): Promise<AliasDefinition[]> {
      const aliases = cache ?? await this.load()
      return Array.from(aliases.values())
    },

    async resolve(name: string): Promise<string | null> {
      const aliases = cache ?? await this.load()
      const alias = aliases.get(name)
      return alias?.command ?? null
    },

    hasConflict(name: string): boolean {
      return builtinCommands.includes(name.toLowerCase())
    },
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  createAliasManager as _createAliasManager,
}
