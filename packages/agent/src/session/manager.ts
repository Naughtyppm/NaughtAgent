/**
 * SessionManager 会话管理器
 *
 * 管理多个会话的创建、获取、删除
 */

import type { Message, ContentBlock } from "./message"
import { generateMessageId } from "./message"
import type {
  Session,
  SessionID,
  SessionStatus,
  CreateSessionOptions,
  TokenUsage,
} from "./session"
import { createSession } from "./session"

/**
 * 会话管理器
 */
export class SessionManager {
  private sessions = new Map<SessionID, Session>()

  /**
   * 创建新会话
   */
  create(options: CreateSessionOptions = {}): Session {
    const session = createSession(options)

    if (this.sessions.has(session.id)) {
      throw new Error(`Session already exists: ${session.id}`)
    }

    this.sessions.set(session.id, session)
    return session
  }

  /**
   * 获取会话
   */
  get(id: SessionID): Session | undefined {
    return this.sessions.get(id)
  }

  /**
   * 获取会话（必须存在）
   */
  getOrThrow(id: SessionID): Session {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }
    return session
  }

  /**
   * 列出所有会话
   */
  list(): Session[] {
    return Array.from(this.sessions.values())
  }

  /**
   * 列出所有会话 ID
   */
  listIds(): SessionID[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * 删除会话
   */
  delete(id: SessionID): boolean {
    return this.sessions.delete(id)
  }

  /**
   * 清空所有会话
   */
  clear(): void {
    this.sessions.clear()
  }

  /**
   * 会话数量
   */
  get size(): number {
    return this.sessions.size
  }

  /**
   * 添加消息
   */
  addMessage(
    id: SessionID,
    role: Message["role"],
    content: ContentBlock[]
  ): Message {
    const session = this.getOrThrow(id)

    const message: Message = {
      id: generateMessageId(),
      role,
      content,
      timestamp: Date.now(),
    }

    session.messages.push(message)
    session.updatedAt = message.timestamp

    return message
  }

  /**
   * 添加用户消息
   */
  addUserMessage(id: SessionID, text: string): Message {
    return this.addMessage(id, "user", [{ type: "text", text }])
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(id: SessionID, content: ContentBlock[]): Message {
    return this.addMessage(id, "assistant", content)
  }

  /**
   * 更新状态
   */
  updateStatus(id: SessionID, status: SessionStatus): void {
    const session = this.getOrThrow(id)
    session.status = status
    session.updatedAt = Date.now()
  }

  /**
   * 更新 Token 使用统计
   */
  updateUsage(id: SessionID, usage: Partial<TokenUsage>): void {
    const session = this.getOrThrow(id)

    if (usage.inputTokens !== undefined) {
      session.usage.inputTokens += usage.inputTokens
    }
    if (usage.outputTokens !== undefined) {
      session.usage.outputTokens += usage.outputTokens
    }

    session.updatedAt = Date.now()
  }

  /**
   * 获取当前活跃会话（最近更新的 idle 或 running 会话）
   */
  getActive(): Session | undefined {
    let active: Session | undefined

    for (const session of this.sessions.values()) {
      if (session.status === "idle" || session.status === "running") {
        if (!active || session.updatedAt > active.updatedAt) {
          active = session
        }
      }
    }

    return active
  }

  /**
   * 注册会话（用于从存储加载）
   */
  register(session: Session): void {
    if (this.sessions.has(session.id)) {
      throw new Error(`Session already exists: ${session.id}`)
    }
    this.sessions.set(session.id, session)
  }

  /**
   * 从指定点创建会话分支（同步方法）
   * 
   * @param sessionId 父会话 ID
   * @param fromIndex 分支点（消息索引）
   * @param options 可选配置（如标签）
   * @returns 新的分支会话
   * 
   * 注意：SessionManager 是内存管理器，所有操作都是同步的
   * 持久化由独立的 Storage 层处理（异步）
   */
  branch(
    sessionId: SessionID,
    fromIndex: number,
    options?: { tags?: string[] }
  ): Session {
    // 获取父会话
    const parent = this.getOrThrow(sessionId)
    
    // 验证分支点索引
    if (fromIndex < 0 || fromIndex >= parent.messages.length) {
      throw new Error(
        `Invalid branch point: ${fromIndex}. Must be between 0 and ${parent.messages.length - 1}`
      )
    }
    
    // 创建分支会话，复制消息历史到分支点
    const branched: Session = {
      ...createSession({
        cwd: parent.cwd,
        agentType: parent.agentType
      }),
      // 复制消息历史（包含分支点的消息）
      messages: parent.messages.slice(0, fromIndex + 1),
      // 继承和合并标签
      tags: options?.tags || [...(parent.tags || []), 'branch'],
      // 添加分支关系追踪
      parent_session_id: sessionId,
      branch_point: fromIndex
    }
    
    // 注册到内存
    this.sessions.set(branched.id, branched)
    
    return branched
  }

  /**
   * 按标签搜索会话（同步方法）
   * 
   * @param tags 要搜索的标签列表
   * @returns 包含所有指定标签的会话列表
   */
  findByTags(tags: string[]): Session[] {
    const all = this.list()
    return all.filter(session => 
      tags.every(tag => session.tags?.includes(tag))
    )
  }

  /**
   * 更新会话成本（同步方法）
   * 
   * @param sessionId 会话 ID
   * @param costUsd 本次操作的成本（美元）
   */
  updateCost(sessionId: SessionID, costUsd: number): void {
    const session = this.getOrThrow(sessionId)
    session.total_cost_usd = (session.total_cost_usd || 0) + costUsd
    session.updatedAt = Date.now()
  }

  /**
   * 添加标签到会话（同步方法）
   * 
   * @param sessionId 会话 ID
   * @param tags 要添加的标签（单个或多个）
   */
  addTags(sessionId: SessionID, ...tags: string[]): void {
    const session = this.getOrThrow(sessionId)
    
    // 确保 tags 数组存在
    if (!session.tags) {
      session.tags = []
    }
    
    // 添加不重复的标签
    for (const tag of tags) {
      if (!session.tags.includes(tag)) {
        session.tags.push(tag)
      }
    }
    
    session.updatedAt = Date.now()
  }

  /**
   * 从会话中移除标签（同步方法）
   * 
   * @param sessionId 会话 ID
   * @param tags 要移除的标签（单个或多个）
   */
  removeTags(sessionId: SessionID, ...tags: string[]): void {
    const session = this.getOrThrow(sessionId)
    
    if (!session.tags) {
      return
    }
    
    // 移除指定的标签
    session.tags = session.tags.filter(tag => !tags.includes(tag))
    
    session.updatedAt = Date.now()
  }

  /**
   * 获取所有使用过的标签（同步方法）
   * 
   * @returns 所有标签的去重列表
   */
  getAllTags(): string[] {
    const tagSet = new Set<string>()
    
    for (const session of this.sessions.values()) {
      if (session.tags) {
        for (const tag of session.tags) {
          tagSet.add(tag)
        }
      }
    }
    
    return Array.from(tagSet).sort()
  }

  /**
   * 获取会话的成本统计（同步方法）
   * 
   * @param sessionId 会话 ID
   * @returns 成本统计信息
   */
  getCostStats(sessionId: SessionID): {
    total_cost_usd: number
    num_turns: number
    cost_per_turn: number
    input_tokens: number
    output_tokens: number
    total_tokens: number
  } {
    const session = this.getOrThrow(sessionId)
    
    const totalCost = session.total_cost_usd || 0
    const numTurns = session.num_turns || Math.floor(session.messages.length / 2)
    const costPerTurn = numTurns > 0 ? totalCost / numTurns : 0
    
    return {
      total_cost_usd: totalCost,
      num_turns: numTurns,
      cost_per_turn: costPerTurn,
      input_tokens: session.usage.inputTokens,
      output_tokens: session.usage.outputTokens,
      total_tokens: session.usage.inputTokens + session.usage.outputTokens
    }
  }

  /**
   * 获取所有会话的总成本统计（同步方法）
   * 
   * @returns 总成本统计信息
   */
  getTotalCostStats(): {
    total_sessions: number
    total_cost_usd: number
    total_turns: number
    avg_cost_per_session: number
    avg_cost_per_turn: number
    total_input_tokens: number
    total_output_tokens: number
    total_tokens: number
  } {
    const sessions = this.list()
    
    let totalCost = 0
    let totalTurns = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0
    
    for (const session of sessions) {
      totalCost += session.total_cost_usd || 0
      totalTurns += session.num_turns || Math.floor(session.messages.length / 2)
      totalInputTokens += session.usage.inputTokens
      totalOutputTokens += session.usage.outputTokens
    }
    
    const totalSessions = sessions.length
    const avgCostPerSession = totalSessions > 0 ? totalCost / totalSessions : 0
    const avgCostPerTurn = totalTurns > 0 ? totalCost / totalTurns : 0
    
    return {
      total_sessions: totalSessions,
      total_cost_usd: totalCost,
      total_turns: totalTurns,
      avg_cost_per_session: avgCostPerSession,
      avg_cost_per_turn: avgCostPerTurn,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_tokens: totalInputTokens + totalOutputTokens
    }
  }

  /**
   * 生成成本报告（同步方法）
   * 
   * @param options 报告选项
   * @returns 格式化的成本报告字符串
   */
  generateCostReport(options?: {
    sessionIds?: SessionID[]
    tags?: string[]
    format?: 'text' | 'json'
  }): string {
    const format = options?.format || 'text'
    
    // 筛选会话
    let sessions = this.list()
    
    if (options?.sessionIds) {
      sessions = sessions.filter(s => options.sessionIds!.includes(s.id))
    }
    
    if (options?.tags) {
      sessions = sessions.filter(s => 
        options.tags!.every(tag => s.tags?.includes(tag))
      )
    }
    
    // 计算统计数据
    const stats = {
      total_sessions: sessions.length,
      total_cost_usd: 0,
      total_turns: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      sessions: [] as Array<{
        id: string
        cost_usd: number
        turns: number
        tokens: number
        tags?: string[]
      }>
    }
    
    for (const session of sessions) {
      const cost = session.total_cost_usd || 0
      const turns = session.num_turns || Math.floor(session.messages.length / 2)
      const tokens = session.usage.inputTokens + session.usage.outputTokens
      
      stats.total_cost_usd += cost
      stats.total_turns += turns
      stats.total_input_tokens += session.usage.inputTokens
      stats.total_output_tokens += session.usage.outputTokens
      
      stats.sessions.push({
        id: session.id,
        cost_usd: cost,
        turns,
        tokens,
        tags: session.tags
      })
    }
    
    // 格式化输出
    if (format === 'json') {
      return JSON.stringify(stats, null, 2)
    }
    
    // 文本格式
    const lines: string[] = []
    lines.push('='.repeat(60))
    lines.push('成本报告')
    lines.push('='.repeat(60))
    lines.push('')
    lines.push(`总会话数: ${stats.total_sessions}`)
    lines.push(`总成本: $${stats.total_cost_usd.toFixed(4)}`)
    lines.push(`总轮次: ${stats.total_turns}`)
    lines.push(`总 Token 数: ${stats.total_input_tokens + stats.total_output_tokens}`)
    lines.push(`  - 输入: ${stats.total_input_tokens}`)
    lines.push(`  - 输出: ${stats.total_output_tokens}`)
    
    if (stats.total_sessions > 0) {
      lines.push(`平均每会话成本: $${(stats.total_cost_usd / stats.total_sessions).toFixed(4)}`)
    }
    
    if (stats.total_turns > 0) {
      lines.push(`平均每轮成本: $${(stats.total_cost_usd / stats.total_turns).toFixed(4)}`)
    }
    
    if (stats.sessions.length > 0) {
      lines.push('')
      lines.push('-'.repeat(60))
      lines.push('会话详情')
      lines.push('-'.repeat(60))
      
      // 按成本排序
      const sortedSessions = [...stats.sessions].sort((a, b) => b.cost_usd - a.cost_usd)
      
      for (const session of sortedSessions) {
        lines.push('')
        lines.push(`会话 ID: ${session.id}`)
        lines.push(`  成本: $${session.cost_usd.toFixed(4)}`)
        lines.push(`  轮次: ${session.turns}`)
        lines.push(`  Token: ${session.tokens}`)
        if (session.tags && session.tags.length > 0) {
          lines.push(`  标签: ${session.tags.join(', ')}`)
        }
      }
    }
    
    lines.push('')
    lines.push('='.repeat(60))
    
    return lines.join('\n')
  }
}

/**
 * 默认会话管理器实例
 */
export const sessionManager = new SessionManager()
