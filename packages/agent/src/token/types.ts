/**
 * Token 精确计数 - 类型定义
 */

// ============================================================================
// Tokenizer Types
// ============================================================================

/**
 * Tokenizer 类型
 */
export type TokenizerType = "claude" | "gpt" | "estimate"

/**
 * 模型类型
 */
export type ModelType =
  | "claude-3-opus"
  | "claude-3-sonnet"
  | "claude-3-haiku"
  | "claude-3.5-sonnet"
  | "claude-3.5-haiku"
  | "claude-4-opus"
  | "claude-4-sonnet"
  | "gpt-4"
  | "gpt-4-turbo"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-3.5-turbo"
  | string // 允许其他模型名称

/**
 * 回退策略
 */
export type FallbackStrategy = "estimate" | "error" | "none"

/**
 * Tokenizer 配置
 */
export interface TokenizerConfig {
  /** Tokenizer 类型 */
  type: TokenizerType
  /** 模型名称（用于选择正确的编码） */
  modelName?: string
  /** 是否启用缓存 */
  enableCache?: boolean
  /** 回退策略 */
  fallbackStrategy?: FallbackStrategy
}

/**
 * 缓存统计
 */
export interface CacheStats {
  /** 缓存的 tokenizer 数量 */
  cachedCount: number
  /** 缓存命中次数 */
  hits: number
  /** 缓存未命中次数 */
  misses: number
  /** 缓存的 tokenizer 类型列表 */
  cachedTypes: TokenizerType[]
}

// ============================================================================
// Tokenizer Interface
// ============================================================================

/**
 * Tokenizer 接口
 */
export interface Tokenizer {
  /** Tokenizer 类型标识 */
  readonly type: TokenizerType

  /** 计算文本的 token 数量 */
  countTokens(text: string): number

  /** 将文本编码为 token ID 数组 */
  encode(text: string): number[]

  /** 将 token ID 数组解码为文本 */
  decode(tokens: number[]): string

  /** 按 token 数量截断文本 */
  truncateToTokens(text: string, maxTokens: number): string
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * TokenizerProvider 接口
 */
export interface TokenizerProvider {
  /** 获取指定模型类型的 tokenizer */
  getTokenizer(modelType?: ModelType): Tokenizer

  /** 预加载 tokenizer（可选，用于启动时预热） */
  preload(types: TokenizerType[]): Promise<void>

  /** 清除缓存 */
  clearCache(): void

  /** 获取当前缓存状态 */
  getCacheStats(): CacheStats
}

// ============================================================================
// Factory Interface
// ============================================================================

/**
 * TokenizerFactory 接口
 */
export interface TokenizerFactory {
  /** 创建 tokenizer */
  create(config: TokenizerConfig): Tokenizer | null

  /** 检查指定类型是否可用 */
  isAvailable(type: TokenizerType): boolean

  /** 获取支持的 tokenizer 类型列表 */
  getSupportedTypes(): TokenizerType[]
}
