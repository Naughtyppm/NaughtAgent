/**
 * Server 类型定义
 *
 * HTTP API 和 WebSocket 接口类型
 */

import type { AgentType } from "../agent"

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * Server 配置
 */
export interface ServerConfig {
  /** 监听端口 */
  port?: number
  /** 监听地址 */
  host?: string
  /** API Key（用于认证） */
  apiKey: string
  /** Claude API Key */
  claudeApiKey: string
  /** Claude API Base URL */
  claudeBaseURL?: string
  /** 默认工作目录 */
  defaultCwd?: string
  /** 是否启用 CORS */
  cors?: boolean
  /** 自动确认所有操作（危险，仅用于测试） */
  autoConfirm?: boolean
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * 会话创建请求
 */
export interface CreateSessionRequest {
  /** 工作目录 */
  cwd?: string
  /** Agent 类型 */
  agentType?: AgentType
}

/**
 * 会话响应
 */
export interface SessionResponse {
  /** 会话 ID */
  id: string
  /** 创建时间 */
  createdAt: string
  /** Agent 类型 */
  agentType: string
  /** 工作目录 */
  cwd: string
  /** 消息数量 */
  messageCount?: number
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * 消息发送请求
 */
export interface SendMessageRequest {
  /** 用户消息 */
  message: string
  /** 是否流式响应 */
  stream?: boolean
}

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  /** 工具 ID */
  id: string
  /** 工具名称 */
  name: string
  /** 输入参数 */
  input: unknown
  /** 输出结果 */
  output: string
  /** 是否出错 */
  isError?: boolean
}

/**
 * 消息响应（非流式）
 */
export interface MessageResponse {
  /** 响应内容 */
  content: string
  /** 工具调用记录 */
  toolCalls: ToolCallRecord[]
  /** Token 使用 */
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

// ============================================================================
// Stream Events
// ============================================================================

/**
 * 流式事件 - 文本
 */
export interface TextEvent {
  type: "text"
  content: string
}

/**
 * 流式事件 - 文本增量
 */
export interface TextDeltaEvent {
  type: "text_delta"
  delta: string
}

/**
 * 流式事件 - 工具开始
 */
export interface ToolStartEvent {
  type: "tool_start"
  id: string
  name: string
  input: unknown
}

/**
 * 流式事件 - 工具结束
 */
export interface ToolEndEvent {
  type: "tool_end"
  id: string
  output: string
  isError?: boolean
}

/**
 * 流式事件 - 错误
 */
export interface ErrorEvent {
  type: "error"
  message: string
}

/**
 * 流式事件 - 完成
 */
export interface DoneEvent {
  type: "done"
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens?: number
    cacheReadTokens?: number
  }
}

/**
 * 流式事件 - 权限请求
 */
export interface PermissionRequestEvent {
  type: "permission_request"
  requestId: string
  permissionType: string
  resource: string
  description: string
}

/**
 * 流式事件 - Extended Thinking 内容
 */
export interface ThinkingEvent {
  type: "thinking"
  content: string
}

/**
 * 流式事件 - Extended Thinking 结束
 */
export interface ThinkingEndEvent {
  type: "thinking_end"
}

/**
 * 流式事件 - 工具输出流（实时中间输出）
 */
export interface ToolOutputStreamEvent {
  type: "tool_output_stream"
  id: string
  chunk: string
}

/**
 * 流式事件联合类型
 */
export type StreamEvent =
  | TextEvent
  | TextDeltaEvent
  | ToolStartEvent
  | ToolEndEvent
  | ToolOutputStreamEvent
  | ErrorEvent
  | DoneEvent
  | PermissionRequestEvent
  | ThinkingEvent
  | ThinkingEndEvent
  | SubAgentStartEvent
  | SubAgentEndEvent

/**
 * 子 Agent 开始事件（parallel_agents 子任务进度）
 */
export interface SubAgentStartEvent {
  type: "subagent_start"
  parentId: string
  childId: string
  childName: string
  prompt?: string
}

/**
 * 子 Agent 结束事件
 */
export interface SubAgentEndEvent {
  type: "subagent_end"
  parentId: string
  childId: string
  childName: string
  success: boolean
  output?: string
  error?: string
}

// ============================================================================
// WebSocket Types
// ============================================================================

/**
 * WebSocket 客户端消息 - 发送
 */
export interface WSSendMessage {
  type: "send"
  message: string
  model?: string
  thinking?: {
    enabled: boolean
    budgetTokens?: number
  }
  autoConfirm?: boolean
  attachments?: Array<{ type: string; data: string; mimeType: string }>
}

/**
 * WebSocket 客户端消息 - 取消
 */
export interface WSCancelMessage {
  type: "cancel"
}

/**
 * WebSocket 客户端消息 - 心跳
 */
export interface WSPingMessage {
  type: "ping"
}

/**
 * WebSocket 客户端消息 - 权限响应
 */
export interface WSPermissionResponse {
  type: "permission_response"
  requestId: string
  allowed: boolean
}

/**
 * WebSocket 客户端消息 - 问题回答
 */
export interface WSQuestionResponse {
  type: "question_response"
  requestId: string
  value: unknown
  cancelled?: boolean
}

/**
 * WebSocket 客户端消息联合类型
 */
export type WSClientMessage =
  | WSSendMessage
  | WSCancelMessage
  | WSPingMessage
  | WSPermissionResponse
  | WSQuestionResponse
  | WSSnapshotResponse

/**
 * WebSocket 服务端消息 - Pong
 */
export interface WSPongMessage {
  type: "pong"
}

/**
 * WebSocket 服务端消息 - 向前端提问
 */
export interface WSQuestionRequest {
  type: "question_request"
  requestId: string
  questionType: "confirm" | "select" | "multiselect" | "text"
  message: string
  options?: Array<{ value: string; label: string; description?: string }>
  default?: unknown
}

/**
 * WebSocket 服务端消息联合类型
 */
export type WSServerMessage = StreamEvent | WSPongMessage | WSQuestionRequest | WSSnapshotRequest

/**
 * WebSocket 服务端消息 - 请求 Webview 快照
 */
export interface WSSnapshotRequest {
  type: "snapshot_request"
  requestId: string
}

/**
 * WebSocket 客户端消息 - Webview 快照结果
 */
export interface WSSnapshotResponse {
  type: "snapshot_response"
  requestId: string
  snapshot: Record<string, unknown>
}

// ============================================================================
// Skill Types
// ============================================================================

/**
 * 技能执行请求
 */
export interface ExecuteSkillRequest {
  /** 工作目录 */
  cwd?: string
  /** 参数 */
  args?: string[]
}

/**
 * 技能执行响应
 */
export interface SkillResponse {
  /** 是否成功 */
  success: boolean
  /** 输出内容 */
  output: string
  /** 错误信息 */
  error?: string
  /** 执行时间（毫秒） */
  duration?: number
}

// ============================================================================
// Task Types
// ============================================================================

/**
 * 任务状态
 */
export type TaskStatusType = "queued" | "running" | "completed" | "failed" | "cancelled"

/**
 * 任务响应
 */
export interface TaskResponse {
  /** 任务 ID */
  id: string
  /** 会话 ID */
  sessionId: string
  /** 状态 */
  status: TaskStatusType
  /** 优先级 */
  priority: number
  /** 类型 */
  type: "message" | "skill" | "subtask"
  /** 创建时间 */
  createdAt: string
  /** 开始时间 */
  startedAt?: string
  /** 完成时间 */
  completedAt?: string
  /** 结果 */
  result?: {
    success: boolean
    output?: string
    error?: string
  }
}

/**
 * 任务列表响应
 */
export interface TaskListResponse {
  tasks: TaskResponse[]
  stats: {
    queued: number
    running: number
    completed: number
    failed: number
    cancelled: number
    total: number
  }
}

/**
 * 提交任务请求
 */
export interface SubmitTaskRequest {
  /** 会话 ID */
  sessionId: string
  /** 任务类型 */
  type?: "message" | "skill" | "subtask"
  /** 消息内容 */
  message?: string
  /** 技能名称 */
  skill?: string
  /** 参数 */
  args?: Record<string, unknown>
  /** 优先级 */
  priority?: number
  /** 超时（ms） */
  timeout?: number
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * 错误码
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "SESSION_NOT_FOUND"
  | "SKILL_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "QUEUE_FULL"

/**
 * API 错误响应
 */
export interface ErrorResponse {
  error: {
    code: ErrorCode
    message: string
  }
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * 健康检查响应
 */
export interface HealthResponse {
  status: "ok"
  version: string
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * 活跃会话信息
 */
export interface ActiveSession {
  /** 会话 ID */
  id: string
  /** 创建时间 */
  createdAt: Date
  /** Agent 类型 */
  agentType: AgentType
  /** 工作目录 */
  cwd: string
  /** Runner 实例 */
  runner: unknown // 避免循环依赖，实际是 Runner 类型
  /** 中止控制器 */
  abortController?: AbortController
}

/**
 * 待处理的权限请求
 */
export interface PendingPermission {
  /** 请求 ID */
  requestId: string
  /** resolve 回调 */
  resolve: (allowed: boolean) => void
  /** 超时定时器 */
  timeout: ReturnType<typeof setTimeout>
}
