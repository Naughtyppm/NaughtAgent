/**
 * multi_agent 工具 - 多角色讨论 + 执行
 *
 * 两阶段流程：
 * Phase 1: 多角色讨论（handoff 机制）
 *   - Agent 之间通过 handoff 传递控制
 *   - 展示窗口实时显示讨论内容
 *   - 终止条件：Agent 说"交给用户"或达到轮次上限
 *
 * Phase 2: 执行最终任务
 *   - 展示窗口升级为真实 AI Agent
 *   - 基于讨论结果，完成用户指定任务
 *   - 模式：Fork（继承配置）或 Run（独立配置）
 */

import { z } from "zod"
import { Tool } from "../tool"
import { runAskLlm, type SubTaskProvider } from "../../subtask"
import { runRunAgent, type RunAgentRuntime } from "../../subtask/run-agent"
import { getGlobalSubAgentEventListener } from "../../subtask/global-listener"
import { generateSubAgentId, createSubAgentEmitter } from "../../subtask/events"

// 全局引用
let globalProvider: SubTaskProvider | null = null
let globalAgentRuntime: RunAgentRuntime | null = null

export function setMultiAgentProvider(provider: SubTaskProvider) {
  globalProvider = provider
}

export function setMultiAgentRuntime(runtime: RunAgentRuntime) {
  globalAgentRuntime = runtime
}

/**
 * 讨论消息
 */
interface DiscussionMessage {
  agent: string
  role: string
  content: string
  round: number
}

/**
 * 检测 Agent 是否要求终止讨论（交给用户）
 */
const HANDOFF_PATTERNS = [
  /交给用户/i,
  /hand\s*off\s*to\s*user/i,
  /pass\s*to\s*user/i,
  /let\s*the\s*user\s*decide/i,
  /\[HANDOFF\]/i,
  /\[END_DISCUSSION\]/i,
  /讨论结束/,
  /达成共识/,
  /consensus\s*reached/i,
]

function isHandoffSignal(content: string): boolean {
  return HANDOFF_PATTERNS.some(p => p.test(content))
}

/**
 * 构建讨论上下文（给当前发言 Agent 看的历史）
 */
function buildDiscussionContext(
  messages: DiscussionMessage[],
  topic: string,
): string {
  if (messages.length === 0) return ""
  const lines = messages.map(m => `【${m.agent}（${m.role}）】:\n${m.content}`)
  return `讨论主题: ${topic}\n\n已有讨论:\n${lines.join("\n\n---\n\n")}`
}

/**
 * 从回复中提取 handoff 目标（下一个发言者）
 * 支持格式：[HANDOFF: 架构师]、[交给: Python专家]、@架构师
 */
function extractHandoffTarget(content: string, agentNames: string[]): string | null {
  // [HANDOFF: xxx] 或 [交给: xxx]
  const bracketMatch = content.match(/\[(?:HANDOFF|交给|请|ask)[:\s]*([^\]]+)\]/i)
  if (bracketMatch) {
    const target = bracketMatch[1].trim()
    const found = agentNames.find(n => target.includes(n))
    if (found) return found
  }
  // @xxx 格式
  for (const name of agentNames) {
    if (content.includes(`@${name}`)) return name
  }
  return null
}

/**
 * 构建 Agent 的系统提示（含 handoff 指令）
 */
function buildAgentSystemPrompt(name: string, role: string, allAgents: string[]): string {
  const others = allAgents.filter(a => a !== name).join("、")
  return `你是 ${name}，一个技术讨论的参与者。
你的角色定位: ${role}

讨论规则:
- 始终从你的角色视角出发发言
- 简洁有力，不要废话
- 可以质疑或补充其他参与者（${others}）的观点
- 发言结束后，用 [交给: XXX] 指定下一个你想听取意见的人（从 ${others} 中选）
- 如果你认为讨论已经充分、可以开始执行了，在回复末尾加上 [END_DISCUSSION]，不要再指定下一个人
- 不要重复别人已经说过的内容
- 用中文讨论`
}

const DESCRIPTION = `Run a multi-agent discussion followed by task execution.

Phase 1 - Discussion: Multiple agents with different roles discuss a topic using handoff.
Phase 2 - Execution: Based on discussion results, a real AI agent executes the final task.

Use this for:
- Architecture review → then implement
- Code review with multiple perspectives → then fix
- Brainstorming → then build
- Trade-off analysis → then decide and execute`

export const MultiAgentTool = Tool.define({
  id: "multi_agent",
  description: DESCRIPTION,
  parameters: z.object({
    topic: z.string().describe("The discussion topic"),
    agents: z.array(z.object({
      name: z.string().describe("Agent name (e.g., '架构师')"),
      role: z.string().describe("Role description (e.g., '关注系统设计和可扩展性')"),
    })).min(2).max(5).describe("Discussion participants (2-5)"),
    finalTask: z.string().optional()
      .describe("Task to execute after discussion (if omitted, returns discussion only)"),
    maxRounds: z.number().optional()
      .describe("Max discussion rounds per agent (default: 3)"),
    executionMode: z.enum(["run", "fork"]).optional()
      .describe("Phase 2 execution mode: run (independent) or fork (inherit config). Default: run"),
    maxTurns: z.number().optional()
      .describe("Max tool calls for Phase 2 execution (default: 30)"),
  }),

  async execute(params, ctx) {
    if (!globalProvider) {
      return {
        title: "multi_agent",
        output: "Error: MultiAgent provider not configured.",
        metadata: { error: true },
      }
    }

    const startTime = Date.now()
    const maxRounds = params.maxRounds || 3
    const agentNames = params.agents.map(a => a.name)
    const totalDiscussionSteps = maxRounds * params.agents.length

    // 创建事件发射器
    const subAgentId = generateSubAgentId()
    const listener = getGlobalSubAgentEventListener()
    const emitter = createSubAgentEmitter(subAgentId, listener ?? undefined, "multi_agent")

    // 发送开始事件
    emitter.start(params.topic, "discussion", totalDiscussionSteps)
    emitter.config({
      maxTurns: totalDiscussionSteps,
      agentType: "discussion",
    })

    try {
      // ================================================================
      // Phase 1: 多角色讨论（handoff 机制）
      // ================================================================
      const discussion: DiscussionMessage[] = []
      let totalTokens = { input: 0, output: 0 }
      let handoffTriggered = false
      let currentAgentIndex = 0
      let stepCount = 0

      // Handoff 驱动循环：不再固定轮转，而是由 Agent 指定下一个发言者
      while (stepCount < totalDiscussionSteps && !handoffTriggered) {
        // 检查取消
        if (ctx.abort?.aborted) {
          const duration = Date.now() - startTime
          emitter.end(false, "讨论被中止", duration, "aborted")
          return {
            title: "multi_agent",
            output: formatResult(discussion, "", "讨论被中止"),
            metadata: { error: false, aborted: true },
          }
        }

        const agent = params.agents[currentAgentIndex]
        const childId = `${agent.name}-s${stepCount + 1}`

        // 发送子任务开始事件
        emitter.childStart(childId, agent.name, `${agent.role}`)

        // 构建 handoff 上下文
        const context = buildDiscussionContext(discussion, params.topic)
        const prompt = discussion.length === 0
          ? `讨论主题: ${params.topic}\n\n请从你的角色视角分享初始观点。发言结束后用 [交给: XXX] 指定下一个发言者。`
          : `${context}\n\n轮到你（${agent.name}）发言了。请从你的角色视角回应，发言结束后用 [交给: XXX] 指定下一个发言者。`

        const systemPrompt = buildAgentSystemPrompt(
          agent.name, agent.role, agentNames
        )

        // 调用 LLM
        const result = await runAskLlm(
          {
            mode: "ask_llm",
            prompt,
            systemPrompt,
            cwd: ctx.cwd,
            abort: ctx.abort,
          },
          globalProvider!
        )

        stepCount++

        if (result.success) {
          discussion.push({
            agent: agent.name,
            role: agent.role,
            content: result.output,
            round: stepCount,
          })
          totalTokens.input += result.usage.inputTokens
          totalTokens.output += result.usage.outputTokens

          // 发送文本事件
          emitter.text(`【${agent.name}】${result.output}`)
          emitter.childEnd(childId, agent.name, true, result.output)

          // 检测结束信号
          if (isHandoffSignal(result.output)) {
            handoffTriggered = true
          } else {
            // 解析 handoff 目标，决定下一个发言者
            const target = extractHandoffTarget(result.output, agentNames)
            if (target) {
              const targetIndex = params.agents.findIndex(a => a.name === target)
              if (targetIndex >= 0) {
                currentAgentIndex = targetIndex
              } else {
                // 找不到目标，默认轮转
                currentAgentIndex = (currentAgentIndex + 1) % params.agents.length
              }
            } else {
              // 没有指定，默认轮转
              currentAgentIndex = (currentAgentIndex + 1) % params.agents.length
            }
          }
        } else {
          emitter.childEnd(childId, agent.name, false, "", result.error)
          // 失败时默认轮转
          currentAgentIndex = (currentAgentIndex + 1) % params.agents.length
        }

        // 更新进度
        emitter.step(stepCount, totalDiscussionSteps)
      }

      const discussionSummary = formatDiscussion(discussion)
      const phase1Duration = Date.now() - startTime

      // ================================================================
      // Phase 2: 执行最终任务（可选）
      // ================================================================
      if (!params.finalTask) {
        // 没有最终任务，只返回讨论结果
        const duration = Date.now() - startTime
        emitter.end(true, discussionSummary, duration, undefined, {
          inputTokens: totalTokens.input,
          outputTokens: totalTokens.output,
        })
        return {
          title: "multi_agent",
          output: formatResult(discussion, "", handoffTriggered ? "讨论达成共识" : "讨论达到轮次上限"),
          metadata: {
            duration,
            phase: "discussion_only",
            rounds: maxRounds,
            agents: params.agents.length,
            messages: discussion.length,
            handoff: handoffTriggered,
            usage: totalTokens,
          },
        }
      }

      // 检查取消
      if (ctx.abort?.aborted) {
        const duration = Date.now() - startTime
        emitter.end(false, "执行被中止", duration, "aborted")
        return {
          title: "multi_agent",
          output: formatResult(discussion, "", "Phase 2 执行前被中止"),
          metadata: { error: false, aborted: true },
        }
      }

      // Phase 2: 展示窗口升级为真实 AI Agent
      emitter.thinking("讨论完成，正在启动执行阶段...")

      // 构建执行提示：将讨论结果注入到最终任务中
      const executionPrompt = `## 背景：多角色讨论结果

${discussionSummary}

---

## 你的任务

基于以上讨论结果，请执行以下任务：

${params.finalTask}`

      let executionOutput = ""
      let executionError: string | undefined

      if (params.executionMode === "fork" || !globalAgentRuntime) {
        // Fork 模式 或 没有 Agent Runtime 时：用 ask_llm 做简单执行
        // （不能调用工具，但可以生成代码/方案）
        const execResult = await runAskLlm(
          {
            mode: "ask_llm",
            prompt: executionPrompt,
            systemPrompt: "你是一个高效的执行者。基于之前的讨论结果，完成用户指定的任务。输出要具体、可操作。",
            cwd: ctx.cwd,
            abort: ctx.abort,
          },
          globalProvider!
        )
        if (execResult.success) {
          executionOutput = execResult.output
          totalTokens.input += execResult.usage.inputTokens
          totalTokens.output += execResult.usage.outputTokens
        } else {
          executionError = execResult.error
        }
      } else {
        // Run 模式：启动真实 Agent Loop，可调用工具
        const agentResult = await runRunAgent(
          {
            mode: "run_agent",
            prompt: executionPrompt,
            agentType: "build",
            maxTurns: params.maxTurns || 30,
            cwd: ctx.cwd,
            abort: ctx.abort,
          },
          {
            ...globalAgentRuntime,
            onEvent: listener || undefined,
          }
        )

        if (agentResult.success) {
          executionOutput = agentResult.output
          totalTokens.input += agentResult.usage.inputTokens
          totalTokens.output += agentResult.usage.outputTokens
        } else {
          executionError = agentResult.error
        }
      }

      const duration = Date.now() - startTime
      const finalOutput = formatResult(
        discussion,
        executionOutput,
        executionError ? `执行失败: ${executionError}` : undefined,
      )

      emitter.end(!executionError, finalOutput, duration, executionError, {
        inputTokens: totalTokens.input,
        outputTokens: totalTokens.output,
      })

      return {
        title: "multi_agent",
        output: finalOutput,
        metadata: {
          duration,
          phase: "discussion_and_execution",
          phase1Duration,
          phase2Duration: duration - phase1Duration,
          rounds: maxRounds,
          agents: params.agents.length,
          messages: discussion.length,
          handoff: handoffTriggered,
          executionMode: params.executionMode || "run",
          usage: totalTokens,
          error: !!executionError,
        },
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      emitter.end(false, errorMsg, duration, errorMsg)
      return {
        title: "multi_agent",
        output: `Error: ${errorMsg}`,
        metadata: { error: true },
      }
    }
  },
})

/**
 * 格式化讨论内容
 */
function formatDiscussion(messages: DiscussionMessage[]): string {
  if (messages.length === 0) return "(无讨论内容)"
  const parts: string[] = []
  let currentRound = 0
  for (const msg of messages) {
    if (msg.round !== currentRound) {
      currentRound = msg.round
      parts.push(`\n### 第 ${currentRound} 轮\n`)
    }
    parts.push(`**${msg.agent}**（${msg.role}）:\n${msg.content}\n`)
  }
  return parts.join("\n")
}

/**
 * 格式化最终输出
 */
function formatResult(
  discussion: DiscussionMessage[],
  executionOutput: string,
  note?: string,
): string {
  const parts: string[] = []

  parts.push("# 多角色讨论")
  if (note) parts.push(`> ${note}`)
  parts.push("")
  parts.push(formatDiscussion(discussion))

  if (executionOutput) {
    parts.push("\n---\n")
    parts.push("# 执行结果\n")
    parts.push(executionOutput)
  }

  return parts.join("\n")
}
