/**
 * 上下文管理模块
 *
 * 提供 Token 预算管理、消息压缩和上下文摘要功能
 */

// Budget
export {
  type TokenCounter,
  SimpleTokenCounter,
  defaultTokenCounter,
  TokenBudgetManager,
  createTokenBudgetManager,
} from "./budget"

// Summary
export {
  DEFAULT_COMPRESSION_CONFIG,
  type MessageImportance,
  evaluateMessageImportance,
  compressBySlidingWindow,
  compressByImportance,
  compressMessages,
  extractKeyFiles,
  extractKeyDecisions,
  generateSimpleSummary,
  generateLLMSummary,
} from "./summary"

// Manager
export {
  type ContextManagerConfig,
  type PreparedContext,
  ContextManager,
  createContextManager,
} from "./manager"
