import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"
import { READ_MAX_LINE_LENGTH } from "../config"
import { checkFileAccessBudget } from "./file-access-budget"

const DESCRIPTION = `Reads a file from the local filesystem.

Usage:
- The filePath parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit for long files
- Results are returned with line numbers starting at 1`

const DEFAULT_LIMIT = READ_MAX_LINE_LENGTH
const MAX_LINE_LENGTH = READ_MAX_LINE_LENGTH

// ─── 文件读取缓存（全局共享，防子代理绕过）──────────────────────
// key: filePath（不含 sessionID/offset/limit）
// 缓存全文件行数组，返回时按 offset/limit 截取（修复分段读取 bug）

interface ReadCacheEntry {
  /** 全文件的所有行（不带行号格式） */
  allLines: string[]
  count: number
  mtimeMs: number  // 文件修改时间，变化时视为新读取
  /** 最后一次访问时间戳（用于 snapshot 排序） */
  lastAccessMs: number
}

const readCache = new Map<string, ReadCacheEntry>()

/** 清除读取缓存（compact 后或 session 结束时调用） */
export function clearReadCache(_sessionId?: string): void {
  readCache.clear()
}

/**
 * 获取 read cache 快照（compact 前调用，用于 POST_COMPACT 文件恢复注入）
 * 返回最近访问的 N 个文件的路径和格式化内容，按最近访问时间排序
 */
export function getReadCacheSnapshot(maxFiles: number = 5, maxLinesPerFile: number = 250): Array<{ path: string; output: string }> {
  const entries = [...readCache.entries()]
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].lastAccessMs - a[1].lastAccessMs) // 最近访问的在前
    .slice(0, maxFiles)
  return entries.map(([key, val]) => {
    const lines = val.allLines.slice(0, maxLinesPerFile)
    const formatted = lines.map((line, i) => {
      const lineNum = (i + 1).toString().padStart(5, " ")
      return `${lineNum}\t${line}`
    }).join("\n")
    const suffix = val.allLines.length > maxLinesPerFile
      ? `\n... (${val.allLines.length} lines total, showing first ${maxLinesPerFile})`
      : `\n(${val.allLines.length} lines total)`
    return { path: key, output: formatted + suffix }
  })
}

/**
 * 重置读取缓存计数（compact 后调用）
 *
 * 不删除缓存条目（仍保留 mtime 检测），只把 count 重置为 0，
 * 让 compact 后的 LLM 有一次完整重读机会。
 */
export function resetReadCacheCount(_sessionId?: string): void {
  for (const entry of readCache.values()) {
    entry.count = 0
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
  isConcurrencySafe: true,
  isReadOnly: true,
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

    // ─── 全局文件访问预算检测（跨 read/grep/bash 统一计量）────
    const budgetResult = checkFileAccessBudget(filePath, "read")
    if (budgetResult) {
      return {
        title,
        output: budgetResult,
        isError: true,
        metadata: { budgetExhausted: true },
      }
    }

    // ─── 读取缓存检测 ─────────────────────────
    // 缓存 key 只按 filePath（不含 sessionID/offset/limit）
    // 缓存全文件行数组，返回时按请求的 offset/limit 截取（修复分段读取 bug）
    const cacheKey = filePath
    const cached = readCache.get(cacheKey)
    const currentMtimeMs = stat.mtimeMs

    // 辅助函数：从行数组生成格式化输出
    const formatOutput = (allLines: string[], reqOffset: number, reqLimit: number) => {
      const endLine = Math.min(allLines.length, reqOffset + reqLimit)
      const outputLines: string[] = []
      for (let i = reqOffset; i < endLine; i++) {
        let line = allLines[i]
        if (line.length > MAX_LINE_LENGTH) {
          line = line.substring(0, MAX_LINE_LENGTH) + "..."
        }
        const lineNum = (i + 1).toString().padStart(5, " ")
        outputLines.push(`${lineNum}\t${line}`)
      }
      let output = "<file>\n" + outputLines.join("\n")
      const hasMore = endLine < allLines.length
      if (hasMore) {
        output += `\n\n(File has ${allLines.length} lines. Showing lines ${reqOffset + 1}-${endLine}. Use 'offset' to read more.)`
      } else {
        output += `\n\n(End of file - total ${allLines.length} lines)`
      }
      output += "\n</file>"
      return { output, totalLines: allLines.length, linesRead: endLine - reqOffset, truncated: hasMore }
    }

    if (cached && cached.mtimeMs === currentMtimeMs) {
      // 文件未修改，从缓存的全文件行数组中截取
      cached.count++
      cached.lastAccessMs = Date.now()

      // 高频重复读取防护：3+ 次后只返回文件头摘要
      if (cached.count >= 3) {
        const headLines = cached.allLines.slice(0, 10).map((line, i) => {
          const lineNum = (i + 1).toString().padStart(5, " ")
          return `${lineNum}\t${line}`
        }).join('\n')
        const summaryOutput = `<file>\n${headLines}\n\n... (${cached.allLines.length} lines total, truncated after ${cached.count} repeated reads)\n` +
          `This file content was already returned ${cached.count} times. ` +
          `Use the information from previous reads. Do NOT read this file again.\n</file>`
        return {
          title,
          output: summaryOutput,
          metadata: { totalLines: cached.allLines.length, fromCache: true, readCount: cached.count, truncatedDueToRepeat: true },
        }
      }

      // 按请求的 offset/limit 截取返回（修复分段读取 bug）
      const { output, totalLines, linesRead, truncated } = formatOutput(cached.allLines, offset, limit)
      return {
        title,
        output,
        metadata: { totalLines, linesRead, truncated, fromCache: true, readCount: cached.count },
      }
    }

    // ─── 首次读取或文件已修改 ─────────────────
    const content = await fs.readFile(filePath, "utf-8")
    const allLines = content.split("\n")

    // 缓存全文件行数组
    readCache.set(cacheKey, {
      allLines,
      count: 1,
      mtimeMs: currentMtimeMs,
      lastAccessMs: Date.now(),
    })

    // 按请求的 offset/limit 格式化输出
    const { output, totalLines, linesRead, truncated } = formatOutput(allLines, offset, limit)
    return { title, output, metadata: { totalLines, linesRead, truncated } }
  },
})
