/**
 * StatusIndicator 组件
 *
 * 显示当前执行状态的指示器，包括：
 * - idle: 无可见指示器
 * - thinking: 带有"思考中..."文本的 spinner
 * - executing: 带有工具名称和描述的 spinner
 * - waiting: 带有等待消息的 spinner
 * - 步骤计数 (e.g., "Step 1/5")
 * - Token 使用量显示
 * - 多子 Agent 摘要显示 (Requirements 5.4)
 *
 * 需求: 4.1, 4.2, 4.3, 4.4, 5.4
 */

import React from 'react'
import { Box, Text } from '../../cc-ink/index.js'
import type { StatusIndicatorProps, StatusType, ActiveSubAgentSummary } from '../types.js'

/**
 * 思考状态的动态提示词
 */
const THINKING_HINTS = [
  '分析问题...',
  '理解需求...',
  '规划方案...',
  '组织思路...',
  '准备响应...',
]

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
 * 获取状态图标
 */
function getStatusIcon(status: StatusType): string {
  switch (status) {
    case 'idle':
      return ''
    case 'thinking':
      return '🤔'
    case 'executing':
      return '⚡'
    case 'waiting':
      return '⏳'
  }
}

/**
 * 格式化 Token 数量（简化显示）
 */
function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`
  return `${Math.round(tokens / 1000)}k`
}

/**
 * 获取子 Agent 模式的简短显示名称
 */
function getModeShortName(mode: string): string {
  const modeNames: Record<string, string> = {
    run_agent: '独立',
    fork_agent: '分叉',
    parallel_agents: '并行',
    multi_agent: '多角色',
    run_workflow: '工作流',
    ask_llm: 'LLM',
  }
  return modeNames[mode] || mode
}

/**
 * 获取子 Agent 状态图标
 */
function getSubAgentStatusIcon(status: string): string {
  switch (status) {
    case 'running':
      return '◐'
    case 'completed':
      return '✓'
    case 'error':
      return '✗'
    default:
      return '○'
  }
}

/**
 * 获取子 Agent 状态颜色
 */
function getSubAgentStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'cyan'
    case 'completed':
      return 'green'
    case 'error':
      return 'red'
    default:
      return 'gray'
  }
}

/**
 * SubAgentSummary 子组件
 *
 * 当多个子 Agent 活跃时，显示紧凑的摘要信息
 * Requirements 5.4: 显示所有活跃子 Agent 的摘要
 */
function SubAgentSummary({ agents }: { agents: ActiveSubAgentSummary[] }): React.ReactElement | null {
  if (agents.length === 0) return null

  // 统计各状态数量
  const running = agents.filter(a => a.status === 'running').length
  const completed = agents.filter(a => a.status === 'completed').length
  const errored = agents.filter(a => a.status === 'error').length

  return (
    <Box flexDirection="column" marginLeft={2}>
      {/* 摘要行：总数 + 各状态统计 */}
      <Box gap={1}>
        <Text color="cyan">🤖</Text>
        <Text color="cyan" bold>子 Agent</Text>
        <Text color="gray">×{agents.length}</Text>
        {running > 0 && <Text color="cyan">◐{running}</Text>}
        {completed > 0 && <Text color="green">✓{completed}</Text>}
        {errored > 0 && <Text color="red">✗{errored}</Text>}
      </Box>
      {/* 每个活跃子 Agent 的状态 + 细节 */}
      {agents.map((agent) => {
        const isDiscussion = agent.mode === 'multi_agent'
        const children = agent.children || []
        const childCompleted = children.filter(c => c.status === 'completed').length

        // 讨论模式：显示最近 3 条发言
        const recentChildren = isDiscussion ? children.slice(-3) : []

        return (
          <Box key={agent.id} flexDirection="column" marginLeft={2}>
            {/* 基本信息行 */}
            <Box gap={1}>
              <Text color={getSubAgentStatusColor(agent.status)}>
                {getSubAgentStatusIcon(agent.status)}
              </Text>
              <Text color="gray">{getModeShortName(agent.mode)}</Text>
              {agent.agentType && <Text color="gray" dimColor>· {agent.agentType}</Text>}
              <Text color="yellow">{agent.currentStep}/{agent.maxSteps}</Text>
              {children.length > 0 && (
                <Text color="gray" dimColor>({childCompleted}/{children.length} 发言)</Text>
              )}
            </Box>
            {/* 讨论模式：显示最近几条发言内容 */}
            {isDiscussion && recentChildren.length > 0 && (
              <Box flexDirection="column" marginLeft={3}>
                {children.length > 3 && (
                  <Text color="gray" dimColor>... ({children.length - 3} 条更早发言)</Text>
                )}
                {recentChildren.map((child) => {
                  // 折叠模式：只显示第一行，最多 60 字符
                  const firstLine = child.output
                    ? child.output.split('\n')[0]
                    : ''
                  const preview = firstLine.length > 60
                    ? firstLine.substring(0, 60) + '…'
                    : firstLine
                  return (
                    <Box key={child.id} gap={1}>
                      <Text color="magenta" bold>
                        {child.status === 'running' ? '◆' : '●'} {child.name}:
                      </Text>
                      <Text color="gray">
                        {child.status === 'running' && !child.output
                          ? '发言中...'
                          : preview}
                      </Text>
                    </Box>
                  )
                })}
              </Box>
            )}
            {/* 非讨论模式：显示最近工具 */}
            {!isDiscussion && agent.lastToolName && (
              <Box marginLeft={3} gap={1}>
                <Text color="gray" dimColor>└</Text>
                <Text color="white">{agent.lastToolName}</Text>
                {agent.lastToolStatus === 'pending' && <Text color="yellow">◐</Text>}
                {agent.lastToolStatus === 'completed' && <Text color="green">✓</Text>}
                {agent.lastToolStatus === 'error' && <Text color="red">✗</Text>}
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

/**
 * StatusIndicator 组件
 *
 * 根据状态显示不同的指示器：
 * - idle: 不显示任何内容
 * - thinking/executing/waiting: 显示 spinner 和状态文本
 * - 可选显示步骤计数和 Token 使用量
 * - 当有多个活跃子 Agent 时，显示摘要 (Requirements 5.4)
 *
 * @param props StatusIndicatorProps
 */
export function StatusIndicator({
  status,
  message,
  detail,
  stepCurrent,
  stepTotal,
  tokenUsage,
  activeSubAgents,
}: StatusIndicatorProps): React.ReactElement | null {
  // idle 状态不显示任何内容（除非有活跃子 Agent）
  const hasActiveSubAgents = activeSubAgents && activeSubAgents.length > 0
  if (status === 'idle' && !hasActiveSubAgents) {
    return null
  }

  const statusText = getStatusText(status, message)
  const color = getStatusColor(status)
  const icon = getStatusIcon(status)

  // 构建步骤显示
  const stepDisplay = stepCurrent !== undefined && stepTotal !== undefined
    ? `[${stepCurrent}/${stepTotal}]`
    : stepCurrent !== undefined
    ? `[步骤 ${stepCurrent}]`
    : null

  // 构建 Token 显示
  const tokenDisplay = tokenUsage
    ? `📊 ${formatTokenCount(tokenUsage.input)}↓ ${formatTokenCount(tokenUsage.output)}↑`
      + (tokenUsage.cacheRead || tokenUsage.cacheCreation
        ? ` | Cache: ${formatTokenCount(tokenUsage.cacheRead || 0)}命中 ${formatTokenCount(tokenUsage.cacheCreation || 0)}写入`
        : '')
    : null

  return (
    <Box flexDirection="column" marginY={1}>
      {/* 分割线 */}
      <Box>
        <Text color="gray" dimColor>{'─'.repeat(50)}</Text>
      </Box>
      
      {/* 状态行（仅在非 idle 时显示） */}
      {status !== 'idle' && (
        <Box flexDirection="row" gap={1} marginTop={1}>
          <Text>{icon}</Text>
          <Text color={color}>▸</Text>
          <Text color={color} bold>{statusText}</Text>
          {detail && (
            <Text color="gray">
              → {detail}
            </Text>
          )}
          {/* 步骤计数 */}
          {stepDisplay && (
            <Text color="cyan">{stepDisplay}</Text>
          )}
        </Box>
      )}

      {/* Token 使用量（单独一行，更清晰） */}
      {tokenDisplay && (
        <Box marginTop={0} marginLeft={4}>
          <Text color="gray" dimColor>{tokenDisplay}</Text>
        </Box>
      )}

      {/* 多子 Agent 摘要 — Requirements 5.4 */}
      {hasActiveSubAgents && (
        <SubAgentSummary agents={activeSubAgents!} />
      )}
    </Box>
  )
}

/**
 * 导出状态文本获取函数（用于测试）
 */
export { getStatusText, getStatusColor, THINKING_HINTS, getModeShortName, getSubAgentStatusIcon, getSubAgentStatusColor }
