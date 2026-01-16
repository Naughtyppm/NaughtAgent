/**
 * 触发条件匹配器
 *
 * 根据上下文匹配规则的触发条件
 */

import type {
  RuleTrigger,
  RuleMeta,
  RulesIndex,
  MatchContext,
  GlobTrigger,
  CommandTrigger,
  KeywordTrigger,
  ToolTrigger,
} from "./types"

// ============================================================================
// Glob Matching
// ============================================================================

/**
 * 简单的 glob 匹配
 * 支持 * 和 ** 通配符
 */
export function matchGlob(pattern: string, filePath: string): boolean {
  // 标准化路径分隔符
  const normalizedPath = filePath.replace(/\\/g, "/")
  const normalizedPattern = pattern.replace(/\\/g, "/")

  // 转换 glob 模式为正则表达式
  let regexPattern = normalizedPattern
    // 转义特殊字符
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // **/ 匹配零个或多个目录（包括空）
    .replace(/\*\*\//g, "{{GLOBSTAR_SLASH}}")
    // ** 匹配任意路径
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    // * 匹配单层路径中的任意字符
    .replace(/\*/g, "[^/]*")
    // 还原 **/（匹配零个或多个目录）
    .replace(/\{\{GLOBSTAR_SLASH\}\}/g, "(?:.*/)?")
    // 还原 **
    .replace(/\{\{GLOBSTAR\}\}/g, ".*")

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(normalizedPath)
}

/**
 * 匹配 Glob 触发条件
 */
function matchGlobTrigger(trigger: GlobTrigger, context: MatchContext): boolean {
  if (!context.files || context.files.length === 0) {
    return false
  }
  return context.files.some((file) => matchGlob(trigger.pattern, file))
}

// ============================================================================
// Command Matching
// ============================================================================

/**
 * 匹配 Command 触发条件
 */
function matchCommandTrigger(trigger: CommandTrigger, context: MatchContext): boolean {
  if (!context.command) {
    return false
  }

  const pattern = trigger.pattern
  const command = context.command

  // 通配符匹配（如 "git *"）
  if (pattern.endsWith(" *")) {
    const prefix = pattern.slice(0, -2)
    return command === prefix || command.startsWith(prefix + " ")
  }

  // 精确匹配
  return command === pattern
}

// ============================================================================
// Keyword Matching
// ============================================================================

/**
 * 匹配 Keyword 触发条件
 */
function matchKeywordTrigger(trigger: KeywordTrigger, context: MatchContext): boolean {
  if (!context.input) {
    return false
  }

  const lowerInput = context.input.toLowerCase()
  return trigger.words.some((word) => lowerInput.includes(word.toLowerCase()))
}

// ============================================================================
// Tool Matching
// ============================================================================

/**
 * 匹配 Tool 触发条件
 */
function matchToolTrigger(trigger: ToolTrigger, context: MatchContext): boolean {
  if (!context.tools || context.tools.length === 0) {
    return false
  }

  return context.tools.some((tool) => trigger.names.includes(tool))
}

// ============================================================================
// Main Matcher
// ============================================================================

/**
 * 匹配单个触发条件
 */
export function matchTrigger(trigger: RuleTrigger, context: MatchContext): boolean {
  switch (trigger.type) {
    case "glob":
      return matchGlobTrigger(trigger, context)
    case "command":
      return matchCommandTrigger(trigger, context)
    case "keyword":
      return matchKeywordTrigger(trigger, context)
    case "tool":
      return matchToolTrigger(trigger, context)
    default:
      return false
  }
}

/**
 * 检查规则是否匹配上下文
 */
export function matchRule(rule: RuleMeta, context: MatchContext): boolean {
  // 始终加载的规则
  if (rule.alwaysLoad) {
    return true
  }

  // 没有触发条件的规则不会自动加载
  if (!rule.triggers || rule.triggers.length === 0) {
    return false
  }

  // 任一触发条件匹配即可
  return rule.triggers.some((trigger) => matchTrigger(trigger, context))
}

/**
 * 从索引中匹配规则
 *
 * @param index 规则索引
 * @param context 匹配上下文
 * @param maxRules 最大返回规则数（0 表示不限制）
 * @returns 匹配的规则列表，按优先级排序
 */
export function matchRules(
  index: RulesIndex,
  context: MatchContext,
  maxRules: number = 0
): RuleMeta[] {
  const matched: RuleMeta[] = []

  for (const rule of index.rules) {
    if (matchRule(rule, context)) {
      matched.push(rule)
    }
  }

  // 按优先级排序（高优先级在前）
  matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  // 限制数量
  if (maxRules > 0 && matched.length > maxRules) {
    return matched.slice(0, maxRules)
  }

  return matched
}

/**
 * 获取始终加载的规则
 */
export function getAlwaysLoadRules(index: RulesIndex): RuleMeta[] {
  return index.rules
    .filter((rule) => rule.alwaysLoad)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

/**
 * 从用户输入中提取文件路径
 * 简单实现：匹配常见的文件路径模式
 */
export function extractFilePaths(input: string): string[] {
  const paths: string[] = []

  // 匹配常见文件路径模式
  // 如: src/index.ts, ./utils/helper.js, path/to/file.md
  const patterns = [
    // 相对路径
    /(?:^|\s)(\.{0,2}\/[\w\-./]+\.\w+)/g,
    // 简单路径（包含 / 和扩展名）
    /(?:^|\s)([\w\-]+(?:\/[\w\-]+)+\.\w+)/g,
    // 单文件名（带扩展名）
    /(?:^|\s)([\w\-]+\.\w{1,10})(?:\s|$)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(input)) !== null) {
      const path = match[1]
      if (!paths.includes(path)) {
        paths.push(path)
      }
    }
  }

  return paths
}

/**
 * 从用户输入构建匹配上下文
 */
export function buildMatchContext(
  input: string,
  options?: {
    command?: string
    tools?: string[]
    additionalFiles?: string[]
  }
): MatchContext {
  const files = extractFilePaths(input)
  if (options?.additionalFiles) {
    files.push(...options.additionalFiles)
  }

  return {
    input,
    files: files.length > 0 ? files : undefined,
    command: options?.command,
    tools: options?.tools,
  }
}
