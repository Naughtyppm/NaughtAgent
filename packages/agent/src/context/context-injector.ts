/**
 * ContextInjector 上下文注入器模块
 *
 * 负责：
 * - 构建项目上下文字符串
 * - 将项目上下文注入到系统提示中
 * - 使用 <project-context> 标签包装
 * - 处理缓存失效时的重新生成
 * - 估算注入内容的 Token 数
 *
 * 需求: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import type { ProjectIndex } from "./index-cache"
import type { TechStack } from "./context"

// ============================================================================
// Types
// ============================================================================

/**
 * 上下文注入器配置
 */
export interface ContextInjectorConfig {
  /** 是否启用自动注入 */
  enabled: boolean
  /** 最大注入 Token 数 */
  maxTokens: number
  /** 注入的内容类型 */
  include: {
    structure: boolean
    techStack: boolean
    keyFiles: boolean
    gitStatus: boolean
  }
}

/**
 * 上下文注入器接口
 */
export interface ContextInjector {
  /** 构建项目上下文字符串 */
  buildProjectContext(index: ProjectIndex): string

  /** 注入到系统提示 */
  injectIntoSystemPrompt(basePrompt: string, index: ProjectIndex): string

  /** 估算注入内容的 Token 数 */
  estimateTokens(index: ProjectIndex): number

  /**
   * 选择与查询相关的文件
   * 需求: 4.1, 4.5
   * @param files 文件列表
   * @param query 查询关键词
   * @param ignorePatterns 忽略模式列表
   * @returns 相关文件列表
   */
  selectRelevantFiles(
    files: string[],
    query: string,
    ignorePatterns?: string[]
  ): string[]

  /**
   * 解析 @file 语法引用
   * 需求: 4.2
   * @param text 包含 @file 引用的文本
   * @returns 解析出的文件路径列表
   */
  parseFileReferences(text: string): string[]

  /**
   * 注入会话摘要
   * 需求: 4.3
   * @param basePrompt 基础提示
   * @param sessionSummary 会话摘要
   * @returns 注入后的提示
   */
  injectSessionSummary(basePrompt: string, sessionSummary: string): string
}

/**
 * 索引提供者接口（用于缓存失效时重新生成）
 */
export interface IndexProvider {
  /** 获取或创建索引 */
  getOrCreate(cwd: string): Promise<ProjectIndex>
}

// ============================================================================
// Constants
// ============================================================================

/** 默认配置 */
export const DEFAULT_CONTEXT_INJECTOR_CONFIG: ContextInjectorConfig = {
  enabled: true,
  maxTokens: 2000,
  include: {
    structure: true,
    techStack: true,
    keyFiles: true,
    gitStatus: false, // Git 状态默认不包含，因为变化频繁
  },
}

/** Token 估算：平均每个字符约 0.25 个 token（英文），中文约 0.5 个 token */
const CHARS_PER_TOKEN = 4

/** 项目上下文标签 */
const PROJECT_CONTEXT_TAG_OPEN = "<project-context>"
const PROJECT_CONTEXT_TAG_CLOSE = "</project-context>"

/** 会话摘要标签 */
const SESSION_SUMMARY_TAG_OPEN = "<session-summary>"
const SESSION_SUMMARY_TAG_CLOSE = "</session-summary>"

/** @file 语法正则 */
const FILE_REFERENCE_REGEX = /@file:([^\s,;]+)/g

/** 默认忽略模式 */
const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".nyc_output",
]

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建上下文注入器
 *
 * @param config 可选的配置覆盖
 * @returns ContextInjector 实例
 */
export function createContextInjector(
  config?: Partial<ContextInjectorConfig>
): ContextInjector {
  const finalConfig = mergeConfig(DEFAULT_CONTEXT_INJECTOR_CONFIG, config)

  return {
    buildProjectContext: (index: ProjectIndex) =>
      buildProjectContext(index, finalConfig),
    injectIntoSystemPrompt: (basePrompt: string, index: ProjectIndex) =>
      injectIntoSystemPrompt(basePrompt, index, finalConfig),
    estimateTokens: (index: ProjectIndex) => estimateTokens(index, finalConfig),
    selectRelevantFiles: (files: string[], query: string, ignorePatterns?: string[]) =>
      selectRelevantFiles(files, query, ignorePatterns),
    parseFileReferences: (text: string) => parseFileReferences(text),
    injectSessionSummary: (basePrompt: string, sessionSummary: string) =>
      injectSessionSummary(basePrompt, sessionSummary),
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 构建项目上下文字符串
 *
 * 需求 3.1: 包含缓存的项目结构
 * 需求 3.2: 包含检测到的技术栈信息
 * 需求 3.3: 包含关键文件列表
 * 需求 3.4: 格式化在 <project-context> 标签内
 */
function buildProjectContext(
  index: ProjectIndex,
  config: ContextInjectorConfig
): string {
  if (!config.enabled) {
    return ""
  }

  const parts: string[] = []

  // 项目结构树
  // 需求 3.1: 包含缓存的项目结构
  if (config.include.structure && index.structure.tree) {
    parts.push(buildStructureSection(index.structure.tree))
  }

  // 技术栈信息
  // 需求 3.2: 包含检测到的技术栈信息
  if (config.include.techStack) {
    const techStackSection = buildTechStackSection(index.structure.techStack)
    if (techStackSection) {
      parts.push(techStackSection)
    }
  }

  // 关键文件列表
  // 需求 3.3: 包含关键文件列表
  if (config.include.keyFiles && index.structure.keyFiles.length > 0) {
    parts.push(buildKeyFilesSection(index.structure.keyFiles))
  }

  // 如果没有任何内容，返回空字符串
  if (parts.length === 0) {
    return ""
  }

  // 组合所有部分
  const content = parts.join("\n\n")

  // 需求 3.4: 使用 <project-context> 标签包装
  return wrapWithProjectContextTag(content)
}

/**
 * 注入到系统提示
 *
 * 需求 3.4: 将注入的上下文格式化在 <project-context> 标签内
 */
function injectIntoSystemPrompt(
  basePrompt: string,
  index: ProjectIndex,
  config: ContextInjectorConfig
): string {
  if (!config.enabled) {
    return basePrompt
  }

  const projectContext = buildProjectContext(index, config)

  if (!projectContext) {
    return basePrompt
  }

  // 检查是否超过 Token 限制
  const estimatedTokens = estimateTokensFromString(projectContext)
  if (estimatedTokens > config.maxTokens) {
    // 如果超过限制，尝试截断
    const truncatedContext = truncateContext(projectContext, config.maxTokens)
    return combinePromptWithContext(basePrompt, truncatedContext)
  }

  return combinePromptWithContext(basePrompt, projectContext)
}

/**
 * 估算注入内容的 Token 数
 */
function estimateTokens(
  index: ProjectIndex,
  config: ContextInjectorConfig
): number {
  const context = buildProjectContext(index, config)
  return estimateTokensFromString(context)
}

// ============================================================================
// Section Builders
// ============================================================================

/**
 * 构建项目结构部分
 */
function buildStructureSection(tree: string): string {
  const lines = [
    "## Project Structure",
    "",
    "```",
    tree,
    "```",
  ]
  return lines.join("\n")
}

/**
 * 构建技术栈部分
 */
function buildTechStackSection(techStack: TechStack): string {
  const lines: string[] = ["## Tech Stack", ""]

  // 语言
  if (techStack.languages.length > 0) {
    lines.push(`- **Languages**: ${techStack.languages.join(", ")}`)
  }

  // 框架
  if (techStack.frameworks.length > 0) {
    lines.push(`- **Frameworks**: ${techStack.frameworks.join(", ")}`)
  }

  // 包管理器
  if (techStack.packageManager) {
    lines.push(`- **Package Manager**: ${techStack.packageManager}`)
  }

  // 测试框架
  if (techStack.testFramework) {
    lines.push(`- **Test Framework**: ${techStack.testFramework}`)
  }

  // 构建工具
  if (techStack.buildTool) {
    lines.push(`- **Build Tool**: ${techStack.buildTool}`)
  }

  // 如果只有标题没有内容，返回空
  if (lines.length <= 2) {
    return ""
  }

  return lines.join("\n")
}

/**
 * 构建关键文件部分
 */
function buildKeyFilesSection(keyFiles: string[]): string {
  const lines = [
    "## Key Files",
    "",
    ...keyFiles.map((file) => `- ${file}`),
  ]
  return lines.join("\n")
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 使用 <project-context> 标签包装内容
 *
 * 需求 3.4: 将注入的上下文格式化在 <project-context> 标签内
 */
function wrapWithProjectContextTag(content: string): string {
  return `${PROJECT_CONTEXT_TAG_OPEN}\n${content}\n${PROJECT_CONTEXT_TAG_CLOSE}`
}

/**
 * 组合基础提示和项目上下文
 */
function combinePromptWithContext(basePrompt: string, projectContext: string): string {
  // 在基础提示后添加项目上下文
  // 使用两个换行符分隔
  if (!basePrompt.trim()) {
    return projectContext
  }

  return `${basePrompt}\n\n${projectContext}`
}

/**
 * 从字符串估算 Token 数
 */
function estimateTokensFromString(text: string): number {
  if (!text) {
    return 0
  }
  // 简单估算：字符数 / 4
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * 截断上下文以符合 Token 限制
 */
function truncateContext(context: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN

  if (context.length <= maxChars) {
    return context
  }

  // 尝试在逻辑边界截断
  // 首先尝试保留完整的部分

  // 提取标签内的内容
  const openTagEnd = context.indexOf(PROJECT_CONTEXT_TAG_OPEN) + PROJECT_CONTEXT_TAG_OPEN.length
  const closeTagStart = context.lastIndexOf(PROJECT_CONTEXT_TAG_CLOSE)

  if (openTagEnd > 0 && closeTagStart > openTagEnd) {
    const innerContent = context.substring(openTagEnd, closeTagStart).trim()
    const sections = innerContent.split(/\n## /)

    // 逐步移除部分直到符合限制
    const keptSections: string[] = []
    let currentLength = PROJECT_CONTEXT_TAG_OPEN.length + PROJECT_CONTEXT_TAG_CLOSE.length + 4 // 标签 + 换行

    for (const section of sections) {
      const sectionWithHeader = section.startsWith("##") ? section : `## ${section}`
      const sectionLength = sectionWithHeader.length + 2 // 加换行

      if (currentLength + sectionLength <= maxChars) {
        keptSections.push(sectionWithHeader)
        currentLength += sectionLength
      } else {
        break
      }
    }

    if (keptSections.length > 0) {
      const truncatedContent = keptSections.join("\n\n")
      return wrapWithProjectContextTag(truncatedContent + "\n\n[... truncated due to token limit ...]")
    }
  }

  // 如果无法智能截断，直接截断
  const truncated = context.substring(0, maxChars - 50) // 留出空间给截断提示
  return truncated + "\n[... truncated due to token limit ...]"
}

/**
 * 合并配置
 */
function mergeConfig(
  base: ContextInjectorConfig,
  override?: Partial<ContextInjectorConfig>
): ContextInjectorConfig {
  if (!override) {
    return { ...base }
  }

  return {
    enabled: override.enabled ?? base.enabled,
    maxTokens: override.maxTokens ?? base.maxTokens,
    include: {
      structure: override.include?.structure ?? base.include.structure,
      techStack: override.include?.techStack ?? base.include.techStack,
      keyFiles: override.include?.keyFiles ?? base.include.keyFiles,
      gitStatus: override.include?.gitStatus ?? base.include.gitStatus,
    },
  }
}

// ============================================================================
// File Selection Functions (需求 4.1, 4.5)
// ============================================================================

/**
 * 选择与查询相关的文件
 * 需求: 4.1, 4.5
 */
function selectRelevantFiles(
  files: string[],
  query: string,
  ignorePatterns?: string[]
): string[] {
  const patterns = ignorePatterns ?? DEFAULT_IGNORE_PATTERNS
  
  // 过滤忽略的文件
  const filteredFiles = files.filter(file => {
    return !patterns.some(pattern => {
      // 简单的模式匹配
      if (pattern.includes("*")) {
        const regex = new RegExp(pattern.replace(/\*/g, ".*"))
        return regex.test(file)
      }
      return file.includes(pattern)
    })
  })

  // 如果没有查询，返回所有过滤后的文件
  if (!query.trim()) {
    return filteredFiles
  }

  // 提取查询关键词
  const keywords = extractKeywords(query)
  
  if (keywords.length === 0) {
    return filteredFiles
  }

  // 计算每个文件的相关性分数
  const scoredFiles = filteredFiles.map(file => ({
    file,
    score: calculateRelevanceScore(file, keywords),
  }))

  // 过滤有分数的文件并排序
  return scoredFiles
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.file)
}

/**
 * 从查询中提取关键词
 */
function extractKeywords(query: string): string[] {
  // 移除常见停用词
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "must", "shall",
    "can", "need", "dare", "ought", "used", "to", "of", "in",
    "for", "on", "with", "at", "by", "from", "as", "into",
    "through", "during", "before", "after", "above", "below",
    "between", "under", "again", "further", "then", "once",
    "here", "there", "when", "where", "why", "how", "all",
    "each", "few", "more", "most", "other", "some", "such",
    "no", "nor", "not", "only", "own", "same", "so", "than",
    "too", "very", "just", "and", "but", "if", "or", "because",
    "until", "while", "this", "that", "these", "those", "what",
    "which", "who", "whom", "whose", "it", "its", "i", "me",
    "my", "myself", "we", "our", "ours", "ourselves", "you",
    "your", "yours", "yourself", "yourselves", "he", "him",
    "his", "himself", "she", "her", "hers", "herself",
    // 中文停用词
    "的", "了", "是", "在", "我", "有", "和", "就", "不", "人",
    "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去",
    "你", "会", "着", "没有", "看", "好", "自己", "这",
  ])

  return query
    .toLowerCase()
    .split(/[\s,;.!?，。！？、]+/)
    .filter(word => word.length > 1 && !stopWords.has(word))
}

/**
 * 计算文件与关键词的相关性分数
 */
function calculateRelevanceScore(file: string, keywords: string[]): number {
  const fileLower = file.toLowerCase()
  const fileName = fileLower.split("/").pop() || ""
  const fileNameWithoutExt = fileName.replace(/\.[^.]+$/, "")
  
  let score = 0

  for (const keyword of keywords) {
    // 文件名完全匹配（不含扩展名）
    if (fileNameWithoutExt === keyword) {
      score += 10
    }
    // 文件名包含关键词
    else if (fileName.includes(keyword)) {
      score += 5
    }
    // 路径包含关键词
    else if (fileLower.includes(keyword)) {
      score += 2
    }
  }

  return score
}

// ============================================================================
// @file Syntax Parsing (需求 4.2)
// ============================================================================

/**
 * 解析 @file 语法引用
 * 需求: 4.2
 */
function parseFileReferences(text: string): string[] {
  const matches: string[] = []
  let match: RegExpExecArray | null

  // 重置正则状态
  FILE_REFERENCE_REGEX.lastIndex = 0

  while ((match = FILE_REFERENCE_REGEX.exec(text)) !== null) {
    const filePath = match[1].trim()
    if (filePath && !matches.includes(filePath)) {
      matches.push(filePath)
    }
  }

  return matches
}

// ============================================================================
// Session Summary Injection (需求 4.3)
// ============================================================================

/**
 * 注入会话摘要
 * 需求: 4.3
 */
function injectSessionSummary(basePrompt: string, sessionSummary: string): string {
  if (!sessionSummary.trim()) {
    return basePrompt
  }

  const wrappedSummary = `${SESSION_SUMMARY_TAG_OPEN}\n${sessionSummary}\n${SESSION_SUMMARY_TAG_CLOSE}`

  if (!basePrompt.trim()) {
    return wrappedSummary
  }

  return `${basePrompt}\n\n${wrappedSummary}`
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Constants
  CHARS_PER_TOKEN,
  PROJECT_CONTEXT_TAG_OPEN,
  PROJECT_CONTEXT_TAG_CLOSE,
  SESSION_SUMMARY_TAG_OPEN,
  SESSION_SUMMARY_TAG_CLOSE,
  FILE_REFERENCE_REGEX,
  DEFAULT_IGNORE_PATTERNS,
  // Internal functions for testing
  buildStructureSection as _buildStructureSection,
  buildTechStackSection as _buildTechStackSection,
  buildKeyFilesSection as _buildKeyFilesSection,
  wrapWithProjectContextTag as _wrapWithProjectContextTag,
  estimateTokensFromString as _estimateTokensFromString,
  truncateContext as _truncateContext,
  selectRelevantFiles as _selectRelevantFiles,
  extractKeywords as _extractKeywords,
  calculateRelevanceScore as _calculateRelevanceScore,
  parseFileReferences as _parseFileReferences,
  injectSessionSummary as _injectSessionSummary,
}
