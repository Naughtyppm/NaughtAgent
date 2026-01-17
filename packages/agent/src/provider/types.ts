/**
 * Provider 类型定义
 *
 * 定义 LLM Provider 的通用接口，支持多种后端
 */

import type { z } from "zod"

/**
 * Provider 类型
 */
export type ProviderType = "anthropic" | "kiro" | "openai" | "auto"

/**
 * 模型配置
 */
export interface ModelConfig {
  provider: ProviderType
  model: string
  temperature?: number
  maxTokens?: number
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * 流式事件
 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "message_end"; usage: TokenUsage }
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
  temperature: 0,
  maxTokens: 8192,
}

/**
 * 快速模型（用于子任务）
 */
export const FAST_MODEL: ModelConfig = {
  provider: "auto",
  model: "claude-haiku-4-20250514",
  temperature: 0,
  maxTokens: 4096,
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
  opus: "claude-opus-4.5",
  haiku: "claude-haiku-4.5",
  // OpenAI 兼容
  "gpt-4o": "claude-sonnet-4",
  "gpt-4o-mini": "claude-haiku-4.5",
  o1: "claude-opus-4.5",
}

/**
 * Kiro 支持的模型
 */
export const KIRO_MODELS = new Set([
  "auto",
  "claude-sonnet-4",
  "claude-sonnet-4.5",
  "claude-haiku-4.5",
  "claude-opus-4.5",
])

/**
 * 映射模型名到 Kiro 模型
 */
export function mapToKiroModel(model: string): string {
  if (!model) return "claude-sonnet-4"
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
