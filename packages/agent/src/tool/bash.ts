import { spawn } from "child_process"
import * as path from "path"
import { z } from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Executes a shell command with optional timeout.

Usage:
- Commands run in the current working directory by default
- Use workdir parameter to run in a different directory
- Default timeout is 120 seconds
- Output is automatically truncated if too long`

const DEFAULT_TIMEOUT = 120_000 // 2 minutes
const MAX_OUTPUT_LENGTH = 100_000 // 100KB

/**
 * 获取当前平台的 shell
 */
function getShell(): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    // Windows: 优先使用 PowerShell
    return {
      shell: "powershell.exe",
      args: ["-NoProfile", "-Command"],
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
  }),

  async execute(params, ctx) {
    const { command, timeout = DEFAULT_TIMEOUT, description } = params
    let workdir = params.workdir

    // 处理相对路径
    if (workdir && !path.isAbsolute(workdir)) {
      workdir = path.resolve(ctx.cwd, workdir)
    }
    const cwd = workdir || ctx.cwd

    const title = description || command.substring(0, 50)
    const { shell, args } = getShell()

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
        output += chunk.toString()
      })

      proc.stderr?.on("data", (chunk) => {
        output += chunk.toString()
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
