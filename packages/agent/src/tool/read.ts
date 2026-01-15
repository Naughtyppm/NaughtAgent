import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Reads a file from the local filesystem.

Usage:
- The filePath parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit for long files
- Results are returned with line numbers starting at 1`

const DEFAULT_LIMIT = 2000
const MAX_LINE_LENGTH = 2000

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

    // 处理相对路径
    if (!path.isAbsolute(filePath)) {
      filePath = path.resolve(ctx.cwd, filePath)
    }

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

    // 读取文件
    const content = await fs.readFile(filePath, "utf-8")
    const lines = content.split("\n")

    const offset = params.offset ?? 0
    const limit = params.limit ?? DEFAULT_LIMIT
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

    return {
      title,
      output,
      metadata: {
        totalLines,
        linesRead: endLine - offset,
        truncated: hasMore,
      },
    }
  },
})
