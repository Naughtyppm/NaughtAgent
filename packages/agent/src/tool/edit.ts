import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"
import { generateDiff } from "./file-utils"

const DESCRIPTION = `Performs exact string replacements in files.

Usage:
- The edit will FAIL if oldString is not found in the file
- The edit will FAIL if oldString is found multiple times (unless replaceAll is true)
- Use replaceAll to replace all occurrences of oldString`

// generateDiff 来自 file-utils.ts

export const EditTool = Tool.define({
  id: "edit",
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to modify"),
    oldString: z.string().describe("The text to replace"),
    newString: z.string().describe("The text to replace it with"),
    replaceAll: z.boolean().optional().describe("Replace all occurrences (default false)"),
  }),

  async execute(params, ctx) {
    let filePath = params.filePath

    filePath = resolvePath(filePath, ctx.cwd)

    const title = path.basename(filePath)

    // 验证 oldString 和 newString 不同
    if (params.oldString === params.newString) {
      throw new Error("oldString and newString must be different")
    }

    // 读取文件
    let content: string
    try {
      content = await fs.readFile(filePath, "utf-8")
    } catch {
      throw new Error(`File not found: ${filePath}`)
    }

    const { oldString, newString, replaceAll = false } = params

    // 检查 oldString 是否存在
    const firstIndex = content.indexOf(oldString)
    if (firstIndex === -1) {
      throw new Error(`oldString not found in file: ${filePath}`)
    }

    // 检查是否有多个匹配
    const lastIndex = content.lastIndexOf(oldString)
    if (!replaceAll && firstIndex !== lastIndex) {
      throw new Error(
        `oldString found multiple times in file. Use replaceAll: true to replace all occurrences, or provide more context to make the match unique.`
      )
    }

    // 执行替换
    let newContent: string
    let replacements: number

    if (replaceAll) {
      // 计算替换次数
      replacements = content.split(oldString).length - 1
      newContent = content.replaceAll(oldString, newString)
    } else {
      replacements = 1
      newContent = content.substring(0, firstIndex) + newString + content.substring(firstIndex + oldString.length)
    }

    // 写入文件
    await fs.writeFile(filePath, newContent, "utf-8")

    // 生成 diff
    const diff = generateDiff(content, newContent, filePath)

    const output = `Edit applied successfully.\n\n${replacements} replacement(s) made.\n\n${diff}`

    return {
      title,
      output,
      metadata: {
        replacements,
        diff,
      },
    }
  },
})
