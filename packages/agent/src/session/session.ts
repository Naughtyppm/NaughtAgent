/**
 * Session 会话系统
 *
 * 管理对话会话和消息历史
 */

import type { Message, ContentBlock } from "./message"
import { generateMessageId } from "./message"

/**
 * 会话 ID
 */
export type SessionID = string

/**
 * Agent 类型
 */
export type AgentType = "build" | "plan" | "explore"

/**
 * 会话状态
 */
export type SessionStatus = "idle" | "running" | "paused" | "completed" | "error"

/**
 * Token 使用统计
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * 会话
 */
export interface Session {
  /** 会话 ID */
  id: SessionID
  /** 当前状态 */
  status: SessionStatus
  /** 工作目录 */
  cwd: string
  /** 消息历史 */
  messages: Message[]
  /** 当前 Agent 类型 */
  agentType: AgentType
  /** 创建时间 */
  createdAt: number
  /** 最后活动时间 */
  updatedAt: number
  /** Token 使用统计 */
  usage: TokenUsage
  /** 会话标签（用于分类和搜索） */
  tags?: string[]
  /** 总成本（美元） */
  total_cost_usd?: number
  /** 对话轮次 */
  num_turns?: number
  /** 父会话 ID（分支时） */
  parent_session_id?: string
  /** 分支点（消息索引） */
  branch_point?: number
}

/**
 * 创建会话选项
 */
export interface CreateSessionOptions {
  /** 工作目录 */
  cwd?: string
  /** Agent 类型 */
  agentType?: AgentType
  /** 自定义 ID */
  id?: string
}

/**
 * 生成会话 ID
 */
export function generateSessionId(): SessionID {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 创建新会话
 */
export function createSession(options: CreateSessionOptions = {}): Session {
  const now = Date.now()
  return {
    id: options.id || generateSessionId(),
    status: "idle",
    cwd: options.cwd || process.cwd(),
    messages: [],
    agentType: options.agentType || "build",
    createdAt: now,
    updatedAt: now,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
    },
    tags: [],
    total_cost_usd: 0,
    num_turns: 0,
  }
}

/**
 * 添加消息到会话
 */
export function addMessage(
  session: Session,
  role: Message["role"],
  content: ContentBlock[]
): Message {
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
 * 更新会话状态
 */
export function updateStatus(session: Session, status: SessionStatus): void {
  session.status = status
  session.updatedAt = Date.now()
}

/**
 * 更新 Token 使用统计
 */
export function updateUsage(
  session: Session,
  usage: Partial<TokenUsage>
): void {
  if (usage.inputTokens !== undefined) {
    session.usage.inputTokens += usage.inputTokens
  }
  if (usage.outputTokens !== undefined) {
    session.usage.outputTokens += usage.outputTokens
  }
  session.updatedAt = Date.now()
}

/**
 * 获取最后一条消息
 */
export function getLastMessage(session: Session): Message | undefined {
  return session.messages[session.messages.length - 1]
}

/**
 * 获取最后一条助手消息
 */
export function getLastAssistantMessage(session: Session): Message | undefined {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i].role === "assistant") {
      return session.messages[i]
    }
  }
  return undefined
}

/**
 * 清空会话消息
 */
export function clearMessages(session: Session): void {
  session.messages = []
  session.updatedAt = Date.now()
}

/**
 * 会话是否可以接收输入
 */
export function canAcceptInput(session: Session): boolean {
  return session.status === "idle" || session.status === "paused"
}

/**
 * 会话是否正在运行
 */
export function isRunning(session: Session): boolean {
  return session.status === "running"
}

/**
 * 会话是否已结束
 */
export function isEnded(session: Session): boolean {
  return session.status === "completed" || session.status === "error"
}
