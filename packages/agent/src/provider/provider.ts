import { createAnthropic } from "@ai-sdk/anthropic"
import { streamText, generateText } from "ai"
import type { z } from "zod"

/**
 * Provider 系统 - LLM 调用抽象
 */
export namespace Provider {
  /**
   * 模型配置
   */
  export interface ModelConfig {
    provider: "anthropic"
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
   * 消息内容
   */
  export interface Message {
    role: MessageRole
    content: string | Array<{ type: string; [key: string]: unknown }>
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
   * Anthropic 配置
   */
  export interface AnthropicConfig {
    apiKey: string
    baseURL?: string
  }

  /**
   * 创建 Anthropic Provider
   */
  export function createAnthropicProvider(config: AnthropicConfig) {
    const anthropic = createAnthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })

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
      /**
       * 流式调用
       */
      async *stream(params: ChatParams): AsyncGenerator<StreamEvent> {
        const model = anthropic(params.model.model)

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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  args: (part as any).input,
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
                  error: part.error instanceof Error ? part.error : new Error(String(part.error)),
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

      /**
       * 非流式调用
       */
      async chat(params: ChatParams): Promise<ChatResult> {
        const model = anthropic(params.model.model)

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args: (call as any).input,
          })),
          usage: {
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
          },
        }
      },
    }
  }

  /**
   * 默认模型配置
   */
  export const DEFAULT_MODEL: ModelConfig = {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    temperature: 0,
    maxTokens: 8192,
  }

  /**
   * 快速模型（用于子任务）
   */
  export const FAST_MODEL: ModelConfig = {
    provider: "anthropic",
    model: "claude-haiku-4-20250514",
    temperature: 0,
    maxTokens: 4096,
  }
}
