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

import React, { memo } from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'
import type { AIMessageProps } from '../types.js'

/** 流式输出时显示的最大行数 */
const STREAMING_MAX_LINES = 5

/** 完成后显示的最大行数 — 超出部分折叠，防止大段内容导致 Ink 重绘抽搐 */
const COMPLETED_MAX_LINES = 15

/**
 * 生成 AI 消息标题
 */
function getAIHeader(model: string): string {
  // 提取模型简称
  const shortName = model.split('-').slice(0, 2).join('-')
  return `═══ ${shortName} ═══`
}

/**
 * 截取内容的最后 N 行（用于流式输出时减少闪烁）
 */
function getLastLines(content: string, maxLines: number): { lines: string[]; truncated: number } {
  const allLines = content.split('\n')
  if (allLines.length <= maxLines) {
    return { lines: allLines, truncated: 0 }
  }
  return {
    lines: allLines.slice(-maxLines),
    truncated: allLines.length - maxLines,
  }
}

/**
 * AIMessage 组件
 *
 * 显示 AI 消息，支持流式输出和 Markdown 渲染。
 * 流式输出时只显示最后几行，减少屏幕闪烁。
 *
 * @param props AIMessageProps
 */
export const AIMessage = memo(function AIMessage({
  content,
  model,
  isStreaming,
}: AIMessageProps): React.ReactElement {
  const header = getAIHeader(model)

  // 流式和完成后都限制行数，防止大段内容导致终端抽搐
  const displayContent = React.useMemo(() => {
    if (!content) return { text: '', truncatedHint: '' }
    
    if (isStreaming) {
      const { lines, truncated } = getLastLines(content, STREAMING_MAX_LINES)
      return {
        text: lines.join('\n'),
        truncatedHint: truncated > 0 ? `... (${truncated} 行已隐藏，完成后显示摘要)` : '',
      }
    }
    
    // 完成后也截断，只显示最后 N 行
    const allLines = content.split('\n')
    if (allLines.length <= COMPLETED_MAX_LINES) {
      return { text: content, truncatedHint: '' }
    }
    const displayed = allLines.slice(-COMPLETED_MAX_LINES)
    const hidden = allLines.length - COMPLETED_MAX_LINES
    return {
      text: displayed.join('\n'),
      truncatedHint: `... (前 ${hidden} 行已折叠)`,
    }
  }, [content, isStreaming])

  return (
    <Box flexDirection="column" marginY={1}>
      {/* AI 标题 */}
      <Box flexDirection="row" gap={1}>
        <Text color="cyan" bold>
          {header}
        </Text>
        {isStreaming && <Spinner />}
      </Box>

      {/* 截断提示 */}
      {displayContent.truncatedHint && (
        <Box marginLeft={2}>
          <Text color="gray" dimColor>
            {displayContent.truncatedHint}
          </Text>
        </Box>
      )}

      {/* 消息内容 */}
      <Box marginLeft={2} marginTop={1}>
        <Text>{displayContent.text || (isStreaming ? '' : '(无内容)')}</Text>
      </Box>
    </Box>
  )
})

/**
 * 导出标题生成函数（用于测试）
 */
export { getAIHeader }
