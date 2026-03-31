/**
 * 提示词管理系统 (简化版，借鉴 Claude Code)
 *
 * 设计原则：
 * 1. 简单直接 - 不解析 Markdown 结构，原样注入
 * 2. 多层级合并 - 全局 + 项目级别都加载
 * 3. 统一文件名 - NAUGHTY.md（类似 CLAUDE.md）
 *
 * 加载位置：
 * - 全局：~/.naughtyagent/NAUGHTY.md
 * - 项目：{cwd}/NAUGHTY.md
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { AgentType } from "./agent"
import { createContextInjector, createDefaultIndexCache } from "../context"

/**
 * 用户指令配置
 */
export interface UserInstructions {
  /** 全局指令（来自 ~/.naughtyagent/NAUGHTY.md） */
  global?: string
  /** 项目指令（来自 {cwd}/NAUGHTY.md） */
  project?: string
}

/**
 * 提示词文件路径
 */
export interface InstructionPaths {
  /** 全局指令文件 */
  global: string
  /** 项目指令文件 */
  project: string
}

/**
 * 获取指令文件路径
 */
function getInstructionPaths(cwd: string): InstructionPaths {
  return {
    global: join(homedir(), '.naughtyagent', 'NAUGHTY.md'),
    project: join(cwd, 'NAUGHTY.md')
  }
}

/**
 * 安全读取文件内容
 */
function safeReadFile(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null
  }

  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * 提示词管理器
 */
export class PromptManager {
  private cwd: string
  private paths: InstructionPaths
  private cachedInstructions: UserInstructions | null = null

  constructor(cwd: string) {
    this.cwd = cwd
    this.paths = getInstructionPaths(cwd)
  }

  /**
   * 加载用户指令
   */
  loadInstructions(): UserInstructions {
    if (this.cachedInstructions) {
      return this.cachedInstructions
    }

    const global = safeReadFile(this.paths.global)
    const project = safeReadFile(this.paths.project)

    this.cachedInstructions = {
      global: global || undefined,
      project: project || undefined
    }

    return this.cachedInstructions
  }

  /**
   * 构建系统提示词
   *
   * 结构：
   * 1. 默认系统提示词
   * 2. 全局用户指令（如果存在）
   * 3. 项目用户指令（如果存在）
   * 4. 项目上下文（如果启用）
   * 5. 工作目录信息
   * 6. 额外上下文
   */
  buildSystemPrompt(agentType: AgentType, additionalContext?: string): string {
    const instructions = this.loadInstructions()
    const parts: string[] = []

    // 1. 默认系统提示词
    parts.push(getDefaultSystemPrompt(agentType))

    // 2. 全局用户指令（原样注入，使用特殊标签）
    if (instructions.global) {
      parts.push(`
<user-instructions source="global" path="${this.paths.global}">
${instructions.global}
</user-instructions>`)
    }

    // 3. 项目用户指令（原样注入，使用特殊标签）
    if (instructions.project) {
      parts.push(`
<user-instructions source="project" path="${this.paths.project}">
${instructions.project}
</user-instructions>`)
    }

    // 4. 项目上下文注入（需求 3.1, 3.2, 3.3, 3.4）
    // 注意：这是同步方法，所以我们使用缓存的索引
    // 如果需要异步加载，应该在调用前预热缓存
    try {
      const indexCache = createDefaultIndexCache(this.cwd)
      const contextInjector = createContextInjector()
      
      // 尝试从缓存加载索引
      const cachedIndex = indexCache.loadSync()
      if (cachedIndex) {
        const projectContext = contextInjector.buildProjectContext(cachedIndex)
        if (projectContext) {
          parts.push(`\n${projectContext}`)
        }
      }
    } catch {
      // 忽略上下文注入错误，不影响主流程
    }

    // 5. 环境信息
    const now = new Date()
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const isWindows = process.platform === 'win32'
    parts.push(`
## Environment
- Current working directory: ${this.cwd}
- Today's date: ${now.toISOString().split('T')[0]} (星期${weekdays[now.getDay()]})
- Platform: ${process.platform}${isWindows ? `
- Shell: PowerShell (use \`;\` to chain commands, NOT \`&&\`; do NOT use \`cd /d\`; do NOT use \`type\` to read UTF-8 files)
- Encoding: Use \`read\` tool for file reading — NEVER use \`type\` or \`cat\` via bash, they cause encoding corruption on Windows` : ''}

## Execution Discipline
- Do NOT re-read files you have already read in this conversation — the content is in your context
- Do NOT repeat verification steps you already performed — trust your earlier results
- When a task is already implemented, confirm once and report — do not re-verify multiple times
- Use the todo/task list to track what you've done; check it before repeating work
- Prefer \`read\` tool over \`bash\` for reading files — it handles encoding correctly`)


    // 6. 额外上下文
    if (additionalContext) {
      parts.push(`\n${additionalContext}`)
    }

    return parts.join('\n')
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedInstructions = null
  }

  /**
   * 检查是否存在项目指令
   */
  hasProjectInstructions(): boolean {
    return existsSync(this.paths.project)
  }

  /**
   * 检查是否存在全局指令
   */
  hasGlobalInstructions(): boolean {
    return existsSync(this.paths.global)
  }

  /**
   * 获取指令文件路径
   */
  getInstructionPaths(): InstructionPaths {
    return { ...this.paths }
  }
}

/**
 * 获取默认系统提示词
 */
function getDefaultSystemPrompt(agentType: AgentType): string {
  const base = `You are NaughtyAgent (淘气助手), an AI programming assistant.

## Identity
- You are NaughtyAgent, created as a Claude Code alternative
- You have THREE modes: build (读写执行), plan (只分析), explore (只读搜索)
- Current mode: ${agentType}

Always respond in the same language as the user's message.

## Using Your Tools

IMPORTANT: Do NOT use \`bash\` when a dedicated tool exists. Using dedicated tools is CRITICAL:
- To read files → use \`read\` (NOT bash cat/head/tail/type)
- To edit files → use \`edit\` (NOT bash sed/awk)
- To create files → use \`write\` (NOT bash echo/heredoc)
- To search files by name → use \`glob\` (NOT bash find/ls/dir)
- To search file contents → use \`grep\` (NOT bash grep/rg/findstr)
- Reserve \`bash\` ONLY for system commands that have no dedicated tool (git, npm, build commands, etc.)

When calling multiple tools that are independent of each other, call them in parallel for efficiency.

Do NOT use sub-agent tools (dispatch_agent, run_agent) for tasks you can do yourself:
- Reading/writing/editing files → use read/write/edit directly
- Running tests or builds → use bash directly
- Searching code → use glob/grep directly
- Only use sub-agents for genuinely parallel independent work

## Execution Discipline

- Do NOT re-read files already in your conversation context — you already have the content
- Do NOT repeat verification steps you already performed — trust your earlier results
- When a task is already complete, confirm once and report — do not re-verify 3+ times
- Try the simplest approach first. Don't over-engineer
- If a tool call fails, analyze the error before retrying — do not blindly retry the same command
- If you are stuck, stop and explain the blocker to the user instead of looping

## Output Efficiency

- Go straight to the point. Lead with the answer or action, not the reasoning
- Keep responses concise — one sentence beats three when it conveys the same meaning
- Don't restate what the user said. Just do it
- Focus text output on: decisions needing input, status at milestones, errors or blockers
- When referencing code, include file_path:line_number for quick navigation

## Safety and Security

- Be careful not to introduce command injection, XSS, SQL injection, or other OWASP top 10 vulnerabilities
- Do NOT commit files that likely contain secrets (.env, credentials.json, API keys)
- When running shell commands, prefer safe, reversible actions
- Before destructive operations (rm -rf, git reset --hard, DROP TABLE), confirm with the user
- Do NOT expose sensitive data in tool outputs or responses

## Git Operations

- Do NOT push to remote unless the user explicitly asks
- Do NOT use destructive git commands (push --force, reset --hard, checkout .) without user confirmation
- For commits: use clear, descriptive messages; stage specific files rather than \`git add .\`
- Never skip pre-commit hooks (--no-verify) unless explicitly asked

## Error Recovery

- If a bash command fails, read the error message carefully before retrying
- If the same approach fails twice, try a different approach
- If you cannot solve a problem after 3 attempts, explain what you've tried and ask the user for help
- Do NOT enter infinite retry loops`

  // 模式特定提示
  const modePrompts: Record<AgentType, string> = {
    build: `

## Build Mode
You can read, write, search, and execute commands. Act as a pair programmer.
- Read code before modifying it — understand context first
- Make small, focused changes — don't refactor the world
- Explain non-obvious decisions, skip obvious ones
- After making changes, verify they work (run tests/typecheck if available)`,

    plan: `

## Plan Mode
You analyze and plan, but don't execute changes.
- Create clear execution plans with specific file paths
- Save plans to plan.md
- Use read/glob/grep to analyze — write ONLY for plan files
- After saving, tell user to review the plan`,

    explore: `

## Explore Mode
Read-only mode for finding information quickly.
- Be quick and efficient — find what's needed, summarize clearly
- Use glob patterns and grep to search
- Give concise answers with file:line references
- Don't dump entire files unless asked`
  }

  return base + (modePrompts[agentType] || '')
}

/**
 * 创建提示词管理器
 */
export function createPromptManager(cwd: string): PromptManager {
  return new PromptManager(cwd)
}

// 兼容旧接口
export interface PromptConfig {
  system?: string
  modes?: Record<string, string>
  execution_discipline?: string
  working_principles?: string[]
  communication_style?: string
  project_rules?: string[]
  custom_instructions?: string
}

export interface PromptPaths {
  system: string
  user: string
  project: string
}
