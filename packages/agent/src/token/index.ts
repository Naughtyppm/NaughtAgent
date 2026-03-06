/**
 * Token 模块导出
 */

// ============================================================================
// 新增：精确 Token 计数
// ============================================================================

// 类型定义
export {
  type TokenizerType,
  type ModelType,
  type FallbackStrategy,
  type TokenizerConfig,
  type CacheStats,
  type Tokenizer,
  type TokenizerProvider,
  type TokenizerFactory,
} from "./types"

// 错误类型
export {
  TokenizerLoadError,
  InvalidTokenError,
  TextTooLongError,
} from "./errors"

// Tokenizer 实现
export { EstimateTokenizer, createEstimateTokenizer } from "./estimate-tokenizer"
export {
  ClaudeTokenizer,
  createClaudeTokenizer,
  createClaudeTokenizerSync,
  preloadClaudeTokenizer,
} from "./claude-tokenizer"
export {
  GPTTokenizer,
  createGPTTokenizer,
  createGPTTokenizerSync,
  preloadGPTTokenizer,
} from "./gpt-tokenizer"

// 工厂和 Provider
export { getTokenizerFactory, createTokenizer } from "./tokenizer-factory"
export {
  getTokenizerProvider,
  createTokenizerProvider,
} from "./tokenizer-provider"

// ============================================================================
// 原有导出（保持向后兼容）
// ============================================================================

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
  truncateToTokens,
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
