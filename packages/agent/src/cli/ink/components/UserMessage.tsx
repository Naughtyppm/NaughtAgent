/**
 * UserMessage 组件
 *
 * 显示用户消息，包括：
 * - 用户标题（═══ Me ═══）
 * - 消息内容
 *
 * 需求: 5.1
 */

import React from 'react'
import { Box, Text } from '../../cc-ink/index.js'
import type { UserMessageProps } from '../types.js'

/**
 * 用户消息标题
 */
const USER_HEADER = '═══ Me ═══'

/**
 * UserMessage 组件
 *
 * 显示用户消息，带有独特的标题样式。
 *
 * @param props UserMessageProps
 */
export function UserMessage({ content }: UserMessageProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginY={1}>
      {/* 用户标题 */}
      <Text color="green" bold>
        {USER_HEADER}
      </Text>

      {/* 消息内容 */}
      <Box marginLeft={2} marginTop={1}>
        <Text>{content}</Text>
      </Box>
    </Box>
  )
}

/**
 * 导出标题常量（用于测试）
 */
export { USER_HEADER }
