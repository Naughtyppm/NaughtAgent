/**
 * Plain-text CLI 流式渲染器
 *
 * 直写 stdout，管理行状态，处理增量文本输出
 */

import { ANSI } from "./constants"
import { FOLD_PREVIEW_LINES } from "./constants"
import {
  dim,
  formatAiHeader,
  formatToolStart,
  formatToolEnd,
  formatThinkingStart,
  formatThinkingEnd,
  formatError,
  formatTokenUsage,
  formatWelcome,
  shouldFold,
} from "./formatter"
import { FoldManager } from "./fold-manager"

// ============================================================================
// StreamRenderer
// ============================================================================

export class StreamRenderer {
  /** 当前行是否有未换行内容 */
  private inLine = false
  /** 当前是否在思考输出中 */
  private inThinking = false
  /** 当前是否在 AI 文本输出中 */
  private inAiText = false
  /** 折叠管理器 */
  private foldManager: FoldManager
  /** 当前工具名（用于 onToolEnd 生成摘要） */
  private currentToolName: string | null = null
  /** 是否需要思考行前缀 */
  private needThinkingPrefix = false
  /** 是否已显示过请求状态 */
  private showedRequestStatus = false
  /** 当前模型名 */
  private model = ""
  /** 缓冲的空白文本（防止空 delta 提前触发 header） */
  private bufferedText = ""
  /** Markdown 行缓冲（按行净化，避免 chunk 截断） */
  private markdownLineBuffer = ""
  /** 是否处于代码块中（```） */
  private inCodeBlock = false
  /** Markdown 表格缓冲 */
  private tableBuffer: string[] = []
  /** 是否启用 Markdown 净化渲染 */
  private markdownCleanup = true

  constructor() {
    this.foldManager = new FoldManager()
  }

  // ─── 基础输出 ──────────────────────────────────────

  /** 直接写入 stdout（不换行） */
  write(text: string): void {
    process.stdout.write(text)
    if (text.includes("\n")) {
      this.inLine = !text.endsWith("\n")
    } else if (text.length > 0) {
      this.inLine = true
    }
  }

  /** 写入一行（带换行） */
  writeLine(text: string): void {
    if (this.inLine) {
      process.stdout.write("\n")
    }
    process.stdout.write(text + "\n")
    this.inLine = false
  }

  /** 确保在新行上 */
  ensureNewLine(): void {
    if (this.inLine) {
      process.stdout.write("\n")
      this.inLine = false
    }
  }

  // ─── 事件处理 ──────────────────────────────────────

  /** 欢迎信息 */
  renderWelcome(model: string, cwd: string, agent: string): void {
    this.model = model
    this.write(formatWelcome(model, cwd, agent))
  }

  /** 切换模型后更新 renderer 内部状态 */
  setModel(model: string): void {
    this.model = model
  }

  /** 开关 Markdown 净化 */
  setMarkdownCleanup(enabled: boolean): void {
    this.markdownCleanup = enabled
  }

  /** 标记请求开始（显示等待状态） */
  showRequestStatus(): void {
    this.ensureNewLine()
    process.stdout.write(dim("⏳ 请求中...\r"))
    this.showedRequestStatus = true
  }

  /** 清除请求状态行 */
  private clearRequestStatus(): void {
    if (this.showedRequestStatus) {
      // 用空格覆盖 "⏳ 请求中..." 然后回到行首
      process.stdout.write("\x1b[2K\r")
      this.showedRequestStatus = false
    }
  }

  /** AI 文本增量（核心性能路径） */
  onTextDelta(delta: string): void {
    if (!this.inAiText) {
      this.clearRequestStatus()
      // 首次文本输出，先结束可能的思考态
      if (this.inThinking) {
        this.ensureNewLine()
        this.writeLine(formatThinkingEnd())
        this.inThinking = false
      }
      // 如果是空内容，缓冲起来等后续内容一起显示
      // 防止 copilot-api 先发空 text_delta 再发 thinking 导致 header 提前显示
      if (delta.trim().length === 0) {
        this.bufferedText += delta
        return
      }
      this.ensureNewLine()
      // 显示 AI 身份标识
      this.writeLine(formatAiHeader(this.model))
      this.inAiText = true
      // 输出缓冲的空白内容
      if (this.bufferedText) {
        const normalized = this.normalizeMarkdownChunk(this.bufferedText)
        process.stdout.write(normalized)
        this.bufferedText = ""
      }
    }
    const normalized = this.normalizeMarkdownChunk(delta)
    process.stdout.write(normalized)
    this.inLine = !normalized.endsWith("\n")
  }

  /** 文本输出结束 */
  endText(): void {
    const tableTail = this.flushTableBuffer()
    if (tableTail.length > 0) {
      process.stdout.write(tableTail.join("\n") + "\n")
    }
    if (this.markdownLineBuffer.length > 0) {
      const tail = this.normalizeMarkdownLine(this.markdownLineBuffer)
      process.stdout.write(tail)
      this.markdownLineBuffer = ""
      this.inLine = tail.length > 0
    }
    if (this.inAiText) {
      this.ensureNewLine()
      this.inAiText = false
    }
  }

  /** 将流式 chunk 按行净化 Markdown 标记 */
  private normalizeMarkdownChunk(chunk: string): string {
    if (!this.markdownCleanup) {
      return chunk
    }

    this.markdownLineBuffer += chunk
    const parts = this.markdownLineBuffer.split("\n")
    this.markdownLineBuffer = parts.pop() ?? ""

    if (parts.length === 0) {
      return ""
    }

    const out: string[] = []
    for (const line of parts) {
      if (this.inCodeBlock) {
        const normalized = this.normalizeMarkdownLine(line)
        out.push(normalized)
        continue
      }

      if (this.looksLikeMarkdownTableLine(line)) {
        this.tableBuffer.push(line)
        continue
      }

      const flushed = this.flushTableBuffer()
      if (flushed.length > 0) {
        out.push(...flushed)
      }

      out.push(this.normalizeMarkdownLine(line))
    }

    return out.join("\n") + "\n"
  }

  /** 轻量 Markdown -> Plain Text（保留信息，去掉符号噪声） */
  private normalizeMarkdownLine(line: string): string {
    if (!this.markdownCleanup) {
      return line
    }

    const trimmed = line.trim()
    if (trimmed.startsWith("```")) {
      this.inCodeBlock = !this.inCodeBlock
      return ""
    }
    if (this.inCodeBlock) {
      return line
    }

    let text = line
    text = text.replace(/^\s{0,3}#{1,6}\s+/, "")
    text = text.replace(/\*\*(.*?)\*\*/g, "$1")
    text = text.replace(/__(.*?)__/g, "$1")
    text = text.replace(/`([^`]+)`/g, "$1")
    text = text.replace(/^\s*\*\s+/, "- ")
    text = text.replace(/^\s*>\s?/, "")

    return text
  }

  private looksLikeMarkdownTableLine(line: string): boolean {
    if (!this.markdownCleanup || this.inCodeBlock) {
      return false
    }
    const trimmed = line.trim()
    if (!trimmed.includes("|")) {
      return false
    }
    // 过滤掉代码风格的位运算表达式
    if (!trimmed.startsWith("|") && !trimmed.endsWith("|")) {
      return false
    }
    return true
  }

  private flushTableBuffer(): string[] {
    if (this.tableBuffer.length === 0) {
      return []
    }

    const rows = this.tableBuffer
      .map(line => this.splitTableRow(line))
      .filter(cells => cells.length > 0)

    this.tableBuffer = []

    if (rows.length === 0) {
      return []
    }

    const contentRows = rows.filter(cells => !cells.every(c => /^:?-{3,}:?$/.test(c.trim())))
    if (contentRows.length === 0) {
      return []
    }

    const colCount = Math.max(...contentRows.map(r => r.length))
    const widths = new Array<number>(colCount).fill(0)
    for (const row of contentRows) {
      for (let i = 0; i < colCount; i++) {
        const cell = row[i] ?? ""
        widths[i] = Math.max(widths[i], cell.length)
      }
    }

    const formatRow = (row: string[]) => {
      const padded = widths.map((w, i) => (row[i] ?? "").padEnd(w))
      return `| ${padded.join(" | ")} |`
    }

    const out: string[] = []
    out.push(formatRow(contentRows[0]))
    out.push(`|-${widths.map(w => "-".repeat(w)).join("-|-")}-|`)
    for (let i = 1; i < contentRows.length; i++) {
      out.push(formatRow(contentRows[i]))
    }
    return out
  }

  private splitTableRow(line: string): string[] {
    const trimmed = line.trim()
    const core = trimmed.replace(/^\|/, "").replace(/\|$/, "")
    if (!core) {
      return []
    }
    return core.split("|").map(c => c.trim())
  }

  /** 思考内容 */
  onThinking(content: string): void {
    if (!this.inThinking) {
      this.clearRequestStatus()
      // 丢弃先于 thinking 到达的空白 text delta
      this.bufferedText = ""
      this.ensureNewLine()
      this.writeLine(formatThinkingStart())
      this.inThinking = true
      this.needThinkingPrefix = true
    }
    // 思考内容用 magenta 色 + 左边框缩进
    // 按行处理：只在新行开头加竖线前缀
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        // 换行符：输出换行并标记需要前缀
        process.stdout.write("\n")
        this.needThinkingPrefix = true
      }
      if (lines[i].length > 0) {
        if (this.needThinkingPrefix) {
          process.stdout.write(`${ANSI.magenta}│${ANSI.reset} ${ANSI.dim}`)
          this.needThinkingPrefix = false
        }
        process.stdout.write(`${lines[i]}${ANSI.reset}`)
      }
    }
    this.inLine = !content.endsWith("\n")
  }

  /** 思考结束 */
  onThinkingEnd(): void {
    if (this.inThinking) {
      this.ensureNewLine()
      this.writeLine(formatThinkingEnd())
      this.inThinking = false
    }
    // thinking 结束后显示 AI header（如果还没显示）
    if (!this.inAiText) {
      this.ensureNewLine()
      this.writeLine(formatAiHeader(this.model))
      this.inAiText = true
    }
  }

  /** 工具调用开始 */
  onToolStart(_id: string, name: string, input: unknown): void {
    this.clearRequestStatus()
    this.endText()
    this.ensureNewLine()
    this.currentToolName = name
    this.writeLine(formatToolStart(name, input))
  }

  /** 工具调用结束 */
  onToolEnd(_id: string, output: string, isError?: boolean): void {
    const name = this.currentToolName || "tool"
    this.currentToolName = null

    // 始终显示摘要行
    const summaryLine = formatToolEnd(name, output, isError)
    this.writeLine(summaryLine)

    // 如果输出需要折叠，存入折叠管理器
    if (shouldFold(output)) {
      const lines = output.split("\n")
      const preview = lines.slice(0, FOLD_PREVIEW_LINES)
      const remain = Math.max(0, lines.length - FOLD_PREVIEW_LINES)

      // 先展示部分摘要，不再整段隐藏
      const previewText = preview.map(l => `    ${l}`).join("\n")
      if (previewText.trim()) {
        this.writeLine(dim(previewText))
      }

      const foldId = this.foldManager.add(name, output)
      this.writeLine(dim(`  ${foldId} 已折叠剩余 ${remain} 行（Ctrl+O 快速展开/折叠当前任务）`))
    } else if (!isError && output.trim()) {
      // 短输出直接显示（缩进 4 空格）
      const indented = output.split("\n").map(l => `    ${l}`).join("\n")
      this.writeLine(dim(indented))
    }
  }

  /** 错误 */
  onError(error: Error): void {
    this.endText()
    this.ensureNewLine()
    this.writeLine(formatError(error))
  }

  /** 完成 */
  onDone(usage: { inputTokens: number; outputTokens: number; cacheCreationTokens?: number; cacheReadTokens?: number }): void {
    this.endText()
    this.ensureNewLine()
    this.writeLine(formatTokenUsage(usage))
    // 重置轮次状态
    this.inAiText = false
    this.inThinking = false
    this.needThinkingPrefix = false
    this.currentToolName = null
    this.bufferedText = ""
    this.markdownLineBuffer = ""
    this.inCodeBlock = false
    this.tableBuffer = []
  }

  /** 获取折叠管理器（供交互层使用） */
  getFoldManager(): FoldManager {
    return this.foldManager
  }
}
