/**
 * Provider 工厂
 *
 * 根据配置创建合适的 LLM Provider
 */

import type { LLMProvider, ProviderConfig, AnthropicConfig, OpenAIConfig } from "./types"
import { createAnthropicProvider } from "./anthropic"
import { createOpenAIProvider } from "./openai"
import { Logger } from "../logging"

// 创建日志器
const logger = new Logger('provider:factory')

/**
 * 创建 Provider
 *
 * @param config Provider 配置
 * @returns LLM Provider 实例
 *
 * @example
 * ```ts
 * // 自动选择（优先 Anthropic API，否则 OpenAI 兼容）
 * const provider = createProvider({ type: "auto" })
 *
 * // 明确使用 Anthropic
 * const provider = createProvider({
 *   type: "anthropic",
 *   config: { apiKey: "sk-..." }
 * })
 *
 * // 明确使用 OpenAI 兼容（如 OpenRouter）
 * const provider = createProvider({
 *   type: "openai",
 *   config: { apiKey: "sk-or-...", baseURL: "https://openrouter.ai/api/v1" }
 * })
 * ```
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case "anthropic":
      return createAnthropicProvider(config.config)

    case "openai":
      return createOpenAIProvider(config.config)

    case "auto":
    default:
      return createAutoProvider(config.anthropic, config.openai)
  }
}

/**
 * 自动选择 Provider
 *
 * 优先级：
 * 1. 如果有 ANTHROPIC_API_KEY 环境变量，使用 Anthropic
 * 2. 如果有 OPENAI_API_KEY 环境变量，使用 OpenAI 兼容（如 OpenRouter）
 * 3. 抛出错误
 */
function createAutoProvider(
  anthropicConfig?: AnthropicConfig,
  openaiConfig?: OpenAIConfig
): LLMProvider {
  // 检查 Anthropic API Key
  const anthropicApiKey = anthropicConfig?.apiKey || process.env.ANTHROPIC_API_KEY

  if (anthropicApiKey) {
    logger.debug('Using Anthropic API')
    return createAnthropicProvider({
      apiKey: anthropicApiKey,
      baseURL: anthropicConfig?.baseURL || process.env.ANTHROPIC_BASE_URL,
    })
  }

  // 检查 OpenAI 兼容 API Key（如 OpenRouter）
  const openaiApiKey = openaiConfig?.apiKey || process.env.OPENAI_API_KEY

  if (openaiApiKey) {
    logger.debug('Using OpenAI compatible API')
    return createOpenAIProvider({
      apiKey: openaiApiKey,
      baseURL: openaiConfig?.baseURL || process.env.OPENAI_BASE_URL,
      modelMap: openaiConfig?.modelMap,
    })
  }

  // 都没有，抛出错误
  throw new Error(
    "No LLM provider available. Please either:\n" +
      "  1. Set ANTHROPIC_API_KEY environment variable, or\n" +
      "  2. Set OPENAI_API_KEY environment variable (for OpenRouter)"
  )
}

/**
 * 从环境变量创建 Provider
 *
 * 读取以下环境变量：
 * - ANTHROPIC_API_KEY: Anthropic API Key
 * - ANTHROPIC_BASE_URL: Anthropic API Base URL（可选）
 * - OPENAI_API_KEY: OpenAI 兼容 API Key（如 OpenRouter）
 * - OPENAI_BASE_URL: OpenAI 兼容 API Base URL（可选，默认 OpenRouter）
 */
export function createProviderFromEnv(): LLMProvider {
  return createProvider({
    type: "auto",
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      baseURL: process.env.ANTHROPIC_BASE_URL,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL,
    },
  })
}
