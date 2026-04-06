/**
 * ask_llm 工具 - 单次 LLM 查询
 * 
 * 特点：
 * - 无窗口（不保持会话）
 * - 无工具调用
 * - 不继承上下文
 * - 用途：简单问答、生成片段
 */

import { z } from "zod"
import { Tool } from "../tool"
import { runAskLlm, type SubTaskProvider } from "../../subtask"
import { getGlobalSubAgentEventListener } from "../../subtask/global-listener"
import { generateSubAgentId, createSubAgentEmitter } from "../../subtask/events"

// 全局 Provider 引用（由 setSubagentProvider 设置）
let globalProvider: SubTaskProvider | null = null

export function setAskLlmProvider(provider: SubTaskProvider) {
  globalProvider = provider
}

const DESCRIPTION = `Ask LLM a simple question without tools.

Use this for:
- Quick questions that don't need file access
- Generating text snippets or code fragments
- Getting explanations or summaries
- Simple transformations

This is the fastest and cheapest option - no tools, no context inheritance.`

export const AskLlmTool = Tool.define({
  id: "ask_llm",
  description: DESCRIPTION,
  parameters: z.object({
    prompt: z.string().describe("The question or task for the LLM"),
    systemPrompt: z.string().optional().describe("Optional system prompt to guide the response"),
  }),

  async execute(params, ctx) {
    if (!globalProvider) {
      return {
        title: "ask_llm",
        output: "Error: SubTask provider not configured. Call setAskLlmProvider first.",
        isError: true,
        metadata: { error: true },
      }
    }

    const startTime = Date.now()

    // 创建事件发射器
    const subAgentId = generateSubAgentId()
    const listener = getGlobalSubAgentEventListener()
    const emitter = createSubAgentEmitter(subAgentId, listener ?? undefined, "ask_llm")

    // 发送开始事件（ask_llm 没有工具调用，maxSteps 设为 1）
    emitter.start(params.prompt, "query", 1)

    // 发送配置事件
    emitter.config({
      maxTurns: 1,
      agentType: "query",
    })

    try {
      const result = await runAskLlm(
        {
          mode: "ask_llm",
          prompt: params.prompt,
          systemPrompt: params.systemPrompt,
          cwd: ctx.cwd,
          abort: ctx.abort,
        },
        globalProvider
      )

      const duration = Date.now() - startTime

      if (result.success) {
        // 发送结束事件
        emitter.end(true, result.output, duration, undefined, result.usage)

        return {
          title: "ask_llm",
          output: result.output,
          metadata: {
            duration,
            usage: result.usage,
          },
        }
      } else {
        // 发送错误结束事件
        emitter.end(false, result.error || "Unknown error", duration, result.error)

        return {
          title: "ask_llm",
          output: `Error: ${result.error}`,
          isError: true,
          metadata: { error: true, duration },
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      
      // 发送错误结束事件
      emitter.end(false, errorMsg, duration, errorMsg)

      return {
        title: "ask_llm",
        output: `Error: ${errorMsg}`,
        isError: true,
        metadata: { error: true },
      }
    }
  },
})
