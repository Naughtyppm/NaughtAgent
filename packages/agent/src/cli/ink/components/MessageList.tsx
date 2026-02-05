/**
 * MessageList 组件
 *
 * 渲染消息列表，包括：
 * - 用户消息
 * - AI 消息
 * - 工具调用面板
 * - 系统消息
 *
 * 需求: 5.4
 */

import React from 'react'
import { Box, Text } from 'ink'
import type { MessageListProps, Message } from '../types.js'
import { UserMessage } from './UserMessage.js'
import { AIMessage } from './AIMessage.js'
import { ToolPanel } from './ToolPanel.js'

/**
 * 系统消息组件
 */
function SystemMessage({
  level,
  content,
}: {
  level: 'info' | 'warning' | 'error'
  content: string
}): React.ReactElement {
  // 使用更亮的颜色
  const colorMap = {
    info: 'cyan',      // 更亮的蓝色
    warning: 'yellowBright',  // 亮黄色
    error: 'redBright',       // 亮红色
  } as const

  const prefixMap = {
    info: '✓',
    warning: '⚠',
    error: '✗',
  } as const

  return (
    <Box marginY={1}>
      <Text color={colorMap[level]} bold>
        {prefixMap[level]} {content}
      </Text>
    </Box>
  )
}

/**
 * MessageList 组件
 *
 * 渲染消息列表，根据消息类型显示不同的组件。
 *
 * @param props MessageListProps
 */
export function MessageList({
  messages,
  expandedTools,
  onToggleTool,
}: MessageListProps): React.ReactElement {
  const renderMessage = (message: Message): React.ReactElement | null => {
    switch (message.type) {
      case 'user':
        return <UserMessage key={message.id} content={message.content} />

      case 'ai':
        return (
          <AIMessage
            key={message.id}
            content={message.content}
            model={message.model}
            isStreaming={message.isStreaming}
          />
        )

      case 'tool':
        return (
          <ToolPanel
            key={message.id}
            tool={message.tool}
            isExpanded={expandedTools.has(message.tool.id)}
            onToggle={() => onToggleTool(message.tool.id)}
          />
        )

      case 'system':
        return (
          <SystemMessage
            key={message.id}
            level={message.level}
            content={message.content}
          />
        )

      default:
        return null
    }
  }

  return (
    <Box flexDirection="column">
      {messages.map(renderMessage)}
    </Box>
  )
}
