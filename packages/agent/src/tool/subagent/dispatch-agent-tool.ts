/**
 * dispatch_agent 工具 - 调度代理
 *
 * 核心模式：管理者持有控制权，专家代理作为工具被调用
 *
 * 架构：
 *   用户 → Dispatcher（管理者，持有控制权）
 *                ↓          ↓          ↓
 *           专家代理A    专家代理B    专家代理C
 *           （工具调用）  （工具调用）  （工具调用）
 *                ↓          ↓          ↓
 *         Dispatcher 汇总所有结果 → 返回用户
 *
 * 与 parallel_agents 的区别：
 * - parallel_agents：预先规划好所有子任务，并行执行，再汇总
 * - dispatch_agent：LLM 自主决定调用哪些专家、顺序、是否串行，更灵活
 */

import { z } from "zod"
import { Tool } from "../tool"
import { runRunAgent, runAskLlm, type RunAgentRuntime, type SubTaskProvider } from "../../subtask"
import { getGlobalSubAgentEventListener } from "../../subtask/global-listener"
import { generateSubAgentId, createSubAgentEmitter } from "../../subtask/events"
import { createLogger } from "../../logging"

const log = createLogger("dispatch")

// 全局运行时引用
// 注意：globalRuntime 来自 runner.ts，已包含 toolRegistry 字段
// 子代理通过 runtime.toolRegistry 获取 read/write/edit 等基础工具
let globalRuntime: RunAgentRuntime | null = null
let globalProvider: SubTaskProvider | null = null

export function setDispatchAgentRuntime(runtime: RunAgentRuntime) {
  globalRuntime = runtime
}

export function setDispatchAgentProvider(provider: SubTaskProvider) {
  globalProvider = provider
}

const DESCRIPTION = `Dispatch a complex task to a manager agent that routes sub-tasks to specialist agents.

Use this when:
- A task requires multiple specialized skills (e.g., research + analysis + writing)
- You want one agent to own the final answer while delegating to specialists
- Tasks have dependencies (specialist A output feeds specialist B)
- You need adaptive routing (manager decides which specialist based on results)

Do NOT use this when:
- You can complete the task yourself using basic tools (read, write, edit, bash, glob, grep)
- The task is straightforward (e.g., write a test file, read and analyze code, fix a bug)
- Only one skill is needed (just use the tools directly instead of dispatching)

The dispatch agent will:
1. Receive the task and specialist definitions
2. Call specialists as tools (in any order, serially or adaptively)
3. Combine specialist outputs into a final synthesized answer

Difference from parallel_agents: dispatch_agent lets the LLM decide routing dynamically.
Difference from run_agent: the tools ARE the specialist agents themselves.`

/** 专家代理定义 */
const ExpertAgentSchema = z.object({
  name: z.string().describe("专家代理名称，管理者 LLM 通过 [CALL: name] 调用"),
  role: z.string().describe("专家代理的角色描述，告诉管理者什么时候调用它"),
  prompt_template: z.string().optional().describe(
    "专家任务提示模板，可用 {task} 和 {context} 占位符"
  ),
  agent_type: z.enum(["build", "plan", "explore"]).default("build")
    .describe("专家代理类型：build（完整权限）/ plan（只读+规划）/ explore（只读）"),
  max_turns: z.number().default(10).describe("专家代理最大执行轮数"),
})

type ExpertAgent = z.infer<typeof ExpertAgentSchema>

/** dispatch_agent 工具参数 */
const ParamsSchema = z.object({
  task: z.string().describe("要完成的主任务描述"),
  experts: z.array(ExpertAgentSchema).min(1).max(8).describe(
    "专家代理列表（1-8个）。每个专家会被管理者通过 [CALL: name] 语法调用。"
  ),
  dispatcher_instructions: z.string().optional().describe(
    "给管理者代理的额外指令，例如：优先调用哪个专家、如何组合结果"
  ),
  max_rounds: z.number().default(20).describe("管理者最大决策轮数"),
})

/** 构建管理者系统提示 */
function buildDispatcherSystemPrompt(
  task: string,
  experts: ExpertAgent[],
  extraInstructions?: string
): string {
  const expertList = experts
    .map((e) => `- **${e.name}**: ${e.role}`)
    .join("\n")

  return `You are a Dispatcher Agent. Complete the following task by calling specialist agents.

Task: ${task}

Available specialists:
${expertList}

To call a specialist, use this format:
[CALL: specialist_name] description of what you need from them

You can make multiple [CALL:] requests in one response.
When you have gathered enough information, output your final answer WITHOUT any [CALL:] prefix.
${extraInstructions ? `\nAdditional instructions:\n${extraInstructions}` : ""}`
}

/** 专家代理调用选项 */
interface CallExpertOptions {
  expert: ExpertAgent
  task: string
  context: string
  runtime: RunAgentRuntime
  abort?: AbortSignal
  cwd?: string
}

/** 调用单个专家代理 */
async function callExpert(opts: CallExpertOptions): Promise<string> {
  const { expert, task: expertTask, context, runtime, abort, cwd } = opts
  const prompt = expert.prompt_template
    ? expert.prompt_template
        .replace("{task}", expertTask)
        .replace("{context}", context)
    : `Task: ${expertTask}${context ? `\n\nContext:\n${context}` : ""}`

  const result = await runRunAgent(
    {
      mode: "run_agent",
      prompt,
      agentType: expert.agent_type ?? "build",
      maxTurns: expert.max_turns ?? 10,
      abort,
      cwd,
    },
    runtime
  )

  return result.success
    ? result.output
    : `[Expert ${expert.name} failed: ${result.error}]`
}

export const DispatchAgentTool = Tool.define({
  id: "dispatch_agent",
  description: DESCRIPTION,
  parameters: ParamsSchema,

  async execute(params, ctx) {
    const startTime = Date.now()
    const subAgentId = generateSubAgentId()
    const listener = getGlobalSubAgentEventListener() ?? undefined
    const emitter = createSubAgentEmitter(subAgentId, listener)

    log.info("dispatch_agent called", { task: params.task.slice(0, 100), expertCount: params.experts.length })

    const runtime = globalRuntime
    const provider = globalProvider

    if (!runtime || !provider) {
      log.error("runtime not configured", { hasRuntime: !!runtime, hasProvider: !!provider })
      return {
        title: "dispatch_agent",
        output: "Error: dispatch_agent runtime not configured",
        metadata: { error: true },
      }
    }

    log.debug("runtime ready", { baseURL: runtime.baseURL, hasApiKey: !!runtime.apiKey })

    const maxRounds = params.max_rounds ?? 20
    emitter.start(params.task, "general", maxRounds)

    try {
      const expertResults: Record<string, string> = {}
      let dispatcherOutput = ""
      // normalize：补全 zod default 在类型层面可能缺失的字段
      const experts = params.experts.map((e) => ({
        ...e,
        agent_type: e.agent_type ?? ("build" as const),
        max_turns: e.max_turns ?? 10,
      }))

      const systemPrompt = buildDispatcherSystemPrompt(
        params.task,
        experts,
        params.dispatcher_instructions
      )

      // 对话历史，驱动管理者多轮路由决策
      const history: Array<{ role: "user" | "assistant"; content: string }> = []
      history.push({
        role: "user",
        content: "Please complete the task. Call specialists as needed. When done, output your final synthesized answer.",
      })

      for (let round = 0; round < maxRounds; round++) {
        if (ctx.abort?.aborted) break

        log.debug(`dispatcher round ${round + 1}/${maxRounds}`)

        // 管理者决策：用 ask_llm 驱动
        const conversationText = history
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n\n")

        const dispatcherResult = await runAskLlm(
          {
            mode: "ask_llm",
            prompt: conversationText,
            systemPrompt,
            abort: ctx.abort,
          },
          provider
        )

        const response = dispatcherResult.output
        log.debug("dispatcher response", { length: response.length, hasCallDirectives: response.includes("[CALL:") })
        history.push({ role: "assistant", content: response })

        // 解析 [CALL: expert_name] 指令
        const callRegex = /\[CALL:\s*([^\]]+)\]([^\[]*)/g
        const calls: Array<{ name: string; task: string }> = []
        let match: RegExpExecArray | null
        while ((match = callRegex.exec(response)) !== null) {
          calls.push({ name: match[1].trim(), task: match[2].trim() })
        }

        if (calls.length === 0) {
          // 无调用指令，管理者输出最终答案
          log.info("dispatcher final answer", { length: response.length })
          dispatcherOutput = response
          break
        }

        // 执行专家调用（串行，保留依赖顺序）
        const callResults: string[] = []
        for (const call of calls) {
          const expert = experts.find(
            (e) => e.name.toLowerCase() === call.name.toLowerCase()
          )
          if (!expert) {
            callResults.push(`[RESULT: ${call.name}] Error: specialist not found`)
            continue
          }

          emitter.toolStart(call.name, call.name, { task: call.task })
          log.info(`calling expert: ${call.name}`, { task: call.task.slice(0, 80) })
          const context = Object.entries(expertResults)
            .map(([k, v]) => `### ${k}\n${v}`)
            .join("\n\n")
          const result = await callExpert({ expert, task: call.task, context, runtime, abort: ctx.abort, cwd: ctx.cwd })
          expertResults[expert.name] = result
          emitter.toolEnd(call.name, result, false, 0)
          callResults.push(`[RESULT: ${call.name}]\n${result}`)
        }

        // 把专家结果反馈给管理者
        history.push({
          role: "user",
          content: callResults.join("\n\n") + "\n\nPlease continue or provide your final synthesized answer.",
        })
      }

      const duration = Date.now() - startTime
      const output = dispatcherOutput || "[Dispatch agent reached max rounds without final answer]"
      emitter.end(true, output, duration, undefined)

      return {
        title: "dispatch_agent",
        output,
        metadata: {
          duration,
          expertCount: params.experts.length,
          expertsCalled: Object.keys(expertResults),
          rounds: history.filter((h) => h.role === "assistant").length,
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      emitter.end(false, errorMsg, Date.now() - startTime, errorMsg)
      return {
        title: "dispatch_agent",
        output: `Error: ${errorMsg}`,
        metadata: { error: true },
      }
    }
  },
})
