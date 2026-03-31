/**
 * memory 工具 - 跨会话持久记忆
 *
 * 类似 Claude Code 的 auto-memory，让 LLM 主动保存关键信息到磁盘。
 * 存储位置：{cwd}/.naughty/memory.md（项目级）
 *
 * 操作：
 * - read: 读取当前记忆文件
 * - write: 覆写整个记忆文件
 * - append: 追加内容到记忆文件
 */

import { z } from "zod"
import { Tool } from "./tool"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

export const MemoryTool = Tool.define({
  id: "memory",
  description: `Persistent memory that survives across sessions. Use this to save important information (project patterns, user preferences, key decisions, debugging insights) that should be remembered in future conversations.

Actions:
- read: View current memory contents
- write: Replace entire memory file (use for reorganization)
- append: Add new information (preferred for adding entries)

The memory is stored at {cwd}/.naughty/memory.md and automatically loaded into your system prompt at the start of each session.

Guidelines:
- Save stable patterns confirmed across interactions, not session-specific details
- Keep entries concise with dates
- Do NOT duplicate information already in NAUGHTY.md`,
  parameters: z.object({
    action: z.enum(["read", "write", "append"]).describe("Operation to perform"),
    content: z.string().optional().describe("Content to write/append (required for write/append)"),
  }),

  async execute(params, ctx) {
    const cwd = ctx.cwd || process.cwd()
    const memoryDir = join(cwd, ".naughty")
    const memoryPath = join(memoryDir, "memory.md")

    if (params.action === "read") {
      if (!existsSync(memoryPath)) {
        return {
          title: "memory read",
          output: "No memory file found. Use memory(action: 'append', content: '...') to start saving memories.",
        }
      }
      const content = readFileSync(memoryPath, "utf-8")
      return {
        title: "memory read",
        output: content || "(empty memory file)",
      }
    }

    if (!params.content) {
      return {
        title: "memory error",
        output: "Error: content is required for write/append actions.",
      }
    }

    // 确保目录存在
    mkdirSync(memoryDir, { recursive: true })

    if (params.action === "write") {
      writeFileSync(memoryPath, params.content, "utf-8")
      return {
        title: "memory write",
        output: `Memory file updated (${params.content.length} chars) at ${memoryPath}`,
      }
    }

    // append
    const existing = existsSync(memoryPath)
      ? readFileSync(memoryPath, "utf-8")
      : "# Project Memory\n\n"
    const newContent = existing.trimEnd() + "\n\n" + params.content.trim() + "\n"
    writeFileSync(memoryPath, newContent, "utf-8")
    return {
      title: "memory append",
      output: `Appended to memory (${params.content.length} chars) at ${memoryPath}`,
    }
  },
})
