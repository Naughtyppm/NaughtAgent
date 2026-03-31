import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"
import { READ_MAX_LINE_LENGTH } from "../config"

const DESCRIPTION = `Reads a file from the local filesystem.

Usage:
- The filePath parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit for long files
- Results are returned with line numbers starting at 1`

const DEFAULT_LIMIT = READ_MAX_LINE_LENGTH
const MAX_LINE_LENGTH = READ_MAX_LINE_LENGTH

// ─── 文件读取缓存（session 级去重）──────────────────────
// key: "sessionId:filePath:offset:limit"
// 用途：重复读取时直接返回缓存内容（静默，不加警告——警告会导致 LLM 绕道 bash）

interface ReadCacheEntry {
  output: string
  title: string
  metadata: Record<string, unknown>
  count: number
  mtimeMs: number  // 文件修改时间，变化时视为新读取
}

const readCache = new Map<string, ReadCacheEntry>()

/** 清除指定 session 的读取缓存（session 结束时调用） */
export function clearReadCache(sessionId?: string): void {
  if (!sessionId) {
    readCache.clear()
    return
  }
  for (const key of readCache.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      readCache.delete(key)
    }
  }
}

/**
 * 检测是否为二进制文件
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase()
  const binaryExtensions = [
    ".zip", ".tar", ".gz", ".exe", ".dll", ".so",
    ".class", ".jar", ".7z", ".bin", ".dat",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".mp3", ".mp4", ".avi", ".mov", ".wav",
  ]
  if (binaryExtensions.includes(ext)) {
    return true
  }

  // 读取前 4KB 检测
  const handle = await fs.open(filePath, "r")
  try {
    const buffer = Buffer.alloc(4096)
    const { bytesRead } = await handle.read(buffer, 0, 4096, 0)
    if (bytesRead === 0) return false

    // 检测 NULL 字节或高比例非打印字符
    let nonPrintable = 0
    for (let i = 0; i < bytesRead; i++) {
      const byte = buffer[i]
      if (byte === 0) return true
      if (byte < 9 || (byte > 13 && byte < 32)) {
        nonPrintable++
      }
    }
    return nonPrintable / bytesRead > 0.3
  } finally {
    await handle.close()
  }
}

export const ReadTool = Tool.define({
  id: "read",
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to read"),
    offset: z.number().optional().describe("The line number to start reading from (0-based)"),
    limit: z.number().optional().describe("The number of lines to read (defaults to 2000)"),
  }),

  async execute(params, ctx) {
    let filePath = params.filePath

    filePath = resolvePath(filePath, ctx.cwd)

    const title = path.basename(filePath)

    // 检查文件是否存在
    try {
      await fs.access(filePath)
    } catch {
      throw new Error(`File not found: ${filePath}`)
    }

    // 检查是否为目录
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filePath}`)
    }

    // 检查是否为二进制文件
    if (await isBinaryFile(filePath)) {
      throw new Error(`Cannot read binary file: ${filePath}`)
    }

    const offset = params.offset ?? 0
    const limit = params.limit ?? DEFAULT_LIMIT

    // ─── 读取缓存检测 ─────────────────────────
    const cacheKey = `${ctx.sessionID}:${filePath}:${offset}:${limit}`
    const cached = readCache.get(cacheKey)
    const currentMtimeMs = stat.mtimeMs

    if (cached && cached.mtimeMs === currentMtimeMs) {
      // 文件未修改，静默返回缓存内容（不加任何警告前缀，避免 LLM 绕道 bash）
      cached.count++
      return {
        title,
        output: cached.output,
        metadata: { ...cached.metadata, fromCache: true, readCount: cached.count },
      }
    }

    // ─── 首次读取或文件已修改 ─────────────────
    const content = await fs.readFile(filePath, "utf-8")
    const lines = content.split("\n")
    const endLine = Math.min(lines.length, offset + limit)

    // 格式化输出（带行号）
    const outputLines: string[] = []
    for (let i = offset; i < endLine; i++) {
      let line = lines[i]
      // 截断过长的行
      if (line.length > MAX_LINE_LENGTH) {
        line = line.substring(0, MAX_LINE_LENGTH) + "..."
      }
      const lineNum = (i + 1).toString().padStart(5, " ")
      outputLines.push(`${lineNum}\t${line}`)
    }

    let output = "<file>\n"
    output += outputLines.join("\n")

    // 添加文件信息
    const totalLines = lines.length
    const hasMore = endLine < totalLines
    if (hasMore) {
      output += `\n\n(File has ${totalLines} lines. Showing lines ${offset + 1}-${endLine}. Use 'offset' to read more.)`
    } else {
      output += `\n\n(End of file - total ${totalLines} lines)`
    }
    output += "\n</file>"

    const metadata = {
      totalLines,
      linesRead: endLine - offset,
      truncated: hasMore,
    }

    // 缓存结果
    readCache.set(cacheKey, {
      output,
      title,
      metadata,
      count: 1,
      mtimeMs: currentMtimeMs,
    })

    return { title, output, metadata }
  },
})
