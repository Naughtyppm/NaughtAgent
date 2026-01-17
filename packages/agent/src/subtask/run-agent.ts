/**
 * run_agent 模式 - 独立子 Agent Loop（原 agent.ts）
 *
 * 最灵活的子任务模式：
 * - 完整的 Agent Loop
 * - LLM 自主选择工具
 * - 支持最大轮数限制
 * - 可中止
 * - 全新会话，不继承父上下文
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

/**
 * run_agent 模式运行时配置
 */
export interface RunAgentRuntime {
  /** API Key（可选，如果不提供则尝试使用环境变量） */
  apiKey?: string
  /** API Base URL */
  baseURL?: string
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

    const agentType: AgentType = config.agentType || "build"
    const cwd = config.cwd || process.cwd()
    // 支持新旧参数名
    const maxTurns = config.maxTurns || config.maxSteps || 30

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

    // 创建会话
    const session = createSession({
      cwd,
      agentType,
    })

    // 创建 Agent Loop
    const loop = createAgentLoop({
      definition: filteredDefinition,
      session,
      provider,
      runConfig: {
        sessionId: session.id,
        cwd,
      },
    })

    // 收集输出
    let output = ""
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let turnCount = 0

    // 运行 Agent Loop
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
        }
      }
    }

    return {
      success: true,
      output,
      steps,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      duration: Date.now() - startTime,
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

/**
 * @deprecated 使用 runRunAgent
 */
export const runAgentTask = runRunAgent
