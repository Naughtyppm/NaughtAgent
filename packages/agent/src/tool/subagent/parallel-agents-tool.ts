/**
 * parallel_agents 工具 - 并行执行多个子 Agent
 *
 * 特点：
 * - 接收任务数组，并行启动多个 run_agent
 * - 每个子任务独立执行，互不影响
 * - 全部完成后汇总结果返回
 * - 支持 child_start/child_end 事件，UI 可跟踪每个子任务状态
 * - 单个子任务失败不影响其他子任务
 */

import { z } from "zod"
import { Tool } from "../tool"
import { runRunAgent, type RunAgentRuntime, getGlobalSubAgentEventListener } from "../../subtask"
import {
  generateSubAgentId,
  createSubAgentEmitter,
} from "../../subtask/events"

// 全局运行时引用（由 register.ts 设置，与 run_agent 共用同一个）
let globalRuntime: RunAgentRuntime | null = null

export function setParallelAgentsRuntime(runtime: RunAgentRuntime) {
  globalRuntime = runtime
}

/** 最大并行子任务数 */
const MAX_PARALLEL_TASKS = 10

/** 最大子代理嵌套深度 */
const MAX_SUBAGENT_DEPTH = 3

const DESCRIPTION = `Run multiple sub-agents in parallel and collect all results.

Use this when you have 2+ independent tasks that can execute simultaneously.
Each task gets its own isolated sub-agent with full tool access.

All tasks run concurrently — a single task failure does NOT abort others.
Results are returned as a structured summary once ALL tasks complete.

Example:
  parallel_agents({
    tasks: [
      { name: "search-auth", prompt: "Find all authentication code" },
      { name: "search-db", prompt: "Find all database queries" },
      { name: "check-tests", prompt: "List all test files and their coverage" }
    ]
  })`

const TaskSchema = z.object({
  /** 子任务名称（用于标识结果） */
  name: z.string().describe("Unique name to identify this task in results"),
  /** 子任务描述 */
  prompt: z.string().describe("Task description for the sub-agent"),
  /** Agent 类型 */
  agentType: z
    .enum(["build", "plan", "explore"])
    .optional()
    .describe("Agent type: build (full), plan (read+write), explore (read-only). Default: build"),
  /** 工具白名单 */
  tools: z.array(z.string()).optional().describe("Specific tools to allow"),
  /** 最大步数 */
  maxTurns: z.number().optional().describe("Max tool calls for this task (default: 30)"),
})

export const ParallelAgentsTool = Tool.define({
  id: "parallel_agents",
  description: DESCRIPTION,
  parameters: z.object({
    tasks: z
      .array(TaskSchema)
      .min(1)
      .max(MAX_PARALLEL_TASKS)
      .describe("Array of tasks to execute in parallel"),
  }),

  async execute(params, ctx) {
    // 深度检查
    const currentDepth = ctx.depth ?? 0
    if (currentDepth >= MAX_SUBAGENT_DEPTH) {
      return {
        title: "parallel_agents",
        output: `Error: 子代理嵌套深度已达上限 (${MAX_SUBAGENT_DEPTH})。当前深度: ${currentDepth}。`,
        metadata: { error: true },
      }
    }

    if (!globalRuntime) {
      return {
        title: "parallel_agents",
        output: "Error: ParallelAgents runtime not configured.",
        metadata: { error: true },
      }
    }

    const startTime = Date.now()
    const parentId = generateSubAgentId()
    const listener = getGlobalSubAgentEventListener()
    const emitter = createSubAgentEmitter(parentId, listener ?? undefined, "parallel_agents")

    // 发送开始事件
    emitter.start(
      `Parallel: ${params.tasks.map((t) => t.name).join(", ")}`,
      "parallel",
      params.tasks.length
    )
    emitter.config({
      maxTurns: params.tasks.length,
      agentType: "parallel",
    })

    // 并行启动所有子任务
    const taskPromises = params.tasks.map(async (task) => {
      const childId = generateSubAgentId()

      // 发送子任务开始事件
      emitter.childStart(childId, task.name, task.prompt)

      try {
        // 创建子 Agent 运行时，传入事件回调
        const runtimeWithListener: RunAgentRuntime = {
          ...globalRuntime!,
          onEvent: listener ?? undefined,
        }

        const result = await runRunAgent(
          {
            mode: "run_agent",
            prompt: task.prompt,
            agentType: task.agentType || "build",
            tools: task.tools,
            maxTurns: task.maxTurns || 30,
            cwd: ctx.cwd,
            abort: ctx.abort,
            depth: currentDepth + 1,
            sharedContextId: ctx.sharedContextId,
          },
          runtimeWithListener
        )

        // 发送子任务结束事件
        emitter.childEnd(childId, task.name, result.success, result.output, result.error)

        return {
          name: task.name,
          success: result.success,
          output: result.output,
          error: result.error,
          usage: result.usage,
          steps: result.steps?.length ?? 0,
          duration: result.duration,
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        emitter.childEnd(childId, task.name, false, "", errorMsg)

        return {
          name: task.name,
          success: false,
          output: "",
          error: errorMsg,
          usage: { inputTokens: 0, outputTokens: 0 },
          steps: 0,
          duration: Date.now() - startTime,
        }
      }
    })

    // 等待所有子任务完成
    const results = await Promise.allSettled(taskPromises)
    const duration = Date.now() - startTime

    // 汇总结果
    const taskResults = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : {
            name: "unknown",
            success: false,
            output: "",
            error: r.reason?.message ?? String(r.reason),
            usage: { inputTokens: 0, outputTokens: 0 },
            steps: 0,
            duration: 0,
          }
    )

    const succeeded = taskResults.filter((r) => r.success).length
    const failed = taskResults.filter((r) => !r.success).length
    const totalUsage = taskResults.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + (r.usage?.inputTokens ?? 0),
        outputTokens: acc.outputTokens + (r.usage?.outputTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 }
    )

    // 格式化输出
    const outputLines: string[] = [
      `## Parallel Results (${succeeded}/${params.tasks.length} succeeded, ${duration}ms)`,
      "",
    ]

    for (const result of taskResults) {
      const status = result.success ? "✓" : "✗"
      outputLines.push(`### ${status} ${result.name} (${result.steps} steps, ${result.duration}ms)`)
      if (result.error) {
        outputLines.push(`**Error**: ${result.error}`)
      }
      outputLines.push(result.output)
      outputLines.push("")
    }

    const output = outputLines.join("\n")

    // 发送结束事件
    emitter.end(failed === 0, output, duration, failed > 0 ? `${failed} task(s) failed` : undefined, totalUsage)

    return {
      title: "parallel_agents",
      output,
      metadata: {
        duration,
        succeeded,
        failed,
        total: params.tasks.length,
        usage: totalUsage,
        tasks: taskResults.map((r) => ({
          name: r.name,
          success: r.success,
          steps: r.steps,
          duration: r.duration,
        })),
      },
    }
  },
})
