/**
 * load_skill 工具 - Layer 2 按需加载知识
 *
 * LLM 在 system prompt 里看到 skill 列表（Layer 1），
 * 遇到不熟悉的领域时调用此工具加载完整内容（Layer 2）。
 *
 * CC-style 去重：同一 skill 在会话中重复加载时返回简短提醒，
 * 避免重复消耗 context window。
 */

import { z } from "zod"
import { Tool } from "./tool"
import { getKnowledgeSkillLoader } from "../skill/knowledge"

/** 会话级别已加载 skill 追踪（避免重复注入） */
const loadedSkills = new Set<string>()

/** 重置追踪（新会话时调用） */
export function resetLoadedSkills(): void {
  loadedSkills.clear()
}

/** 获取已加载的 skill 列表 */
export function getLoadedSkillNames(): ReadonlySet<string> {
  return loadedSkills
}

export const LoadSkillTool = Tool.define({
  id: "load_skill",
  description: "MANDATORY: Load a skill's full instructions before performing any task that matches a skill. " +
    "After loading, follow the skill's workflow strictly. " +
    "Check the skill list in your system prompt to identify matches.",
  isConcurrencySafe: true,
  isReadOnly: true,
  parameters: z.object({
    name: z.string().describe("Skill name to load (from the available skills list)"),
  }),

  async execute(params) {
    const loader = getKnowledgeSkillLoader()
    if (!loader) {
      return {
        title: "load_skill",
        output: "Error: Knowledge skill system not initialized.",
      }
    }

    // 去重：已加载过的 skill 返回简短提醒
    if (loadedSkills.has(params.name)) {
      return {
        title: `load_skill: ${params.name} (cached)`,
        output: `Skill "${params.name}" was already loaded in this session. Follow its instructions from the earlier load. If you need a refresh, the key points are in your conversation history.`,
      }
    }

    const content = loader.getContent(params.name)
    loadedSkills.add(params.name)
    return {
      title: `load_skill: ${params.name}`,
      output: content,
    }
  },
})
