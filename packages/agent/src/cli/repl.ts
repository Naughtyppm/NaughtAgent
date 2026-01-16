/**
 * 交互式 REPL 模式
 *
 * 类似 Claude Code 的交互体验
 */

import * as readline from "readline"
import type { RunnerConfig, RunnerEventHandlers } from "./runner"
import { createRunner } from "./runner"
import type { PermissionRequest } from "../permission"

/**
 * REPL 配置
 */
export interface ReplConfig {
  cwd: string
  agent: "build" | "plan" | "explore"
  autoConfirm: boolean
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
 * 打印欢迎界面
 */
function printWelcome(config: ReplConfig): void {
  const cat = `
    /\\_____/\\
   /  o   o  \\
  ( ==  ^  == )
   )         (
  (           )____
 ( (  )   (  )    /
(__(__)___(__)___/
`
  console.log("\x1b[36m" + cat + "\x1b[0m")
  console.log("\x1b[1m  NaughtAgent v0.1.0\x1b[0m")
  console.log("  AI 编程助手")
  console.log("")
  console.log("\x1b[90m  ─────────────────────────────────\x1b[0m")
  console.log(`  \x1b[33m工作区\x1b[0m   ${config.cwd}`)
  console.log(`  \x1b[33mAgent\x1b[0m    ${config.agent}`)
  console.log(`  \x1b[33mProvider\x1b[0m ${getProviderInfo()}`)
  console.log("\x1b[90m  ─────────────────────────────────\x1b[0m")
  console.log("")
  console.log("  输入问题开始对话，/help 查看命令")
  console.log("")
}

/**
 * 打印帮助
 */
function printHelp(): void {
  console.log("")
  console.log("\x1b[1m命令：\x1b[0m")
  console.log("  /help      显示帮助")
  console.log("  /clear     清屏")
  console.log("  /agent     切换 Agent (build/plan/explore)")
  console.log("  /exit      退出")
  console.log("")
  console.log("\x1b[1m快捷键：\x1b[0m")
  console.log("  Ctrl+C     取消当前输入")
  console.log("  Ctrl+D     退出")
  console.log("")
}

/**
 * 用户确认提示
 */
async function promptConfirm(request: PermissionRequest, rl: readline.Interface): Promise<boolean> {
  return new Promise((resolve) => {
    const description = request.description || `${request.type}: ${request.resource}`
    rl.question(`\n\x1b[33m⚠️  需要确认:\x1b[0m ${description}\n   允许执行? (y/n) `, (answer) => {
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes")
    })
  })
}

/**
 * 创建输出处理器
 */
function createOutputHandlers(): RunnerEventHandlers {
  return {
    onText: (content) => {
      process.stdout.write(content)
    },
    onToolStart: (_id, name, input) => {
      const inputStr = typeof input === "object"
        ? JSON.stringify(input, null, 2).substring(0, 100)
        : String(input)
      console.log(`\n\x1b[36m🔧 [${name}]\x1b[0m ${inputStr}...`)
    },
    onToolEnd: (_id, output, isError) => {
      if (isError) {
        console.log(`   \x1b[31m❌ 错误:\x1b[0m ${output.substring(0, 200)}`)
      } else {
        const preview = output.length > 200 ? output.substring(0, 200) + "..." : output
        console.log(`   \x1b[32m✅\x1b[0m ${preview}`)
      }
    },
    onError: (error) => {
      console.error(`\n\x1b[31m❌ 错误:\x1b[0m ${error.message}`)
    },
    onDone: (usage) => {
      console.log(`\n\x1b[90m📊 Token: ${usage.inputTokens} 输入 / ${usage.outputTokens} 输出\x1b[0m\n`)
    },
    onPermissionRequest: () => {
      // 权限请求会在 onConfirm 中处理
    },
  }
}

/**
 * 启动 REPL
 */
export async function startRepl(config: ReplConfig): Promise<void> {
  printWelcome(config)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[32m>\x1b[0m ",
  })

  let currentAgent = config.agent
  let runner = createRunner({
    agentType: currentAgent,
    cwd: config.cwd,
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    autoConfirm: config.autoConfirm,
    onConfirm: (req) => promptConfirm(req, rl),
  })

  const handlers = createOutputHandlers()

  // 处理输入
  const processInput = async (line: string): Promise<boolean> => {
    const input = line.trim()

    if (!input) {
      return true // 继续
    }

    // 处理命令
    if (input.startsWith("/")) {
      const [cmd, ...args] = input.slice(1).split(" ")

      switch (cmd.toLowerCase()) {
        case "exit":
        case "quit":
        case "q":
          console.log("\n再见！🐱\n")
          return false // 退出

        case "help":
        case "h":
        case "?":
          printHelp()
          return true

        case "clear":
        case "cls":
          console.clear()
          printWelcome({ ...config, agent: currentAgent })
          return true

        case "agent":
          const newAgent = args[0] as "build" | "plan" | "explore"
          if (newAgent && ["build", "plan", "explore"].includes(newAgent)) {
            currentAgent = newAgent
            runner = createRunner({
              agentType: currentAgent,
              cwd: config.cwd,
              apiKey: process.env.ANTHROPIC_API_KEY,
              baseURL: process.env.ANTHROPIC_BASE_URL,
              autoConfirm: config.autoConfirm,
              onConfirm: (req) => promptConfirm(req, rl),
            })
            console.log(`\n已切换到 \x1b[33m${currentAgent}\x1b[0m agent\n`)
          } else {
            console.log("\n用法: /agent <build|plan|explore>\n")
          }
          return true

        default:
          console.log(`\n未知命令: /${cmd}，输入 /help 查看帮助\n`)
          return true
      }
    }

    // 执行对话
    try {
      console.log("")
      await runner.run(input, handlers)
    } catch (error) {
      console.error("\x1b[31m执行失败:\x1b[0m", error instanceof Error ? error.message : error)
    }

    return true // 继续
  }

  // 主循环
  rl.prompt()

  rl.on("line", async (line) => {
    const shouldContinue = await processInput(line)
    if (shouldContinue) {
      rl.prompt()
    } else {
      rl.close()
    }
  })

  rl.on("close", () => {
    process.exit(0)
  })

  // Ctrl+C 处理
  rl.on("SIGINT", () => {
    console.log("\n")
    rl.prompt()
  })
}
