/**
 * Ink REPL 入口
 *
 * 基于 Ink (React for CLI) 的终端 UI 实现
 * 提供类似 Claude Code 的交互式体验
 *
 * 如果终端不支持 Ink，会自动回退到传统 REPL
 *
 * 需求: 1.4, 1.5, 8.5
 */

import type { ReplConfig } from './repl'
import { startRepl as startLegacyRepl } from './repl'

/**
 * 检测终端是否支持 Ink
 */
function checkTerminalSupport(): boolean {
  // 检查是否为 TTY
  if (!process.stdout.isTTY) {
    return false
  }

  // 检查是否支持 ANSI
  if (process.env.TERM === 'dumb') {
    return false
  }

  // 检查是否在 CI 环境
  if (process.env.CI) {
    return false
  }

  // 检查是否强制使用传统 REPL
  if (process.env.NAUGHTY_LEGACY_REPL === '1') {
    return false
  }

  return true
}

/**
 * 启动 REPL（自动选择 Ink 或传统模式）
 *
 * @param config REPL 配置
 */
export async function startInkRepl(config: ReplConfig): Promise<void> {
  // 检查终端支持
  if (!checkTerminalSupport()) {
    console.log('终端不支持 Ink UI，使用传统 REPL 模式')
    return startLegacyRepl(config)
  }

  try {
    // 动态导入 Ink 模块（避免在不支持的环境中加载）
    const { startInkRepl: startInk } = await import('./ink/index.js')

    // 转换配置格式
    const inkConfig = {
      cwd: config.cwd,
      agent: config.agent,
      model: config.model,
      autoConfirm: config.autoConfirm,
      thinking: config.thinking,
    }

    // 启动 Ink REPL
    const instance = startInk(inkConfig)
    await instance.waitUntilExit()
  } catch (error) {
    // 如果 Ink 启动失败，回退到传统 REPL
    console.warn('Ink REPL 启动失败，回退到传统模式:', error instanceof Error ? error.message : error)
    return startLegacyRepl(config)
  }
}

/**
 * 导出传统 REPL（用于显式调用）
 */
export { startRepl as startLegacyRepl } from './repl'
