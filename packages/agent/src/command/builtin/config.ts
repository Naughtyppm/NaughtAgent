/**
 * /config 命令 - 显示/打开配置
 *
 * 显示当前配置或打开配置文件
 *
 * @example
 * /config        - 显示当前配置
 * /config --open - 打开配置文件（在编辑器中）
 * /config --path - 显示配置文件路径
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult } from '../types.js'
import { homedir } from 'os'
import { join } from 'path'

/**
 * 配置文件路径
 */
const CONFIG_DIR = join(homedir(), '.naughtyagent')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

/**
 * 格式化配置显示
 */
function formatConfig(state: {
  currentModel: string
  permissionMode: string
  cwd: string
  commandHistory: string[]
  conversationHistory: unknown[]
}): string {
  const lines: string[] = []

  lines.push('当前配置:')
  lines.push('─'.repeat(40))
  lines.push('')

  // 基本配置
  lines.push('📋 基本设置')
  lines.push(`  当前模型: ${state.currentModel}`)
  lines.push(`  权限模式: ${state.permissionMode}`)
  lines.push(`  工作目录: ${state.cwd}`)
  lines.push('')

  // 会话状态
  lines.push('📊 会话状态')
  lines.push(`  命令历史: ${state.commandHistory.length} 条`)
  lines.push(`  对话历史: ${state.conversationHistory.length} 条`)
  lines.push('')

  // 配置文件位置
  lines.push('📁 配置文件')
  lines.push(`  目录: ${CONFIG_DIR}`)
  lines.push(`  文件: ${CONFIG_FILE}`)

  return lines.join('\n')
}

/**
 * /config 命令定义
 */
export const configCommand: BuiltinCommandDefinition = {
  name: 'config',
  description: '显示或打开配置',
  aliases: ['cfg', 'settings'],
  parameters: [
    {
      name: 'open',
      description: '在编辑器中打开配置文件',
      required: false,
      defaultValue: 'false',
    },
    {
      name: 'path',
      description: '仅显示配置文件路径',
      required: false,
      defaultValue: 'false',
    },
  ],
  handler: (args, namedArgs, context): ExecutionResult => {
    const startTime = Date.now()
    const state = context.getState()

    // 检查 --path 参数
    if (namedArgs['path'] === 'true' || namedArgs['path'] === '') {
      return {
        success: true,
        output: `配置文件路径:\n  目录: ${CONFIG_DIR}\n  文件: ${CONFIG_FILE}`,
        duration: Date.now() - startTime,
        layer: 'builtin',
        data: {
          configDir: CONFIG_DIR,
          configFile: CONFIG_FILE,
        },
      }
    }

    // 检查 --open 参数
    if (namedArgs['open'] === 'true' || namedArgs['open'] === '') {
      // 注意：实际打开文件需要在 UI 层处理
      // 这里返回一个标记，让 UI 层知道需要打开配置文件
      context.addMessage('info', `请在编辑器中打开: ${CONFIG_FILE}`)

      return {
        success: true,
        output: `配置文件位置: ${CONFIG_FILE}\n\n提示: 请使用编辑器打开此文件进行编辑`,
        duration: Date.now() - startTime,
        layer: 'builtin',
        data: {
          action: 'open',
          configFile: CONFIG_FILE,
        },
      }
    }

    // 默认：显示当前配置
    return {
      success: true,
      output: formatConfig(state),
      duration: Date.now() - startTime,
      layer: 'builtin',
      data: {
        currentModel: state.currentModel,
        permissionMode: state.permissionMode,
        cwd: state.cwd,
        configDir: CONFIG_DIR,
        configFile: CONFIG_FILE,
      },
    }
  },
}
