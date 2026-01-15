/**
 * Security 安全系统
 *
 * 负责：
 * - 路径限制（只能访问项目目录内）
 * - 命令黑名单（过滤危险命令）
 * - 安全检查
 */

import * as path from "path"

// ============================================================================
// Types
// ============================================================================

/**
 * 路径检查结果
 */
export interface PathCheckResult {
  /** 是否允许 */
  allowed: boolean
  /** 规范化后的路径 */
  normalizedPath: string
  /** 拒绝原因（如果不允许） */
  reason?: string
}

/**
 * 命令检查结果
 */
export interface CommandCheckResult {
  /** 是否允许 */
  allowed: boolean
  /** 拒绝原因（如果不允许） */
  reason?: string
  /** 匹配的规则 */
  matchedRule?: string
  /** 风险等级 */
  riskLevel: "safe" | "warning" | "danger"
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  /** 项目根目录 */
  projectRoot: string
  /** 允许访问的额外目录 */
  allowedPaths?: string[]
  /** 禁止访问的路径模式 */
  deniedPaths?: string[]
  /** 额外的命令黑名单 */
  deniedCommands?: string[]
  /** 允许的命令白名单（如果设置，只允许这些命令） */
  allowedCommands?: string[]
}

/**
 * 安全检查器
 */
export interface SecurityChecker {
  /** 配置 */
  config: SecurityConfig
  /** 检查路径是否允许访问 */
  checkPath(filePath: string): PathCheckResult
  /** 检查命令是否允许执行 */
  checkCommand(command: string): CommandCheckResult
  /** 规范化路径 */
  normalizePath(filePath: string): string
  /** 检查路径是否在项目内 */
  isInsideProject(filePath: string): boolean
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 敏感路径模式（默认禁止）
 */
export const SENSITIVE_PATHS = [
  // SSH 密钥
  ".ssh",
  ".gnupg",

  // 环境变量和密钥
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",

  // 系统文件（Unix）
  "/etc/passwd",
  "/etc/shadow",
  "/etc/hosts",

  // 云服务配置
  ".aws",
  ".kube",
  ".docker",

  // 浏览器数据
  ".mozilla",
  ".config/google-chrome",
]

/**
 * 敏感文件名模式
 */
export const SENSITIVE_PATTERNS = [
  /secret/i,
  /credential/i,
  /password/i,
  /private[_-]?key/i,
  /id_rsa/,
  /id_ed25519/,
  /\.pem$/,
  /\.key$/,
]

/**
 * 危险命令（直接拒绝）
 */
export const DANGEROUS_COMMANDS: Array<string | RegExp> = [
  // 删除根目录
  /^rm\s+(-[a-zA-Z]*\s+)*(-rf|-fr|-r\s+-f|-f\s+-r)\s+\/\s*$/,
  /^rm\s+(-[a-zA-Z]*\s+)*(-rf|-fr|-r\s+-f|-f\s+-r)\s+\/\*\s*$/,
  /^rm\s+(-[a-zA-Z]*\s+)*(-rf|-fr|-r\s+-f|-f\s+-r)\s+~\s*$/,
  /^rm\s+(-[a-zA-Z]*\s+)*(-rf|-fr|-r\s+-f|-f\s+-r)\s+\$HOME\s*$/,

  // 权限提升
  /^sudo\s+/,
  /^su\s+/,
  /^doas\s+/,

  // 系统修改
  /^mkfs/,
  /^dd\s+if=/,
  /^format\s+[a-zA-Z]:/i,

  // 危险的管道执行
  /curl\s+.*\|\s*(sh|bash)/,
  /wget\s+.*\|\s*(sh|bash)/,

  // 进程控制
  /^kill\s+-9\s+1$/,
  /^killall\s+/,

  // 历史清除
  /^history\s+-c/,
  /^>\s*~\/\.bash_history/,
  /^shred\s+/,

  // Windows 危险命令
  /^format\s+c:/i,
  /^del\s+\/f\s+\/s\s+\/q\s+c:\\/i,
  /^rd\s+\/s\s+\/q\s+c:\\/i,
]

/**
 * 警告命令（允许但提示风险）
 */
export const WARNING_COMMANDS: Array<string | RegExp> = [
  // 删除类（非根目录）
  /^rm\s+(-[a-zA-Z]*\s+)*-rf?\s+/,
  /^rm\s+(-[a-zA-Z]*\s+)*-fr?\s+/,

  // 权限修改
  /^chmod\s+777\s+/,
  /^chmod\s+-R\s+/,

  // Git 危险操作
  /^git\s+reset\s+--hard/,
  /^git\s+clean\s+-fd/,
  /^git\s+push\s+--force/,
  /^git\s+push\s+-f/,

  // 全局安装
  /^npm\s+install\s+-g\s+/,
  /^npm\s+i\s+-g\s+/,
  /^pnpm\s+add\s+-g\s+/,
  /^yarn\s+global\s+add\s+/,
]

// ============================================================================
// Path Security
// ============================================================================

/**
 * 规范化路径
 */
export function normalizePath(filePath: string, basePath: string): string {
  // 处理相对路径
  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(basePath, filePath)
  }

  // 规范化（解析 ../ 等）
  return path.normalize(filePath)
}

/**
 * 检查路径是否在目录内
 */
export function isInsidePath(filePath: string, directory: string): boolean {
  const normalizedFile = path.normalize(filePath)
  const normalizedDir = path.normalize(directory)

  // 确保目录路径以分隔符结尾
  const dirWithSep = normalizedDir.endsWith(path.sep)
    ? normalizedDir
    : normalizedDir + path.sep

  return (
    normalizedFile === normalizedDir ||
    normalizedFile.startsWith(dirWithSep)
  )
}

/**
 * 检查是否匹配敏感路径
 */
export function isSensitivePath(filePath: string): boolean {
  const normalized = path.normalize(filePath).toLowerCase()
  const basename = path.basename(filePath)

  // 检查敏感目录
  for (const sensitive of SENSITIVE_PATHS) {
    if (normalized.includes(path.normalize(sensitive).toLowerCase())) {
      return true
    }
  }

  // 检查敏感文件名模式
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(basename)) {
      return true
    }
  }

  return false
}

/**
 * 检查路径是否允许访问
 */
export function checkPath(
  filePath: string,
  config: SecurityConfig
): PathCheckResult {
  // 1. 规范化路径
  const normalized = normalizePath(filePath, config.projectRoot)

  // 2. 检查是否在项目内
  const insideProject = isInsidePath(normalized, config.projectRoot)

  // 3. 检查是否在允许的额外目录
  let insideAllowed = false
  if (config.allowedPaths) {
    for (const allowedPath of config.allowedPaths) {
      if (isInsidePath(normalized, allowedPath)) {
        insideAllowed = true
        break
      }
    }
  }

  if (!insideProject && !insideAllowed) {
    return {
      allowed: false,
      normalizedPath: normalized,
      reason: "Path is outside project directory",
    }
  }

  // 4. 检查敏感路径
  if (isSensitivePath(normalized)) {
    return {
      allowed: false,
      normalizedPath: normalized,
      reason: "Access to sensitive file is not allowed",
    }
  }

  // 5. 检查自定义禁止路径
  if (config.deniedPaths) {
    for (const denied of config.deniedPaths) {
      if (normalized.includes(denied) || matchGlob(normalized, denied)) {
        return {
          allowed: false,
          normalizedPath: normalized,
          reason: "Path is in denied list",
        }
      }
    }
  }

  return { allowed: true, normalizedPath: normalized }
}

/**
 * 简单的 glob 匹配
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // 简单实现：只支持 * 和 **
  const regexPattern = pattern
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/{{DOUBLE_STAR}}/g, ".*")
    .replace(/\//g, "[/\\\\]")

  const regex = new RegExp(`^${regexPattern}$`, "i")
  return regex.test(filePath)
}

// ============================================================================
// Command Security
// ============================================================================

/**
 * 规范化命令（去除多余空格）
 */
export function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ")
}

/**
 * 检查命令是否匹配模式
 */
function matchesPattern(
  command: string,
  patterns: Array<string | RegExp>
): string | null {
  const normalized = normalizeCommand(command)

  for (const pattern of patterns) {
    if (typeof pattern === "string") {
      // 字符串模式：支持 * 通配符
      const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, ".*")
      const regex = new RegExp(`^${regexPattern}$`, "i")
      if (regex.test(normalized)) {
        return pattern
      }
    } else {
      // 正则模式
      if (pattern.test(normalized)) {
        return pattern.toString()
      }
    }
  }

  return null
}

/**
 * 检查命令是否允许执行
 */
export function checkCommand(
  command: string,
  config?: Pick<SecurityConfig, "deniedCommands" | "allowedCommands">
): CommandCheckResult {
  const normalized = normalizeCommand(command)

  // 1. 检查白名单（如果设置）
  if (config?.allowedCommands && config.allowedCommands.length > 0) {
    const allowed = matchesPattern(normalized, config.allowedCommands)
    if (!allowed) {
      return {
        allowed: false,
        reason: "Command not in allowed list",
        riskLevel: "danger",
      }
    }
  }

  // 2. 检查危险命令
  const dangerMatch = matchesPattern(normalized, DANGEROUS_COMMANDS)
  if (dangerMatch) {
    return {
      allowed: false,
      reason: "Command is dangerous and not allowed",
      matchedRule: dangerMatch,
      riskLevel: "danger",
    }
  }

  // 3. 检查自定义黑名单
  if (config?.deniedCommands) {
    const deniedMatch = matchesPattern(normalized, config.deniedCommands)
    if (deniedMatch) {
      return {
        allowed: false,
        reason: "Command is in denied list",
        matchedRule: deniedMatch,
        riskLevel: "danger",
      }
    }
  }

  // 4. 检查警告命令
  const warningMatch = matchesPattern(normalized, WARNING_COMMANDS)
  if (warningMatch) {
    return {
      allowed: true,
      matchedRule: warningMatch,
      riskLevel: "warning",
    }
  }

  return { allowed: true, riskLevel: "safe" }
}

// ============================================================================
// Security Checker
// ============================================================================

/**
 * 创建安全检查器
 */
export function createSecurityChecker(config: SecurityConfig): SecurityChecker {
  return {
    config,

    checkPath(filePath: string): PathCheckResult {
      return checkPath(filePath, config)
    },

    checkCommand(command: string): CommandCheckResult {
      return checkCommand(command, config)
    },

    normalizePath(filePath: string): string {
      return normalizePath(filePath, config.projectRoot)
    },

    isInsideProject(filePath: string): boolean {
      const normalized = normalizePath(filePath, config.projectRoot)
      return isInsidePath(normalized, config.projectRoot)
    },
  }
}
