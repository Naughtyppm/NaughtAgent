/**
 * 命令提示组件
 * 
 * 在用户输入 `/` 时显示可用命令列表
 * 
 * 支持统一命令系统的三层命令：
 * - builtin: 内置命令（同步执行）
 * - external: 外部命令（justfile，子进程执行）
 * - skill: AI 技能（工作流执行）
 */

import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'

/**
 * 统一命令类型（简化版，用于 UI 显示）
 */
export interface UnifiedCommandItem {
  /** 命令名称 */
  name: string
  /** 命令描述 */
  description: string
  /** 命令层级 */
  layer: 'builtin' | 'external' | 'skill'
  /** 层级图标 */
  layerIcon: string
}

/**
 * 命令提示组件 Props
 */
export interface CommandPromptProps {
  /** 统一命令列表 */
  commands: UnifiedCommandItem[]
  /** 当前输入的过滤文本 */
  filter: string
  /** 选中命令回调 */
  onSelect: (command: UnifiedCommandItem) => void
  /** 是否可见 */
  visible: boolean
  /** 最大显示数量 */
  maxItems?: number
}

/**
 * 获取层级颜色
 */
function getLayerColor(layer: 'builtin' | 'external' | 'skill'): string {
  switch (layer) {
    case 'builtin': return 'cyan'
    case 'external': return 'yellow'
    case 'skill': return 'magenta'
    default: return 'white'
  }
}

/**
 * 命令提示组件
 */
export function CommandPrompt({
  commands,
  filter,
  onSelect,
  visible,
  maxItems = 8,
}: CommandPromptProps): React.ReactElement | null {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)

  
  // 过滤命令
  const filteredCommands = React.useMemo(() => {
    if (!filter) return commands
    
    const lowerFilter = filter.toLowerCase()
    return commands.filter(cmd => 
      cmd.name.toLowerCase().includes(lowerFilter) ||
      cmd.description.toLowerCase().includes(lowerFilter)
    )
  }, [commands, filter])
  
  // 计算显示窗口
  const displayCommands = React.useMemo(() => {
    return filteredCommands.slice(scrollOffset, scrollOffset + maxItems)
  }, [filteredCommands, scrollOffset, maxItems])
  
  // 重置选中索引和滚动位置
  useEffect(() => {
    setSelectedIndex(0)
    setScrollOffset(0)
  }, [filter])
  
  // 当选中项变化时，调整滚动位置
  useEffect(() => {
    // 如果选中项在可见区域上方，向上滚动
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex)
    }
    // 如果选中项在可见区域下方，向下滚动
    else if (selectedIndex >= scrollOffset + maxItems) {
      setScrollOffset(selectedIndex - maxItems + 1)
    }
  }, [selectedIndex, scrollOffset, maxItems])
  
  // 键盘输入处理
  useInput((_input, key) => {
    if (!visible) return
    
    if (key.return) {
      if (filteredCommands[selectedIndex]) {
        onSelect(filteredCommands[selectedIndex])
      }
      return
    }
    
    if (key.upArrow) {
      setSelectedIndex(prev => 
        prev > 0 ? prev - 1 : filteredCommands.length - 1
      )
      return
    }
    
    if (key.downArrow) {
      setSelectedIndex(prev => 
        prev < filteredCommands.length - 1 ? prev + 1 : 0
      )
      return
    }
  }, { isActive: visible })
  
  if (!visible || filteredCommands.length === 0) {
    return null
  }
  
  // 计算显示索引（相对于滚动窗口）
  const displaySelectedIndex = selectedIndex - scrollOffset
  
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text color="cyan" bold>可用命令</Text>
        <Text color="gray"> (↑↓ 选择, Enter 确认)</Text>
        {filteredCommands.length > maxItems && (
          <Text color="gray"> [{selectedIndex + 1}/{filteredCommands.length}]</Text>
        )}
      </Box>
      
      {/* 上方滚动指示器 */}
      {scrollOffset > 0 && (
        <Box paddingX={1}>
          <Text color="gray">↑ 还有 {scrollOffset} 个...</Text>
        </Box>
      )}
      
      {displayCommands.map((cmd, index) => (
        <Box key={cmd.name} paddingX={1}>
          <Text
            backgroundColor={index === displaySelectedIndex ? 'cyan' : undefined}
            color={index === displaySelectedIndex ? 'black' : undefined}
          >
            {cmd.layerIcon} {cmd.name}
          </Text>
          {cmd.description && (
            <Text color={index === displaySelectedIndex ? 'black' : 'gray'}>
              {' - '}{cmd.description}
            </Text>
          )}
          {/* 层级标签 */}
          <Text color={index === displaySelectedIndex ? 'black' : getLayerColor(cmd.layer)}>
            {' '}[{cmd.layer}]
          </Text>
        </Box>
      ))}
      
      {/* 下方滚动指示器 */}
      {scrollOffset + maxItems < filteredCommands.length && (
        <Box paddingX={1}>
          <Text color="gray">
            ↓ 还有 {filteredCommands.length - scrollOffset - maxItems} 个...
          </Text>
        </Box>
      )}
    </Box>
  )
}
