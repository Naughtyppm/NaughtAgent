/**
 * SharedContext - 融合代理共享状态
 *
 * 借鉴 LangGraph 的 State 概念：
 * - 所有子代理共享同一份结构化状态
 * - orchestrator 写入任务分配，worker 写入执行结果
 * - 支持 findings（发现）、decisions（决策）、artifacts（产物）
 *
 * 执行流程：
 *   会话 → orchestrator 创建 SharedContext
 *     → 派发 worker（传入 contextId）
 *     → worker 写入 findings
 *     → orchestrator 读取 findings，决定下一步
 *     → 再派发 worker...
 *     → 最终 orchestrator 汇总输出
 */

// ============================================================================
// Types
// ============================================================================

/** 共享条目类型 */
export type SharedEntryType = "finding" | "decision" | "artifact" | "error"

/** 共享条目 */
export interface SharedEntry {
  /** 条目 ID */
  id: string
  /** 类型 */
  type: SharedEntryType
  /** 来源（哪个子代理写入的） */
  source: string
  /** 内容 */
  content: string
  /** 结构化数据（可选） */
  data?: Record<string, unknown>
  /** 标签 */
  tags?: string[]
  /** 时间戳 */
  timestamp: number
}

/** SharedContext 配置 */
export interface SharedContextConfig {
  /** 最大条目数（防止无限膨胀） */
  maxEntries?: number
  /** 创建者标识 */
  owner: string
}

/** SharedContext 快照（用于传递给子代理） */
export interface SharedContextSnapshot {
  id: string
  entries: SharedEntry[]
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

// ============================================================================
// SharedContext 实现
// ============================================================================

const DEFAULT_MAX_ENTRIES = 100
let idCounter = 0

function generateEntryId(): string {
  return `entry_${++idCounter}_${Date.now()}`
}

/**
 * 共享上下文容器
 *
 * 类比 LangGraph 的 State：所有节点读写同一份状态
 */
export class SharedContext {
  readonly id: string
  private entries: SharedEntry[] = []
  private metadata: Map<string, unknown> = new Map()
  private maxEntries: number
  private createdAt: number
  private updatedAt: number

  constructor(config: SharedContextConfig) {
    this.id = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.createdAt = Date.now()
    this.updatedAt = this.createdAt
    this.metadata.set("owner", config.owner)
  }

  /**
   * 添加条目
   */
  add(
    type: SharedEntryType,
    source: string,
    content: string,
    options?: { data?: Record<string, unknown>; tags?: string[] }
  ): SharedEntry {
    // 超过上限时移除最早的非 decision 条目
    if (this.entries.length >= this.maxEntries) {
      const removeIdx = this.entries.findIndex(e => e.type !== "decision")
      if (removeIdx !== -1) {
        this.entries.splice(removeIdx, 1)
      }
    }

    const entry: SharedEntry = {
      id: generateEntryId(),
      type,
      source,
      content,
      data: options?.data,
      tags: options?.tags,
      timestamp: Date.now(),
    }

    this.entries.push(entry)
    this.updatedAt = Date.now()
    return entry
  }

  /**
   * 按类型查询条目
   */
  getByType(type: SharedEntryType): SharedEntry[] {
    return this.entries.filter(e => e.type === type)
  }

  /**
   * 按来源查询条目
   */
  getBySource(source: string): SharedEntry[] {
    return this.entries.filter(e => e.source === source)
  }

  /**
   * 按标签查询条目
   */
  getByTag(tag: string): SharedEntry[] {
    return this.entries.filter(e => e.tags?.includes(tag))
  }

  /**
   * 获取所有条目
   */
  getAll(): SharedEntry[] {
    return [...this.entries]
  }

  /**
   * 获取条目数量
   */
  get size(): number {
    return this.entries.length
  }

  /**
   * 设置元数据
   */
  setMeta(key: string, value: unknown): void {
    this.metadata.set(key, value)
    this.updatedAt = Date.now()
  }

  /**
   * 获取元数据
   */
  getMeta(key: string): unknown {
    return this.metadata.get(key)
  }

  /**
   * 生成摘要（给 orchestrator 看的结构化概览）
   */
  summarize(): string {
    const findings = this.getByType("finding")
    const decisions = this.getByType("decision")
    const artifacts = this.getByType("artifact")
    const errors = this.getByType("error")

    const lines: string[] = []
    lines.push(`[SharedContext ${this.id}] 共 ${this.entries.length} 条记录`)

    if (decisions.length > 0) {
      lines.push(`\n## 决策 (${decisions.length})`)
      for (const d of decisions) {
        lines.push(`- [${d.source}] ${d.content}`)
      }
    }

    if (findings.length > 0) {
      lines.push(`\n## 发现 (${findings.length})`)
      for (const f of findings) {
        lines.push(`- [${f.source}] ${f.content}`)
      }
    }

    if (artifacts.length > 0) {
      lines.push(`\n## 产物 (${artifacts.length})`)
      for (const a of artifacts) {
        lines.push(`- [${a.source}] ${a.content}`)
      }
    }

    if (errors.length > 0) {
      lines.push(`\n## 错误 (${errors.length})`)
      for (const e of errors) {
        lines.push(`- [${e.source}] ${e.content}`)
      }
    }

    return lines.join("\n")
  }

  /**
   * 导出快照（可序列化，用于传递给子代理）
   */
  snapshot(): SharedContextSnapshot {
    return {
      id: this.id,
      entries: [...this.entries],
      metadata: Object.fromEntries(this.metadata),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  /**
   * 从快照恢复
   */
  static fromSnapshot(snap: SharedContextSnapshot): SharedContext {
    const ctx = new SharedContext({ owner: String(snap.metadata.owner ?? "unknown") })
    // 覆盖 id 和时间
    ;(ctx as { id: string }).id = snap.id
    ctx.entries = [...snap.entries]
    ctx.metadata = new Map(Object.entries(snap.metadata))
    ctx.createdAt = snap.createdAt
    ctx.updatedAt = snap.updatedAt
    return ctx
  }
}

// ============================================================================
// 全局注册表（通过 contextId 访问）
// ============================================================================

const contextRegistry = new Map<string, SharedContext>()

/**
 * 创建并注册 SharedContext
 */
export function createSharedContext(owner: string, maxEntries?: number): SharedContext {
  const ctx = new SharedContext({ owner, maxEntries })
  contextRegistry.set(ctx.id, ctx)
  return ctx
}

/**
 * 通过 ID 获取 SharedContext
 */
export function getSharedContext(id: string): SharedContext | undefined {
  return contextRegistry.get(id)
}

/**
 * 移除 SharedContext（任务完成后清理）
 */
export function removeSharedContext(id: string): boolean {
  return contextRegistry.delete(id)
}

/**
 * 清空所有 SharedContext（用于测试）
 */
export function clearAllSharedContexts(): void {
  contextRegistry.clear()
}
