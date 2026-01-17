/**
 * Provider LLM 调用系统
 *
 * 提供 Agent 调用 LLM API 的能力，支持多种后端：
 * - Anthropic: 官方 Claude API
 * - Kiro: 通过 Kiro IDE Token 调用
 * - Auto: 自动选择可用的 Provider
 */

// 类型导出
export type {
  ProviderType,
  ModelConfig,
  TokenUsage,
  StreamEvent,
  ToolDefinition,
  MessageRole,
  TextContent,
  ImageContent,
  AudioContent,
  ToolUseContent,
  ToolResultContent,
  MessageContent,
  Message,
  ChatParams,
  ChatResult,
  LLMProvider,
  AnthropicConfig,
  KiroConfig,
  OpenAIConfig,
  ProviderConfig,
} from "./types"

export {
  DEFAULT_MODEL,
  FAST_MODEL,
  KIRO_MODEL_MAP,
  KIRO_MODELS,
  mapToKiroModel,
} from "./types"

// Provider 实现
export { createAnthropicProvider } from "./anthropic"
export { createKiroProvider } from "./kiro"
export { createOpenAIProvider } from "./openai"
export { createProvider, createProviderFromEnv } from "./factory"
