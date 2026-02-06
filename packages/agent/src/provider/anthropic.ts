/**
 * Anthropic Provider
 *
 * 使用官方 Anthropic SDK（原生）
 *
 * 注意：使用原生 SDK 而非 AI SDK，因为 AI SDK 的 tools 格式
 * 与 Anthropic 原生 API 不兼容，会导致 kiro-proxy 返回 500 错误
 */

import Anthropic from "@anthropic-ai/sdk"
import { zodToJsonSchema } from "zod-to-json-schema"
import { withRetry, AgentError, ErrorCode } from "../error"
import { Logger } from "../logging"
import type {
  LLMProvider,
  AnthropicConfig,
  ChatParams,
  ChatResult,
  StreamEvent,
  ToolDefinition,
  Message,
  TextContent,
  ImageContent,
  ToolUseContent,
  ToolResultContent,
} from "./types"
import { mapToAnthropicModel } from "./types"

/**
 * 创建 Anthropic Provider
 */
export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })

  // 创建日志器
  const logger = new Logger('provider:anthropic')

  /**
   * 转换工具定义为 Anthropic 原生格式
   * 将 Zod schema 转换为 JSON Schema
   */
  function convertTools(tools?: ToolDefinition[]): Anthropic.Tool[] | undefined {
    if (!tools || tools.length === 0) return undefined

    return tools.map((t) => {
      // 使用 zodToJsonSchema 将 Zod schema 转换为 JSON Schema
      const jsonSchema = zodToJsonSchema(t.parameters, { $refStrategy: "none" })
      return {
        name: t.name,
        description: t.description,
        input_schema: jsonSchema as Anthropic.Tool.InputSchema,
      }
    })
  }

  /**
   * 转换消息为 Anthropic 原生格式
   */
  function convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map((msg) => {
      if (msg.role === "user") {
        // 用户消息
        if (typeof msg.content === "string") {
          return { role: "user" as const, content: msg.content }
        }

        // 数组格式
        const content: Anthropic.ContentBlockParam[] = []
        for (const part of msg.content) {
          if (part.type === "text") {
            content.push({ type: "text", text: (part as TextContent).text })
          } else if (part.type === "image") {
            const imgPart = part as ImageContent
            content.push({
              type: "image",
              source: imgPart.source as Anthropic.Base64ImageSource,
            })
          } else if (part.type === "tool_result") {
            const toolResult = part as ToolResultContent
            // 转换 tool_result content
            let resultContent: string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
            if (typeof toolResult.content === "string") {
              resultContent = toolResult.content
            } else {
              resultContent = toolResult.content
                .filter((c): c is TextContent | ImageContent =>
                  c.type === "text" || c.type === "image"
                )
                .map((c) => {
                  if (c.type === "text") {
                    return { type: "text" as const, text: c.text }
                  } else {
                    return {
                      type: "image" as const,
                      source: c.source as Anthropic.Base64ImageSource,
                    }
                  }
                })
            }
            content.push({
              type: "tool_result",
              tool_use_id: toolResult.tool_use_id,
              content: resultContent,
              is_error: toolResult.is_error,
            })
          }
        }
        return { role: "user" as const, content }
      } else {
        // 助手消息
        if (typeof msg.content === "string") {
          return { role: "assistant" as const, content: msg.content }
        }

        const content: (Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam)[] = []
        for (const part of msg.content) {
          if (part.type === "text") {
            content.push({ type: "text", text: (part as TextContent).text })
          } else if (part.type === "tool_use") {
            const toolUse = part as ToolUseContent
            content.push({
              type: "tool_use",
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input as Record<string, unknown>,
            })
          }
        }
        return { role: "assistant" as const, content }
      }
    })
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
      logger.debug('开始流式调用', {
        model: params.model.model,
        messageCount: params.messages.length,
        hasTools: !!params.tools,
        toolCount: params.tools?.length || 0
      })

      try {
        const stream = await withRetry(async () => {
          return client.messages.stream(
            {
              model: mapToAnthropicModel(params.model.model),
              max_tokens: params.model.maxTokens || 8192,
              system: params.system,
              messages: convertMessages(params.messages),
              tools: convertTools(params.tools),
              temperature: params.model.temperature,
            },
            {
              signal: params.abortSignal,
            }
          )
        })

        let textChunks = 0
        let toolCalls = 0

        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            const delta = event.delta
            if (delta.type === "text_delta") {
              textChunks++
              yield { type: "text", text: delta.text }
            } else if (delta.type === "input_json_delta") {
              // Tool input streaming - 暂时忽略，等待完整的 tool_use
            }
          } else if (event.type === "content_block_start") {
            const block = event.content_block
            if (block.type === "tool_use") {
              // Tool use 开始，但我们等待完整的消息
            }
          } else if (event.type === "message_stop") {
            // 消息结束
          }
        }

        // 获取最终消息
        const finalMessage = await stream.finalMessage()

        // 处理工具调用
        for (const block of finalMessage.content) {
          if (block.type === "tool_use") {
            toolCalls++
            yield {
              type: "tool_call",
              id: block.id,
              name: block.name,
              args: block.input,
            }
          }
        }

        logger.debug('流式调用完成', {
          textChunks,
          toolCalls,
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens
        })

        yield {
          type: "message_end",
          usage: {
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
          },
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
      logger.debug('开始非流式调用', {
        model: params.model.model,
        messageCount: params.messages.length,
        hasTools: !!params.tools,
        toolCount: params.tools?.length || 0
      })

      try {
        const convertedMessages = convertMessages(params.messages)
        const convertedTools = convertTools(params.tools)

        const response = await client.messages.create(
          {
            model: mapToAnthropicModel(params.model.model),
            max_tokens: params.model.maxTokens || 8192,
            system: params.system,
            messages: convertedMessages,
            tools: convertedTools,
            temperature: params.model.temperature,
          },
          {
            signal: params.abortSignal,
          }
        )

        // 提取文本和工具调用
        let text = ""
        const toolCalls: { id: string; name: string; args: unknown }[] = []

        for (const block of response.content) {
          if (block.type === "text") {
            text += block.text
          } else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              name: block.name,
              args: block.input,
            })
          }
        }

        logger.debug('非流式调用完成', {
          textLength: text.length,
          toolCallCount: toolCalls.length,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        })

        return {
          text,
          toolCalls,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
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
