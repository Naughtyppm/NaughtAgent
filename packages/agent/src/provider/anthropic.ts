/**
 * Anthropic Provider
 *
 * 使用官方 Anthropic API
 */

import { createAnthropic } from "@ai-sdk/anthropic"
import { streamText, generateText } from "ai"
import type {
  LLMProvider,
  AnthropicConfig,
  ChatParams,
  ChatResult,
  StreamEvent,
  ToolDefinition,
} from "./types"

/**
 * 创建 Anthropic Provider
 */
export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
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
    type: "anthropic",

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
