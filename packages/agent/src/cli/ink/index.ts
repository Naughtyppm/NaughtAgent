/**
 * Ink REPL 入口
 *
 * 基于 Ink (React for CLI) 的终端 UI 实现
 * 提供类似 Claude Code 的交互式体验
 *
 * 需求: 1.4, 1.5, 8.5
 */

import React from 'react'
import { render } from '../cc-ink/index.js'
import { App } from './App.js'
import type { ReplConfig } from './types.js'

// 导出类型（排除与组件同名的类型）
export type {
  ReplConfig,
  AppState,
  ToolCall,
  ToolStatus,
  StatusType,
  PermissionResult,
} from './types.js'

// 导出组件
export * from './components/index.js'

// 导出 hooks
export * from './hooks/index.js'

// 导出工具函数
export * from './utils/index.js'

/**
 * 检测终端是否支持 Ink
 *
 * @returns 是否支持 Ink
 */
export function checkTerminalSupport(): boolean {
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

  return true
}

/**
 * 启动 Ink REPL
 *
 * @param config REPL 配置
 * @returns Ink 实例（用于清理）
 */
export async function startInkRepl(config: ReplConfig): Promise<{ waitUntilExit: () => Promise<void> }> {
  // 检查终端支持
  if (!checkTerminalSupport()) {
    console.warn('终端不支持 Ink，请使用传统 REPL 模式')
    throw new Error('Terminal does not support Ink')
  }

  // 渲染 App 组件
  // exitOnCtrlC: false 让我们自己处理 Ctrl+C
  const instance = await render(React.createElement(App, { config }), {
    exitOnCtrlC: false,
  })

  return instance
}

/**
 * 导出 App 组件（用于测试）
 */
export { App }
