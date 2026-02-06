import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"

/** 单次写入最大行数限制 */
const MAX_LINES_PER_WRITE = 80

/** 内容类型检测和分段建议 */
interface ContentAnalysis {
  type: 'markdown' | 'code' | 'config' | 'unknown'
  suggestedChunks: string[]
  breakPoints: number[]
}

/**
 * 分析内容类型并建议分段点
 */
function analyzeContent(content: string): ContentAnalysis {
  const lines = content.split('\n')
  const totalLines = lines.length
  
  // 检测内容类型
  let type: ContentAnalysis['type'] = 'unknown'
  if (content.startsWith('#') || content.includes('\n## ') || content.includes('\n### ')) {
    type = 'markdown'
  } else if (content.includes('function ') || content.includes('class ') || 
             content.includes('export ') || content.includes('import ')) {
    type = 'code'
  } else if (content.includes('{') && content.includes('}') && 
             (content.includes('"') || content.includes(':'))) {
    type = 'config'
  }
  
  // 找到合适的分段点
  const breakPoints: number[] = []
  const suggestedChunks: string[] = []
  
  if (type === 'markdown') {
    // Markdown: 在标题处分段
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## ') || lines[i].startsWith('### ')) {
        breakPoints.push(i)
      }
    }
    suggestedChunks.push('按 Markdown 标题分段 (## 或 ###)')
  } else if (type === 'code') {
    // 代码: 在函数/类定义处分段
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.match(/^(export\s+)?(async\s+)?function\s+/) ||
          line.match(/^(export\s+)?class\s+/) ||
          line.match(/^(export\s+)?const\s+\w+\s*=/) && i > 0) {
        breakPoints.push(i)
      }
    }
    suggestedChunks.push('按函数/类定义分段')
  } else {
    // 其他: 按固定行数分段
    for (let i = MAX_LINES_PER_WRITE; i < totalLines; i += 50) {
      breakPoints.push(i)
    }
    suggestedChunks.push(`按 ${MAX_LINES_PER_WRITE} 行分段`)
  }
  
  return { type, suggestedChunks, breakPoints }
}

/**
 * 生成智能分段建议
 */
function generateChunkingSuggestion(content: string, lines: number): string {
  const analysis = analyzeContent(content)
  const chunks: string[] = []
  
  // 计算建议的分段
  let chunkStart = 1
  const breakPoints = analysis.breakPoints.filter(bp => bp > 0 && bp < lines)
  
  if (breakPoints.length > 0 && breakPoints[0] <= MAX_LINES_PER_WRITE) {
    // 使用智能分段点
    chunks.push(`1. write: 行 1-${breakPoints[0]} (${analysis.suggestedChunks[0]})`)
    chunkStart = breakPoints[0] + 1
    
    for (let i = 1; i < breakPoints.length && chunkStart < lines; i++) {
      const end = Math.min(breakPoints[i], chunkStart + 50)
      chunks.push(`${i + 1}. append: 行 ${chunkStart}-${end}`)
      chunkStart = end + 1
    }
    
    if (chunkStart < lines) {
      chunks.push(`${chunks.length + 1}. append: 行 ${chunkStart}-${lines}`)
    }
  } else {
    // 使用固定分段
    chunks.push(`1. write: 行 1-${MAX_LINES_PER_WRITE}`)
    chunkStart = MAX_LINES_PER_WRITE + 1
    let chunkNum = 2
    
    while (chunkStart < lines) {
      const end = Math.min(chunkStart + 50, lines)
      chunks.push(`${chunkNum}. append: 行 ${chunkStart}-${end}`)
      chunkStart = end + 1
      chunkNum++
    }
  }
  
  return chunks.join('\n')
}

const DESCRIPTION = `Writes content to a file on the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path
- Parent directories will be created automatically if they don't exist
- ALWAYS prefer editing existing files over creating new ones

⚠️ IMPORTANT: Maximum ${MAX_LINES_PER_WRITE} lines per write call.
For larger files, use 'write' for the first chunk, then 'append' for the rest.`

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

    // 检查行数限制
    const lines = params.content.split("\n").length
    if (lines > MAX_LINES_PER_WRITE) {
      const suggestion = generateChunkingSuggestion(params.content, lines)
      const analysis = analyzeContent(params.content)
      
      return {
        title,
        output: `❌ ERROR: Content too large (${lines} lines). Maximum is ${MAX_LINES_PER_WRITE} lines per write.

📊 Content type detected: ${analysis.type}

🔧 RECOMMENDED CHUNKING STRATEGY:
${suggestion}

⚠️ DO NOT retry with the same large content. Split it first using the strategy above.`,
        metadata: { 
          error: "CONTENT_TOO_LARGE",
          lines,
          maxLines: MAX_LINES_PER_WRITE,
          contentType: analysis.type,
        },
      }
    }

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

    const lineCount = params.content.split("\n").length
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
      output = `Created file: ${filePath}\n\nWrote ${lineCount} lines (${bytes} bytes)\n\n${preview}`
    }

    return {
      title,
      output,
      metadata: {
        existed,
        lines: lineCount,
        bytes,
      },
    }
  },
})
