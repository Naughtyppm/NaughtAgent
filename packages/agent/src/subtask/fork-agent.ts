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
import { createSession, type Message, type ContentBlock } from "../session"
import { createProviderFromEnv, createProvider } from "../provider"
import { createContextManager, type PreparedContext } from "./context"

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

  try {
    // 检查取消信号
    if (config.abort?.aborted) {
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

    // 7. 创建 Agent Loop
    const loop = createAgentLoop({
      definition: filteredDefinition,
      session: childSession,
      provider,
      runConfig: {
        sessionId: childSession.id,
        cwd,
      },
    })

    // 8. 收集输出
    let output = ""
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let turnCount = 0

    // 9. 运行 Agent Loop
    for await (const event of loop.run(config.prompt)) {
      // 检查取消信号
      if (config.abort?.aborted) {
        return {
          success: false,
          output,
          error: "Task was aborted",
          steps,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          duration: Date.now() - startTime,
          childSessionId: childSession.id,
        }
      }

      switch (event.type) {
        case "text":
          output += event.content
          break

        case "tool_start":
          turnCount++
          steps.push({
            name: event.name,
            type: "tool",
            input: event.input,
            duration: 0,
            success: true,
          })
          break

        case "tool_end":
          // 更新最后一个步骤
          const lastStep = steps[steps.length - 1]
          if (lastStep) {
            lastStep.output = event.result.output
            lastStep.success = !event.isError
            if (event.isError) {
              lastStep.error = event.result.output
            }
          }
          break

        case "done":
          totalInputTokens = event.usage.inputTokens
          totalOutputTokens = event.usage.outputTokens
          break

        case "error":
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

      // 检查轮数限制
      if (turnCount >= maxTurns) {
        return {
          success: true,
          output: output + "\n\n[Reached maximum turns limit]",
          steps,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          duration: Date.now() - startTime,
          childSessionId: childSession.id,
        }
      }
    }

    return {
      success: true,
      output,
      steps,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      duration: Date.now() - startTime,
      childSessionId: childSession.id,
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
      steps,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - startTime,
    }
  }
}
