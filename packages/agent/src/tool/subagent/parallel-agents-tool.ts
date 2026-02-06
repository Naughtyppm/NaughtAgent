/**
 * parallel_agents 工具 - 融合代理协调并行执行
 * 
 * 架构：
 * 主 Agent → 融合 Agent（协调者）→ 多个子 Agent（干活的）
 *                 ↓
 *          汇总结果返回给主 Agent
 * 
 * 特点：
 * - 主 Agent 只知道融合 Agent
 * - 融合 Agent 决定需要多少子 Agent
 * - 融合 Agent 分配任务、收集结果、汇总报告
 */

import { z } from "zod"
import { Tool } from "../tool"
import { runRunAgent, runAskLlm, type RunAgentRuntime, type SubTaskProvider } from "../../subtask"
import { createConcurrencyController } from "../../subtask/concurrency"
import { getGlobalSubAgentEventListener } from "../../subtask/global-listener"
import { generateSubAgentId, createSubAgentEmitter } from "../../subtask/events"

// 全局运行时引用
let globalRuntime: RunAgentRuntime | null = null
let globalProvider: SubTaskProvider | null = null

/** 最大并发数限制 */
const MAX_CONCURRENCY = 3

export function setParallelAgentsRuntime(runtime: RunAgentRuntime) {
  globalRuntime = runtime
}

export function setParallelAgentsProvider(provider: SubTaskProvider) {
  globalProvider = provider
}

const DESCRIPTION = `Delegate a task to a synthesis agent that coordinates multiple sub-agents.

Use this for:
- Multi-perspective analysis (the synthesis agent decides how many perspectives)
- Complex tasks requiring parallel processing
- Tasks that benefit from divide-and-conquer approach

The synthesis agent will:
1. Analyze the task and decide how to split it
2. Spawn appropriate sub-agents
3. Collect and synthesize results
4. Return a unified report

You only interact with the synthesis agent - it handles all coordination.`

/**
 * 分批并行执行，使用 ConcurrencyController 限制并发数并传递 abort 信号
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  maxConcurrency: number,
  fn: (item: T, signal: AbortSignal) => Promise<R>,
  parentAbort?: AbortSignal
): Promise<R[]> {
  const controller = createConcurrencyController<T, R>()
  
  // 如果父级 abort，取消所有子任务
  if (parentAbort) {
    const onAbort = () => controller.abort()
    parentAbort.addEventListener("abort", onAbort, { once: true })
  }

  const result = await controller.run(
    items,
    fn,
    { maxConcurrency, failFast: false }
  )

  // 返回所有成功的结果值（失败的在 executor 内部已处理并返回了结果对象）
  return result.results
    .filter((r) => r.value !== undefined)
    .map((r) => r.value as R)
}

/**
 * 子任务定义（由融合代理生成）
 */
interface SubTask {
  name: string
  prompt: string
  agentType: "build" | "plan" | "explore"
}

export const ParallelAgentsTool = Tool.define({
  id: "parallel_agents",
  description: DESCRIPTION,
  parameters: z.object({
    task: z.string().describe("The task to delegate to the synthesis agent"),
    context: z.string().optional()
      .describe("Additional context for the synthesis agent"),
    maxSubAgents: z.number().optional()
      .describe("Maximum number of sub-agents (default: 5)"),
    maxTurnsPerAgent: z.number().optional()
      .describe("Maximum tool calls per sub-agent (default: 15)"),
  }),

  async execute(params, ctx) {
    if (!globalRuntime || !globalProvider) {
      return {
        title: "parallel_agents",
        output: "Error: ParallelAgents runtime not configured.",
        metadata: { error: true },
      }
    }

    const startTime = Date.now()
    const maxSubAgents = params.maxSubAgents || 5
    const maxTurns = params.maxTurnsPerAgent || 15

    // 创建事件发射器
    const subAgentId = generateSubAgentId()
    const listener = getGlobalSubAgentEventListener()
    const emitter = createSubAgentEmitter(subAgentId, listener ?? undefined, "parallel_agents")

    // 发送开始事件
    emitter.start(params.task, "synthesis", maxSubAgents)

    // 发送配置事件，记录并行执行配置
    emitter.config({
      maxTurns: maxTurns,
      agentType: "synthesis",
    })

    try {
      // Step 1: 融合代理分析任务，决定子任务分配
      emitter.thinking("融合代理正在分析任务，规划子任务分配...")
      const planningPrompt = `你是一个任务协调专家。请分析以下任务，决定如何分配给多个子代理并行执行。

任务：${params.task}
${params.context ? `\n上下文：${params.context}` : ""}

请输出一个 JSON 数组，每个元素包含：
- name: 子任务名称（简短描述）
- prompt: 子任务的详细指令
- agentType: 代理类型（"explore" 用于分析/阅读，"build" 用于修改/创建，"plan" 用于规划）

要求：
1. 最多 ${maxSubAgents} 个子任务
2. 每个子任务应该是独立的，可以并行执行
3. 子任务之间不应有依赖关系
4. 确保覆盖任务的所有方面

只输出 JSON 数组，不要其他内容。`

      const planResult = await runAskLlm(
        {
          mode: "ask_llm",
          prompt: planningPrompt,
          systemPrompt: "你是一个任务分解专家，擅长将复杂任务拆分为可并行执行的子任务。只输出有效的 JSON。",
          cwd: ctx.cwd,
          abort: ctx.abort,
        },
        globalProvider
      )

      if (!planResult.success) {
        const duration = Date.now() - startTime
        emitter.end(false, `融合代理规划失败: ${planResult.error}`, duration, planResult.error)
        return {
          title: "parallel_agents",
          output: `融合代理规划失败: ${planResult.error}`,
          metadata: { error: true },
        }
      }

      // 解析子任务
      let subTasks: SubTask[]
      try {
        // 尝试提取 JSON
        const jsonMatch = planResult.output.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
          throw new Error("No JSON array found")
        }
        subTasks = JSON.parse(jsonMatch[0])
        
        // 验证和限制
        if (!Array.isArray(subTasks) || subTasks.length === 0) {
          throw new Error("Invalid subtasks array")
        }
        subTasks = subTasks.slice(0, maxSubAgents)
        
        emitter.thinking(`规划完成，将启动 ${subTasks.length} 个子代理并行执行`)
      } catch (e) {
        const duration = Date.now() - startTime
        const errorMsg = `融合代理输出解析失败: ${e instanceof Error ? e.message : String(e)}`
        emitter.end(false, errorMsg, duration, errorMsg)
        return {
          title: "parallel_agents",
          output: `${errorMsg}\n原始输出: ${planResult.output}`,
          metadata: { error: true },
        }
      }

      // Step 2: 并行执行子任务
      const results = await runWithConcurrencyLimit(
        subTasks,
        MAX_CONCURRENCY,
        async (task, signal) => {
          const childId = `child-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          
          // 发送子任务开始事件
          emitter.childStart(childId, task.name, task.prompt)
          
          // 检查 abort（来自 ConcurrencyController 或父级）
          if (signal.aborted || ctx.abort?.aborted) {
            emitter.childEnd(childId, task.name, false, "", "aborted")
            return {
              name: task.name,
              prompt: task.prompt,
              success: false,
              output: "",
              error: "aborted",
              steps: 0,
            }
          }
          
          try {
            const result = await runRunAgent(
              {
                mode: "run_agent",
                prompt: task.prompt,
                agentType: task.agentType || "explore",
                maxTurns,
                cwd: ctx.cwd,
                abort: ctx.abort,
              },
              globalRuntime!
            )
            
            // 发送子任务结束事件
            emitter.childEnd(childId, task.name, result.success, result.output, result.error)
            
            return {
              name: task.name,
              prompt: task.prompt,
              success: result.success,
              output: result.output,
              error: result.error,
              steps: result.steps?.length || 0,
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            
            // 发送子任务错误事件
            emitter.childEnd(childId, task.name, false, "", errorMsg)
            
            return {
              name: task.name,
              prompt: task.prompt,
              success: false,
              output: "",
              error: errorMsg,
              steps: 0,
            }
          }
        },
        ctx.abort
      )

      // 格式化子代理结果
      const subAgentOutputs: string[] = []
      let totalSteps = 0
      let successCount = 0

      for (const result of results) {
        totalSteps += result.steps
        if (result.success) successCount++

        subAgentOutputs.push(`### ${result.name}`)
        subAgentOutputs.push(`任务: ${result.prompt}`)
        if (result.success) {
          subAgentOutputs.push(result.output)
        } else {
          subAgentOutputs.push(`错误: ${result.error}`)
        }
        subAgentOutputs.push("")
      }

      // Step 3: 融合代理汇总结果
      // 检查取消
      if (ctx.abort?.aborted) {
        const duration = Date.now() - startTime
        emitter.end(false, "Task aborted before synthesis", duration, "aborted")
        return {
          title: "parallel_agents",
          output: `# 子代理执行结果（已中止）\n\n${subAgentOutputs.join("\n")}`,
          metadata: { error: false, aborted: true },
        }
      }
      
      emitter.thinking(`所有子代理执行完成 (${successCount}/${results.length} 成功)，正在汇总结果...`)
      const synthesisPrompt = `你是一个分析融合专家。以下是多个子代理针对任务的分析结果。

原始任务：${params.task}

各子代理分析结果：
${subAgentOutputs.join("\n")}

请你：
1. 理解每个子代理的分析内容
2. 找出关键发现和共同点
3. 识别差异和潜在冲突
4. 综合所有信息，给出一个完整、结构化的报告

报告应该直接回答原始任务，不需要重复列出各子代理的原始输出。`

      const synthesisResult = await runAskLlm(
        {
          mode: "ask_llm",
          prompt: synthesisPrompt,
          systemPrompt: "你是一个专业的分析融合专家，擅长整合多个来源的信息，提炼关键洞察，形成结构化的综合报告。",
          cwd: ctx.cwd,
          abort: ctx.abort,
        },
        globalProvider
      )

      const duration = Date.now() - startTime

      // 构建最终输出
      let finalOutput: string
      if (synthesisResult.success) {
        finalOutput = `# 综合分析报告\n\n${synthesisResult.output}\n\n---\n\n## 执行详情\n\n- 子代理数量: ${subTasks.length}\n- 成功: ${successCount}/${results.length}\n- 总工具调用: ${totalSteps}\n- 耗时: ${Math.round(duration / 1000)}s`
      } else {
        // 融合失败，返回原始结果
        finalOutput = `# 子代理执行结果\n\n${subAgentOutputs.join("\n")}\n\n---\n\n融合汇总失败: ${synthesisResult.error}`
      }

      // 发送结束事件
      emitter.end(true, finalOutput, duration, undefined, {
        inputTokens: (planResult.usage?.inputTokens || 0) + (synthesisResult.usage?.inputTokens || 0),
        outputTokens: (planResult.usage?.outputTokens || 0) + (synthesisResult.usage?.outputTokens || 0),
      })

      return {
        title: "parallel_agents",
        output: finalOutput,
        metadata: {
          duration,
          subAgentCount: subTasks.length,
          successCount,
          totalSteps,
          planningUsage: planResult.usage,
          synthesisUsage: synthesisResult.usage,
        },
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      
      // 发送错误结束事件
      emitter.end(false, `Error: ${errorMsg}`, duration, errorMsg)
      
      return {
        title: "parallel_agents",
        output: `Error: ${errorMsg}`,
        metadata: { error: true },
      }
    }
  },
})
