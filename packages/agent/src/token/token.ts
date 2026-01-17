/**
 * Token 管理系统
 *
 * 负责：
 * - 估算 Token 数量
 * - 截断过长的上下文
 * - 压缩会话历史
 */

import type { Message } from "../session/message"
import { getMessageText, getToolCalls } from "../session/message"

// ============================================================================
// Types
// ============================================================================

/**
 * Token 计数结果
 */
export interface TokenCount {
  /** 总 Token 数 */
  total: number
  /** 系统提示 Token */
  system: number
  /** 消息历史 Token */
  messages: number
  /** 工具定义 Token */
  tools: number
}

/**
 * Token 限制配置
 */
export interface TokenLimits {
  /** 最大上下文 Token（默认 180000） */
  maxContext: number
  /** 保留给输出的 Token（默认 8192） */
  reserveOutput: number
  /** 触发压缩的阈值比例（默认 0.8） */
  compressThreshold: number
  /** 压缩后保留的消息数（默认 10） */
  keepRecentMessages: number
}

/**
 * 截断策略
 */
export type TruncateStrategy = "drop_old" | "sliding_window"

/**
 * 截断结果
 */
export interface TruncateResult {
  /** 截断后的消息 */
  messages: Message[]
  /** 被移除的消息数 */
  removedCount: number
  /** 截断后的 Token 数 */
  tokenCount: number
}

/**
 * 工具定义（简化版，用于 Token 计算）
 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: unknown
}

// ============================================================================
// Constants
// ============================================================================

/** 默认 Token 限制 */
export const DEFAULT_TOKEN_LIMITS: TokenLimits = {
  maxContext: 180000,
  reserveOutput: 8192,
  compressThreshold: 0.8,
  keepRecentMessages: 10,
}

/** 每条消息的固定开销（role, 分隔符等） */
const MESSAGE_OVERHEAD = 4

/** 安全缓冲（估算可能有偏差） */
const SAFETY_BUFFER = 0.9

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * 估算文本的 Token 数
 *
 * 规则：
 * - 英文单词：约 1 token
 * - 中文字符：约 0.7 token（1.5 字符 = 1 token）
 * - 数字/符号：约 0.3 token
 * - 空白：约 0.25 token
 *
 * 这是估算，实际 Token 数可能有 10-20% 偏差
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  let tokens = 0

  // 统计不同类型字符
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
      (code >= 0x61 && code <= 0x7a)    // a-z
    ) {
      englishChars++
    } else {
      otherChars++
    }
  }

  // 估算
  // 英文：约 4 字符 = 1 token
  tokens += englishChars / 4
  // 中文：约 1.5 字符 = 1 token
  tokens += chineseChars / 1.5
  // 其他：约 3 字符 = 1 token
  tokens += otherChars / 3

  return Math.ceil(tokens)
}

/**
 * 计算单条消息的 Token 数
 */
export function countMessageTokens(message: Message): number {
  let tokens = MESSAGE_OVERHEAD

  // 计算文本内容
  const text = getMessageText(message)
  tokens += estimateTokens(text)

  // 计算工具调用
  if (message.role === "assistant") {
    const toolCalls = getToolCalls(message)
    for (const toolCall of toolCalls) {
      tokens += estimateTokens(toolCall.name)
      tokens += estimateTokens(JSON.stringify(toolCall.input))
      tokens += 10 // 工具调用结构开销
    }
  }

  // 计算工具结果
  for (const block of message.content) {
    if (block.type === "tool_result") {
      // content 可能是 string 或 ContentBlock[]
      if (typeof block.content === "string") {
        tokens += estimateTokens(block.content)
      } else {
        // 处理多模态内容
        for (const contentBlock of block.content) {
          if (contentBlock.type === "text") {
            tokens += estimateTokens(contentBlock.text)
          } else if (contentBlock.type === "image") {
            tokens += 1000 // 图片估算固定 token
          } else if (contentBlock.type === "audio") {
            tokens += 500 // 音频估算固定 token
          }
        }
      }
      tokens += 5 // tool_use_id 等开销
    }
  }

  return tokens
}

/**
 * 计算消息列表的 Token 数
 */
export function countMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + countMessageTokens(msg), 0)
}

/**
 * 计算工具定义的 Token 数
 */
export function countToolsTokens(tools: ToolDefinition[]): number {
  let tokens = 0
  for (const tool of tools) {
    tokens += estimateTokens(tool.name)
    tokens += estimateTokens(tool.description)
    tokens += estimateTokens(JSON.stringify(tool.parameters))
    tokens += 20 // 工具结构开销
  }
  return tokens
}

/**
 * 计算完整上下文的 Token 数
 */
export function countContextTokens(context: {
  system?: string
  messages: Message[]
  tools?: ToolDefinition[]
}): TokenCount {
  const system = context.system ? estimateTokens(context.system) : 0
  const messages = countMessagesTokens(context.messages)
  const tools = context.tools ? countToolsTokens(context.tools) : 0

  return {
    total: system + messages + tools,
    system,
    messages,
    tools,
  }
}

// ============================================================================
// Truncation
// ============================================================================

/**
 * 检查是否需要截断
 */
export function needsTruncation(
  tokenCount: TokenCount,
  limits: TokenLimits = DEFAULT_TOKEN_LIMITS
): boolean {
  const available = limits.maxContext - limits.reserveOutput
  const threshold = available * limits.compressThreshold
  return tokenCount.total > threshold
}

/**
 * 获取可用的 Token 数
 */
export function getAvailableTokens(
  limits: TokenLimits = DEFAULT_TOKEN_LIMITS
): number {
  return Math.floor(
    (limits.maxContext - limits.reserveOutput) * SAFETY_BUFFER
  )
}

/**
 * 截断消息（drop_old 策略）
 *
 * 从最旧的消息开始删除，直到 Token 数在限制内
 */
export function truncateDropOld(
  messages: Message[],
  targetTokens: number
): TruncateResult {
  const result: Message[] = []
  let tokens = 0

  // 从最新开始保留
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = countMessageTokens(messages[i])
    if (tokens + msgTokens > targetTokens) break
    result.unshift(messages[i])
    tokens += msgTokens
  }

  return {
    messages: result,
    removedCount: messages.length - result.length,
    tokenCount: tokens,
  }
}

/**
 * 截断消息（sliding_window 策略）
 *
 * 保留最近 N 条消息
 */
export function truncateSlidingWindow(
  messages: Message[],
  keepCount: number
): TruncateResult {
  const result = messages.slice(-keepCount)
  const tokens = countMessagesTokens(result)

  return {
    messages: result,
    removedCount: messages.length - result.length,
    tokenCount: tokens,
  }
}

/**
 * 截断消息
 */
export function truncateMessages(
  messages: Message[],
  options: {
    strategy?: TruncateStrategy
    targetTokens?: number
    keepCount?: number
  } = {}
): TruncateResult {
  const {
    strategy = "drop_old",
    targetTokens = getAvailableTokens(),
    keepCount = DEFAULT_TOKEN_LIMITS.keepRecentMessages,
  } = options

  switch (strategy) {
    case "sliding_window":
      return truncateSlidingWindow(messages, keepCount)
    case "drop_old":
    default:
      return truncateDropOld(messages, targetTokens)
  }
}

// ============================================================================
// Token Manager
// ============================================================================

/**
 * Token 管理器
 */
export interface TokenManager {
  /** 配置的限制 */
  limits: TokenLimits

  /** 估算文本 Token 数 */
  estimate(text: string): number

  /** 计算消息 Token 数 */
  countMessages(messages: Message[]): number

  /** 计算完整上下文 Token 数 */
  countContext(context: {
    system?: string
    messages: Message[]
    tools?: ToolDefinition[]
  }): TokenCount

  /** 检查是否需要截断 */
  needsTruncation(tokenCount: TokenCount): boolean

  /** 获取可用 Token 数 */
  getAvailable(): number

  /** 截断消息 */
  truncate(
    messages: Message[],
    options?: {
      strategy?: TruncateStrategy
      targetTokens?: number
      keepCount?: number
    }
  ): TruncateResult
}

/**
 * 创建 Token 管理器
 */
export function createTokenManager(
  limits: Partial<TokenLimits> = {}
): TokenManager {
  const config: TokenLimits = {
    ...DEFAULT_TOKEN_LIMITS,
    ...limits,
  }

  return {
    limits: config,

    estimate(text: string): number {
      return estimateTokens(text)
    },

    countMessages(messages: Message[]): number {
      return countMessagesTokens(messages)
    },

    countContext(context): TokenCount {
      return countContextTokens(context)
    },

    needsTruncation(tokenCount: TokenCount): boolean {
      return needsTruncation(tokenCount, config)
    },

    getAvailable(): number {
      return getAvailableTokens(config)
    },

    truncate(messages, options = {}): TruncateResult {
      return truncateMessages(messages, {
        ...options,
        targetTokens: options.targetTokens ?? this.getAvailable(),
        keepCount: options.keepCount ?? config.keepRecentMessages,
      })
    },
  }
}
