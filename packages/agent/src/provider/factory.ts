/**
 * Provider 工厂
 *
 * 根据配置创建合适的 LLM Provider
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import type { LLMProvider, ProviderConfig, AnthropicConfig, KiroConfig, OpenAIConfig } from "./types"
import { createAnthropicProvider } from "./anthropic"
import { createKiroProvider } from "./kiro"
import { createOpenAIProvider } from "./openai"
import { Logger } from "../logging"

// 创建日志器
const logger = new Logger('provider:factory')

/**
 * 检查 Kiro Token 是否可用
 */
function isKiroTokenAvailable(cacheDir?: string): boolean {
  const dir = cacheDir || path.join(os.homedir(), ".aws", "sso", "cache")

  if (!fs.existsSync(dir)) {
    return false
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))

  for (const file of files) {
    try {
      const filePath = path.join(dir, file)
      const content = fs.readFileSync(filePath, "utf-8")
      const data = JSON.parse(content)

      if (data.accessToken && data.refreshToken) {
        return true
      }
    } catch {
      // 忽略
    }
  }

  return false
}

/**
 * 创建 Provider
 *
 * @param config Provider 配置
 * @returns LLM Provider 实例
 *
 * @example
 * ```ts
 * // 自动选择（优先 Anthropic API，否则 OpenAI 兼容，最后 Kiro）
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
 *
 * // 明确使用 Kiro
 * const provider = createProvider({ type: "kiro" })
 * ```
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case "anthropic":
      return createAnthropicProvider(config.config)

    case "kiro":
      return createKiroProvider(config.config)

    case "openai":
      return createOpenAIProvider(config.config)

    case "auto":
    default:
      return createAutoProvider(config.anthropic, config.kiro, config.openai)
  }
}

/**
 * 自动选择 Provider
 *
 * 优先级：
 * 1. 如果有 ANTHROPIC_API_KEY 环境变量，使用 Anthropic
 * 2. 如果有 OPENAI_API_KEY 环境变量，使用 OpenAI 兼容（如 OpenRouter）
 * 3. 如果有 Kiro Token，使用 Kiro
 * 4. 抛出错误
 */
function createAutoProvider(
  anthropicConfig?: AnthropicConfig,
  kiroConfig?: KiroConfig,
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

  // 检查 Kiro Token
  if (isKiroTokenAvailable(kiroConfig?.tokenCacheDir)) {
    logger.debug('Using Kiro (no API key found)')
    return createKiroProvider(kiroConfig)
  }

  // 都没有，抛出错误
  throw new Error(
    "No LLM provider available. Please either:\n" +
      "  1. Set ANTHROPIC_API_KEY environment variable, or\n" +
      "  2. Set OPENAI_API_KEY environment variable (for OpenRouter), or\n" +
      "  3. Login to Kiro IDE to use Kiro proxy"
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
 * - KIRO_DEBUG: 启用 Kiro 调试模式（可选）
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
    kiro: {
      debug: process.env.KIRO_DEBUG === "true" || process.env.KIRO_DEBUG === "1",
      proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
    },
  })
}
