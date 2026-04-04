/**
 * fork_agent 模式 - 继承父会话上下文的子 Agent
 *
 * 特点：
 * - 继承父会话的消息历史、上下文和工具权限
 * - 支持配置继承策略
 * - 自动管理 Token 预算，防止上下文过爆
 * - 结果可回传父会话
 */

import type {
  ForkAgentConfig,
  SubTaskResult,
  SubTaskStep,
  ParentContext,
} from "./types"
import {
  createAgentLoop,
  getAgentDefinition,
  type AgentType,
} from "../agent"
import { DEFAULT_MAX_TOKENS } from "../config"
import { ToolRegistry } from "../tool/registry"
import { createSession, type Message } from "../session"
import { createProviderFromEnv, createProvider } from "../provider"
import { createContextManager, type PreparedContext } from "./context"
import {
  generateSubAgentId,
  createSubAgentEmitter,
  type SubAgentEventListener,
} from "./events"
import { isContextOverflowError, emergencyCompact } from "./recovery"

/**
 * fork_agent 模式运行时配置
 */
export interface ForkAgentRuntime {
  /** 父会话上下文 */
  parentContext: ParentContext
  /** API Key（可选，如果不提供则尝试使用环境变量） */
  apiKey?: string
  /** API Base URL */
  baseURL?: string
  /** 固定模型（不能是 "auto"） */
  model?: string
  /** 事件监听器 - 用于向 UI 传递子 Agent 执行状态 */
  onEvent?: SubAgentEventListener
  /** 工具注册表实例（传递给子 Agent，确保子 Agent 能使用 read/write/edit 等基础工具） */
  toolRegistry?: ToolRegistry
}

/**
 * 将 PreparedContext 的消息转换为 Agent 可用的格式
 */
function buildInitialMessages(
  preparedContext: PreparedContext,
  userPrompt: string
): Message[] {
  const messages: Message[] = []

  // 添加上下文摘要作为系统消息（如果有）
  if (preparedContext.summary) {
    messages.push({
      id: `msg_summary_${Date.now()}`,
      role: "user",
      content: [
        {
          type: "text",
          text: `[父会话上下文摘要]\n${preparedContext.summary.summary}`,
        },
      ],
      timestamp: Date.now(),
    })

    messages.push({
      id: `msg_summary_ack_${Date.now()}`,
      role: "assistant",
      content: [
        {
          type: "text",
          text: "我已了解父会话的上下文。请告诉我需要完成的任务。",
        },
      ],
      timestamp: Date.now(),
    })
  }

  // 添加继承的消息历史
  for (const msg of preparedContext.messages) {
    messages.push(msg)
  }

  // 添加当前任务提示
  messages.push({
    id: `msg_task_${Date.now()}`,
    role: "user",
    content: [
      {
        type: "text",
        text: userPrompt,
      },
    ],
    timestamp: Date.now(),
  })

  return messages
}

/**
 * 执行 fork_agent 模式子任务
 */
export async function runForkAgent(
  config: ForkAgentConfig,
  runtime: ForkAgentRuntime
): Promise<SubTaskResult> {
  const startTime = Date.now()
  const steps: SubTaskStep[] = []

  // 生成子 Agent ID 并创建事件发射器
  const subAgentId = generateSubAgentId()
  const emit = createSubAgentEmitter(subAgentId, runtime.onEvent, "fork_agent")

  try {
    // 检查取消信号
    if (config.abort?.aborted) {
      emit.end(false, "", Date.now() - startTime, "Task was aborted")
      return {
        success: false,
        output: "",
        error: "Task was aborted",
        steps: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
      }
    }

    const { parentContext } = runtime
    const cwd = config.cwd || process.cwd()
    const maxTurns = config.maxTurns || 30

    // 1. 创建上下文管理器并准备上下文
    const contextManager = createContextManager({
      budget: config.tokenBudget,
    })

    const preparedContext = await contextManager.prepareForkContext(
      parentContext,
      config.inherit || {
        messages: true,
        context: true,
        tools: true,
        systemPrompt: true,
      }
    )

    // 2. 确定 Agent 类型和工具
    const agentType: AgentType = config.agentType || parentContext.agentType || "build"

    // 发送开始事件
    emit.start(config.prompt, agentType, maxTurns)

    // 发送配置事件，记录 fork_agent 启动配置
    emit.config({
      maxTurns,
      timeout: config.timeout,
      tools: config.tools,
      agentType,
    })

    // 3. 创建 Provider
    const provider = runtime.apiKey
      ? createProvider({
          type: "anthropic",
          config: { apiKey: runtime.apiKey, baseURL: runtime.baseURL },
        })
      : createProviderFromEnv()

    // 4. 获取 Agent 定义
    const definition = getAgentDefinition(agentType)

    // 如果指定了工具列表，过滤工具
    let filteredDefinition = definition
    const toolsToUse = config.tools || (config.inherit?.tools ? parentContext.tools : undefined)
    if (toolsToUse && toolsToUse.length > 0) {
      const allowedTools = new Set(toolsToUse)
      filteredDefinition = {
        ...definition,
        tools: definition.tools.filter((t) => allowedTools.has(t)),
      }
    }

    // 如果 runtime 指定了模型，覆盖默认模型
    if (runtime.model && runtime.model !== "auto") {
      filteredDefinition = {
        ...filteredDefinition,
        model: {
          provider: "auto",
          model: runtime.model,
          temperature: filteredDefinition.model?.temperature || 0,
          maxTokens: filteredDefinition.model?.maxTokens || DEFAULT_MAX_TOKENS,
        },
      }
    }

    // 5. 创建子会话
    const childSession = createSession({
      cwd,
      agentType,
    })

    // 6. 注入继承的消息
    const initialMessages = buildInitialMessages(preparedContext, config.prompt)
    for (const msg of initialMessages.slice(0, -1)) {
      // 最后一条是用户提示，不需要预先添加
      childSession.messages.push(msg)
    }

    // 7. 创建 Agent Loop - 传递 abort 信号
    const loop = createAgentLoop({
      definition: filteredDefinition,
      session: childSession,
      provider,
      runConfig: {
        sessionId: childSession.id,
        cwd,
        abort: config.abort,
      },
      depth: config.depth ?? 0,
      sharedContextId: config.sharedContextId,
      toolRegistry: runtime.toolRegistry ?? new ToolRegistry(),
    })

    // 8. 收集输出
    let output = ""
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let turnCount = 0
    let compactRetried = false

    // 重试循环：正常只跑一次，token 超限时 compact → 重试一次
    for (let attempt = 0; attempt < 2; attempt++) {
    // 每次重试重新创建 loop（session 已被 compact 压缩）
    const retryLoop = attempt === 0 ? loop : createAgentLoop({
      definition: filteredDefinition,
      session: childSession,
      provider,
      runConfig: { sessionId: childSession.id, cwd, abort: config.abort },
      depth: config.depth ?? 0,
      sharedContextId: config.sharedContextId,
      toolRegistry: runtime.toolRegistry ?? new ToolRegistry(),
    })

    // 工具执行计时
    const toolStartTimes = new Map<string, number>()
    let shouldRetry = false
    const loopInput = attempt === 0
      ? config.prompt
      : `[Context compressed due to token overflow. Continue:] ${config.prompt}`

    // 9. 运行 Agent Loop
    for await (const event of retryLoop.run(loopInput)) {
      // 检查取消信号
      if (config.abort?.aborted) {
        const duration = Date.now() - startTime
        emit.end(false, output, duration, "Task was aborted", { inputTokens: totalInputTokens, outputTokens: totalOutputTokens })
        return {
          success: false,
          output,
          error: "Task was aborted",
          steps,
          partial: steps.length > 0 || output.length > 0,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          duration,
          childSessionId: childSession.id,
        }
      }

      switch (event.type) {
        case "text":
          output += event.content
          // 发送文本事件
          emit.text(event.content)
          break

        case "tool_start":
          turnCount++
          // 记录工具开始时间
          toolStartTimes.set(event.id, Date.now())
          // 发送工具开始事件
          emit.toolStart(event.id, event.name, event.input)
          // 发送步骤进度
          emit.step(turnCount, maxTurns)
          steps.push({
            name: event.name,
            type: "tool",
            input: event.input,
            duration: 0,
            success: true,
          })
          break

        case "tool_end": {
          // 计算工具执行时间
          const toolStartTime = toolStartTimes.get(event.id) || Date.now()
          const toolDuration = Date.now() - toolStartTime
          // 发送工具结束事件（包含 timing 信息）
          emit.toolEnd(event.id, event.result.output, event.isError ?? false, toolDuration)
          // 更新最后一个步骤
          const lastStep = steps[steps.length - 1]
          if (lastStep) {
            lastStep.output = event.result.output
            lastStep.success = !event.isError
            lastStep.duration = toolDuration
            if (event.isError) {
              lastStep.error = event.result.output
            }
          }
          break
        }

        case "done":
          totalInputTokens = event.usage.inputTokens
          totalOutputTokens = event.usage.outputTokens
          break

        case "error":
          // === Token 超限恢复 ===
          if (!compactRetried && isContextOverflowError(event.error.message)) {
            compactRetried = true
            const compacted = await emergencyCompact(
              childSession, provider,
              filteredDefinition.model ? { model: filteredDefinition.model.model } : undefined,
            )
            if (compacted) {
              shouldRetry = true
              break
            }
          }
          emit.end(false, output, Date.now() - startTime, event.error.message, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens })
          return {
            success: false,
            output,
            error: event.error.message,
            steps,
            usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
            duration: Date.now() - startTime,
            childSessionId: childSession.id,
          }
      }

      if (shouldRetry) break

      // 检查轮数限制
      if (turnCount >= maxTurns) {
        const finalOutput = output + "\n\n[Reached maximum turns limit]"
        emit.end(true, finalOutput, Date.now() - startTime, undefined, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens })
        return {
          success: true,
          output: finalOutput,
          steps,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          duration: Date.now() - startTime,
          childSessionId: childSession.id,
        }
      }
    } // end for-await

    if (!shouldRetry) break
    } // end retry loop

    // 发送结束事件
    emit.end(true, output, Date.now() - startTime, undefined, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens })

    return {
      success: true,
      output,
      steps,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      duration: Date.now() - startTime,
      childSessionId: childSession.id,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    emit.end(false, "", Date.now() - startTime, errorMsg)
    return {
      success: false,
      output: "",
      error: errorMsg,
      steps,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - startTime,
    }
  }
}
