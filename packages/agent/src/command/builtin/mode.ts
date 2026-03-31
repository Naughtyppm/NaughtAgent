/**
 * /mode 命令 - 切换权限模式
 *
 * 在不同权限模式之间切换：
 * - ask: 每次操作询问用户（默认）
 * - allow: 自动执行，不询问
 * - sandbox: 沙箱模式，超出边界才询问
 *
 * @example
 * /mode          - 显示当前模式并切换到下一个
 * /mode ask      - 切换到 ask 模式
 * /mode allow    - 切换到 allow 模式
 * /mode sandbox  - 切换到 sandbox 模式
 */

import type { BuiltinCommandDefinition, AppState } from './types.js'
import type { ExecutionResult } from '../types.js'

/**
 * 权限模式类型
 */
type PermissionMode = AppState['permissionMode']

/**
 * 权限模式顺序（用于循环切换）
 */
const MODE_ORDER: PermissionMode[] = ['ask', 'allow', 'sandbox']

/**
 * 权限模式描述
 */
const MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
  ask: '每次操作询问用户确认',
  allow: '自动执行所有操作',
  sandbox: '沙箱模式，超出边界才询问',
}

/**
 * 权限模式图标
 */
const MODE_ICONS: Record<PermissionMode, string> = {
  ask: '🔒',
  allow: '🔓',
  sandbox: '📦',
}

/**
 * 格式化模式列表
 */
function formatModeList(currentMode: PermissionMode): string {
  const lines: string[] = []
  lines.push('权限模式:')
  lines.push('─'.repeat(40))

  for (const mode of MODE_ORDER) {
    const marker = mode === currentMode ? '→ ' : '  '
    const icon = MODE_ICONS[mode]
    const desc = MODE_DESCRIPTIONS[mode]
    lines.push(`${marker}${icon} ${mode}: ${desc}`)
  }

  lines.push('')
  lines.push(`当前模式: ${MODE_ICONS[currentMode]} ${currentMode}`)

  return lines.join('\n')
}

/**
 * 获取下一个模式（循环）
 */
function getNextMode(currentMode: PermissionMode): PermissionMode {
  const currentIndex = MODE_ORDER.indexOf(currentMode)
  const nextIndex = (currentIndex + 1) % MODE_ORDER.length
  return MODE_ORDER[nextIndex]
}

/**
 * 验证模式名称
 */
function isValidMode(mode: string): mode is PermissionMode {
  return MODE_ORDER.includes(mode as PermissionMode)
}

/**
 * /mode 命令定义
 */
export const modeCommand: BuiltinCommandDefinition = {
  name: 'mode',
  description: '切换权限模式 (ask/allow/sandbox)',
  aliases: [],
  parameters: [
    {
      name: 'mode',
      description: '要切换到的模式 (ask/allow/sandbox)',
      required: false,
    },
  ],
  handler: (args, _namedArgs, context): ExecutionResult => {
    const startTime = Date.now()
    const state = context.getState()
    const currentMode = state.permissionMode

    // 如果没有参数，切换到下一个模式
    if (args.length === 0) {
      const newMode = getNextMode(currentMode)

      try {
        context.setState({ permissionMode: newMode })

        const message = `权限模式已从 ${MODE_ICONS[currentMode]} ${currentMode} 切换到 ${MODE_ICONS[newMode]} ${newMode}`

        return {
          success: true,
          output: `${message}\n\n${formatModeList(newMode)}`,
          duration: Date.now() - startTime,
          layer: 'builtin',
          data: {
            previousMode: currentMode,
            currentMode: newMode,
          },
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          output: '',
          error: `切换模式失败: ${errorMessage}`,
          duration: Date.now() - startTime,
          layer: 'builtin',
        }
      }
    }

    // 切换到指定模式
    const targetMode = args[0].toLowerCase()

    if (!isValidMode(targetMode)) {
      return {
        success: false,
        output: formatModeList(currentMode),
        error: `无效的模式: ${targetMode}。可用模式: ${MODE_ORDER.join(', ')}`,
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }

    // 如果已经是目标模式
    if (targetMode === currentMode) {
      return {
        success: true,
        output: `当前已是 ${MODE_ICONS[currentMode]} ${currentMode} 模式\n\n${formatModeList(currentMode)}`,
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }

    try {
      context.setState({ permissionMode: targetMode })

      const message = `权限模式已从 ${MODE_ICONS[currentMode]} ${currentMode} 切换到 ${MODE_ICONS[targetMode]} ${targetMode}`

      return {
        success: true,
        output: `${message}\n\n${formatModeList(targetMode)}`,
        duration: Date.now() - startTime,
        layer: 'builtin',
        data: {
          previousMode: currentMode,
          currentMode: targetMode,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        output: '',
        error: `切换模式失败: ${errorMessage}`,
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }
  },
}
