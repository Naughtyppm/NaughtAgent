import { spawn } from "child_process"
import { z } from "zod"
import { Tool } from "./tool"
import { resolvePath } from "./safe-path"
import { BASH_MAX_OUTPUT_LENGTH } from "../config"
import { registerBackgroundTask, appendTaskOutput, updateBackgroundTask } from "./background-task"

const DESCRIPTION = `Executes a shell command with optional timeout.

Usage:
- Commands run in the current working directory by default
- Use workdir parameter to run in a different directory
- Default timeout is 120 seconds
- Output is automatically truncated if too long
- Set run_in_background to run the command in the background. Use task_output to check results later.`

const DEFAULT_TIMEOUT = 120_000 // 2 minutes
const MAX_OUTPUT_LENGTH = BASH_MAX_OUTPUT_LENGTH

// ─── 文件读取命令检测（拦截 LLM 用 bash 绕过 read 工具）──────
// 匹配 Get-Content / type / cat / [System.IO.File]::ReadAllText 等读文件命令
const FILE_READ_PATTERNS = [
  /^\s*Get-Content\s/i,
  /^\s*gc\s/i,                           // Get-Content 别名
  /^\s*cat\s/i,                           // Unix cat 或 PowerShell 别名
  /^\s*type\s/i,                          // Windows type
  /^\s*head\s/i,
  /^\s*tail\s/i,
  /\[System\.IO\.File\]::ReadAll/i,       // .NET 文件读取
  /^\s*more\s/i,
  /^\s*less\s/i,
]

/**
 * 检测命令是否为纯文件读取操作
 * 拦截"只读文件"的命令，也检测分号分隔的复合命令中的尾段
 */
function isFileReadCommand(command: string): boolean {
  const trimmed = command.trim()
  // 包含管道（|）、重定向（>）、逻辑操作（&&/||）的不拦截——这些有合理 bash 用途
  if (/[|>]|&&|\|\|/.test(trimmed)) return false
  // 不含分号的简单命令
  if (!trimmed.includes(';')) {
    return FILE_READ_PATTERNS.some(pattern => pattern.test(trimmed))
  }
  // 含分号的复合命令：检查最后一段是否为文件读取
  // 典型模式：[Console]::OutputEncoding = ...; Get-Content "file.kt"
  const parts = trimmed.split(';').map(p => p.trim()).filter(Boolean)
  const lastPart = parts[parts.length - 1]
  return FILE_READ_PATTERNS.some(pattern => pattern.test(lastPart))
}

/**
 * 获取当前平台的 shell
 */
function getShell(): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    // Windows: 优先使用 PowerShell，强制 UTF-8 输出编码
    return {
      shell: "powershell.exe",
      args: ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;"],
    }
  }
  // Unix: 使用 bash 或 sh
  const shell = process.env.SHELL || "/bin/sh"
  return {
    shell,
    args: ["-c"],
  }
}

export const BashTool = Tool.define({
  id: "bash",
  description: DESCRIPTION,
  parameters: z.object({
    command: z.string().describe("The command to execute"),
    workdir: z.string().optional().describe("Working directory for the command"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default 120000)"),
    description: z.string().optional().describe("Brief description of what the command does"),
    run_in_background: z.boolean().optional().describe("Run command in background. Use task_output to get results."),
  }),

  async execute(params, ctx) {
    const { command, timeout = DEFAULT_TIMEOUT, description, run_in_background } = params
    let workdir = params.workdir

    if (workdir) {
      workdir = resolvePath(workdir, ctx.cwd)
    }
    const cwd = workdir || ctx.cwd

    // ─── 文件读取命令拦截 ─────────────────────────
    // 检测用 bash 读文件的行为，强制使用 read 工具（防止绕过 read 缓存和去重）
    if (isFileReadCommand(command)) {
      return {
        title: "Rejected: use read tool",
        output: `ERROR: Do not use bash/PowerShell to read files. Use the "read" tool instead.\n` +
          `The read tool provides caching, line numbers, and prevents duplicate reads.\n` +
          `Rejected command: ${command.substring(0, 100)}`,
        isError: true,
        metadata: { rejected: true, reason: "file_read_via_bash" },
      }
    }

    const title = description || command.substring(0, 50)
    const { shell, args } = getShell()

    // ─── 后台执行模式 ───────────────────────────
    if (run_in_background) {
      const taskId = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      let resolveCompletion: () => void
      const completion = new Promise<void>((resolve) => { resolveCompletion = resolve })

      const proc = spawn(shell, [...args, command], {
        cwd,
        env: { ...process.env, TERM: "dumb" },
        stdio: ["ignore", "pipe", "pipe"],
      })

      registerBackgroundTask({
        id: taskId,
        command,
        output: "",
        status: "running",
        startTime: Date.now(),
        kill: () => proc.kill("SIGTERM"),
        completion,
      })

      proc.stdout?.on("data", (chunk) => appendTaskOutput(taskId, chunk.toString()))
      proc.stderr?.on("data", (chunk) => appendTaskOutput(taskId, chunk.toString()))

      proc.on("close", (code) => {
        updateBackgroundTask(taskId, {
          status: code === 0 ? "completed" : "failed",
          exitCode: code ?? undefined,
        })
        resolveCompletion!()
      })

      proc.on("error", (err) => {
        appendTaskOutput(taskId, `\nProcess error: ${err.message}`)
        updateBackgroundTask(taskId, { status: "failed" })
        resolveCompletion!()
      })

      return {
        title: `Background: ${title}`,
        output: `Background task started.\nTask ID: ${taskId}\nCommand: ${command}\n\nUse task_output with task_id="${taskId}" to check results.`,
        metadata: { taskId, background: true },
      }
    }

    // ─── 前台执行 ───────────────────────────────

    return new Promise<Tool.Result>((resolve, reject) => {
      let output = ""
      let killed = false
      let timedOut = false

      const proc = spawn(shell, [...args, command], {
        cwd,
        env: {
          ...process.env,
          TERM: "dumb",
        },
        stdio: ["ignore", "pipe", "pipe"],
      })

      // 超时处理
      const timer = setTimeout(() => {
        timedOut = true
        proc.kill("SIGTERM")
        setTimeout(() => {
          if (!killed) {
            proc.kill("SIGKILL")
          }
        }, 5000)
      }, timeout)

      // 取消处理
      const abortHandler = () => {
        killed = true
        proc.kill("SIGTERM")
      }
      ctx.abort.addEventListener("abort", abortHandler, { once: true })

      // 收集输出
      proc.stdout?.on("data", (chunk) => {
        const text = chunk.toString()
        output += text
        ctx.onOutputChunk?.(text)
      })

      proc.stderr?.on("data", (chunk) => {
        const text = chunk.toString()
        output += text
        ctx.onOutputChunk?.(text)
      })

      proc.on("close", (code) => {
        clearTimeout(timer)
        ctx.abort.removeEventListener("abort", abortHandler)
        killed = true

        // 截断过长输出
        let truncated = false
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n\n... (output truncated)"
          truncated = true
        }

        // 添加状态信息
        if (timedOut) {
          output += `\n\n[Command timed out after ${timeout}ms]`
        } else if (ctx.abort.aborted) {
          output += "\n\n[Command was cancelled]"
        }

        if (code !== 0 && code !== null) {
          output += `\n\n[Exit code: ${code}]`
        }

        resolve({
          title,
          output: output || "(no output)",
          metadata: {
            exitCode: code,
            timedOut,
            truncated,
            cwd,
          },
        })
      })

      proc.on("error", (err) => {
        clearTimeout(timer)
        ctx.abort.removeEventListener("abort", abortHandler)
        reject(new Error(`Failed to execute command: ${err.message}`))
      })
    })
  },
})
