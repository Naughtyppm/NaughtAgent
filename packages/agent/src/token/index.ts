/**
 * Token 模块导出
 */

export {
  // Types
  type TokenCount,
  type TokenLimits,
  type TruncateStrategy,
  type TruncateResult,
  type ToolDefinition,
  type TokenManager,
  // Constants
  DEFAULT_TOKEN_LIMITS,
  // Functions
  estimateTokens,
  countMessageTokens,
  countMessagesTokens,
  countToolsTokens,
  countContextTokens,
  needsTruncation,
  getAvailableTokens,
  truncateDropOld,
  truncateSlidingWindow,
  truncateMessages,
  createTokenManager,
} from "./token"

// 工具输出截断器
export {
  // Types
  type TruncationStrategy,
  type TruncationConfig,
  type TruncationResult,
  type GrepMatch,
  type ToolOutputTruncator,
  // Constants
  DEFAULT_TRUNCATION_CONFIG,
  // Functions
  createTruncator,
} from "./truncator"

// Token 压缩器
export {
  // Types
  type CompressionConfig,
  type CompressionResult,
  type TokenCompressor,
  // Constants
  DEFAULT_COMPRESSION_CONFIG,
  // Functions
  createCompressor,
} from "./compressor"
