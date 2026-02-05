/**
 * ToolPanel 组件
 *
 * 可折叠的工具调用面板，显示：
 * - 工具名称和图标
 * - 输入摘要
 * - 执行状态和结果
 * - 展开时显示完整内容
 *
 * 需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import React from 'react'
import { Box, Text } from 'ink'
import type { ToolPanelProps } from '../types.js'
import {
  getToolColor,
  getToolIcon,
  getStatusIcon,
  getStatusColor,
} from '../utils/colors.js'
import {
  formatToolInput,
  getToolDuration,
} from '../utils/format.js'

/**
 * ToolPanel 组件
 *
 * 显示工具调用信息，支持折叠/展开。
 *
 * @param props ToolPanelProps
 */
export function ToolPanel({
  tool,
  isExpanded,
  onToggle: _onToggle,
}: ToolPanelProps): React.ReactElement {
  const toolColor = getToolColor(tool.name)
  const toolIcon = getToolIcon(tool.name)
  const statusIcon = getStatusIcon(tool.status)
  const statusColor = getStatusColor(tool.status)
  const inputSummary = formatToolInput(tool.name, tool.input, { maxLength: 50 })
  const duration = getToolDuration(tool)

  // 折叠状态的摘要行
  const renderSummary = () => (
    <Box flexDirection="row" gap={1}>
      {/* 展开/折叠指示器 */}
      <Text color="gray">{isExpanded ? '▼' : '▶'}</Text>

      {/* 工具图标和名称 */}
      <Text color={toolColor}>
        {toolIcon} {tool.displayName}
      </Text>

      {/* 输入摘要 */}
      <Text color="gray">{inputSummary}</Text>

      {/* 状态指示器 */}
      {(tool.status === 'completed' || tool.status === 'error') && (
        <Text color={statusColor}>{statusIcon}</Text>
      )}

      {/* 执行时间 */}
      {duration && (
        <Text color="gray" dimColor>
          ({duration})
        </Text>
      )}
    </Box>
  )

  // 展开状态的详细内容
  const renderDetails = () => {
    if (!isExpanded) return null

    return (
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        {/* 输入参数 */}
        <Box flexDirection="column">
          <Text color="cyan" bold>
            输入:
          </Text>
          <Box marginLeft={2}>
            <Text color="gray">
              {JSON.stringify(tool.input, null, 2)}
            </Text>
          </Box>
        </Box>

        {/* 输出结果 */}
        {tool.output && (
          <Box flexDirection="column" marginTop={1}>
            <Text color={tool.isError ? 'red' : 'green'} bold>
              {tool.isError ? '错误:' : '输出:'}
            </Text>
            <Box marginLeft={2}>
              <Text color={tool.isError ? 'red' : 'gray'}>
                {tool.output}
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {/* 可点击的摘要行 */}
      <Box>
        {renderSummary()}
      </Box>

      {/* 展开的详细内容 */}
      {renderDetails()}
    </Box>
  )
}

/**
 * 获取工具面板的折叠摘要文本（用于测试）
 */
export function getToolPanelSummary(tool: ToolPanelProps['tool']): string {
  const toolIcon = getToolIcon(tool.name)
  const inputSummary = formatToolInput(tool.name, tool.input, { maxLength: 50 })
  const statusIcon = getStatusIcon(tool.status)
  const duration = getToolDuration(tool)

  let summary = `${toolIcon} ${tool.displayName} ${inputSummary}`

  if (tool.status === 'completed' || tool.status === 'error') {
    summary += ` ${statusIcon}`
  }

  if (duration) {
    summary += ` (${duration})`
  }

  return summary
}
