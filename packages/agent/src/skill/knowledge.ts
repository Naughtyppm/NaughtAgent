/**
 * Knowledge Skill 系统（教材路线）
 *
 * 两层架构：
 * - Layer 1: skill 名字+描述注入 system prompt（便宜，~100 tokens/skill）
 * - Layer 2: LLM 调用 load_skill 时返回完整内容（按需加载）
 *
 * 兼容 CC（Claude Code）Skills 格式：
 * - 支持 hooks/emits 声明（事件总线协议）
 * - 支持多行 description（YAML | 语法）
 * - 加载优先级：项目级 > NA全局 > CC全局
 *
 * 目录结构：
 *   skills/
 *     pdf/
 *       SKILL.md        ← frontmatter(name, description, hooks?, emits?) + body
 *     code-review/
 *       SKILL.md
 */

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"

// ============================================================================
// Types
// ============================================================================

/** 事件订阅声明（CC 兼容） */
export interface SkillHook {
  event: string
  action: string
  priority?: "high" | "medium" | "low"
}

/** 事件发射声明（CC 兼容） */
export interface SkillEmit {
  event: string
  when: string
  timing?: "immediate" | "deferred"
}

export interface KnowledgeSkillMeta {
  name: string
  description: string
  tags?: string
  hooks?: SkillHook[]
  emits?: SkillEmit[]
}

export interface KnowledgeSkill {
  meta: KnowledgeSkillMeta
  body: string
  path: string
}

// ============================================================================
// Frontmatter 解析（支持 CC 风格 YAML：多行值 + 嵌套数组）
// ============================================================================

/**
 * 解析 YAML frontmatter，支持：
 * - 简单 key: value
 * - 多行值（| 语法，缩进判断结束）
 * - 数组项（- event: xxx 嵌套对象）
 */
function parseFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)/)
  if (!match) return { meta: {}, body: text }

  const yamlText = match[1]
  const body = match[2].trim()
  const meta: Record<string, unknown> = {}

  const lines = yamlText.split("\n")
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) { i++; continue }

    // 顶级 key
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) { i++; continue }

    const key = line.slice(0, colonIdx).trim()
    const valPart = line.slice(colonIdx + 1).trim()

    if (valPart === "|" || valPart === "|+") {
      // 多行文本值
      i++
      const textLines: string[] = []
      while (i < lines.length) {
        const nextLine = lines[i]
        if (nextLine.length > 0 && !nextLine.startsWith(" ") && !nextLine.startsWith("\t")) break
        textLines.push(nextLine.replace(/^  /, ""))
        i++
      }
      meta[key] = textLines.join("\n").trim()
    } else if (valPart === "" || valPart === undefined) {
      // 可能是数组或嵌套对象
      i++
      const items: Record<string, string>[] = []
      while (i < lines.length) {
        const nextLine = lines[i]
        if (nextLine.length > 0 && !nextLine.startsWith(" ") && !nextLine.startsWith("\t")) break
        const itemMatch = nextLine.trim().match(/^-\s+(.+)$/)
        if (itemMatch) {
          // 数组项：解析 "- event: xxx" 或 "- value"
          const itemContent = itemMatch[1]
          const itemColonIdx = itemContent.indexOf(":")
          if (itemColonIdx !== -1) {
            // 对象型数组项
            const obj: Record<string, string> = {}
            const itemKey = itemContent.slice(0, itemColonIdx).trim()
            const itemVal = itemContent.slice(itemColonIdx + 1).trim().replace(/^["']|["']$/g, "")
            obj[itemKey] = itemVal
            i++
            // 读取后续属性（同缩进级别，非 - 开头）
            while (i < lines.length) {
              const propLine = lines[i].trim()
              if (!propLine || propLine.startsWith("-") || (lines[i].length > 0 && !lines[i].startsWith(" ") && !lines[i].startsWith("\t"))) break
              const propColonIdx = propLine.indexOf(":")
              if (propColonIdx !== -1) {
                const propKey = propLine.slice(0, propColonIdx).trim()
                const propVal = propLine.slice(propColonIdx + 1).trim().replace(/^["']|["']$/g, "")
                obj[propKey] = propVal
              }
              i++
            }
            items.push(obj)
          } else {
            // 简单字符串数组项
            items.push({ _value: itemContent.replace(/^["']|["']$/g, "") })
            i++
          }
        } else {
          i++
        }
      }
      if (items.length > 0) {
        meta[key] = items
      }
    } else {
      // 简单 key: value
      meta[key] = valPart.replace(/^["']|["']$/g, "")
      i++
    }
  }

  return { meta, body }
}

/**
 * 将解析出的 hooks 原始数据转为类型安全的 SkillHook[]
 */
function parseHooks(raw: unknown): SkillHook[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const hooks: SkillHook[] = []
  for (const item of raw) {
    if (item && typeof item === "object" && "event" in item) {
      hooks.push({
        event: String(item.event),
        action: String(item.action || ""),
        priority: (item.priority as SkillHook["priority"]) || "medium",
      })
    }
  }
  return hooks.length > 0 ? hooks : undefined
}

/**
 * 将解析出的 emits 原始数据转为类型安全的 SkillEmit[]
 */
function parseEmits(raw: unknown): SkillEmit[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const emits: SkillEmit[] = []
  for (const item of raw) {
    if (item && typeof item === "object" && "event" in item) {
      emits.push({
        event: String(item.event),
        when: String(item.when || ""),
        timing: (item.timing as SkillEmit["timing"]) || "deferred",
      })
    }
  }
  return emits.length > 0 ? emits : undefined
}

// ============================================================================
// SkillLoader
// ============================================================================

export class SkillLoader {
  private skills = new Map<string, KnowledgeSkill>()

  constructor(skillsDir?: string) {
    if (skillsDir) {
      this.addDirectory(skillsDir)
    }
  }

  /**
   * 添加一个 skills 目录，扫描并加载其中的 SKILL.md
   * 支持多次调用，累积加载多个目录（项目级 + 全局级）
   */
  addDirectory(skillsDir: string): void {
    if (!existsSync(skillsDir)) return

    const entries = readdirSync(skillsDir)
    for (const entry of entries) {
      const entryPath = join(skillsDir, entry)
      if (!statSync(entryPath).isDirectory()) continue

      const skillFile = join(entryPath, "SKILL.md")
      if (!existsSync(skillFile)) continue

      try {
        const text = readFileSync(skillFile, "utf-8")
        const { meta, body } = parseFrontmatter(text)
        const name = String(meta.name || entry)

        // 项目级优先：如果同名 skill 已存在（来自先加载的目录），不覆盖
        if (!this.skills.has(name)) {
          this.skills.set(name, {
            meta: {
              name,
              description: String(meta.description || "No description"),
              tags: meta.tags ? String(meta.tags) : undefined,
              hooks: parseHooks(meta.hooks),
              emits: parseEmits(meta.emits),
            },
            body,
            path: skillFile,
          })
        }
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
   * Layer 2: 给 load_skill 工具用的完整内容
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
   * 获取 skill 对象（供 create_skill 等工具使用）
   */
  getSkill(name: string): KnowledgeSkill | undefined {
    return this.skills.get(name)
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

  /**
   * 事件总线：获取所有 hooks 声明的描述（注入 system prompt）
   * CC 兼容：让 LLM 知道哪些 skill 订阅了哪些事件
   */
  getHooksDescriptions(): string | null {
    const hookEntries: string[] = []

    for (const [name, skill] of this.skills) {
      if (!skill.meta.hooks || skill.meta.hooks.length === 0) continue
      for (const hook of skill.meta.hooks) {
        hookEntries.push(`  - [${hook.priority || "medium"}] ${hook.event} → ${name}: ${hook.action}`)
      }
    }

    if (hookEntries.length === 0) return null
    return hookEntries.join("\n")
  }

  /**
   * 事件总线：获取所有 emits 声明的描述（注入 system prompt）
   * CC 兼容：让 LLM 知道哪些 skill 在什么条件下发射事件
   */
  getEmitsDescriptions(): string | null {
    const emitEntries: string[] = []

    for (const [name, skill] of this.skills) {
      if (!skill.meta.emits || skill.meta.emits.length === 0) continue
      for (const emit of skill.meta.emits) {
        emitEntries.push(`  - ${name} emits ${emit.event} (${emit.timing || "deferred"}): ${emit.when}`)
      }
    }

    if (emitEntries.length === 0) return null
    return emitEntries.join("\n")
  }

  /**
   * 查找订阅了特定事件的 skills（供事件总线路由使用）
   */
  findSubscribers(eventName: string): Array<{ skill: KnowledgeSkill; hook: SkillHook }> {
    const subscribers: Array<{ skill: KnowledgeSkill; hook: SkillHook }> = []
    for (const skill of this.skills.values()) {
      if (!skill.meta.hooks) continue
      for (const hook of skill.meta.hooks) {
        if (hook.event === eventName) {
          subscribers.push({ skill, hook })
        }
      }
    }
    // 按优先级排序: high > medium > low
    const priorityMap: Record<string, number> = { high: 0, medium: 1, low: 2 }
    subscribers.sort((a, b) => (priorityMap[a.hook.priority || "medium"] ?? 1) - (priorityMap[b.hook.priority || "medium"] ?? 1))
    return subscribers
  }

  /**
   * 创建新 skill 并注册到 loader（create_skill 工具使用）
   * @returns 创建的 SKILL.md 路径
   */
  createSkill(params: {
    name: string
    description: string
    body: string
    tags?: string
    hooks?: SkillHook[]
    emits?: SkillEmit[]
    skillsDir: string
  }): string {
    const { name, description, body, tags, hooks, emits, skillsDir } = params
    const skillDir = join(skillsDir, name)
    const skillFile = join(skillDir, "SKILL.md")

    // 构建 frontmatter
    const fmLines: string[] = ["---"]
    fmLines.push(`name: ${name}`)
    fmLines.push(`description: ${description}`)
    if (tags) fmLines.push(`tags: ${tags}`)
    if (hooks && hooks.length > 0) {
      fmLines.push("hooks:")
      for (const h of hooks) {
        fmLines.push(`  - event: "${h.event}"`)
        fmLines.push(`    action: "${h.action}"`)
        if (h.priority) fmLines.push(`    priority: ${h.priority}`)
      }
    }
    if (emits && emits.length > 0) {
      fmLines.push("emits:")
      for (const e of emits) {
        fmLines.push(`  - event: "${e.event}"`)
        fmLines.push(`    when: "${e.when}"`)
        if (e.timing) fmLines.push(`    timing: ${e.timing}`)
      }
    }
    fmLines.push("---")

    const content = fmLines.join("\n") + "\n\n" + body

    // 创建目录和文件
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(skillFile, content, "utf-8")

    // 热注册到当前 loader
    if (!this.skills.has(name)) {
      this.skills.set(name, {
        meta: { name, description, tags, hooks, emits },
        body,
        path: skillFile,
      })
    }

    return skillFile
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
