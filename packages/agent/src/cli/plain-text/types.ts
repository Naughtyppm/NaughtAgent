/**
 * Plain-text CLI 类型定义
 *
 * 消息类型、符号常量、颜色定义
 */

// ============================================================================
// 消息类型
// ============================================================================

/** 消息类型枚举 */
export type MessageType =
  | "user_input"
  | "ai_response"
  | "ai_thinking"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "permission_request"
  | "status"
  | "error"
  | "separator"

/** 格式化消息 */
export interface FormattedMessage {
  type: MessageType
  content: string
  metadata?: MessageMetadata
  /** 折叠 ID（可折叠内容） */
  foldId?: string
  /** 时间戳 */
  timestamp: number
}

/** 消息元数据 */
export interface MessageMetadata {
  toolName?: string
  toolId?: string
  /** 工具输入参数（用于显示） */
  toolInput?: Record<string, unknown>
  /** 是否可折叠 */
  foldable?: boolean
  /** 行数（用于折叠判断） */
  lineCount?: number
  /** 摘要（折叠时显示） */
  summary?: string
}

// ============================================================================
// 折叠状态
// ============================================================================

export type FoldState = "collapsed" | "expanded"

export interface FoldEntry {
  id: string
  content: string
  state: FoldState
  summary: string
  lineCount: number
}

// ============================================================================
// Token 使用统计
// ============================================================================

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
}
