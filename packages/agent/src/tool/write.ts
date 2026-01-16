import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Writes content to a file on the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path
- Parent directories will be created automatically if they don't exist
- ALWAYS prefer editing existing files over creating new ones`

/**
 * 生成简单的 diff 输出
 */
function generateDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")
  
  const lines: string[] = []
  lines.push(`--- a/${path.basename(filePath)}`)
  lines.push(`+++ b/${path.basename(filePath)}`)
  
  // 简单 diff：显示删除和新增的行
  const maxLines = Math.max(oldLines.length, newLines.length)
  let diffStart = -1
  let diffEnd = -1
  
  // 找到第一个不同的行
  for (let i = 0; i < maxLines; i++) {
    if (oldLines[i] !== newLines[i]) {
      diffStart = i
      break
    }
  }
  
  // 找到最后一个不同的行
  for (let i = 0; i < maxLines; i++) {
    const oldIdx = oldLines.length - 1 - i
    const newIdx = newLines.length - 1 - i
    if (oldLines[oldIdx] !== newLines[newIdx]) {
      diffEnd = Math.max(oldIdx, newIdx)
      break
    }
  }
  
  if (diffStart === -1) {
    return "(no changes)"
  }
  
  // 显示上下文
  const contextBefore = Math.max(0, diffStart - 2)
  const contextAfter = Math.min(maxLines - 1, diffEnd + 2)
  
  lines.push(`@@ -${contextBefore + 1},${oldLines.length} +${contextBefore + 1},${newLines.length} @@`)
  
  // 上下文
  for (let i = contextBefore; i < diffStart; i++) {
    if (oldLines[i] !== undefined) {
      lines.push(` ${oldLines[i]}`)
    }
  }
  
  // 删除的行
  for (let i = diffStart; i <= Math.min(diffEnd, oldLines.length - 1); i++) {
    if (oldLines[i] !== newLines[i] && oldLines[i] !== undefined) {
      lines.push(`-${oldLines[i]}`)
    }
  }
  
  // 新增的行
  for (let i = diffStart; i <= Math.min(diffEnd, newLines.length - 1); i++) {
    if (oldLines[i] !== newLines[i] && newLines[i] !== undefined) {
      lines.push(`+${newLines[i]}`)
    }
  }
  
  // 下文
  for (let i = diffEnd + 1; i <= contextAfter; i++) {
    if (newLines[i] !== undefined) {
      lines.push(` ${newLines[i]}`)
    }
  }
  
  return lines.join("\n")
}

export const WriteTool = Tool.define({
  id: "write",
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),

  async execute(params, ctx) {
    let filePath = params.filePath

    // 处理相对路径
    if (!path.isAbsolute(filePath)) {
      filePath = path.resolve(ctx.cwd, filePath)
    }

    const title = path.basename(filePath)
    const dir = path.dirname(filePath)

    // 确保目录存在
    await fs.mkdir(dir, { recursive: true })

    // 检查文件是否已存在，读取旧内容
    let existed = false
    let oldContent = ""
    try {
      oldContent = await fs.readFile(filePath, "utf-8")
      existed = true
    } catch {
      // 文件不存在，这是正常的
    }

    // 写入文件
    await fs.writeFile(filePath, params.content, "utf-8")

    const lines = params.content.split("\n").length
    const bytes = Buffer.byteLength(params.content, "utf-8")

    let output: string
    if (existed) {
      // 修改文件，显示 diff
      const diff = generateDiff(oldContent, params.content, filePath)
      output = `Updated file: ${filePath}\n\n${diff}`
    } else {
      // 新建文件，显示内容预览
      const preview = params.content.length > 500 
        ? params.content.substring(0, 500) + "\n... (truncated)"
        : params.content
      output = `Created file: ${filePath}\n\nWrote ${lines} lines (${bytes} bytes)\n\n${preview}`
    }

    return {
      title,
      output,
      metadata: {
        existed,
        lines,
        bytes,
      },
    }
  },
})
