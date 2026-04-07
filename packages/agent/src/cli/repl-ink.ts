/**
 * Ink REPL 入口
 *
 * 基于 Ink (React for CLI) 的终端 UI 实现
 * 提供类似 Claude Code 的交互式体验
 */

/**
 * REPL 配置
 */
export interface ReplConfig {
  cwd: string
  agent: "build" | "plan" | "explore"
  model?: string
  autoConfirm: boolean
  /** Extended Thinking 配置 */
  thinking?: {
    enabled: boolean
    budgetTokens?: number
  }
}

/**
 * 启动 Ink REPL
 */
export async function startInkRepl(config: ReplConfig): Promise<void> {
  // TTY 检查
  if (!process.stdout.isTTY || process.env.TERM === 'dumb') {
    console.error('终端不支持交互式 UI（需要 TTY + ANSI 支持）')
    process.exit(1)
  }

  const { startInkRepl: startInk } = await import('./ink/index.js')

  const instance = await startInk({
    cwd: config.cwd,
    agent: config.agent,
    model: config.model,
    autoConfirm: config.autoConfirm,
    thinking: config.thinking,
  })
  await instance.waitUntilExit()
}
