/**
 * Agent Loop - 核心执行循环
 *
 * 实现 LLM → Tool → LLM 的循环执行
 * 约 200 行，所有工程逻辑（compact、nag、error recovery 策略）在 Runner 层处理
 */

import type { AgentDefinition, AgentEvent, AgentRunConfig, TokenUsage } from "./agent"
import { buildSystemPrompt } from "./prompt"
import { ToolRegistry, type ExecutionContext, type PermissionChecker } from "../tool/registry"
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
import { DEFAULT_MAX_STEPS, MAX_CONSECUTIVE_ERRORS, MAX_TOKENS_RECOVERY_LIMIT } from "../config"

const logger = new Logger('agent-loop')

// ─── 配置 ────────────────────────────────────────────

export interface AgentLoopConfig {
  definition: AgentDefinition
  session: Session
  provider: LLMProvider
  runConfig: AgentRunConfig
  /** 工具注册表实例（必传，禁止回退到全局实例） */
  toolRegistry: ToolRegistry
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
  /** 持久模式：LLM 回复完后等待用户输入，而非退出 loop。返回 null 或 "/quit" 退出 */
  waitForInput?: () => Promise<string | null>
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
  const registry = config.toolRegistry
  const abortController = new AbortController()
  const truncator = createOutputTruncator()
  const maxErrors = config.maxConsecutiveErrors ?? MAX_CONSECUTIVE_ERRORS

  // 合并外部 abort 信号
  if (runConfig.abort) {
    runConfig.abort.addEventListener("abort", () => abortController.abort(), { once: true })
  }

  async function* run(input: string | ContentBlock[]): AsyncGenerator<AgentEvent> {
    // 添加用户消息
    const content: ContentBlock[] = typeof input === "string"
      ? [{ type: "text", text: input }]
      : input
    addMessage(session, "user", content)

    const systemPrompt = buildSystemPrompt(definition, { cwd: runConfig.cwd, model: definition.model?.model })
    const tools = getToolDefinitions(definition.tools, registry, { cwd: runConfig.cwd, depth: config.depth })
    const modelConfig = definition.model || DEFAULT_MODEL

    let stepCount = 0
    const maxSteps = definition.maxSteps || DEFAULT_MAX_STEPS
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
    let consecutiveErrors = 0
    let lastStopReason: StopReason | undefined
    // max_tokens 恢复计数器（CC: MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3）
    let maxTokensRecoveryCount = 0
    // 重复工具调用检测：key = "toolName:argsHash" → 调用次数
    const toolCallCounts = new Map<string, number>()
    const MAX_DUPLICATE_CALLS = 3       // 软警告阈值
    const HARD_BLOCK_THRESHOLD = 10     // 硬阻断阈值：超过此次数不执行工具
    // 写操作计数器（验证子代理触发用）
    const WRITE_TOOLS = new Set(['write', 'edit', 'append'])
    let writeOpCount = 0
    // 全局重复阻断计数：当硬阻断触发累计 N 次，强制注入系统提示终止循环
    let globalDuplicateBlockCount = 0
    const CIRCUIT_BREAKER_THRESHOLD = 5  // 累计 5 次硬阻断后触发熔断
    // question 工具提醒：end_turn 时如果没调用 question，给 1 次提醒机会
    let questionReminderUsed = false

    while (true) {
      // 最大步数检查（移入循环内部，便于持久模式重置后继续）
      if (stepCount >= maxSteps) {
        if (config.waitForInput) {
          yield { type: "error", error: new AgentError(
            `已达 ${maxSteps} 步上限，等待用户指令`,
            ErrorCode.INTERNAL_ERROR, false,
          ) }
          yield { type: "await_input", usage: totalUsage }
          const nextInput = await config.waitForInput()
          if (!nextInput || nextInput.trim() === '/quit') break
          addMessage(session, "user", [{ type: "text", text: nextInput }])
          stepCount = 0
          consecutiveErrors = 0
          maxTokensRecoveryCount = 0
        } else {
          yield { type: "error", error: new AgentError(
            `Agent reached maximum steps limit (${maxSteps})`,
            ErrorCode.INTERNAL_ERROR, false,
          ) }
          break
        }
      }
      stepCount++
      logger.debug(`step ${stepCount}`, { messageCount: session.messages.length })

      // 中止检查
      if (abortController.signal.aborted) {
        yield { type: "error", error: new AgentError("Agent execution aborted", ErrorCode.INTERNAL_ERROR, false) }
        break
      }

      // 循环熔断：累计硬阻断超过阈值，注入强制跳出指令
      if (globalDuplicateBlockCount >= CIRCUIT_BREAKER_THRESHOLD) {
        logger.error(`circuit breaker triggered: ${globalDuplicateBlockCount} hard-blocks accumulated`)
        const blockedTools = [...toolCallCounts.entries()]
          .filter(([, count]) => count > HARD_BLOCK_THRESHOLD)
          .map(([key, count]) => `  - ${key.split(':')[0]} (${count}x)`)
          .join('\n')
        addMessage(session, "user", [{
          type: "text",
          text: `🚨 CIRCUIT BREAKER: You are stuck in an infinite read loop. ${globalDuplicateBlockCount} tool calls have been hard-blocked.\n` +
            `Blocked tools:\n${blockedTools}\n\n` +
            `You MUST stop reading files and take action NOW:\n` +
            `1. Summarize what you have learned from the files you already read\n` +
            `2. Propose your solution or changes to the user\n` +
            `3. If you cannot proceed, explain what is blocking you and ask the user for help\n\n` +
            `DO NOT call read, glob, or grep again until you have produced output or asked the user a question.`,
        }])
        // 重置计数器给 LLM 一次机会（同时清零 toolCallCounts 避免死循环）
        globalDuplicateBlockCount = 0
        toolCallCounts.clear()
      }

      // 后台通知注入
      const notifications = config.backgroundNotifications
      if (notifications && notifications.length > 0) {
        const drained = notifications.splice(0)
        const text = `<background-results>\n${drained.map(n =>
          `[${n.taskId}] ${n.command}\n${n.error ? `Error: ${n.error}` : n.output}`
        ).join('\n---\n')}\n</background-results>`
        addMessage(session, "user", [{ type: "text", text }])
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
      let thinkingBlocks: Array<{ type: "thinking"; thinking: string; signature: string }> | undefined
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
              thinkingBlocks = event.thinkingBlocks
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

        // ─── 429/529/503 可恢复错误：等待后重试（参照 CC retry-after 机制） ───
        const isRetryable = errorMsg.includes('429') || errorMsg.includes('529') ||
          errorMsg.includes('503') || errorMsg.includes('rate_limit') ||
          errorMsg.includes('overloaded') || errorMsg.includes('too many requests')
        if (isRetryable) {
          // 解析 retry-after 头（如果错误消息中包含）
          const retryAfterMatch = errorMsg.match(/retry.?after[:\s]*(\d+)/i)
          const waitSec = retryAfterMatch ? Math.min(parseInt(retryAfterMatch[1], 10), 60) : 10
          logger.warn(`API 可恢复错误，等待 ${waitSec}s 后重试`, { stepCount, errorMsg: errorMsg.substring(0, 200) })
          yield { type: "thinking", content: `API rate limited/overloaded, waiting ${waitSec}s...` }
          await new Promise(resolve => setTimeout(resolve, waitSec * 1000))
          stepCount-- // 回退步数重试
          continue
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
      // 重要：启用 thinking 时，Anthropic API 要求 assistant 消息以 thinking 块开头
      // 使用 provider 返回的完整 thinking 块（含 signature），而非手动累积的文本
      const assistantContent: ContentBlock[] = []
      if (thinkingBlocks && thinkingBlocks.length > 0) {
        for (const tb of thinkingBlocks) {
          assistantContent.push({ type: "thinking", thinking: tb.thinking, signature: tb.signature })
        }
      }
      if (responseText) assistantContent.push({ type: "text", text: responseText })
      for (const tc of toolCalls) {
        assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args } as ToolUseBlock)
      }
      if (assistantContent.length > 0) {
        const msg = addMessage(session, "assistant", assistantContent)
        if (msg && lastStopReason) msg.stop_reason = lastStopReason
      }

      // ─── max_tokens 恢复机制（参照 CC MAX_OUTPUT_TOKENS_RECOVERY_LIMIT） ───
      if (lastStopReason === "max_tokens" && toolCalls.length === 0) {
        if (maxTokensRecoveryCount < MAX_TOKENS_RECOVERY_LIMIT) {
          maxTokensRecoveryCount++
          logger.warn(`max_tokens 截断，恢复尝试 ${maxTokensRecoveryCount}/${MAX_TOKENS_RECOVERY_LIMIT}`, {
            stepCount, outputTokens: usage.outputTokens
          })
          // 注入恢复元消息让 LLM 继续输出
          addMessage(session, "user", [{
            type: "text",
            text: "Your response was cut off due to length limits. Resume EXACTLY where you left off — continue the output directly without repeating what was already said.",
          }])
          yield { type: "thinking", content: `[Output truncated, resuming... (${maxTokensRecoveryCount}/${MAX_TOKENS_RECOVERY_LIMIT})]` }
          continue // 重新进入循环
        }
        logger.warn('max_tokens 恢复次数已用尽，终止', { maxTokensRecoveryCount })
      }

      // 无工具调用 → 结束或等待用户输入
      if (toolCalls.length === 0) {
        if (config.waitForInput) {
          // 持久模式：检查 LLM 是否应该调用 question 工具
          // 如果 question 工具可用但 LLM 跳过了，给 1 次自动提醒
          const hasQuestionTool = definition.tools.includes('question')
          if (hasQuestionTool && !questionReminderUsed) {
            questionReminderUsed = true
            logger.warn('LLM end_turn without calling question tool, injecting reminder')
            addMessage(session, "user", [{
              type: "text",
              text: "⚠️ You forgot to call the `question` tool. You MUST call `question` before ending your turn. Call it now with type:\"confirm\" to ask the user if they need anything else.",
            }])
            continue
          }
          // 提醒已用过或没有 question 工具，正常 await_input
          questionReminderUsed = false // 重置供下一轮用户输入后使用
          yield { type: "await_input", usage: totalUsage }
          const nextInput = await config.waitForInput()
          if (!nextInput || nextInput.trim() === '/quit') {
            break
          }
          addMessage(session, "user", [{ type: "text", text: nextInput }])
          // 重置恢复计数器
          maxTokensRecoveryCount = 0
          consecutiveErrors = 0
          continue
        }
        break
      }

      // LLM 调用了工具（包括 question），重置 question 提醒
      questionReminderUsed = false

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
        // 重复检测 key：对 read 工具只按 filePath 做 key，忽略 offset/limit 变化
        // 对 grep 单文件搜索也按 path 归类，防止不同 pattern 绕过检测
        // 对 write/append 按 filePath 归类，防止 LLM 反复写同一文件
        // 防止 LLM 通过变换参数绕过重复检测
        let argsKey: string
        if (toolCall.name === 'read' && toolCall.args && typeof toolCall.args === 'object' && 'filePath' in toolCall.args) {
          argsKey = `read:${(toolCall.args as { filePath: string }).filePath}`
        } else if (toolCall.name === 'grep' && toolCall.args && typeof toolCall.args === 'object' && 'path' in toolCall.args) {
          argsKey = `grep:${(toolCall.args as { path: string }).path}`
        } else if ((toolCall.name === 'write' || toolCall.name === 'append') && toolCall.args && typeof toolCall.args === 'object' && 'filePath' in toolCall.args) {
          argsKey = `${toolCall.name}:${(toolCall.args as { filePath: string }).filePath}`
        } else {
          argsKey = `${toolCall.name}:${JSON.stringify(toolCall.args)}`
        }
        const callCount = (toolCallCounts.get(argsKey) || 0) + 1
        toolCallCounts.set(argsKey, callCount)
        if (callCount > HARD_BLOCK_THRESHOLD) {
          // 硬阻断：不返回文件内容，只返回错误摘要，强制 LLM 跳出循环
          result.output = `🛑 BLOCKED: You have called ${toolCall.name} with the same arguments ${callCount} times (limit: ${HARD_BLOCK_THRESHOLD}). ` +
            `The content was already returned in previous tool calls and is in your context. ` +
            `DO NOT call this tool again with these arguments. ` +
            `Proceed to the NEXT step of your task immediately: write code, propose a plan, or ask the user for clarification.`
          result.isError = true
          logger.error(`hard-blocked duplicate tool call: ${toolCall.name} (${callCount}x)`, { argsKey })
          // 累计全局重复计数，用于触发熔断
          globalDuplicateBlockCount++
        } else if (callCount > MAX_DUPLICATE_CALLS) {
          result.output = `⚠️ WARNING: You have called ${toolCall.name} with the same arguments ${callCount} times. ` +
            `The content is already in your context. ` +
            `STOP re-reading and proceed with the task. ` +
            `If you need file content, it was returned in a previous tool call.\n\n` +
            result.output
          logger.warn(`duplicate tool call detected: ${toolCall.name} (${callCount}x)`, { argsKey })
        }
        if (isError) {
          consecutiveErrors++
          // 权限拒绝特殊处理：注入恢复提示
          if (result.output.includes('Permission denied')) {
            result.output += `\n\n💡 提示：此工具被权限系统拒绝。你可以尝试：\n` +
              `1. 换一种方式完成任务（如用其他工具）\n` +
              `2. 告知用户需要此权限，请求批准\n` +
              `3. 跳过此操作继续其他任务`
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

        let result: { output: string; isError?: boolean; title: string; metadata?: Record<string, unknown> }
        try {
          result = await registry.execute(toolCall.name, toolCall.args, ctx)
        } catch (err) {
          result = {
            title: toolCall.name,
            output: `Error: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          }
        }
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

      // ─── question 工具 cancelled 检测 ───
      // 如果 question 工具返回 cancelled（回调不存在或前端无响应），不能让 LLM 继续自嗨
      // 而应该切换到 await_input 等待真正的用户输入
      const allToolCalls = [...concurrentCalls, ...serialCalls]
      const questionCall = allToolCalls.find(tc => tc.name === 'question')
      if (questionCall) {
        // 在 toolResults 中找到对应的 question 结果
        const questionResultBlock = toolResults.find(tr =>
          'tool_use_id' in tr && tr.tool_use_id === questionCall.id
        )
        if (questionResultBlock && 'content' in questionResultBlock) {
          const content = String(questionResultBlock.content)
          if (content.includes('Question cancelled') || content.includes('Question not answered')) {
            logger.warn('question tool returned cancelled/not-answered, switching to await_input')
            if (config.waitForInput) {
              yield { type: "await_input", usage: totalUsage }
              const nextInput = await config.waitForInput()
              if (!nextInput || nextInput.trim() === '/quit') {
                break
              }
              addMessage(session, "user", [{ type: "text", text: nextInput }])
              maxTokensRecoveryCount = 0
              consecutiveErrors = 0
              continue
            } else {
              // 没有 waitForInput 时直接结束循环
              yield { type: "await_input", usage: totalUsage }
              break
            }
          }
        }
      }

      // CC 模式：连续错误不终止循环，注入恢复提示让模型自行修正
      if (consecutiveErrors >= maxErrors && consecutiveErrors % maxErrors === 0) {
        logger.warn(`consecutive errors reached ${consecutiveErrors}, injecting recovery prompt`, { maxErrors })
        addMessage(session, "user", [{
          type: "text",
          text: `⚠️ You have encountered ${consecutiveErrors} consecutive tool errors. ` +
            `Review the error messages above and try a DIFFERENT approach. ` +
            `If tools are not working, explain the situation to the user and ask for guidance. ` +
            `Do NOT repeat the same failing tool calls.`,
        }])
      }
    }

    yield { type: "done", usage: totalUsage, stopReason: lastStopReason, writeOpCount }
  }

  function abort() {
    abortController.abort()
  }

  return { run, abort }
}

export type AgentLoop = ReturnType<typeof createAgentLoop>
