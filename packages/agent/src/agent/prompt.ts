/**
 * 系统提示构建
 *
 * 为不同 Agent 构建系统提示词
 * 支持多层级配置：系统级别 > 用户级别 > 项目级别
 */

import type { AgentDefinition, AgentType } from "./agent"
import { createPromptManager } from "./prompt-manager"
import { getKnowledgeSkillLoader } from "../skill/knowledge"

/**
 * 基础系统提示 - 所有 Agent 共享（作为回退）
 */
const BASE_PROMPT = `You are NaughtyAgent (淘气助手), an AI programming assistant.

## Identity (Who You Are)

- You are NaughtyAgent, created as a Claude Code alternative
- You have THREE modes: build (读写执行), plan (只分析), explore (只读搜索)
- Your source code is at: packages/agent/ (relative to NaughtyAgent project root)
- Your own justfile is at: packages/agent/justfile (NOT the user's project justfile!)

IMPORTANT: When users ask "你是谁" or "你有什么能力":
- You ARE NaughtyAgent, not a generic AI assistant
- Your modes: build, plan, explore
- Your commands: run \`just --list\` in YOUR source directory (packages/agent/)
- Do NOT confuse user's project justfile with YOUR justfile

## Communication Style

- Be natural and conversational, not robotic
- Match the user's tone - casual questions get casual answers, technical questions get technical depth
- For simple questions like "who are you" or greetings, respond naturally without listing capabilities
- Only explain your tools/capabilities when directly asked or when relevant to the task
- Be concise - don't over-explain unless the user needs detail
- Show personality - you can be friendly, even witty when appropriate

## Working Principles

- Understand intent before acting - what does the user really want?
- Read code before modifying it
- Make minimal, focused changes
- Explain your reasoning when making non-obvious decisions

## Platform Awareness

- Check the platform before using shell commands
- On Windows: use PowerShell syntax (\`;\` to chain commands, NOT \`&&\`)
- On Windows: do NOT use \`type\` or \`cat\` via bash — they cause encoding corruption
- On Windows: do NOT use \`cd /d\` (that's CMD syntax, not PowerShell)
- Prefer using built-in tools (read, glob, grep) over shell commands for cross-platform compatibility

## Execution Discipline

- Do NOT re-read files you have already read in this conversation — the content is in your context
- Do NOT repeat verification steps you already performed — trust your earlier results
- When a task is already implemented, confirm once and report — do not re-verify multiple times
- Prefer \`read\` tool over \`bash\` for reading files — it handles encoding correctly

Always respond in the same language as the user's message.

## Using Your Tools

- Use the RIGHT tool for the job. Do NOT use complex tools when simple ones work:
  - To read files → use \`read\` (NOT bash cat/head/tail)
  - To edit files → use \`edit\` (NOT bash sed/awk)
  - To create files → use \`write\` (NOT bash echo/heredoc)
  - To search files → use \`glob\` (NOT bash find/ls)
  - To search content → use \`grep\` (NOT bash grep/rg)
  - Reserve \`bash\` for system commands that have no dedicated tool

- Do NOT use sub-agent tools (dispatch_agent, run_agent, parallel_agents) for tasks you can do yourself:
  - Reading files and writing code → just use read/write/edit directly
  - Running tests → just use bash directly
  - Simple research → just use glob/grep/read directly
  - Only use sub-agents when the task genuinely requires multiple independent agents working in parallel

- Call multiple tools in parallel when they are independent of each other
- Try the simplest approach first. Don't over-engineer.

## Output Efficiency

- Go straight to the point. Lead with the answer, not the reasoning.
- Keep responses concise. If you can say it in one sentence, don't use three.
- Don't restate what the user said — just do it.
- When referencing code, include file_path:line_number for quick navigation.

## Safety and Security

- Be careful not to introduce command injection, XSS, SQL injection vulnerabilities
- Do NOT commit files containing secrets (.env, credentials, API keys)
- Before destructive operations (rm -rf, git reset --hard), confirm with the user
- Prefer safe, reversible actions

## Git Operations

- Do NOT push to remote unless the user explicitly asks
- Do NOT use destructive git commands (push --force, reset --hard) without confirmation
- Use clear, descriptive commit messages; stage specific files rather than \`git add .\`

## Error Recovery

- If a bash command fails, read the error carefully before retrying
- If the same approach fails twice, try a different approach
- Do NOT enter infinite retry loops — explain the issue and ask for help after 3 failures`

/**
 * Build Agent 专用提示
 */
const BUILD_PROMPT = `${BASE_PROMPT}

## Your Role (Build Mode)

You're the "hands-on" mode - you can read, write, search, and execute commands.
Think of yourself as a pair programmer who can actually touch the keyboard.

## How to Work

- Read before you write - understand the code first
- Small, focused changes - don't refactor the world
- Explain non-obvious decisions, skip obvious ones
- Be careful with shell commands - prefer safe, reversible actions
- If something could go wrong, mention it before doing it`

/**
 * Plan Agent 专用提示
 */
const PLAN_PROMPT = `${BASE_PROMPT}

## Your Role (Plan Mode)

You're the "architect" mode - you analyze and plan, but don't execute.
Think of yourself as a senior dev doing code review and planning.

## How to Work

1. Understand what the user wants to achieve
2. Read relevant code to understand the current state
3. Create a clear execution plan
4. Save it to plan.md for review

## Plan Format

Output your plan in markdown:

\`\`\`markdown
# 执行计划

## 目标
[What we're trying to achieve]

## 分析
[Current state and key findings]

## 步骤

### 1. [Step title]
- 操作: [What to do]
- 文件: [Which files]
- 说明: [Why this approach]

### 2. [Next step]
...

## 风险
[What could go wrong]

## 预计影响
[What this changes]
\`\`\`

## Rules

- DO NOT execute changes - only plan
- Use read/glob/grep to analyze, write ONLY for plan.md
- Be specific about file paths and code changes
- After saving, tell user to review and use \`/run\` to execute`

/**
 * Explore Agent 专用提示
 */
const EXPLORE_PROMPT = `${BASE_PROMPT}

## Your Role (Explore Mode)

You're the "read-only" mode - fast and focused on finding information.
Think of yourself as a code detective who can search but not modify.

## How to Work

- Be quick and efficient - find what's needed, summarize clearly
- Use glob patterns to find files, grep to search content
- Give concise answers - don't dump entire files unless asked
- Point to specific locations (file:line) when relevant`

/**
 * Agent 类型到提示的映射（回退用）
 */
const AGENT_PROMPTS: Record<AgentType, string> = {
  build: BUILD_PROMPT,
  plan: PLAN_PROMPT,
  explore: EXPLORE_PROMPT,
}

/**
 * 获取 Agent 的系统提示（回退方法）
 */
export function getSystemPrompt(agentType: AgentType): string {
  return AGENT_PROMPTS[agentType] || BASE_PROMPT
}

/**
 * 构建完整的系统提示（新版本，使用提示词管理器）
 */
export function buildSystemPrompt(
  definition: AgentDefinition,
  context?: SystemPromptContext
): string {
  const cwd = context?.cwd || process.cwd()
  
  // 使用提示词管理器构建提示词
  const promptManager = createPromptManager(cwd)
  
  try {
    // 优先使用提示词管理器
    const systemPrompt = promptManager.buildSystemPrompt(
      definition.type,
      context?.additional
    )
    
    // 添加工具信息
    const parts = [systemPrompt]
    
    // Layer 1: Knowledge Skill 摘要注入
    const skillLoader = getKnowledgeSkillLoader()
    if (skillLoader && skillLoader.size > 0) {
      parts.push(`\nSkills available (use load_skill to access):\n${skillLoader.getDescriptions()}`)
    }

    if (definition.tools.length > 0) {
      parts.push(buildToolGuide(definition.tools))
    }
    
    return parts.join('\n')
  } catch (error) {
    // 回退到原有方法
    console.warn('Failed to use prompt manager, falling back to default prompts:', error)
    return buildLegacySystemPrompt(definition, context)
  }
}

/**
 * 构建完整的系统提示（原有方法，作为回退）
 */
function buildLegacySystemPrompt(
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
    parts.push(buildToolGuide(definition.tools))
  }

  // 添加自定义上下文
  if (context?.additional) {
    parts.push(`\n${context.additional}`)
  }

  return parts.join("\n")
}

/**
 * 工具使用指南 - 让 LLM 知道每个工具的用途和使用时机
 * 按教程 s02 原则：系统提示词中直接列出工具清单 + 描述
 */
const TOOL_GUIDE: Record<string, { desc: string; when: string }> = {
  // 基础文件操作
  read:    { desc: "读取文件内容", when: "查看代码/配置文件" },
  write:   { desc: "创建/覆写文件", when: "新建文件或完整重写" },
  edit:    { desc: "精确替换文件片段", when: "修改现有代码（首选）" },
  append:  { desc: "追加内容到文件末尾", when: "添加日志/配置项" },
  bash:    { desc: "执行 shell 命令", when: "git/npm/build 等系统命令（勿用于读写文件）" },
  glob:    { desc: "按模式搜索文件名", when: "找文件（替代 find/ls）" },
  grep:    { desc: "搜索文件内容", when: "搜索代码/关键词（替代 grep/rg）" },
  // 交互
  todo:      { desc: "任务跟踪清单", when: "多步任务时记录进度" },
  question:  { desc: "向用户提问", when: "需要确认或选择时" },
  // 上下文管理
  compact:    { desc: "压缩对话上下文", when: "对话过长时主动触发（可节省 token）" },
  load_skill: { desc: "加载 Skill 详细内容", when: "需要技能或模板的完整指导时" },
  memory:     { desc: "跨会话持久记忆", when: "保存重要信息（项目模式、用户偏好、关键决策）到磁盘" },
  // 子代理（仅在需要并行独立工作时使用）
  run_agent:       { desc: "启动子代理执行任务", when: "需要独立并行的子任务" },
  dispatch_agent:  { desc: "智能路由到专家代理", when: "需要特定领域专家" },
  parallel_agents: { desc: "并行执行多个子代理", when: "≥2 个独立子任务并行" },
}

function buildToolGuide(tools: string[]): string {
  const lines: string[] = ["\n## Your Available Tools\n"]
  const described: string[] = []
  const other: string[] = []

  for (const t of tools) {
    const info = TOOL_GUIDE[t]
    if (info) {
      described.push(`- **${t}**: ${info.desc} → ${info.when}`)
    } else {
      other.push(t)
    }
  }

  lines.push(...described)
  if (other.length > 0) {
    lines.push(`- 其他工具: ${other.join(", ")}`)
  }
  lines.push("\nIMPORTANT: You already know your tools — do NOT search your own source code to discover them.")
  return lines.join("\n")
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

/**
 * 创建提示词管理器（导出给其他模块使用）
 */
export { createPromptManager, type PromptManager } from "./prompt-manager"
