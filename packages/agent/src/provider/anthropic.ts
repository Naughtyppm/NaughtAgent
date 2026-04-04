/**
 * Anthropic Provider
 *
 * 使用官方 Anthropic SDK（原生）
 *
 * 注意：使用原生 SDK 而非 AI SDK，因为 AI SDK 的 tools 格式
 * 与 Anthropic 原生 API 不兼容，会导致代理返回 500 错误
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
  ThinkingContent,
} from "./types"
import { resolveModelName, isProxyBaseURL, DEFAULT_MAX_TOKENS, DEFAULT_THINKING_BUDGET } from "../config"

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

    const converted: Anthropic.Tool[] = tools.map((t) => {
      // 使用 zodToJsonSchema 将 Zod schema 转换为 JSON Schema
      const jsonSchema = zodToJsonSchema(t.parameters, { $refStrategy: "none" })
      return {
        name: t.name,
        description: t.description,
        input_schema: jsonSchema as Anthropic.Tool.InputSchema,
      }
    })

    // 在最后一个工具上设置 cache_control，作为 Prompt Cache 断点
    if (converted.length > 0) {
      converted[converted.length - 1].cache_control = { type: "ephemeral" as const }
    }

    return converted
  }

  /**
   * 转换消息为 Anthropic 原生格式
   */
  function convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const converted = messages.map((msg) => {
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

        const content: (Anthropic.ThinkingBlockParam | Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam)[] = []
        for (const part of msg.content) {
          if (part.type === "thinking") {
            const thinkingPart = part as ThinkingContent
            content.push({ type: "thinking", thinking: thinkingPart.thinking, signature: thinkingPart.signature })
          } else if (part.type === "text") {
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

    // 在最后一条 user 消息的最后一个 content block 上添加 cache_control
    for (let i = converted.length - 1; i >= 0; i--) {
      const msg = converted[i]
      if (msg.role === "user" && Array.isArray(msg.content) && msg.content.length > 0) {
        const lastBlock = msg.content[msg.content.length - 1] as Anthropic.ContentBlockParam & {
          cache_control?: { type: "ephemeral" }
        }
        lastBlock.cache_control = { type: "ephemeral" }
        break
      }
    }

    return converted
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
      const thinkingEnabled = params.model.thinking?.enabled
      const thinkingBudget = params.model.thinking?.budgetTokens || DEFAULT_THINKING_BUDGET

      logger.debug('开始流式调用', {
        model: params.model.model,
        messageCount: params.messages.length,
        hasTools: !!params.tools,
        toolCount: params.tools?.length || 0,
        thinkingEnabled,
        thinkingBudget: thinkingEnabled ? thinkingBudget : undefined,
      })

      try {
        // 构建请求参数
        const requestParams: Anthropic.MessageStreamParams = {
          model: resolveModelName(params.model.model, config.baseURL),
          max_tokens: params.model.maxTokens || DEFAULT_MAX_TOKENS,
          system: params.system,
          messages: convertMessages(params.messages),
          tools: convertTools(params.tools),
        }

        // Extended Thinking 配置
        if (thinkingEnabled) {
          // 启用 thinking 时，temperature 必须为 1，不能设置其他值
          requestParams.thinking = {
            type: 'enabled',
            budget_tokens: thinkingBudget,
          }
          // 注意：启用 thinking 时不能设置 temperature
        } else if (!isProxyBaseURL(config.baseURL)) {
          // 仅原生 API 设置 temperature
          // 反代（copilot-api）可能自动启用 adaptive thinking，设置 temperature 会冲突
          requestParams.temperature = params.model.temperature
        }

        const stream = await withRetry(async () => {
          return client.messages.stream(requestParams, {
            signal: params.abortSignal,
          })
        })

        let textChunks = 0
        let toolCalls = 0
        let isInThinking = false

        for await (const event of stream) {
          if (event.type === "content_block_start") {
            const block = event.content_block
            if (block.type === "thinking") {
              // Thinking 块开始
              isInThinking = true
              logger.debug('Thinking 开始')
            } else if (block.type === "tool_use") {
              // Tool use 开始，但我们等待完整的消息
            }
          } else if (event.type === "content_block_delta") {
            const delta = event.delta
            if (delta.type === "thinking_delta") {
              // Thinking 内容流式输出
              yield { type: "thinking", text: (delta as Anthropic.ThinkingDelta).thinking }
            } else if (delta.type === "text_delta") {
              textChunks++
              yield { type: "text", text: delta.text }
            } else if (delta.type === "input_json_delta") {
              // Tool input streaming - 暂时忽略，等待完整的 tool_use
            }
          } else if (event.type === "content_block_stop") {
            if (isInThinking) {
              // Thinking 块结束
              isInThinking = false
              yield { type: "thinking_end" }
              logger.debug('Thinking 结束')
            }
          } else if (event.type === "message_stop") {
            // 消息结束
          }
        }

        // 获取最终消息
        const finalMessage = await stream.finalMessage()

        // 处理工具调用 + 提取 thinking 块（含 signature，用于消息回放）
        const thinkingBlocks: Array<{ type: "thinking"; thinking: string; signature: string }> = []
        for (const block of finalMessage.content) {
          if (block.type === "tool_use") {
            toolCalls++
            yield {
              type: "tool_call",
              id: block.id,
              name: block.name,
              args: block.input,
            }
          } else if (block.type === "thinking" && "signature" in block) {
            thinkingBlocks.push({
              type: "thinking",
              thinking: (block as { type: "thinking"; thinking: string; signature: string }).thinking,
              signature: (block as { type: "thinking"; thinking: string; signature: string }).signature,
            })
          }
        }

        logger.debug('流式调用完成', {
          textChunks,
          toolCalls,
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          cacheCreationTokens: finalMessage.usage.cache_creation_input_tokens,
          cacheReadTokens: finalMessage.usage.cache_read_input_tokens,
        })

        yield {
          type: "message_end",
          usage: {
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
            cacheCreationTokens: finalMessage.usage.cache_creation_input_tokens ?? undefined,
            cacheReadTokens: finalMessage.usage.cache_read_input_tokens ?? undefined,
          },
          stopReason: finalMessage.stop_reason as "end_turn" | "max_tokens" | "tool_use" | "stop_sequence" | undefined,
          thinkingBlocks: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
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
      const thinkingEnabled = params.model.thinking?.enabled
      const thinkingBudget = params.model.thinking?.budgetTokens || DEFAULT_THINKING_BUDGET

      logger.debug('开始非流式调用', {
        model: params.model.model,
        messageCount: params.messages.length,
        hasTools: !!params.tools,
        toolCount: params.tools?.length || 0,
        thinkingEnabled,
        thinkingBudget: thinkingEnabled ? thinkingBudget : undefined,
      })

      try {
        const convertedMessages = convertMessages(params.messages)
        const convertedTools = convertTools(params.tools)

        // 构建请求参数
        const requestParams: Anthropic.MessageCreateParams = {
          model: resolveModelName(params.model.model, config.baseURL),
          max_tokens: params.model.maxTokens || DEFAULT_MAX_TOKENS,
          system: params.system,
          messages: convertedMessages,
          tools: convertedTools,
        }

        // Extended Thinking 配置
        if (thinkingEnabled) {
          requestParams.thinking = {
            type: 'enabled',
            budget_tokens: thinkingBudget,
          }
          // 注意：启用 thinking 时不能设置 temperature
        } else if (!isProxyBaseURL(config.baseURL)) {
          // 仅原生 API 设置 temperature
          requestParams.temperature = params.model.temperature
        }

        const response = await client.messages.create(requestParams, {
          signal: params.abortSignal,
        })

        // 提取文本、工具调用和 thinking 内容
        let text = ""
        let thinking = ""
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
          } else if (block.type === "thinking") {
            thinking += (block as { type: "thinking"; thinking: string }).thinking
          }
        }

        logger.debug('非流式调用完成', {
          textLength: text.length,
          toolCallCount: toolCalls.length,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationTokens: response.usage.cache_creation_input_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens,
        })

        return {
          text,
          toolCalls,
          thinking: thinking || undefined,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            cacheCreationTokens: response.usage.cache_creation_input_tokens ?? undefined,
            cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
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
