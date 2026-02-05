/**
 * Token 压缩器 (Token Compressor)
 *
 * 负责：
 * - 压缩历史消息以控制上下文长度
 * - 使用规则提取关键信息生成摘要（不调用 LLM）
 * - 保留最近消息和工具调用完整性
 *
 * 需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import type {
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
} from "../session/message"
import {
  generateMessageId,
  getMessageText,
  getToolCalls,
} from "../session/message"
import { estimateTokens, countMessagesTokens } from "./token"

// ============================================================================
// Types
// ============================================================================

/**
 * 压缩配置
 */
export interface CompressionConfig {
  /** 保留最近消息数（默认 10） */
  keepRecentMessages: number
  /** 压缩触发阈值（占最大上下文比例，默认 0.8） */
  compressionThreshold: number
  /** 摘要最大 Token 数（默认 500） */
  summaryMaxTokens: number
  /** 最大上下文 Token 数（默认 180000） */
  maxContextTokens: number
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩后的消息列表 */
  messages: Message[]
  /** 压缩的消息数 */
  compressedCount: number
  /** 生成的摘要（如果有） */
  summary?: string
  /** 压缩前 Token 数 */
  beforeTokens: number
  /** 压缩后 Token 数 */
  afterTokens: number
}

/**
 * 提取的关键信息
 */
interface ExtractedInfo {
  /** 工具调用列表 */
  toolCalls: Array<{
    name: string
    inputSummary: string
    outputSummary: string
  }>
  /** 文件路径列表 */
  filePaths: string[]
  /** 关键决策点 */
  decisions: string[]
}

/**
 * Token 压缩器接口
 */
export interface TokenCompressor {
  /** 压缩消息历史 */
  compress(messages: Message[]): CompressionResult

  /** 生成消息摘要（使用规则，不调用 LLM） */
  summarize(messages: Message[]): string

  /** 检查是否需要压缩 */
  needsCompression(messages: Message[]): boolean

  /** 获取配置 */
  getConfig(): CompressionConfig
}

// ============================================================================
// Constants
// ============================================================================

/** 默认压缩配置 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  keepRecentMessages: 10,
  compressionThreshold: 0.8,
  summaryMaxTokens: 500,
  maxContextTokens: 180000,
}

/** 文件路径正则 - 匹配常见文件扩展名 */
const FILE_PATH_REGEX = /(?:^|[\s"'`,])([a-zA-Z]:[\\\/]|[.\/])?[\w\-./\\]+\.(ts|js|tsx|jsx|py|md|json|yaml|yml|toml|css|html|vue|svelte|go|rs|java|c|cpp|h|hpp|rb|php|sh|bash|zsh|sql|graphql|proto)(?=[\s"'`,;]|$)/gi

/** 决策关键词 */
const DECISION_KEYWORDS = [
  "决定", "选择", "采用", "使用", "实现", "创建", "修改", "删除",
  "decide", "choose", "use", "implement", "create", "modify", "delete",
  "will", "should", "must", "need to", "going to",
]

// ============================================================================
// Implementation
// ============================================================================

/**
 * 从文本中提取文件路径
 */
function extractFilePaths(text: string): string[] {
  const matches = text.match(FILE_PATH_REGEX) || []
  return [...new Set(matches.map(m => m.trim()))]
}

/**
 * 从文本中提取决策点
 */
function extractDecisions(text: string): string[] {
  const sentences = text.split(/[.。!！?？\n]/).filter(s => s.trim())
  const decisions: string[] = []

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    if (DECISION_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) {
      const trimmed = sentence.trim()
      if (trimmed.length > 10 && trimmed.length < 200) {
        decisions.push(trimmed)
      }
    }
  }

  return decisions.slice(0, 5) // 最多保留 5 个决策点
}

/**
 * 从工具调用中提取摘要
 */
function summarizeToolInput(input: unknown): string {
  if (typeof input === "string") {
    return input.length > 100 ? input.slice(0, 100) + "..." : input
  }
  if (typeof input === "object" && input !== null) {
    const keys = Object.keys(input)
    if (keys.length === 0) return "{}"
    if (keys.length <= 3) {
      return JSON.stringify(input).slice(0, 100)
    }
    return `{${keys.slice(0, 3).join(", ")}...}`
  }
  return String(input)
}

/**
 * 从工具结果中提取摘要
 */
function summarizeToolOutput(content: string | ContentBlock[]): string {
  if (typeof content === "string") {
    return content.length > 100 ? content.slice(0, 100) + "..." : content
  }
  // 多模态内容
  const textBlocks = content.filter((b): b is TextBlock => b.type === "text")
  const text = textBlocks.map(b => b.text).join("")
  return text.length > 100 ? text.slice(0, 100) + "..." : text
}

/**
 * 从消息列表中提取关键信息
 */
function extractKeyInfo(messages: Message[]): ExtractedInfo {
  const toolCalls: ExtractedInfo["toolCalls"] = []
  const filePaths: string[] = []
  const decisions: string[] = []

  // 建立工具调用 ID 到结果的映射
  const toolResults = new Map<string, ToolResultBlock>()
  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === "tool_result") {
        toolResults.set(block.tool_use_id, block)
      }
    }
  }

  for (const msg of messages) {
    // 提取文本中的文件路径和决策
    const text = getMessageText(msg)
    filePaths.push(...extractFilePaths(text))
    decisions.push(...extractDecisions(text))

    // 提取工具调用
    const calls = getToolCalls(msg)
    for (const call of calls) {
      const result = toolResults.get(call.id)
      toolCalls.push({
        name: call.name,
        inputSummary: summarizeToolInput(call.input),
        outputSummary: result ? summarizeToolOutput(result.content) : "[无结果]",
      })
    }
  }

  return {
    toolCalls: toolCalls.slice(-10), // 最多保留最近 10 个工具调用
    filePaths: [...new Set(filePaths)].slice(-20), // 最多保留 20 个文件路径
    decisions: [...new Set(decisions)].slice(-5), // 最多保留 5 个决策
  }
}

/**
 * 根据提取的信息生成摘要
 */
function generateSummary(info: ExtractedInfo, maxTokens: number): string {
  const parts: string[] = []

  // 工具调用摘要
  if (info.toolCalls.length > 0) {
    parts.push("## 工具调用")
    for (const call of info.toolCalls) {
      parts.push(`- ${call.name}: ${call.inputSummary} → ${call.outputSummary}`)
    }
  }

  // 文件路径
  if (info.filePaths.length > 0) {
    parts.push("\n## 涉及文件")
    parts.push(info.filePaths.join(", "))
  }

  // 决策点
  if (info.decisions.length > 0) {
    parts.push("\n## 关键决策")
    for (const decision of info.decisions) {
      parts.push(`- ${decision}`)
    }
  }

  let summary = parts.join("\n")

  // 如果摘要太长，截断
  const tokens = estimateTokens(summary)
  if (tokens > maxTokens) {
    // 简单截断
    const ratio = maxTokens / tokens
    const targetLength = Math.floor(summary.length * ratio * 0.9)
    summary = summary.slice(0, targetLength) + "\n...[摘要已截断]"
  }

  return summary
}

/**
 * 创建摘要消息
 */
function createSummaryMessage(summary: string): Message {
  return {
    id: generateMessageId(),
    role: "assistant",
    content: [{
      type: "text",
      text: `[会话历史摘要]\n${summary}`,
    }],
    timestamp: Date.now(),
  }
}

/**
 * 创建 Token 压缩器
 */
export function createCompressor(
  config?: Partial<CompressionConfig>
): TokenCompressor {
  const finalConfig: CompressionConfig = {
    ...DEFAULT_COMPRESSION_CONFIG,
    ...config,
  }

  return {
    getConfig(): CompressionConfig {
      return { ...finalConfig }
    },

    needsCompression(messages: Message[]): boolean {
      const totalTokens = countMessagesTokens(messages)
      const threshold = finalConfig.maxContextTokens * finalConfig.compressionThreshold
      return totalTokens > threshold
    },

    summarize(messages: Message[]): string {
      const info = extractKeyInfo(messages)
      return generateSummary(info, finalConfig.summaryMaxTokens)
    },

    compress(messages: Message[]): CompressionResult {
      const beforeTokens = countMessagesTokens(messages)

      // 不需要压缩
      if (!this.needsCompression(messages)) {
        return {
          messages,
          compressedCount: 0,
          beforeTokens,
          afterTokens: beforeTokens,
        }
      }

      // 保留最近 N 条消息
      const keepCount = finalConfig.keepRecentMessages
      const recentMessages = messages.slice(-keepCount)
      const oldMessages = messages.slice(0, -keepCount)

      // 如果没有旧消息需要压缩
      if (oldMessages.length === 0) {
        // 回退：直接删除最旧的消息
        const targetTokens = finalConfig.maxContextTokens * 0.7
        let currentTokens = beforeTokens
        let removeCount = 0

        while (currentTokens > targetTokens && removeCount < messages.length - 1) {
          currentTokens -= estimateTokens(getMessageText(messages[removeCount]))
          removeCount++
        }

        const remainingMessages = messages.slice(removeCount)
        const afterTokens = countMessagesTokens(remainingMessages)

        return {
          messages: remainingMessages,
          compressedCount: removeCount,
          beforeTokens,
          afterTokens,
        }
      }

      // 生成旧消息的摘要
      const summary = this.summarize(oldMessages)
      const summaryMessage = createSummaryMessage(summary)

      // 组合：摘要 + 最近消息
      const compressedMessages = [summaryMessage, ...recentMessages]
      const afterTokens = countMessagesTokens(compressedMessages)

      // 如果压缩后仍然超过阈值，继续删除
      if (afterTokens > finalConfig.maxContextTokens * finalConfig.compressionThreshold) {
        // 回退：删除更多旧消息
        const targetTokens = finalConfig.maxContextTokens * 0.7
        let currentMessages = compressedMessages
        let currentTokens = afterTokens

        while (currentTokens > targetTokens && currentMessages.length > 2) {
          // 删除摘要后的第一条消息（保留摘要）
          currentMessages = [currentMessages[0], ...currentMessages.slice(2)]
          currentTokens = countMessagesTokens(currentMessages)
        }

        return {
          messages: currentMessages,
          compressedCount: messages.length - currentMessages.length + 1,
          summary,
          beforeTokens,
          afterTokens: currentTokens,
        }
      }

      return {
        messages: compressedMessages,
        compressedCount: oldMessages.length,
        summary,
        beforeTokens,
        afterTokens,
      }
    },
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  extractFilePaths as _extractFilePaths,
  extractDecisions as _extractDecisions,
  extractKeyInfo as _extractKeyInfo,
  generateSummary as _generateSummary,
}
