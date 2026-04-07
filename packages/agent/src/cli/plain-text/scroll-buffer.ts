/**
 * Plain-text CLI 虚拟滚动缓冲区
 *
 * 管理大量输出的分页显示
 * 支持翻页、搜索
 */

import { SCROLL_PAGE_SIZE, SCROLL_BUFFER_MAX } from "./constants"

// ============================================================================
// ScrollBuffer
// ============================================================================

export class ScrollBuffer {
  private lines: string[] = []
  private offset = 0
  private pageSize: number

  constructor(pageSize = SCROLL_PAGE_SIZE) {
    this.pageSize = pageSize
  }

  /** 加载内容 */
  load(content: string): void {
    this.lines = content.split("\n")
    this.offset = 0

    // 限制最大行数
    if (this.lines.length > SCROLL_BUFFER_MAX) {
      this.lines = this.lines.slice(-SCROLL_BUFFER_MAX)
    }
  }

  /** 获取当前页内容 */
  getPage(): { lines: string[]; current: number; total: number; hasMore: boolean; hasPrev: boolean } {
    const pageLines = this.lines.slice(this.offset, this.offset + this.pageSize)
    return {
      lines: pageLines,
      current: Math.floor(this.offset / this.pageSize) + 1,
      total: Math.ceil(this.lines.length / this.pageSize),
      hasMore: this.offset + this.pageSize < this.lines.length,
      hasPrev: this.offset > 0,
    }
  }

  /** 下一页 */
  nextPage(): boolean {
    if (this.offset + this.pageSize >= this.lines.length) return false
    this.offset += this.pageSize
    return true
  }

  /** 上一页 */
  prevPage(): boolean {
    if (this.offset <= 0) return false
    this.offset = Math.max(0, this.offset - this.pageSize)
    return true
  }

  /** 跳转到首页 */
  firstPage(): void {
    this.offset = 0
  }

  /** 跳转到末页 */
  lastPage(): void {
    this.offset = Math.max(0, Math.floor((this.lines.length - 1) / this.pageSize) * this.pageSize)
  }

  /** 搜索（返回包含关键词的行号列表） */
  search(keyword: string): number[] {
    const results: number[] = []
    const lower = keyword.toLowerCase()
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i].toLowerCase().includes(lower)) {
        results.push(i)
      }
    }
    return results
  }

  /** 跳转到指定行 */
  jumpTo(lineNumber: number): void {
    this.offset = Math.max(0, Math.min(lineNumber, this.lines.length - this.pageSize))
  }

  /** 总行数 */
  get totalLines(): number {
    return this.lines.length
  }

  /** 清空 */
  clear(): void {
    this.lines = []
    this.offset = 0
  }
}
