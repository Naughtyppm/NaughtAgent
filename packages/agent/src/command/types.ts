/**
 * 统一命令系统类型定义
 *
 * 定义三层命令架构的核心类型：
 * - Builtin Layer: 内置命令，同步执行
 * - External Layer: 外部命令（justfile），子进程执行
 * - Skill Layer: AI 技能，工作流执行
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 命令层级
 */
export type CommandLayer = 'builtin' | 'external' | 'skill'

/**
 * 执行模式
 */
export type ExecutionMode = 'sync' | 'subprocess' | 'workflow'

/**
 * 命令来源
 */
export type CommandSource =
  | 'builtin'           // 内置
  | 'global-justfile'   // ~/.naughtyagent/justfile
  | 'project-justfile'  // ./justfile
  | 'builtin-skill'     // 内置 skill
  | 'global-skill'      // ~/.naughtyagent/skills/
  | 'project-skill'     // .naughtyagent/skills/

// ============================================================================
// 命令定义
// ============================================================================

/**
 * 命令参数
 */
export interface CommandParameter {
  /** 参数名称 */
  name: string
  /** 参数描述 */
  description?: string
  /** 是否必需 */
  required: boolean
  /** 默认值 */
  defaultValue?: string
}

/**
 * 统一命令接口
 *
 * 包含所有层级命令的通用属性和特定属性
 */
export interface UnifiedCommand {
  /** 命令名称（不含 /） */
  name: string
  /** 描述 */
  description: string
  /** 层级 */
  layer: CommandLayer
  /** 执行模式 */
  executionMode: ExecutionMode
  /** 来源 */
  source: CommandSource
  /** 参数 */
  parameters: CommandParameter[]
  /** 来源路径（外部命令） */
  sourcePath?: string
  /** 别名 */
  aliases?: string[]

  // Skill 特有属性
  /** 是否禁止 AI 自动调用 */
  disableModelInvocation?: boolean
  /** 上下文模式 */
  contextMode?: 'main' | 'fork'
  /** 允许的工具 */
  allowedTools?: string[]
  /** 指定模型 */
  model?: string
}

// ============================================================================
// 常量
// ============================================================================

/**
 * 层级优先级（数值越小优先级越高）
 *
 * 当多个层级存在同名命令时，按此优先级选择
 */
export const LAYER_PRIORITY: Record<CommandLayer, number> = {
  builtin: 0,
  skill: 1,
  external: 2,
}

/**
 * 层级图标
 *
 * 用于 UI 显示，区分不同层级的命令
 */
export const LAYER_ICONS: Record<CommandLayer, string> = {
  builtin: '⚡',
  external: '📁',
  skill: '🤖',
}

// ============================================================================
// 路由结果
// ============================================================================

/**
 * 路由类型
 */
export type RoutingType = 'command' | 'natural-language'

/**
 * 路由结果
 *
 * 描述输入解析后的路由信息
 */
export interface RoutingResult {
  /** 路由类型 */
  type: RoutingType
  /** 命令信息（type='command' 时） */
  command?: UnifiedCommand
  /** 命令名（可能未找到） */
  commandName?: string
  /** 解析的参数 */
  args: string[]
  /** 命名参数 */
  namedArgs: Record<string, string>
  /** 原始输入 */
  rawInput: string
  /** 是否找到命令 */
  found: boolean
}

// ============================================================================
// 执行结果
// ============================================================================

/**
 * 统一执行结果
 *
 * 所有层级命令执行后返回的统一结果格式
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean
  /** 输出内容 */
  output: string
  /** 错误信息 */
  error?: string
  /** 执行时间（毫秒） */
  duration: number
  /** 命令层级 */
  layer: CommandLayer
  /** 是否需要退出应用 */
  exit?: boolean
  /** 附加数据 */
  data?: Record<string, unknown>

  // Subprocess 特有
  /** 退出码 */
  exitCode?: number
  /** stderr */
  stderr?: string

  // Workflow 特有
  /** 执行的步骤 */
  steps?: unknown[]
  /** Token 使用 */
  usage?: { inputTokens: number; outputTokens: number }
}
