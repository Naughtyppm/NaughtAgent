#!/usr/bin/env node
/**
 * NaughtAgent CLI 入口
 *
 * 用法:
 *   naughtagent "你的问题"
 *   naughtagent --agent plan "分析这个项目"
 *   naughtagent --help
 */

import { createRunner, type RunnerConfig, type RunnerEventHandlers } from "./runner"
import type { PermissionRequest } from "../permission"
import * as readline from "readline"

/**
 * CLI 参数
 */
interface CLIArgs {
  message: string
  agent: "build" | "plan" | "explore"
  cwd: string
  autoConfirm: boolean
  help: boolean
  version: boolean
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    message: "",
    agent: "build",
    cwd: process.cwd(),
    autoConfirm: false,
    help: false,
    version: false,
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
    } else if (arg === "--yes" || arg === "-y") {
      result.autoConfirm = true
    } else if (!arg.startsWith("-")) {
      messageArgs.push(arg)
    }
  }

  result.message = messageArgs.join(" ")
  return result
}

/**
 * 打印帮助信息
 */
function printHelp(): void {
  console.log(`
NaughtAgent - AI 编程助手

用法:
  naughtagent [选项] <消息>

选项:
  -h, --help      显示帮助信息
  -v, --version   显示版本号
  -a, --agent     Agent 类型 (build|plan|explore)，默认 build
  -d, --cwd       工作目录，默认当前目录
  -y, --yes       自动确认所有操作

示例:
  naughtagent "帮我创建一个 hello.ts 文件"
  naughtagent --agent plan "分析这个项目的架构"
  naughtagent -y "运行测试"

环境变量:
  ANTHROPIC_API_KEY  Claude API Key（必需）
  ANTHROPIC_BASE_URL API Base URL（可选）
`)
}

/**
 * 打印版本号
 */
function printVersion(): void {
  console.log("naughtagent v0.1.0")
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
      console.log("\n" + content)
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
      console.log(`\n📊 Token 使用: ${usage.inputTokens} 输入 + ${usage.outputTokens} 输出`)
    },
    onPermissionRequest: (_request) => {
      // 权限请求会在 onConfirm 中处理
    },
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

  if (!args.message) {
    console.error("错误: 请提供消息")
    console.error("使用 --help 查看帮助")
    process.exit(1)
  }

  // 检查 API Key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error("错误: 请设置 ANTHROPIC_API_KEY 环境变量")
    process.exit(1)
  }

  // 创建 Runner
  const config: RunnerConfig = {
    agentType: args.agent,
    cwd: args.cwd,
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    autoConfirm: args.autoConfirm,
    onConfirm: promptConfirm,
  }

  const runner = createRunner(config)
  const handlers = createOutputHandlers()

  console.log(`🤖 NaughtAgent (${args.agent})`)
  console.log(`📁 工作目录: ${args.cwd}`)
  console.log(`💬 ${args.message}`)

  try {
    await runner.run(args.message, handlers)
  } catch (error) {
    console.error("执行失败:", error)
    process.exit(1)
  }
}

// 导出供测试使用
export { parseArgs, createOutputHandlers }

// 只在直接运行时执行主函数
const isMainModule = typeof require !== 'undefined'
  ? require.main === module
  : import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`

if (isMainModule) {
  main().catch((error) => {
    console.error("未捕获的错误:", error)
    process.exit(1)
  })
}
