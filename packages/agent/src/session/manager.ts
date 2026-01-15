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
}

/**
 * 默认会话管理器实例
 */
export const sessionManager = new SessionManager()
