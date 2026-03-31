/**
 * 内置命令层 (Builtin Layer)
 *
 * 导出所有内置命令定义和类型
 *
 * 内置命令特点：
 * - 同步执行，无副作用
 * - 不需要 AI 推理
 * - 直接操作应用状态
 */

// 导出类型
export type {
  AppState,
  BuiltinContext,
  BuiltinHandler,
  BuiltinCommandDefinition,
} from './types.js'

// ============================================================================
// 内置命令导入
// ============================================================================

import type { BuiltinCommandDefinition } from './types.js'
import type { UnifiedCommand } from '../types.js'

// 核心命令
import { helpCommand } from './help.js'
import { clearCommand } from './clear.js'
import { exitCommand, quitCommand } from './exit.js'
import { refreshCommand } from './refresh.js'
import { initCommand } from './init.js'

// 状态管理命令
import { modelCommand } from './model.js'
import { modeCommand } from './mode.js'
import { historyCommand } from './history.js'
import { configCommand } from './config.js'

// 别名命令
import { aliasCommand } from './alias.js'

// ============================================================================
// 内置命令注册表
// ============================================================================

/**
 * 所有内置命令定义
 *
 * 已实现的命令：
 * - /help - 显示所有命令（按层分组）
 * - /clear - 清空对话历史
 * - /exit - 退出应用（提示使用 /quit）
 * - /quit - 退出应用（唯一退出方式）
 * - /refresh - 重新加载命令源
 * - /model - 切换模型
 * - /mode - 切换权限模式
 * - /history - 显示命令历史
 * - /config - 显示/打开配置
 * - /init - 初始化项目，生成 Naughty.md
 * - /alias - 管理命令别名
 */
const builtinCommands: BuiltinCommandDefinition[] = [
  helpCommand,
  clearCommand,
  exitCommand,
  quitCommand,
  refreshCommand,
  modelCommand,
  modeCommand,
  historyCommand,
  configCommand,
  initCommand,
  aliasCommand,
]

/**
 * 获取所有内置命令定义
 */
export function getBuiltinCommandDefinitions(): BuiltinCommandDefinition[] {
  return builtinCommands
}

/**
 * 将内置命令定义转换为统一命令格式
 */
export function convertToUnifiedCommands(): UnifiedCommand[] {
  return builtinCommands.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    layer: 'builtin' as const,
    executionMode: 'sync' as const,
    source: 'builtin' as const,
    parameters: cmd.parameters ?? [],
    aliases: cmd.aliases,
  }))
}

/**
 * 根据名称获取内置命令定义
 *
 * @param name - 命令名称（不含 /）
 * @returns 命令定义，未找到返回 undefined
 */
export function getBuiltinCommand(name: string): BuiltinCommandDefinition | undefined {
  return builtinCommands.find(
    (cmd) => cmd.name === name || cmd.aliases?.includes(name)
  )
}

/**
 * 注册内置命令
 *
 * 供内部使用，添加新的内置命令
 *
 * @param command - 命令定义
 */
export function registerBuiltinCommand(command: BuiltinCommandDefinition): void {
  // 检查是否已存在
  const existing = builtinCommands.findIndex(
    (cmd) => cmd.name === command.name
  )
  if (existing >= 0) {
    // 替换现有命令
    builtinCommands[existing] = command
  } else {
    builtinCommands.push(command)
  }
}
