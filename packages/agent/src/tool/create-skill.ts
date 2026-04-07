/**
 * create_skill 工具 - 创建新的 Knowledge Skill
 *
 * 与 load_skill 对称：load_skill 读取 skill，create_skill 创建 skill。
 * 支持声明 hooks/emits（CC 事件总线兼容）。
 * 创建后立即热注册到当前 SkillLoader，无需重启。
 */

import { z } from "zod"
import { join } from "path"
import { homedir } from "os"
import { Tool } from "./tool"
import { getKnowledgeSkillLoader } from "../skill/knowledge"
import type { SkillHook, SkillEmit } from "../skill/knowledge"

/** 验证 skill 名称（目录名安全性） */
function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name) && name.length <= 64
}

export const CreateSkillTool = Tool.define({
  id: "create_skill",
  description:
    "Create a new knowledge skill (SKILL.md). Supports hooks/emits for event bus integration. " +
    "The skill is immediately available via load_skill after creation.",
  isConcurrencySafe: false,
  isReadOnly: false,
  parameters: z.object({
    name: z.string().describe("Skill name (alphanumeric, hyphens, underscores)"),
    description: z.string().describe("One-line skill description for Layer 1 discovery"),
    body: z.string().describe("Full Markdown content of the skill (the SKILL.md body after frontmatter)"),
    tags: z.string().optional().describe("Comma-separated tags for categorization"),
    scope: z
      .enum(["project", "global"])
      .default("project")
      .describe("Where to create: 'project' = .naughty/skills/, 'global' = ~/.naughtyagent/skills/"),
    hooks: z
      .array(
        z.object({
          event: z.string().describe("Event name to subscribe to (e.g. 'build:failed')"),
          action: z.string().describe("What to do when event fires"),
          priority: z.enum(["high", "medium", "low"]).optional().describe("Execution priority"),
        }),
      )
      .optional()
      .describe("Event subscriptions (CC event bus compatible)"),
    emits: z
      .array(
        z.object({
          event: z.string().describe("Event name to emit (e.g. 'skill:created')"),
          when: z.string().describe("Condition that triggers emission"),
          timing: z.enum(["immediate", "deferred"]).optional().describe("When to fire"),
        }),
      )
      .optional()
      .describe("Events this skill emits"),
  }),

  async execute(params, ctx) {
    const loader = getKnowledgeSkillLoader()
    if (!loader) {
      return {
        title: "create_skill",
        output: "Error: Knowledge skill system not initialized.",
        isError: true,
      }
    }

    // 验证名称
    if (!isValidSkillName(params.name)) {
      return {
        title: "create_skill",
        output: `Error: Invalid skill name '${params.name}'. Use alphanumeric characters, hyphens, and underscores only (max 64 chars).`,
        isError: true,
      }
    }

    // 检查是否已存在
    if (loader.getSkill(params.name)) {
      return {
        title: "create_skill",
        output: `Error: Skill '${params.name}' already exists. Use a different name or update the existing skill manually.`,
        isError: true,
      }
    }

    // 确定目标目录
    let skillsDir: string
    if (params.scope === "global") {
      skillsDir = join(homedir(), ".naughtyagent", "skills")
    } else {
      skillsDir = join(ctx.cwd, ".naughty", "skills")
    }

    try {
      const skillFile = loader.createSkill({
        name: params.name,
        description: params.description,
        body: params.body,
        tags: params.tags,
        hooks: params.hooks as SkillHook[] | undefined,
        emits: params.emits as SkillEmit[] | undefined,
        skillsDir,
      })

      const hookCount = params.hooks?.length || 0
      const emitCount = params.emits?.length || 0
      const extras = []
      if (hookCount > 0) extras.push(`${hookCount} hook(s)`)
      if (emitCount > 0) extras.push(`${emitCount} emit(s)`)
      const extrasStr = extras.length > 0 ? ` with ${extras.join(", ")}` : ""

      return {
        title: `create_skill: ${params.name}`,
        output: `Created skill '${params.name}'${extrasStr} at ${skillFile}\nScope: ${params.scope}\nThe skill is now available via load_skill.`,
      }
    } catch (error) {
      return {
        title: "create_skill",
        output: `Error creating skill: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
})
