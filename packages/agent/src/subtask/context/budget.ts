/**
 * Token 预算管理
 *
 * 管理子任务的 Token 预算分配，防止上下文过爆
 */

import type { TokenBudget } from "../types"
import { DEFAULT_TOKEN_BUDGET } from "../types"
import type { Message } from "../../session/message"

/**
 * Token 计数器接口
 */
export interface TokenCounter {
  /** 计算文本的 Token 数量 */
  count(text: string): number
  /** 计算消息的 Token 数量 */
  countMessage(message: Message): number
  /** 计算消息列表的 Token 数量 */
  countMessages(messages: Message[]): number
}

/**
 * 简单的 Token 计数器（基于字符估算）
 *
 * 使用 4 字符 ≈ 1 Token 的近似算法
 * 对于中文，使用 1.5 字符 ≈ 1 Token
 */
export class SimpleTokenCounter implements TokenCounter {
  private readonly charsPerToken: number

  constructor(charsPerToken = 4) {
    this.charsPerToken = charsPerToken
  }

  count(text: string): number {
    if (!text) return 0

    // 检测中文字符比例
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const totalChars = text.length

    if (chineseChars > totalChars * 0.3) {
      // 中文为主，使用 1.5 字符/Token
      return Math.ceil(totalChars / 1.5)
    }

    return Math.ceil(totalChars / this.charsPerToken)
  }

  countMessage(message: Message): number {
    let total = 0

    // 角色标记
    total += 4

    // 内容
    for (const block of message.content) {
      if (block.type === "text") {
        total += this.count(block.text)
      } else if (block.type === "tool_use") {
        total += this.count(block.name)
        total += this.count(JSON.stringify(block.input))
      } else if (block.type === "tool_result") {
        if (typeof block.content === "string") {
          total += this.count(block.content)
        } else {
          // ContentBlock[] 情况，递归计算
          for (const subBlock of block.content) {
            if (subBlock.type === "text") {
              total += this.count(subBlock.text)
            }
          }
        }
      }
    }

    return total
  }

  countMessages(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + this.countMessage(msg), 0)
  }
}

/**
 * 默认 Token 计数器实例
 */
export const defaultTokenCounter = new SimpleTokenCounter()

/**
 * Token 预算管理器
 */
export class TokenBudgetManager {
  private budget: TokenBudget
  private counter: TokenCounter
  private used: {
    system: number
    context: number
    history: number
  }

  constructor(budget?: Partial<TokenBudget>, counter?: TokenCounter) {
    this.budget = { ...DEFAULT_TOKEN_BUDGET, ...budget }
    this.counter = counter || defaultTokenCounter
    this.used = {
      system: 0,
      context: 0,
      history: 0,
    }
  }

  /**
   * 获取当前预算配置
   */
  getBudget(): TokenBudget {
    return { ...this.budget }
  }

  /**
   * 获取已使用的 Token
   */
  getUsed(): { system: number; context: number; history: number } {
    return { ...this.used }
  }

  /**
   * 获取剩余可用 Token
   */
  getRemaining(): { system: number; context: number; history: number; total: number } {
    const totalUsed = this.used.system + this.used.context + this.used.history
    return {
      system: Math.max(0, this.budget.system - this.used.system),
      context: Math.max(0, this.budget.context - this.used.context),
      history: Math.max(0, this.budget.history - this.used.history),
      total: Math.max(0, this.budget.total - this.budget.response - totalUsed),
    }
  }

  /**
   * 检查是否超出预算
   */
  isOverBudget(): boolean {
    const totalUsed = this.used.system + this.used.context + this.used.history
    return totalUsed > this.budget.total - this.budget.response
  }

  /**
   * 分配系统提示 Token
   */
  allocateSystem(text: string): { tokens: number; truncated: boolean } {
    const tokens = this.counter.count(text)
    const available = this.budget.system - this.used.system

    if (tokens <= available) {
      this.used.system += tokens
      return { tokens, truncated: false }
    }

    this.used.system = this.budget.system
    return { tokens: available, truncated: true }
  }

  /**
   * 分配上下文 Token
   */
  allocateContext(text: string): { tokens: number; truncated: boolean } {
    const tokens = this.counter.count(text)
    const available = this.budget.context - this.used.context

    if (tokens <= available) {
      this.used.context += tokens
      return { tokens, truncated: false }
    }

    this.used.context = this.budget.context
    return { tokens: available, truncated: true }
  }

  /**
   * 分配历史消息 Token
   */
  allocateHistory(messages: Message[]): {
    tokens: number
    truncated: boolean
    keptMessages: number
  } {
    const available = this.budget.history - this.used.history
    let totalTokens = 0
    let keptMessages = 0

    // 从最新消息开始计算
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = this.counter.countMessage(messages[i])
      if (totalTokens + msgTokens > available) {
        break
      }
      totalTokens += msgTokens
      keptMessages++
    }

    this.used.history += totalTokens

    return {
      tokens: totalTokens,
      truncated: keptMessages < messages.length,
      keptMessages,
    }
  }

  /**
   * 计算文本的 Token 数量
   */
  countTokens(text: string): number {
    return this.counter.count(text)
  }

  /**
   * 计算消息的 Token 数量
   */
  countMessageTokens(message: Message): number {
    return this.counter.countMessage(message)
  }

  /**
   * 计算消息列表的 Token 数量
   */
  countMessagesTokens(messages: Message[]): number {
    return this.counter.countMessages(messages)
  }

  /**
   * 重置使用统计
   */
  reset(): void {
    this.used = {
      system: 0,
      context: 0,
      history: 0,
    }
  }

  /**
   * 截断文本到指定 Token 数量
   */
  truncateText(text: string, maxTokens: number): string {
    const tokens = this.counter.count(text)
    if (tokens <= maxTokens) {
      return text
    }

    // 估算需要保留的字符数
    const ratio = maxTokens / tokens
    const targetLength = Math.floor(text.length * ratio * 0.95) // 留 5% 余量

    return text.slice(0, targetLength) + "..."
  }

  /**
   * 截断消息列表到指定 Token 数量（保留最新消息）
   */
  truncateMessages(messages: Message[], maxTokens: number): Message[] {
    let totalTokens = 0
    const result: Message[] = []

    // 从最新消息开始
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = this.counter.countMessage(messages[i])
      if (totalTokens + msgTokens > maxTokens) {
        break
      }
      totalTokens += msgTokens
      result.unshift(messages[i])
    }

    return result
  }
}

/**
 * 创建 Token 预算管理器
 */
export function createTokenBudgetManager(
  budget?: Partial<TokenBudget>,
  counter?: TokenCounter
): TokenBudgetManager {
  return new TokenBudgetManager(budget, counter)
}
