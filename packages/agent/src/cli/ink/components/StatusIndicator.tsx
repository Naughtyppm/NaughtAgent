/**
 * StatusIndicator 组件
 *
 * 显示当前执行状态的指示器，包括：
 * - idle: 无可见指示器
 * - thinking: 带有"思考中..."文本的 spinner
 * - executing: 带有工具名称和描述的 spinner
 * - waiting: 带有等待消息的 spinner
 *
 * 需求: 4.1, 4.2, 4.3, 4.4
 */

import React from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'
import type { StatusIndicatorProps, StatusType } from '../types.js'

/**
 * 获取状态对应的显示文本
 */
function getStatusText(status: StatusType, message?: string): string {
  switch (status) {
    case 'idle':
      return ''
    case 'thinking':
      return message || '思考中...'
    case 'executing':
      return message || '执行中...'
    case 'waiting':
      return message || '等待中...'
  }
}

/**
 * 获取状态对应的颜色
 */
function getStatusColor(status: StatusType): string {
  switch (status) {
    case 'idle':
      return 'gray'
    case 'thinking':
      return 'cyan'
    case 'executing':
      return 'yellow'
    case 'waiting':
      return 'blue'
  }
}

/**
 * StatusIndicator 组件
 *
 * 根据状态显示不同的指示器：
 * - idle: 不显示任何内容
 * - thinking/executing/waiting: 显示 spinner 和状态文本
 *
 * @param props StatusIndicatorProps
 */
export function StatusIndicator({
  status,
  message,
  detail,
}: StatusIndicatorProps): React.ReactElement | null {
  // idle 状态不显示任何内容
  if (status === 'idle') {
    return null
  }

  const statusText = getStatusText(status, message)
  const color = getStatusColor(status)

  return (
    <Box flexDirection="row" gap={1}>
      <Spinner />
      <Text color={color}>{statusText}</Text>
      {detail && (
        <Text color="gray" dimColor>
          {detail}
        </Text>
      )}
    </Box>
  )
}

/**
 * 导出状态文本获取函数（用于测试）
 */
export { getStatusText, getStatusColor }
