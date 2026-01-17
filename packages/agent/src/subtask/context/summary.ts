/**
 * 上下文摘要生成
 *
 * 提供消息压缩和上下文摘要功能
 */

import type {
  ContextSummary,
  CompressionConfig,
  SubTaskProvider,
} from "../types"
import type { Message } from "../../session"
import { defaultTokenCounter } from "./budget"

/**
 * 默认压缩配置
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  strategy: "sliding_window",
  windowSize: 20,
  keepImportant: 5,
  targetTokens: 30000,
}

/**
 * 消息重要性评分
 */
export interface MessageImportance {
  /** 消息索引 */
  index: number
  /** 重要性分数 (0-100) */
  score: number
  /** 原因 */
  reason: string
}

/**
 * 评估消息重要性
 */
export function evaluateMessageImportance(
  message: Message,
  index: number,
  totalMessages: number
): MessageImportance {
  let score = 50 // 基础分数
  const reasons: string[] = []

  // 1. 位置因素：最近的消息更重要
  const recencyBonus = Math.floor((index / totalMessages) * 20)
  score += recencyBonus
  if (recencyBonus > 10) {
    reasons.push("recent")
  }

  // 2. 角色因素：用户消息通常包含关键需求
  if (message.role === "user") {
    score += 10
    reasons.push("user_input")
  }

  // 3. 内容因素
  for (const block of message.content) {
    if (block.type === "tool_use") {
      // 工具调用表示重要操作
      score += 15
      reasons.push("tool_use")
      break
    }
    if (block.type === "tool_result") {
      // 工具结果包含重要信息
      score += 10
      reasons.push("tool_result")
      break
    }
    if (block.type === "text") {
      // 检查关键词
      const text = block.text.toLowerCase()
      if (text.includes("error") || text.includes("错误")) {
        score += 15
        reasons.push("error")
      }
      if (text.includes("important") || text.includes("重要")) {
        score += 10
        reasons.push("important_keyword")
      }
      if (text.includes("decision") || text.includes("决定") || text.includes("决策")) {
        score += 10
        reasons.push("decision")
      }
    }
  }

  // 限制分数范围
  score = Math.min(100, Math.max(0, score))

  return {
    index,
    score,
    reason: reasons.join(", ") || "normal",
  }
}

/**
 * 滑动窗口压缩
 *
 * 保留最近 N 条消息
 */
export function compressBySlidingWindow(
  messages: Message[],
  windowSize: number
): Message[] {
  if (messages.length <= windowSize) {
    return messages
  }
  return messages.slice(-windowSize)
}

/**
 * 重要性排序压缩
 *
 * 保留最重要的 N 条消息
 */
export function compressByImportance(
  messages: Message[],
  keepCount: number
): Message[] {
  if (messages.length <= keepCount) {
    return messages
  }

  // 评估每条消息的重要性
  const importances = messages.map((msg, idx) =>
    evaluateMessageImportance(msg, idx, messages.length)
  )

  // 按重要性排序
  const sorted = [...importances].sort((a, b) => b.score - a.score)

  // 取前 N 条，然后按原始顺序排列
  const keepIndices = new Set(sorted.slice(0, keepCount).map((i) => i.index))
  return messages.filter((_, idx) => keepIndices.has(idx))
}

/**
 * 混合压缩策略
 *
 * 结合滑动窗口和重要性排序
 */
export function compressMessages(
  messages: Message[],
  config: CompressionConfig = DEFAULT_COMPRESSION_CONFIG
): Message[] {
  const { strategy, windowSize = 20, keepImportant = 5, targetTokens = 30000 } = config

  switch (strategy) {
    case "sliding_window":
      return compressBySlidingWindow(messages, windowSize)

    case "importance":
      return compressByImportance(messages, keepImportant)

    case "summary":
      // 摘要策略需要 LLM，这里降级为混合策略
      // 先按重要性保留一部分，再用滑动窗口
      const important = compressByImportance(messages, keepImportant)
      const recent = compressBySlidingWindow(messages, windowSize)

      // 合并去重，保持顺序
      const indices = new Set<number>()
      const result: Message[] = []

      for (const msg of messages) {
        const idx = messages.indexOf(msg)
        if (important.includes(msg) || recent.includes(msg)) {
          if (!indices.has(idx)) {
            indices.add(idx)
            result.push(msg)
          }
        }
      }

      // 如果还是太多，按 Token 限制截断
      let totalTokens = 0
      const finalResult: Message[] = []
      for (let i = result.length - 1; i >= 0; i--) {
        const tokens = defaultTokenCounter.countMessage(result[i])
        if (totalTokens + tokens > targetTokens) {
          break
        }
        totalTokens += tokens
        finalResult.unshift(result[i])
      }

      return finalResult

    default:
      return compressBySlidingWindow(messages, windowSize)
  }
}

/**
 * 提取消息中的关键文件
 */
export function extractKeyFiles(messages: Message[]): string[] {
  const files = new Set<string>()

  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === "tool_use") {
        // 从工具调用中提取文件路径
        const input = block.input as Record<string, unknown>
        if (typeof input.path === "string") {
          files.add(input.path)
        }
        if (typeof input.file === "string") {
          files.add(input.file)
        }
        if (Array.isArray(input.paths)) {
          for (const p of input.paths) {
            if (typeof p === "string") {
              files.add(p)
            }
          }
        }
      }
      if (block.type === "text") {
        // 简单的文件路径匹配
        const pathMatches = block.text.match(/[a-zA-Z0-9_\-./]+\.(ts|js|tsx|jsx|py|go|rs|java|md|json|yaml|yml)/g)
        if (pathMatches) {
          for (const match of pathMatches) {
            if (match.includes("/") || match.includes("\\")) {
              files.add(match)
            }
          }
        }
      }
    }
  }

  return Array.from(files).slice(0, 20) // 限制数量
}

/**
 * 提取关键决策
 */
export function extractKeyDecisions(messages: Message[]): string[] {
  const decisions: string[] = []
  const decisionKeywords = [
    "决定", "决策", "选择", "采用", "使用",
    "decide", "decision", "choose", "adopt", "use",
    "will", "should", "must",
  ]

  for (const message of messages) {
    if (message.role !== "assistant") continue

    for (const block of message.content) {
      if (block.type !== "text") continue

      const lines = block.text.split("\n")
      for (const line of lines) {
        const lowerLine = line.toLowerCase()
        if (decisionKeywords.some((kw) => lowerLine.includes(kw))) {
          // 提取包含决策关键词的句子
          const trimmed = line.trim()
          if (trimmed.length > 10 && trimmed.length < 200) {
            decisions.push(trimmed)
          }
        }
      }
    }
  }

  return decisions.slice(0, 10) // 限制数量
}

/**
 * 生成上下文摘要（简单版本，不需要 LLM）
 */
export function generateSimpleSummary(messages: Message[]): ContextSummary {
  const keyFiles = extractKeyFiles(messages)
  const keyDecisions = extractKeyDecisions(messages)

  // 构建摘要文本
  const parts: string[] = []

  if (keyFiles.length > 0) {
    parts.push(`涉及文件: ${keyFiles.join(", ")}`)
  }

  if (keyDecisions.length > 0) {
    parts.push(`关键决策:\n${keyDecisions.map((d) => `- ${d}`).join("\n")}`)
  }

  // 提取最后几条消息的要点
  const recentMessages = messages.slice(-5)
  const recentSummary: string[] = []
  for (const msg of recentMessages) {
    for (const block of msg.content) {
      if (block.type === "text") {
        const text = block.text.trim()
        if (text.length > 0 && text.length < 500) {
          recentSummary.push(`[${msg.role}] ${text.slice(0, 200)}...`)
        }
      }
    }
  }

  if (recentSummary.length > 0) {
    parts.push(`最近对话:\n${recentSummary.join("\n")}`)
  }

  const summary = parts.join("\n\n")

  return {
    summary,
    keyFiles,
    keyDecisions,
    tokenCount: defaultTokenCounter.count(summary),
  }
}

/**
 * 使用 LLM 生成上下文摘要
 */
export async function generateLLMSummary(
  messages: Message[],
  provider: SubTaskProvider,
  maxTokens = 2000
): Promise<ContextSummary> {
  // 先生成简单摘要作为基础
  const simpleSummary = generateSimpleSummary(messages)

  // 构建消息文本
  const messageTexts: string[] = []
  for (const msg of messages) {
    const parts: string[] = []
    for (const block of msg.content) {
      if (block.type === "text") {
        parts.push(block.text)
      } else if (block.type === "tool_use") {
        parts.push(`[Tool: ${block.name}]`)
      } else if (block.type === "tool_result") {
        parts.push(`[Result: ${block.content.slice(0, 200)}...]`)
      }
    }
    if (parts.length > 0) {
      messageTexts.push(`${msg.role}: ${parts.join(" ")}`)
    }
  }

  const conversationText = messageTexts.join("\n\n")

  try {
    const result = await provider.chat({
      messages: [
        {
          role: "system",
          content: `你是一个对话摘要助手。请将以下对话总结为简洁的摘要，包括：
1. 主要讨论的问题或任务
2. 已完成的工作
3. 关键决策和结论
4. 待处理的事项（如果有）

保持摘要简洁，不超过 ${maxTokens} 个 Token。`,
        },
        {
          role: "user",
          content: conversationText,
        },
      ],
      maxTokens,
    })

    return {
      summary: result.content,
      keyFiles: simpleSummary.keyFiles,
      keyDecisions: simpleSummary.keyDecisions,
      tokenCount: defaultTokenCounter.count(result.content),
    }
  } catch {
    // LLM 调用失败，返回简单摘要
    return simpleSummary
  }
}
