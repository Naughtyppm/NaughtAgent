/**
 * HelpView 组件
 *
 * 帮助视图，显示所有可用命令。
 * 支持从统一命令系统获取命令列表。
 *
 * 需求: 7.3
 */

import React from 'react'
import { Box, Text } from 'ink'
import type { HelpViewProps } from '../types.js'

/**
 * 命令帮助信息
 */
interface CommandHelp {
  command: string
  description: string
  usage?: string
  layer?: 'builtin' | 'external' | 'skill'
  layerIcon?: string
}

/**
 * 内置命令列表（作为后备）
 */
const BUILTIN_COMMANDS: CommandHelp[] = [
  { command: '/help', description: '显示此帮助信息', layer: 'builtin', layerIcon: '⚡' },
  { command: '/clear', description: '清空对话历史', layer: 'builtin', layerIcon: '⚡' },
  { command: '/exit', description: '退出程序', layer: 'builtin', layerIcon: '⚡' },
  { command: '/refresh', description: '重新加载命令源', layer: 'builtin', layerIcon: '⚡' },
  { command: '/model [name]', description: '查看/切换模型', layer: 'builtin', layerIcon: '⚡' },
  { command: '/mode [mode]', description: '查看/切换权限模式', layer: 'builtin', layerIcon: '⚡' },
  { command: '/history', description: '显示命令历史', layer: 'builtin', layerIcon: '⚡' },
  { command: '/config', description: '显示当前配置', layer: 'builtin', layerIcon: '⚡' },
]

/**
 * 快捷键列表
 */
const SHORTCUTS = [
  { key: 'Escape', description: '切换到手动确认模式' },
  { key: 'Ctrl+C', description: '取消当前任务' },
  { key: 'Ctrl+O', description: '切换工具面板展开状态' },
  { key: '↑/↓', description: '浏览命令历史' },
]

/**
 * HelpView 组件
 *
 * 显示格式化的帮助信息，包含所有可用命令和快捷键。
 * 如果提供了 commands prop，则按层级分组显示。
 *
 * @param props HelpViewProps
 */
export function HelpView({ onClose, commands }: HelpViewProps): React.ReactElement {
  // 如果有统一命令列表，按层级分组
  const groupedCommands = commands
    ? {
        builtin: commands.filter(c => c.layer === 'builtin'),
        skill: commands.filter(c => c.layer === 'skill'),
        external: commands.filter(c => c.layer === 'external'),
      }
    : null

  return (
    <Box flexDirection="column" marginY={1}>
      {/* 标题 */}
      <Text color="cyan" bold>
        ═══ 帮助 ═══
      </Text>

      {/* 命令列表 - 按层级分组 */}
      {groupedCommands ? (
        <>
          {/* 内置命令 */}
          {groupedCommands.builtin.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="cyan" bold>
                ⚡ 内置命令:
              </Text>
              {groupedCommands.builtin.map((cmd) => (
                <Box key={cmd.name} marginLeft={2}>
                  <Text>
                    <Text color="green">/{cmd.name.padEnd(18)}</Text>
                    <Text color="gray">{cmd.description}</Text>
                  </Text>
                </Box>
              ))}
            </Box>
          )}

          {/* 技能命令 */}
          {groupedCommands.skill.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="magenta" bold>
                🤖 AI 技能:
              </Text>
              {groupedCommands.skill.map((cmd) => (
                <Box key={cmd.name} marginLeft={2}>
                  <Text>
                    <Text color="green">/{cmd.name.padEnd(18)}</Text>
                    <Text color="gray">{cmd.description}</Text>
                  </Text>
                </Box>
              ))}
            </Box>
          )}

          {/* 外部命令 */}
          {groupedCommands.external.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text color="yellow" bold>
                📁 外部命令 (Justfile):
              </Text>
              {groupedCommands.external.map((cmd) => (
                <Box key={cmd.name} marginLeft={2}>
                  <Text>
                    <Text color="green">/{cmd.name.padEnd(18)}</Text>
                    <Text color="gray">{cmd.description}</Text>
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </>
      ) : (
        /* 后备：使用内置命令列表 */
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>
            可用命令:
          </Text>
          {BUILTIN_COMMANDS.map((cmd) => (
            <Box key={cmd.command} marginLeft={2}>
              <Text>
                <Text color="green">{cmd.command.padEnd(20)}</Text>
                <Text color="gray">{cmd.description}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* 快捷键列表 */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow" bold>
          快捷键:
        </Text>
        {SHORTCUTS.map((shortcut) => (
          <Box key={shortcut.key} marginLeft={2}>
            <Text>
              <Text color="magenta">{shortcut.key.padEnd(20)}</Text>
              <Text color="gray">{shortcut.description}</Text>
            </Text>
          </Box>
        ))}
      </Box>

      {/* 关闭提示 */}
      {onClose && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            按任意键关闭帮助
          </Text>
        </Box>
      )}
    </Box>
  )
}

/**
 * 导出命令和快捷键列表（用于测试）
 */
export { BUILTIN_COMMANDS as COMMANDS, SHORTCUTS }
