import * as fs from "fs/promises"
import * as path from "path"
import fg from "fast-glob"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"
import { GREP_MAX_MATCHES } from "../config"
import { checkFileAccessBudget } from "./file-access-budget"

const DESCRIPTION = `Searches for a pattern in file contents using regular expressions.

Usage:
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with include parameter (e.g., "*.ts", "*.{ts,tsx}")
- Use ignoreCase for case-insensitive search
- Use context to show surrounding lines
- When results exceed maxResults, a searchId is returned for pagination
- Use searchId + offset to fetch subsequent pages`

const DEFAULT_MAX_RESULTS = GREP_MAX_MATCHES
const MAX_FILE_SIZE = 1024 * 1024 // 1MB
const MAX_LINE_LENGTH = 1000

// ============================================================================
// 搜索缓存（ripgrep 管道模式）：先搜全部，分页返回
// ============================================================================

interface CachedSearch {
  matches: Match[]
  totalCount: number
  filesWithMatches: number
  pattern: string
  createdAt: number
}

/** 搜索结果缓存（内存中，按 searchId 索引） */
const searchCache = new Map<string, CachedSearch>()

/** 缓存最大条目数 */
const MAX_CACHE_ENTRIES = 10

/** 缓存过期时间 5 分钟 */
const CACHE_TTL_MS = 5 * 60 * 1000

/** 生成搜索 ID */
function generateSearchId(): string {
  return `grep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** 清理过期缓存 */
function cleanExpiredCache(): void {
  const now = Date.now()
  for (const [id, cached] of searchCache) {
    if (now - cached.createdAt > CACHE_TTL_MS) {
      searchCache.delete(id)
    }
  }
  // 如果还超，按时间删最旧的
  while (searchCache.size > MAX_CACHE_ENTRIES) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0]
    if (oldest) searchCache.delete(oldest[0])
  }
}

const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/*.min.js",
  "**/*.bundle.js",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
]

interface Match {
  file: string
  line: number
  content: string
  isContext?: boolean
}

/**
 * 检测是否为二进制文件（简单检测）
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase()
  const binaryExtensions = [
    ".zip", ".tar", ".gz", ".exe", ".dll", ".so",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".mp3", ".mp4", ".avi", ".mov", ".wav",
    ".bin", ".dat", ".class", ".jar", ".7z",
  ]
  if (binaryExtensions.includes(ext)) {
    return true
  }

  // 读取前 512 字节检测
  try {
    const handle = await fs.open(filePath, "r")
    try {
      const buffer = Buffer.alloc(512)
      const { bytesRead } = await handle.read(buffer, 0, 512, 0)
      if (bytesRead === 0) return false

      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) return true
      }
      return false
    } finally {
      await handle.close()
    }
  } catch {
    return false
  }
}

/**
 * 搜索单个文件
 */
async function searchFile(
  filePath: string,
  regex: RegExp,
  contextLines: number,
  maxResults: number,
  currentCount: number
): Promise<{ matches: Match[]; count: number }> {
  const matches: Match[] = []
  let count = currentCount

  // 检查文件大小
  const stat = await fs.stat(filePath)
  if (stat.size > MAX_FILE_SIZE) {
    return { matches, count }
  }

  // 检查是否为二进制
  if (await isBinaryFile(filePath)) {
    return { matches, count }
  }

  // 读取文件
  let content: string
  try {
    content = await fs.readFile(filePath, "utf-8")
  } catch {
    return { matches, count }
  }

  const lines = content.split("\n")
  const matchedLineNumbers = new Set<number>()

  // 找出所有匹配行
  for (let i = 0; i < lines.length && count < maxResults; i++) {
    if (regex.test(lines[i])) {
      matchedLineNumbers.add(i)
      count++
    }
  }

  // 收集匹配行和上下文
  const includedLines = new Set<number>()

  for (const lineNum of matchedLineNumbers) {
    // 添加上下文行
    for (let i = lineNum - contextLines; i <= lineNum + contextLines; i++) {
      if (i >= 0 && i < lines.length && !includedLines.has(i)) {
        includedLines.add(i)
        let lineContent = lines[i]
        // 截断过长的行
        if (lineContent.length > MAX_LINE_LENGTH) {
          lineContent = lineContent.substring(0, MAX_LINE_LENGTH) + "..."
        }
        matches.push({
          file: filePath,
          line: i + 1,
          content: lineContent,
          isContext: !matchedLineNumbers.has(i),
        })
      }
    }
  }

  // 按行号排序
  matches.sort((a, b) => a.line - b.line)

  return { matches, count }
}

export const GrepTool = Tool.define({
  id: "grep",
  description: DESCRIPTION,
  isConcurrencySafe: true,
  isReadOnly: true,
  parameters: z.object({
    pattern: z.string().describe("The regex pattern to search for"),
    path: z.string().optional().describe("File or directory to search (defaults to cwd)"),
    include: z.string().optional().describe("Glob pattern to filter files (e.g., '*.ts')"),
    ignoreCase: z.boolean().optional().describe("Case insensitive search (default false)"),
    maxResults: z.number().optional().describe("Maximum matches per page (default 200)"),
    context: z.number().optional().describe("Number of context lines to show (default 0)"),
    searchId: z.string().optional().describe("Resume a previous search by ID (for pagination)"),
    offset: z.number().optional().describe("Skip N matches from a cached search (use with searchId)"),
  }),

  async execute(params, ctx) {
    // ─── 分页续取：从缓存中取后续页 ──────────────────
    if (params.searchId) {
      const cached = searchCache.get(params.searchId)
      if (!cached) {
        return {
          title: params.pattern || "grep",
          output: `Error: Search "${params.searchId}" not found or expired. Run a new search.`,
          isError: true,
          metadata: { matchCount: 0, fileCount: 0, truncated: false },
        }
      }
      const offset = params.offset || 0
      const pageSize = params.maxResults || DEFAULT_MAX_RESULTS
      const pageMatches = cached.matches.slice(offset, offset + pageSize)
      const hasMore = offset + pageSize < cached.totalCount

      const lines: string[] = [
        `Page from cached search (${offset + 1}-${offset + pageMatches.length} of ${cached.totalCount} total):`,
      ]
      let currentFile = ""
      for (const match of pageMatches) {
        const relativePath = path.relative(ctx.cwd, match.file)
        if (match.file !== currentFile) {
          currentFile = match.file
          lines.push(`\n${relativePath}`)
        }
        const prefix = match.isContext ? "-" : ":"
        const lineNum = match.line.toString().padStart(4, " ")
        lines.push(`  ${lineNum}${prefix} ${match.content}`)
      }

      if (hasMore) {
        lines.push(`\n... more results available: use searchId="${params.searchId}" offset=${offset + pageSize}`)
      }

      return {
        title: cached.pattern,
        output: lines.join("\n"),
        metadata: {
          matchCount: pageMatches.length,
          totalCount: cached.totalCount,
          fileCount: cached.filesWithMatches,
          searchId: params.searchId,
          offset,
          hasMore,
        },
      }
    }

    // ─── 新搜索 ──────────────────────────────────────
    const {
      pattern,
      include,
      ignoreCase = false,
      maxResults = DEFAULT_MAX_RESULTS,
      context: contextLines = 0,
    } = params

    let searchPath = params.path
    if (searchPath) {
      searchPath = resolvePath(searchPath, ctx.cwd)
    }
    const basePath = searchPath || ctx.cwd

    const title = pattern

    // ─── 滥用检测：catch-all pattern 对单文件 = 读取全文（绕过 read cache）──
    // 扩展检测：.  .*  .+  ^.*$  [\s\S]*  \S  \w  [^\n]+  (?s).  等高匹配率模式
    const CATCH_ALL_PATTERNS = /^(\.\*?|\.\+|\^(\.\*?)?\$?|\[\\s\\S\][*+]?|[\s\S]|\\S[*+]?|\\w[*+]?|\[\^\\n\][*+]?|\(\?s\)\.)$/
    if (CATCH_ALL_PATTERNS.test(pattern.trim())) {
      try {
        const pathStat = await fs.stat(basePath)
        if (pathStat.isFile()) {
          return {
            title,
            output: `Error: Pattern "${pattern}" matches all lines. Use the "read" tool to read file contents instead of grep.`,
            isError: true,
            metadata: { matchCount: 0, fileCount: 0, truncated: false },
          }
        }
      } catch { /* 路径不存在，让后面的逻辑处理 */ }
    }

    // 验证正则表达式
    let regex: RegExp
    try {
      regex = new RegExp(pattern, ignoreCase ? "gi" : "g")
    } catch (err) {
      throw new Error(`Invalid regular expression: ${(err as Error).message}`)
    }

    // 检查路径是否存在
    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(basePath)
    } catch {
      throw new Error(`Path not found: ${basePath}`)
    }

    let files: string[]

    if (stat.isFile()) {
      // 单文件搜索：计入全局文件访问预算
      const budgetResult = checkFileAccessBudget(basePath, "grep")
      if (budgetResult) {
        return {
          title,
          output: budgetResult,
          isError: true,
          metadata: { matchCount: 0, fileCount: 0, truncated: false, budgetExhausted: true },
        }
      }
      files = [basePath]
    } else {
      // 搜索目录
      const globPattern = include || "**/*"
      const entries = await fg(globPattern, {
        cwd: basePath,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        ignore: DEFAULT_IGNORES,
      })
      files = entries
    }

    // 搜索所有文件（不限数量，全量搜索后缓存分页）
    const HARD_LIMIT = 5000 // 防止极端情况内存爆炸
    const allMatches: Match[] = []
    const filesWithMatches = new Set<string>()
    let totalCount = 0

    for (const file of files) {
      if (totalCount >= HARD_LIMIT) break

      const { matches, count } = await searchFile(
        file,
        regex,
        contextLines,
        HARD_LIMIT,
        totalCount
      )

      if (matches.length > 0) {
        allMatches.push(...matches)
        filesWithMatches.add(file)
        totalCount = count
        // 目录搜索也计入文件访问预算（防止 grep dir/ --include=target.ts 绕过）
        checkFileAccessBudget(file, "grep")
      }

      // 重置 regex lastIndex
      regex.lastIndex = 0
    }

    // 格式化输出
    if (allMatches.length === 0) {
      return {
        title,
        output: `No matches found for pattern: ${pattern}`,
        metadata: { matchCount: 0, fileCount: 0, truncated: false },
      }
    }

    // 如果总数 > maxResults，缓存全量结果，返回第一页 + searchId
    const pageMatches = allMatches.slice(0, maxResults)
    const hasMore = totalCount > maxResults
    let searchId: string | undefined

    if (hasMore) {
      cleanExpiredCache()
      searchId = generateSearchId()
      searchCache.set(searchId, {
        matches: allMatches,
        totalCount,
        filesWithMatches: filesWithMatches.size,
        pattern,
        createdAt: Date.now(),
      })
    }

    const lines: string[] = [
      `Found ${totalCount} match(es) in ${filesWithMatches.size} file(s):`,
    ]

    // 按文件分组输出
    let currentFile = ""
    for (const match of pageMatches) {
      const relativePath = path.relative(ctx.cwd, match.file)

      if (match.file !== currentFile) {
        currentFile = match.file
        lines.push(`\n${relativePath}`)
      }

      const prefix = match.isContext ? "-" : ":"
      const lineNum = match.line.toString().padStart(4, " ")
      lines.push(`  ${lineNum}${prefix} ${match.content}`)
    }

    if (hasMore && searchId) {
      lines.push(`\n... ${totalCount - maxResults} more matches. Use searchId="${searchId}" offset=${maxResults} to see next page.`)
    }

    return {
      title,
      output: lines.join("\n"),
      metadata: {
        matchCount: totalCount,
        fileCount: filesWithMatches.size,
        truncated: hasMore,
        ...(searchId && { searchId }),
      },
    }
  },
})
