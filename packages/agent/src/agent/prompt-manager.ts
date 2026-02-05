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
    parts.push(`
## Environment
- Current working directory: ${this.cwd}
- Today's date: ${now.toISOString().split('T')[0]} (星期${weekdays[now.getDay()]})
- Platform: ${process.platform}`)

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

## Core Principles
- Understand intent before acting
- Read code before modifying it
- Make minimal, focused changes
- Explain reasoning for non-obvious decisions
- Prefer built-in tools over shell commands for cross-platform compatibility

## Platform Awareness
- On Windows: use dir instead of ls, findstr instead of grep
- Prefer using built-in tools (glob, grep tool) over shell commands

Always respond in the same language as the user's message.`

  // 模式特定提示
  const modePrompts: Record<AgentType, string> = {
    build: `

## Build Mode
You can read, write, search, and execute commands.
- Read before you write
- Small, focused changes
- Be careful with shell commands`,

    plan: `

## Plan Mode
You analyze and plan, but don't execute.
- Create clear execution plans
- Save plans to plan.md
- Use read/glob/grep to analyze`,

    explore: `

## Explore Mode
Read-only mode for finding information.
- Be quick and efficient
- Give concise answers
- Point to specific locations (file:line)`
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
