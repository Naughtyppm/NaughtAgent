#!/usr/bin/env npx tsx
/**
 * NaughtAgent 分层测试脚本
 *
 * 从底层到顶层逐步测试，快速定位问题
 *
 * 用法:
 *   npx tsx packages/agent/scripts/test-agent-layers.ts [layer]
 *
 * 可选 layer:
 *   1 - Provider 层（API 调用）
 *   2 - Tool 层（工具注册和执行）
 *   3 - Loop 层（Agent Loop）
 *   4 - Runner 层（完整 Runner）
 *   5 - CLI 层（命令行接口）
 *   all - 全部测试（默认）
 */

import { config } from "dotenv"
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

// 加载环境变量
const userEnvPath = join(homedir(), ".naughtyagent", ".env")
const cwdEnvPath = join(process.cwd(), ".env")
if (existsSync(userEnvPath)) {
  config({ path: userEnvPath })
} else if (existsSync(cwdEnvPath)) {
  config({ path: cwdEnvPath })
}

// ============================================================================
// 测试工具函数
// ============================================================================

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
}

function log(msg: string, color = COLORS.reset) {
  console.log(`${color}${msg}${COLORS.reset}`)
}

function header(title: string) {
  console.log("")
  log("=".repeat(70), COLORS.cyan)
  log(`  ${title}`, COLORS.bright + COLORS.cyan)
  log("=".repeat(70), COLORS.cyan)
  console.log("")
}

function subHeader(title: string) {
  console.log("")
  log(`--- ${title} ---`, COLORS.yellow)
}

function success(msg: string) {
  log(`✅ ${msg}`, COLORS.green)
}

function fail(msg: string) {
  log(`❌ ${msg}`, COLORS.red)
}

function info(msg: string) {
  log(`ℹ️  ${msg}`, COLORS.blue)
}

function warn(msg: string) {
  log(`⚠️  ${msg}`, COLORS.yellow)
}

async function runTest(name: string, fn: () => Promise<boolean>): Promise<boolean> {
  process.stdout.write(`  Testing: ${name}... `)
  const start = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - start
    if (result) {
      console.log(`${COLORS.green}PASS${COLORS.reset} (${duration}ms)`)
      return true
    } else {
      console.log(`${COLORS.red}FAIL${COLORS.reset} (${duration}ms)`)
      return false
    }
  } catch (error) {
    const duration = Date.now() - start
    console.log(`${COLORS.red}ERROR${COLORS.reset} (${duration}ms)`)
    console.log(`    ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

// ============================================================================
// Layer 1: Provider 层测试
// ============================================================================

async function testLayer1(): Promise<boolean> {
  header("Layer 1: Provider 层测试")

  const { createAnthropicProvider } = await import("../src/provider/anthropic")
  const { z } = await import("zod")

  let allPassed = true

  // 检查环境变量
  subHeader("环境检查")
  const apiKey = process.env.ANTHROPIC_API_KEY
  const baseURL = process.env.ANTHROPIC_BASE_URL

  if (!apiKey) {
    fail("ANTHROPIC_API_KEY 未设置")
    return false
  }
  success(`API Key: ${apiKey.substring(0, 10)}...`)
  info(`Base URL: ${baseURL || "(默认)"}`)

  // 创建 Provider
  subHeader("创建 Provider")
  const provider = createAnthropicProvider({
    apiKey,
    baseURL,
  })
  success("Provider 创建成功")

  // 测试 1: 简单对话（无工具）
  subHeader("测试 1: 简单对话（无工具）")
  allPassed = await runTest("简单对话", async () => {
    const result = await provider.chat({
      model: { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 100 },
      messages: [{ role: "user", content: "Say 'hello' and nothing else." }],
    })
    return result.text.toLowerCase().includes("hello")
  }) && allPassed

  // 测试 2: 带工具的对话
  subHeader("测试 2: 带工具的对话")
  allPassed = await runTest("带工具对话", async () => {
    const result = await provider.chat({
      model: { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 500 },
      messages: [{ role: "user", content: "What is 2 + 2? Use the calculator tool." }],
      tools: [{
        name: "calculator",
        description: "A simple calculator",
        parameters: z.object({
          expression: z.string().describe("Math expression to evaluate"),
        }),
      }],
    })
    // 应该有工具调用
    return result.toolCalls.length > 0 && result.toolCalls[0].name === "calculator"
  }) && allPassed

  // 测试 3: 流式调用
  subHeader("测试 3: 流式调用")
  allPassed = await runTest("流式调用", async () => {
    let hasText = false
    let hasEnd = false

    for await (const event of provider.stream({
      model: { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 100 },
      messages: [{ role: "user", content: "Say 'hi'" }],
    })) {
      if (event.type === "text") hasText = true
      if (event.type === "message_end") hasEnd = true
    }

    return hasText && hasEnd
  }) && allPassed

  // 测试 4: 多工具
  subHeader("测试 4: 多工具注册")
  allPassed = await runTest("多工具注册", async () => {
    const result = await provider.chat({
      model: { provider: "anthropic", model: "claude-sonnet-4-20250514", maxTokens: 500 },
      messages: [{ role: "user", content: "Read the file test.txt" }],
      tools: [
        {
          name: "read",
          description: "Read a file",
          parameters: z.object({ file_path: z.string() }),
        },
        {
          name: "write",
          description: "Write a file",
          parameters: z.object({ file_path: z.string(), content: z.string() }),
        },
        {
          name: "bash",
          description: "Run a bash command",
          parameters: z.object({ command: z.string() }),
        },
      ],
    })
    return result.toolCalls.length > 0 && result.toolCalls[0].name === "read"
  }) && allPassed

  return allPassed
}

// ============================================================================
// Layer 2: Tool 层测试
// ============================================================================

async function testLayer2(): Promise<boolean> {
  header("Layer 2: Tool 层测试")

  const { ToolRegistry } = await import("../src/tool/registry")
  const { ReadTool } = await import("../src/tool/read")
  const { GlobTool } = await import("../src/tool/glob")
  const { GrepTool } = await import("../src/tool/grep")

  let allPassed = true

  // 清空并注册工具
  subHeader("工具注册")
  ToolRegistry.clear()
  ToolRegistry.register(ReadTool)
  ToolRegistry.register(GlobTool)
  ToolRegistry.register(GrepTool)

  const tools = ToolRegistry.list()
  success(`已注册 ${tools.length} 个工具: ${tools.map(t => t.id).join(", ")}`)

  // 测试 1: 工具获取
  subHeader("测试 1: 工具获取")
  allPassed = await runTest("获取 read 工具", async () => {
    const tool = ToolRegistry.get("read")
    return tool !== undefined && tool.id === "read"
  }) && allPassed

  // 测试 2: 工具执行 - Read
  subHeader("测试 2: 工具执行 - Read")
  allPassed = await runTest("读取 package.json", async () => {
    const ctx = { sessionID: "test", cwd: process.cwd(), abort: new AbortController().signal }
    const result = await ToolRegistry.execute("read", { filePath: "package.json" }, ctx)
    return result.output.includes("naughtyagent")
  }) && allPassed

  // 测试 3: 工具执行 - Glob
  subHeader("测试 3: 工具执行 - Glob")
  allPassed = await runTest("搜索 *.ts 文件", async () => {
    const ctx = { sessionID: "test", cwd: process.cwd(), abort: new AbortController().signal }
    const result = await ToolRegistry.execute("glob", { pattern: "src/**/*.ts" }, ctx)
    return result.output.includes(".ts")
  }) && allPassed

  // 测试 4: 工具执行 - Grep
  subHeader("测试 4: 工具执行 - Grep")
  allPassed = await runTest("搜索 'createAgentLoop'", async () => {
    const ctx = { sessionID: "test", cwd: process.cwd(), abort: new AbortController().signal }
    const result = await ToolRegistry.execute("grep", { pattern: "createAgentLoop", path: "src" }, ctx)
    return result.output.includes("loop.ts") || result.output.includes("createAgentLoop")
  }) && allPassed

  // 测试 5: Schema 转换
  subHeader("测试 5: Schema 转换")
  const { zodToJsonSchema } = await import("zod-to-json-schema")
  const { z } = await import("zod")

  allPassed = await runTest("Zod → JSON Schema", async () => {
    const schema = z.object({
      file_path: z.string().describe("File path"),
      content: z.string().optional(),
    })
    const jsonSchema = zodToJsonSchema(schema, { $refStrategy: "none" })
    return jsonSchema.type === "object" && "properties" in jsonSchema
  }) && allPassed

  return allPassed
}

// ============================================================================
// Layer 3: Agent Loop 层测试
// ============================================================================

async function testLayer3(): Promise<boolean> {
  header("Layer 3: Agent Loop 层测试")

  const { createAgentLoop, getAgentDefinition } = await import("../src/agent")
  const { createSession } = await import("../src/session")
  const { createAnthropicProvider } = await import("../src/provider/anthropic")
  const { ToolRegistry } = await import("../src/tool/registry")
  const { ReadTool } = await import("../src/tool/read")
  const { GlobTool } = await import("../src/tool/glob")
  const { GrepTool } = await import("../src/tool/grep")

  let allPassed = true

  // 准备环境
  const apiKey = process.env.ANTHROPIC_API_KEY
  const baseURL = process.env.ANTHROPIC_BASE_URL

  if (!apiKey) {
    fail("ANTHROPIC_API_KEY 未设置")
    return false
  }

  // 注册工具
  ToolRegistry.clear()
  ToolRegistry.register(ReadTool)
  ToolRegistry.register(GlobTool)
  ToolRegistry.register(GrepTool)

  const provider = createAnthropicProvider({ apiKey, baseURL })

  // 测试 1: 创建 Agent Loop
  subHeader("测试 1: 创建 Agent Loop")
  allPassed = await runTest("创建 explore Agent Loop", async () => {
    const definition = getAgentDefinition("explore")
    const session = createSession({ cwd: process.cwd(), agentType: "explore" })
    const loop = createAgentLoop({
      definition,
      session,
      provider,
      runConfig: { sessionId: session.id, cwd: process.cwd() },
    })
    return loop !== undefined && typeof loop.run === "function"
  }) && allPassed

  // 测试 2: 简单对话（无工具调用）
  subHeader("测试 2: 简单对话（无工具调用）")
  allPassed = await runTest("简单对话", async () => {
    const definition = { ...getAgentDefinition("explore"), tools: [] } // 无工具
    const session = createSession({ cwd: process.cwd(), agentType: "explore" })
    const loop = createAgentLoop({
      definition,
      session,
      provider,
      runConfig: { sessionId: session.id, cwd: process.cwd() },
    })

    let hasText = false
    let hasDone = false

    for await (const event of loop.run("Say 'test passed' and nothing else.")) {
      if (event.type === "text" && event.content.toLowerCase().includes("test")) hasText = true
      if (event.type === "done") hasDone = true
    }

    return hasText && hasDone
  }) && allPassed

  // 测试 3: 带工具调用的对话
  subHeader("测试 3: 带工具调用的对话")
  info("这是关键测试 - 如果卡住，问题在 Agent Loop 层")

  allPassed = await runTest("带工具调用", async () => {
    const definition = getAgentDefinition("explore")
    const session = createSession({ cwd: process.cwd(), agentType: "explore" })
    const loop = createAgentLoop({
      definition,
      session,
      provider,
      runConfig: { sessionId: session.id, cwd: process.cwd() },
    })

    let hasToolStart = false
    let hasToolEnd = false
    let hasDone = false

    // 设置超时
    const timeout = new Promise<boolean>((_, reject) => {
      setTimeout(() => reject(new Error("超时 (30s)")), 30000)
    })

    const test = async () => {
      for await (const event of loop.run("Use the glob tool to find all *.json files in the current directory. Just list them.")) {
        console.log(`    [Event] ${event.type}`)
        if (event.type === "tool_start") hasToolStart = true
        if (event.type === "tool_end") hasToolEnd = true
        if (event.type === "done") hasDone = true
        if (event.type === "error") {
          console.log(`    [Error] ${event.error.message}`)
        }
      }
      return hasToolStart && hasToolEnd && hasDone
    }

    return await Promise.race([test(), timeout])
  }) && allPassed

  return allPassed
}

// ============================================================================
// Layer 4: Runner 层测试
// ============================================================================

async function testLayer4(): Promise<boolean> {
  header("Layer 4: Runner 层测试")

  const { createRunner } = await import("../src/cli/runner")

  let allPassed = true

  const apiKey = process.env.ANTHROPIC_API_KEY
  const baseURL = process.env.ANTHROPIC_BASE_URL

  if (!apiKey) {
    fail("ANTHROPIC_API_KEY 未设置")
    return false
  }

  // 测试 1: 创建 Runner
  subHeader("测试 1: 创建 Runner")
  allPassed = await runTest("创建 explore Runner", async () => {
    const runner = createRunner({
      agentType: "explore",
      cwd: process.cwd(),
      apiKey,
      baseURL,
      autoConfirm: true,
    })
    return runner !== undefined && typeof runner.run === "function"
  }) && allPassed

  // 测试 2: 简单对话
  subHeader("测试 2: Runner 简单对话")
  allPassed = await runTest("简单对话", async () => {
    const runner = createRunner({
      agentType: "explore",
      cwd: process.cwd(),
      apiKey,
      baseURL,
      autoConfirm: true,
    })

    let hasText = false
    let hasDone = false

    await runner.run("Say 'runner test passed'", {
      onText: (content) => {
        if (content.toLowerCase().includes("runner") || content.toLowerCase().includes("test")) {
          hasText = true
        }
      },
      onDone: () => { hasDone = true },
    })

    return hasText && hasDone
  }) && allPassed

  // 测试 3: 带工具调用
  subHeader("测试 3: Runner 带工具调用")
  info("这是关键测试 - 如果卡住，问题在 Runner 层")

  allPassed = await runTest("带工具调用", async () => {
    const runner = createRunner({
      agentType: "explore",
      cwd: process.cwd(),
      apiKey,
      baseURL,
      autoConfirm: true,
    })

    let hasToolStart = false
    let hasToolEnd = false
    let hasDone = false

    const timeout = new Promise<boolean>((_, reject) => {
      setTimeout(() => reject(new Error("超时 (30s)")), 30000)
    })

    const test = async () => {
      await runner.run("Use glob to find package.json files", {
        onToolStart: (id, name) => {
          console.log(`    [ToolStart] ${name}`)
          hasToolStart = true
        },
        onToolEnd: (id, output) => {
          console.log(`    [ToolEnd] ${output.substring(0, 50)}...`)
          hasToolEnd = true
        },
        onDone: () => { hasDone = true },
        onError: (err) => { console.log(`    [Error] ${err.message}`) },
      })
      return hasToolStart && hasToolEnd && hasDone
    }

    return await Promise.race([test(), timeout])
  }) && allPassed

  return allPassed
}

// ============================================================================
// Layer 5: CLI 层测试
// ============================================================================

async function testLayer5(): Promise<boolean> {
  header("Layer 5: CLI 层测试")

  const { spawn } = await import("child_process")

  let allPassed = true

  // 测试 1: CLI 帮助
  subHeader("测试 1: CLI 帮助")
  allPassed = await runTest("--help", async () => {
    return new Promise((resolve) => {
      const child = spawn("npx", ["tsx", "src/cli/cli.ts", "--help"], {
        cwd: process.cwd(),
        shell: true,
      })

      let output = ""
      child.stdout.on("data", (data) => { output += data.toString() })
      child.stderr.on("data", (data) => { output += data.toString() })

      child.on("close", (code) => {
        resolve(code === 0 && output.includes("NaughtyAgent"))
      })

      setTimeout(() => {
        child.kill()
        resolve(false)
      }, 10000)
    })
  }) && allPassed

  // 测试 2: CLI standalone 模式
  subHeader("测试 2: CLI standalone 模式")
  info("这是最终测试 - 如果卡住，问题在 CLI 层")

  allPassed = await runTest("standalone 简单对话", async () => {
    return new Promise((resolve) => {
      const child = spawn(
        "npx",
        ["tsx", "src/cli/cli.ts", "--standalone", "--yes", "Say only: CLI TEST OK"],
        {
          cwd: process.cwd(),
          shell: true,
          env: { ...process.env },
        }
      )

      let output = ""
      child.stdout.on("data", (data) => {
        const text = data.toString()
        output += text
        process.stdout.write(`    ${text}`)
      })
      child.stderr.on("data", (data) => {
        output += data.toString()
      })

      child.on("close", (code) => {
        resolve(output.toLowerCase().includes("cli") || output.toLowerCase().includes("test") || output.toLowerCase().includes("ok"))
      })

      setTimeout(() => {
        child.kill()
        resolve(false)
      }, 60000)
    })
  }) && allPassed

  return allPassed
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const layer = args[0] || "all"

  console.log("")
  log("╔══════════════════════════════════════════════════════════════════════╗", COLORS.bright)
  log("║           NaughtAgent 分层测试                                       ║", COLORS.bright)
  log("╚══════════════════════════════════════════════════════════════════════╝", COLORS.bright)
  console.log("")

  info(`测试层级: ${layer}`)
  info(`工作目录: ${process.cwd()}`)

  const results: { layer: string; passed: boolean }[] = []

  try {
    if (layer === "1" || layer === "all") {
      results.push({ layer: "Layer 1 (Provider)", passed: await testLayer1() })
    }

    if (layer === "2" || layer === "all") {
      results.push({ layer: "Layer 2 (Tool)", passed: await testLayer2() })
    }

    if (layer === "3" || layer === "all") {
      results.push({ layer: "Layer 3 (Loop)", passed: await testLayer3() })
    }

    if (layer === "4" || layer === "all") {
      results.push({ layer: "Layer 4 (Runner)", passed: await testLayer4() })
    }

    if (layer === "5" || layer === "all") {
      results.push({ layer: "Layer 5 (CLI)", passed: await testLayer5() })
    }
  } catch (error) {
    fail(`测试异常: ${error instanceof Error ? error.message : String(error)}`)
  }

  // 汇总结果
  header("测试结果汇总")

  let allPassed = true
  for (const r of results) {
    if (r.passed) {
      success(`${r.layer}: PASSED`)
    } else {
      fail(`${r.layer}: FAILED`)
      allPassed = false
    }
  }

  console.log("")
  if (allPassed) {
    log("🎉 所有测试通过！", COLORS.green + COLORS.bright)
  } else {
    log("💥 部分测试失败，请检查上面的错误信息", COLORS.red + COLORS.bright)
  }
  console.log("")

  process.exit(allPassed ? 0 : 1)
}

main().catch((error) => {
  console.error("未捕获的错误:", error)
  process.exit(1)
})
