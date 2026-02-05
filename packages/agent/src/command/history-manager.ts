/**
 * 历史管理器 (History Manager)
 *
 * 负责：
 * - 命令历史的持久化存储
 * - 历史记录的增删查
 * - 去重和最大条目数限制
 * - 模式搜索
 *
 * 需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import * as os from "os"

// ============================================================================
// Types
// ============================================================================

/**
 * 历史条目
 */
export interface HistoryEntry {
  /** 命令内容 */
  command: string
  /** 执行时间戳 */
  timestamp: number
  /** 执行结果（可选） */
  success?: boolean
}

/**
 * 历史配置
 */
export interface HistoryConfig {
  /** 历史文件路径 */
  historyFile: string
  /** 最大条目数 */
  maxEntries: number
  /** 是否去重 */
  deduplicate: boolean
}

/**
 * 历史管理器接口
 */
export interface HistoryManager {
  /** 加载历史 */
  load(): Promise<HistoryEntry[]>

  /** 同步加载历史 */
  loadSync(): HistoryEntry[]

  /** 保存历史 */
  save(entries: HistoryEntry[]): Promise<void>

  /** 添加历史条目 */
  add(command: string, success?: boolean): Promise<void>

  /** 获取最近 N 条历史 */
  recent(count: number): Promise<HistoryEntry[]>

  /** 获取所有历史 */
  getAll(): Promise<HistoryEntry[]>

  /** 搜索历史 */
  search(pattern: string): Promise<HistoryEntry[]>

  /** 清除历史 */
  clear(): Promise<void>
}

// ============================================================================
// Constants
// ============================================================================

/** 默认历史文件路径 */
export const DEFAULT_HISTORY_FILE = path.join(
  os.homedir(),
  ".naughtyagent",
  "history.json"
)

/** 默认最大条目数 */
export const DEFAULT_MAX_ENTRIES = 1000

/** 默认配置 */
export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  historyFile: DEFAULT_HISTORY_FILE,
  maxEntries: DEFAULT_MAX_ENTRIES,
  deduplicate: true,
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建历史管理器
 */
export function createHistoryManager(config?: Partial<HistoryConfig>): HistoryManager {
  const finalConfig: HistoryConfig = {
    ...DEFAULT_HISTORY_CONFIG,
    ...config,
  }

  // 内存缓存
  let cache: HistoryEntry[] | null = null

  return {
    async load(): Promise<HistoryEntry[]> {
      try {
        const content = await fs.readFile(finalConfig.historyFile, "utf-8")
        const data = JSON.parse(content) as HistoryEntry[]
        cache = Array.isArray(data) ? data : []
        return cache
      } catch {
        cache = []
        return cache
      }
    },

    loadSync(): HistoryEntry[] {
      try {
        if (!fsSync.existsSync(finalConfig.historyFile)) {
          cache = []
          return cache
        }
        const content = fsSync.readFileSync(finalConfig.historyFile, "utf-8")
        const data = JSON.parse(content) as HistoryEntry[]
        cache = Array.isArray(data) ? data : []
        return cache
      } catch {
        cache = []
        return cache
      }
    },

    async save(entries: HistoryEntry[]): Promise<void> {
      // 确保目录存在
      const dir = path.dirname(finalConfig.historyFile)
      await fs.mkdir(dir, { recursive: true })

      // 限制最大条目数
      const trimmed = entries.slice(-finalConfig.maxEntries)

      // 保存
      await fs.writeFile(
        finalConfig.historyFile,
        JSON.stringify(trimmed, null, 2),
        "utf-8"
      )
      cache = trimmed
    },

    async add(command: string, success?: boolean): Promise<void> {
      const entries = cache ?? await this.load()

      // 去重：如果最后一条命令相同，不添加
      if (finalConfig.deduplicate && entries.length > 0) {
        const last = entries[entries.length - 1]
        if (last.command === command) {
          // 更新时间戳和结果
          last.timestamp = Date.now()
          last.success = success
          await this.save(entries)
          return
        }
      }

      // 添加新条目
      entries.push({
        command,
        timestamp: Date.now(),
        success,
      })

      await this.save(entries)
    },

    async recent(count: number): Promise<HistoryEntry[]> {
      const entries = cache ?? await this.load()
      return entries.slice(-count)
    },

    async getAll(): Promise<HistoryEntry[]> {
      return cache ?? await this.load()
    },

    async search(pattern: string): Promise<HistoryEntry[]> {
      const entries = cache ?? await this.load()

      // 支持简单的通配符模式
      const regex = new RegExp(
        pattern
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // 转义特殊字符
          .replace(/\\\*/g, ".*") // 将 * 转换为 .*
          .replace(/\\\?/g, "."), // 将 ? 转换为 .
        "i"
      )

      return entries.filter(entry => regex.test(entry.command))
    },

    async clear(): Promise<void> {
      cache = []
      await this.save([])
    },
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  createHistoryManager as _createHistoryManager,
}
