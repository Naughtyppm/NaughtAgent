/**
 * Tokenizer Provider - 管理 Tokenizer 实例的生命周期
 */

import type {
  CacheStats,
  ModelType,
  Tokenizer,
  TokenizerProvider,
  TokenizerType,
} from "./types"
import { createTokenizer } from "./tokenizer-factory"
import { createEstimateTokenizer } from "./estimate-tokenizer"
import { preloadClaudeTokenizer } from "./claude-tokenizer"
import { preloadGPTTokenizer } from "./gpt-tokenizer"

/**
 * 推断模型类型对应的 Tokenizer 类型
 */
function inferTokenizerType(modelType?: ModelType): TokenizerType {
  if (!modelType) return "claude" // 默认使用 Claude

  const model = modelType.toLowerCase()

  if (model.startsWith("claude") || model.includes("anthropic")) {
    return "claude"
  }

  if (
    model.startsWith("gpt") ||
    model.startsWith("o1") ||
    model.includes("openai")
  ) {
    return "gpt"
  }

  return "estimate"
}

/**
 * 默认 TokenizerProvider 实现
 */
class DefaultTokenizerProvider implements TokenizerProvider {
  private cache = new Map<TokenizerType, Tokenizer>()
  private hits = 0
  private misses = 0

  getTokenizer(modelType?: ModelType): Tokenizer {
    const type = inferTokenizerType(modelType)

    // 检查缓存
    const cached = this.cache.get(type)
    if (cached) {
      this.hits++
      return cached
    }

    this.misses++

    // 创建新的 tokenizer
    const tokenizer = createTokenizer({
      type,
      fallbackStrategy: "estimate",
    })

    if (tokenizer) {
      this.cache.set(type, tokenizer)
      return tokenizer
    }

    // 最终回退到估算
    const fallback = createEstimateTokenizer()
    this.cache.set("estimate", fallback)
    return fallback
  }

  async preload(types: TokenizerType[]): Promise<void> {
    const promises: Promise<void>[] = []

    for (const type of types) {
      switch (type) {
        case "claude":
          promises.push(preloadClaudeTokenizer())
          break
        case "gpt":
          promises.push(preloadGPTTokenizer())
          break
      }
    }

    await Promise.allSettled(promises)

    // 预热缓存
    for (const type of types) {
      if (!this.cache.has(type)) {
        const tokenizer = createTokenizer({
          type,
          fallbackStrategy: "none",
        })
        if (tokenizer) {
          this.cache.set(type, tokenizer)
        }
      }
    }
  }

  clearCache(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  getCacheStats(): CacheStats {
    return {
      cachedCount: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      cachedTypes: Array.from(this.cache.keys()),
    }
  }
}

// 单例 Provider
let providerInstance: TokenizerProvider | null = null

/**
 * 获取 TokenizerProvider 实例
 */
export function getTokenizerProvider(): TokenizerProvider {
  if (!providerInstance) {
    providerInstance = new DefaultTokenizerProvider()
  }
  return providerInstance
}

/**
 * 创建新的 TokenizerProvider 实例
 */
export function createTokenizerProvider(): TokenizerProvider {
  return new DefaultTokenizerProvider()
}
