/**
 * Claude Tokenizer - 使用 @anthropic-ai/tokenizer
 */

import type { Tokenizer, TokenizerType } from "./types"
import { TokenizerLoadError, InvalidTokenError } from "./errors"

// 动态导入类型
type AnthropicTokenizer = {
  countTokens: (text: string) => number
  // @anthropic-ai/tokenizer 只提供 countTokens，不提供 encode/decode
}

/**
 * Claude Tokenizer 实现
 */
export class ClaudeTokenizer implements Tokenizer {
  readonly type: TokenizerType = "claude"

  private tokenizer: AnthropicTokenizer

  constructor(tokenizer: AnthropicTokenizer) {
    this.tokenizer = tokenizer
  }

  countTokens(text: string): number {
    if (!text) return 0
    return this.tokenizer.countTokens(text)
  }

  /**
   * 编码文本
   * 注意：@anthropic-ai/tokenizer 不提供 encode 方法
   * 这里使用估算方式返回伪 token 数组
   */
  encode(text: string): number[] {
    // 返回一个长度等于 token 数的数组
    const count = this.countTokens(text)
    return new Array(count).fill(0).map((_, i) => i)
  }

  /**
   * 解码 token
   * 注意：由于没有真正的 encode，decode 也无法实现
   */
  decode(_tokens: number[]): string {
    throw new InvalidTokenError(_tokens, this.type)
  }

  /**
   * 按 token 数截断文本
   */
  truncateToTokens(text: string, maxTokens: number): string {
    if (!text || maxTokens <= 0) return ""

    const currentTokens = this.countTokens(text)
    if (currentTokens <= maxTokens) return text

    // 二分查找截断点
    let low = 0
    let high = text.length
    let result = ""

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2)
      const slice = text.slice(0, mid)
      const tokens = this.countTokens(slice)

      if (tokens <= maxTokens) {
        result = slice
        low = mid
      } else {
        high = mid - 1
      }
    }

    return result
  }
}

/**
 * 创建 Claude Tokenizer
 */
export async function createClaudeTokenizer(): Promise<Tokenizer> {
  try {
    // 动态导入
    const module = await import("@anthropic-ai/tokenizer")
    return new ClaudeTokenizer(module)
  } catch (error) {
    throw new TokenizerLoadError("claude", error as Error)
  }
}

/**
 * 同步创建 Claude Tokenizer（如果已加载）
 */
let cachedModule: AnthropicTokenizer | null = null

export function createClaudeTokenizerSync(): Tokenizer | null {
  if (cachedModule) {
    return new ClaudeTokenizer(cachedModule)
  }

  try {
    // 尝试同步 require（可能不可用）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require("@anthropic-ai/tokenizer")
    return new ClaudeTokenizer(cachedModule!)
  } catch {
    return null
  }
}

/**
 * 预加载 Claude Tokenizer
 */
export async function preloadClaudeTokenizer(): Promise<void> {
  try {
    cachedModule = await import("@anthropic-ai/tokenizer")
  } catch {
    // 忽略加载失败
  }
}
