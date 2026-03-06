/**
 * Token 精确计数 - 错误类型
 */

import type { TokenizerType } from "./types"

/**
 * Tokenizer 加载错误
 */
export class TokenizerLoadError extends Error {
  constructor(
    public readonly tokenizerType: TokenizerType,
    public readonly cause?: Error
  ) {
    super(
      `无法加载 ${tokenizerType} tokenizer: ${cause?.message ?? "未知错误"}`
    )
    this.name = "TokenizerLoadError"
  }
}

/**
 * 无效 Token ID 错误
 */
export class InvalidTokenError extends Error {
  constructor(
    public readonly invalidTokens: number[],
    public readonly tokenizerType: TokenizerType
  ) {
    super(
      `无效的 token ID: [${invalidTokens.join(", ")}] (tokenizer: ${tokenizerType})`
    )
    this.name = "InvalidTokenError"
  }
}

/**
 * 文本过长错误
 */
export class TextTooLongError extends Error {
  constructor(
    public readonly textLength: number,
    public readonly maxLength: number
  ) {
    super(`文本过长: ${textLength} 字符，最大允许 ${maxLength} 字符`)
    this.name = "TextTooLongError"
  }
}
