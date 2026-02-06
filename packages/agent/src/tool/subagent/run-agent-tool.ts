/**
 * run_agent 工具 - 自主代理
 * 
 * 特点：
 * - 有窗口（独立会话）
 * - 可调用工具
 * - 可选继承上下文
 * - 用途：独立任务执行
 * - 支持事件回调，向 UI 传递执行状态
 */

import { z } from "zod"
import { Tool } from "../tool"
import { runRunAgent, type RunAgentRuntime, getGlobalSubAgentEventListener } from "../../subtask"

// 全局运行时引用
let globalRuntime: RunAgentRuntime | null = null

export function setRunAgentRuntime(runtime: RunAgentRuntime) {
  globalRuntime = runtime
}

/**
 * @deprecated 使用 setGlobalSubAgentEventListener 代替
 * 保留此函数以保持向后兼容
 */
export function setSubAgentEventListener(_listener: unknown) {
  console.warn("[run_agent] setSubAgentEventListener is deprecated, use setGlobalSubAgentEventListener from subtask module")
}

/**
 * @deprecated 使用 getGlobalSubAgentEventListener 代替
 */
export function getSubAgentEventListener() {
  return getGlobalSubAgentEventListener()
}

const DESCRIPTION = `Run an autonomous sub-agent to complete a task.

Use this for:
- Independent tasks that need file access
- Complex operations requiring multiple tool calls
- Tasks that benefit from focused context

The sub-agent has its own session and can use tools (read, write, edit, bash, glob, grep).
It does NOT inherit the parent conversation context by default.`

export const RunAgentTool = Tool.define({
  id: "run_agent",
  description: DESCRIPTION,
  parameters: z.object({
    prompt: z.string().describe("The task description for the sub-agent"),
    agentType: z.enum(["build", "plan", "explore"]).optional()
      .describe("Agent type: build (full access), plan (read + write plan), explore (read-only)"),
    tools: z.array(z.string()).optional()
      .describe("Specific tools to allow (default: all tools for the agent type)"),
    maxTurns: z.number().optional()
      .describe("Maximum number of tool calls (default: 30)"),
  }),

  async execute(params, ctx) {
    if (!globalRuntime) {
      return {
        title: "run_agent",
        output: "Error: RunAgent runtime not configured.",
        metadata: { error: true },
      }
    }

    const startTime = Date.now()

    try {
      // 使用全局事件监听器
      const runtimeWithListener: RunAgentRuntime = {
        ...globalRuntime,
        onEvent: getGlobalSubAgentEventListener() || undefined,
      }

      const result = await runRunAgent(
        {
          mode: "run_agent",
          prompt: params.prompt,
          agentType: params.agentType || "build",
          tools: params.tools,
          maxTurns: params.maxTurns || 30,
          cwd: ctx.cwd,
          abort: ctx.abort,
        },
        runtimeWithListener
      )

      const duration = Date.now() - startTime

      if (result.success) {
        // 格式化步骤信息
        const stepsInfo = result.steps?.length
          ? `\n\n[Executed ${result.steps.length} tool calls]`
          : ""

        return {
          title: "run_agent",
          output: result.output + stepsInfo,
          metadata: {
            duration,
            usage: result.usage,
            steps: result.steps?.length || 0,
          },
        }
      } else {
        return {
          title: "run_agent",
          output: `Error: ${result.error}`,
          metadata: { error: true, duration },
        }
      }
    } catch (error) {
      return {
        title: "run_agent",
        output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { error: true },
      }
    }
  },
})
