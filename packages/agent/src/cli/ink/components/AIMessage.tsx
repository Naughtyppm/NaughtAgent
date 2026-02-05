/**
 * AIMessage 组件
 *
 * 显示 AI 消息，包括：
 * - AI 标题（含模型名）
 * - 消息内容（支持流式显示）
 * - Markdown 渲染
 *
 * 需求: 5.2, 5.3, 5.5
 */

import React from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'
import type { AIMessageProps } from '../types.js'

/**
 * 生成 AI 消息标题
 */
function getAIHeader(model: string): string {
  // 提取模型简称
  const shortName = model.split('-').slice(0, 2).join('-')
  return `═══ ${shortName} ═══`
}

/**
 * AIMessage 组件
 *
 * 显示 AI 消息，支持流式输出和 Markdown 渲染。
 *
 * @param props AIMessageProps
 */
export function AIMessage({
  content,
  model,
  isStreaming,
}: AIMessageProps): React.ReactElement {
  const header = getAIHeader(model)

  return (
    <Box flexDirection="column" marginY={1}>
      {/* AI 标题 */}
      <Box flexDirection="row" gap={1}>
        <Text color="cyan" bold>
          {header}
        </Text>
        {isStreaming && <Spinner />}
      </Box>

      {/* 消息内容 */}
      <Box marginLeft={2} marginTop={1}>
        <Text>{content || (isStreaming ? '' : '(无内容)')}</Text>
      </Box>
    </Box>
  )
}

/**
 * 导出标题生成函数（用于测试）
 */
export { getAIHeader }
