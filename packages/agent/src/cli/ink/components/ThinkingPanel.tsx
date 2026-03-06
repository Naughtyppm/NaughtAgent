/**
 * ThinkingPanel 组件
 *
 * 显示 Extended Thinking 内容（可折叠）
 * 使用淡色样式区分于正常输出
 */

import React, { useState } from 'react'
import { Box, Text } from 'ink'

export interface ThinkingPanelProps {
  /** Thinking 内容 */
  content: string
  /** 是否正在思考中 */
  isThinking: boolean
  /** 默认是否展开 */
  defaultExpanded?: boolean
}

/**
 * ThinkingPanel 组件
 */
export function ThinkingPanel({
  content,
  isThinking,
  defaultExpanded = false,
}: ThinkingPanelProps): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // 如果没有内容，不显示
  if (!content && !isThinking) {
    return null
  }

  // 截断显示的内容（折叠时只显示前几行）
  const lines = content.split('\n')
  const previewLines = 3
  const displayContent = isExpanded
    ? content
    : lines.slice(0, previewLines).join('\n') + (lines.length > previewLines ? '\n...' : '')

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 标题栏 */}
      <Box>
        <Text color="magenta" dimColor>
          {isThinking ? '🧠 思考中...' : '🧠 思考过程'}
        </Text>
        <Text color="gray" dimColor>
          {' '}
          [{isExpanded ? '▼' : '▶'} {lines.length} 行]
        </Text>
      </Box>

      {/* 内容区域 */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="magenta"
        paddingX={1}
        dimColor
      >
        <Text color="gray" dimColor wrap="wrap">
          {displayContent || (isThinking ? '正在深度思考...' : '')}
        </Text>
      </Box>
    </Box>
  )
}
