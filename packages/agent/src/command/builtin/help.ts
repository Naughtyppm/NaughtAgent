/**
 * /help 命令 - 显示所有命令（按层分组）
 *
 * 从统一注册表获取所有命令，按层级分组显示
 *
 * @example
 * /help          - 显示所有命令
 * /help commit   - 显示特定命令的详细信息
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult, UnifiedCommand } from '../types.js'
import { LAYER_ICONS } from '../types.js'

/**
 * 格式化命令列表
 */
function formatCommandList(commands: UnifiedCommand[]): string {
  const lines: string[] = []

  // 按层级分组
  const builtin = commands.filter((c) => c.layer === 'builtin')
  const skill = commands.filter((c) => c.layer === 'skill')
  const external = commands.filter((c) => c.layer === 'external')

  // 内置命令
  if (builtin.length > 0) {
    lines.push(`${LAYER_ICONS.builtin} 内置命令 (Builtin)`)
    lines.push('─'.repeat(40))
    for (const cmd of builtin) {
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : ''
      lines.push(`  /${cmd.name}${aliases}`)
      lines.push(`    ${cmd.description}`)
    }
    lines.push('')
  }

  // 技能命令
  if (skill.length > 0) {
    lines.push(`${LAYER_ICONS.skill} AI 技能 (Skills)`)
    lines.push('─'.repeat(40))
    for (const cmd of skill) {
      lines.push(`  /${cmd.name}`)
      lines.push(`    ${cmd.description}`)
    }
    lines.push('')
  }

  // 外部命令
  if (external.length > 0) {
    lines.push(`${LAYER_ICONS.external} 外部命令 (Justfile)`)
    lines.push('─'.repeat(40))
    for (const cmd of external) {
      const source = cmd.source === 'global-justfile' ? '[全局]' : '[项目]'
      lines.push(`  /${cmd.name} ${source}`)
      lines.push(`    ${cmd.description}`)
    }
    lines.push('')
  }

  if (lines.length === 0) {
    lines.push('没有可用的命令')
  }

  return lines.join('\n')
}

/**
 * 格式化单个命令的详细信息
 */
function formatCommandDetail(cmd: UnifiedCommand): string {
  const lines: string[] = []

  lines.push(`${LAYER_ICONS[cmd.layer]} /${cmd.name}`)
  lines.push('─'.repeat(40))
  lines.push(`描述: ${cmd.description}`)
  lines.push(`层级: ${cmd.layer}`)
  lines.push(`执行模式: ${cmd.executionMode}`)
  lines.push(`来源: ${cmd.source}`)

  if (cmd.aliases?.length) {
    lines.push(`别名: ${cmd.aliases.join(', ')}`)
  }

  if (cmd.parameters.length > 0) {
    lines.push('')
    lines.push('参数:')
    for (const param of cmd.parameters) {
      const required = param.required ? '(必需)' : '(可选)'
      const defaultVal = param.defaultValue ? ` [默认: ${param.defaultValue}]` : ''
      lines.push(`  ${param.name} ${required}${defaultVal}`)
      if (param.description) {
        lines.push(`    ${param.description}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * /help 命令定义
 */
export const helpCommand: BuiltinCommandDefinition = {
  name: 'help',
  description: '显示所有可用命令（按层分组）',
  aliases: ['h', '?'],
  parameters: [
    {
      name: 'command',
      description: '要查看详情的命令名称',
      required: false,
    },
  ],
  handler: (args, _namedArgs, context): ExecutionResult => {
    const startTime = Date.now()

    // 获取注册表
    const registry = context.getRegistry?.()
    if (!registry) {
      return {
        success: false,
        output: '',
        error: '无法获取命令注册表',
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }

    const commands = registry.getAll()

    // 如果指定了命令名，显示详细信息
    if (args.length > 0) {
      const cmdName = args[0].replace(/^\//, '') // 移除可能的 / 前缀
      const cmd = commands.find(
        (c) => c.name === cmdName || c.aliases?.includes(cmdName)
      )

      if (cmd) {
        return {
          success: true,
          output: formatCommandDetail(cmd),
          duration: Date.now() - startTime,
          layer: 'builtin',
        }
      } else {
        return {
          success: false,
          output: '',
          error: `未找到命令: ${cmdName}`,
          duration: Date.now() - startTime,
          layer: 'builtin',
        }
      }
    }

    // 显示所有命令
    return {
      success: true,
      output: formatCommandList(commands),
      duration: Date.now() - startTime,
      layer: 'builtin',
    }
  },
}
