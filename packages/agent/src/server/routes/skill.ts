/**
 * 技能相关路由 handler
 */

import type { IncomingMessage, ServerResponse } from "http"
import type {
  ServerConfig,
  ExecuteSkillRequest,
  SkillResponse,
} from "../types"
import { sendError, sendJson, parseBody } from "../middleware"
import { executeSkill, hasSkill, listSkills } from "../../skill"

/**
 * 执行技能
 */
export async function handleExecuteSkill(
  req: IncomingMessage,
  res: ServerResponse,
  skillName: string,
  config: ServerConfig
): Promise<void> {
  const body = await parseBody<ExecuteSkillRequest>(req)
  const cwd = body.cwd || config.defaultCwd || process.cwd()

  if (!hasSkill(skillName)) {
    sendError(res, 404, "SKILL_NOT_FOUND", `Skill not found: ${skillName}`)
    return
  }

  const startTime = Date.now()

  try {
    const result = await executeSkill(skillName, body.args || [], {
      cwd,
      apiKey: config.claudeApiKey,
      baseURL: config.claudeBaseURL,
    })

    const response: SkillResponse = {
      success: result.success,
      output: result.output,
      error: result.error,
      duration: Date.now() - startTime,
    }

    sendJson(res, 200, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const response: SkillResponse = {
      success: false,
      output: "",
      error: message,
      duration: Date.now() - startTime,
    }
    sendJson(res, 200, response)
  }
}

/**
 * 列出技能
 */
export function handleListSkills(res: ServerResponse): void {
  const skills = listSkills().map((skill) => ({
    name: skill.name,
    description: skill.description,
    aliases: skill.aliases,
  }))

  sendJson(res, 200, { skills })
}
