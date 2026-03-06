/**
 * Token 管理系统
 *
 * 负责：
 * - 精确/估算 Token 数量
 * - 截断过长的上下文
 * - 压缩会话历史
 *
 * 支持三种 Tokenizer：
 * - Claude: 使用 @anthropic-ai/tokenizer（精确）
 * - GPT: 使用 tiktoken（精确）
 * - Estimate: 字符估算（回退方案）
 */

import type { Message } from "../session/message"
import { getMessageText, getToolCalls } from "../session/message"
import type { ModelType, Tokenizer } from "./types"
import { getTokenizerProvider } from "./tokenizer-provider"

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
 * 获取当前使用的 Tokenizer
 *
 * @param modelType - 模型类型（可选）
 * @returns Tokenizer 实例
 */
function getTokenizer(modelType?: ModelType): Tokenizer {
  return getTokenizerProvider().getTokenizer(modelType)
}

/**
 * 估算文本的 Token 数
 *
 * 优先使用精确 Tokenizer（Claude/GPT），回退到字符估算。
 *
 * @param text - 要计算的文本
 * @param modelType - 模型类型（可选，用于选择合适的 Tokenizer）
 * @returns Token 数量
 */
export function estimateTokens(text: string, modelType?: ModelType): number {
  if (!text) return 0
  return getTokenizer(modelType).countTokens(text)
}

/**
 * 计算单条消息的 Token 数
 *
 * @param message - 消息对象
 * @param modelType - 模型类型（可选）
 * @returns Token 数量
 */
export function countMessageTokens(message: Message, modelType?: ModelType): number {
  const tokenizer = getTokenizer(modelType)
  let tokens = MESSAGE_OVERHEAD

  // 计算文本内容
  const text = getMessageText(message)
  tokens += tokenizer.countTokens(text)

  // 计算工具调用
  if (message.role === "assistant") {
    const toolCalls = getToolCalls(message)
    for (const toolCall of toolCalls) {
      tokens += tokenizer.countTokens(toolCall.name)
      tokens += tokenizer.countTokens(JSON.stringify(toolCall.input))
      tokens += 10 // 工具调用结构开销
    }
  }

  // 计算工具结果
  for (const block of message.content) {
    if (block.type === "tool_result") {
      // content 可能是 string 或 ContentBlock[]
      if (typeof block.content === "string") {
        tokens += tokenizer.countTokens(block.content)
      } else {
        // 处理多模态内容
        for (const contentBlock of block.content) {
          if (contentBlock.type === "text") {
            tokens += tokenizer.countTokens(contentBlock.text)
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
 *
 * @param messages - 消息数组
 * @param modelType - 模型类型（可选）
 * @returns Token 数量
 */
export function countMessagesTokens(messages: Message[], modelType?: ModelType): number {
  return messages.reduce((sum, msg) => sum + countMessageTokens(msg, modelType), 0)
}

/**
 * 计算工具定义的 Token 数
 *
 * @param tools - 工具定义数组
 * @param modelType - 模型类型（可选）
 * @returns Token 数量
 */
export function countToolsTokens(tools: ToolDefinition[], modelType?: ModelType): number {
  const tokenizer = getTokenizer(modelType)
  let tokens = 0
  for (const tool of tools) {
    tokens += tokenizer.countTokens(tool.name)
    tokens += tokenizer.countTokens(tool.description)
    tokens += tokenizer.countTokens(JSON.stringify(tool.parameters))
    tokens += 20 // 工具结构开销
  }
  return tokens
}

/**
 * 计算完整上下文的 Token 数
 *
 * @param context - 上下文对象
 * @param modelType - 模型类型（可选）
 * @returns Token 计数详情
 */
export function countContextTokens(
  context: {
    system?: string
    messages: Message[]
    tools?: ToolDefinition[]
  },
  modelType?: ModelType
): TokenCount {
  const tokenizer = getTokenizer(modelType)
  const system = context.system ? tokenizer.countTokens(context.system) : 0
  const messages = countMessagesTokens(context.messages, modelType)
  const tools = context.tools ? countToolsTokens(context.tools, modelType) : 0

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
 *
 * @param messages - 消息数组
 * @param targetTokens - 目标 Token 数
 * @param modelType - 模型类型（可选）
 * @returns 截断结果
 */
export function truncateDropOld(
  messages: Message[],
  targetTokens: number,
  modelType?: ModelType
): TruncateResult {
  const result: Message[] = []
  let tokens = 0

  // 从最新开始保留
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = countMessageTokens(messages[i], modelType)
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
 *
 * @param messages - 消息数组
 * @param keepCount - 保留消息数
 * @param modelType - 模型类型（可选）
 * @returns 截断结果
 */
export function truncateSlidingWindow(
  messages: Message[],
  keepCount: number,
  modelType?: ModelType
): TruncateResult {
  const result = messages.slice(-keepCount)
  const tokens = countMessagesTokens(result, modelType)

  return {
    messages: result,
    removedCount: messages.length - result.length,
    tokenCount: tokens,
  }
}

/**
 * 截断文本到指定 Token 数
 *
 * @param text - 要截断的文本
 * @param maxTokens - 最大 Token 数
 * @param modelType - 模型类型（可选）
 * @returns 截断后的文本
 */
export function truncateToTokens(
  text: string,
  maxTokens: number,
  modelType?: ModelType
): string {
  if (!text) return ""
  return getTokenizer(modelType).truncateToTokens(text, maxTokens)
}

/**
 * 截断消息
 *
 * @param messages - 消息数组
 * @param options - 截断选项
 * @returns 截断结果
 */
export function truncateMessages(
  messages: Message[],
  options: {
    strategy?: TruncateStrategy
    targetTokens?: number
    keepCount?: number
    modelType?: ModelType
  } = {}
): TruncateResult {
  const {
    strategy = "drop_old",
    targetTokens = getAvailableTokens(),
    keepCount = DEFAULT_TOKEN_LIMITS.keepRecentMessages,
    modelType,
  } = options

  switch (strategy) {
    case "sliding_window":
      return truncateSlidingWindow(messages, keepCount, modelType)
    case "drop_old":
    default:
      return truncateDropOld(messages, targetTokens, modelType)
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

  /** 当前使用的模型类型 */
  modelType?: ModelType

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

  /** 截断文本到指定 Token 数 */
  truncateText(text: string, maxTokens: number): string

  /** 截断消息 */
  truncate(
    messages: Message[],
    options?: {
      strategy?: TruncateStrategy
      targetTokens?: number
      keepCount?: number
    }
  ): TruncateResult

  /** 设置模型类型 */
  setModelType(modelType: ModelType): void
}

/**
 * 创建 Token 管理器
 *
 * @param limits - Token 限制配置
 * @param modelType - 模型类型（可选）
 * @returns TokenManager 实例
 */
export function createTokenManager(
  limits: Partial<TokenLimits> = {},
  modelType?: ModelType
): TokenManager {
  const config: TokenLimits = {
    ...DEFAULT_TOKEN_LIMITS,
    ...limits,
  }

  let currentModelType = modelType

  return {
    limits: config,
    modelType: currentModelType,

    estimate(text: string): number {
      return estimateTokens(text, currentModelType)
    },

    countMessages(messages: Message[]): number {
      return countMessagesTokens(messages, currentModelType)
    },

    countContext(context): TokenCount {
      return countContextTokens(context, currentModelType)
    },

    needsTruncation(tokenCount: TokenCount): boolean {
      return needsTruncation(tokenCount, config)
    },

    getAvailable(): number {
      return getAvailableTokens(config)
    },

    truncateText(text: string, maxTokens: number): string {
      return truncateToTokens(text, maxTokens, currentModelType)
    },

    truncate(messages, options = {}): TruncateResult {
      return truncateMessages(messages, {
        ...options,
        targetTokens: options.targetTokens ?? this.getAvailable(),
        keepCount: options.keepCount ?? config.keepRecentMessages,
        modelType: currentModelType,
      })
    },

    setModelType(modelType: ModelType): void {
      currentModelType = modelType
    },
  }
}
