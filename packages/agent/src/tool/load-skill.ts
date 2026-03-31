/**
 * load_skill 工具 - Layer 2 按需加载知识
 *
 * LLM 在 system prompt 里看到 skill 列表（Layer 1），
 * 遇到不熟悉的领域时调用此工具加载完整内容（Layer 2）。
 */

import { z } from "zod"
import { Tool } from "./tool"
import { getKnowledgeSkillLoader } from "../skill/knowledge"

export const LoadSkillTool = Tool.define({
  id: "load_skill",
  description: "Load specialized knowledge by name. Use this when you need domain expertise listed in your available skills.",
  parameters: z.object({
    name: z.string().describe("Skill name to load"),
  }),

  async execute(params) {
    const loader = getKnowledgeSkillLoader()
    if (!loader) {
      return {
        title: "load_skill",
        output: "Error: Knowledge skill system not initialized.",
      }
    }

    const content = loader.getContent(params.name)
    return {
      title: `load_skill: ${params.name}`,
      output: content,
    }
  },
})
