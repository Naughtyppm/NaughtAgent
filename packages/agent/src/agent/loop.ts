/**
 * Agent Loop - 核心执行循环
 *
 * 实现 LLM → Tool → LLM 的循环执行
 *
 * 流程：
 * 1. 用户输入 → 构建消息
 * 2. 调用 LLM → 获取响应
 * 3. 如果有工具调用 → 执行工具 → 将结果加入消息 → 回到步骤 2
 * 4. 如果没有工具调用 → 返回最终响应
 */

import type { AgentDefinition, AgentEvent, AgentRunConfig, TokenUsage } from "./agent"
import { buildSystemPrompt } from "./prompt"
import { Tool } from "../tool/tool"
import { ToolRegistry } from "../tool/registry"
import type {
  LLMProvider,
  ToolDefinition,
  Message,
  ChatResult,
  MessageContent,
  TextContent,
  ImageContent,
  AudioContent,
  ToolUseContent,
  ToolResultContent,
} from "../provider"
import { DEFAULT_MODEL } from "../provider"
import type { Session } from "../session/session"
import {
  addMessage,
  updateUsage,
  type ContentBlock,
  type TextBlock,
  type ImageBlock,
  type AudioBlock,
  type ToolUseBlock,
  type ToolResultBlock,
} from "../session"

/**
 * Agent Loop 配置
 */
export interface AgentLoopConfig {
  /** Agent 定义 */
  definition: AgentDefinition
  /** 会话 */
  session: Session
  /** Provider 实例 */
  provider: LLMProvider
  /** 运行配置 */
  runConfig: AgentRunConfig
}

/**
 * 创建 Agent Loop
 */
export function createAgentLoop(config: AgentLoopConfig) {
  const { definition, session, provider, runConfig } = config
  const abortController = new AbortController()

  // 合并 abort 信号
  if (runConfig.abort) {
    runConfig.abort.addEventListener("abort", () => abortController.abort())
  }

  /**
   * 获取可用工具定义（给 LLM）
   */
  function getToolDefinitions(): ToolDefinition[] {
    return definition.tools
      .map((toolId) => {
        const tool = ToolRegistry.get(toolId)
        if (!tool) return null
        return {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters,
        }
      })
      .filter((t): t is ToolDefinition => t !== null)
  }

  /**
   * 执行单个工具调用
   */
  async function executeTool(
    toolCall: { id: string; name: string; args: unknown }
  ): Promise<{ result: Tool.Result; isError: boolean }> {
    const ctx: Tool.Context = {
      sessionID: runConfig.sessionId,
      cwd: runConfig.cwd,
      abort: abortController.signal,
    }

    try {
      const result = await ToolRegistry.execute(toolCall.name, toolCall.args, ctx)
      return { result, isError: false }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        result: {
          title: "Error",
          output: errorMessage,
        },
        isError: true,
      }
    }
  }

  /**
   * 将会话消息转换为 Provider 消息格式
   */
  function convertMessages(): Message[] {
    return session.messages.map((msg) => {
      if (msg.role === "user") {
        // 用户消息：提取文本、图片、音频或工具结果
        const contentParts: Array<TextContent | ImageContent | AudioContent> = []
        const toolResults: ToolResultContent[] = []

        for (const block of msg.content) {
          if (block.type === "text") {
            contentParts.push({ type: "text", text: block.text })
          } else if (block.type === "image") {
            contentParts.push({ type: "image", source: block.source })
          } else if (block.type === "audio") {
            contentParts.push({ type: "audio", source: block.source })
          } else if (block.type === "tool_result") {
            // 转换 content：如果是 ContentBlock[]，需要过滤并转换为 provider 支持的类型
            let content: string | Array<TextContent | ImageContent | AudioContent>
            if (typeof block.content === "string") {
              content = block.content
            } else {
              // 过滤出 provider 支持的内容类型
              content = block.content
                .filter((c): c is TextBlock | ImageBlock | AudioBlock => 
                  c.type === "text" || c.type === "image" || c.type === "audio"
                )
                .map((c) => {
                  if (c.type === "text") {
                    return { type: "text" as const, text: c.text }
                  } else if (c.type === "image") {
                    return { type: "image" as const, source: c.source }
                  } else {
                    return { type: "audio" as const, source: c.source }
                  }
                })
            }
            
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.tool_use_id,
              content,
              is_error: block.is_error,
            })
          }
        }

        // 如果有工具结果，返回数组格式（包含工具结果和其他内容）
        if (toolResults.length > 0) {
          const content: MessageContent = [...contentParts, ...toolResults]
          return { role: "user" as const, content }
        }

        // 如果有多模态内容（图片/音频），返回数组格式
        if (contentParts.length > 0 && contentParts.some(c => c.type !== "text")) {
          return { role: "user" as const, content: contentParts }
        }

        // 否则返回纯文本
        const textOnly = contentParts.filter((c): c is TextContent => c.type === "text")
        return { role: "user" as const, content: textOnly.map(c => c.text).join("") }
      } else {
        // 助手消息：转换内容块
        const content: Array<TextContent | ToolUseContent> = []

        for (const block of msg.content) {
          if (block.type === "text") {
            content.push({ type: "text", text: block.text })
          } else if (block.type === "tool_use") {
            content.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input,
            })
          }
        }

        return { role: "assistant" as const, content }
      }
    })
  }

  /**
   * 运行 Agent Loop
   */
  async function* run(input: string): AsyncGenerator<AgentEvent> {
    // 添加用户消息
    addMessage(session, "user", [{ type: "text", text: input }])

    const systemPrompt = buildSystemPrompt(definition, { cwd: runConfig.cwd })
    const tools = getToolDefinitions()
    const modelConfig = definition.model || DEFAULT_MODEL

    let stepCount = 0
    const maxSteps = definition.maxSteps || 100
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

    while (stepCount < maxSteps) {
      stepCount++

      // 检查是否被中止
      if (abortController.signal.aborted) {
        yield { type: "error", error: new Error("Agent execution aborted") }
        break
      }

      // 调用 LLM
      const messages = convertMessages()
      let response: ChatResult

      try {
        response = await provider.chat({
          model: modelConfig,
          messages,
          system: systemPrompt,
          tools: tools.length > 0 ? tools : undefined,
          abortSignal: abortController.signal,
        })
      } catch (error) {
        yield {
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        }
        break
      }

      // 更新 token 使用
      totalUsage.inputTokens += response.usage.inputTokens
      totalUsage.outputTokens += response.usage.outputTokens
      updateUsage(session, response.usage)

      // 构建助手消息内容
      const assistantContent: ContentBlock[] = []

      // 添加文本响应
      if (response.text) {
        assistantContent.push({ type: "text", text: response.text })
        yield { type: "text", content: response.text }
      }

      // 添加工具调用
      for (const toolCall of response.toolCalls) {
        const toolUseBlock: ToolUseBlock = {
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.args,
        }
        assistantContent.push(toolUseBlock)
      }

      // 保存助手消息
      if (assistantContent.length > 0) {
        addMessage(session, "assistant", assistantContent)
      }

      // 如果没有工具调用，结束循环
      if (response.toolCalls.length === 0) {
        break
      }

      // 执行工具调用
      const toolResults: ContentBlock[] = []

      for (const toolCall of response.toolCalls) {
        yield {
          type: "tool_start",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.args,
        }

        const { result, isError } = await executeTool(toolCall)

        yield {
          type: "tool_end",
          id: toolCall.id,
          result,
          isError,
        }

        const toolResultBlock: ToolResultBlock = {
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: result.output,
          is_error: isError ? true : undefined,
        }
        toolResults.push(toolResultBlock)
      }

      // 添加工具结果作为用户消息（Anthropic 格式要求）
      if (toolResults.length > 0) {
        addMessage(session, "user", toolResults)
      }
    }

    // 检查是否达到最大步数
    if (stepCount >= maxSteps) {
      yield {
        type: "error",
        error: new Error(`Agent reached maximum steps limit (${maxSteps})`),
      }
    }

    yield { type: "done", usage: totalUsage }
  }

  /**
   * 中止执行
   */
  function abort() {
    abortController.abort()
  }

  return {
    run,
    abort,
  }
}

/**
 * Agent Loop 类型
 */
export type AgentLoop = ReturnType<typeof createAgentLoop>
