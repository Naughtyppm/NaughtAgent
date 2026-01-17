/**
 * Anthropic Provider
 *
 * 使用官方 Anthropic API
 */

import { createAnthropic } from "@ai-sdk/anthropic"
import { streamText, generateText } from "ai"
import { withRetry, AgentError, ErrorCode } from "../error"
import { Logger } from "../logging"
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

  // 创建日志器
  const logger = new Logger('provider:anthropic')

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

  /**
   * 将原生错误转换为 AgentError
   */
  function convertError(error: unknown): AgentError {
    if (error instanceof AgentError) {
      return error
    }

    const err = error instanceof Error ? error : new Error(String(error))
    const message = err.message.toLowerCase()

    // 网络错误
    if (message.includes("network") || message.includes("econnrefused") || message.includes("enotfound")) {
      return new AgentError(err.message, ErrorCode.NETWORK_ERROR, true, { originalError: err })
    }

    // 超时错误
    if (message.includes("timeout") || message.includes("timed out")) {
      return new AgentError(err.message, ErrorCode.TIMEOUT, true, { originalError: err })
    }

    // 速率限制
    if (message.includes("rate limit") || message.includes("429")) {
      return new AgentError(err.message, ErrorCode.RATE_LIMIT, true, { originalError: err })
    }

    // 认证错误
    if (message.includes("unauthorized") || message.includes("401") || message.includes("api key")) {
      return new AgentError(err.message, ErrorCode.AUTHENTICATION_ERROR, false, { originalError: err })
    }

    // 无效请求
    if (message.includes("invalid") || message.includes("400")) {
      return new AgentError(err.message, ErrorCode.INVALID_REQUEST, false, { originalError: err })
    }

    // 默认为 API 错误
    return new AgentError(err.message, ErrorCode.API_ERROR, false, { originalError: err })
  }

  return {
    type: "anthropic",

    async *stream(params: ChatParams): AsyncGenerator<StreamEvent> {
      const model = anthropic(params.model.model)

      logger.debug('开始流式调用', {
        model: params.model.model,
        messageCount: params.messages.length,
        hasTools: !!params.tools,
        toolCount: params.tools?.length || 0
      })

      try {
        const result = await withRetry(async () => {
          return streamText({
            model,
            system: params.system,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messages: params.messages as any,
            tools: convertTools(params.tools),
            temperature: params.model.temperature,
            maxOutputTokens: params.model.maxTokens,
            abortSignal: params.abortSignal,
          })
        })

        let textChunks = 0
        let toolCalls = 0

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "text-delta":
              textChunks++
              yield { type: "text", text: part.text }
              break

            case "tool-call":
              toolCalls++
              yield {
                type: "tool_call",
                id: part.toolCallId,
                name: part.toolName,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                args: (part as any).input,
              }
              break

            case "finish":
              logger.debug('流式调用完成', {
                textChunks,
                toolCalls,
                inputTokens: part.totalUsage?.inputTokens ?? 0,
                outputTokens: part.totalUsage?.outputTokens ?? 0
              })
              
              yield {
                type: "message_end",
                usage: {
                  inputTokens: part.totalUsage?.inputTokens ?? 0,
                  outputTokens: part.totalUsage?.outputTokens ?? 0,
                },
              }
              break

            case "error":
              logger.error('流式调用错误', {
                error: part.error instanceof Error ? part.error.message : String(part.error)
              })
              
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
        const agentError = convertError(err)
        logger.error('流式调用失败', {
          error: agentError.message,
          code: agentError.code,
          recoverable: agentError.recoverable
        })
        yield { type: "error", error: agentError }
      }
    },

    async chat(params: ChatParams): Promise<ChatResult> {
      const model = anthropic(params.model.model)

      logger.debug('开始非流式调用', {
        model: params.model.model,
        messageCount: params.messages.length,
        hasTools: !!params.tools,
        toolCount: params.tools?.length || 0
      })

      try {
        const result = await withRetry(async () => {
          return generateText({
            model,
            system: params.system,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messages: params.messages as any,
            tools: convertTools(params.tools),
            temperature: params.model.temperature,
            maxOutputTokens: params.model.maxTokens,
            abortSignal: params.abortSignal,
          })
        })

        logger.debug('非流式调用完成', {
          textLength: result.text.length,
          toolCallCount: result.toolCalls.length,
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0
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
      } catch (err) {
        const agentError = convertError(err)
        logger.error('非流式调用失败', {
          error: agentError.message,
          code: agentError.code,
          recoverable: agentError.recoverable
        })
        throw agentError
      }
    },
  }
}
