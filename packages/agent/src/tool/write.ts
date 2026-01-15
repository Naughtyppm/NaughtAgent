import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Writes content to a file on the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path
- Parent directories will be created automatically if they don't exist
- ALWAYS prefer editing existing files over creating new ones`

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

    // 检查文件是否已存在
    let existed = false
    try {
      await fs.access(filePath)
      existed = true
    } catch {
      // 文件不存在，这是正常的
    }

    // 写入文件
    await fs.writeFile(filePath, params.content, "utf-8")

    const lines = params.content.split("\n").length
    const bytes = Buffer.byteLength(params.content, "utf-8")

    const action = existed ? "Updated" : "Created"
    const output = `${action} file: ${filePath}\n\nWrote ${lines} lines (${bytes} bytes)`

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
