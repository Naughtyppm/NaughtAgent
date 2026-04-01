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
  /** Reactive compact 回调：API 返回 413 (prompt too long) 时触发压缩，返回 true 表示已压缩可重试 */
  onReactiveCompact?: (session: Session) => Promise<boolean>
}

// ─── 工具定义转换 ─────────────────────────────────────

/** 解析动态 description：如果是函数则调用，否则直接返回字符串 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDescription(desc: string | ((ctx?: any) => string), context?: { cwd?: string; depth?: number }): string {
  return typeof desc === 'function' ? desc(context) : desc
}

function getToolDefinitions(
  toolIds: string[],
  registry: ToolRegistry,
  context?: { cwd?: string; depth?: number },
): ToolDefinition[] {
  const defs: ToolDefinition[] = []
  for (const id of toolIds) {
    const tool = registry.get(id)
    if (tool) {
      defs.push({
        name: tool.id,
        description: resolveDescription(tool.description, context),
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
    const tools = getToolDefinitions(definition.tools, registry, { cwd: runConfig.cwd, depth: config.depth })
    const modelConfig = definition.model || DEFAULT_MODEL

    let stepCount = 0
    const maxSteps = definition.maxSteps || DEFAULT_MAX_STEPS
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
    let consecutiveErrors = 0
    let lastStopReason: StopReason | undefined
    // 重复工具调用检测：key = "toolName:argsHash" → 调用次数
    const toolCallCounts = new Map<string, number>()
    const MAX_DUPLICATE_CALLS = 3
    // 写操作计数器（验证子代理触发用）
    const WRITE_TOOLS = new Set(['write', 'edit', 'append'])
    let writeOpCount = 0

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

      // StreamingToolExecutor: stream 期间提前启动并行安全工具
      const earlyExecutions = new Map<string, Promise<{ output: string; isError?: boolean; title: string; metadata?: Record<string, unknown> }>>()

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
            case 'tool_call': {
              toolCalls.push({ id: event.id, name: event.name, args: event.args })
              // StreamingToolExecutor: 并行安全工具在 stream 期间提前启动
              const toolDef = registry.get(event.name)
              const isSafe = toolDef?.isConcurrencySafe
              const safe = typeof isSafe === 'function' ? isSafe(event.args) : (isSafe === true)
              if (safe) {
                const earlyCtx: ExecutionContext = {
                  sessionID: runConfig.sessionId,
                  cwd: runConfig.cwd,
                  abort: abortController.signal,
                  depth: config.depth ?? 0,
                  sharedContextId: config.sharedContextId,
                  permissionChecker: config.permissionChecker,
                  meta: config.toolMeta,
                }
                earlyExecutions.set(event.id, registry.execute(event.name, event.args, earlyCtx).catch(err => ({
                  title: event.name,
                  output: `Error: ${err instanceof Error ? err.message : String(err)}`,
                  isError: true as const,
                })))
                logger.debug(`streaming tool executor: started early execution of ${event.name}`, { id: event.id })
              }
              break
            }
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

        // ─── Reactive Compact：413 prompt too long → 强制压缩 → 重试 ───
        const errorMsg = error instanceof Error ? error.message : String(error)
        const is413 = errorMsg.includes('413') || errorMsg.includes('prompt is too long') ||
          errorMsg.includes('prompt_too_long') || errorMsg.includes('context_length_exceeded')
        if (is413 && config.onReactiveCompact) {
          logger.warn('API 返回 prompt too long，触发 reactive compact', { stepCount })
          yield { type: "thinking", content: "Context too large, compressing conversation..." }
          const compacted = await config.onReactiveCompact(session)
          if (compacted) {
            stepCount-- // 回退步数，让 while 重新执行这一轮
            continue
          }
        }

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

      // 工具调用后处理（截断、重复检测、错误追踪）
      const postProcess = (toolCall: { id: string; name: string; args: unknown }, result: { output: string; isError?: boolean; title: string; metadata?: Record<string, unknown> }) => {
        const isError = result.isError ?? false
        if (result.output) {
          const truncated = truncator.truncate(result.output)
          if (truncated.truncated) result.output = truncated.output
        }
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
        if (isError) {
          consecutiveErrors++
          if (consecutiveErrors >= maxErrors) {
            result.output += `\n\n🛑 连续 ${consecutiveErrors} 次工具错误，Agent 将停止。`
          }
        } else {
          consecutiveErrors = 0
        }
        return isError
      }

      // ─── 并行分区：按 isConcurrencySafe 将工具调用分为并行安全和串行两组 ───
      const concurrentCalls: typeof toolCalls = []
      const serialCalls: typeof toolCalls = []

      for (const tc of toolCalls) {
        // 已经在 streaming 期间启动的工具归入 concurrent
        if (earlyExecutions.has(tc.id)) {
          concurrentCalls.push(tc)
        } else {
          const toolDef = registry.get(tc.name)
          const isSafe = toolDef?.isConcurrencySafe
          const safe = typeof isSafe === 'function' ? isSafe(tc.args) : (isSafe === true)
          if (safe) {
            concurrentCalls.push(tc)
          } else {
            serialCalls.push(tc)
          }
        }
      }

      // 1) 并行执行安全工具（优先使用 streaming 期间已启动的结果）
      if (concurrentCalls.length > 0) {
        for (const tc of concurrentCalls) {
          yield { type: "tool_start", id: tc.id, name: tc.name, input: tc.args }
        }
        const earlyCount = concurrentCalls.filter(tc => earlyExecutions.has(tc.id)).length
        logger.debug(`executing ${concurrentCalls.length} tool(s) in parallel (${earlyCount} started during stream)`, {
          tools: concurrentCalls.map(tc => tc.name),
        })

        const parallelResults = await Promise.all(
          concurrentCalls.map(async (tc) => {
            // 优先使用 streaming 期间已启动的执行结果
            const early = earlyExecutions.get(tc.id)
            if (early) return early
            // 未提前启动的，现在启动
            try {
              return await registry.execute(tc.name, tc.args, ctx)
            } catch (err) {
              return {
                title: tc.name,
                output: `Error: ${err instanceof Error ? err.message : String(err)}`,
                isError: true,
              }
            }
          })
        )

        for (let i = 0; i < concurrentCalls.length; i++) {
          const tc = concurrentCalls[i]
          const result = parallelResults[i]
          const isError = postProcess(tc, result)
          yield { type: "tool_end", id: tc.id, result, isError }
          toolResults.push({
            type: "tool_result",
            tool_use_id: tc.id,
            content: result.output,
            is_error: isError || undefined,
          } as ToolResultBlock)
        }
      }

      // 2) 串行执行非安全工具
      for (const toolCall of serialCalls) {
        yield { type: "tool_start", id: toolCall.id, name: toolCall.name, input: toolCall.args }
        logger.debug(`executing tool: ${toolCall.name}`, { id: toolCall.id, argsKeys: Object.keys(toolCall.args || {}) })

        const result = await registry.execute(toolCall.name, toolCall.args, ctx)
        const isError = postProcess(toolCall, result)

        yield { type: "tool_end", id: toolCall.id, result, isError }

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
        // 写操作计数
        for (const tc of [...concurrentCalls, ...serialCalls]) {
          if (WRITE_TOOLS.has(tc.name)) writeOpCount++
        }
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

    yield { type: "done", usage: totalUsage, stopReason: lastStopReason, writeOpCount }
  }

  function abort() {
    abortController.abort()
  }

  return { run, abort }
}

export type AgentLoop = ReturnType<typeof createAgentLoop>
