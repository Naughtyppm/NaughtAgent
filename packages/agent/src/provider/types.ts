/**
 * Provider 类型定义
 *
 * 定义 LLM Provider 的通用接口，支持多种后端
 */

import type { z } from "zod"
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from "../config"
import type { StopReason } from "../session/message"

// Re-export for consumers
export type { StopReason }

/**
 * Provider 类型
 */
export type ProviderType = "anthropic" | "openai" | "auto"

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
  /** Prompt Cache 创建的 token 数（仅 Anthropic） */
  cacheCreationTokens?: number
  /** Prompt Cache 命中读取的 token 数（仅 Anthropic） */
  cacheReadTokens?: number
}

/**
 * Thinking 块原始数据（含签名，用于回放回 API）
 */
export interface ThinkingBlockRaw {
  type: "thinking"
  thinking: string
  signature: string
}

/**
 * 流式事件
 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "thinking_end" }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "message_end"; usage: TokenUsage; stopReason?: StopReason; thinkingBlocks?: ThinkingBlockRaw[] }
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
 * Thinking 内容块（Anthropic Extended Thinking）
 *
 * 启用 thinking 时，assistant 消息必须以此块开头
 * signature 是 Anthropic 的加密签名，回放消息时必须原样发送
 */
export interface ThinkingContent {
  type: "thinking"
  thinking: string
  signature: string
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
  | Array<TextContent | ImageContent | AudioContent | ToolUseContent | ToolResultContent | ThinkingContent>

/**
 * 消息
 */
export interface Message {
  role: MessageRole
  content: MessageContent
}

/**
 * 系统提示词块（支持 Prompt Cache 分界线）
 */
export interface SystemBlock {
  type: "text"
  text: string
  /** Prompt Cache 控制：设置 "ephemeral" 让此块成为缓存断点 */
  cache_control?: { type: "ephemeral" }
}

/**
 * 调用参数
 */
export interface ChatParams {
  model: ModelConfig
  messages: Message[]
  /** 系统提示词：string（传统）或 SystemBlock[]（支持 cache_control） */
  system?: string | SystemBlock[]
  tools?: ToolDefinition[]
  abortSignal?: AbortSignal
  /** 会话 ID：传给 copilot-api 的 metadata.user_id，固定后避免重复扣费 */
  sessionId?: string
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
  | { type: "openai"; config: OpenAIConfig }
  | { type: "auto"; anthropic?: AnthropicConfig; openai?: OpenAIConfig }

/**
 * 默认模型配置
 */
export const DEFAULT_MODEL: ModelConfig = {
  provider: "auto",
  model: "claude-sonnet-4-20250514",
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
}
