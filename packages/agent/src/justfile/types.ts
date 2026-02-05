/**
 * Justfile 命令系统类型定义
 */

/**
 * 命令参数
 */
export interface JustParameter {
  /** 参数名称 */
  name: string
  /** 是否有默认值 */
  hasDefault: boolean
  /** 默认值 */
  defaultValue?: string
}

/**
 * 解析后的命令信息
 */
export interface JustCommand {
  /** 命令名称 */
  name: string
  /** 命令描述（从注释提取） */
  description: string
  /** 命令参数列表 */
  parameters: JustParameter[]
  /** 命令体（实际执行的脚本） */
  body: string[]
  /** 是否为私有命令（以 _ 开头） */
  isPrivate: boolean
  /** 是否为默认命令 */
  isDefault: boolean
  /** 依赖的其他命令 */
  dependencies: string[]
  /** 原始行号（用于错误报告） */
  lineNumber: number
}

/**
 * 解析错误
 */
export interface ParseError {
  /** 错误消息 */
  message: string
  /** 行号 */
  line: number
  /** 列号 */
  column?: number
}

/**
 * 解析结果
 */
export interface ParseResult {
  /** 解析成功的命令列表 */
  commands: JustCommand[]
  /** 解析错误列表 */
  errors: ParseError[]
}


/**
 * 命令来源
 */
export type CommandSource = 'global' | 'project'

/**
 * 注册的命令（包含来源信息）
 */
export interface RegisteredCommand extends JustCommand {
  /** 命令来源 */
  source: CommandSource
  /** 来源文件路径 */
  sourcePath: string
}

/**
 * 命令注册表配置
 */
export interface RegistryConfig {
  /** 全局 justfile 路径 */
  globalPath: string
  /** 项目 justfile 路径 */
  projectPath: string
  /** 是否监听文件变化 */
  watchChanges?: boolean
}

/**
 * 命令注册表接口
 */
export interface CommandRegistry {
  /** 获取所有命令（已合并，不含私有命令） */
  getCommands(): RegisteredCommand[]
  
  /** 根据名称获取命令 */
  getCommand(name: string): RegisteredCommand | undefined
  
  /** 搜索命令（模糊匹配） */
  searchCommands(query: string): RegisteredCommand[]
  
  /** 重新加载命令 */
  reload(): Promise<void>
  
  /** 重新加载项目命令 */
  reloadProject(projectPath: string): Promise<void>
  
  /** 获取加载错误 */
  getErrors(): { global: ParseError[]; project: ParseError[] }
}

/**
 * 执行选项
 */
export interface ExecuteOptions {
  /** 工作目录 */
  cwd: string
  /** 命令参数 */
  args?: string[]
  /** 超时时间（毫秒） */
  timeout?: number
  /** 环境变量 */
  env?: Record<string, string>
}

/**
 * 执行结果
 */
export interface ExecuteResult {
  /** 是否成功 */
  success: boolean
  /** 标准输出 */
  stdout: string
  /** 标准错误 */
  stderr: string
  /** 退出码 */
  exitCode: number
  /** 执行时间（毫秒） */
  duration: number
}

/**
 * 命令执行器接口
 */
export interface CommandExecutor {
  /** 执行命令 */
  execute(command: RegisteredCommand, options: ExecuteOptions): Promise<ExecuteResult>
  
  /** 检查 just 是否可用 */
  isJustAvailable(): Promise<boolean>
}

/**
 * 完整的命令信息（用于 UI 显示）
 */
export interface CommandInfo {
  /** 命令名称 */
  name: string
  /** 命令描述 */
  description: string
  /** 命令来源 */
  source: CommandSource
  /** 来源图标 */
  sourceIcon: '🌐' | '📁'
  /** 参数信息 */
  parameters: {
    name: string
    required: boolean
    defaultValue?: string
  }[]
  /** 是否为默认命令 */
  isDefault: boolean
}
