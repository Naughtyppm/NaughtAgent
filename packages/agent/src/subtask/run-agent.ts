/**
 * run_agent 模式 - 独立子 Agent Loop（原 agent.ts）
 *
 * 最灵活的子任务模式：
 * - 完整的 Agent Loop
 * - LLM 自主选择工具
 * - 支持最大轮数限制
 * - 可中止
 * - 全新会话，不继承父上下文
 * - 支持事件回调，向 UI 传递执行状态
 */

import type {
  RunAgentConfig,
  SubTaskResult,
  SubTaskStep,
} from "./types"
import {
  createAgentLoop,
  getAgentDefinition,
  type AgentType,
} from "../agent"
import { createSession } from "../session"
import { createProviderFromEnv, createProvider } from "../provider"
import {
  generateSubAgentId,
  createSubAgentEmitter,
  type SubAgentEventListener,
} from "./events"

/**
 * run_agent 模式运行时配置
 */
export interface RunAgentRuntime {
  /** API Key（可选，如果不提供则尝试使用环境变量） */
  apiKey?: string
  /** API Base URL */
  baseURL?: string
  /** 固定模型（不能是 "auto"） */
  model?: string
  /** 事件监听器 - 用于向 UI 传递子 Agent 执行状态 */
  onEvent?: SubAgentEventListener
}

/**
 * @deprecated 使用 RunAgentRuntime
 */
export type AgentModeRuntime = RunAgentRuntime

/**
 * 执行 run_agent 模式子任务
 */
export async function runRunAgent(
  config: RunAgentConfig,
  runtime: RunAgentRuntime
): Promise<SubTaskResult> {
  const startTime = Date.now()
  const steps: SubTaskStep[] = []
  
  // 生成子 Agent ID 并创建事件发射器
  const subAgentId = generateSubAgentId()
  const emit = createSubAgentEmitter(subAgentId, runtime.onEvent)

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

    const agentType: AgentType = config.agentType || "build"
    const cwd = config.cwd || process.cwd()
    // 支持新旧参数名
    const maxTurns = config.maxTurns || config.maxSteps || 30

    // 发送开始事件
    emit.start(config.prompt, agentType, maxTurns)

    // 发送配置事件，记录子 Agent 启动配置
    emit.config({
      maxTurns,
      timeout: config.timeout,
      tools: config.tools,
      agentType,
    })

    // 创建 Provider（自动选择 Anthropic 或环境变量配置）
    const provider = runtime.apiKey
      ? createProvider({
          type: "anthropic",
          config: { apiKey: runtime.apiKey, baseURL: runtime.baseURL },
        })
      : createProviderFromEnv()

    // 获取 Agent 定义
    const definition = getAgentDefinition(agentType)

    // 如果指定了工具列表，过滤工具
    let filteredDefinition = definition
    if (config.tools && config.tools.length > 0) {
      const allowedTools = new Set(config.tools)
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
          maxTokens: filteredDefinition.model?.maxTokens || 8192,
        },
      }
    }

    // 创建会话
    const session = createSession({
      cwd,
      agentType,
    })

    // 创建 Agent Loop - 传递 abort 信号
    const loop = createAgentLoop({
      definition: filteredDefinition,
      session,
      provider,
      runConfig: {
        sessionId: session.id,
        cwd,
        abort: config.abort,
      },
    })

    // 收集输出
    let output = ""
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let turnCount = 0
    
    // 工具执行计时
    const toolStartTimes = new Map<string, number>()

    // 快速 abort 检查辅助函数
    const checkAbort = (): boolean => !!config.abort?.aborted

    // 运行 Agent Loop
    for await (const event of loop.run(config.prompt)) {
      // 增强的 abort 检查 - 每个事件都检查
      if (checkAbort()) {
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
        }
      }

      switch (event.type) {
        case "text":
          output = event.content
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

        case "tool_end":
          // 计算工具执行时间
          const toolStartTime = toolStartTimes.get(event.id) || Date.now()
          const toolDuration = Date.now() - toolStartTime
          // 发送工具结束事件
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

        case "done":
          totalInputTokens = event.usage.inputTokens
          totalOutputTokens = event.usage.outputTokens
          break

        case "error":
          emit.end(false, output, Date.now() - startTime, event.error.message, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens })
          return {
            success: false,
            output,
            error: event.error.message,
            steps,
            usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
            duration: Date.now() - startTime,
          }
      }

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
        }
      }
    }

    // 发送结束事件
    emit.end(true, output, Date.now() - startTime, undefined, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens })

    return {
      success: true,
      output,
      steps,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      duration: Date.now() - startTime,
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

/**
 * @deprecated 使用 runRunAgent
 */
export const runAgentTask = runRunAgent
