/**
 * Plain-text CLI 权限对话框
 *
 * 使用 Box 绘制权限确认界面
 */

import * as readline from "node:readline"
import { ANSI, SYMBOLS } from "./constants"
import { colorize, bold } from "./formatter"
import type { PermissionRequest } from "../../permission"

// ============================================================================
// 权限对话框
// ============================================================================

/** 权限确认结果 */
export type PermissionChoice = "allow" | "deny" | "always_allow"

/**
 * 显示权限对话框并等待用户选择
 */
export async function showPermissionDialog(
  request: PermissionRequest,
  options?: { onAlwaysAllow?: () => void }
): Promise<boolean> {
  const description = request.description || `${request.type}: ${request.resource}`

  // 绘制对话框
  const boxWidth = 56
  const hr = "═".repeat(boxWidth)
  const line = (text: string) => `║ ${text.padEnd(boxWidth - 2)} ║`

  const lines = [
    "",
    `╔${hr}╗`,
    line(`${SYMBOLS.LOCK} 权限请求`),
    `╠${hr}╣`,
    line(""),
    line(`NaughtyAgent 需要执行:`),
    line(`${bold(description)}`),
    line(""),
  ]

  // 如果有资源详情
  if (request.resource) {
    lines.push(line(`资源: ${request.resource}`))
    lines.push(line(""))
  }

  lines.push(
    line("请选择:"),
    line(`  ${colorize("↑/↓", ANSI.cyan)} 选择  ${colorize("Enter", ANSI.green)} 确认  ${colorize("Esc", ANSI.red)} 拒绝`),
    line(""),
    `╚${hr}╝`,
  )

  process.stdout.write(lines.join("\n") + "\n")

  // 方向键选择（↑/↓ + Enter），兼容 y/a/n 快捷键
  return new Promise<boolean>((resolve) => {
    const choices: Array<{ label: string; value: PermissionChoice }> = [
      { label: "Allow", value: "allow" },
      { label: "Always Allow", value: "always_allow" },
      { label: "Deny", value: "deny" },
    ]
    // 安全默认：高亮 Deny
    let selected = 2
    const stdin = process.stdin
    const wasRaw = Boolean((stdin as unknown as { isRaw?: boolean }).isRaw)

    const renderOptions = () => {
      process.stdout.write(`  ${SYMBOLS.PROMPT} \n`)
      for (let i = 0; i < choices.length; i++) {
        const prefix = i === selected ? colorize(">", ANSI.cyan) : " "
        const label = i === selected ? bold(choices[i].label) : choices[i].label
        process.stdout.write(`    ${prefix} ${label}\n`)
      }
      process.stdout.write("\n")
    }

    const cleanup = () => {
      stdin.off("keypress", onKeypress)
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw)
      }
    }

    const confirm = () => {
      const choice = choices[selected].value
      cleanup()
      if (choice === "always_allow") {
        options?.onAlwaysAllow?.()
      }
      resolve(choice === "allow" || choice === "always_allow")
    }

    const onKeypress = (str: string, key: { name?: string; sequence?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        cleanup()
        resolve(false)
        return
      }
      if (key.name === "escape") {
        cleanup()
        resolve(false)
        return
      }

      if (key.name === "up") {
        selected = (selected - 1 + choices.length) % choices.length
      } else if (key.name === "down" || key.name === "tab") {
        selected = (selected + 1) % choices.length
      } else if (key.name === "return" || key.name === "enter") {
        confirm()
        return
      } else {
        const s = (str || key.sequence || "").trim().toLowerCase()
        if (s === "y") selected = 0
        else if (s === "a") selected = 1
        else if (s === "n") selected = 2
        else return
      }

      // 清掉旧的选项行后重绘
      process.stdout.write(`\x1b[${choices.length + 2}A`)
      process.stdout.write(`\x1b[J`)
      renderOptions()
    }

    readline.emitKeypressEvents(stdin)
    if (stdin.isTTY) {
      stdin.setRawMode(true)
    }
    stdin.on("keypress", onKeypress)
    renderOptions()
  })
}
