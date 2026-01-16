/**
 * 交互式 REPL 模式
 *
 * 类似 Claude Code 的交互体验
 * 支持非阻塞执行，可在 AI 思考时输入命令
 */

import * as readline from "readline"
import type { RunnerConfig, RunnerEventHandlers } from "./runner"
import { createRunner } from "./runner"
import type { PermissionRequest } from "../permission"
import { StreamMarkdownRenderer } from "./markdown"

/**
 * REPL 配置
 */
export interface ReplConfig {
  cwd: string
  agent: "build" | "plan" | "explore"
  autoConfirm: boolean
}

/**
 * 任务状态管理
 */
class TaskState {
  private _isRunning = false
  private _abortController: AbortController | null = null

  get isRunning(): boolean {
    return this._isRunning
  }

  get abortSignal(): AbortSignal | undefined {
    return this._abortController?.signal
  }

  start(): AbortSignal {
    this._isRunning = true
    this._abortController = new AbortController()
    return this._abortController.signal
  }

  cancel(): boolean {
    if (this._isRunning && this._abortController) {
      this._abortController.abort()
      return true
    }
    return false
  }

  end(): void {
    this._isRunning = false
    this._abortController = null
  }
}

/**
 * 获取 Provider 信息
 */
function getProviderInfo(): string {
  if (process.env.ANTHROPIC_API_KEY) {
    return "Anthropic API"
  }
  if (process.env.OPENAI_API_KEY) {
    return "OpenRouter"
  }
  return "Kiro"
}

/**
 * 获取模型显示名称
 */
function getModelName(): string {
  if (process.env.ANTHROPIC_API_KEY) {
    return "Anthropic (claude-sonnet-4)"
  }
  if (process.env.OPENAI_API_KEY) {
    return "OpenRouter (claude-sonnet-4)"
  }
  return "Kiro (claude-sonnet-4)"
}

/**
 * 打印用户输入标题
 */
function printUserHeader(): void {
  // 黄色背景黑字
  console.log(`\n\x1b[43m\x1b[30m ## Me \x1b[0m`)
}

/**
 * 打印 AI 回复标题
 */
function printAIHeader(modelName: string): void {
  // 紫色背景白字
  console.log(`\x1b[45m\x1b[37m ## ${modelName} \x1b[0m\n`)
}

/**
 * 计算字符串显示宽度（中文算2，英文算1）
 */
function getDisplayWidth(str: string): number {
  let width = 0
  for (const char of str) {
    // 中文、日文、韩文等宽字符
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

/**
 * 打印欢迎界面
 */
function printWelcome(config: ReplConfig, autoConfirm: boolean): void {
  const modeStr = autoConfirm
    ? `\x1b[92mauto\x1b[0m`
    : `\x1b[93mmanual\x1b[0m`

  // 猫咪 ASCII art
  const cat = [
    "  /\\_/\\  ",
    " ( o.o ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ]

  // 右侧信息（全英文）
  const infoRaw = [
    { text: `NaughtyAgent v0.1.0`, colored: `\x1b[1;95mNaughtyAgent\x1b[0m \x1b[90mv0.1.0\x1b[0m` },
    { text: `${config.agent} · ${getProviderInfo()}`, colored: `\x1b[93m${config.agent}\x1b[0m · \x1b[96m${getProviderInfo()}\x1b[0m` },
    { text: `mode: ${autoConfirm ? "auto" : "manual"}`, colored: `mode: ${modeStr}` },
    { text: config.cwd, colored: `\x1b[92m${config.cwd}\x1b[0m` },
    { text: `/help for commands`, colored: `\x1b[93m/help for commands\x1b[0m` },
  ]

  const W = 10  // 猫咪宽度
  // 动态计算总宽度
  const maxInfoWidth = Math.max(...infoRaw.map(i => i.text.length))
  const totalWidth = W + 3 + maxInfoWidth + 3  // 猫咪 + 间隔 + 信息 + 右边距

  // 填充右侧到固定宽度
  const padRight = (text: string, colored: string, width: number) => {
    const pad = width - text.length
    return colored + " ".repeat(Math.max(0, pad))
  }

  console.log()
  console.log(`\x1b[90m╭${"─".repeat(totalWidth)}╮\x1b[0m`)
  for (let i = 0; i < cat.length; i++) {
    const info = infoRaw[i] || { text: "", colored: "" }
    const rightContent = padRight(info.text, info.colored, maxInfoWidth)
    console.log(`\x1b[90m│\x1b[95m${cat[i]}\x1b[0m  ${rightContent}   \x1b[90m│\x1b[0m`)
  }
  console.log(`\x1b[90m╰${"─".repeat(totalWidth)}╯\x1b[0m`)
  console.log()
}

/**
 * 打印帮助
 */
function printHelp(): void {
  console.log("")
  console.log("\x1b[1m命令：\x1b[0m")
  console.log("  /help           显示帮助")
  console.log("  /cancel         取消当前任务")
  console.log("  /manual         切换为手动确认模式")
  console.log("  /auto           切换为自动确认模式")
  console.log("  /agent <mode>   切换 Agent (build/plan/explore)")
  console.log("  /run [file]     执行计划文件 (默认 plan.md)")
  console.log("  /clear          清屏")
  console.log("  /exit           退出")
  console.log("")
  console.log("\x1b[1m快捷键：\x1b[0m")
  console.log("  Esc / Alt+P     切换为手动模式（任务执行中可用）")
  console.log("")
  console.log("\x1b[1m模式：\x1b[0m")
  console.log("  \x1b[33mbuild\x1b[0m    直接执行，边想边做")
  console.log("  \x1b[33mplan\x1b[0m     先规划，生成 plan.md 后 /run 执行")
  console.log("  \x1b[33mexplore\x1b[0m  只读探索，快速了解代码")
  console.log("")
}

/**
 * 权限确认结果
 */
type ConfirmResult = "allow" | "deny" | "always" | "skip"

/**
 * 用户确认提示（增强版）
 */
async function promptConfirmEnhanced(
  request: PermissionRequest,
  rl: readline.Interface
): Promise<ConfirmResult> {
  return new Promise((resolve) => {
    // 显示操作详情
    const typeNames: Record<string, string> = {
      bash: "执行命令",
      read: "读取文件",
      write: "写入文件",
      edit: "编辑文件",
      glob: "搜索文件",
      grep: "搜索内容",
    }
    const typeName = typeNames[request.type] || request.type

    console.log()
    console.log(`\x1b[43m\x1b[30m ⚠️  需要确认 \x1b[0m`)
    console.log(`\x1b[1m${typeName}\x1b[0m`)
    console.log(`\x1b[90m${request.resource}\x1b[0m`)
    console.log()
    console.log(`  \x1b[32my\x1b[0m 允许    \x1b[32ma\x1b[0m 总是允许    \x1b[31mn\x1b[0m 拒绝    \x1b[33ms\x1b[0m 跳过任务`)

    rl.question(`\n选择 [y/a/n/s]: `, (answer) => {
      const choice = answer.toLowerCase().trim()
      switch (choice) {
        case "y":
        case "yes":
          resolve("allow")
          break
        case "a":
        case "always":
          resolve("always")
          break
        case "n":
        case "no":
          resolve("deny")
          break
        case "s":
        case "skip":
          resolve("skip")
          break
        default:
          // 默认拒绝
          resolve("deny")
      }
    })
  })
}

/**
 * 思考状态动画
 */
class ThinkingSpinner {
  private interval: ReturnType<typeof setInterval> | null = null
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  private frameIndex = 0
  private message = ""
  private detail = ""

  start(message: string = "思考中", detail: string = "") {
    this.message = message
    this.detail = detail
    this.frameIndex = 0
    this.clear()

    this.render()

    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length
      this.render()
    }, 80)
  }

  private render() {
    const detailStr = this.detail ? ` \x1b[90m${this.detail}\x1b[0m` : ""
    process.stdout.write(`\r\x1b[K\x1b[33m${this.frames[this.frameIndex]}\x1b[0m ${this.message}...${detailStr}`)
  }

  update(message: string, detail: string = "") {
    this.message = message
    this.detail = detail
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.clear()
  }

  private clear() {
    process.stdout.write("\r\x1b[K") // 清除当前行
  }
}

/**
 * 工具名称映射
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  read: "读取文件",
  write: "写入文件",
  edit: "编辑文件",
  bash: "执行命令",
  glob: "搜索文件",
  grep: "搜索内容",
}

/**
 * 获取工具显示名称
 */
function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] || toolName
}

/**
 * 创建输出处理器
 */
function createOutputHandlers(spinner: ThinkingSpinner, modelName: string = "Claude"): RunnerEventHandlers {
  let hasOutput = false
  const mdRenderer = new StreamMarkdownRenderer()

  return {
    onText: (content) => {
      if (!hasOutput) {
        spinner.stop()
        // 显示 AI 角色标题
        printAIHeader(modelName)
        hasOutput = true
      }
      // 使用 Markdown 渲染器处理输出
      const rendered = mdRenderer.process(content)
      if (rendered) {
        process.stdout.write(rendered)
      }
    },
    onToolStart: (_id, name, input) => {
      // 先刷新 Markdown 缓冲区
      const remaining = mdRenderer.flush()
      if (remaining) {
        process.stdout.write(remaining)
      }

      if (!hasOutput) {
        spinner.stop()
        hasOutput = true
      }

      // 获取工具参数的简短描述
      const inputObj = input as Record<string, unknown>
      let detail = ""
      if (name === "read" || name === "write" || name === "edit") {
        detail = String(inputObj.filePath || inputObj.file_path || "").split(/[/\\]/).pop() || ""
      } else if (name === "bash") {
        const cmd = String(inputObj.command || "")
        detail = cmd.length > 30 ? cmd.substring(0, 30) + "..." : cmd
      } else if (name === "glob") {
        detail = String(inputObj.pattern || "")
      } else if (name === "grep") {
        detail = String(inputObj.pattern || "")
      }

      // 更新 spinner 显示工具执行状态
      spinner.update(getToolDisplayName(name), detail)
    },
    onToolEnd: (_id, output, isError) => {
      spinner.stop()

      if (isError) {
        console.log(`\x1b[31m✗\x1b[0m ${output.substring(0, 100)}`)
      } else {
        // 检查是否包含 diff（有 +/- 开头的行）
        const hasDiff = output.includes("\n-") || output.includes("\n+")
        if (hasDiff) {
          // 显示带颜色和背景的 diff
          const lines = output.split("\n")
          console.log(`\x1b[32m✓\x1b[0m \x1b[90m${lines[0]}\x1b[0m`)
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i]
            if (line.startsWith("+++") || line.startsWith("---")) {
              // 文件头：灰色
              console.log(`\x1b[90m${line}\x1b[0m`)
            } else if (line.startsWith("+")) {
              // 新增行：绿色文字 + 淡绿背景
              console.log(`\x1b[32;48;5;22m${line}\x1b[0m`)
            } else if (line.startsWith("-")) {
              // 删除行：红色文字 + 淡红背景
              console.log(`\x1b[31;48;5;52m${line}\x1b[0m`)
            } else if (line.startsWith("@@")) {
              // 位置信息：青色
              console.log(`\x1b[36m${line}\x1b[0m`)
            } else {
              // 上下文：灰色
              console.log(`\x1b[90m${line}\x1b[0m`)
            }
          }
        } else {
          // 简短显示结果
          const firstLine = output.split("\n")[0]
          console.log(`\x1b[32m✓\x1b[0m \x1b[90m${firstLine}\x1b[0m`)
        }
      }

      // 工具执行完后，开始等待下一轮 LLM 响应
      spinner.start("思考中")
    },
    onError: (error) => {
      // 刷新 Markdown 缓冲区
      const remaining = mdRenderer.flush()
      if (remaining) {
        process.stdout.write(remaining)
      }

      spinner.stop()
      console.error(`\x1b[31m✗ 错误:\x1b[0m ${error.message}`)
    },
    onDone: (usage) => {
      // 刷新 Markdown 缓冲区
      const remaining = mdRenderer.flush()
      if (remaining) {
        process.stdout.write(remaining)
      }

      spinner.stop()
      const input = usage.inputTokens || 0
      const output = usage.outputTokens || 0
      if (input > 0 || output > 0) {
        console.log(`\n\x1b[90m[${input}+${output} tokens]\x1b[0m`)
      } else {
        console.log()
      }
    },
    onPermissionRequest: () => {
      // 刷新 Markdown 缓冲区
      const remaining = mdRenderer.flush()
      if (remaining) {
        process.stdout.write(remaining)
      }

      spinner.stop()
      // 权限请求会在 onConfirm 中处理
    },
  }
}

/**
 * 启动 REPL
 */
export async function startRepl(config: ReplConfig): Promise<void> {
  // Windows 控制台 UTF-8 支持
  if (process.platform === "win32") {
    try {
      // 尝试设置代码页为 UTF-8
      const { execSync } = await import("child_process")
      execSync("chcp 65001", { stdio: "ignore" })
    } catch {
      // 忽略错误
    }
  }

  // 启用 keypress 事件
  const { emitKeypressEvents } = await import("readline")
  emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[32m>\x1b[0m ",
  })

  // 默认手动模式（使用对象引用以支持动态修改）
  const autoConfirmRef = { value: false }

  // 可变状态
  let currentAgent = config.agent
  const taskState = new TaskState()

  // 处理权限确认的回调
  const handleConfirm = async (req: PermissionRequest): Promise<boolean> => {
    const result = await promptConfirmEnhanced(req, rl)

    switch (result) {
      case "allow":
        return true
      case "always":
        // 切换为自动模式（直接修改引用，立即生效）
        autoConfirmRef.value = true
        console.log(`\x1b[32m✓\x1b[0m 已切换为自动模式 \x1b[90m(Esc/Alt+P 切回手动)\x1b[0m`)
        return true
      case "skip":
        // 取消当前任务
        taskState.cancel()
        console.log(`\x1b[33m⚠️\x1b[0m 已跳过`)
        return false
      case "deny":
      default:
        return false
    }
  }

  // 创建 runner 的辅助函数
  const makeRunner = () => createRunner({
    agentType: currentAgent,
    cwd: config.cwd,
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    autoConfirmRef,
    onConfirm: handleConfirm,
  })

  printWelcome(config, autoConfirmRef.value)

  let runner = makeRunner()
  const spinner = new ThinkingSpinner()

  // 分隔线：区分 agent 信息和用户输入区域
  console.log(`\x1b[90m${"─".repeat(60)}\x1b[0m\n`)

  /**
   * 取消当前任务
   */
  const cancelTask = () => {
    if (taskState.cancel()) {
      spinner.stop()
      console.log("\n\x1b[33m⚠️  已取消\x1b[0m")
      rl.prompt()
    }
  }

  /**
   * 执行 AI 任务（非阻塞）
   */
  const runTask = (input: string, handlers: RunnerEventHandlers) => {
    const abortSignal = taskState.start()

    runner.run(input, handlers, { abort: abortSignal })
      .catch((error) => {
        if (!abortSignal.aborted) {
          spinner.stop()
          console.error("\x1b[31m执行失败:\x1b[0m", error instanceof Error ? error.message : error)
        }
      })
      .finally(() => {
        taskState.end()
        if (!abortSignal.aborted) {
          rl.prompt()
        }
      })
  }

  // 处理输入
  const processInput = (line: string): boolean => {
    const input = line.trim()

    if (!input) {
      if (!taskState.isRunning) {
        rl.prompt()
      }
      return true // 继续
    }

    // 处理命令（命令可以在任务执行中处理）
    if (input.startsWith("/")) {
      const [cmd, ...args] = input.slice(1).split(" ")

      switch (cmd.toLowerCase()) {
        case "exit":
        case "quit":
        case "q":
          if (taskState.isRunning) {
            taskState.cancel()
          }
          console.log("\n再见！🐱\n")
          return false // 退出

        case "cancel":
        case "stop":
        case "c":
          cancelTask()
          return true

        case "help":
        case "h":
        case "?":
          printHelp()
          if (!taskState.isRunning) rl.prompt()
          return true

        case "clear":
        case "cls":
          console.clear()
          printWelcome({ ...config, agent: currentAgent }, autoConfirmRef.value)
          if (!taskState.isRunning) rl.prompt()
          return true

        case "manual":
        case "m":
          if (!autoConfirmRef.value) {
            console.log(`\n已经是手动确认模式\n`)
          } else {
            autoConfirmRef.value = false
            console.log(`\n权限模式: \x1b[33m手动确认\x1b[0m (每次操作需确认)\n`)
          }
          if (!taskState.isRunning) rl.prompt()
          return true

        case "auto":
        case "yes":
        case "y":
          if (autoConfirmRef.value) {
            console.log(`\n已经是自动确认模式\n`)
          } else {
            autoConfirmRef.value = true
            console.log(`\n权限模式: \x1b[32m自动确认\x1b[0m (所有操作自动放行)\n`)
          }
          if (!taskState.isRunning) rl.prompt()
          return true

        case "agent":
          if (taskState.isRunning) {
            console.log("\n\x1b[33m⚠️  任务执行中，请先 /cancel\x1b[0m\n")
            return true
          }
          const newAgent = args[0] as "build" | "plan" | "explore"
          if (newAgent && ["build", "plan", "explore"].includes(newAgent)) {
            currentAgent = newAgent
            runner = makeRunner()
            console.log(`\n已切换到 \x1b[33m${currentAgent}\x1b[0m agent\n`)
          } else {
            console.log("\n用法: /agent <build|plan|explore>\n")
          }
          rl.prompt()
          return true

        case "run":
        case "execute":
          if (taskState.isRunning) {
            console.log("\n\x1b[33m⚠️  任务执行中，请先 /cancel\x1b[0m\n")
            return true
          }

          // 执行计划：读取 plan.md 并用 build agent 执行
          const planFile = args[0] || "plan.md"
          const planPath = require("path").resolve(config.cwd, planFile)

          try {
            const fs = require("fs")
            if (!fs.existsSync(planPath)) {
              console.log(`\n\x1b[31m✗\x1b[0m 计划文件不存在: ${planFile}`)
              console.log(`  先用 /agent plan 创建计划\n`)
              rl.prompt()
              return true
            }

            const planContent = fs.readFileSync(planPath, "utf-8")
            console.log(`\n\x1b[36m📋 执行计划:\x1b[0m ${planFile}\n`)

            // 切换到 build agent 执行
            currentAgent = "build"
            runner = makeRunner()

            // 发送执行指令（非阻塞）
            spinner.start("执行计划")
            const handlers = createOutputHandlers(spinner, getModelName())
            const executePrompt = `请按照以下计划执行，逐步完成每个步骤：\n\n${planContent}\n\n开始执行，每完成一步请报告进度。`
            runTask(executePrompt, handlers)
          } catch (error) {
            console.error(`\n\x1b[31m✗\x1b[0m 执行失败:`, error instanceof Error ? error.message : error)
            rl.prompt()
          }
          return true

        default:
          console.log(`\n未知命令: /${cmd}，输入 /help 查看帮助\n`)
          if (!taskState.isRunning) rl.prompt()
          return true
      }
    }

    // 执行对话
    if (taskState.isRunning) {
      console.log("\x1b[33m⚠️  任务执行中，请等待或 /cancel\x1b[0m")
      return true
    }

    // 显示用户输入
    printUserHeader()
    console.log(input)
    spinner.start("思考中")
    const handlers = createOutputHandlers(spinner, getModelName())
    runTask(input, handlers)

    return true // 继续
  }

  // 主循环
  rl.prompt()

  rl.on("line", (line) => {
    const shouldContinue = processInput(line)
    if (!shouldContinue) {
      rl.close()
    }
  })

  rl.on("close", () => {
    process.exit(0)
  })

  // Ctrl+C 处理：取消当前任务或退出
  rl.on("SIGINT", () => {
    if (taskState.isRunning) {
      cancelTask()
    } else {
      console.log("\n再见！🐱\n")
      rl.close()
    }
  })

  // 快捷键处理
  process.stdin.on("keypress", (_str, key) => {
    if (!key) return

    // Escape 或 Alt+P: 切换为手动模式
    if (key.name === "escape" || (key.meta && key.name === "p")) {
      if (autoConfirmRef.value) {
        autoConfirmRef.value = false
        console.log("\n\x1b[33m⚠️  已切换为手动模式\x1b[0m")
      }
    }
  })
}
