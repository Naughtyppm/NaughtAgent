/**
 * 估算 Tokenizer - 基于字符比例估算
 *
 * 作为回退方案，当精确 tokenizer 不可用时使用
 */

import type { Tokenizer, TokenizerType } from "./types"

/**
 * 估算 Tokenizer 实现
 */
export class EstimateTokenizer implements Tokenizer {
  readonly type: TokenizerType = "estimate"

  /**
   * 估算文本的 Token 数
   *
   * 规则：
   * - 英文字符：约 4 字符 = 1 token
   * - 中文字符：约 1.5 字符 = 1 token
   * - 其他字符：约 3 字符 = 1 token
   */
  countTokens(text: string): number {
    if (!text) return 0

    let englishChars = 0
    let chineseChars = 0
    let otherChars = 0

    for (const char of text) {
      const code = char.charCodeAt(0)

      if (code >= 0x4e00 && code <= 0x9fff) {
        // 中文字符
        chineseChars++
      } else if (
        (code >= 0x41 && code <= 0x5a) || // A-Z
        (code >= 0x61 && code <= 0x7a) // a-z
      ) {
        englishChars++
      } else {
        otherChars++
      }
    }

    // 估算
    const tokens =
      englishChars / 4 + // 英文：约 4 字符 = 1 token
      chineseChars / 1.5 + // 中文：约 1.5 字符 = 1 token
      otherChars / 3 // 其他：约 3 字符 = 1 token

    return Math.ceil(tokens)
  }

  /**
   * 伪编码 - 返回字符码数组
   * 注意：这不是真正的 token 编码，仅用于兼容接口
   */
  encode(text: string): number[] {
    // 返回字符码作为伪 token
    return Array.from(text).map((char) => char.charCodeAt(0))
  }

  /**
   * 伪解码 - 从字符码数组还原文本
   */
  decode(tokens: number[]): string {
    return String.fromCharCode(...tokens)
  }

  /**
   * 按估算 token 数截断文本
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
 * 创建估算 Tokenizer
 */
export function createEstimateTokenizer(): Tokenizer {
  return new EstimateTokenizer()
}
