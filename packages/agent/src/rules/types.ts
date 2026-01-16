/**
 * Rules 索引系统类型定义
 *
 * 按需加载项目规则，根据任务上下文匹配相关规则
 */

// ============================================================================
// Rule Triggers
// ============================================================================

/**
 * Glob 触发条件 - 文件路径匹配
 */
export interface GlobTrigger {
  type: "glob"
  /** glob 模式，如 "*.ts", "src/**\/*.tsx" */
  pattern: string
}

/**
 * Command 触发条件 - 命令匹配
 */
export interface CommandTrigger {
  type: "command"
  /** 命令模式，如 "/commit", "git *" */
  pattern: string
}

/**
 * Keyword 触发条件 - 关键词匹配
 */
export interface KeywordTrigger {
  type: "keyword"
  /** 关键词列表 */
  words: string[]
}

/**
 * Tool 触发条件 - 工具调用匹配
 */
export interface ToolTrigger {
  type: "tool"
  /** 工具名称列表 */
  names: string[]
}

/**
 * 触发条件联合类型
 */
export type RuleTrigger = GlobTrigger | CommandTrigger | KeywordTrigger | ToolTrigger

// ============================================================================
// Rule Metadata
// ============================================================================

/**
 * 规则元数据
 */
export interface RuleMeta {
  /** 规则 ID（唯一标识） */
  id: string
  /** 规则文件路径（相对于 rules 目录） */
  file: string
  /** 描述 */
  description: string
  /** 触发条件 */
  triggers: RuleTrigger[]
  /** 优先级（数字越大越优先，默认 0） */
  priority?: number
  /** 是否始终加载 */
  alwaysLoad?: boolean
}

/**
 * 规则索引
 */
export interface RulesIndex {
  /** 版本号 */
  version: number
  /** 规则列表 */
  rules: RuleMeta[]
}

/**
 * 加载的规则（包含内容）
 */
export interface LoadedRule {
  /** 规则元数据 */
  meta: RuleMeta
  /** 规则内容 */
  content: string
}

// ============================================================================
// Match Context
// ============================================================================

/**
 * 匹配上下文 - 用于确定加载哪些规则
 */
export interface MatchContext {
  /** 当前处理的文件路径 */
  files?: string[]
  /** 用户输入文本 */
  input?: string
  /** 正在执行的命令/技能（如 /commit） */
  command?: string
  /** 正在调用的工具名称 */
  tools?: string[]
}

// ============================================================================
// Project Commands
// ============================================================================

/**
 * 指令来源
 */
export type CommandSource = "justfile" | "makefile" | "package.json" | "scripts"

/**
 * 项目指令
 */
export interface ProjectCommand {
  /** 指令名称 */
  name: string
  /** 描述 */
  description?: string
  /** 实际执行的命令 */
  command: string
  /** 来源 */
  source: CommandSource
}

/**
 * 项目指令索引
 */
export interface CommandsIndex {
  /** 指令列表 */
  commands: ProjectCommand[]
  /** 发现时间 */
  discoveredAt: string
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Rules 配置
 */
export interface RulesConfig {
  /** 是否自动发现规则（默认 true） */
  autoDiscover?: boolean
  /** 每次请求最多加载的规则数（默认 5） */
  maxRulesPerRequest?: number
  /** 缓存超时时间（毫秒，默认 5 分钟） */
  cacheTimeout?: number
}

/**
 * Commands 配置
 */
export interface CommandsConfig {
  /** 是否发现项目指令（默认 true） */
  discover?: boolean
  /** 指令来源（默认全部） */
  sources?: CommandSource[]
}

/**
 * 默认 Rules 配置
 */
export const DEFAULT_RULES_CONFIG: Required<RulesConfig> = {
  autoDiscover: true,
  maxRulesPerRequest: 5,
  cacheTimeout: 5 * 60 * 1000, // 5 分钟
}

/**
 * 默认 Commands 配置
 */
export const DEFAULT_COMMANDS_CONFIG: Required<CommandsConfig> = {
  discover: true,
  sources: ["justfile", "makefile", "package.json", "scripts"],
}
