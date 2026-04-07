/**
 * AIMessage 组件
 *
 * 显示 AI 消息，包括：
 * - AI 标题（含模型名）
 * - Extended Thinking 内联展示（CC 风格）
 * - 消息内容（支持流式显示）
 *
 * 需求: 5.2, 5.3, 5.5
 */

import React, { memo } from 'react'
import { Box, Text } from '../../cc-ink/index.js'
import { Spinner } from '@inkjs/ui'
import type { AIMessageProps } from '../types.js'

/** 流式输出时显示的最大行数 */
const STREAMING_MAX_LINES = 30

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
 * 内联 Thinking 展示（CC 风格）
 *
 * - 思考中：显示 "🤔 思考中..." + spinner
 * - 思考完成：折叠为 "💭 思考了 N 行"，可通过 isExpanded 展开
 */
function ThinkingInline({ thinking, isThinking }: { thinking: string; isThinking: boolean }): React.ReactElement | null {
  if (!thinking && !isThinking) return null

  const lines = thinking ? thinking.split('\n') : []
  const lineCount = lines.length

  // 正在思考中：实时动态显示最后几行
  if (isThinking) {
    const preview = lines.length > 3 ? lines.slice(-3) : lines
    return (
      <Box flexDirection="column" marginLeft={2} marginY={0}>
        <Box flexDirection="row" gap={1}>
          <Text color="magenta">🤔 思考中</Text>
          <Spinner />
          {lineCount > 0 && <Text color="gray" dimColor>({lineCount} 行)</Text>}
        </Box>
        {preview.length > 0 && (
          <Box marginLeft={2}>
            <Text color="gray" dimColor wrap="wrap">
              {preview.join('\n')}
            </Text>
          </Box>
        )}
      </Box>
    )
  }

  // 思考完成：折叠显示摘要
  const previewLines = lines.slice(0, 3)
  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={1}>
      <Text color="magenta" dimColor>💭 思考了 {lineCount} 行</Text>
      <Box marginLeft={2}>
        <Text color="gray" dimColor wrap="wrap">
          {previewLines.join('\n')}{lineCount > 3 ? '\n...' : ''}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * AIMessage 组件
 *
 * 显示 AI 消息，支持流式输出和内联 thinking 展示。
 * 流式输出时只显示最后几行，减少屏幕闪烁。
 *
 * @param props AIMessageProps
 */
export const AIMessage = memo(function AIMessage({
  content,
  model,
  isStreaming,
  thinking,
  isThinking,
}: AIMessageProps): React.ReactElement {
  const header = getAIHeader(model)

  // 流式阶段限制行数（终端滚动优化），完成后不截断（CC 风格）
  const displayContent = React.useMemo(() => {
    if (!content) return { text: '', truncatedHint: '' }

    if (isStreaming) {
      const { lines, truncated } = getLastLines(content, STREAMING_MAX_LINES)
      return {
        text: lines.join('\n'),
        truncatedHint: truncated > 0 ? `... (${truncated} 行已隐藏，完成后显示全文)` : '',
      }
    }

    // 完成后：显示全文，不截断
    return { text: content, truncatedHint: '' }
  }, [content, isStreaming])

  return (
    <Box flexDirection="column" marginY={1}>
      {/* AI 标题 */}
      <Box flexDirection="row" gap={1}>
        <Text color="cyan" bold>
          {header}
        </Text>
        {isStreaming && !isThinking && <Spinner />}
      </Box>

      {/* 内联 Thinking 展示 */}
      <ThinkingInline thinking={thinking || ''} isThinking={isThinking || false} />

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
