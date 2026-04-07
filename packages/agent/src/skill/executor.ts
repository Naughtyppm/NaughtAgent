/**
 * Skill 执行器
 *
 * 解析和执行 /command 命令
 */

import type { SkillResult, SkillContext, ParsedSkillCommand, SkillDefinition } from "./types"
import type { RunWorkflowRuntime } from "../subtask"
import { getSkill, hasSkill } from "./registry"
import { runRunWorkflow, registerWorkflow, getWorkflow } from "../subtask"

// ============================================================================
// Command Parser
// ============================================================================

/**
 * 解析 Skill 命令
 *
 * 支持格式：
 * - /command
 * - /command arg1 arg2
 * - /command --key=value
 * - /command --key value
 * - /command arg1 --key=value
 */
export function parseSkillCommand(input: string): ParsedSkillCommand | null {
  const trimmed = input.trim()

  // 必须以 / 开头
  if (!trimmed.startsWith("/")) {
    return null
  }

  // 匹配命令名
  const match = trimmed.match(/^\/(\w[\w-]*)(?:\s+(.*))?$/)
  if (!match) {
    return null
  }

  const name = match[1]
  const argsStr = match[2] || ""

  // 解析参数
  const args: string[] = []
  const namedArgs: Record<string, string> = {}

  if (argsStr) {
    // 简单的参数解析（支持引号）
    const tokens = tokenize(argsStr)

    let i = 0
    while (i < tokens.length) {
      const token = tokens[i]

      if (token.startsWith("--")) {
        // 命名参数
        const eqIndex = token.indexOf("=")
        if (eqIndex !== -1) {
          // --key=value
          const key = token.slice(2, eqIndex)
          const value = token.slice(eqIndex + 1)
          namedArgs[key] = value
        } else {
          // --key value
          const key = token.slice(2)
          if (i + 1 < tokens.length && !tokens[i + 1].startsWith("--")) {
            namedArgs[key] = tokens[i + 1]
            i++
          } else {
            // 布尔标志
            namedArgs[key] = "true"
          }
        }
      } else {
        // 位置参数
        args.push(token)
      }

      i++
    }
  }

  return { name, args, namedArgs }
}

/**
 * 简单的 token 解析（支持引号）
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let inQuote = false
  let quoteChar = ""

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false
        if (current) {
          tokens.push(current)
          current = ""
        }
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuote = true
      quoteChar = char
    } else if (char === " " || char === "\t") {
      if (current) {
        tokens.push(current)
        current = ""
      }
    } else {
      current += char
    }
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

/**
 * 检查输入是否是 Skill 命令
 */
export function isSkillCommand(input: string): boolean {
  const parsed = parseSkillCommand(input)
  if (!parsed) {
    return false
  }
  return hasSkill(parsed.name)
}

// ============================================================================
// Executor
// ============================================================================

/**
 * Skill 执行器运行时配置
 */
export interface SkillExecutorRuntime extends RunWorkflowRuntime {}

/**
 * 执行 Skill
 */
export async function executeSkill(
  nameOrCommand: string,
  args: string[] = [],
  ctx: SkillContext = { cwd: process.cwd() },
  runtime?: SkillExecutorRuntime
): Promise<SkillResult> {
  const startTime = Date.now()

  // 如果是完整命令，先解析
  let skillName = nameOrCommand
  let skillArgs = args
  let namedArgs: Record<string, string> = {}

  if (nameOrCommand.startsWith("/")) {
    const parsed = parseSkillCommand(nameOrCommand)
    if (!parsed) {
      return {
        success: false,
        output: "",
        error: `Invalid skill command: ${nameOrCommand}`,
        duration: Date.now() - startTime,
      }
    }
    skillName = parsed.name
    skillArgs = [...parsed.args, ...args]
    namedArgs = parsed.namedArgs
  }

  // 获取 Skill 定义
  const skill = getSkill(skillName)
  if (!skill) {
    return {
      success: false,
      output: "",
      error: `Unknown skill: ${skillName}`,
      duration: Date.now() - startTime,
    }
  }

  // 检查运行时
  if (!runtime) {
    return {
      success: false,
      output: "",
      error: "Skill executor runtime not configured",
      duration: Date.now() - startTime,
    }
  }

  // 构建参数
  const params = buildParams(skill, skillArgs, namedArgs)

  // 确保工作流已注册
  const workflowName = `skill:${skill.name}`
  if (!getWorkflow(workflowName)) {
    registerWorkflow({
      ...skill.workflow,
      name: workflowName,
    })
  }

  // 执行工作流
  const result = await runRunWorkflow(
    {
      mode: "workflow",
      prompt: "",
      workflow: workflowName,
      params,
      cwd: ctx.cwd,
      abort: ctx.abort,
    },
    runtime
  )

  return {
    success: result.success,
    output: result.output,
    error: result.error,
    steps: result.steps,
    usage: result.usage,
    duration: result.duration,
  }
}

/**
 * 构建参数
 */
function buildParams(
  skill: SkillDefinition,
  args: string[],
  namedArgs: Record<string, string>
): Record<string, unknown> {
  const params: Record<string, unknown> = {}

  // 应用默认值
  if (skill.parameters) {
    for (const param of skill.parameters) {
      if (param.default !== undefined) {
        params[param.name] = param.default
      }
    }
  }

  // 应用位置参数
  if (skill.parameters && args.length > 0) {
    const positionalParams = skill.parameters.filter((p) => !p.name.startsWith("-"))
    for (let i = 0; i < Math.min(args.length, positionalParams.length); i++) {
      params[positionalParams[i].name] = args[i]
    }
  }

  // 应用命名参数
  for (const [key, value] of Object.entries(namedArgs)) {
    params[key] = value
  }

  return params
}

/**
 * 创建 Skill 执行器实例
 */
export function createSkillExecutor(runtime: SkillExecutorRuntime) {
  return {
    /**
     * 执行 Skill
     */
    execute: (
      nameOrCommand: string,
      args?: string[],
      ctx?: SkillContext
    ): Promise<SkillResult> => {
      return executeSkill(nameOrCommand, args, ctx, runtime)
    },

    /**
     * 解析命令
     */
    parse: parseSkillCommand,

    /**
     * 检查是否是 Skill 命令
     */
    isSkillCommand,
  }
}
