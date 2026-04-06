/**
 * 文件操作公共工具函数
 *
 * 统一 isBinaryFile 和 generateDiff 的实现，避免各工具重复定义。
 */

import * as path from "path"
import * as fs from "node:fs/promises"

/** 已知二进制文件扩展名 */
const BINARY_EXTENSIONS = new Set([
  ".zip", ".tar", ".gz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".bin", ".dat",
  ".class", ".jar", ".pyc", ".wasm",
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".pptx",
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac", ".ogg",
  ".ttf", ".otf", ".woff", ".woff2",
])

/**
 * 检测文件是否为二进制文件
 *
 * 策略：
 * 1. 先按扩展名快速判断
 * 2. 再读取前 4KB，检测 NULL 字节或高比例非打印字符
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) {
    return true
  }

  try {
    const handle = await fs.open(filePath, "r")
    try {
      const buffer = Buffer.alloc(4096)
      const { bytesRead } = await handle.read(buffer, 0, 4096, 0)
      if (bytesRead === 0) return false

      let nonPrintable = 0
      for (let i = 0; i < bytesRead; i++) {
        const byte = buffer[i]
        if (byte === 0) return true // NULL 字节 → 一定是二进制
        if (byte < 9 || (byte > 13 && byte < 32)) {
          nonPrintable++
        }
      }
      return nonPrintable / bytesRead > 0.3
    } finally {
      await handle.close()
    }
  } catch {
    return false
  }
}

/**
 * 生成简单的 unified diff 用于用户展示
 *
 * 非标准 diff（不用于 patch），仅供 LLM 和用户阅读。
 * 带 2 行上下文。
 */
export function generateDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")

  const lines: string[] = []
  lines.push(`--- ${filePath}`)
  lines.push(`+++ ${filePath}`)

  const maxLen = Math.max(oldLines.length, newLines.length)

  // 找到变更范围
  let diffStart = -1
  let diffEnd = -1

  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) {
      if (diffStart === -1) diffStart = i
      diffEnd = i
    }
  }

  if (diffStart === -1) {
    return "(no changes)"
  }

  // 上下文范围
  const ctxBefore = Math.max(0, diffStart - 2)
  const ctxAfter = Math.min(maxLen - 1, diffEnd + 2)

  lines.push(`@@ -${ctxBefore + 1},${oldLines.length} +${ctxBefore + 1},${newLines.length} @@`)

  // 前上下文
  for (let i = ctxBefore; i < diffStart; i++) {
    if (oldLines[i] !== undefined) lines.push(` ${oldLines[i]}`)
  }

  // 变更区域
  for (let i = diffStart; i <= diffEnd; i++) {
    if (i < oldLines.length && oldLines[i] !== newLines[i]) {
      lines.push(`-${oldLines[i]}`)
    }
    if (i < newLines.length && oldLines[i] !== newLines[i]) {
      lines.push(`+${newLines[i]}`)
    }
  }

  // 后上下文
  for (let i = diffEnd + 1; i <= ctxAfter; i++) {
    if (newLines[i] !== undefined) lines.push(` ${newLines[i]}`)
  }

  return lines.join("\n")
}
