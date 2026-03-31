/**
 * OpenAI 兼容 Provider
 *
 * 支持 OpenRouter、Azure OpenAI 等 OpenAI 兼容服务
 */

import { createOpenAI } from "@ai-sdk/openai"
import { streamText, generateText } from "ai"
import type {
  LLMProvider,
  OpenAIConfig,
  ChatParams,
  ChatResult,
  StreamEvent,
  ToolDefinition,
} from "./types"

/**
 * OpenRouter 默认 Base URL
 */
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

/**
 * 默认模型映射（内部模型名 -> OpenRouter 模型名）
 */
const DEFAULT_MODEL_MAP: Record<string, string> = {
  // Claude 模型
  "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
  "claude-opus-4-20250514": "anthropic/claude-opus-4",
  "claude-haiku-4-20250514": "anthropic/claude-haiku-4",
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  "claude-3-5-haiku-20241022": "anthropic/claude-3.5-haiku",
  "claude-3-opus-20240229": "anthropic/claude-3-opus",
  // 简写
  sonnet: "anthropic/claude-sonnet-4",
  opus: "anthropic/claude-opus-4",
  haiku: "anthropic/claude-haiku-4",
  // 保持原样的 OpenRouter 模型
  "anthropic/claude-sonnet-4": "anthropic/claude-sonnet-4",
  "anthropic/claude-opus-4": "anthropic/claude-opus-4",
  "anthropic/claude-haiku-4": "anthropic/claude-haiku-4",
}

/**
 * 创建 OpenAI 兼容 Provider
 */
export function createOpenAIProvider(config: OpenAIConfig): LLMProvider {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL || OPENROUTER_BASE_URL,
  })

  const modelMap = { ...DEFAULT_MODEL_MAP, ...config.modelMap }

  /**
   * 映射模型名
   */
  function mapModel(model: string): string {
    return modelMap[model] || model
  }

  /**
   * 转换工具定义为 AI SDK 格式
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function convertTools(tools?: ToolDefinition[]): any {
    if (!tools || tools.length === 0) return undefined

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {}
    for (const t of tools) {
      result[t.name] = {
        description: t.description,
        parameters: t.parameters,
      }
    }
    return result
  }

  return {
    type: "openai",

    async *stream(params: ChatParams): AsyncGenerator<StreamEvent> {
      const modelName = mapModel(params.model.model)
      const model = openai(modelName)

      try {
        const result = streamText({
          model,
          system: params.system,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: params.messages as any,
          tools: convertTools(params.tools),
          temperature: params.model.temperature,
          maxOutputTokens: params.model.maxTokens,
          abortSignal: params.abortSignal,
        })

        for await (const part of (await result).fullStream) {
          switch (part.type) {
            case "text-delta":
              yield { type: "text", text: part.text }
              break

            case "tool-call":
              yield {
                type: "tool_call",
                id: part.toolCallId,
                name: part.toolName,
                // AI SDK typed tools use 'args', dynamic tools use 'input'
                args: "args" in part ? part.args : (part as { input: unknown }).input,
              }
              break

            case "finish":
              yield {
                type: "message_end",
                usage: {
                  inputTokens: part.totalUsage?.inputTokens ?? 0,
                  outputTokens: part.totalUsage?.outputTokens ?? 0,
                },
              }
              break

            case "error":
              yield {
                type: "error",
                error:
                  part.error instanceof Error
                    ? part.error
                    : new Error(String(part.error)),
              }
              break
          }
        }
      } catch (err) {
        yield {
          type: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        }
      }
    },

    async chat(params: ChatParams): Promise<ChatResult> {
      const modelName = mapModel(params.model.model)
      const model = openai(modelName)

      try {
        const result = await generateText({
          model,
          system: params.system,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: params.messages as any,
          tools: convertTools(params.tools),
          temperature: params.model.temperature,
          maxOutputTokens: params.model.maxTokens,
          abortSignal: params.abortSignal,
        })

        return {
          text: result.text,
          toolCalls: result.toolCalls.map((call) => ({
            id: call.toolCallId,
            name: call.toolName,
            args: "args" in call ? call.args : (call as { input: unknown }).input,
          })),
          usage: {
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
          },
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        throw error
      }
    },
  }
}
