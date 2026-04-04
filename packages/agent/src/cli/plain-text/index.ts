/**
 * Plain-text CLI 入口
 *
 * startPlainTextRepl — 纯文本流式 REPL
 * 消费 RunnerEventHandlers 事件，用 readline + ANSI 直写 stdout
 */

import { createRunner, type RunnerConfig, type RunnerEventHandlers } from "../runner"
import type { ReplConfig } from "../repl-ink"
import type { PermissionRequest } from "../../permission"
import { getAvailableModels } from "../../config/models"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { StreamRenderer } from "./renderer"
import { PlainTextInput } from "./interaction"
import { showPermissionDialog } from "./permission-dialog"

// ============================================================================
// startPlainTextRepl
// ============================================================================

export async function startPlainTextRepl(config: ReplConfig): Promise<void> {
  const renderer = new StreamRenderer()
  const model = config.model || "claude-sonnet-4"
  const memoryPath = join(config.cwd, ".naughty", "memory.md")

  // 显示欢迎信息
  renderer.renderWelcome(model, config.cwd, config.agent)
  if (existsSync(memoryPath)) {
    const lineCount = readFileSync(memoryPath, "utf-8").split("\n").filter((line) => line.trim().length > 0).length
    process.stdout.write(`\n[memory] 已加载 ${lineCount} 行：${memoryPath}\n`)
  } else {
    process.stdout.write("\n[memory] 尚未创建。可用 /memory add <内容> 追加持久记忆。\n")
  }

  // 是否正在运行 Agent
  let running = false

  // autoConfirm 引用（支持运行时修改）
  const autoConfirmRef = { value: config.autoConfirm }

  // Runner 配置（默认启用 thinking，对齐 CC）
  const thinkingConfig = config.thinking ?? { enabled: true, budgetTokens: undefined }
  const runnerConfig: RunnerConfig = {
    agentType: config.agent,
    cwd: config.cwd,
    model: config.model,
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    autoConfirmRef,
    onConfirm: (request) => showPermissionDialog(request, {
      onAlwaysAllow: () => {
        autoConfirmRef.value = true
        process.stdout.write("\n✓ 已切换为本会话全部放行（最高优先级）\n")
      },
    }),
    thinking: thinkingConfig.enabled ? thinkingConfig : undefined,
  }

  let runner: ReturnType<typeof createRunner>
  try {
    runner = createRunner(runnerConfig)
  } catch (error) {
    console.error("Runner 初始化失败:", error instanceof Error ? error.message : error)
    process.exit(1)
  }

  // 事件处理器：桥接 RunnerEventHandlers → StreamRenderer
  function createHandlers(): RunnerEventHandlers {
    return {
      onTextDelta: (delta) => renderer.onTextDelta(delta),
      onThinking: (content) => renderer.onThinking(content),
      onThinkingEnd: () => renderer.onThinkingEnd(),
      onToolStart: (id, name, input) => renderer.onToolStart(id, name, input),
      onToolEnd: (id, output, isError) => renderer.onToolEnd(id, output, isError),
      onError: (error) => renderer.onError(error),
      onDone: (usage) => {
        renderer.onDone(usage)
        running = false
        input.resume()
      },
      onPermissionRequest: (_request: PermissionRequest) => {
        // 权限请求在 onConfirm 中处理
      },
    }
  }

  // 用户输入处理
  const input = new PlainTextInput({
    onInput: async (text) => {
      if (running) {
        process.stdout.write("\n任务进行中：普通消息将被忽略。可用 #N 查看折叠、/folds 列表、/allowall on 一键放行、Ctrl+C 中断。\n")
        input.prompt()
        return
      }

      // readline 已自动 echo 用户输入，无需重复显示

      running = true

      // 显示等待状态
      renderer.showRequestStatus()

      try {
        await runner.run(text, createHandlers())
      } catch (error) {
        renderer.onError(error instanceof Error ? error : new Error(String(error)))
        running = false
        input.resume()
      }
    },
    onInterrupt: () => {
      if (running) {
        // 运行中按 Ctrl+C → 停止当前任务
        process.stdout.write("\n⚠ 中断当前任务\n")
        running = false
        input.resume()
      } else {
        // 空闲时按 Ctrl+C → 退出
        process.stdout.write("\n再见！\n")
        process.exit(0)
      }
    },
    foldManager: renderer.getFoldManager(),
  })

  // 注册额外命令
  input.registerCommand("/model", (args) => {
    if (args) {
      runnerConfig.model = args
      runner.setModel(args)
      renderer.setModel(args)
      process.stdout.write(`\n模型已切换为: ${args}\n`)
    } else {
      process.stdout.write(`\nCurrent: ${runnerConfig.model || model}\n`)
      process.stdout.write(`\nModels:\n`)
      const tierLabels: Record<string, string> = { fast: "[F]", standard: "[S]", premium: "[P]" }
      for (const entry of getAvailableModels()) {
        const icon = tierLabels[entry.tier] || "   "
        const thinking = entry.supportsThinking ? " +thinking" : ""
        const current = (runnerConfig.model || model) === entry.copilotId ||
                        (runnerConfig.model || model) === entry.anthropicId ||
                        (runnerConfig.model || model) === entry.shortName
          ? " <-- current" : ""
        process.stdout.write(`  ${icon} ${entry.shortName.padEnd(12)} ${entry.displayName}${thinking}${current}\n`)
      }
      process.stdout.write(`\nSwitch: /model <name>  e.g. /model opus-4.6\n`)
    }
    input.prompt()
  })

  input.registerCommand("/agent", (args) => {
    if (args === "build" || args === "plan" || args === "explore") {
      runnerConfig.agentType = args
      process.stdout.write(`\nAgent 已切换为: ${args}\n`)
    } else {
      process.stdout.write(`\n当前 Agent: ${runnerConfig.agentType || config.agent}\n可选: build | plan | explore\n`)
    }
    input.prompt()
  })

  input.registerCommand("/compact", async () => {
    process.stdout.write("\n⏳ 压缩上下文中...\n")
    // compact 由 runner 内部 autoCompact 处理
    process.stdout.write("✓ compact 会在 token 阈值触发时自动执行。\n")
    input.prompt()
  })

  input.registerCommand("/thinking", (args) => {
    const current = runnerConfig.thinking
    if (args === "on" || args === "enable") {
      runnerConfig.thinking = { enabled: true }
      runner.setThinking({ enabled: true })
      process.stdout.write("\n✓ Thinking 已启用\n")
    } else if (args === "off" || args === "disable") {
      runnerConfig.thinking = undefined
      runner.setThinking({ enabled: false })
      process.stdout.write("\n✓ Thinking 已关闭\n")
    } else {
      const status = current?.enabled ? "✓ 启用" : "✗ 关闭"
      const budget = current?.budgetTokens ? ` (budget: ${current.budgetTokens})` : ""
      process.stdout.write(`\nThinking: ${status}${budget}\n用法: /thinking on | off\n`)
    }
    input.prompt()
  })

  input.registerCommand("/allowall", (args) => {
    const normalized = args.trim().toLowerCase()
    if (normalized === "on" || normalized === "enable") {
      autoConfirmRef.value = true
      process.stdout.write("\n✓ 会话级全部放行已开启（最高优先级）\n")
    } else if (normalized === "off" || normalized === "disable") {
      autoConfirmRef.value = false
      process.stdout.write("\n✓ 会话级全部放行已关闭\n")
    } else {
      process.stdout.write(`\nallowall: ${autoConfirmRef.value ? "ON" : "OFF"}\n用法: /allowall on | off\n`)
    }
    input.prompt()
  })

  input.registerCommand("/render", (args) => {
    const mode = args.trim().toLowerCase()
    if (mode === "clean" || mode === "on") {
      renderer.setMarkdownCleanup(true)
      process.stdout.write("\n✓ 渲染模式: clean（推荐，减少 Markdown 符号噪声）\n")
    } else if (mode === "raw" || mode === "off") {
      renderer.setMarkdownCleanup(false)
      process.stdout.write("\n✓ 渲染模式: raw（原始模型输出）\n")
    } else {
      process.stdout.write("\n当前支持: /render clean | raw\n")
    }
    input.prompt()
  })

  input.registerCommand("/cost", () => {
    // TODO: runner.getStats() 未实现，待后续添加
    process.stdout.write("\n📊 token 用量请查看日志: just na-log\n")
    input.prompt()
  })

  input.registerCommand("/memory", (args) => {
    const sub = args.trim()
    const lower = sub.toLowerCase()

    if (!sub || lower === "show") {
      if (!existsSync(memoryPath)) {
        process.stdout.write("\n[memory] 记忆文件不存在。使用 /memory add <内容> 创建。\n")
        input.prompt()
        return
      }

      const content = readFileSync(memoryPath, "utf-8")
      const lines = content.split("\n")
      const preview = lines.slice(0, 40).join("\n")
      const suffix = lines.length > 40 ? `\n... (共 ${lines.length} 行，已截断)` : ""
      process.stdout.write(`\n[memory] ${memoryPath}\n\n${preview}${suffix}\n`)
      input.prompt()
      return
    }

    if (lower === "edit") {
      process.stdout.write(`\n[memory] 请直接编辑文件：${memoryPath}\n`)
      input.prompt()
      return
    }

    if (lower.startsWith("add ")) {
      const text = sub.slice(4).trim()
      if (!text) {
        process.stdout.write("\n用法: /memory add <内容>\n")
        input.prompt()
        return
      }

      const memoryDir = join(config.cwd, ".naughty")
      if (!existsSync(memoryDir)) {
        mkdirSync(memoryDir, { recursive: true })
      }
      appendFileSync(memoryPath, `\n- ${new Date().toISOString().split("T")[0]}: ${text}\n`, "utf-8")
      process.stdout.write("\n[memory] 已追加。\n")
      input.prompt()
      return
    }

    process.stdout.write("\n用法: /memory | /memory show | /memory add <内容> | /memory edit\n")
    input.prompt()
  })

  // 启动输入循环
  input.start()

  // 保持进程运行
  await new Promise<void>(() => {
    // REPL 永不 resolve，靠 process.exit 退出
  })
}
