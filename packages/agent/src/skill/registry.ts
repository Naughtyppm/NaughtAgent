/**
 * Skill 注册表
 *
 * 管理所有已注册的 Skills
 */

import type { SkillDefinition } from "./types"

// ============================================================================
// Registry
// ============================================================================

/** Skill 注册表 */
const skillRegistry = new Map<string, SkillDefinition>()

/** 别名映射 */
const aliasMap = new Map<string, string>()

/**
 * 注册 Skill
 */
export function registerSkill(skill: SkillDefinition): void {
  // 验证 skill 名称
  if (!skill.name || typeof skill.name !== "string") {
    throw new Error("Skill name is required")
  }

  if (!skill.workflow) {
    throw new Error(`Skill "${skill.name}" must have a workflow`)
  }

  // 注册主名称
  skillRegistry.set(skill.name, skill)

  // 注册别名
  if (skill.aliases) {
    for (const alias of skill.aliases) {
      aliasMap.set(alias, skill.name)
    }
  }
}

/**
 * 获取 Skill（支持别名）
 */
export function getSkill(name: string): SkillDefinition | undefined {
  // 先尝试直接获取
  const skill = skillRegistry.get(name)
  if (skill) {
    return skill
  }

  // 尝试通过别名获取
  const realName = aliasMap.get(name)
  if (realName) {
    return skillRegistry.get(realName)
  }

  return undefined
}

/**
 * 检查 Skill 是否存在（支持别名）
 */
export function hasSkill(name: string): boolean {
  return skillRegistry.has(name) || aliasMap.has(name)
}

/**
 * 列出所有 Skills
 */
export function listSkills(): SkillDefinition[] {
  return Array.from(skillRegistry.values())
}

/**
 * 注销 Skill
 */
export function unregisterSkill(name: string): boolean {
  const skill = skillRegistry.get(name)
  if (!skill) {
    return false
  }

  // 移除别名
  if (skill.aliases) {
    for (const alias of skill.aliases) {
      aliasMap.delete(alias)
    }
  }

  // 移除主名称
  skillRegistry.delete(name)
  return true
}

/**
 * 清空所有 Skills
 */
export function clearSkills(): void {
  skillRegistry.clear()
  aliasMap.clear()
}

/**
 * 获取注册的 Skill 数量
 */
export function getSkillCount(): number {
  return skillRegistry.size
}
