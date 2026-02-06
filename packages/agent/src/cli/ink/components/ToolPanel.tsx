/**
 * ToolPanel 组件
 *
 * 可折叠的工具调用面板，类似 Claude Code 的展示效果：
 * - 默认折叠：显示工具名 + 参数摘要 + 状态 + 耗时
 * - 展开时：显示完整输入参数和输出结果
 * - 支持快捷键切换展开/折叠
 * - 执行中显示动态进度动画和实时耗时
 * - 支持子 Agent 状态显示
 *
 * 需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import React from 'react'
import { Box, Text } from 'ink'
import type { ToolPanelProps } from '../types.js'
import {
  getToolColor,
  getToolIcon,
  getStatusIcon,
  getStatusColor,
} from '../utils/colors.js'
import {
  formatToolInput,
  getToolDuration,
  truncateString,
} from '../utils/format.js'
import { SubAgentPanel } from './SubAgentPanel.js'

/** 输出预览最大行数（折叠时） — 减少到 1 行，降低渲染量 */
const MAX_PREVIEW_LINES = 1
/** 输出预览每行最大字符数 */
const MAX_LINE_LENGTH = 80
/** 展开时最大显示行数 — 从 30 降到 15 */
const MAX_EXPANDED_LINES = 15

/**
 * 格式化输出预览（折叠状态下显示）
 */
function formatOutputPreview(output: string | undefined, maxLines: number = MAX_PREVIEW_LINES): string[] {
  if (!output) return []
  
  const lines = output.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .slice(0, maxLines)
    .map(line => truncateString(line, MAX_LINE_LENGTH))
  
  return lines
}

/**
 * ToolPanel 组件
 *
 * 显示工具调用信息，支持折叠/展开。
 *
 * @param props ToolPanelProps
 */
export function ToolPanel({
  tool,
  isExpanded,
  onToggle: _onToggle,
  isSelected = false,
}: ToolPanelProps): React.ReactElement {
  const toolColor = getToolColor(tool.name)
  const toolIcon = getToolIcon(tool.name)
  const statusIcon = getStatusIcon(tool.status)
  const statusColor = getStatusColor(tool.status)
  const inputSummary = formatToolInput(tool.name, tool.input, { maxLength: 60 })
  const duration = getToolDuration(tool)
  const outputPreview = formatOutputPreview(tool.output)
  const totalLines = tool.output?.split('\n').length || 0

  // 执行中的耗时：只在渲染时计算一次，不用 interval 驱动更新
  const isPending = tool.status === 'pending'
  const elapsedTime = (isPending && tool.startTime) 
    ? Math.floor((Date.now() - tool.startTime) / 1000)
    : 0

  // 格式化实时耗时
  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  // 折叠状态的摘要行
  const renderSummary = () => (
    <Box flexDirection="row" gap={1}>
      {/* 选中指示器 */}
      {isSelected && <Text color="yellow">›</Text>}
      
      {/* 展开/折叠指示器 */}
      <Text color="gray">{isExpanded ? '▼' : '▶'}</Text>

      {/* 工具图标和名称 */}
      <Text color={toolColor} bold={isSelected}>
        {toolIcon} {tool.displayName}
      </Text>

      {/* 输入摘要 */}
      <Text color="gray">{inputSummary}</Text>

      {/* 执行中显示静态指示器和耗时 */}
      {isPending && (
        <>
          <Text color="yellow">◐</Text>
          <Text color="yellow">
            {formatElapsedTime(elapsedTime)}
          </Text>
        </>
      )}

      {/* 完成/错误状态指示器 */}
      {(tool.status === 'completed' || tool.status === 'error') && (
        <Text color={statusColor}>{statusIcon}</Text>
      )}

      {/* 完成后的执行时间 */}
      {duration && !isPending && (
        <Text color="gray" dimColor>
          ({duration})
        </Text>
      )}
      
      {/* 展开提示 */}
      {isSelected && !isExpanded && tool.output && (
        <Text color="gray" dimColor>
          [Tab 展开]
        </Text>
      )}
    </Box>
  )

  // 折叠状态下的输出预览（仅显示前几行）
  const renderPreview = () => {
    if (isExpanded || outputPreview.length === 0) return null
    
    return (
      <Box flexDirection="column" marginLeft={4}>
        {outputPreview.map((line, i) => (
          <Text key={i} color="gray" dimColor>
            │ {line}
          </Text>
        ))}
        {totalLines > MAX_PREVIEW_LINES && (
          <Text color="gray" dimColor>
            │ ... ({totalLines - MAX_PREVIEW_LINES} 更多行)
          </Text>
        )}
      </Box>
    )
  }

  // 展开状态的详细内容
  const renderDetails = () => {
    if (!isExpanded) return null

    // 限制输出行数
    const outputLines = tool.output?.split('\n') || []
    const truncatedOutput = outputLines.length > MAX_EXPANDED_LINES
    const displayLines = truncatedOutput 
      ? outputLines.slice(0, MAX_EXPANDED_LINES) 
      : outputLines

    return (
      <Box flexDirection="column" marginLeft={4} borderStyle="single" borderColor="gray" paddingX={1}>
        {/* 输入参数（限制显示行数） */}
        <Box flexDirection="column">
          <Text color="cyan" bold>
            输入参数:
          </Text>
          <Box marginLeft={2}>
            <Text color="white">
              {(() => {
                const full = JSON.stringify(tool.input, null, 2)
                const lines = full.split('\n')
                if (lines.length <= 10) return full
                return lines.slice(0, 10).join('\n') + `\n... (${lines.length - 10} 行已省略)`
              })()}
            </Text>
          </Box>
        </Box>

        {/* 输出结果 */}
        {tool.output && (
          <Box flexDirection="column" marginTop={1}>
            <Text color={tool.isError ? 'red' : 'green'} bold>
              {tool.isError ? '错误输出:' : '执行结果:'} ({totalLines} 行)
            </Text>
            <Box marginLeft={2} flexDirection="column">
              {displayLines.map((line, i) => (
                <Text key={i} color={tool.isError ? 'red' : 'white'}>
                  {line}
                </Text>
              ))}
              {truncatedOutput && (
                <Text color="gray" dimColor>
                  ... ({outputLines.length - MAX_EXPANDED_LINES} 行已省略)
                </Text>
              )}
            </Box>
          </Box>
        )}
        
        {/* 折叠提示 */}
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            [Tab 折叠]
          </Text>
        </Box>
      </Box>
    )
  }

  // 检查是否是子 Agent 工具
  const subAgentTools = ['run_agent', 'fork_agent', 'parallel_agents', 'multi_agent', 'run_workflow', 'ask_llm']
  const isSubAgentTool = subAgentTools.includes(tool.name) && tool.subAgent

  // 子 Agent 占位符模式 — 折叠时只显示一行静态摘要，不渲染完整面板
  // 保持 Yoga 布局树稳定，避免展开/折叠时的布局重建开销
  const renderSubAgentPlaceholder = () => {
    if (!tool.subAgent) return null
    const sa = tool.subAgent
    const statusIcon = sa.status === 'running' ? '◐' : sa.status === 'completed' ? '✓' : '✗'
    const statusColor = sa.status === 'running' ? 'cyan' : sa.status === 'completed' ? 'green' : 'red'
    return (
      <Box marginLeft={4} gap={1}>
        <Text color={statusColor}>{statusIcon}</Text>
        <Text color="gray">子Agent</Text>
        <Text color="yellow">{sa.currentStep}/{sa.maxSteps}</Text>
        {sa.children && sa.children.length > 0 && (
          <Text color="gray" dimColor>({sa.children.length} 子任务)</Text>
        )}
        {isSelected && (
          <Text color="gray" dimColor>[Tab 展开详情]</Text>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginY={0}>
      {/* 摘要行 */}
      <Box>
        {renderSummary()}
      </Box>

      {/* 子 Agent：展开时渲染完整面板，折叠时渲染占位符 */}
      {isSubAgentTool && isExpanded && (
        <SubAgentPanel
          subAgent={tool.subAgent!}
          isExpanded={isExpanded}
        />
      )}
      {isSubAgentTool && !isExpanded && renderSubAgentPlaceholder()}

      {/* 普通工具的输出预览（折叠时，非子 Agent 工具） */}
      {!isSubAgentTool && renderPreview()}

      {/* 普通工具的详细内容（展开时，非子 Agent 工具） */}
      {!isSubAgentTool && renderDetails()}
    </Box>
  )
}

/**
 * 获取工具面板的折叠摘要文本（用于测试）
 */
export function getToolPanelSummary(tool: ToolPanelProps['tool']): string {
  const toolIcon = getToolIcon(tool.name)
  const inputSummary = formatToolInput(tool.name, tool.input, { maxLength: 60 })
  const statusIcon = getStatusIcon(tool.status)
  const duration = getToolDuration(tool)

  let summary = `${toolIcon} ${tool.displayName} ${inputSummary}`

  if (tool.status === 'completed' || tool.status === 'error') {
    summary += ` ${statusIcon}`
  }

  if (duration) {
    summary += ` (${duration})`
  }

  return summary
}
