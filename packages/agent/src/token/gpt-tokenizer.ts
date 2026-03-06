/**
 * GPT Tokenizer - 使用 tiktoken
 */

import type { Tokenizer, TokenizerType } from "./types"
import { TokenizerLoadError } from "./errors"

// tiktoken 类型（使用 any 避免类型冲突）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TiktokenEncoding = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TiktokenModule = any

/**
 * GPT Tokenizer 实现
 */
export class GPTTokenizer implements Tokenizer {
  readonly type: TokenizerType = "gpt"

  private encoding: TiktokenEncoding

  constructor(encoding: TiktokenEncoding) {
    this.encoding = encoding
  }

  countTokens(text: string): number {
    if (!text) return 0
    const tokens = this.encoding.encode(text)
    return tokens.length
  }

  encode(text: string): number[] {
    if (!text) return []
    const tokens = this.encoding.encode(text)
    return Array.from(tokens)
  }

  decode(tokens: number[]): string {
    if (!tokens.length) return ""
    const bytes = this.encoding.decode(new Uint32Array(tokens))
    // tiktoken decode 返回 Uint8Array，需要转换为字符串
    return new TextDecoder().decode(bytes)
  }

  truncateToTokens(text: string, maxTokens: number): string {
    if (!text || maxTokens <= 0) return ""

    const tokens = this.encoding.encode(text)
    if (tokens.length <= maxTokens) return text

    const truncated = tokens.slice(0, maxTokens)
    const bytes = this.encoding.decode(truncated)
    // tiktoken decode 返回 Uint8Array，需要转换为字符串
    return new TextDecoder().decode(bytes)
  }
}

// 缓存的模块和编码
let cachedModule: TiktokenModule | null = null
const encodingCache = new Map<string, TiktokenEncoding>()


/**
 * 获取模型对应的编码名称
 */
function getEncodingForModel(model: string): string {
  // GPT-4 和 GPT-3.5-turbo 使用 cl100k_base
  if (
    model.includes("gpt-4") ||
    model.includes("gpt-3.5") ||
    model.includes("text-embedding")
  ) {
    return "cl100k_base"
  }
  // GPT-4o 使用 o200k_base
  if (model.includes("gpt-4o") || model.includes("o1")) {
    return "o200k_base"
  }
  // 默认使用 cl100k_base
  return "cl100k_base"
}

/**
 * 创建 GPT Tokenizer
 */
export async function createGPTTokenizer(
  modelName?: string
): Promise<Tokenizer> {
  try {
    if (!cachedModule) {
      cachedModule = await import("tiktoken")
    }

    const encodingName = getEncodingForModel(modelName ?? "gpt-4")

    // 检查缓存
    let encoding = encodingCache.get(encodingName)
    if (!encoding) {
      encoding = cachedModule.get_encoding(encodingName)
      encodingCache.set(encodingName, encoding)
    }

    return new GPTTokenizer(encoding)
  } catch (error) {
    throw new TokenizerLoadError("gpt", error as Error)
  }
}

/**
 * 同步创建 GPT Tokenizer（如果已加载）
 */
export function createGPTTokenizerSync(modelName?: string): Tokenizer | null {
  if (!cachedModule) return null

  try {
    const encodingName = getEncodingForModel(modelName ?? "gpt-4")
    let encoding = encodingCache.get(encodingName)

    if (!encoding) {
      encoding = cachedModule.get_encoding(encodingName)
      encodingCache.set(encodingName, encoding)
    }

    return new GPTTokenizer(encoding)
  } catch {
    return null
  }
}

/**
 * 预加载 GPT Tokenizer
 */
export async function preloadGPTTokenizer(): Promise<void> {
  try {
    if (!cachedModule) {
      cachedModule = await import("tiktoken")
    }
    // 预加载常用编码
    if (!encodingCache.has("cl100k_base")) {
      encodingCache.set("cl100k_base", cachedModule.get_encoding("cl100k_base"))
    }
  } catch {
    // 忽略加载失败
  }
}
