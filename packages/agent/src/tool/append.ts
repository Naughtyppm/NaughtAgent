import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"

/** 单次追加最大行数限制 */
const MAX_LINES_PER_APPEND = 60

const DESCRIPTION = `Appends content to an existing file.

Usage:
- Use this tool to add content to the end of a file without overwriting
- The file must already exist (use 'write' to create new files)
- Automatically adds a newline before the content if the file doesn't end with one
- Ideal for:
  - Adding new functions/classes to existing code files
  - Appending log entries
  - Building files incrementally to avoid large single writes

⚠️ IMPORTANT: Maximum ${MAX_LINES_PER_APPEND} lines per append call.
For larger content, use multiple append calls.`

export const AppendTool = Tool.define({
  id: "append",
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to append to"),
    content: z.string().describe("The content to append to the file"),
  }),

  async execute(params, ctx) {
    let filePath = params.filePath

    filePath = resolvePath(filePath, ctx.cwd)

    const title = `append → ${path.basename(filePath)}`

    // 检查行数限制
    const lines = params.content.split("\n").length
    if (lines > MAX_LINES_PER_APPEND) {
      return {
        title,
        output: `❌ ERROR: Content too large (${lines} lines). Maximum is ${MAX_LINES_PER_APPEND} lines per append.

🔧 SOLUTION: Split into multiple append calls:
- append: lines 1-${MAX_LINES_PER_APPEND}
- append: lines ${MAX_LINES_PER_APPEND + 1}-${lines}

DO NOT retry with the same large content. Split it first.`,
        metadata: { 
          error: "CONTENT_TOO_LARGE",
          lines,
          maxLines: MAX_LINES_PER_APPEND,
        },
      }
    }

    // 检查文件是否存在
    try {
      await fs.access(filePath)
    } catch {
      return {
        title,
        output: `Error: File does not exist: ${filePath}\nUse 'write' tool to create new files.`,
        metadata: { error: "FILE_NOT_FOUND" },
      }
    }

    // 读取现有内容以检查是否需要添加换行
    const existingContent = await fs.readFile(filePath, "utf-8")
    const needsNewline = existingContent.length > 0 && !existingContent.endsWith("\n")
    
    // 构建要追加的内容
    const contentToAppend = needsNewline ? "\n" + params.content : params.content

    // 追加内容
    await fs.appendFile(filePath, contentToAppend, "utf-8")

    const bytes = Buffer.byteLength(params.content, "utf-8")

    // 读取更新后的文件以获取总行数
    const updatedContent = await fs.readFile(filePath, "utf-8")
    const totalLines = updatedContent.split("\n").length

    const output = `Appended to: ${filePath}\n\nAdded ${lines} lines (${bytes} bytes)\nTotal lines: ${totalLines}`

    return {
      title,
      output,
      metadata: {
        linesAdded: lines,
        bytesAdded: bytes,
        totalLines,
      },
    }
  },
})
