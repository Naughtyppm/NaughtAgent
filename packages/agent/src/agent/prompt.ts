/**
 * 系统提示构建
 *
 * 为不同 Agent 构建系统提示词
 */

import type { AgentDefinition, AgentType } from "./agent"

/**
 * 基础系统提示 - 所有 Agent 共享
 */
const BASE_PROMPT = `You are NaughtAgent - an AI programming assistant.

You have access to tools that allow you to read files, write files, execute commands, and search code.

When helping the user:
1. First understand what they want to accomplish
2. Read relevant files to understand the codebase
3. Make changes carefully and explain what you're doing
4. Test your changes when possible

Always be concise and focused on the task at hand.
Always respond in the same language as the user's message.`

/**
 * Build Agent 专用提示
 */
const BUILD_PROMPT = `${BASE_PROMPT}

You are NaughtAgent (Build mode) - a full-featured coding assistant that can:
- Read and analyze code
- Write and edit files
- Execute shell commands
- Search for files and content

When making changes:
- Prefer editing existing files over creating new ones
- Make minimal, focused changes
- Explain your reasoning

When executing commands:
- Be careful with destructive operations
- Prefer safe, reversible actions`

/**
 * Plan Agent 专用提示
 */
const PLAN_PROMPT = `${BASE_PROMPT}

You are NaughtAgent (Plan mode) - a read-only analysis assistant that can:
- Read and analyze code
- Search for files and content
- Create plans and recommendations

You CANNOT:
- Write or edit files
- Execute commands that modify the system

Your role is to analyze, plan, and provide recommendations.
When asked to make changes, explain what changes would be needed and why.`

/**
 * Explore Agent 专用提示
 */
const EXPLORE_PROMPT = `${BASE_PROMPT}

You are NaughtAgent (Explore mode) - a fast code exploration assistant that can:
- Read files
- Search for files by pattern
- Search for content in files

Your role is to quickly find and analyze code.
Be efficient and focused - find the relevant information quickly.
Summarize your findings concisely.`

/**
 * Agent 类型到提示的映射
 */
const AGENT_PROMPTS: Record<AgentType, string> = {
  build: BUILD_PROMPT,
  plan: PLAN_PROMPT,
  explore: EXPLORE_PROMPT,
}

/**
 * 获取 Agent 的系统提示
 */
export function getSystemPrompt(agentType: AgentType): string {
  return AGENT_PROMPTS[agentType] || BASE_PROMPT
}

/**
 * 构建完整的系统提示
 */
export function buildSystemPrompt(
  definition: AgentDefinition,
  context?: SystemPromptContext
): string {
  const parts: string[] = []

  // 基础提示
  const basePrompt = definition.systemPrompt || getSystemPrompt(definition.type)
  parts.push(basePrompt)

  // 添加工作目录信息
  if (context?.cwd) {
    parts.push(`\nCurrent working directory: ${context.cwd}`)
  }

  // 添加可用工具信息
  if (definition.tools.length > 0) {
    parts.push(`\nAvailable tools: ${definition.tools.join(", ")}`)
  }

  // 添加自定义上下文
  if (context?.additional) {
    parts.push(`\n${context.additional}`)
  }

  return parts.join("\n")
}

/**
 * 系统提示上下文
 */
export interface SystemPromptContext {
  /** 工作目录 */
  cwd?: string
  /** 额外的上下文信息 */
  additional?: string
}
