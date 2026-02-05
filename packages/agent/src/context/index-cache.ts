/**
 * IndexCache 索引缓存模块
 *
 * 负责：
 * - 项目索引的持久化缓存管理
 * - 缓存有效性检查（基于哈希匹配）
 * - 缓存加载和保存
 * - 带缓存逻辑的索引获取
 *
 * 需求: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import { createHashCalculator, type HashCalculator } from "./hash-calculator"
import { loadProjectStructure, type TechStack } from "./context"

// ============================================================================
// Types
// ============================================================================

/**
 * 项目索引数据结构
 * 存储在 `.naught/cache/project-index.json`
 */
export interface ProjectIndex {
  /** 索引版本号 */
  version: string
  /** 更新时间戳 */
  updatedAt: number
  /** 项目内容哈希（用于检测变更） */
  hash: string
  /** 项目根目录 */
  root: string
  /** 项目结构信息 */
  structure: {
    /** 目录树字符串 */
    tree: string
    /** 关键文件列表 */
    keyFiles: string[]
    /** 检测到的技术栈 */
    techStack: TechStack
  }
  /** 缓存元数据 */
  metadata: {
    /** 生成耗时（毫秒） */
    generationTime: number
    /** 文件数量 */
    fileCount: number
    /** 目录数量 */
    dirCount: number
  }
}

/**
 * 索引缓存配置
 */
export interface IndexCacheConfig {
  /** 缓存目录 */
  cacheDir: string
  /** 缓存文件名 */
  cacheFile: string
  /** 缓存有效期（毫秒），默认 24 小时 */
  ttl?: number
}

/**
 * 缓存统计信息
 * 需求: 3.2, 3.3
 */
export interface CacheStats {
  /** 缓存命中次数 */
  hits: number
  /** 缓存未命中次数 */
  misses: number
  /** 命中率（0-1） */
  hitRate: number
  /** 增量更新次数 */
  incrementalUpdates: number
  /** 完整重建次数 */
  fullRebuilds: number
  /** 最后访问时间 */
  lastAccessTime: number | null
  /** 最后更新时间 */
  lastUpdateTime: number | null
}

/**
 * 文件变更信息
 */
export interface FileChange {
  /** 文件路径 */
  path: string
  /** 变更类型 */
  type: "added" | "modified" | "deleted"
  /** 变更时间戳 */
  timestamp: number
}

/**
 * 索引缓存接口
 */
export interface IndexCache {
  /** 加载缓存的项目索引 */
  load(): Promise<ProjectIndex | null>

  /** 同步加载缓存的项目索引（用于同步上下文） */
  loadSync(): ProjectIndex | null

  /** 保存项目索引到缓存 */
  save(index: ProjectIndex): Promise<void>

  /** 检查缓存是否有效 */
  isValid(index: ProjectIndex): Promise<boolean>

  /** 清除缓存 */
  clear(): Promise<void>

  /** 使缓存失效（用于 /refresh 命令） */
  invalidate(): Promise<void>

  /** 获取或创建索引（带缓存逻辑） */
  getOrCreate(cwd: string): Promise<ProjectIndex>

  /**
   * 增量更新索引
   * 需求: 3.1
   * @param changes 文件变更列表
   * @returns 更新后的索引
   */
  updateIncremental(changes: FileChange[]): Promise<ProjectIndex | null>

  /**
   * 获取缓存统计信息
   * 需求: 3.2, 3.3
   */
  getStats(): CacheStats

  /**
   * 重置统计信息
   */
  resetStats(): void
}

// ============================================================================
// Constants
// ============================================================================

/** 当前索引版本 */
const INDEX_VERSION = "1.0.0"

/** 默认缓存有效期：24 小时 */
const DEFAULT_TTL = 24 * 60 * 60 * 1000

/** 默认缓存目录 */
const DEFAULT_CACHE_DIR = ".naught/cache"

/** 默认缓存文件名 */
const DEFAULT_CACHE_FILE = "project-index.json"

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建索引缓存实例
 */
export function createIndexCache(config: IndexCacheConfig): IndexCache {
  const cacheDir = config.cacheDir
  const cacheFile = config.cacheFile
  const ttl = config.ttl ?? DEFAULT_TTL

  // 创建哈希计算器
  const hashCalculator = createHashCalculator()

  // 获取完整缓存文件路径
  const getCachePath = () => path.join(cacheDir, cacheFile)

  // 缓存统计
  let stats: CacheStats = createInitialStats()

  return {
    load: async () => {
      const result = await loadIndex(getCachePath())
      stats.lastAccessTime = Date.now()
      return result
    },
    loadSync: () => {
      const result = loadIndexSync(getCachePath())
      stats.lastAccessTime = Date.now()
      return result
    },
    save: async (index: ProjectIndex) => {
      await saveIndex(getCachePath(), index)
      stats.lastUpdateTime = Date.now()
    },
    isValid: (index: ProjectIndex) => isIndexValid(index, ttl, hashCalculator),
    clear: () => clearIndex(getCachePath()),
    invalidate: () => clearIndex(getCachePath()),
    getOrCreate: async (cwd: string) => {
      const result = await getOrCreateIndex(
        cwd,
        getCachePath(),
        ttl,
        hashCalculator,
        stats
      )
      return result
    },
    updateIncremental: async (changes: FileChange[]) => {
      return updateIndexIncremental(getCachePath(), changes, hashCalculator, stats)
    },
    getStats: () => ({ ...stats }),
    resetStats: () => {
      stats = createInitialStats()
    },
  }
}

/**
 * 使用默认配置创建索引缓存
 */
export function createDefaultIndexCache(cwd: string): IndexCache {
  return createIndexCache({
    cacheDir: path.join(cwd, DEFAULT_CACHE_DIR),
    cacheFile: DEFAULT_CACHE_FILE,
    ttl: DEFAULT_TTL,
  })
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 从缓存文件加载项目索引
 *
 * 需求 1.1: 检查是否存在有效的缓存 Project_Index
 * 需求 1.5: 从 `.naught/cache/project-index.json` 加载
 */
async function loadIndex(cachePath: string): Promise<ProjectIndex | null> {
  try {
    const content = await fs.readFile(cachePath, "utf-8")
    const index = JSON.parse(content) as ProjectIndex

    // 验证基本结构
    if (!isValidProjectIndex(index)) {
      // 缓存文件损坏，返回 null
      return null
    }

    return index
  } catch (error) {
    // 文件不存在或解析失败
    return null
  }
}

/**
 * 同步加载项目索引（用于同步上下文）
 */
function loadIndexSync(cachePath: string): ProjectIndex | null {
  try {
    if (!fsSync.existsSync(cachePath)) {
      return null
    }
    const content = fsSync.readFileSync(cachePath, "utf-8")
    const index = JSON.parse(content) as ProjectIndex

    // 验证基本结构
    if (!isValidProjectIndex(index)) {
      return null
    }

    return index
  } catch {
    return null
  }
}

/**
 * 保存项目索引到缓存文件
 *
 * 需求 1.3: 生成新的 Project_Index 并持久化
 * 需求 1.5: 存储在 `.naught/cache/project-index.json`
 */
async function saveIndex(cachePath: string, index: ProjectIndex): Promise<void> {
  // 确保缓存目录存在
  const cacheDir = path.dirname(cachePath)
  await fs.mkdir(cacheDir, { recursive: true })

  // 写入缓存文件
  const content = JSON.stringify(index, null, 2)
  await fs.writeFile(cachePath, content, "utf-8")
}

/**
 * 检查缓存是否有效
 *
 * 需求 1.2: 检查项目哈希是否匹配
 */
async function isIndexValid(
  index: ProjectIndex,
  ttl: number,
  hashCalculator: HashCalculator
): Promise<boolean> {
  // 检查版本
  if (index.version !== INDEX_VERSION) {
    return false
  }

  // 检查 TTL
  const now = Date.now()
  if (now - index.updatedAt > ttl) {
    return false
  }

  // 检查哈希匹配
  try {
    const currentHash = await hashCalculator.computeProjectHash(index.root)
    return currentHash === index.hash
  } catch {
    // 哈希计算失败，认为缓存无效
    return false
  }
}

/**
 * 清除缓存
 */
async function clearIndex(cachePath: string): Promise<void> {
  try {
    await fs.unlink(cachePath)
  } catch {
    // 文件不存在，忽略错误
  }
}

/**
 * 获取或创建索引（带缓存逻辑）
 *
 * 需求 1.1: 检查是否存在有效的缓存 Project_Index
 * 需求 1.2: 存在有效缓存且哈希匹配时，加载缓存索引
 * 需求 1.3: 不存在缓存或哈希不匹配时，生成新索引并持久化
 */
async function getOrCreateIndex(
  cwd: string,
  cachePath: string,
  ttl: number,
  hashCalculator: HashCalculator,
  stats: CacheStats
): Promise<ProjectIndex> {
  // 尝试加载缓存
  const cached = await loadIndex(cachePath)
  stats.lastAccessTime = Date.now()

  if (cached) {
    // 检查缓存有效性
    const valid = await isIndexValid(cached, ttl, hashCalculator)
    if (valid) {
      stats.hits++
      updateHitRate(stats)
      return cached
    }
  }

  // 缓存未命中
  stats.misses++
  stats.fullRebuilds++
  updateHitRate(stats)

  // 生成新索引
  const index = await generateProjectIndex(cwd, hashCalculator)

  // 保存到缓存
  await saveIndex(cachePath, index)
  stats.lastUpdateTime = Date.now()

  return index
}

// ============================================================================
// Index Generation
// ============================================================================

/**
 * 生成项目索引
 *
 * 需求 1.4: 包含项目结构树、关键文件列表、技术栈信息和内容哈希
 */
async function generateProjectIndex(
  cwd: string,
  hashCalculator: HashCalculator
): Promise<ProjectIndex> {
  const startTime = Date.now()

  // 加载项目结构
  const structure = await loadProjectStructure(cwd)

  // 计算项目哈希
  const hash = await hashCalculator.computeProjectHash(cwd)

  // 统计文件和目录数量
  const { fileCount, dirCount } = countTreeItems(structure.tree)

  const generationTime = Date.now() - startTime

  return {
    version: INDEX_VERSION,
    updatedAt: Date.now(),
    hash,
    root: cwd,
    structure: {
      tree: structure.tree,
      keyFiles: structure.keyFiles,
      techStack: structure.techStack,
    },
    metadata: {
      generationTime,
      fileCount,
      dirCount,
    },
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * 验证 ProjectIndex 结构是否有效
 *
 * 需求 1.4: 确保包含所有必需字段
 */
export function isValidProjectIndex(index: unknown): index is ProjectIndex {
  if (!index || typeof index !== "object") {
    return false
  }

  const obj = index as Record<string, unknown>

  // 检查顶级字段
  if (typeof obj.version !== "string") return false
  if (typeof obj.updatedAt !== "number") return false
  if (typeof obj.hash !== "string") return false
  if (typeof obj.root !== "string") return false

  // 检查 structure
  if (!obj.structure || typeof obj.structure !== "object") return false
  const structure = obj.structure as Record<string, unknown>
  if (typeof structure.tree !== "string") return false
  if (!Array.isArray(structure.keyFiles)) return false
  if (!structure.techStack || typeof structure.techStack !== "object") return false

  // 检查 techStack
  const techStack = structure.techStack as Record<string, unknown>
  if (!Array.isArray(techStack.languages)) return false
  if (!Array.isArray(techStack.frameworks)) return false

  // 检查 metadata
  if (!obj.metadata || typeof obj.metadata !== "object") return false
  const metadata = obj.metadata as Record<string, unknown>
  if (typeof metadata.generationTime !== "number") return false
  if (typeof metadata.fileCount !== "number") return false
  if (typeof metadata.dirCount !== "number") return false

  return true
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 创建初始统计信息
 */
function createInitialStats(): CacheStats {
  return {
    hits: 0,
    misses: 0,
    hitRate: 0,
    incrementalUpdates: 0,
    fullRebuilds: 0,
    lastAccessTime: null,
    lastUpdateTime: null,
  }
}

/**
 * 更新命中率
 */
function updateHitRate(stats: CacheStats): void {
  const total = stats.hits + stats.misses
  stats.hitRate = total > 0 ? stats.hits / total : 0
}

/**
 * 增量更新索引
 * 需求: 3.1
 */
async function updateIndexIncremental(
  cachePath: string,
  changes: FileChange[],
  hashCalculator: HashCalculator,
  stats: CacheStats
): Promise<ProjectIndex | null> {
  // 加载现有缓存
  const cached = await loadIndex(cachePath)
  if (!cached) {
    return null
  }

  // 如果变更太多，建议完整重建
  if (changes.length > 50) {
    return null
  }

  // 更新关键文件列表
  const keyFiles = new Set(cached.structure.keyFiles)
  
  for (const change of changes) {
    if (change.type === "deleted") {
      keyFiles.delete(change.path)
    } else if (change.type === "added") {
      // 检查是否是关键文件（配置文件、入口文件等）
      if (isKeyFile(change.path)) {
        keyFiles.add(change.path)
      }
    }
    // modified 不改变关键文件列表
  }

  // 重新计算哈希
  const newHash = await hashCalculator.computeProjectHash(cached.root)

  // 创建更新后的索引
  const updatedIndex: ProjectIndex = {
    ...cached,
    hash: newHash,
    updatedAt: Date.now(),
    structure: {
      ...cached.structure,
      keyFiles: Array.from(keyFiles),
    },
  }

  // 保存更新后的索引
  await saveIndex(cachePath, updatedIndex)

  // 更新统计
  stats.incrementalUpdates++
  stats.lastUpdateTime = Date.now()

  return updatedIndex
}

/**
 * 检查文件是否是关键文件
 */
function isKeyFile(filePath: string): boolean {
  const keyPatterns = [
    /package\.json$/,
    /tsconfig\.json$/,
    /\.env$/,
    /README\.md$/i,
    /Cargo\.toml$/,
    /go\.mod$/,
    /requirements\.txt$/,
    /pyproject\.toml$/,
    /Makefile$/,
    /Dockerfile$/,
    /docker-compose\.ya?ml$/,
    /\.gitignore$/,
  ]
  
  return keyPatterns.some(pattern => pattern.test(filePath))
}

/**
 * 统计目录树中的文件和目录数量
 */
function countTreeItems(tree: string): { fileCount: number; dirCount: number } {
  if (!tree) {
    return { fileCount: 0, dirCount: 0 }
  }

  const lines = tree.split("\n").filter((line) => line.trim())
  let fileCount = 0
  let dirCount = 0

  for (const line of lines) {
    // 跳过截断提示
    if (line.includes("(truncated)")) {
      continue
    }

    // 目录以 / 结尾
    if (line.endsWith("/")) {
      dirCount++
    } else {
      fileCount++
    }
  }

  return { fileCount, dirCount }
}

// ============================================================================
// Exports
// ============================================================================

export {
  INDEX_VERSION,
  DEFAULT_TTL,
  DEFAULT_CACHE_DIR,
  DEFAULT_CACHE_FILE,
  // 导出内部函数用于测试
  loadIndex as _loadIndex,
  saveIndex as _saveIndex,
  isIndexValid as _isIndexValid,
  generateProjectIndex as _generateProjectIndex,
  countTreeItems as _countTreeItems,
  createInitialStats as _createInitialStats,
  updateHitRate as _updateHitRate,
  updateIndexIncremental as _updateIndexIncremental,
  isKeyFile as _isKeyFile,
}
