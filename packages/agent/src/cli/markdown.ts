/**
 * 终端 Markdown 渲染器
 *
 * 将 Markdown 文本转换为带 ANSI 颜色的终端输出
 */

// ANSI 颜色代码
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  // 颜色
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  // 背景
  bgGray: "\x1b[100m",
}

/**
 * 渲染 Markdown 文本为终端输出
 */
export function renderMarkdown(text: string): string {
  let result = text

  // 代码块 ```code``` - 先处理，避免内部被其他规则影响
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const header = lang ? `${ANSI.dim}[${lang}]${ANSI.reset}\n` : ""
    return `\n${header}${ANSI.cyan}${code.trimEnd()}${ANSI.reset}\n`
  })

  // 行内代码 `code`
  result = result.replace(/`([^`]+)`/g, `${ANSI.cyan}$1${ANSI.reset}`)

  // 粗体 **text** 或 __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, `${ANSI.bold}${ANSI.yellow}$1${ANSI.reset}`)
  result = result.replace(/__([^_]+)__/g, `${ANSI.bold}${ANSI.yellow}$1${ANSI.reset}`)

  // 斜体 *text* 或 _text_ (避免匹配已处理的粗体)
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `${ANSI.italic}${ANSI.white}$1${ANSI.reset}`)
  result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, `${ANSI.italic}${ANSI.white}$1${ANSI.reset}`)

  // 标题 # ## ### 等
  result = result.replace(/^(#{1,6})\s+(.+)$/gm, (_match, hashes, title) => {
    const level = hashes.length
    if (level === 1) {
      // H1: 紫色背景
      return `\n\x1b[45m\x1b[37m ${title} \x1b[0m\n`
    } else if (level === 2) {
      // H2: 蓝色背景
      return `\n\x1b[44m\x1b[37m ${title} \x1b[0m\n`
    } else if (level === 3) {
      // H3: 深灰背景
      return `\n\x1b[100m\x1b[37m ${title} \x1b[0m\n`
    } else {
      // H4+: 粗体青色
      return `\x1b[1m\x1b[36m${title}\x1b[0m`
    }
  })

  // 引用 > text
  result = result.replace(/^>\s+(.+)$/gm, `${ANSI.gray}│ ${ANSI.italic}$1${ANSI.reset}`)

  // 无序列表 - item 或 * item
  result = result.replace(/^(\s*)[-*]\s+(.+)$/gm, `$1${ANSI.green}•${ANSI.reset} $2`)

  // 有序列表 1. item
  result = result.replace(/^(\s*)(\d+)\.\s+(.+)$/gm, `$1${ANSI.green}$2.${ANSI.reset} $3`)

  // 链接 [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${ANSI.underline}${ANSI.blue}$1${ANSI.reset}${ANSI.gray}($2)${ANSI.reset}`)

  // 水平线 --- 或 ***
  result = result.replace(/^[-*]{3,}$/gm, `${ANSI.gray}────────────────────────────────${ANSI.reset}`)

  // 任务列表 - [ ] 或 - [x]
  result = result.replace(/^(\s*)[-*]\s+\[ \]\s+(.+)$/gm, `$1${ANSI.gray}☐${ANSI.reset} $2`)
  result = result.replace(/^(\s*)[-*]\s+\[x\]\s+(.+)$/gmi, `$1${ANSI.green}☑${ANSI.reset} $2`)

  return result
}

/**
 * 流式渲染器 - 处理流式输出中的 Markdown
 *
 * 由于流式输出是逐字符的，我们需要缓冲并在合适时机渲染
 */
export class StreamMarkdownRenderer {
  private buffer = ""
  private inCodeBlock = false
  private codeBlockLang = ""

  /**
   * 处理新的文本片段
   * @returns 可以立即输出的渲染后文本
   */
  process(chunk: string): string {
    this.buffer += chunk

    // 检测代码块开始/结束
    const codeBlockStart = this.buffer.match(/```(\w*)\n?$/)
    const codeBlockEnd = this.buffer.match(/```\s*$/)

    if (codeBlockStart && !this.inCodeBlock) {
      this.inCodeBlock = true
      this.codeBlockLang = codeBlockStart[1]
      // 输出代码块头部
      const before = this.buffer.slice(0, codeBlockStart.index)
      this.buffer = ""
      const header = this.codeBlockLang ? `${ANSI.dim}[${this.codeBlockLang}]${ANSI.reset}\n` : ""
      return this.renderInline(before) + `\n${header}${ANSI.cyan}`
    }

    if (codeBlockEnd && this.inCodeBlock && this.buffer.length > 3) {
      this.inCodeBlock = false
      const code = this.buffer.slice(0, codeBlockEnd.index)
      this.buffer = ""
      return `${code}${ANSI.reset}\n`
    }

    // 在代码块内，直接输出
    if (this.inCodeBlock) {
      const output = this.buffer
      this.buffer = ""
      return output
    }

    // 非代码块，尝试找到可以安全输出的部分
    // 保留可能是 Markdown 语法的尾部
    const safeEnd = this.findSafeEnd()
    if (safeEnd > 0) {
      const safe = this.buffer.slice(0, safeEnd)
      this.buffer = this.buffer.slice(safeEnd)
      return this.renderInline(safe)
    }

    return ""
  }

  /**
   * 刷新缓冲区，输出所有剩余内容
   */
  flush(): string {
    if (this.buffer.length === 0) return ""

    const output = this.inCodeBlock
      ? `${this.buffer}${ANSI.reset}`
      : this.renderInline(this.buffer)

    this.buffer = ""
    this.inCodeBlock = false
    return output
  }

  /**
   * 找到可以安全输出的位置
   */
  private findSafeEnd(): number {
    const buf = this.buffer

    // 检查是否以可能的 Markdown 语法开始符结尾
    const unsafeEndings = [
      /`+$/, // 可能是代码开始
      /\*+$/, // 可能是粗体/斜体
      /_+$/, // 可能是粗体/斜体
      /\[.*$/, // 可能是链接
      /#+$/, // 可能是标题
      />+$/, // 可能是引用
      /-+$/, // 可能是列表或水平线
      /\d+\.?\s*$/, // 可能是有序列表
    ]

    for (const pattern of unsafeEndings) {
      const match = buf.match(pattern)
      if (match && match.index !== undefined) {
        return match.index
      }
    }

    // 找最后一个换行符，按行处理更安全
    const lastNewline = buf.lastIndexOf("\n")
    if (lastNewline > 0) {
      return lastNewline + 1
    }

    // 如果缓冲区太长，强制输出一部分
    if (buf.length > 200) {
      return buf.length - 20
    }

    return 0
  }

  /**
   * 渲染行内 Markdown
   */
  private renderInline(text: string): string {
    let result = text

    // 行内代码
    result = result.replace(/`([^`]+)`/g, `${ANSI.cyan}$1${ANSI.reset}`)

    // 粗体
    result = result.replace(/\*\*([^*]+)\*\*/g, `${ANSI.bold}${ANSI.yellow}$1${ANSI.reset}`)
    result = result.replace(/__([^_]+)__/g, `${ANSI.bold}${ANSI.yellow}$1${ANSI.reset}`)

    // 斜体
    result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `${ANSI.italic}$1${ANSI.reset}`)
    result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, `${ANSI.italic}$1${ANSI.reset}`)

    // 标题（行首）
    result = result.replace(/^(#{1,6})\s+(.+)$/gm, (_match, hashes, title) => {
      const level = hashes.length
      if (level === 1) {
        // H1: 紫色背景
        return `\n\x1b[45m\x1b[37m ${title} \x1b[0m\n`
      } else if (level === 2) {
        // H2: 蓝色背景
        return `\n\x1b[44m\x1b[37m ${title} \x1b[0m\n`
      } else if (level === 3) {
        // H3: 深灰背景
        return `\n\x1b[100m\x1b[37m ${title} \x1b[0m\n`
      }
      // H4+: 粗体青色
      return `\x1b[1m\x1b[36m${title}\x1b[0m`
    })

    // 引用
    result = result.replace(/^>\s+(.+)$/gm, `${ANSI.gray}│ ${ANSI.italic}$1${ANSI.reset}`)

    // 列表
    result = result.replace(/^(\s*)[-*]\s+(.+)$/gm, `$1${ANSI.green}•${ANSI.reset} $2`)
    result = result.replace(/^(\s*)(\d+)\.\s+(.+)$/gm, `$1${ANSI.green}$2.${ANSI.reset} $3`)

    // 链接
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${ANSI.underline}${ANSI.blue}$1${ANSI.reset}`)

    // 水平线
    result = result.replace(/^[-*]{3,}$/gm, `${ANSI.gray}────────────────────────────────${ANSI.reset}`)

    // 任务列表
    result = result.replace(/^(\s*)[-*]\s+\[ \]\s+(.+)$/gm, `$1${ANSI.gray}☐${ANSI.reset} $2`)
    result = result.replace(/^(\s*)[-*]\s+\[x\]\s+(.+)$/gmi, `$1${ANSI.green}☑${ANSI.reset} $2`)

    return result
  }
}
