/**
 * 错误诊断模块 (Error Diagnostics)
 *
 * 分析命令执行失败的原因，提供：
 * - 错误分类（not_found, permission_denied, timeout 等）
 * - 人类可读的错误消息
 * - 修复建议和相似命令推荐
 *
 * @module command/diagnostics
 */

import type { CommandLayer, UnifiedCommand } from './types.js'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 错误类型
 */
export type ErrorType =
  | 'not_found'           // 命令不存在
  | 'permission_denied'   // 权限不足
  | 'timeout'             // 执行超时
  | 'dependency_missing'  // 依赖缺失（如 just 未安装）
  | 'syntax_error'        // 语法/参数错误
  | 'runtime_error'       // 运行时错误
  | 'workflow_error'      // AI 工作流错误
  | 'unknown'             // 未知错误

/**
 * 修复动作
 */
export interface FixAction {
  /** 动作描述 */
  description: string
  /** 可执行的命令（可选） */
  command?: string
}

/**
 * 诊断结果
 */
export interface DiagnosticResult {
  /** 错误类型 */
  errorType: ErrorType
  /** 人类可读的错误消息 */
  message: string
  /** 修复建议列表 */
  suggestions: string[]
  /** 是否可恢复 */
  recoverable: boolean
  /** 修复动作（可选） */
  fixAction?: FixAction
}

/**
 * 诊断上下文
 */
export interface DiagnosticContext {
  /** 命令名称 */
  command?: string
  /** 命令层级 */
  layer?: CommandLayer
  /** 命令参数 */
  args?: string[]
  /** 退出码（subprocess） */
  exitCode?: number
  /** 标准错误输出 */
  stderr?: string
  /** 工作流失败步骤 */
  workflowStep?: string
}

/**
 * 命令查找接口（用于查找相似命令）
 */
export interface CommandLookup {
  /** 获取所有命令 */
  getAll(): UnifiedCommand[]
}

// ============================================================================
// 编辑距离算法
// ============================================================================

/**
 * 计算两个字符串之间的 Levenshtein 编辑距离
 *
 * @param a - 第一个字符串
 * @param b - 第二个字符串
 * @returns 编辑距离
 */
export function levenshteinDistance(a: string, b: string): number {
  // 空字符串处理
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // 创建距离矩阵
  const matrix: number[][] = []

  // 初始化第一列
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i]
  }

  // 初始化第一行
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j
  }

  // 填充矩阵
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // 删除
        matrix[i][j - 1] + 1,      // 插入
        matrix[i - 1][j - 1] + cost // 替换
      )
    }
  }

  return matrix[a.length][b.length]
}

// ============================================================================
// ErrorDiagnostics 类
// ============================================================================

/**
 * 错误诊断器
 *
 * 分析错误并提供诊断结果和修复建议
 *
 * @example
 * ```typescript
 * const diagnostics = new ErrorDiagnostics()
 * const result = diagnostics.diagnose(error, { command: 'hepl' })
 * console.log(result.message)
 * console.log(result.suggestions)
 * ```
 */
export class ErrorDiagnostics {
  /** 相似命令的最大编辑距离 */
  private readonly maxEditDistance: number

  /**
   * 创建错误诊断器
   *
   * @param maxEditDistance - 相似命令的最大编辑距离，默认为 3
   */
  constructor(maxEditDistance: number = 3) {
    this.maxEditDistance = maxEditDistance
  }

  /**
   * 诊断错误
   *
   * @param error - 错误对象或错误消息
   * @param context - 诊断上下文
   * @returns 诊断结果
   */
  diagnose(error: Error | string, context: DiagnosticContext = {}): DiagnosticResult {
    const errorMessage = error instanceof Error ? error.message : error
    const errorType = this.classifyError(errorMessage, context)

    return this.createDiagnosticResult(errorType, errorMessage, context)
  }

  /**
   * 查找相似命令
   *
   * @param name - 输入的命令名称
   * @param lookup - 命令查找接口
   * @returns 相似命令名称列表（按相似度排序）
   */
  findSimilar(name: string, lookup: CommandLookup): string[] {
    const commands = lookup.getAll()
    const lowerName = name.toLowerCase()

    // 计算每个命令的编辑距离
    const candidates: Array<{ name: string; distance: number }> = []

    for (const cmd of commands) {
      // 检查命令名
      const distance = levenshteinDistance(lowerName, cmd.name.toLowerCase())
      if (distance <= this.maxEditDistance) {
        candidates.push({ name: cmd.name, distance })
      }

      // 检查别名
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          const aliasDistance = levenshteinDistance(lowerName, alias.toLowerCase())
          if (aliasDistance <= this.maxEditDistance) {
            // 避免重复添加
            if (!candidates.some(c => c.name === cmd.name)) {
              candidates.push({ name: cmd.name, distance: aliasDistance })
            }
          }
        }
      }
    }

    // 按编辑距离排序，距离相同时按名称排序
    candidates.sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance
      }
      return a.name.localeCompare(b.name)
    })

    // 返回命令名称列表
    return candidates.map(c => c.name)
  }

  /**
   * 分类错误类型
   */
  private classifyError(errorMessage: string, context: DiagnosticContext): ErrorType {
    const lowerMessage = errorMessage.toLowerCase()

    // 依赖缺失（优先检测，因为包含更具体的模式）
    if (
      lowerMessage.includes('just: command not found') ||
      lowerMessage.includes('just is not installed') ||
      lowerMessage.includes('not installed') ||
      lowerMessage.includes('missing dependency')
    ) {
      return 'dependency_missing'
    }

    // ENOENT 需要结合上下文判断
    if (lowerMessage.includes('enoent')) {
      // 如果是 external 层，可能是 just 未安装
      if (context.layer === 'external') {
        return 'dependency_missing'
      }
      return 'dependency_missing'
    }

    // 命令未找到（通用模式）
    if (
      lowerMessage.includes('not found') ||
      lowerMessage.includes('command not found') ||
      lowerMessage.includes('unknown command') ||
      lowerMessage.includes('no such command')
    ) {
      return 'not_found'
    }

    // 权限错误
    if (
      lowerMessage.includes('permission denied') ||
      lowerMessage.includes('access denied') ||
      lowerMessage.includes('eacces') ||
      lowerMessage.includes('eperm')
    ) {
      return 'permission_denied'
    }

    // 超时
    if (
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('timed out') ||
      lowerMessage.includes('etimedout')
    ) {
      return 'timeout'
    }

    // 语法错误
    if (
      lowerMessage.includes('syntax error') ||
      lowerMessage.includes('invalid argument') ||
      lowerMessage.includes('missing argument') ||
      lowerMessage.includes('unexpected token') ||
      lowerMessage.includes('parse error')
    ) {
      return 'syntax_error'
    }

    // 工作流错误（Skill 层）
    if (
      context.layer === 'skill' ||
      context.workflowStep ||
      lowerMessage.includes('workflow') ||
      lowerMessage.includes('skill failed')
    ) {
      return 'workflow_error'
    }

    // 运行时错误（有退出码且非 0）
    if (context.exitCode !== undefined && context.exitCode !== 0) {
      return 'runtime_error'
    }

    // 其他运行时错误关键词
    if (
      lowerMessage.includes('runtime error') ||
      lowerMessage.includes('exception') ||
      lowerMessage.includes('failed to execute')
    ) {
      return 'runtime_error'
    }

    return 'unknown'
  }

  /**
   * 创建诊断结果
   */
  private createDiagnosticResult(
    errorType: ErrorType,
    errorMessage: string,
    context: DiagnosticContext
  ): DiagnosticResult {
    switch (errorType) {
      case 'not_found':
        return this.createNotFoundResult(errorMessage, context)

      case 'permission_denied':
        return this.createPermissionDeniedResult(errorMessage, context)

      case 'timeout':
        return this.createTimeoutResult(errorMessage, context)

      case 'dependency_missing':
        return this.createDependencyMissingResult(errorMessage, context)

      case 'syntax_error':
        return this.createSyntaxErrorResult(errorMessage, context)

      case 'runtime_error':
        return this.createRuntimeErrorResult(errorMessage, context)

      case 'workflow_error':
        return this.createWorkflowErrorResult(errorMessage, context)

      default:
        return this.createUnknownErrorResult(errorMessage, context)
    }
  }

  /**
   * 创建"命令未找到"诊断结果
   */
  private createNotFoundResult(
    _errorMessage: string,
    context: DiagnosticContext
  ): DiagnosticResult {
    const suggestions: string[] = []
    const commandName = context.command || ''

    if (commandName) {
      suggestions.push(`检查命令名称是否正确: /${commandName}`)
      suggestions.push('使用 /help 查看所有可用命令')
    } else {
      suggestions.push('使用 /help 查看所有可用命令')
    }

    return {
      errorType: 'not_found',
      message: commandName
        ? `命令 "/${commandName}" 不存在`
        : '命令不存在',
      suggestions,
      recoverable: true,
    }
  }

  /**
   * 创建"权限不足"诊断结果
   */
  private createPermissionDeniedResult(
    _errorMessage: string,
    _context: DiagnosticContext
  ): DiagnosticResult {
    const suggestions = [
      '检查文件或目录的权限设置',
      '尝试使用 sudo 运行（如果适用）',
      '确认当前用户有执行权限',
    ]

    return {
      errorType: 'permission_denied',
      message: '权限不足，无法执行此操作',
      suggestions,
      recoverable: true,
      fixAction: {
        description: '检查并修复权限',
        command: 'chmod +x <file>',
      },
    }
  }

  /**
   * 创建"超时"诊断结果
   */
  private createTimeoutResult(
    _errorMessage: string,
    _context: DiagnosticContext
  ): DiagnosticResult {
    const suggestions = [
      '命令执行时间过长，已超时',
      '尝试增加超时时间配置',
      '检查命令是否陷入死循环',
      '考虑将任务拆分为更小的步骤',
    ]

    return {
      errorType: 'timeout',
      message: '命令执行超时',
      suggestions,
      recoverable: true,
    }
  }

  /**
   * 创建"依赖缺失"诊断结果
   */
  private createDependencyMissingResult(
    errorMessage: string,
    context: DiagnosticContext
  ): DiagnosticResult {
    const suggestions: string[] = []
    let fixAction: FixAction | undefined

    // 检测是否是 just 未安装
    if (
      errorMessage.toLowerCase().includes('just') ||
      context.layer === 'external'
    ) {
      suggestions.push('just 命令行工具未安装')
      suggestions.push('请先安装 just: https://github.com/casey/just')

      // 根据平台提供安装命令
      fixAction = {
        description: '安装 just 命令行工具',
        command: 'brew install just  # macOS\ncargo install just  # 通用',
      }
    } else {
      suggestions.push('所需的依赖未安装')
      suggestions.push('请检查错误信息并安装缺失的依赖')
    }

    return {
      errorType: 'dependency_missing',
      message: '缺少必要的依赖',
      suggestions,
      recoverable: true,
      fixAction,
    }
  }

  /**
   * 创建"语法错误"诊断结果
   */
  private createSyntaxErrorResult(
    _errorMessage: string,
    context: DiagnosticContext
  ): DiagnosticResult {
    const suggestions = [
      '检查命令参数是否正确',
      '使用 /help <command> 查看命令用法',
    ]

    if (context.command) {
      suggestions.unshift(`命令 /${context.command} 的参数格式不正确`)
    }

    return {
      errorType: 'syntax_error',
      message: '命令语法错误',
      suggestions,
      recoverable: true,
    }
  }

  /**
   * 创建"运行时错误"诊断结果
   */
  private createRuntimeErrorResult(
    _errorMessage: string,
    context: DiagnosticContext
  ): DiagnosticResult {
    const suggestions = ['命令执行过程中发生错误']

    // 添加 stderr 信息
    if (context.stderr) {
      suggestions.push(`错误输出: ${context.stderr.slice(0, 200)}`)
    }

    // 添加退出码信息
    if (context.exitCode !== undefined) {
      suggestions.push(`退出码: ${context.exitCode}`)
    }

    suggestions.push('请检查命令的输入和环境配置')

    return {
      errorType: 'runtime_error',
      message: '命令执行失败',
      suggestions,
      recoverable: false,
    }
  }

  /**
   * 创建"工作流错误"诊断结果
   */
  private createWorkflowErrorResult(
    _errorMessage: string,
    context: DiagnosticContext
  ): DiagnosticResult {
    const suggestions = ['AI 工作流执行失败']

    // 添加失败步骤信息
    if (context.workflowStep) {
      suggestions.push(`失败步骤: ${context.workflowStep}`)
    }

    suggestions.push('请检查工作流配置和输入参数')
    suggestions.push('尝试重新执行或简化任务')

    return {
      errorType: 'workflow_error',
      message: 'AI 工作流执行失败',
      suggestions,
      recoverable: true,
    }
  }

  /**
   * 创建"未知错误"诊断结果
   */
  private createUnknownErrorResult(
    errorMessage: string,
    _context: DiagnosticContext
  ): DiagnosticResult {
    const suggestions = [
      '发生未知错误',
      `错误信息: ${errorMessage.slice(0, 200)}`,
      '请检查日志获取更多信息',
    ]

    return {
      errorType: 'unknown',
      message: '发生未知错误',
      suggestions,
      recoverable: false,
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建错误诊断器实例
 *
 * @param maxEditDistance - 相似命令的最大编辑距离，默认为 3
 * @returns ErrorDiagnostics 实例
 */
export function createErrorDiagnostics(maxEditDistance: number = 3): ErrorDiagnostics {
  return new ErrorDiagnostics(maxEditDistance)
}
