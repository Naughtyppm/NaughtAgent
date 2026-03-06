#!/usr/bin/env node
/**
 * NaughtyAgent CLI 入口
 *
 * 用法:
 *   naughtyagent "你的问题"
 *   naughtyagent daemon start|stop|status
 *   naughtyagent sessions list|delete
 *   naughtyagent --help
 *
 * 工作模式:
 *   - 如果 daemon 运行中，通过 WebSocket 连接 daemon
 *   - 如果 daemon 未运行，自动启动 daemon 或直接运行（--standalone）
 */

// Windows 终端 UTF-8 编码支持
// 在 Windows cmd/PowerShell 中，默认使用 GBK 编码（代码页 936）
// 需要设置为 UTF-8（代码页 65001）才能正确显示中文
import { execSync } from "child_process"
if (process.platform === "win32") {
  try {
    // 设置控制台输出代码页为 UTF-8
    execSync("chcp 65001", { stdio: "ignore" })
    // 设置 stdout/stderr 编码
    if (process.stdout.setDefaultEncoding) {
      process.stdout.setDefaultEncoding("utf8")
    }
    if (process.stderr.setDefaultEncoding) {
      process.stderr.setDefaultEncoding("utf8")
    }
  } catch {
    // 忽略错误，可能在非 Windows 终端环境中
  }
}

// 加载环境变量（在所有其他导入之前）
// 禁用 dotenv 的日志输出
process.env.DOTENV_CONFIG_QUIET = "true"

import { config } from "dotenv"
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

// 按优先级加载 .env 文件：
// 1. 用户主目录 ~/.naughtyagent/.env（推荐，全局配置）
// 2. 当前工作目录 .env（项目级配置）
const userEnvPath = join(homedir(), ".naughtyagent", ".env")
const cwdEnvPath = join(process.cwd(), ".env")

// 静默加载，不输出 dotenv 的日志信息
if (existsSync(userEnvPath)) {
  config({ path: userEnvPath, debug: false })
} else if (existsSync(cwdEnvPath)) {
  config({ path: cwdEnvPath, debug: false })
}

import { createRunner, type RunnerConfig, type RunnerEventHandlers } from "./runner"
import { startInkRepl } from "./repl-ink"
import {
  startDaemon,
  stopDaemon,
  restartDaemon,
  printStatus,
  getDefaultPort,
} from "./daemon"
import { createDaemonClient, type DaemonClientEvents } from "./client"
import { createDaemonSessionManager } from "../daemon"
import type { PermissionRequest } from "../permission"
import * as readline from "readline"

/**
 * CLI 参数
 */
interface CLIArgs {
  command: "chat" | "daemon" | "sessions" | "test"
  subCommand?: "start" | "stop" | "restart" | "status" | "list" | "delete" | "phase1"
  message: string
  agent: "build" | "plan" | "explore"
  model: string
  cwd: string
  port: number
  autoConfirm: boolean
  help: boolean
  version: boolean
  sessionId?: string
  standalone: boolean  // 独立模式，不使用 daemon
  debug: boolean       // 调试模式，显示详细日志
  thinking: boolean    // Extended Thinking 模式
  thinkingBudget: number  // Thinking 预算 token 数
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    command: "chat",
    message: "",
    agent: "build",
    model: "claude-opus-4-20250514",  // 默认模型
    cwd: process.cwd(),
    port: getDefaultPort(),
    autoConfirm: false,
    help: false,
    version: false,
    standalone: false,
    debug: false,
    thinking: false,
    thinkingBudget: 16000,
  }

  const messageArgs: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--help" || arg === "-h") {
      result.help = true
    } else if (arg === "--version" || arg === "-v") {
      result.version = true
    } else if (arg === "--agent" || arg === "-a") {
      const value = args[++i]
      if (value === "build" || value === "plan" || value === "explore") {
        result.agent = value
      }
    } else if (arg === "--model" || arg === "-m") {
      result.model = args[++i] || result.model
    } else if (arg === "--cwd" || arg === "-d") {
      result.cwd = args[++i] || process.cwd()
    } else if (arg === "--port" || arg === "-p") {
      result.port = parseInt(args[++i], 10) || getDefaultPort()
    } else if (arg === "--yes" || arg === "-y") {
      result.autoConfirm = true
    } else if (arg === "--standalone" || arg === "-s") {
      result.standalone = true
    } else if (arg === "--debug") {
      result.debug = true
    } else if (arg === "--thinking" || arg === "-t") {
      result.thinking = true
    } else if (arg === "--thinking-budget") {
      const budget = parseInt(args[++i], 10)
      if (budget >= 1024) {
        result.thinkingBudget = budget
      }
    } else if (arg === "daemon") {
      result.command = "daemon"
      const sub = args[++i]
      if (sub === "start" || sub === "stop" || sub === "restart" || sub === "status") {
        result.subCommand = sub
      } else if (sub) {
        // 如果不是子命令，回退
        i--
      }
    } else if (arg === "sessions") {
      result.command = "sessions"
      const sub = args[++i]
      if (sub === "list" || sub === "delete") {
        result.subCommand = sub
        // delete 需要 session ID
        if (sub === "delete") {
          result.sessionId = args[++i]
        }
      } else if (sub) {
        i--
      }
    } else if (arg === "test") {
      result.command = "test"
      const sub = args[++i]
      if (sub === "phase1") {
        result.subCommand = sub
      } else if (sub) {
        i--
      }
    } else if (!arg.startsWith("-")) {
      messageArgs.push(arg)
    }
  }

  result.message = messageArgs.join(" ")
  return result
}

/**
 * 打印小猫 Banner
 */
function printBanner(): void {
  const cat = `
    /\\_____/\\       ( )
   /  o   o  \\      | |
  ( ==  ^  == )     | |
   )         (      | |
  (           )____/ /
 ( (  )   (  ) )___/
(__(__)___(__)__)
`
  console.log(cat)
  console.log(`  NaughtyAgent v0.1.0`)
  console.log(`  AI 编程助手 🐱`)
  console.log(``)
}

/**
 * 打印帮助信息
 */
function printHelp(): void {
  printBanner()
  console.log(`
用法:
  naughtyagent                     交互式对话模式（REPL）
  naughtyagent [选项] <消息>        单次对话模式
  naughtyagent daemon <命令>       后台服务管理
  naughtyagent sessions <命令>     会话管理
  naughtyagent test <命令>         测试功能

对话选项:
  -h, --help       显示帮助信息
  -v, --version    显示版本号
  -a, --agent      Agent 类型 (build|plan|explore)，默认 build
  -m, --model      模型名称，默认 claude-sonnet-4-20250514
  -d, --cwd        工作目录，默认当前目录
  -y, --yes        自动确认所有操作
  -s, --standalone 独立模式，不使用 daemon（直接运行）
  -t, --thinking   启用 Extended Thinking（深度思考模式）
  --thinking-budget  Thinking 预算 token 数（默认 16000，最小 1024）
  --debug          调试模式，显示详细日志

可用模型:
  claude-opus-4-20250514    (默认) Claude Opus 4 (最强)
  claude-sonnet-4-20250514  Claude Sonnet 4
  claude-haiku-4-20250514   Claude Haiku 4 (最快)
  opus                      简写，等同于 claude-opus-4
  opus-4.5                  Claude Opus 4.5 (最强)
  sonnet                    简写，等同于 claude-sonnet-4
  sonnet-4.5                Claude Sonnet 4.5 (更强)
  haiku                     简写，等同于 claude-haiku-4
  haiku-4.5                 Claude Haiku 4.5 (更快)

Daemon 命令:
  daemon start    启动后台服务
  daemon stop     停止后台服务
  daemon restart  重启后台服务
  daemon status   查看服务状态

Sessions 命令:
  sessions list           列出所有会话
  sessions delete <id>    删除指定会话

Test 命令:
  test phase1             测试 Phase 1 基础设施层功能

Daemon 选项:
  -p, --port      服务端口，默认 31415

REPL 命令:
  /help           显示帮助
  /clear          清屏
  /agent <type>   切换 Agent
  /exit           退出

示例:
  naughtyagent                           进入交互模式
  naughtyagent "帮我创建一个 hello.ts"    单次对话
  naughtyagent --agent plan "分析架构"   使用 plan agent
  naughtyagent daemon start              启动后台服务

环境变量:
  ANTHROPIC_API_KEY   Claude API Key（直接调用 Anthropic）
  ANTHROPIC_BASE_URL  Anthropic API Base URL（可选）
  OPENAI_API_KEY      OpenAI 兼容 API Key（如 OpenRouter）
  OPENAI_BASE_URL     OpenAI API Base URL（默认 OpenRouter）
`)
}

/**
 * 打印版本号
 */
function printVersion(): void {
  printBanner()
}

/**
 * 用户确认提示
 */
async function promptConfirm(request: PermissionRequest): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    const description = request.description || `${request.type}: ${request.resource}`
    rl.question(`\n⚠️  需要确认: ${description}\n   允许执行? (y/n) `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes")
    })
  })
}

/**
 * 格式化输出
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
      console.log(`\n🔧 [${name}] ${inputStr}...`)
    },
    onToolEnd: (_id, output, isError) => {
      if (isError) {
        console.log(`   ❌ 错误: ${output.substring(0, 200)}`)
      } else {
        const preview = output.length > 200 ? output.substring(0, 200) + "..." : output
        console.log(`   ✅ ${preview}`)
      }
    },
    onError: (error) => {
      console.error(`\n❌ 错误: ${error.message}`)
    },
    onDone: (usage) => {
      console.log(`\n\n📊 Token: ${usage.inputTokens} 输入 / ${usage.outputTokens} 输出`)
    },
    onPermissionRequest: (_request) => {
      // 权限请求会在 onConfirm 中处理
    },
  }
}

/**
 * 处理 daemon 命令
 */
async function handleDaemon(args: CLIArgs): Promise<void> {
  switch (args.subCommand) {
    case "start":
      await startDaemon({ port: args.port })
      break
    case "stop":
      stopDaemon()
      break
    case "restart":
      await restartDaemon({ port: args.port })
      break
    case "status":
    default:
      await printStatus()
      break
  }
}

/**
 * 处理 test 命令
 */
async function handleTest(args: CLIArgs): Promise<void> {
  switch (args.subCommand) {
    case "phase1": {
      console.log('='.repeat(80))
      console.log('Phase 1 功能测试')
      console.log('='.repeat(80))
      console.log('')
      console.log('💡 请直接运行测试文件:')
      console.log('')
      console.log('  方式 1 (推荐): bun run packages/agent/examples/test-phase1-features.ts')
      console.log('  方式 2: npx tsx packages/agent/examples/test-phase1-features.ts')
      console.log('  方式 3: node --loader tsx packages/agent/examples/test-phase1-features.ts')
      console.log('')
      console.log('或者使用项目根目录的快捷脚本:')
      console.log('  Windows: test-phase1.bat')
      console.log('  Linux/Mac: ./test-phase1.sh')
      break
    }

    default:
      console.log('可用的测试命令:')
      console.log('  test phase1    查看 Phase 1 基础设施层功能测试说明')
      break
  }
}

/**
 * 处理 sessions 命令
 */
async function handleSessions(args: CLIArgs): Promise<void> {
  const manager = createDaemonSessionManager()
  await manager.initialize()

  switch (args.subCommand) {
    case "list": {
      const sessions = await manager.listSessions(args.cwd !== process.cwd() ? args.cwd : undefined)

      if (sessions.length === 0) {
        console.log("\n没有找到会话\n")
        return
      }

      console.log(`\n会话列表 (${sessions.length} 个):\n`)
      console.log("  ID                          CWD                                    Agent    消息数  更新时间")
      console.log("  " + "-".repeat(100))

      for (const session of sessions) {
        const cwdShort = session.cwd.length > 40 ? "..." + session.cwd.slice(-37) : session.cwd.padEnd(40)
        const updatedAt = new Date(session.updatedAt).toLocaleString()
        console.log(
          `  ${session.id.padEnd(28)} ${cwdShort} ${session.agentType.padEnd(8)} ${String(session.messageCount).padEnd(7)} ${updatedAt}`
        )
      }
      console.log("")
      break
    }

    case "delete": {
      if (!args.sessionId) {
        console.error("错误: 请指定要删除的会话 ID")
        console.log("用法: naughtyagent sessions delete <session-id>")
        return
      }

      const deleted = await manager.deleteSession(args.sessionId)
      if (deleted) {
        console.log(`✓ 会话已删除: ${args.sessionId}`)
      } else {
        console.error(`✗ 会话不存在: ${args.sessionId}`)
      }
      break
    }

    default:
      // 默认列出会话
      await handleSessions({ ...args, subCommand: "list" })
      break
  }
}

/**
 * 处理对话命令
 */
async function handleChat(args: CLIArgs): Promise<void> {
  if (!args.message) {
    // 没有消息，进入交互式 REPL 模式（使用 Ink UI）
    await startInkRepl({
      cwd: args.cwd,
      agent: args.agent,
      model: args.model,
      autoConfirm: args.autoConfirm,
      thinking: args.thinking ? {
        enabled: true,
        budgetTokens: args.thinkingBudget,
      } : undefined,
    })
    return
  }

  // 独立模式：直接运行，不使用 daemon
  if (args.standalone) {
    await handleChatStandalone(args)
    return
  }

  // Daemon 模式：通过 daemon 运行
  await handleChatDaemon(args)
}

/**
 * 通过 Daemon 处理对话
 */
async function handleChatDaemon(args: CLIArgs): Promise<void> {
  console.log(``)
  console.log(`🤖 NaughtyAgent (${args.agent}) [daemon]`)
  console.log(`📁 ${args.cwd}`)
  console.log(``)

  const client = createDaemonClient({
    cwd: args.cwd,
    agentType: args.agent,
    autoConfirm: args.autoConfirm,
    onConfirm: promptConfirm,
  })

  const events: DaemonClientEvents = {
    onText: (content) => {
      process.stdout.write(content)
    },
    onToolStart: (_id, name, input) => {
      const inputStr = typeof input === "object"
        ? JSON.stringify(input, null, 2).substring(0, 100)
        : String(input)
      console.log(`\n🔧 [${name}] ${inputStr}...`)
    },
    onToolEnd: (_id, output, isError) => {
      if (isError) {
        console.log(`   ❌ 错误: ${output.substring(0, 200)}`)
      } else {
        const preview = output.length > 200 ? output.substring(0, 200) + "..." : output
        console.log(`   ✅ ${preview}`)
      }
    },
    onError: (error) => {
      console.error(`\n❌ 错误: ${error.message}`)
    },
    onDone: (usage) => {
      console.log(`\n\n📊 Token: ${usage.inputTokens} 输入 / ${usage.outputTokens} 输出`)
    },
    onPermissionRequest: (_request) => {
      // 权限请求会在 onConfirm 中处理
    },
  }

  try {
    await client.send(args.message, events)
  } catch (error) {
    // 如果连接失败，回退到独立模式
    if (error instanceof Error && error.message.includes("无法启动")) {
      console.log("\n⚠️  Daemon 连接失败，切换到独立模式...\n")
      await handleChatStandalone(args)
      return
    }
    console.error("执行失败:", error)
    process.exit(1)
  } finally {
    client.close()
  }
}

/**
 * 独立模式处理对话（不使用 daemon）
 */
async function handleChatStandalone(args: CLIArgs): Promise<void> {
  console.log(``)
  console.log(`🤖 NaughtyAgent (${args.agent}) [standalone]`)
  console.log(`📁 ${args.cwd}`)
  console.log(``)

  // 创建 Runner
  const config: RunnerConfig = {
    agentType: args.agent,
    cwd: args.cwd,
    model: args.model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    autoConfirm: args.autoConfirm,
    onConfirm: promptConfirm,
  }

  let runner
  try {
    runner = createRunner(config)
  } catch (error) {
    console.error("错误:", error instanceof Error ? error.message : error)
    process.exit(1)
  }

  const handlers = createOutputHandlers()

  try {
    await runner.run(args.message, handlers)
  } catch (error) {
    console.error("执行失败:", error)
    process.exit(1)
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // 调试模式：设置环境变量以启用详细日志
  if (args.debug) {
    process.env.DEBUG = "1"
  }

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  if (args.version) {
    printVersion()
    process.exit(0)
  }

  if (args.command === "daemon") {
    await handleDaemon(args)
  } else if (args.command === "sessions") {
    await handleSessions(args)
  } else if (args.command === "test") {
    await handleTest(args)
  } else {
    await handleChat(args)
  }
}

// 导出供测试使用
export { parseArgs, createOutputHandlers }

// 直接执行主函数（简化入口逻辑）
main().catch((error) => {
  console.error("未捕获的错误:", error)
  process.exit(1)
})
