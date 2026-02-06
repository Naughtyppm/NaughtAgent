/**
 * Task 工具 - 统一子任务执行入口
 *
 * 让 Agent 能够启动子任务：
 * - API 模式：简单生成
 * - Workflow 模式：执行预定义流程
 * - Agent 模式：启动子 Agent
 * - 类型快捷方式：explore/plan/build/custom
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { z } from "zod"
import { Tool } from "../tool/tool"
import { runSubTask, type SubTaskRuntime } from "./runner"
import type { SubTaskConfig } from "./types"
import { getAgentRegistry } from "./agent-registry"
import {
  createAgentNotFoundError,
  formatErrorMessage,
} from "./errors"

const DESCRIPTION = `Execute a subtask using one of three modes:

- **api**: Single LLM call without tools. Best for simple generation, translation, summarization.
- **workflow**: Execute a predefined workflow. Best for fixed processes like /commit, /pr.
- **agent**: Start a sub-agent with full tool access. Best for complex exploration tasks.

Type shortcuts (maps to agent mode with preset tools):
- **explore**: Read-only analysis (tools: read, glob, grep)
- **plan**: Planning and research (tools: read, glob, grep, write)
- **build**: Full implementation (tools: all)
- **custom**: Use a custom agent defined in .naughty/agents/

Examples:
- Summarize code: mode="api", prompt="Summarize this function: ..."
- Run commit workflow: mode="workflow", workflow="commit"
- Explore codebase: type="explore", prompt="Find all authentication code"
- Use custom agent: type="custom", customAgent="security-reviewer", prompt="Review auth code"`

/**
 * Task 工具参数 Schema
 */
const TaskParamsSchema = z.object({
  /** 执行模式 */
  mode: z
    .enum(["api", "workflow", "agent"])
    .default("agent")
    .describe("Execution mode: api (simple), workflow (predefined), agent (autonomous)"),

  /** 类型快捷方式（覆盖 mode 为 agent） */
  type: z
    .enum(["explore", "plan", "build", "custom"])
    .optional()
    .describe("Type shortcut: explore (read-only), plan (read+write), build (all), custom (from registry)"),

  /** 自定义 Agent 名称（type 为 custom 时必填） */
  customAgent: z
    .string()
    .optional()
    .describe("Custom agent name from .naughty/agents/ (required when type=custom)"),

  /** 任务描述/提示词 */
  prompt: z.string().describe("Task description or prompt"),

  // API 模式参数
  /** 系统提示词（API 模式） */
  systemPrompt: z
    .string()
    .optional()
    .describe("System prompt for API mode"),

  /** 输出格式（API 模式） */
  outputFormat: z
    .enum(["text", "json"])
    .optional()
    .describe("Output format for API mode"),

  // Workflow 模式参数
  /** 工作流名称（Workflow 模式） */
  workflow: z
    .string()
    .optional()
    .describe("Workflow name for workflow mode"),

  /** 工作流参数（Workflow 模式） */
  params: z
    .record(z.unknown())
    .optional()
    .describe("Parameters for workflow mode"),

  // Agent 模式参数
  /** Agent 类型（Agent 模式） */
  agentType: z
    .enum(["build", "plan", "explore"])
    .optional()
    .describe("Agent type for agent mode"),

  /** 工具白名单 */
  tools: z
    .array(z.string())
    .optional()
    .describe("Specific tools to allow (overrides defaults)"),

  /** 最大步数（Agent 模式） */
  maxSteps: z
    .number()
    .optional()
    .describe("Maximum steps for agent mode"),

  /** 超时时间（毫秒） */
  timeout: z
    .number()
    .optional()
    .describe("Timeout in milliseconds"),
})

export type TaskParams = z.infer<typeof TaskParamsSchema>

/**
 * Task 工具运行时（需要在执行前设置）
 */
let taskRuntime: SubTaskRuntime | null = null

/**
 * 设置 Task 工具运行时
 */
export function setTaskRuntime(runtime: SubTaskRuntime): void {
  taskRuntime = runtime
}

/**
 * 获取 Task 工具运行时
 */
export function getTaskRuntime(): SubTaskRuntime | null {
  return taskRuntime
}

/**
 * Task 工具定义
 */
export const TaskTool = Tool.define({
  id: "task",
  description: DESCRIPTION,
  parameters: TaskParamsSchema,

  async execute(params, ctx) {
    if (!taskRuntime) {
      throw new Error("Task runtime not configured. Call setTaskRuntime() first.")
    }

    // 确保 mode 有默认值
    const mode = params.mode || "agent"

    // 构建子任务配置
    const config = buildSubTaskConfig({ ...params, mode }, ctx.cwd)

    // 执行子任务
    const result = await runSubTask(config, taskRuntime)

    // 格式化输出
    const output = formatTaskOutput(result, mode)

    return {
      title: `${params.mode} task`,
      output,
      metadata: {
        success: result.success,
        mode: params.mode,
        steps: result.steps?.length,
        duration: result.duration,
        usage: result.usage,
      },
    }
  },
})

/**
 * 类型快捷方式到 Agent 配置的映射
 */
const TYPE_TOOL_MAP: Record<string, string[]> = {
  explore: ["read", "glob", "grep"],
  plan: ["read", "glob", "grep", "write"],
  build: [], // 空数组表示使用所有工具
}

/**
 * 构建子任务配置
 */
function buildSubTaskConfig(params: TaskParams, cwd: string): SubTaskConfig {
  const base = {
    prompt: params.prompt,
    cwd,
  }

  // 如果指定了 type，优先使用 type 快捷方式
  if (params.type) {
    if (params.type === "custom") {
      return buildCustomAgentConfig(params, cwd)
    }

    const agentTypeMap: Record<string, "explore" | "plan" | "build"> = {
      explore: "explore",
      plan: "plan",
      build: "build",
    }

    return {
      ...base,
      mode: "agent",
      agentType: agentTypeMap[params.type],
      tools: params.tools || TYPE_TOOL_MAP[params.type],
      maxSteps: params.maxSteps,
    }
  }

  switch (params.mode) {
    case "api":
      return {
        ...base,
        mode: "api",
        systemPrompt: params.systemPrompt,
        outputFormat: params.outputFormat,
      }

    case "workflow":
      if (!params.workflow) {
        throw new Error("Workflow name is required for workflow mode")
      }
      return {
        ...base,
        mode: "workflow",
        workflow: params.workflow,
        params: params.params,
      }

    case "agent":
    default:
      return {
        ...base,
        mode: "agent",
        agentType: params.agentType,
        tools: params.tools,
        maxSteps: params.maxSteps,
      }
  }
}

/**
 * 构建自定义 Agent 配置
 */
function buildCustomAgentConfig(params: TaskParams, cwd: string): SubTaskConfig {
  if (!params.customAgent) {
    throw new Error("customAgent is required when type=custom")
  }

  const registry = getAgentRegistry()
  const agentDef = registry.getAgent(params.customAgent)

  if (!agentDef) {
    const available = registry.listAgents().map((a) => a.name)
    const error = createAgentNotFoundError(params.customAgent, available)
    throw new Error(formatErrorMessage(error))
  }

  return {
    prompt: `${agentDef.systemPrompt}\n\n---\n\nTask: ${params.prompt}`,
    cwd,
    mode: "agent",
    agentType: (agentDef.permissionMode === "allow" ? "build" : "explore") as "build" | "explore",
    tools: params.tools || agentDef.tools,
    maxSteps: params.maxSteps,
  }
}

/**
 * 格式化任务输出
 */
function formatTaskOutput(
  result: { success: boolean; output: string; error?: string; steps?: unknown[]; duration: number },
  mode: string
): string {
  const lines: string[] = []

  if (result.success) {
    lines.push(`✓ ${mode} task completed in ${result.duration}ms`)
  } else {
    lines.push(`✗ ${mode} task failed: ${result.error}`)
  }

  if (result.steps && result.steps.length > 0) {
    lines.push(`  Steps: ${result.steps.length}`)
  }

  lines.push("")
  lines.push(result.output)

  return lines.join("\n")
}
