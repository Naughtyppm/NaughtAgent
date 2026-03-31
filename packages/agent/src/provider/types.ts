/**
 * Provider 类型定义
 *
 * 定义 LLM Provider 的通用接口，支持多种后端
 */

import type { z } from "zod"
import { DEFAULT_MAX_TOKENS, FAST_MAX_TOKENS, DEFAULT_TEMPERATURE } from "../config"

/**
 * Provider 类型
 */
export type ProviderType = "anthropic" | "kiro" | "openai" | "auto"

/**
 * Extended Thinking 配置
 */
export interface ThinkingConfig {
  /**
   * 是否启用 Extended Thinking
   */
  enabled: boolean
  /**
   * Thinking 预算 token 数（默认 16000，最大 32000）
   */
  budgetTokens?: number
}

/**
 * 模型配置
 */
export interface ModelConfig {
  provider: ProviderType
  model: string
  temperature?: number
  maxTokens?: number
  /**
   * Extended Thinking 配置（仅 Anthropic 支持）
   */
  thinking?: ThinkingConfig
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * 停止原因
 */
export type StopReason = "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"

/**
 * 流式事件
 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "thinking_end" }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "message_end"; usage: TokenUsage; stopReason?: StopReason }
  | { type: "error"; error: Error }

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: z.ZodObject<z.ZodRawShape>
}

/**
 * 消息角色
 */
export type MessageRole = "user" | "assistant" | "system" | "tool"

/**
 * 文本内容块
 */
export interface TextContent {
  type: "text"
  text: string
}

/**
 * 图片内容块
 */
export interface ImageContent {
  type: "image"
  source: {
    type: "base64" | "url"
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
    data: string
  }
}

/**
 * 音频内容块
 */
export interface AudioContent {
  type: "audio"
  source: {
    type: "base64"
    media_type: "audio/wav" | "audio/mp3"
    data: string
  }
}

/**
 * 工具调用内容块
 */
export interface ToolUseContent {
  type: "tool_use"
  id: string
  name: string
  input: unknown
}

/**
 * 工具结果内容块
 */
export interface ToolResultContent {
  type: "tool_result"
  tool_use_id: string
  content: string | Array<TextContent | ImageContent | AudioContent>
  is_error?: boolean
}

/**
 * 消息内容
 */
export type MessageContent =
  | string
  | Array<TextContent | ImageContent | AudioContent | ToolUseContent | ToolResultContent>

/**
 * 消息
 */
export interface Message {
  role: MessageRole
  content: MessageContent
}

/**
 * 调用参数
 */
export interface ChatParams {
  model: ModelConfig
  messages: Message[]
  system?: string
  tools?: ToolDefinition[]
  abortSignal?: AbortSignal
}

/**
 * 调用结果
 */
export interface ChatResult {
  text: string
  toolCalls: Array<{
    id: string
    name: string
    args: unknown
  }>
  usage: TokenUsage
  /** Extended Thinking 内容（仅 Anthropic 支持） */
  thinking?: string
}

/**
 * LLM Provider 接口
 */
export interface LLMProvider {
  /**
   * Provider 类型
   */
  readonly type: ProviderType

  /**
   * 流式调用
   */
  stream(params: ChatParams): AsyncGenerator<StreamEvent>

  /**
   * 非流式调用
   */
  chat(params: ChatParams): Promise<ChatResult>
}

/**
 * Anthropic 配置
 */
export interface AnthropicConfig {
  apiKey: string
  baseURL?: string
}

/**
 * Kiro 配置
 */
export interface KiroConfig {
  /**
   * Token 缓存目录（默认 ~/.aws/sso/cache）
   */
  tokenCacheDir?: string

  /**
   * HTTP 代理
   */
  proxy?: string

  /**
   * 调试模式
   */
  debug?: boolean
}

/**
 * OpenAI 兼容配置
 *
 * 支持 OpenRouter、Azure OpenAI 等 OpenAI 兼容服务
 */
export interface OpenAIConfig {
  /**
   * API Key
   */
  apiKey: string

  /**
   * API Base URL（默认 https://openrouter.ai/api/v1）
   */
  baseURL?: string

  /**
   * 模型名称映射（可选，用于将内部模型名映射到服务商模型名）
   */
  modelMap?: Record<string, string>
}

/**
 * Provider 配置
 */
export type ProviderConfig =
  | { type: "anthropic"; config: AnthropicConfig }
  | { type: "kiro"; config?: KiroConfig }
  | { type: "openai"; config: OpenAIConfig }
  | { type: "auto"; anthropic?: AnthropicConfig; kiro?: KiroConfig; openai?: OpenAIConfig }

/**
 * 默认模型配置
 */
export const DEFAULT_MODEL: ModelConfig = {
  provider: "auto",
  model: "claude-sonnet-4-20250514",
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
}

/**
 * 快速模型（用于子任务）
 */
export const FAST_MODEL: ModelConfig = {
  provider: "auto",
  model: "claude-haiku-4-20250514",
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: FAST_MAX_TOKENS,
}

/**
 * 模型映射（外部模型名 -> Kiro 模型名）
 */
export const KIRO_MODEL_MAP: Record<string, string> = {
  // Claude 官方模型名
  "claude-3-5-sonnet-20241022": "claude-sonnet-4",
  "claude-3-5-sonnet-latest": "claude-sonnet-4",
  "claude-sonnet-4-20250514": "claude-sonnet-4",
  "claude-3-opus-20240229": "claude-opus-4.5",
  "claude-opus-4-20250514": "claude-opus-4.5",
  "claude-3-5-haiku-20241022": "claude-haiku-4.5",
  "claude-haiku-4-20250514": "claude-haiku-4.5",
  // 简写
  sonnet: "claude-sonnet-4",
  "sonnet-4.5": "claude-sonnet-4.5",
  opus: "claude-opus-4.5",
  "opus-4.5": "claude-opus-4.5",
  haiku: "claude-haiku-4.5",
  "haiku-4.5": "claude-haiku-4.5",
  // OpenAI 兼容
  "gpt-4o": "claude-sonnet-4",
  "gpt-4o-mini": "claude-haiku-4.5",
  o1: "claude-opus-4.5",
}

/**
 * Kiro 支持的模型
 * 注意：不包含 "auto"，避免 Kiro 后端自动切换模型
 */
export const KIRO_MODELS = new Set([
  "claude-sonnet-4",
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "claude-opus-4.5",
])

/**
 * 映射模型名到 Kiro 模型
 * 注意：永远不返回 "auto"，确保模型固定
 */
export function mapToKiroModel(model: string): string {
  if (!model || model === "auto") return "claude-sonnet-4"
  if (KIRO_MODEL_MAP[model]) return KIRO_MODEL_MAP[model]
  if (KIRO_MODELS.has(model)) return model

  // 模糊匹配
  const m = model.toLowerCase()
  if (m.includes("opus")) return "claude-opus-4.5"
  if (m.includes("haiku")) return "claude-haiku-4.5"
  if (m.includes("sonnet")) {
    return m.includes("4.5") ? "claude-sonnet-4.5" : "claude-sonnet-4"
  }

  return "claude-sonnet-4"
}

/**
 * Anthropic API 模型映射（简写 -> 完整模型名）
 */
export const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  // 简写
  sonnet: "claude-sonnet-4-20250514",
  "sonnet-4": "claude-sonnet-4-20250514",
  "sonnet-4.5": "claude-sonnet-4-5-20250514",
  opus: "claude-opus-4-20250514",
  "opus-4": "claude-opus-4-20250514",
  "opus-4.5": "claude-opus-4-5-20251101",
  "opus-4.6": "claude-opus-4-6-20260206",
  haiku: "claude-haiku-4-20250514",
  "haiku-4": "claude-haiku-4-20250514",
  "haiku-4.5": "claude-haiku-4-5-20250514",
  // Kiro 格式 -> Anthropic 格式
  "claude-sonnet-4": "claude-sonnet-4-20250514",
  "claude-sonnet-4.5": "claude-sonnet-4-5-20250514",
  "claude-opus-4.5": "claude-opus-4-5-20251101",
  "claude-opus-4.6": "claude-opus-4-6-20260206",
  "claude-haiku-4.5": "claude-haiku-4-5-20250514",
}

/**
 * Copilot API 兼容的模型名映射（简写 -> copilot-api 识别的格式）
 * copilot-api 不认识带日期后缀的模型名
 */
export const COPILOT_MODEL_MAP: Record<string, string> = {
  // 简写
  sonnet: "claude-sonnet-4",
  "sonnet-4": "claude-sonnet-4",
  "sonnet-4.5": "claude-sonnet-4.5",
  "sonnet-4.6": "claude-sonnet-4.6",
  opus: "claude-opus-4.6",
  "opus-4": "claude-opus-4.6",
  "opus-4.5": "claude-opus-4.5",
  "opus-4.6": "claude-opus-4.6",
  haiku: "claude-haiku-4.5",
  "haiku-4": "claude-haiku-4.5",
  "haiku-4.5": "claude-haiku-4.5",
  // claude- 前缀简写（不带版本号）
  "claude-opus": "claude-opus-4.6",
  "claude-sonnet": "claude-sonnet-4",
  "claude-haiku": "claude-haiku-4.5",
  // copilot-api 直接支持的格式（直通）
  "claude-sonnet-4": "claude-sonnet-4",
  "claude-sonnet-4.5": "claude-sonnet-4.5",
  "claude-sonnet-4.6": "claude-sonnet-4.6",
  "claude-opus-4.5": "claude-opus-4.5",
  "claude-opus-4.6": "claude-opus-4.6",
  "claude-haiku-4.5": "claude-haiku-4.5",
  // Anthropic 完整格式 -> copilot 格式
  "claude-sonnet-4-20250514": "claude-sonnet-4",
  "claude-sonnet-4-5-20250514": "claude-sonnet-4.5",
  "claude-opus-4-20250514": "claude-opus-4.5",
  "claude-opus-4-5-20251101": "claude-opus-4.5",
  "claude-opus-4-6-20260206": "claude-opus-4.6",
  "claude-haiku-4-20250514": "claude-haiku-4.5",
  "claude-haiku-4-5-20250514": "claude-haiku-4.5",
}

/**
 * copilot-api 支持的有效模型名集合
 */
const COPILOT_VALID_MODELS = new Set([
  "claude-sonnet-4", "claude-sonnet-4.5", "claude-sonnet-4.6",
  "claude-opus-4.5", "claude-opus-4.6",
  "claude-haiku-4.5",
])

/**
 * 映射模型名到 Copilot API 兼容的模型名
 */
export function mapToCopilotModel(model: string): string {
  if (!model) return "claude-sonnet-4"
  if (COPILOT_MODEL_MAP[model]) return COPILOT_MODEL_MAP[model]

  // 已经是 copilot-api 认识的格式（白名单验证）
  if (COPILOT_VALID_MODELS.has(model)) return model

  // 模糊匹配
  const m = model.toLowerCase()
  if (m.includes("opus")) {
    if (m.includes("4.5")) return "claude-opus-4.5"
    return "claude-opus-4.6"
  }
  if (m.includes("haiku")) return "claude-haiku-4.5"
  if (m.includes("sonnet")) {
    if (m.includes("4.6")) return "claude-sonnet-4.6"
    return m.includes("4.5") ? "claude-sonnet-4.5" : "claude-sonnet-4"
  }

  return "claude-sonnet-4"
}

/**
 * 映射模型名到 Anthropic API 模型名
 */
export function mapToAnthropicModel(model: string): string {
  if (!model) return "claude-sonnet-4-20250514"
  if (ANTHROPIC_MODEL_MAP[model]) return ANTHROPIC_MODEL_MAP[model]

  // 如果已经是完整的 Anthropic 模型名，直接返回
  if (model.startsWith("claude-") && model.includes("-202")) {
    return model
  }

  // 模糊匹配
  const m = model.toLowerCase()
  if (m.includes("opus")) {
    if (m.includes("4.6")) return "claude-opus-4-6-20260206"
    return m.includes("4.5") ? "claude-opus-4-5-20251101" : "claude-opus-4-20250514"
  }
  if (m.includes("haiku")) {
    return m.includes("4.5") ? "claude-haiku-4-5-20250514" : "claude-haiku-4-20250514"
  }
  if (m.includes("sonnet")) {
    return m.includes("4.5") ? "claude-sonnet-4-5-20250514" : "claude-sonnet-4-20250514"
  }

  return "claude-sonnet-4-20250514"
}

/**
 * 检测 baseURL 是否为反代（copilot-api 等）
 */
export function isProxyBaseURL(baseURL?: string): boolean {
  if (!baseURL) return false
  return baseURL.includes("localhost") || baseURL.includes("127.0.0.1")
}

/**
 * 根据 baseURL 自动选择模型名格式
 * 反代用 copilot 格式，原生用 Anthropic 格式
 */
export function resolveModelName(model: string, baseURL?: string): string {
  if (isProxyBaseURL(baseURL)) {
    return mapToCopilotModel(model)
  }
  return mapToAnthropicModel(model)
}
