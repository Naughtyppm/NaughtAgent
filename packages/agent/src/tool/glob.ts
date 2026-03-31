import fg from "fast-glob"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"
import { GLOB_MAX_RESULTS } from "../config"

const DESCRIPTION = `Fast file pattern matching tool.

Usage:
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns`

const MAX_RESULTS = GLOB_MAX_RESULTS

export const GlobTool = Tool.define({
  id: "glob",
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("The glob pattern to match (e.g., '**/*.ts')"),
    path: z.string().optional().describe("The directory to search in (defaults to cwd)"),
  }),

  async execute(params, ctx) {
    let searchPath = params.path

    if (searchPath) {
      searchPath = resolvePath(searchPath, ctx.cwd)
    }
    const cwd = searchPath || ctx.cwd

    const title = params.pattern

    // 执行 glob 搜索
    const matches = await fg(params.pattern, {
      cwd,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/.next/**",
        "**/coverage/**",
      ],
      stats: true,
    })

    // 按修改时间排序（最新的在前）
    matches.sort((a, b) => {
      const aTime = a.stats?.mtime?.getTime() ?? 0
      const bTime = b.stats?.mtime?.getTime() ?? 0
      return bTime - aTime
    })

    // 限制结果数量
    const truncated = matches.length > MAX_RESULTS
    const results = matches.slice(0, MAX_RESULTS)

    // 格式化输出
    let output: string
    if (results.length === 0) {
      output = `No files found matching pattern: ${params.pattern}`
    } else {
      const lines = results.map((entry) => {
        // 显示相对路径
        const relativePath = path.relative(cwd, entry.path)
        return relativePath
      })

      output = lines.join("\n")

      if (truncated) {
        output += `\n\n... (${matches.length - MAX_RESULTS} more files not shown)`
      }

      output = `Found ${matches.length} file(s):\n\n${output}`
    }

    return {
      title,
      output,
      metadata: {
        count: matches.length,
        truncated,
        cwd,
      },
    }
  },
})
