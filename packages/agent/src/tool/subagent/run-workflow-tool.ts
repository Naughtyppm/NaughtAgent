/**
 * run_workflow 工具 - 多阶段流程
 * 
 * 特点：
 * - 有窗口（独立会话）
 * - 可调用工具
 * - 可选继承上下文
 * - 用途：结构化多轮对话
 */

import { z } from "zod"
import { Tool } from "../tool"
import { runRunWorkflow, getWorkflow, listWorkflows, type RunWorkflowRuntime } from "../../subtask"
import { getGlobalSubAgentEventListener } from "../../subtask/global-listener"
import { generateSubAgentId, createSubAgentEmitter } from "../../subtask/events"

// 全局运行时引用
let globalRuntime: RunWorkflowRuntime | null = null

export function setRunWorkflowRuntime(runtime: RunWorkflowRuntime) {
  globalRuntime = runtime
}

const DESCRIPTION = `Run a predefined workflow with multiple stages.

Use this for:
- Complex multi-step processes
- Structured analysis pipelines
- Tasks with defined stages and conditions

Available workflows can be listed with the 'list' action.
Each workflow has predefined steps that execute in sequence.`

export const RunWorkflowTool = Tool.define({
  id: "run_workflow",
  description: DESCRIPTION,
  parameters: z.object({
    action: z.enum(["run", "list"]).describe("Action: 'run' to execute, 'list' to see available workflows"),
    workflow: z.string().optional().describe("Workflow name (required for 'run' action)"),
    prompt: z.string().optional().describe("Initial prompt/context for the workflow"),
    params: z.record(z.unknown()).optional().describe("Additional parameters for the workflow"),
  }),

  async execute(params, ctx) {
    // List action
    if (params.action === "list") {
      const workflows = listWorkflows()
      if (workflows.length === 0) {
        return {
          title: "run_workflow",
          output: "No workflows registered. Use registerWorkflow() to add workflows.",
          metadata: {},
        }
      }

      const list = workflows.map(w => `- ${w.name}: ${w.description}`).join("\n")
      return {
        title: "run_workflow",
        output: `Available workflows:\n${list}`,
        metadata: { count: workflows.length },
      }
    }

    // Run action
    if (!params.workflow) {
      return {
        title: "run_workflow",
        output: "Error: 'workflow' parameter is required for 'run' action",
        metadata: { error: true },
      }
    }

    const workflow = getWorkflow(params.workflow)
    if (!workflow) {
      const available = listWorkflows().map(w => w.name).join(", ")
      return {
        title: "run_workflow",
        output: `Error: Workflow '${params.workflow}' not found. Available: ${available || "none"}`,
        metadata: { error: true },
      }
    }

    if (!globalRuntime) {
      return {
        title: "run_workflow",
        output: "Error: RunWorkflow runtime not configured.",
        metadata: { error: true },
      }
    }

    const startTime = Date.now()

    // 创建事件发射器
    const subAgentId = generateSubAgentId()
    const listener = getGlobalSubAgentEventListener()
    const emitter = createSubAgentEmitter(subAgentId, listener ?? undefined, "run_workflow")

    // 发送开始事件
    emitter.start(params.prompt || params.workflow, "workflow", workflow.steps?.length || 10)

    // 发送配置事件
    emitter.config({
      maxTurns: workflow.steps?.length || 10,
      agentType: "workflow",
    })

    try {
      const result = await runRunWorkflow(
        {
          mode: "run_workflow",
          prompt: params.prompt || "",
          workflow: params.workflow,
          params: params.params,
          cwd: ctx.cwd,
          abort: ctx.abort,
        },
        {
          ...globalRuntime,
          emitter,
        }
      )

      const duration = Date.now() - startTime

      if (result.success) {
        const stepsInfo = result.steps?.length
          ? `\n\n[Completed ${result.steps.length} workflow steps]`
          : ""

        // 发送结束事件
        emitter.end(true, result.output, duration, undefined, result.usage)

        return {
          title: "run_workflow",
          output: result.output + stepsInfo,
          metadata: {
            duration,
            usage: result.usage,
            steps: result.steps?.length || 0,
          },
        }
      } else {
        // 发送错误结束事件
        emitter.end(false, result.error || "Unknown error", duration, result.error)

        return {
          title: "run_workflow",
          output: `Error: ${result.error}`,
          metadata: { error: true, duration },
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      
      // 发送错误结束事件
      emitter.end(false, errorMsg, duration, errorMsg)

      return {
        title: "run_workflow",
        output: `Error: ${errorMsg}`,
        metadata: { error: true },
      }
    }
  },
})
