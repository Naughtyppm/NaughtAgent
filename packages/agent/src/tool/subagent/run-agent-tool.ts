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

const DESCRIPTION = `Run an autonomous sub-agent to complete a task.

Use this for:
- Independent tasks that need file access
- Complex operations requiring multiple tool calls
- Tasks that benefit from focused context

The sub-agent has its own session and can use tools (read, write, edit, bash, glob, grep).
It does NOT inherit the parent conversation context by default.`

/** 最大子代理嵌套深度 */
const MAX_SUBAGENT_DEPTH = 3

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
    // 深度检查：防止无限递归
    const currentDepth = ctx.depth ?? 0
    if (currentDepth >= MAX_SUBAGENT_DEPTH) {
      return {
        title: "run_agent",
        output: `Error: 子代理嵌套深度已达上限 (${MAX_SUBAGENT_DEPTH})。当前深度: ${currentDepth}。请在当前层级完成任务。`,
        metadata: { error: true, depth: currentDepth, maxDepth: MAX_SUBAGENT_DEPTH },
      }
    }

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
          depth: currentDepth + 1,
          sharedContextId: ctx.sharedContextId,
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
