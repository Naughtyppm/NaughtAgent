/**
 * Plain-text CLI 折叠管理器
 *
 * 管理工具输出的折叠/展开状态
 * 提供 :unfold <id> / :fold <id> 命令支持
 */

import { FOLD_HISTORY_LIMIT } from "./constants"
import type { FoldEntry } from "./types"

// ============================================================================
// FoldManager
// ============================================================================

export class FoldManager {
  private entries: Map<string, FoldEntry> = new Map()
  private counter = 0
  private latestId: string | null = null

  /** 添加可折叠内容，返回 foldId */
  add(toolName: string, content: string): string {
    const id = `#${++this.counter}`
    const lines = content.split("\n")

    this.entries.set(id, {
      id,
      content,
      state: "collapsed",
      summary: `${toolName}: ${lines.length} lines`,
      lineCount: lines.length,
    })
    this.latestId = id

    // 维持上限
    if (this.entries.size > FOLD_HISTORY_LIMIT) {
      const oldest = this.entries.keys().next().value
      if (oldest) {
        this.entries.delete(oldest)
        if (this.latestId === oldest) {
          this.latestId = this.entries.size > 0 ? Array.from(this.entries.keys()).at(-1) || null : null
        }
      }
    }

    return id
  }

  /** 展开指定折叠内容 */
  expand(id: string): FoldEntry | null {
    const entry = this.entries.get(id)
    if (!entry) return null
    entry.state = "expanded"
    return entry
  }

  /** 折叠指定内容 */
  collapse(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    entry.state = "collapsed"
    return true
  }

  /** 获取指定条目 */
  get(id: string): FoldEntry | null {
    return this.entries.get(id) || null
  }

  /** 获取最新条目 */
  getLatest(): FoldEntry | null {
    if (!this.latestId) return null
    return this.entries.get(this.latestId) || null
  }

  /** 切换最新条目折叠状态 */
  toggleLatest(): FoldEntry | null {
    const entry = this.getLatest()
    if (!entry) return null
    entry.state = entry.state === "collapsed" ? "expanded" : "collapsed"
    return entry
  }

  /** 切换指定条目折叠状态 */
  toggle(id: string): FoldEntry | null {
    const entry = this.entries.get(id)
    if (!entry) return null
    entry.state = entry.state === "collapsed" ? "expanded" : "collapsed"
    return entry
  }

  /** 列出所有可折叠条目 */
  list(): FoldEntry[] {
    return Array.from(this.entries.values())
  }

  /** 清空 */
  clear(): void {
    this.entries.clear()
    this.counter = 0
    this.latestId = null
  }

  /** 当前条目数 */
  get size(): number {
    return this.entries.size
  }
}
