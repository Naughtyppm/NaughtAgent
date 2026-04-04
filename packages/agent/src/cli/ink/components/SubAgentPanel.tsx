/**
 * SubAgentPanel 组件
 *
 * 显示子 Agent 的执行状态。
 * multi_agent 模式有专门的讨论窗口布局，实时显示每个 Agent 的发言内容。
 * 其他模式显示工具调用列表、进度条等。
 */

import React from 'react'
import { Box, Text } from '../../cc-ink/index.js'
import { Spinner } from '@inkjs/ui'
import type { SubAgentState, SubAgentToolCall } from '../types.js'
import { getToolColor, getToolIcon } from '../utils/colors.js'
import { truncateString } from '../utils/format.js'

interface SubAgentPanelProps {
  subAgent: SubAgentState
  isExpanded?: boolean
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return formatTime(Math.floor(ms / 1000))
}

function renderProgressBar(current: number, total: number, width: number): string {
  const ratio = Math.min(current / total, 1)
  const filled = Math.round(ratio * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function formatToolSummary(tool: SubAgentToolCall): string {
  const input = tool.input as Record<string, unknown>
  if (input.filePath) return String(input.filePath)
  if (input.file_path) return String(input.file_path)
  if (input.command) return String(input.command).slice(0, 30)
  if (input.pattern) return String(input.pattern)
  if (input.prompt) return String(input.prompt).slice(0, 30)
  return JSON.stringify(input).slice(0, 30)
}

function getModeDisplayName(mode: string): string {
  const modeNames: Record<string, string> = {
    run_agent: '独立代理',
    fork_agent: '分叉代理',
    parallel_agents: '融合并行',
    multi_agent: '多角色讨论',
    run_workflow: '工作流',
    ask_llm: 'LLM 查询',
  }
  return modeNames[mode] || mode
}

/** Agent 名称对应的颜色（循环分配） */
const AGENT_COLORS = ['magenta', 'cyan', 'yellow', 'green', 'blue'] as const
function getAgentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

/**
 * 讨论窗口 — multi_agent 专用
 * 实时显示每个 Agent 的发言内容
 */
function DiscussionView({ subAgent }: { subAgent: SubAgentState }): React.ReactElement {
  const isRunning = subAgent.status === 'running'
  const children = subAgent.children || []

  // 构建 Agent 名称到颜色的映射
  const agentColorMap = new Map<string, string>()
  const seenAgents: string[] = []
  for (const child of children) {
    if (!agentColorMap.has(child.name)) {
      agentColorMap.set(child.name, getAgentColor(seenAgents.length))
      seenAgents.push(child.name)
    }
  }

  const elapsedTime = subAgent.endTime
    ? Math.floor((subAgent.endTime - subAgent.startTime) / 1000)
    : Math.floor((Date.now() - subAgent.startTime) / 1000)

  // 统计
  const completed = children.filter(c => c.status === 'completed').length

  // 运行中：极简模式 — 只显示头部 + 最新一条发言摘要
  // 完成后：显示最近几条发言的摘要
  const lastChild = children.length > 0 ? children[children.length - 1] : null

  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      borderStyle="round"
      borderColor={isRunning ? 'cyan' : subAgent.status === 'completed' ? 'green' : 'red'}
      paddingX={1}
    >
      {/* 头部 */}
      <Box gap={1}>
        <Text color="magenta">💬</Text>
        <Text color="magenta" bold>多角色讨论</Text>
        {isRunning && <Spinner />}
        {subAgent.status === 'completed' && <Text color="green">✓</Text>}
        {subAgent.status === 'error' && <Text color="red">✗</Text>}
        <Text color="yellow">{formatTime(elapsedTime)}</Text>
        <Text color="gray" dimColor>
          {completed}/{children.length} 发言
        </Text>
      </Box>

      {/* 主题 */}
      <Box marginLeft={2}>
        <Text color="gray" dimColor>
          主题: {truncateString(subAgent.prompt, 60)}
        </Text>
      </Box>

      {/* 进度条 */}
      <Box marginLeft={2} gap={1}>
        <Text color="yellow">
          {subAgent.currentStep}/{subAgent.maxSteps}
        </Text>
        <Text color="gray">
          [{renderProgressBar(subAgent.currentStep, subAgent.maxSteps, 15)}]
        </Text>
      </Box>

      {isRunning ? (
        /* 运行中：只显示最新一条发言的单行摘要，极低渲染量 */
        lastChild && (
          <Box marginLeft={2} marginTop={1} gap={1}>
            <Text color={agentColorMap.get(lastChild.name) || 'white' as any} bold>
              {lastChild.status === 'running' ? '◆' : '●'} {lastChild.name}:
            </Text>
            <Text color="gray">
              {lastChild.output ? truncateString(lastChild.output.split('\n')[0], 60) : '思考中...'}
            </Text>
          </Box>
        )
      ) : (
        /* 完成后：显示所有发言，每条一行摘要 */
        children.length > 0 && (
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            {children.map((child) => {
              const color = agentColorMap.get(child.name) || 'white'
              const firstLine = child.output
                ? child.output.split('\n')[0]
                : ''
              const preview = firstLine.length > 70
                ? firstLine.substring(0, 70) + '…'
                : firstLine
              return (
                <Box key={child.id} marginLeft={1} gap={1}>
                  <Text color={color as any} bold>● {child.name}:</Text>
                  <Text color="gray">{preview}</Text>
                </Box>
              )
            })}
          </Box>
        )
      )}

      {/* Token 使用（完成后显示） */}
      {!isRunning && subAgent.usage && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="gray" dimColor>
            Token: {subAgent.usage.inputTokens.toLocaleString()} in / {subAgent.usage.outputTokens.toLocaleString()} out
          </Text>
        </Box>
      )}
    </Box>
  )
}

/**
 * 通用 Agent 面板 — run_agent, fork_agent, parallel_agents 等
 */
function GenericAgentView({ subAgent, isExpanded }: SubAgentPanelProps): React.ReactElement {
  const isRunning = subAgent.status === 'running'
  const elapsedTime = subAgent.endTime
    ? Math.floor((subAgent.endTime - subAgent.startTime) / 1000)
    : Math.floor((Date.now() - subAgent.startTime) / 1000)
  const recentTools = subAgent.tools.slice(-3)
  const childStats = subAgent.children && subAgent.children.length > 0
    ? {
        total: subAgent.children.length,
        completed: subAgent.children.filter(c => c.status === 'completed').length,
        error: subAgent.children.filter(c => c.status === 'error').length,
        running: subAgent.children.filter(c => c.status === 'running').length,
      }
    : null

  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      borderStyle="round"
      borderColor={isRunning ? 'cyan' : subAgent.status === 'completed' ? 'green' : 'red'}
      paddingX={1}
    >
      {/* 头部 */}
      <Box gap={1}>
        <Text color="cyan">🤖</Text>
        <Text color="cyan" bold>子 Agent</Text>
        <Text color="gray">({getModeDisplayName(subAgent.mode || 'run_agent')})</Text>
        {subAgent.agentType && <Text color="gray">· {subAgent.agentType}</Text>}
        {isRunning && <Spinner />}
        {subAgent.status === 'completed' && <Text color="green">✓</Text>}
        {subAgent.status === 'error' && <Text color="red">✗</Text>}
        <Text color="yellow">{formatTime(elapsedTime)}</Text>
        {subAgent.retryCount !== undefined && subAgent.retryCount > 0 && (
          <Text color="yellow">🔄 重试 {subAgent.retryCount}</Text>
        )}
      </Box>

      {/* 任务描述 */}
      <Box marginLeft={2}>
        <Text color="gray" dimColor>
          任务: {truncateString(subAgent.prompt, 50)}
        </Text>
      </Box>

      {/* 进度条 */}
      <Box marginLeft={2} gap={1}>
        <Text color="yellow">
          步骤 {subAgent.currentStep}/{subAgent.maxSteps}
        </Text>
        <Text color="gray">
          [{renderProgressBar(subAgent.currentStep, subAgent.maxSteps, 15)}]
        </Text>
      </Box>

      {/* 配置信息 */}
      {subAgent.config && (subAgent.config.timeout || subAgent.config.maxTurns) && (
        <Box marginLeft={2} gap={1}>
          <Text color="gray" dimColor>⚙️ 配置:</Text>
          {subAgent.config.maxTurns !== undefined && (
            <Text color="gray" dimColor>最大轮数 {subAgent.config.maxTurns}</Text>
          )}
          {subAgent.config.timeout !== undefined && (
            <Text color="gray" dimColor>超时 {formatMs(subAgent.config.timeout)}</Text>
          )}
        </Box>
      )}

      {/* 工具调用列表 */}
      {recentTools.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text color="gray" dimColor>最近操作:</Text>
          {recentTools.map((tool) => (
            <Box key={tool.id} marginLeft={2} gap={1}>
              <Text color={getToolColor(tool.name as any)}>{getToolIcon(tool.name as any)}</Text>
              <Text color="white">{tool.displayName || tool.name}</Text>
              <Text color="gray">{truncateString(formatToolSummary(tool), 35)}</Text>
              {tool.status === 'pending' && <Spinner />}
              {tool.status === 'completed' && <Text color="green">✓</Text>}
              {tool.status === 'error' && <Text color="red">✗</Text>}
              {tool.duration !== undefined && (
                <Text color="gray" dimColor>({Math.round(tool.duration / 1000)}s)</Text>
              )}
            </Box>
          ))}
          {subAgent.tools.length > 3 && (
            <Box marginLeft={2}>
              <Text color="gray" dimColor>... 还有 {subAgent.tools.length - 3} 个操作</Text>
            </Box>
          )}
        </Box>
      )}

      {/* 子任务列表（parallel_agents） */}
      {subAgent.children && subAgent.children.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          {childStats && (
            <Box gap={1}>
              <Text color="gray" dimColor>子任务:</Text>
              <Text color="gray" dimColor>{childStats.total} 个</Text>
              {childStats.completed > 0 && <Text color="green">✓{childStats.completed}</Text>}
              {childStats.running > 0 && <Text color="cyan">◐{childStats.running}</Text>}
              {childStats.error > 0 && <Text color="red">✗{childStats.error}</Text>}
            </Box>
          )}
          {subAgent.children.map((child) => (
            <Box key={child.id} marginLeft={2} gap={1}>
              <Text color={child.status === 'completed' ? 'green' : child.status === 'error' ? 'red' : 'magenta'}>
                {child.status === 'completed' ? '✓' : child.status === 'error' ? '✗' : '◆'}
              </Text>
              <Text color="white">{child.name}</Text>
              {child.status === 'running' && <Spinner />}
              {child.error && (
                <Text color="red" dimColor>{truncateString(child.error, 30)}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* 展开时显示输出预览 */}
      {isExpanded && subAgent.text && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text color="gray" dimColor>输出预览:</Text>
          <Box marginLeft={2}>
            <Text color="white">{truncateString(subAgent.text, 300)}</Text>
          </Box>
        </Box>
      )}

      {/* Token 使用 */}
      {!isRunning && subAgent.usage && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="gray" dimColor>
            Token: {subAgent.usage.inputTokens.toLocaleString()} in / {subAgent.usage.outputTokens.toLocaleString()} out
          </Text>
        </Box>
      )}
    </Box>
  )
}

/**
 * SubAgentPanel 入口 — 根据模式选择不同的展示布局
 */
export const SubAgentPanel = React.memo(function SubAgentPanel(props: SubAgentPanelProps): React.ReactElement {
  if (props.subAgent.mode === 'multi_agent') {
    return <DiscussionView subAgent={props.subAgent} />
  }
  return <GenericAgentView {...props} />
})
