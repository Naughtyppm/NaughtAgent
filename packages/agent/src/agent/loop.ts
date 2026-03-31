/**
 * Agent Loop - 核心执行循环
 *
 * 实现 LLM → Tool → LLM 的循环执行
 * 约 200 行，所有工程逻辑（compact、nag、error recovery 策略）在 Runner 层处理
 */

import type { AgentDefinition, AgentEvent, AgentRunConfig, TokenUsage } from "./agent"
import { buildSystemPrompt } from "./prompt"
import { ToolRegistry, ToolRegistryCompat, type ExecutionContext, type PermissionChecker } from "../tool/registry"
import { createOutputTruncator } from "../tool/output-truncator"
import { AgentError, ErrorCode } from "../error"
import { Logger } from "../logging"
import type { LLMProvider, ToolDefinition } from "../provider"
import { DEFAULT_MODEL } from "../provider"
import type { Session } from "../session/session"
import {
  addMessage,
  updateUsage,
  type ContentBlock,
  type ToolUseBlock,
  type ToolResultBlock,
  type StopReason,
} from "../session"
import { convertSessionMessages } from "./message-converter"
import { DEFAULT_MAX_STEPS, MAX_CONSECUTIVE_ERRORS } from "../config"

const logger = new Logger('agent-loop')

// ─── 配置 ────────────────────────────────────────────

export interface AgentLoopConfig {
  definition: AgentDefinition
  session: Session
  provider: LLMProvider
  runConfig: AgentRunConfig
  /** 工具注册表实例（不传则用全局兼容实例） */
  toolRegistry?: ToolRegistry
  /** 权限检查器 */
  permissionChecker?: PermissionChecker
  depth?: number
  sharedContextId?: string
  /** 后台通知队列 */
  backgroundNotifications?: Array<{ taskId: string; command: string; output: string; error?: string }>
  /** 每轮前回调（compact、nag 等工程逻辑在这里注入） */
  onBeforeStep?: (ctx: { session: Session; stepCount: number; provider: LLMProvider }) => Promise<void>
  /** 传递给工具的扩展元数据（如 session/summarizer 供 compact 工具使用） */
  toolMeta?: Record<string, unknown>
  /** 最大连续错误数（默认 3） */
  maxConsecutiveErrors?: number
}

// ─── 工具定义转换 ─────────────────────────────────────

function getToolDefinitions(
  toolIds: string[],
  registry: ToolRegistry,
): ToolDefinition[] {
  const defs: ToolDefinition[] = []
  for (const id of toolIds) {
    const tool = registry.get(id)
    if (tool) {
      defs.push({
        name: tool.id,
        description: tool.description,
        // Tool.Definition.parameters 是 ZodType，ToolDefinition 要求 ZodObject
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parameters: tool.parameters as any,
      })
    }
  }
  return defs
}

// ─── 核心 Loop ───────────────────────────────────────

export function createAgentLoop(config: AgentLoopConfig) {
  const { definition, session, provider, runConfig } = config
  const registry = config.toolRegistry ?? ToolRegistryCompat.getInstance()
  const abortController = new AbortController()
  const truncator = createOutputTruncator()
  const maxErrors = config.maxConsecutiveErrors ?? MAX_CONSECUTIVE_ERRORS

  // 合并外部 abort 信号
  if (runConfig.abort) {
    runConfig.abort.addEventListener("abort", () => abortController.abort(), { once: true })
  }

  async function* run(input: string): AsyncGenerator<AgentEvent> {
    // 添加用户消息
    addMessage(session, "user", [{ type: "text", text: input }])

    const systemPrompt = buildSystemPrompt(definition, { cwd: runConfig.cwd })
    const tools = getToolDefinitions(definition.tools, registry)
    const modelConfig = definition.model || DEFAULT_MODEL

    let stepCount = 0
    const maxSteps = definition.maxSteps || DEFAULT_MAX_STEPS
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
    let consecutiveErrors = 0
    let lastStopReason: StopReason | undefined
    // 重复工具调用检测：key = "toolName:argsHash" → 调用次数
    const toolCallCounts = new Map<string, number>()
    const MAX_DUPLICATE_CALLS = 3

    while (stepCount < maxSteps) {
      stepCount++
      logger.debug(`step ${stepCount}`, { messageCount: session.messages.length })

      // 中止检查
      if (abortController.signal.aborted) {
        yield { type: "error", error: new AgentError("Agent execution aborted", ErrorCode.INTERNAL_ERROR, false) }
        break
      }

      // 后台通知注入
      const notifications = config.backgroundNotifications
      if (notifications && notifications.length > 0) {
        const drained = notifications.splice(0)
        const text = `<background-results>\n${drained.map(n =>
          `[${n.taskId}] ${n.command}\n${n.error ? `Error: ${n.error}` : n.output}`
        ).join('\n---\n')}\n</background-results>`
        addMessage(session, "user", [{ type: "text", text }])
        addMessage(session, "assistant", [{ type: "text", text: "Noted background results." }])
      }

      // 工程层回调（compact、nag 等）
      if (config.onBeforeStep) {
        await config.onBeforeStep({ session, stepCount, provider })
      }

      // ─── LLM 流式调用 ───
      const messages = convertSessionMessages(session)
      let responseText = ""
      const toolCalls: { id: string; name: string; args: unknown }[] = []
      let usage = { inputTokens: 0, outputTokens: 0 }
      lastStopReason = undefined

      try {
        for await (const event of provider.stream({
          model: modelConfig,
          messages,
          system: systemPrompt,
          tools: tools.length > 0 ? tools : undefined,
          abortSignal: abortController.signal,
        })) {
          if (abortController.signal.aborted) break

          switch (event.type) {
            case 'thinking':
              yield { type: "thinking", content: event.text }
              break
            case 'thinking_end':
              yield { type: "thinking_end" }
              break
            case 'text':
              responseText += event.text
              // 增量输出（delta），同时保持兼容的累积输出
              yield { type: "text_delta", delta: event.text }
              yield { type: "text", content: responseText }
              break
            case 'tool_call':
              toolCalls.push({ id: event.id, name: event.name, args: event.args })
              break
            case 'message_end':
              usage = event.usage
              lastStopReason = event.stopReason as StopReason | undefined
              break
            case 'error':
              throw event.error
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) break
        const agentError = error instanceof AgentError ? error
          : new AgentError(error instanceof Error ? error.message : String(error), ErrorCode.API_ERROR, false, { originalError: error })
        yield { type: "error", error: agentError }
        break
      }

      // Token 统计
      totalUsage.inputTokens += usage.inputTokens
      totalUsage.outputTokens += usage.outputTokens
      updateUsage(session, usage)

      // 保存 assistant 消息（含 stop_reason）
      const assistantContent: ContentBlock[] = []
      if (responseText) assistantContent.push({ type: "text", text: responseText })
      for (const tc of toolCalls) {
        assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args } as ToolUseBlock)
      }
      if (assistantContent.length > 0) {
        const msg = addMessage(session, "assistant", assistantContent)
        if (msg && lastStopReason) msg.stop_reason = lastStopReason
      }

      // max_tokens 截断警告
      if (lastStopReason === "max_tokens") {
        logger.warn('LLM 响应被 max_tokens 截断', { stepCount, outputTokens: usage.outputTokens })
      }

      // 无工具调用 → 结束
      if (toolCalls.length === 0) break

      // ─── 执行工具 ───
      const toolResults: ContentBlock[] = []
      const ctx: ExecutionContext = {
        sessionID: runConfig.sessionId,
        cwd: runConfig.cwd,
        abort: abortController.signal,
        depth: config.depth ?? 0,
        sharedContextId: config.sharedContextId,
        permissionChecker: config.permissionChecker,
        meta: config.toolMeta,
      }

      for (const toolCall of toolCalls) {
        yield { type: "tool_start", id: toolCall.id, name: toolCall.name, input: toolCall.args }
        logger.debug(`executing tool: ${toolCall.name}`, { id: toolCall.id, argsKeys: Object.keys(toolCall.args || {}) })

        const result = await registry.execute(toolCall.name, toolCall.args, ctx)
        const isError = result.isError ?? false

        // 输出截断
        if (result.output) {
          const truncated = truncator.truncate(result.output)
          if (truncated.truncated) result.output = truncated.output
        }

        // 重复调用检测：相同工具+参数超过 N 次注入警告
        const argsKey = `${toolCall.name}:${JSON.stringify(toolCall.args)}`
        const callCount = (toolCallCounts.get(argsKey) || 0) + 1
        toolCallCounts.set(argsKey, callCount)
        if (callCount > MAX_DUPLICATE_CALLS) {
          result.output = `⚠️ WARNING: You have called ${toolCall.name} with the same arguments ${callCount} times. ` +
            `The content is already in your context. ` +
            `STOP re-reading and proceed with the task. ` +
            `If you need file content, it was returned in a previous tool call.\n\n` +
            result.output
          logger.warn(`duplicate tool call detected: ${toolCall.name} (${callCount}x)`, { argsKey })
        }

        yield { type: "tool_end", id: toolCall.id, result, isError }

        // 错误追踪
        if (isError) {
          consecutiveErrors++
          if (consecutiveErrors >= maxErrors) {
            result.output += `\n\n🛑 连续 ${consecutiveErrors} 次工具错误，Agent 将停止。`
          }
        } else {
          consecutiveErrors = 0
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: result.output,
          is_error: isError || undefined,
        } as ToolResultBlock)
      }

      // 工具结果回写
      if (toolResults.length > 0) {
        addMessage(session, "user", toolResults)
      }

      // 连续错误终止
      if (consecutiveErrors >= maxErrors) {
        yield { type: "error", error: new AgentError(
          `Agent stopped: ${consecutiveErrors} consecutive tool errors`,
          ErrorCode.INTERNAL_ERROR, false,
        ) }
        break
      }
    }

    // 最大步数检查
    if (stepCount >= maxSteps) {
      yield { type: "error", error: new AgentError(
        `Agent reached maximum steps limit (${maxSteps})`,
        ErrorCode.INTERNAL_ERROR, false,
      ) }
    }

    yield { type: "done", usage: totalUsage, stopReason: lastStopReason }
  }

  function abort() {
    abortController.abort()
  }

  return { run, abort }
}

export type AgentLoop = ReturnType<typeof createAgentLoop>
