/**
 * TokenCompressor Token 压缩器
 *
 * 负责：
 * - 检测消息历史是否需要压缩
 * - 执行消息压缩（支持 sliding_window、importance、summary 策略）
 * - 保留最近消息和重要消息
 * - 添加压缩摘要消息
 *
 * 复用 subtask/context/ 的压缩策略
 *
 * 需求: 4.1, 4.3, 4.5
 */

import type { Message, TextBlock } from "../session/message"
import { generateMessageId } from "../session/message"
import { AUTO_COMPACT_TOKEN_THRESHOLD } from "../config"
import {
  SimpleTokenCounter,
  evaluateMessageImportance,
  extractKeyFiles,
  extractKeyDecisions,
} from "../subtask/context"

// ============================================================================
// Types
// ============================================================================

/**
 * Token 压缩器配置
 */
export interface TokenCompressorConfig {
  /** 触发压缩的 Token 阈值 */
  threshold: number
  /** 压缩后的目标 Token 数 */
  targetTokens: number
  /** 压缩策略 */
  strategy: "sliding_window" | "importance" | "summary"
  /** 始终保留的最近消息数 */
  keepRecentCount: number
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩后的消息 */
  messages: Message[]
  /** 压缩前 Token 数 */
  beforeTokens: number
  /** 压缩后 Token 数 */
  afterTokens: number
  /** 是否发生了压缩 */
  compressed: boolean
  /** 压缩摘要（如果生成） */
  summary?: string
}

/**
 * Token 压缩器接口
 */
export interface TokenCompressor {
  /** 检查是否需要压缩 */
  needsCompression(messages: Message[]): boolean

  /** 执行压缩 */
  compress(messages: Message[]): Promise<CompressionResult>

  /** 获取当前 Token 使用量 */
  estimateTokens(messages: Message[]): number
}

// ============================================================================
// Constants
// ============================================================================

/** 默认配置 */
export const DEFAULT_TOKEN_COMPRESSOR_CONFIG: TokenCompressorConfig = {
  threshold: 80000,
  targetTokens: AUTO_COMPACT_TOKEN_THRESHOLD,
  strategy: "importance",
  keepRecentCount: 10,
}

/** 压缩摘要消息模板 */
const COMPRESSION_SUMMARY_TEMPLATE = `[系统提示] 早期对话上下文已被压缩以节省 Token。

压缩摘要：
- 移除了 {removedCount} 条早期消息
- 压缩前 Token 数：{beforeTokens}
- 压缩后 Token 数：{afterTokens}
{keyFilesSection}
{keyDecisionsSection}

如需回顾早期对话内容，请告知用户。`

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建 Token 压缩器
 *
 * @param config 压缩器配置（可选，使用默认值填充缺失字段）
 * @returns TokenCompressor 实例
 */
export function createTokenCompressor(
  config?: Partial<TokenCompressorConfig>
): TokenCompressor {
  const finalConfig: TokenCompressorConfig = {
    ...DEFAULT_TOKEN_COMPRESSOR_CONFIG,
    ...config,
  }

  const tokenCounter = new SimpleTokenCounter()

  return {
    needsCompression: (messages: Message[]) =>
      needsCompressionImpl(messages, finalConfig, tokenCounter),

    compress: (messages: Message[]) =>
      compressImpl(messages, finalConfig, tokenCounter),

    estimateTokens: (messages: Message[]) =>
      tokenCounter.countMessages(messages),
  }
}

/**
 * 检查是否需要压缩
 *
 * 需求 4.1: 当会话输入 Token 超过可配置阈值（默认 80000）时，应压缩消息历史
 */
function needsCompressionImpl(
  messages: Message[],
  config: TokenCompressorConfig,
  tokenCounter: SimpleTokenCounter
): boolean {
  const totalTokens = tokenCounter.countMessages(messages)
  return totalTokens > config.threshold
}

/**
 * 执行压缩
 *
 * 需求 4.1: 当会话输入 Token 超过可配置阈值时，压缩消息历史
 * 需求 4.3: 保留最近的消息和重要消息
 * 需求 4.5: 发生压缩时，添加一条系统消息说明早期上下文已被摘要
 */
async function compressImpl(
  messages: Message[],
  config: TokenCompressorConfig,
  tokenCounter: SimpleTokenCounter
): Promise<CompressionResult> {
  const beforeTokens = tokenCounter.countMessages(messages)

  // 如果不需要压缩，直接返回
  if (beforeTokens <= config.threshold) {
    return {
      messages,
      beforeTokens,
      afterTokens: beforeTokens,
      compressed: false,
    }
  }

  // 执行压缩策略
  const compressedMessages = applyCompressionStrategy(
    messages,
    config,
    tokenCounter
  )

  const afterTokens = tokenCounter.countMessages(compressedMessages)
  const removedCount = messages.length - compressedMessages.length

  // 生成压缩摘要
  const summary = generateCompressionSummary(
    messages,
    compressedMessages,
    beforeTokens,
    afterTokens,
    removedCount
  )

  // 创建摘要消息并插入到压缩后的消息列表开头
  const summaryMessage = createSummaryMessage(summary)
  const finalMessages = [summaryMessage, ...compressedMessages]

  const finalTokens = tokenCounter.countMessages(finalMessages)

  return {
    messages: finalMessages,
    beforeTokens,
    afterTokens: finalTokens,
    compressed: true,
    summary,
  }
}

/**
 * 应用压缩策略
 *
 * 支持三种策略：
 * - sliding_window: 滑动窗口，保留最近 N 条消息
 * - importance: 重要性排序，保留最重要的消息
 * - summary: 混合策略，结合滑动窗口和重要性
 */
function applyCompressionStrategy(
  messages: Message[],
  config: TokenCompressorConfig,
  tokenCounter: SimpleTokenCounter
): Message[] {
  const { strategy, keepRecentCount, targetTokens } = config

  // 首先确保保留最近的消息
  const recentMessages = messages.slice(-keepRecentCount)
  const olderMessages = messages.slice(0, -keepRecentCount)

  // 如果只有最近消息，直接返回
  if (olderMessages.length === 0) {
    return recentMessages
  }

  // 计算最近消息的 Token 数
  const recentTokens = tokenCounter.countMessages(recentMessages)

  // 计算可用于旧消息的 Token 预算
  const availableForOlder = Math.max(0, targetTokens - recentTokens)

  // 根据策略压缩旧消息
  let compressedOlder: Message[]

  switch (strategy) {
    case "sliding_window":
      compressedOlder = compressOlderBySlidingWindow(
        olderMessages,
        availableForOlder,
        tokenCounter
      )
      break

    case "importance":
      compressedOlder = compressOlderByImportance(
        olderMessages,
        availableForOlder,
        tokenCounter
      )
      break

    case "summary":
    default:
      // 混合策略：先按重要性筛选，再按 Token 限制截断
      compressedOlder = compressOlderByMixed(
        olderMessages,
        availableForOlder,
        tokenCounter
      )
      break
  }

  // 合并压缩后的旧消息和最近消息
  return [...compressedOlder, ...recentMessages]
}

/**
 * 滑动窗口压缩旧消息
 */
function compressOlderBySlidingWindow(
  messages: Message[],
  maxTokens: number,
  tokenCounter: SimpleTokenCounter
): Message[] {
  if (messages.length === 0) return []

  // 从最新的旧消息开始，向前保留直到达到 Token 限制
  const result: Message[] = []
  let totalTokens = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = tokenCounter.countMessage(messages[i])
    if (totalTokens + msgTokens > maxTokens) {
      break
    }
    totalTokens += msgTokens
    result.unshift(messages[i])
  }

  return result
}

/**
 * 重要性排序压缩旧消息
 *
 * 需求 4.3: 保留重要消息（包含错误、决策、工具结果的消息）
 */
function compressOlderByImportance(
  messages: Message[],
  maxTokens: number,
  tokenCounter: SimpleTokenCounter
): Message[] {
  if (messages.length === 0) return []

  // 评估每条消息的重要性
  const importances = messages.map((msg, idx) =>
    evaluateMessageImportance(msg, idx, messages.length)
  )

  // 按重要性排序（降序）
  const sortedIndices = importances
    .map((imp, idx) => ({ ...imp, originalIndex: idx }))
    .sort((a, b) => b.score - a.score)

  // 按重要性顺序选择消息，直到达到 Token 限制
  const selectedIndices = new Set<number>()
  let totalTokens = 0

  for (const item of sortedIndices) {
    const msgTokens = tokenCounter.countMessage(messages[item.originalIndex])
    if (totalTokens + msgTokens > maxTokens) {
      continue // 跳过太大的消息，尝试下一个
    }
    totalTokens += msgTokens
    selectedIndices.add(item.originalIndex)
  }

  // 按原始顺序返回选中的消息
  return messages.filter((_, idx) => selectedIndices.has(idx))
}

/**
 * 混合策略压缩旧消息
 *
 * 结合重要性和滑动窗口策略
 */
function compressOlderByMixed(
  messages: Message[],
  maxTokens: number,
  tokenCounter: SimpleTokenCounter
): Message[] {
  if (messages.length === 0) return []

  // 识别重要消息
  const importantMessages = identifyImportantMessages(messages)

  // 计算重要消息的 Token 数
  const importantTokens = tokenCounter.countMessages(importantMessages)

  // 如果重要消息已经超出预算，只保留最重要的
  if (importantTokens > maxTokens) {
    return compressOlderByImportance(importantMessages, maxTokens, tokenCounter)
  }

  // 剩余预算用于其他消息
  const remainingBudget = maxTokens - importantTokens

  // 从非重要消息中选择最近的
  const importantSet = new Set(importantMessages)
  const otherMessages = messages.filter((msg) => !importantSet.has(msg))
  const recentOthers = compressOlderBySlidingWindow(
    otherMessages,
    remainingBudget,
    tokenCounter
  )

  // 合并并按原始顺序排列
  const selectedSet = new Set([...importantMessages, ...recentOthers])
  return messages.filter((msg) => selectedSet.has(msg))
}

/**
 * 识别重要消息
 *
 * 需求 4.3: 包含错误、决策、工具结果的消息被视为重要
 */
function identifyImportantMessages(messages: Message[]): Message[] {
  return messages.filter((message) => {
    for (const block of message.content) {
      // 工具调用和结果是重要的
      if (block.type === "tool_use" || block.type === "tool_result") {
        return true
      }

      // 检查文本内容中的关键词
      if (block.type === "text") {
        const text = block.text.toLowerCase()
        // 错误相关
        if (
          text.includes("error") ||
          text.includes("错误") ||
          text.includes("失败") ||
          text.includes("failed")
        ) {
          return true
        }
        // 决策相关
        if (
          text.includes("决定") ||
          text.includes("决策") ||
          text.includes("decision") ||
          text.includes("选择") ||
          text.includes("采用")
        ) {
          return true
        }
        // 重要标记
        if (
          text.includes("important") ||
          text.includes("重要") ||
          text.includes("关键") ||
          text.includes("critical")
        ) {
          return true
        }
      }
    }
    return false
  })
}

/**
 * 生成压缩摘要
 *
 * 需求 4.5: 发生压缩时，添加一条系统消息说明早期上下文已被摘要
 */
function generateCompressionSummary(
  originalMessages: Message[],
  _compressedMessages: Message[],
  beforeTokens: number,
  afterTokens: number,
  removedCount: number
): string {
  // 从被移除的消息中提取关键信息
  const removedMessages = originalMessages.slice(
    0,
    originalMessages.length - _compressedMessages.length + 1 // +1 因为摘要消息会被添加
  )

  const keyFiles = extractKeyFiles(removedMessages)
  const keyDecisions = extractKeyDecisions(removedMessages)

  // 构建关键文件部分
  let keyFilesSection = ""
  if (keyFiles.length > 0) {
    keyFilesSection = `\n涉及的文件：${keyFiles.slice(0, 10).join(", ")}`
  }

  // 构建关键决策部分
  let keyDecisionsSection = ""
  if (keyDecisions.length > 0) {
    keyDecisionsSection = `\n关键决策：\n${keyDecisions
      .slice(0, 5)
      .map((d) => `  - ${d}`)
      .join("\n")}`
  }

  // 填充模板
  return COMPRESSION_SUMMARY_TEMPLATE.replace("{removedCount}", String(removedCount))
    .replace("{beforeTokens}", String(beforeTokens))
    .replace("{afterTokens}", String(afterTokens))
    .replace("{keyFilesSection}", keyFilesSection)
    .replace("{keyDecisionsSection}", keyDecisionsSection)
}

/**
 * 创建摘要消息
 *
 * 需求 4.5: 添加一条系统消息说明早期上下文已被摘要
 * 注意：由于 Message 类型只支持 user/assistant 角色，我们使用 user 角色
 * 并在内容中标明这是系统提示
 */
function createSummaryMessage(summary: string): Message {
  return {
    id: generateMessageId(),
    role: "user",
    content: [{ type: "text", text: summary } as TextBlock],
    timestamp: Date.now(),
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Re-export useful utilities from subtask/context
  SimpleTokenCounter,
  evaluateMessageImportance,
}
