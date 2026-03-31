/**
 * OptimizationConfig 优化配置管理
 *
 * 负责：
 * - 定义优化配置接口和默认值
 * - 从 .naught/config.json 加载配置
 * - 合并用户配置和默认配置
 *
 * 需求: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import * as fs from "fs/promises"
import * as path from "path"
import { AUTO_COMPACT_TOKEN_THRESHOLD } from "../config"

// ============================================================================
// Types
// ============================================================================

/**
 * Token 压缩优化配置
 */
export interface TokenCompressionConfig {
  /** 是否启用 */
  enabled: boolean
  /** 触发阈值（Token 数） */
  threshold: number
  /** 目标 Token 数 */
  targetTokens: number
  /** 压缩策略 */
  strategy: "sliding_window" | "importance" | "summary"
  /** 始终保留的最近消息数 */
  keepRecentCount: number
}

/**
 * 输出截断优化配置
 */
export interface OutputTruncationConfig {
  /** 是否启用 */
  enabled: boolean
  /** 最大输出长度（字符） */
  maxLength: number
  /** 头部保留长度 */
  headLength: number
  /** 尾部保留长度 */
  tailLength: number
}

/**
 * 内容缓存优化配置
 */
export interface ContentCacheOptConfig {
  /** 是否启用 */
  enabled: boolean
}

/**
 * 上下文注入优化配置
 */
export interface ContextInjectionOptConfig {
  /** 是否启用 */
  enabled: boolean
  /** 最大注入 Token 数 */
  maxTokens: number
}

/**
 * 索引缓存优化配置
 */
export interface IndexCacheOptConfig {
  /** 是否启用 */
  enabled: boolean
  /** 缓存有效期（毫秒） */
  ttl: number
}

/**
 * 完整的优化配置
 */
export interface OptimizationConfig {
  /** Token 压缩配置 */
  compression: TokenCompressionConfig
  /** 输出截断配置 */
  truncation: OutputTruncationConfig
  /** 内容缓存配置 */
  contentCache: ContentCacheOptConfig
  /** 上下文注入配置 */
  contextInjection: ContextInjectionOptConfig
  /** 索引缓存配置 */
  indexCache: IndexCacheOptConfig
}

/**
 * 优化配置管理器接口
 */
export interface OptimizationConfigManager {
  /** 加载配置 */
  load(cwd: string): Promise<OptimizationConfig>

  /** 获取默认配置 */
  getDefaults(): OptimizationConfig

  /** 合并配置 */
  merge(base: OptimizationConfig, override: Partial<DeepPartial<OptimizationConfig>>): OptimizationConfig
}

/**
 * 深度部分类型（用于配置合并）
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// ============================================================================
// Constants
// ============================================================================

/** 配置文件路径 */
const CONFIG_FILE_PATH = ".naught/config.json"

/** 默认优化配置 */
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  compression: {
    enabled: true,
    threshold: 80000,
    targetTokens: AUTO_COMPACT_TOKEN_THRESHOLD,
    strategy: "importance",
    keepRecentCount: 10,
  },
  truncation: {
    enabled: true,
    maxLength: 10000,
    headLength: 4000,
    tailLength: 2000,
  },
  contentCache: {
    enabled: true,
  },
  contextInjection: {
    enabled: true,
    maxTokens: 2000,
  },
  indexCache: {
    enabled: true,
    ttl: 24 * 60 * 60 * 1000, // 24 小时
  },
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建优化配置管理器
 */
export function createOptimizationConfigManager(): OptimizationConfigManager {
  return {
    load: loadConfig,
    getDefaults: () => structuredClone(DEFAULT_OPTIMIZATION_CONFIG),
    merge: mergeConfig,
  }
}

/**
 * 加载配置
 *
 * 从 .naught/config.json 读取配置，与默认配置合并
 * 需求 7.1, 7.2, 7.3, 7.4: 支持通过配置文件设置各项参数
 * 需求 7.5: 缺失配置值时使用默认值
 */
async function loadConfig(cwd: string): Promise<OptimizationConfig> {
  const configPath = path.join(cwd, CONFIG_FILE_PATH)

  try {
    const content = await fs.readFile(configPath, "utf-8")
    const userConfig = JSON.parse(content)

    // 提取 optimization 部分（如果存在）
    const optimizationConfig = userConfig.optimization ?? userConfig

    // 合并用户配置和默认配置
    return mergeConfig(DEFAULT_OPTIMIZATION_CONFIG, optimizationConfig)
  } catch (error) {
    // 配置文件不存在或解析失败，返回默认配置
    // 需求 7.5: 当配置值缺失时，系统应使用合理的默认值
    return structuredClone(DEFAULT_OPTIMIZATION_CONFIG)
  }
}

/**
 * 合并配置
 *
 * 深度合并用户配置到基础配置
 * 需求 7.5: 当配置值缺失时，系统应使用合理的默认值
 */
function mergeConfig(
  base: OptimizationConfig,
  override: Partial<DeepPartial<OptimizationConfig>>
): OptimizationConfig {
  // 创建基础配置的深拷贝
  const result = structuredClone(base)

  // 合并 compression 配置
  if (override.compression) {
    result.compression = mergeSection(result.compression, override.compression)
  }

  // 合并 truncation 配置
  if (override.truncation) {
    result.truncation = mergeSection(result.truncation, override.truncation)
  }

  // 合并 contentCache 配置
  if (override.contentCache) {
    result.contentCache = mergeSection(result.contentCache, override.contentCache)
  }

  // 合并 contextInjection 配置
  if (override.contextInjection) {
    result.contextInjection = mergeSection(result.contextInjection, override.contextInjection)
  }

  // 合并 indexCache 配置
  if (override.indexCache) {
    result.indexCache = mergeSection(result.indexCache, override.indexCache)
  }

  return result
}

/**
 * 合并配置节
 *
 * 将覆盖值合并到基础值，只覆盖已定义的字段
 */
function mergeSection<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base }

  for (const key of Object.keys(override) as Array<keyof T>) {
    const value = override[key]
    if (value !== undefined) {
      result[key] = value as T[keyof T]
    }
  }

  return result
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * 验证压缩策略是否有效
 */
export function isValidCompressionStrategy(
  strategy: string
): strategy is TokenCompressionConfig["strategy"] {
  return ["sliding_window", "importance", "summary"].includes(strategy)
}

/**
 * 验证配置是否完整有效
 */
export function isValidOptimizationConfig(config: unknown): config is OptimizationConfig {
  if (!config || typeof config !== "object") {
    return false
  }

  const c = config as Record<string, unknown>

  // 检查所有必需的顶级字段
  const requiredSections = [
    "compression",
    "truncation",
    "contentCache",
    "contextInjection",
    "indexCache",
  ]

  for (const section of requiredSections) {
    if (!c[section] || typeof c[section] !== "object") {
      return false
    }
  }

  // 检查 compression 字段
  const compression = c.compression as Record<string, unknown>
  if (
    typeof compression.enabled !== "boolean" ||
    typeof compression.threshold !== "number" ||
    typeof compression.targetTokens !== "number" ||
    !isValidCompressionStrategy(compression.strategy as string) ||
    typeof compression.keepRecentCount !== "number"
  ) {
    return false
  }

  // 检查 truncation 字段
  const truncation = c.truncation as Record<string, unknown>
  if (
    typeof truncation.enabled !== "boolean" ||
    typeof truncation.maxLength !== "number" ||
    typeof truncation.headLength !== "number" ||
    typeof truncation.tailLength !== "number"
  ) {
    return false
  }

  // 检查 contentCache 字段
  const contentCache = c.contentCache as Record<string, unknown>
  if (typeof contentCache.enabled !== "boolean") {
    return false
  }

  // 检查 contextInjection 字段
  const contextInjection = c.contextInjection as Record<string, unknown>
  if (
    typeof contextInjection.enabled !== "boolean" ||
    typeof contextInjection.maxTokens !== "number"
  ) {
    return false
  }

  // 检查 indexCache 字段
  const indexCache = c.indexCache as Record<string, unknown>
  if (typeof indexCache.enabled !== "boolean" || typeof indexCache.ttl !== "number") {
    return false
  }

  return true
}
