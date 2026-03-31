/**
 * Knowledge Skill 系统（教材路线）
 *
 * 两层架构：
 * - Layer 1: skill 名字+描述注入 system prompt（便宜，~100 tokens/skill）
 * - Layer 2: LLM 调用 load_skill 时返回完整内容（按需加载）
 *
 * 目录结构：
 *   skills/
 *     pdf/
 *       SKILL.md        ← frontmatter(name, description) + body
 *     code-review/
 *       SKILL.md
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs"
import { join } from "path"

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeSkillMeta {
  name: string
  description: string
  tags?: string
}

export interface KnowledgeSkill {
  meta: KnowledgeSkillMeta
  body: string
  path: string
}

// ============================================================================
// Frontmatter 解析
// ============================================================================

function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)/)
  if (!match) return { meta: {}, body: text }

  const meta: Record<string, string> = {}
  for (const line of match[1].trim().split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trim()
    meta[key] = val
  }
  return { meta, body: match[2].trim() }
}

// ============================================================================
// SkillLoader
// ============================================================================

export class SkillLoader {
  private skills = new Map<string, KnowledgeSkill>()
  private skillsDir: string

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir
    this.loadAll()
  }

  /**
   * 扫描 skills/ 目录，加载所有 SKILL.md
   */
  private loadAll(): void {
    if (!existsSync(this.skillsDir)) return

    const entries = readdirSync(this.skillsDir)
    for (const entry of entries) {
      const entryPath = join(this.skillsDir, entry)
      if (!statSync(entryPath).isDirectory()) continue

      const skillFile = join(entryPath, "SKILL.md")
      if (!existsSync(skillFile)) continue

      try {
        const text = readFileSync(skillFile, "utf-8")
        const { meta, body } = parseFrontmatter(text)
        const name = meta.name || entry

        this.skills.set(name, {
          meta: {
            name,
            description: meta.description || "No description",
            tags: meta.tags,
          },
          body,
          path: skillFile,
        })
      } catch {
        // 跳过解析失败的 skill
      }
    }
  }

  /**
   * Layer 1: 给 system prompt 用的摘要（每个 skill 一行）
   */
  getDescriptions(): string {
    if (this.skills.size === 0) return "(no skills available)"

    const lines: string[] = []
    for (const [name, skill] of this.skills) {
      let line = `  - ${name}: ${skill.meta.description}`
      if (skill.meta.tags) line += ` [${skill.meta.tags}]`
      lines.push(line)
    }
    return lines.join("\n")
  }

  /**
   * Layer 2: 给 load_skill 工具用的完整内��
   */
  getContent(name: string): string {
    const skill = this.skills.get(name)
    if (!skill) {
      const available = Array.from(this.skills.keys()).join(", ")
      return `Error: Unknown skill '${name}'. Available: ${available || "none"}`
    }
    return `<skill name="${name}">\n${skill.body}\n</skill>`
  }

  /**
   * 列出所有 skill 名称
   */
  listNames(): string[] {
    return Array.from(this.skills.keys())
  }

  /**
   * skill 数量
   */
  get size(): number {
    return this.skills.size
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalLoader: SkillLoader | null = null

export function initKnowledgeSkills(skillsDir: string): SkillLoader {
  globalLoader = new SkillLoader(skillsDir)
  return globalLoader
}

export function getKnowledgeSkillLoader(): SkillLoader | null {
  return globalLoader
}
