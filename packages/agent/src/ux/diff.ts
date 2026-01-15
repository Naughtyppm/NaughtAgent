/**
 * Diff 生成器
 *
 * 负责：
 * - 生成统一 diff 格式
 * - 生成文件变更预览
 * - 格式化 diff 用于终端显示
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 文件变更类型
 */
export type ChangeType = "create" | "modify" | "delete"

/**
 * 文件变更预览
 */
export interface FileChange {
  /** 文件路径 */
  filePath: string
  /** 变更类型 */
  changeType: ChangeType
  /** 原内容（modify/delete 时存在） */
  oldContent?: string
  /** 新内容（create/modify 时存在） */
  newContent?: string
  /** 统一 diff 格式 */
  unifiedDiff: string
  /** 统计信息 */
  stats: {
    additions: number
    deletions: number
  }
}

/**
 * Diff 选项
 */
export interface DiffOptions {
  /** 上下文行数 */
  contextLines?: number
}

/**
 * Diff 行类型
 */
type DiffLineType = "context" | "addition" | "deletion" | "header" | "hunk"

/**
 * Diff 行
 */
interface DiffLine {
  type: DiffLineType
  content: string
  oldLineNo?: number
  newLineNo?: number
}

// ============================================================================
// Diff Generation
// ============================================================================

/**
 * 生成统一 diff 格式
 */
export function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  filePath: string,
  options: DiffOptions = {}
): string {
  const { contextLines = 3 } = options

  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")

  // 计算 LCS (Longest Common Subsequence) 用于 diff
  const diff = computeDiff(oldLines, newLines)

  // 生成 hunks
  const hunks = generateHunks(diff, oldLines, newLines, contextLines)

  // 构建输出
  const output: string[] = []
  output.push(`--- a/${filePath}`)
  output.push(`+++ b/${filePath}`)

  for (const hunk of hunks) {
    output.push(hunk.header)
    output.push(...hunk.lines)
  }

  return output.join("\n")
}

/**
 * 计算两个数组的差异
 */
function computeDiff(
  oldLines: string[],
  newLines: string[]
): Array<{ type: "equal" | "delete" | "insert"; oldIndex?: number; newIndex?: number }> {
  const result: Array<{ type: "equal" | "delete" | "insert"; oldIndex?: number; newIndex?: number }> = []

  // 使用 Myers diff 算法的简化版本
  const oldLen = oldLines.length
  const newLen = newLines.length

  // 构建 LCS 表
  const lcs: number[][] = Array(oldLen + 1)
    .fill(null)
    .map(() => Array(newLen + 1).fill(0))

  for (let i = 1; i <= oldLen; i++) {
    for (let j = 1; j <= newLen; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
      }
    }
  }

  // 回溯生成 diff
  let i = oldLen
  let j = newLen
  const stack: Array<{ type: "equal" | "delete" | "insert"; oldIndex?: number; newIndex?: number }> = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "equal", oldIndex: i - 1, newIndex: j - 1 })
      i--
      j--
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      stack.push({ type: "insert", newIndex: j - 1 })
      j--
    } else {
      stack.push({ type: "delete", oldIndex: i - 1 })
      i--
    }
  }

  // 反转得到正序
  while (stack.length > 0) {
    result.push(stack.pop()!)
  }

  return result
}

/**
 * 生成 diff hunks
 */
function generateHunks(
  diff: Array<{ type: "equal" | "delete" | "insert"; oldIndex?: number; newIndex?: number }>,
  oldLines: string[],
  newLines: string[],
  contextLines: number
): Array<{ header: string; lines: string[] }> {
  const hunks: Array<{ header: string; lines: string[] }> = []

  // 找出所有变更的位置
  const changes: number[] = []
  for (let i = 0; i < diff.length; i++) {
    if (diff[i].type !== "equal") {
      changes.push(i)
    }
  }

  if (changes.length === 0) {
    return hunks
  }

  // 将相邻的变更合并成 hunks
  let hunkStart = -1
  let hunkEnd = -1

  for (const changeIndex of changes) {
    const start = Math.max(0, changeIndex - contextLines)
    const end = Math.min(diff.length - 1, changeIndex + contextLines)

    if (hunkStart === -1) {
      hunkStart = start
      hunkEnd = end
    } else if (start <= hunkEnd + 1) {
      // 合并
      hunkEnd = Math.max(hunkEnd, end)
    } else {
      // 输出当前 hunk，开始新的
      hunks.push(createHunk(diff, oldLines, newLines, hunkStart, hunkEnd))
      hunkStart = start
      hunkEnd = end
    }
  }

  // 输出最后一个 hunk
  if (hunkStart !== -1) {
    hunks.push(createHunk(diff, oldLines, newLines, hunkStart, hunkEnd))
  }

  return hunks
}

/**
 * 创建单个 hunk
 */
function createHunk(
  diff: Array<{ type: "equal" | "delete" | "insert"; oldIndex?: number; newIndex?: number }>,
  oldLines: string[],
  newLines: string[],
  start: number,
  end: number
): { header: string; lines: string[] } {
  const lines: string[] = []

  let oldStart = -1
  let oldCount = 0
  let newStart = -1
  let newCount = 0

  for (let i = start; i <= end; i++) {
    const item = diff[i]

    if (item.type === "equal") {
      if (oldStart === -1 && item.oldIndex !== undefined) {
        oldStart = item.oldIndex + 1
      }
      if (newStart === -1 && item.newIndex !== undefined) {
        newStart = item.newIndex + 1
      }
      oldCount++
      newCount++
      lines.push(` ${oldLines[item.oldIndex!]}`)
    } else if (item.type === "delete") {
      if (oldStart === -1 && item.oldIndex !== undefined) {
        oldStart = item.oldIndex + 1
      }
      oldCount++
      lines.push(`-${oldLines[item.oldIndex!]}`)
    } else if (item.type === "insert") {
      if (newStart === -1 && item.newIndex !== undefined) {
        newStart = item.newIndex + 1
      }
      newCount++
      lines.push(`+${newLines[item.newIndex!]}`)
    }
  }

  // 处理边界情况
  if (oldStart === -1) oldStart = 1
  if (newStart === -1) newStart = 1

  const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`

  return { header, lines }
}

// ============================================================================
// File Change
// ============================================================================

/**
 * 生成文件变更预览
 */
export function generateFileChange(
  filePath: string,
  oldContent: string | null,
  newContent: string | null,
  options: DiffOptions = {}
): FileChange {
  // 确定变更类型
  let changeType: ChangeType
  if (oldContent === null && newContent !== null) {
    changeType = "create"
  } else if (oldContent !== null && newContent === null) {
    changeType = "delete"
  } else {
    changeType = "modify"
  }

  // 生成 diff
  const oldStr = oldContent ?? ""
  const newStr = newContent ?? ""
  const unifiedDiff = generateUnifiedDiff(oldStr, newStr, filePath, options)

  // 计算统计信息
  const stats = calculateStats(oldStr, newStr)

  return {
    filePath,
    changeType,
    oldContent: oldContent ?? undefined,
    newContent: newContent ?? undefined,
    unifiedDiff,
    stats,
  }
}

/**
 * 计算变更统计
 */
function calculateStats(oldContent: string, newContent: string): { additions: number; deletions: number } {
  const oldLines = oldContent ? oldContent.split("\n") : []
  const newLines = newContent ? newContent.split("\n") : []

  const diff = computeDiff(oldLines, newLines)

  let additions = 0
  let deletions = 0

  for (const item of diff) {
    if (item.type === "insert") additions++
    if (item.type === "delete") deletions++
  }

  return { additions, deletions }
}

// ============================================================================
// Terminal Formatting
// ============================================================================

/**
 * ANSI 颜色代码
 */
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
}

/**
 * 格式化 diff 用于终端显示（带颜色）
 */
export function formatDiffForTerminal(diff: string, useColors: boolean = true): string {
  if (!useColors) {
    return diff
  }

  const lines = diff.split("\n")
  const formatted: string[] = []

  for (const line of lines) {
    if (line.startsWith("---") || line.startsWith("+++")) {
      // 文件头
      formatted.push(`${COLORS.bold}${COLORS.white}${line}${COLORS.reset}`)
    } else if (line.startsWith("@@")) {
      // Hunk 头
      formatted.push(`${COLORS.cyan}${line}${COLORS.reset}`)
    } else if (line.startsWith("+")) {
      // 添加行
      formatted.push(`${COLORS.green}${line}${COLORS.reset}`)
    } else if (line.startsWith("-")) {
      // 删除行
      formatted.push(`${COLORS.red}${line}${COLORS.reset}`)
    } else {
      // 上下文行
      formatted.push(`${COLORS.gray}${line}${COLORS.reset}`)
    }
  }

  return formatted.join("\n")
}

/**
 * 格式化文件变更摘要
 */
export function formatChangeSummary(change: FileChange, useColors: boolean = true): string {
  const { filePath, changeType, stats } = change

  const c = useColors ? COLORS : { reset: "", bold: "", green: "", red: "", yellow: "", blue: "", cyan: "" }

  let typeLabel: string
  switch (changeType) {
    case "create":
      typeLabel = `${c.green}[CREATE]${c.reset}`
      break
    case "modify":
      typeLabel = `${c.yellow}[MODIFY]${c.reset}`
      break
    case "delete":
      typeLabel = `${c.red}[DELETE]${c.reset}`
      break
  }

  const statsStr = `${c.green}+${stats.additions}${c.reset} ${c.red}-${stats.deletions}${c.reset}`

  return `${typeLabel} ${c.blue}${filePath}${c.reset} (${statsStr})`
}

// ============================================================================
// Diff Generator Interface
// ============================================================================

/**
 * 创建 Diff 生成器
 */
export function createDiffGenerator() {
  return {
    generateUnifiedDiff,
    generateFileChange,
    formatForTerminal: formatDiffForTerminal,
    formatSummary: formatChangeSummary,
  }
}

export type DiffGenerator = ReturnType<typeof createDiffGenerator>
