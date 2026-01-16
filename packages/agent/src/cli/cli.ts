#!/usr/bin/env node
/**
 * NaughtAgent CLI 入口
 *
 * 用法:
 *   naughtagent "你的问题"
 *   naughtagent daemon start|stop|status
 *   naughtagent sessions list|delete
 *   naughtagent --help
 *
 * 工作模式:
 *   - 如果 daemon 运行中，通过 WebSocket 连接 daemon
 *   - 如果 daemon 未运行，自动启动 daemon 或直接运行（--standalone）
 */

import { createRunner, type RunnerConfig, type RunnerEventHandlers } from "./runner"
import { startRepl } from "./repl"
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
  command: "chat" | "daemon" | "sessions"
  subCommand?: "start" | "stop" | "restart" | "status" | "list" | "delete"
  message: string
  agent: "build" | "plan" | "explore"
  cwd: string
  port: number
  autoConfirm: boolean
  help: boolean
  version: boolean
  sessionId?: string
  standalone: boolean  // 独立模式，不使用 daemon
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    command: "chat",
    message: "",
    agent: "build",
    cwd: process.cwd(),
    port: getDefaultPort(),
    autoConfirm: false,
    help: false,
    version: false,
    standalone: false,
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
    } else if (arg === "--cwd" || arg === "-d") {
      result.cwd = args[++i] || process.cwd()
    } else if (arg === "--port" || arg === "-p") {
      result.port = parseInt(args[++i], 10) || getDefaultPort()
    } else if (arg === "--yes" || arg === "-y") {
      result.autoConfirm = true
    } else if (arg === "--standalone" || arg === "-s") {
      result.standalone = true
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
  console.log(`  NaughtAgent v0.1.0`)
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
  naughtagent                     交互式对话模式（REPL）
  naughtagent [选项] <消息>        单次对话模式
  naughtagent daemon <命令>       后台服务管理
  naughtagent sessions <命令>     会话管理

对话选项:
  -h, --help       显示帮助信息
  -v, --version    显示版本号
  -a, --agent      Agent 类型 (build|plan|explore)，默认 build
  -d, --cwd        工作目录，默认当前目录
  -y, --yes        自动确认所有操作
  -s, --standalone 独立模式，不使用 daemon（直接运行）

Daemon 命令:
  daemon start    启动后台服务
  daemon stop     停止后台服务
  daemon restart  重启后台服务
  daemon status   查看服务状态

Sessions 命令:
  sessions list           列出所有会话
  sessions delete <id>    删除指定会话

Daemon 选项:
  -p, --port      服务端口，默认 31415

REPL 命令:
  /help           显示帮助
  /clear          清屏
  /agent <type>   切换 Agent
  /exit           退出

示例:
  naughtagent                           进入交互模式
  naughtagent "帮我创建一个 hello.ts"    单次对话
  naughtagent --agent plan "分析架构"   使用 plan agent
  naughtagent daemon start              启动后台服务

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
        console.log("用法: naughtagent sessions delete <session-id>")
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
    // 没有消息，进入交互式 REPL 模式
    await startRepl({
      cwd: args.cwd,
      agent: args.agent,
      autoConfirm: args.autoConfirm,
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
  console.log(`🤖 NaughtAgent (${args.agent}) [daemon]`)
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
  console.log(`🤖 NaughtAgent (${args.agent}) [standalone]`)
  console.log(`📁 ${args.cwd}`)
  console.log(``)

  // 创建 Runner
  const config: RunnerConfig = {
    agentType: args.agent,
    cwd: args.cwd,
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
  } else {
    await handleChat(args)
  }
}

// 导出供测试使用
export { parseArgs, createOutputHandlers }

// ESM 模块直接运行主函数
main().catch((error) => {
  console.error("未捕获的错误:", error)
  process.exit(1)
})
