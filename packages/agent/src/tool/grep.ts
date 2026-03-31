import * as fs from "fs/promises"
import * as path from "path"
import fg from "fast-glob"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"
import { GREP_MAX_MATCHES } from "../config"

const DESCRIPTION = `Searches for a pattern in file contents using regular expressions.

Usage:
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with include parameter (e.g., "*.ts", "*.{ts,tsx}")
- Use ignoreCase for case-insensitive search
- Use context to show surrounding lines`

const DEFAULT_MAX_RESULTS = GREP_MAX_MATCHES
const MAX_FILE_SIZE = 1024 * 1024 // 1MB
const MAX_LINE_LENGTH = 500

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
  parameters: z.object({
    pattern: z.string().describe("The regex pattern to search for"),
    path: z.string().optional().describe("File or directory to search (defaults to cwd)"),
    include: z.string().optional().describe("Glob pattern to filter files (e.g., '*.ts')"),
    ignoreCase: z.boolean().optional().describe("Case insensitive search (default false)"),
    maxResults: z.number().optional().describe("Maximum number of matches (default 100)"),
    context: z.number().optional().describe("Number of context lines to show (default 0)"),
  }),

  async execute(params, ctx) {
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
      // 搜索单个文件
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

    // 搜索所有文件
    const allMatches: Match[] = []
    const filesWithMatches = new Set<string>()
    let totalCount = 0

    for (const file of files) {
      if (totalCount >= maxResults) break

      const { matches, count } = await searchFile(
        file,
        regex,
        contextLines,
        maxResults,
        totalCount
      )

      if (matches.length > 0) {
        allMatches.push(...matches)
        filesWithMatches.add(file)
        totalCount = count
      }

      // 重置 regex lastIndex
      regex.lastIndex = 0
    }

    // 格式化输出
    let output: string

    if (allMatches.length === 0) {
      output = `No matches found for pattern: ${pattern}`
    } else {
      const lines: string[] = []
      const truncated = totalCount >= maxResults

      lines.push(`Found ${totalCount} match(es) in ${filesWithMatches.size} file(s):`)

      if (truncated) {
        lines.push(`\n... (showing first ${maxResults} matches)`)
      }

      // 按文件分组输出
      let currentFile = ""
      for (const match of allMatches) {
        const relativePath = path.relative(ctx.cwd, match.file)

        if (match.file !== currentFile) {
          currentFile = match.file
          lines.push(`\n${relativePath}`)
        }

        const prefix = match.isContext ? "-" : ":"
        const lineNum = match.line.toString().padStart(4, " ")
        lines.push(`  ${lineNum}${prefix} ${match.content}`)
      }

      output = lines.join("\n")
    }

    return {
      title,
      output,
      metadata: {
        matchCount: totalCount,
        fileCount: filesWithMatches.size,
        truncated: totalCount >= maxResults,
      },
    }
  },
})
