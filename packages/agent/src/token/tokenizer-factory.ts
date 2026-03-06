/**
 * Tokenizer 工厂 - 创建不同类型的 Tokenizer
 */

import type {
  Tokenizer,
  TokenizerConfig,
  TokenizerFactory,
  TokenizerType,
} from "./types"
import { createEstimateTokenizer } from "./estimate-tokenizer"
import {
  createClaudeTokenizerSync,
  preloadClaudeTokenizer,
} from "./claude-tokenizer"
import { createGPTTokenizerSync, preloadGPTTokenizer } from "./gpt-tokenizer"

/**
 * 默认 Tokenizer 工厂实现
 */
class DefaultTokenizerFactory implements TokenizerFactory {
  private availableTypes: Set<TokenizerType> = new Set(["estimate"])

  constructor() {
    // 检查可用性
    this.checkAvailability()
  }

  private async checkAvailability(): Promise<void> {
    // 尝试预加载并检查可用性
    try {
      await preloadClaudeTokenizer()
      if (createClaudeTokenizerSync()) {
        this.availableTypes.add("claude")
      }
    } catch {
      // Claude tokenizer 不可用
    }

    try {
      await preloadGPTTokenizer()
      if (createGPTTokenizerSync()) {
        this.availableTypes.add("gpt")
      }
    } catch {
      // GPT tokenizer 不可用
    }
  }

  create(config: TokenizerConfig): Tokenizer | null {
    const { type, modelName, fallbackStrategy = "estimate" } = config

    let tokenizer: Tokenizer | null = null

    switch (type) {
      case "claude":
        tokenizer = createClaudeTokenizerSync()
        break
      case "gpt":
        tokenizer = createGPTTokenizerSync(modelName)
        break
      case "estimate":
        tokenizer = createEstimateTokenizer()
        break
    }

    // 处理回退
    if (!tokenizer) {
      switch (fallbackStrategy) {
        case "estimate":
          tokenizer = createEstimateTokenizer()
          break
        case "error":
          throw new Error(`无法创建 ${type} tokenizer`)
        case "none":
          return null
      }
    }

    return tokenizer
  }

  isAvailable(type: TokenizerType): boolean {
    return this.availableTypes.has(type)
  }

  getSupportedTypes(): TokenizerType[] {
    return Array.from(this.availableTypes)
  }
}

// 单例工厂
let factoryInstance: TokenizerFactory | null = null

/**
 * 获取 Tokenizer 工厂实例
 */
export function getTokenizerFactory(): TokenizerFactory {
  if (!factoryInstance) {
    factoryInstance = new DefaultTokenizerFactory()
  }
  return factoryInstance
}

/**
 * 创建 Tokenizer（便捷方法）
 */
export function createTokenizer(config: TokenizerConfig): Tokenizer | null {
  return getTokenizerFactory().create(config)
}
