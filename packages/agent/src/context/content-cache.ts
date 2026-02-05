/**
 * ContentCache 智能内容缓存
 *
 * 负责：
 * - 缓存已读取的文件内容
 * - 检测重复内容
 * - 返回哈希引用代替重复内容
 * - 会话级别作用域
 *
 * 需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { computeContentHash } from "./hash-calculator"

// ============================================================================
// Types
// ============================================================================

/**
 * 缓存条目
 */
export interface CacheEntry {
  /** 内容哈希 */
  hash: string
  /** 文件路径（如果是文件内容） */
  filePath?: string
  /** 内容长度 */
  length: number
  /** 添加时间 */
  addedAt: number
  /** 访问次数 */
  accessCount: number
}

/**
 * 内容缓存接口
 */
export interface ContentCache {
  /** 检查内容是否已缓存 */
  has(content: string): boolean

  /** 通过哈希检查是否已缓存 */
  hasByHash(hash: string): boolean

  /** 添加内容到缓存 */
  add(content: string, filePath?: string): CacheEntry

  /** 获取哈希引用 */
  getReference(content: string): string | null

  /** 通过哈希获取引用 */
  getReferenceByHash(hash: string): string | null

  /** 清除缓存 */
  clear(): void

  /** 获取缓存统计 */
  getStats(): CacheStats
}

/**
 * 缓存统计
 */
export interface CacheStats {
  /** 缓存条目数 */
  entryCount: number
  /** 总缓存大小（字符数） */
  totalSize: number
  /** 缓存命中次数 */
  hitCount: number
  /** 缓存未命中次数 */
  missCount: number
}

// ============================================================================
// Constants
// ============================================================================

/** 哈希引用格式 */
const HASH_REFERENCE_PREFIX = "[已缓存内容: "
const HASH_REFERENCE_SUFFIX = "]"


// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建内容缓存
 *
 * 需求 6.6: 会话级别作用域
 */
export function createContentCache(): ContentCache {
  // 内部状态
  const cache = new Map<string, CacheEntry>()
  let hitCount = 0
  let missCount = 0

  return {
    /**
     * 检查内容是否已缓存
     *
     * 需求 6.1: 检测重复内容
     */
    has(content: string): boolean {
      const hash = computeContentHash(content)
      return cache.has(hash)
    },

    /**
     * 通过哈希检查是否已缓存
     */
    hasByHash(hash: string): boolean {
      return cache.has(hash)
    },

    /**
     * 添加内容到缓存
     *
     * 需求 6.2: 缓存已读取的内容
     */
    add(content: string, filePath?: string): CacheEntry {
      const hash = computeContentHash(content)

      // 如果已存在，更新访问计数
      const existing = cache.get(hash)
      if (existing) {
        existing.accessCount++
        hitCount++
        return existing
      }

      // 创建新条目
      const entry: CacheEntry = {
        hash,
        filePath,
        length: content.length,
        addedAt: Date.now(),
        accessCount: 1,
      }

      cache.set(hash, entry)
      missCount++
      return entry
    },

    /**
     * 获取哈希引用
     *
     * 需求 6.3: 返回哈希引用代替重复内容
     */
    getReference(content: string): string | null {
      const hash = computeContentHash(content)
      return this.getReferenceByHash(hash)
    },

    /**
     * 通过哈希获取引用
     *
     * 需求 6.3: 返回哈希引用
     */
    getReferenceByHash(hash: string): string | null {
      const entry = cache.get(hash)
      if (!entry) {
        return null
      }

      // 更新访问计数
      entry.accessCount++
      hitCount++

      // 构建引用字符串
      // 需求 6.4: 引用格式包含哈希和文件路径（如果有）
      if (entry.filePath) {
        return `${HASH_REFERENCE_PREFIX}${entry.filePath} (${entry.hash.slice(0, 8)})${HASH_REFERENCE_SUFFIX}`
      }
      return `${HASH_REFERENCE_PREFIX}${entry.hash.slice(0, 8)}${HASH_REFERENCE_SUFFIX}`
    },

    /**
     * 清除缓存
     *
     * 需求 6.5: 支持清除缓存
     */
    clear(): void {
      cache.clear()
      hitCount = 0
      missCount = 0
    },

    /**
     * 获取缓存统计
     */
    getStats(): CacheStats {
      let totalSize = 0
      for (const entry of cache.values()) {
        totalSize += entry.length
      }

      return {
        entryCount: cache.size,
        totalSize,
        hitCount,
        missCount,
      }
    },
  }
}

/**
 * 检查字符串是否是哈希引用
 */
export function isHashReference(str: string): boolean {
  return str.startsWith(HASH_REFERENCE_PREFIX) && str.endsWith(HASH_REFERENCE_SUFFIX)
}

/**
 * 从哈希引用中提取哈希
 */
export function extractHashFromReference(reference: string): string | null {
  if (!isHashReference(reference)) {
    return null
  }

  const content = reference.slice(
    HASH_REFERENCE_PREFIX.length,
    -HASH_REFERENCE_SUFFIX.length
  )

  // 格式: "filePath (hash)" 或 "hash"
  const match = content.match(/\(([a-f0-9]+)\)$/)
  if (match) {
    return match[1]
  }

  // 纯哈希格式
  if (/^[a-f0-9]+$/.test(content)) {
    return content
  }

  return null
}
