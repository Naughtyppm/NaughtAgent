/**
 * Session 会话系统
 *
 * 管理对话会话、消息历史和持久化
 */

// Message 消息
export {
  type MessageRole,
  type TextBlock,
  type ToolUseBlock,
  type ToolResultBlock,
  type ImageBlock,
  type AudioBlock,
  type ContentBlock,
  type StopReason,
  type Message,
  generateMessageId,
  createUserMessage,
  createAssistantMessage,
  createToolResult,
  getMessageText,
  getToolCalls,
  hasToolCalls,
} from "./message"

// Session 会话
export {
  type SessionID,
  type AgentType,
  type SessionStatus,
  type TokenUsage,
  type Session,
  type CreateSessionOptions,
  generateSessionId,
  createSession,
  addMessage,
  updateStatus,
  updateUsage,
  getLastMessage,
  getLastAssistantMessage,
  clearMessages,
  canAcceptInput,
  isRunning,
  isEnded,
} from "./session"

// SessionManager 会话管理器
export { SessionManager, sessionManager } from "./manager"

// Storage 持久化
export {
  saveSession,
  loadSession,
  deleteSessionStorage,
  listSavedSessions,
  isSessionSaved,
  appendMessage,
} from "./storage"

// Migration 数据迁移
export {
  type MigrationOptions,
  type MigrationResult,
  migrateAllSessions,
  migrateSingleSession,
  printMigrationResult,
} from "./migrate"
