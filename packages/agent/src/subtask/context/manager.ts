/**
 * 上下文管理器
 *
 * 统一管理子任务的上下文，包括：
 * - Token 预算分配
 * - 消息压缩
 * - 上下文摘要
 */

import type {
  TokenBudget,
  ContextSummary,
  CompressionConfig,
  ParentContext,
  InheritConfig,
  SubTaskProvider,
} from "../types"
import type { Message } from "../../session"
import { TokenBudgetManager, createTokenBudgetManager } from "./budget"
import {
  compressMessages,
  generateSimpleSummary,
  generateLLMSummary,
  DEFAULT_COMPRESSION_CONFIG,
} from "./summary"

/**
 * 上下文管理器配置
 */
export interface ContextManagerConfig {
  /** Token 预算 */
  budget?: Partial<TokenBudget>
  /** 压缩配置 */
  compression?: CompressionConfig
  /** LLM Provider（用于生成摘要） */
  provider?: SubTaskProvider
}

/**
 * 准备好的上下文
 */
export interface PreparedContext {
  /** 系统提示 */
  systemPrompt?: string
  /** 压缩后的消息 */
  messages: Message[]
  /** 上下文摘要 */
  summary?: ContextSummary
  /** Token 使用情况 */
  tokenUsage: {
    system: number
    context: number
    history: number
    total: number
  }
  /** 是否被截断 */
  truncated: boolean
}

/**
 * 上下文管理器
 */
export class ContextManager {
  private budgetManager: TokenBudgetManager
  private compressionConfig: CompressionConfig
  private provider?: SubTaskProvider

  constructor(config: ContextManagerConfig = {}) {
    this.budgetManager = createTokenBudgetManager(config.budget)
    this.compressionConfig = config.compression || DEFAULT_COMPRESSION_CONFIG
    this.provider = config.provider
  }

  /**
   * 获取预算管理器
   */
  getBudgetManager(): TokenBudgetManager {
    return this.budgetManager
  }

  /**
   * 准备子任务上下文
   */
  async prepareContext(options: {
    systemPrompt?: string
    messages?: Message[]
    generateSummary?: boolean
  }): Promise<PreparedContext> {
    const { systemPrompt, messages = [], generateSummary = false } = options

    this.budgetManager.reset()
    let truncated = false

    // 1. 分配系统提示
    let finalSystemPrompt = systemPrompt
    if (systemPrompt) {
      const { truncated: sysTruncated } = this.budgetManager.allocateSystem(systemPrompt)
      if (sysTruncated) {
        truncated = true
        const remaining = this.budgetManager.getRemaining()
        finalSystemPrompt = this.budgetManager.truncateText(systemPrompt, remaining.system + 100)
      }
    }

    // 2. 压缩消息
    let compressedMessages = compressMessages(messages, this.compressionConfig)

    // 3. 分配历史消息预算
    const { truncated: histTruncated, keptMessages } = this.budgetManager.allocateHistory(compressedMessages)
    if (histTruncated) {
      truncated = true
      compressedMessages = compressedMessages.slice(-keptMessages)
    }

    // 4. 生成摘要（如果需要）
    let summary: ContextSummary | undefined
    if (generateSummary && messages.length > 0) {
      if (this.provider) {
        summary = await generateLLMSummary(messages, this.provider)
      } else {
        summary = generateSimpleSummary(messages)
      }

      // 分配摘要的 Token
      const { truncated: ctxTruncated } = this.budgetManager.allocateContext(summary.summary)
      if (ctxTruncated) {
        truncated = true
      }
    }

    const used = this.budgetManager.getUsed()

    return {
      systemPrompt: finalSystemPrompt,
      messages: compressedMessages,
      summary,
      tokenUsage: {
        system: used.system,
        context: used.context,
        history: used.history,
        total: used.system + used.context + used.history,
      },
      truncated,
    }
  }

  /**
   * 从父会话准备 fork 上下文
   */
  async prepareForkContext(
    parentContext: ParentContext,
    inheritConfig: InheritConfig = {}
  ): Promise<PreparedContext> {
    const {
      messages: inheritMessages = true,
      context: inheritContext = true,
      tools: _inheritTools = true,
      systemPrompt: inheritSystemPrompt = true,
    } = inheritConfig

    this.budgetManager.reset()
    let truncated = false

    // 1. 处理系统提示
    let systemPrompt: string | undefined
    if (inheritSystemPrompt && parentContext.systemPrompt) {
      systemPrompt = parentContext.systemPrompt
      const { truncated: sysTruncated } = this.budgetManager.allocateSystem(systemPrompt)
      if (sysTruncated) {
        truncated = true
        const remaining = this.budgetManager.getRemaining()
        systemPrompt = this.budgetManager.truncateText(systemPrompt, remaining.system + 100)
      }
    }

    // 2. 处理上下文摘要
    let summary: ContextSummary | undefined
    if (inheritContext && parentContext.contextSummary) {
      summary = parentContext.contextSummary
      const { truncated: ctxTruncated } = this.budgetManager.allocateContext(summary.summary)
      if (ctxTruncated) {
        truncated = true
      }
    }

    // 3. 处理消息历史
    let messages: Message[] = []
    if (inheritMessages) {
      const parentMessages = parentContext.messages

      if (typeof inheritMessages === "number") {
        // 只继承最近 N 条
        messages = parentMessages.slice(-inheritMessages)
      } else {
        // 继承全部，但需要压缩
        messages = compressMessages(parentMessages, this.compressionConfig)
      }

      // 分配历史消息预算
      const { truncated: histTruncated, keptMessages } = this.budgetManager.allocateHistory(messages)
      if (histTruncated) {
        truncated = true
        messages = messages.slice(-keptMessages)
      }
    }

    const used = this.budgetManager.getUsed()

    return {
      systemPrompt,
      messages,
      summary,
      tokenUsage: {
        system: used.system,
        context: used.context,
        history: used.history,
        total: used.system + used.context + used.history,
      },
      truncated,
    }
  }

  /**
   * 检查是否需要压缩
   */
  needsCompression(messages: Message[]): boolean {
    const tokens = this.budgetManager.countMessagesTokens(messages)
    const budget = this.budgetManager.getBudget()
    return tokens > budget.history
  }

  /**
   * 估算消息的 Token 数量
   */
  estimateTokens(messages: Message[]): number {
    return this.budgetManager.countMessagesTokens(messages)
  }

  /**
   * 获取剩余预算
   */
  getRemainingBudget(): { system: number; context: number; history: number; total: number } {
    return this.budgetManager.getRemaining()
  }
}

/**
 * 创建上下文管理器
 */
export function createContextManager(config?: ContextManagerConfig): ContextManager {
  return new ContextManager(config)
}
