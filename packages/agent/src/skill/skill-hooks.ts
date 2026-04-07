/**
 * Skill Hook 系统
 *
 * 让 Skill 通过 hooks/{EventName}.md 文件声明对事件的监听。
 * 事件触发时自动向 LLM 注入提示消息。
 *
 * 设计来源：
 * - CC event-bus 的纯提示词路线
 * - clawhub self-improving-agent 的 hook 脚本模式
 * - 截图中的 "技能 Hook 系统" 设计
 *
 * 事件来源：
 * - 代码控制点：工具调用失败、命令执行完成等
 * - LLM 主动触发：通过 emit_event 工具发射
 * - Skill frontmatter 中的 emits 声明
 *
 * 架构：
 *   SkillHookRegistry（单例）
 *     ├── 注册来源 1：SKILL.md frontmatter 中的 hooks 声明
 *     ├── 注册来源 2：skill 目录下的 hooks/{EventName}.md 文件
 *     └── 注册来源 3：代码中直接注册
 *
 * 作用域：
 * - global: 所有 chat 会话生效
 * - session: 仅当前会话
 * - cascade: 当前 chat + 子代理继承
 */

import { getKnowledgeSkillLoader } from "./knowledge"
import { existsSync, readFileSync, readdirSync } from "fs"
import { join, basename } from "path"

// ============================================================================
// Types
// ============================================================================

export type HookScope = "global" | "session" | "cascade"

export interface HookRegistration {
  /** 订阅的事件名 */
  event: string
  /** 来源 skill 名称 */
  skillName: string
  /** 触发时注入的提示消息 */
  message: string
  /** 执行优先级 */
  priority: "high" | "medium" | "low"
  /** 作用域 */
  scope: HookScope
  /** 来源类型 */
  source: "frontmatter" | "hook-file" | "code"
}

export interface EventPayload {
  /** 事件名 */
  name: string
  /** 发射源 */
  source: string
  /** 上下文数据 */
  context?: Record<string, unknown>
  /** 时间戳 */
  timestamp?: number
}

// ============================================================================
// SkillHookRegistry
// ============================================================================

export class SkillHookRegistry {
  private hooks = new Map<string, HookRegistration[]>()
  private pendingEvents: EventPayload[] = [] // deferred 事件队列

  /**
   * 从 SkillLoader 的 frontmatter hooks 声明批量注册
   */
  registerFromSkillLoader(): void {
    const loader = getKnowledgeSkillLoader()
    if (!loader) return

    // 清除 frontmatter 来源的旧注册
    for (const [event, regs] of this.hooks) {
      this.hooks.set(event, regs.filter((r) => r.source !== "frontmatter"))
    }

    // 遍历所有 skills，注册 hooks
    for (const name of loader.listNames()) {
      const skill = loader.getSkill(name)
      if (!skill?.meta.hooks) continue

      for (const hook of skill.meta.hooks) {
        this.register({
          event: hook.event,
          skillName: name,
          message: hook.action,
          priority: hook.priority || "medium",
          scope: "global",
          source: "frontmatter",
        })
      }
    }
  }

  /**
   * 扫描 skill 目录下的 hooks/ 子目录，加载 {EventName}.md 文件
   * 文件名即事件名（如 hooks/build.failed.md → 事件 build:failed）
   */
  registerFromHookFiles(skillDir: string, skillName: string): void {
    const hooksDir = join(skillDir, "hooks")
    if (!existsSync(hooksDir)) return

    try {
      const files = readdirSync(hooksDir).filter((f) => f.endsWith(".md"))
      for (const file of files) {
        const eventName = basename(file, ".md").replace(/\./g, ":")
        const content = readFileSync(join(hooksDir, file), "utf-8")

        // 解析 hook 文件的 frontmatter
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)/)
        let priority: HookRegistration["priority"] = "medium"
        let scope: HookScope = "global"

        if (match) {
          const fmLines = match[1].split("\n")
          for (const line of fmLines) {
            const [key, val] = line.split(":").map((s) => s.trim())
            if (key === "priority" && val) priority = val as HookRegistration["priority"]
            if (key === "scope" && val) scope = val as HookScope
          }
        }

        const message = match ? match[2].trim() : content.trim()

        this.register({
          event: eventName,
          skillName,
          message,
          priority,
          scope,
          source: "hook-file",
        })
      }
    } catch {
      // 静默忽略读取错误
    }
  }

  /**
   * 注册一个 hook
   */
  register(reg: HookRegistration): void {
    const existing = this.hooks.get(reg.event) || []
    // 避免重复注册（同 skill + 同 source）
    const isDuplicate = existing.some((r) => r.skillName === reg.skillName && r.source === reg.source)
    if (!isDuplicate) {
      existing.push(reg)
      // 按优先级排序
      const priorityMap: Record<string, number> = { high: 0, medium: 1, low: 2 }
      existing.sort((a, b) => (priorityMap[a.priority] ?? 1) - (priorityMap[b.priority] ?? 1))
      this.hooks.set(reg.event, existing)
    }
  }

  /**
   * 触发事件，返回所有匹配的 hook 注入消息
   */
  emit(payload: EventPayload): string[] {
    const registrations = this.hooks.get(payload.name) || []
    if (registrations.length === 0) return []

    const messages: string[] = []
    for (const reg of registrations) {
      // 构造注入消息
      let msg = `[SkillHook:${reg.event}→${reg.skillName}] ${reg.message}`
      if (payload.context) {
        const contextStr = Object.entries(payload.context)
          .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join(", ")
        msg += `\nContext: ${contextStr}`
      }
      messages.push(msg)
    }

    return messages
  }

  /**
   * 将事件加入 deferred 队列（任务结束前批量处理）
   */
  defer(payload: EventPayload): void {
    // 合并同名事件
    const existing = this.pendingEvents.find((e) => e.name === payload.name)
    if (existing && existing.context && payload.context) {
      Object.assign(existing.context, payload.context)
    } else if (!existing) {
      this.pendingEvents.push({ ...payload, timestamp: Date.now() })
    }
  }

  /**
   * 处理所有 deferred 事件，返回注入消息，清空队列
   */
  flushDeferred(): string[] {
    const allMessages: string[] = []
    for (const event of this.pendingEvents) {
      allMessages.push(...this.emit(event))
    }
    this.pendingEvents = []
    return allMessages
  }

  /**
   * 获取所有已注册事件的摘要（调试/展示用）
   */
  getSummary(): string {
    if (this.hooks.size === 0) return "(no hooks registered)"

    const lines: string[] = []
    for (const [event, regs] of this.hooks) {
      for (const reg of regs) {
        lines.push(`  ${event} → ${reg.skillName} [${reg.priority}/${reg.scope}/${reg.source}]`)
      }
    }
    return lines.join("\n")
  }

  /**
   * 查找订阅了特定事件的 hooks
   */
  getSubscribers(eventName: string): HookRegistration[] {
    return this.hooks.get(eventName) || []
  }

  /**
   * hook 总数
   */
  get size(): number {
    let count = 0
    for (const regs of this.hooks.values()) {
      count += regs.length
    }
    return count
  }

  /**
   * 清除指定作用域的 hooks
   */
  clearScope(scope: HookScope): void {
    for (const [event, regs] of this.hooks) {
      this.hooks.set(event, regs.filter((r) => r.scope !== scope))
    }
    // 清理空项
    for (const [event, regs] of this.hooks) {
      if (regs.length === 0) this.hooks.delete(event)
    }
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalRegistry: SkillHookRegistry | null = null

export function initSkillHookRegistry(): SkillHookRegistry {
  globalRegistry = new SkillHookRegistry()
  return globalRegistry
}

export function getSkillHookRegistry(): SkillHookRegistry | null {
  return globalRegistry
}
