/**
 * Provider LLM 调用系统
 *
 * 提供 Agent 调用 LLM API 的能力，支持多种后端：
 * - Anthropic: 官方 Claude API（含 Copilot 反代）
 * - OpenAI: OpenAI 兼容 API（如 OpenRouter）
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
  OpenAIConfig,
  ProviderConfig,
} from "./types"

export {
  DEFAULT_MODEL,
} from "./types"

// Provider 实现
export { createAnthropicProvider } from "./anthropic"
export { createOpenAIProvider } from "./openai"
export { createProvider, createProviderFromEnv } from "./factory"
