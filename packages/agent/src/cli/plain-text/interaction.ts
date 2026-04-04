/**
 * Plain-text CLI 用户交互
 *
 * readline 输入、命令处理、Ctrl+C 处理
 */

import * as readline from "node:readline"
import { ANSI, SYMBOLS } from "./constants"
import { colorize, dim, bold } from "./formatter"
import type { FoldManager } from "./fold-manager"
import { ScrollBuffer } from "./scroll-buffer"

// ============================================================================
// 类型
// ============================================================================

export type CommandHandler = (args: string) => void | Promise<void>

export interface InteractionConfig {
  onInput: (text: string) => void | Promise<void>
  onInterrupt: () => void
  foldManager: FoldManager
}

// ============================================================================
// PlainTextInput
// ============================================================================

export class PlainTextInput {
  private rl: readline.Interface | null = null
  private config: InteractionConfig
  private commands: Map<string, CommandHandler> = new Map()
  private scrollBuffer: ScrollBuffer
  private keypressHandler: ((str: string, key: { ctrl?: boolean; name?: string }) => void) | null = null
  private focusedFoldId: string | null = null

  constructor(config: InteractionConfig) {
    this.config = config
    this.scrollBuffer = new ScrollBuffer()
    this.registerBuiltinCommands()
  }

  /** 启动输入循环 */
  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${colorize(SYMBOLS.PROMPT, ANSI.blue)} `,
    })

    // 快捷键：Ctrl+O / F2 折叠/展开当前任务
    readline.emitKeypressEvents(process.stdin)
    this.keypressHandler = (_str: string, key: { ctrl?: boolean; name?: string }) => {
      if (!this.rl) return
      const isToggle = (key.ctrl && key.name === "o") || key.name === "f2"
      if (!isToggle) return
      if (this.rl.line.trim().length > 0) return

      process.stdout.write("\n")
      this.toggleLatestFold()
      this.prompt()
    }
    process.stdin.on("keypress", this.keypressHandler)

    this.rl.on("line", (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) {
        this.prompt()
        return
      }

      // 斜杠命令处理
      if (trimmed.startsWith("/")) {
        this.handleCommand(trimmed)
        return
      }

      // 折叠展开命令（仅 #数字，如 #19）
      if (/^#\d+$/.test(trimmed)) {
        this.handleFoldCommand(trimmed)
        return
      }

      // 普通输入
      void this.config.onInput(trimmed)
    })

    this.rl.on("close", () => {
      this.config.onInterrupt()
    })

    // Ctrl+C 处理
    this.rl.on("SIGINT", () => {
      process.stdout.write("\n")
      this.config.onInterrupt()
    })
  }

  /** 显示提示符 */
  prompt(): void {
    if (this.rl) {
      this.rl.prompt()
    }
  }

  /** 暂停输入（Agent 运行时） */
  pause(): void {
    if (this.rl) {
      this.rl.pause()
    }
  }

  /** 恢复输入 */
  resume(): void {
    if (this.rl) {
      process.stdout.write("\n")
      this.prompt()
    }
  }

  /** 关闭 */
  close(): void {
    if (this.keypressHandler) {
      process.stdin.off("keypress", this.keypressHandler)
      this.keypressHandler = null
    }
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
  }

  // ─── 命令处理 ──────────────────────────────────────

  private registerBuiltinCommands(): void {
    this.commands.set("/help", () => {
      const lines = [
        "",
        bold("可用命令："),
        `  ${colorize("/help", ANSI.cyan)}              显示帮助`,
        `  ${colorize("/clear", ANSI.cyan)}             清屏`,
        `  ${colorize("/compact", ANSI.cyan)}           压缩上下文`,
        `  ${colorize("/model", ANSI.cyan)} [name]       查看/切换模型`,
        `  ${colorize("/agent", ANSI.cyan)} [type]       查看/切换 Agent (build|plan|explore)`,
        `  ${colorize("/thinking", ANSI.cyan)} [on|off]  查看/切换 Extended Thinking`,
        `  ${colorize("/allowall", ANSI.cyan)} [on|off]  会话级全部放行（最高优先级）`,
        `  ${colorize("/render", ANSI.cyan)} [clean|raw]  输出渲染模式（净化/原始）`,
        `  ${colorize("/cost", ANSI.cyan)}              累计 token 用量`,
        `  ${colorize("/memory", ANSI.cyan)} [add|show]   查看/追加持久记忆`,
        `  ${colorize("/folds", ANSI.cyan)}             列出折叠内容`,
        `  ${colorize("/toggle", ANSI.cyan)}            折叠/展开当前任务（最新）`,
        `  ${colorize("/exit", ANSI.cyan)}              退出`,
        "",
        bold("折叠命令："),
        `  ${colorize("#N", ANSI.cyan)}                 展开折叠内容 #N（仅数字有效）`,
        "",
        bold("快捷键："),
        `  ${colorize("Ctrl+C", ANSI.cyan)}             中断运行 / 退出`,
        `  ${colorize("Ctrl+O / F2", ANSI.cyan)}        折叠/展开当前任务（当前聚焦）`,
        `  ${colorize("↑ / ↓", ANSI.cyan)}             历史命令`,
        "",
        bold("提示："),
        `  使用 ${colorize("--thinking", ANSI.cyan)} 或 ${colorize("-t", ANSI.cyan)} 启动时启用 Extended Thinking`,
        `  使用 ${colorize("--ui ink", ANSI.cyan)} 切换到 Ink 富文本 UI`,
        "",
      ]
      process.stdout.write(lines.join("\n") + "\n")
      this.prompt()
    })

    this.commands.set("/clear", () => {
      process.stdout.write("\x1b[2J\x1b[H")
      this.prompt()
    })

    this.commands.set("/exit", () => {
      process.stdout.write(dim("\n再见！\n"))
      process.exit(0)
    })

    this.commands.set("/folds", () => {
      const folds = this.config.foldManager.list()
      if (folds.length === 0) {
        process.stdout.write(dim("\n没有折叠内容。\n"))
      } else {
        process.stdout.write(`\n${bold("折叠内容：")}\n`)
        for (const fold of folds) {
          const stateIcon = fold.state === "collapsed" ? SYMBOLS.EXPAND : SYMBOLS.COLLAPSE
          process.stdout.write(
            `  ${stateIcon} ${colorize(fold.id, ANSI.cyan)} ${dim(fold.summary)} (${fold.lineCount} 行)\n`
          )
        }
      }
      process.stdout.write("\n")
      this.prompt()
    })

    this.commands.set("/toggle", () => {
      this.toggleLatestFold()
      this.prompt()
    })
  }

  /** 注册自定义命令 */
  registerCommand(name: string, handler: CommandHandler): void {
    this.commands.set(name, handler)
  }

  private handleCommand(input: string): void {
    const spaceIdx = input.indexOf(" ")
    const cmd = spaceIdx === -1 ? input : input.slice(0, spaceIdx)
    const args = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1).trim()

    const handler = this.commands.get(cmd)
    if (handler) {
      void handler(args)
    } else {
      process.stdout.write(dim(`\n未知命令: ${cmd}。输入 /help 查看可用命令。\n`))
      this.prompt()
    }
  }

  /** 处理折叠展开命令（#1, #2 等） */
  private handleFoldCommand(input: string): void {
    const id = input.trim()
    const entry = this.config.foldManager.expand(id)
    if (entry) {
      this.focusedFoldId = id
      process.stdout.write(`\n${colorize(SYMBOLS.COLLAPSE, ANSI.cyan)} ${dim(entry.summary)}\n`)
      // 长内容用分页显示
      if (entry.lineCount > 50) {
        this.scrollBuffer.load(entry.content)
        this.renderScrollPage()
      } else {
        const indented = entry.content.split("\n").map(l => `  ${l}`).join("\n")
        process.stdout.write(indented + "\n")
      }
    } else {
      process.stdout.write(dim(`\n折叠 ${id} 不存在。输入 /folds 查看列表。\n`))
    }
    this.prompt()
  }

  /** 折叠/展开最新条目（当前任务） */
  private toggleLatestFold(): void {
    let entry = this.focusedFoldId ? this.config.foldManager.toggle(this.focusedFoldId) : null
    if (!entry) {
      entry = this.config.foldManager.toggleLatest()
      if (entry) {
        this.focusedFoldId = entry.id
      }
    }
    if (!entry) {
      process.stdout.write(dim("\n当前没有可折叠任务。\n"))
      return
    }

    if (entry.state === "expanded") {
      process.stdout.write(`\n${colorize(SYMBOLS.COLLAPSE, ANSI.cyan)} ${dim(entry.summary)}\n`)
      if (entry.lineCount > 50) {
        this.scrollBuffer.load(entry.content)
        this.renderScrollPage()
      } else {
        const indented = entry.content.split("\n").map(l => `  ${l}`).join("\n")
        process.stdout.write(indented + "\n")
      }
    } else {
      process.stdout.write(dim(`\n已折叠 ${entry.id}（${entry.lineCount} 行）\n`))
    }
  }

  /** 渲染滚动分页 */
  private renderScrollPage(): void {
    const page = this.scrollBuffer.getPage()
    const indented = page.lines.map(l => `  ${l}`).join("\n")
    process.stdout.write(indented + "\n")
    process.stdout.write(
      dim(`  [${page.current}/${page.total}] `) +
      (page.hasMore ? dim("Space 下一页 | ") : "") +
      (page.hasPrev ? dim("b 上一页 | ") : "") +
      dim("q 退出\n")
    )
  }
}
