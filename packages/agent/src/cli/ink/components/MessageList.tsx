/**
 * MessageList 组件
 *
 * 渲染消息列表，采用 "Turn 模式" 防止闪烁：
 * - 历史 turn 压缩为单行摘要（极低渲染开销）
 * - 只有当前活跃 turn 完整渲染
 *
 * 需求: 5.4
 */

import React, { memo, useMemo } from 'react'
import { Box, Text } from 'ink'
import type { MessageListProps, Message, SubAgentState } from '../types.js'
import { UserMessage } from './UserMessage.js'
import { AIMessage } from './AIMessage.js'
import { ToolPanel } from './ToolPanel.js'

/**
 * 一个 Turn = 用户消息 + 后续的 AI/工具/系统消息，直到下一个用户消息
 */
interface Turn {
  /** turn 中的第一条消息 ID，用作 key */
  id: string
  /** 用户消息内容（摘要用） */
  userContent: string
  /** turn 内所有消息 */
  messages: Message[]
  /** 工具调用数量 */
  toolCount: number
  /** 是否有错误 */
  hasError: boolean
}

/** 历史 turn 摘要中用户消息的最大显示长度 */
const SUMMARY_MAX_LENGTH = 50
/** 最多显示多少条历史 turn 摘要 */
const MAX_HISTORY_TURNS = 10

/**
 * 将消息列表切分为 Turn
 */
function splitIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = []
  let current: Message[] = []
  let userContent = ''

  for (const msg of messages) {
    if (msg.type === 'user') {
      // 遇到新的用户消息，保存之前的 turn
      if (current.length > 0) {
        turns.push(buildTurn(current, userContent))
      }
      current = [msg]
      userContent = msg.content
    } else {
      // 如果还没有用户消息开头，创建一个无用户消息的 turn
      if (current.length === 0) {
        userContent = ''
      }
      current.push(msg)
    }
  }

  // 最后一个 turn
  if (current.length > 0) {
    turns.push(buildTurn(current, userContent))
  }

  return turns
}

function buildTurn(messages: Message[], userContent: string): Turn {
  let toolCount = 0
  let hasError = false
  for (const m of messages) {
    if (m.type === 'tool') {
      toolCount++
      if (m.tool.isError) hasError = true
    }
    if (m.type === 'system' && m.level === 'error') hasError = true
  }
  return {
    id: messages[0].id,
    userContent,
    messages,
    toolCount,
    hasError,
  }
}

/**
 * 历史 Turn 摘要行 — 极轻量，只渲染一行文本
 */
const TurnSummary = memo(function TurnSummary({ turn }: { turn: Turn }): React.ReactElement {
  const preview = turn.userContent.length > SUMMARY_MAX_LENGTH
    ? turn.userContent.substring(0, SUMMARY_MAX_LENGTH) + '…'
    : turn.userContent

  // 找到 AI 回复的前 40 字符作为摘要
  let aiPreview = ''
  for (const m of turn.messages) {
    if (m.type === 'ai' && m.content) {
      const firstLine = m.content.split('\n')[0] || ''
      aiPreview = firstLine.length > 40 ? firstLine.substring(0, 40) + '…' : firstLine
      break
    }
  }

  return (
    <Box flexDirection="row" gap={1}>
      <Text color="gray" dimColor>▸</Text>
      <Text color="blueBright">{preview || '(空消息)'}</Text>
      {turn.toolCount > 0 && (
        <Text color="gray" dimColor>
          [{turn.toolCount} 工具]
        </Text>
      )}
      {turn.hasError && <Text color="red">✗</Text>}
      {aiPreview && (
        <Text color="gray" dimColor>→ {aiPreview}</Text>
      )}
    </Box>
  )
})

/**
 * 系统消息组件
 */
const SystemMessage = memo(function SystemMessage({
  level,
  content,
}: {
  level: 'info' | 'warning' | 'error'
  content: string
}): React.ReactElement {
  const colorMap = {
    info: 'cyan',
    warning: 'yellowBright',
    error: 'redBright',
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
})

/**
 * 单个消息渲染组件（memo 优化）
 */
const MessageItem = memo(function MessageItem({
  message,
  expandedTools,
  onToggleTool,
  selectedToolId,
  getSubAgentForTool,
}: {
  message: Message
  expandedTools: Set<string>
  onToggleTool: (id: string) => void
  selectedToolId: string | null
  getSubAgentForTool?: (toolId: string) => SubAgentState | undefined
}): React.ReactElement | null {
  switch (message.type) {
    case 'user':
      return <UserMessage content={message.content} />

    case 'ai':
      return (
        <AIMessage
          content={message.content}
          model={message.model}
          isStreaming={message.isStreaming}
        />
      )

    case 'tool': {
      // 获取子 Agent 状态（如果是 run_agent 工具）
      const subAgentState = getSubAgentForTool?.(message.tool.id)
      const toolWithSubAgent = subAgentState 
        ? { ...message.tool, subAgent: subAgentState }
        : message.tool
      
      return (
        <ToolPanel
          tool={toolWithSubAgent}
          isExpanded={expandedTools.has(message.tool.id)}
          onToggle={() => onToggleTool(message.tool.id)}
          isSelected={selectedToolId === message.tool.id}
        />
      )
    }

    case 'system':
      return (
        <SystemMessage
          level={message.level}
          content={message.content}
        />
      )

    default:
      return null
  }
}, (prevProps, nextProps) => {
  const prevMsg = prevProps.message
  const nextMsg = nextProps.message
  
  if (prevMsg.type !== nextMsg.type) return false
  
  if (prevMsg.type === 'ai' && nextMsg.type === 'ai') {
    return prevMsg.content === nextMsg.content && 
           prevMsg.isStreaming === nextMsg.isStreaming
  }
  
  if (prevMsg.type === 'tool' && nextMsg.type === 'tool') {
    const prevExpanded = prevProps.expandedTools.has(prevMsg.tool.id)
    const nextExpanded = nextProps.expandedTools.has(nextMsg.tool.id)
    const prevSelected = prevProps.selectedToolId === prevMsg.tool.id
    const nextSelected = nextProps.selectedToolId === nextMsg.tool.id
    const prevSubAgent = prevProps.getSubAgentForTool?.(prevMsg.tool.id)
    const nextSubAgent = nextProps.getSubAgentForTool?.(nextMsg.tool.id)
    const subAgentChanged = prevSubAgent !== nextSubAgent
    return prevExpanded === nextExpanded && 
           prevSelected === nextSelected &&
           prevMsg.tool.status === nextMsg.tool.status &&
           prevMsg.tool.output === nextMsg.tool.output &&
           !subAgentChanged
  }
  
  const prevContent = 'content' in prevMsg ? prevMsg.content : undefined
  const nextContent = 'content' in nextMsg ? nextMsg.content : undefined
  return prevContent === nextContent
})

/**
 * MessageList 组件
 *
 * 采用 Turn 模式渲染：
 * - 历史 turn → 单行摘要（几乎零渲染开销）
 * - 当前 turn → 完整渲染（用户消息 + AI + 工具面板）
 * 
 * 这样无论对话多长，Ink 每次重绘的内容量都是恒定的，
 * 从根本上解决内容多导致的闪烁问题。
 */
export const MessageList = memo(function MessageList({
  messages,
  expandedTools,
  onToggleTool,
  selectedToolId,
  getSubAgentForTool,
}: MessageListProps): React.ReactElement {
  // 将消息切分为 turns
  const turns = useMemo(() => splitIntoTurns(messages), [messages])

  // 历史 turns（压缩显示）和当前 turn（完整渲染）
  const { historyTurns, currentTurn } = useMemo(() => {
    if (turns.length === 0) {
      return { historyTurns: [] as Turn[], currentTurn: null }
    }
    const history = turns.slice(0, -1)
    const current = turns[turns.length - 1]
    return { historyTurns: history, currentTurn: current }
  }, [turns])

  // 历史 turn 摘要（限制数量）
  const visibleHistory = useMemo(() => {
    if (historyTurns.length <= MAX_HISTORY_TURNS) {
      return { turns: historyTurns, hiddenCount: 0 }
    }
    const hidden = historyTurns.length - MAX_HISTORY_TURNS
    return {
      turns: historyTurns.slice(-MAX_HISTORY_TURNS),
      hiddenCount: hidden,
    }
  }, [historyTurns])

  return (
    <Box flexDirection="column">
      {/* 隐藏的历史 turn 提示 */}
      {visibleHistory.hiddenCount > 0 && (
        <Box>
          <Text color="gray" dimColor>
            ··· {visibleHistory.hiddenCount} 轮早期对话已折叠 ···
          </Text>
        </Box>
      )}

      {/* 历史 turn 摘要 — 每个只渲染一行 */}
      {visibleHistory.turns.map((turn) => (
        <TurnSummary key={turn.id} turn={turn} />
      ))}

      {/* 历史和当前 turn 之间的分隔线 */}
      {historyTurns.length > 0 && currentTurn && (
        <Box marginY={0}>
          <Text color="gray" dimColor>
            ─────────────────────────────
          </Text>
        </Box>
      )}

      {/* 当前 turn — 完整渲染 */}
      {currentTurn && currentTurn.messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          expandedTools={expandedTools}
          onToggleTool={onToggleTool}
          selectedToolId={selectedToolId ?? null}
          getSubAgentForTool={getSubAgentForTool}
        />
      ))}
    </Box>
  )
})
