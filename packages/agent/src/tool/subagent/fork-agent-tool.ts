/**
 * fork_agent 工具 - 分叉代理
 * 
 * 特点：
 * - 有窗口（独立会话）
 * - 可调用工具
 * - 完整继承上下文
 * - 用途：子任务委托（保留上下文）
 * - 支持事件回调，向 UI 传递执行状态
 */

import { z } from "zod"
import { Tool } from "../tool"
import { runForkAgent, type ForkAgentRuntime, type ParentContext } from "../../subtask"
import { getGlobalSubAgentEventListener } from "../../subtask/global-listener"

// 全局运行时和上下文引用
let globalRuntime: Omit<ForkAgentRuntime, 'parentContext' | 'onEvent'> | null = null
let globalParentContext: ParentContext | null = null

export function setForkAgentRuntime(runtime: Omit<ForkAgentRuntime, 'parentContext' | 'onEvent'>) {
  globalRuntime = runtime
}

export function setForkAgentParentContext(context: ParentContext) {
  globalParentContext = context
}

const DESCRIPTION = `Fork a sub-agent that inherits the current conversation context.

Use this for:
- Delegating subtasks while preserving context
- Breaking down complex tasks into focused sub-problems
- Tasks that need awareness of previous conversation

The forked agent inherits:
- Message history (configurable)
- File context summary
- Tool permissions
- System prompt

This is more expensive than run_agent but maintains continuity.`

/** 最大子代理嵌套深度 */
const MAX_SUBAGENT_DEPTH = 3

export const ForkAgentTool = Tool.define({
  id: "fork_agent",
  description: DESCRIPTION,
  parameters: z.object({
    prompt: z.string().describe("The subtask description"),
    inheritMessages: z.union([z.boolean(), z.number()]).optional()
      .describe("Inherit messages: true=all, number=last N, false=none (default: true)"),
    inheritContext: z.boolean().optional()
      .describe("Inherit file context summary (default: true)"),
    agentType: z.enum(["build", "plan", "explore"]).optional()
      .describe("Override agent type (default: inherit from parent)"),
    maxTurns: z.number().optional()
      .describe("Maximum tool calls (default: 30)"),
  }),

  async execute(params, ctx) {
    // 深度检查：防止无限递归
    const currentDepth = ctx.depth ?? 0
    if (currentDepth >= MAX_SUBAGENT_DEPTH) {
      return {
        title: "fork_agent",
        output: `Error: 子代理嵌套深度已达上限 (${MAX_SUBAGENT_DEPTH})。当前深度: ${currentDepth}。请在当前层级完成任务。`,
        metadata: { error: true, depth: currentDepth, maxDepth: MAX_SUBAGENT_DEPTH },
      }
    }

    if (!globalRuntime || !globalParentContext) {
      return {
        title: "fork_agent",
        output: "Error: ForkAgent runtime or parent context not configured.",
        metadata: { error: true },
      }
    }

    const startTime = Date.now()

    try {
      // 事件由 runForkAgent 内部发射，传递全局事件监听器
      const result = await runForkAgent(
        {
          mode: "fork_agent",
          prompt: params.prompt,
          inherit: {
            messages: params.inheritMessages ?? true,
            context: params.inheritContext ?? true,
            tools: true,
            systemPrompt: true,
          },
          agentType: params.agentType,
          maxTurns: params.maxTurns || 30,
          cwd: ctx.cwd,
          abort: ctx.abort,
          depth: currentDepth + 1,
          sharedContextId: ctx.sharedContextId,
        },
        {
          ...globalRuntime,
          parentContext: globalParentContext,
          onEvent: getGlobalSubAgentEventListener() || undefined,
        }
      )

      const duration = Date.now() - startTime

      if (result.success) {
        const stepsInfo = result.steps?.length
          ? `\n\n[Executed ${result.steps.length} tool calls in forked session]`
          : ""

        return {
          title: "fork_agent",
          output: result.output + stepsInfo,
          metadata: {
            duration,
            usage: result.usage,
            steps: result.steps?.length || 0,
            childSessionId: result.childSessionId,
          },
        }
      } else {
        return {
          title: "fork_agent",
          output: `Error: ${result.error}`,
          metadata: { error: true, duration },
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      return {
        title: "fork_agent",
        output: `Error: ${errorMsg}`,
        metadata: { error: true },
      }
    }
  },
})
