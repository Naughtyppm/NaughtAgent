/**
 * InputArea 组件
 *
 * 输入区域组件，提供：
 * - 文本输入
 * - 模式指示器（auto/manual）
 * - 历史导航支持
 * - 统一命令提示（输入 / 触发）
 *
 * 需求: 6.4, 6.5
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Box, Text, useInput } from '../../cc-ink/index.js'
import { TextInput } from '@inkjs/ui'
import type { InputAreaProps } from '../types.js'
import { CommandPrompt, type UnifiedCommandItem } from './CommandPrompt.js'

/**
 * 获取模式指示器文本
 */
function getModeIndicator(mode: 'auto' | 'manual'): string {
  return mode === 'auto' ? '[AUTO]' : '[MANUAL]'
}

/**
 * 获取模式指示器颜色
 */
function getModeColor(mode: 'auto' | 'manual'): string {
  return mode === 'auto' ? 'green' : 'yellow'
}

/**
 * InputArea 组件
 *
 * 显示输入区域，带有模式指示器和历史导航。
 * 注意：@inkjs/ui 的 TextInput 是非受控组件，不支持 value 属性。
 * 历史导航通过 key 强制重新渲染来实现。
 *
 * @param props InputAreaProps
 */
export function InputArea({
  onSubmit,
  disabled,
  mode,
  history,
  unifiedCommands = [],
}: InputAreaProps): React.ReactElement {
  const [historyIndex, setHistoryIndex] = useState(history.length)
  const [inputKey, setInputKey] = useState(0)
  const [showCommandPrompt, setShowCommandPrompt] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')
  const currentValueRef = useRef('')

  // 当历史变化时重置索引
  useEffect(() => {
    setHistoryIndex(history.length)
  }, [history.length])

  // 处理提交
  const handleSubmit = useCallback(
    (input: string) => {
      // 如果刚刚从命令提示选择了命令，跳过（已经在 handleCommandSelect 中处理了）
      if (commandSelectedRef.current) {
        commandSelectedRef.current = false // 立即重置
        return
      }
      
      // 如果命令提示正在显示，忽略 TextInput 的 onSubmit
      // （用户按 Enter 是为了选择命令，由 CommandPrompt 处理）
      if (showCommandPrompt) {
        return
      }
      
      if (input.trim()) {
        // 关闭命令提示
        setShowCommandPrompt(false)
        setCommandFilter('')
        
        onSubmit(input)
        currentValueRef.current = ''
        setInputKey((k) => k + 1) // 强制重新渲染清空输入
        setHistoryIndex(history.length + 1)
      }
    },
    [onSubmit, history.length, showCommandPrompt]
  )

  // 处理输入变化（用于跟踪当前值和命令提示）
  const handleChange = useCallback((newValue: string) => {
    currentValueRef.current = newValue
    
    // 检测 / 开头的输入，显示统一命令提示
    // 但如果输入包含空格（表示用户在输入参数），则关闭命令提示
    if (newValue.startsWith('/') && !newValue.includes(' ') && unifiedCommands.length > 0) {
      setShowCommandPrompt(true)
      setCommandFilter(newValue.slice(1)) // 去掉 /
    } else {
      setShowCommandPrompt(false)
      setCommandFilter('')
    }
  }, [unifiedCommands.length])

  // 标记是否刚刚从命令提示选择了命令（用于防止重复执行）
  const commandSelectedRef = useRef(false)

  // 处理命令选择（统一命令系统）
  const handleCommandSelect = useCallback((command: UnifiedCommandItem) => {
    setShowCommandPrompt(false)
    setCommandFilter('')
    
    // 标记已选择命令，防止 TextInput 的 onSubmit 重复处理
    commandSelectedRef.current = true
    
    // 通过 onSubmit 统一处理命令（走统一命令系统）
    const commandInput = `/${command.name}`
    onSubmit(commandInput)
    currentValueRef.current = ''
    setInputKey((k) => k + 1)
  }, [onSubmit])

  // 处理历史导航（Tab 键移到 App 层处理，因为需要在 disabled 时也能工作）
  useInput(
    (_input, key) => {
      if (disabled) return

      // 上方向键 - 向前导航历史
      if (key.upArrow && history.length > 0) {
        const newIndex = Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        if (newIndex < history.length) {
          currentValueRef.current = history[newIndex]
          setInputKey((k) => k + 1) // 强制重新渲染
        }
        return
      }

      // 下方向键 - 向后导航历史
      if (key.downArrow && history.length > 0) {
        const newIndex = Math.min(history.length, historyIndex + 1)
        setHistoryIndex(newIndex)
        if (newIndex < history.length) {
          currentValueRef.current = history[newIndex]
        } else {
          currentValueRef.current = ''
        }
        setInputKey((k) => k + 1) // 强制重新渲染
        return
      }
    },
    { isActive: !disabled }
  )

  const modeIndicator = getModeIndicator(mode)
  const modeColor = getModeColor(mode)

  return (
    <Box flexDirection="column">
      {/* 统一命令提示 */}
      <CommandPrompt
        commands={unifiedCommands}
        filter={commandFilter}
        onSelect={handleCommandSelect}
        visible={showCommandPrompt && !disabled}
      />
      
      <Box flexDirection="row" gap={1}>
        {/* 模式指示器 */}
        <Text color={modeColor}>{modeIndicator}</Text>

        {/* 提示符 */}
        <Text color="cyan">{'>'}</Text>

        {/* 输入框：运行时显示等待提示，TextInput 始终挂载避免重建开销 */}
        {disabled ? (
          <Text color="gray">等待中...</Text>
        ) : (
          <TextInput
            key={inputKey}
            defaultValue={currentValueRef.current}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="输入消息或命令... (/ 显示快捷命令)"
          />
        )}
      </Box>
    </Box>
  )
}

/**
 * 导出辅助函数（用于测试）
 */
export { getModeIndicator, getModeColor }
