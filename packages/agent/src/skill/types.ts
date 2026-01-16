/**
 * Skills 技能系统类型定义
 *
 * Skills 是预定义的快捷命令，基于 Workflow 模式实现
 */

import type { WorkflowDefinition, SubTaskStep } from "../subtask"

// ============================================================================
// Skill Definition
// ============================================================================

/**
 * Skill 参数定义
 */
export interface SkillParameter {
  /** 参数名 */
  name: string
  /** 描述 */
  description: string
  /** 是否必需 */
  required?: boolean
  /** 默认值 */
  default?: string
}

/**
 * Skill 定义
 */
export interface SkillDefinition {
  /** Skill 名称（不含 /） */
  name: string
  /** 描述 */
  description: string
  /** 别名 */
  aliases?: string[]
  /** 参数定义 */
  parameters?: SkillParameter[]
  /** 工作流定义 */
  workflow: WorkflowDefinition
}

// ============================================================================
// Skill Execution
// ============================================================================

/**
 * Skill 执行结果
 */
export interface SkillResult {
  /** 是否成功 */
  success: boolean
  /** 输出内容 */
  output: string
  /** 错误信息 */
  error?: string
  /** 执行的步骤 */
  steps?: SubTaskStep[]
  /** Token 使用 */
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  /** 执行时间（毫秒） */
  duration?: number
}

/**
 * Skill 执行上下文
 */
export interface SkillContext {
  /** 工作目录 */
  cwd: string
  /** 取消信号 */
  abort?: AbortSignal
  /** API Key（可选） */
  apiKey?: string
  /** API Base URL（可选） */
  baseURL?: string
}

/**
 * 解析后的 Skill 命令
 */
export interface ParsedSkillCommand {
  /** Skill 名称 */
  name: string
  /** 参数列表 */
  args: string[]
  /** 命名参数 */
  namedArgs: Record<string, string>
}
