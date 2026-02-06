/**
 * useSubAgent Hook
 *
 * 管理子 Agent 状态，处理子 Agent 事件
 *
 * 性能优化（Requirements 5.5 + UI 闪烁修复）：
 * - 使用 throttle 控制高频事件的 React 状态更新频率（~400ms 窗口）
 * - 与 useMessages(800ms) 和 StatusIndicator(1500ms) 节奏协调，避免多区域交替闪烁
 * - 使用 useRef 存储中间状态，避免每个事件都触发 React 渲染
 * - 批量合并同一窗口内的多个事件更新
 * - 关键事件（start、end）立即刷新，确保 UI 响应性
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { SubAgentState, SubAgentToolCall, SubAgentChild, ToolStatus, SubAgentMode, SubAgentStatus } from '../types.js'
import type { SubAgentEvent } from '../../../subtask/events.js'

/** throttle 窗口大小（毫秒）
 * 从 50ms 提升到 400ms，与 useMessages(800ms) 和 StatusIndicator(1500ms) 协调
 * 400ms 处于人眼感知的流畅边界，既保证批处理效率又维持用户体验
 * 原 50ms 导致每秒 20 次重绘，现在降到 2.5 次/秒
 */
const THROTTLE_INTERVAL = 400

export interface UseSubAgentReturn {
  /** 活跃的子 Agent 状态映射 */
  activeSubAgents: Map<string, SubAgentState>
  /** 处理子 Agent 事件 */
  handleSubAgentEvent: (event: SubAgentEvent) => void
  /** 将子 Agent 关联到工具调用 */
  linkToToolCall: (toolCallId: string, subAgentId: string) => void
  /** 获取工具调用关联的子 Agent */
  getSubAgentForTool: (toolCallId: string) => SubAgentState | undefined
  /** 注册待关联的工具调用（当 run_agent 工具开始时调用） */
  registerPendingToolCall: (toolCallId: string) => void
  /** 清除所有子 Agent 状态 */
  clear: () => void
}

/**
 * 判断事件是否为关键事件（需要立即刷新 UI）
 * start/end 事件影响 UI 结构变化，必须立即反映
 */
function isImmediateEvent(type: string): boolean {
  return type === 'start' || type === 'end' || type === 'child_start' || type === 'child_end'
}

/**
 * 将单个事件应用到状态 Map 上（纯函数，无副作用）
 */
function applyEvent(
  state: Map<string, SubAgentState>,
  event: SubAgentEvent,
  pendingToolCalls: string[],
  toolToSubAgent: Map<string, string>,
): Map<string, SubAgentState> {
  const next = new Map(state)

  switch (event.type) {
    case 'start': {
      // 自动关联到最早的待关联工具调用
      const pendingToolCallId = pendingToolCalls.shift()
      if (pendingToolCallId) {
        toolToSubAgent.set(pendingToolCallId, event.id)
      }

      // 获取模式（如果事件中有）
      const mode = ('mode' in event ? event.mode : 'run_agent') as SubAgentMode

      next.set(event.id, {
        id: event.id,
        mode,
        prompt: event.prompt,
        agentType: event.agentType,
        status: 'running',
        text: '',
        tools: [],
        children: [],
        currentStep: 0,
        maxSteps: event.maxSteps,
        startTime: Date.now(),
      })
      break
    }

    case 'text': {
      const s = next.get(event.id)
      if (s) {
        next.set(event.id, { ...s, text: event.content })
      }
      break
    }

    case 'tool_start': {
      const s = next.get(event.id)
      if (s) {
        const newTool: SubAgentToolCall = {
          id: event.toolId,
          name: event.name,
          displayName: event.name,
          input: event.input,
          isError: false,
          status: 'pending' as ToolStatus,
          startTime: Date.now(),
        }
        next.set(event.id, {
          ...s,
          tools: [...s.tools, newTool],
        })
      }
      break
    }

    case 'tool_end': {
      const s = next.get(event.id)
      if (s) {
        const updatedTools = s.tools.map(t =>
          t.id === event.toolId
            ? {
                ...t,
                output: event.output,
                isError: event.isError,
                status: (event.isError ? 'error' : 'completed') as ToolStatus,
                endTime: Date.now(),
                duration: event.duration,
              }
            : t
        )
        next.set(event.id, { ...s, tools: updatedTools })
      }
      break
    }

    case 'step': {
      const s = next.get(event.id)
      if (s) {
        next.set(event.id, {
          ...s,
          currentStep: event.current,
          maxSteps: event.total,
        })
      }
      break
    }

    case 'thinking': {
      // 可以用于显示思考状态，暂时不处理
      break
    }

    case 'end': {
      const s = next.get(event.id)
      if (s) {
        next.set(event.id, {
          ...s,
          status: event.success ? 'completed' : 'error',
          text: event.output || s.text,
          endTime: Date.now(),
          usage: event.usage,
        })
      }
      break
    }

    case 'child_start': {
      const s = next.get(event.id)
      if (s) {
        const newChild: SubAgentChild = {
          id: event.childId,
          name: event.childName,
          prompt: event.prompt,
          status: 'running',
        }
        next.set(event.id, {
          ...s,
          children: [...(s.children || []), newChild],
        })
      }
      break
    }

    case 'child_end': {
      const s = next.get(event.id)
      if (s) {
        const updatedChildren = (s.children || []).map(c =>
          c.id === event.childId
            ? {
                ...c,
                status: (event.success ? 'completed' : 'error') as SubAgentStatus,
                output: event.output,
                error: event.error,
              }
            : c
        )
        next.set(event.id, { ...s, children: updatedChildren })
      }
      break
    }

    case 'config': {
      const s = next.get(event.id)
      if (s) {
        next.set(event.id, {
          ...s,
          config: {
            timeout: event.config.timeout,
            maxTurns: event.config.maxTurns,
            tools: event.config.tools,
          },
        })
      }
      break
    }

    case 'retry': {
      const s = next.get(event.id)
      if (s) {
        next.set(event.id, {
          ...s,
          retryCount: event.attempt,
        })
      }
      break
    }
  }

  return next
}

export function useSubAgent(): UseSubAgentReturn {
  const [activeSubAgents, setActiveSubAgents] = useState<Map<string, SubAgentState>>(new Map())
  const toolToSubAgentRef = useRef<Map<string, string>>(new Map())
  // 待关联的工具调用队列（FIFO）
  const pendingToolCallsRef = useRef<string[]>([])
  // 使用 ref 存储最新状态，避免 getSubAgentForTool 依赖 activeSubAgents
  const activeSubAgentsRef = useRef<Map<string, SubAgentState>>(new Map())

  // ========== Throttle 相关 ref ==========
  // 中间状态缓冲区：累积事件更新，在 throttle 窗口结束时一次性刷新到 React state
  const bufferRef = useRef<Map<string, SubAgentState>>(new Map())
  // throttle 定时器
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 标记是否有待刷新的缓冲数据
  const hasPendingRef = useRef(false)

  /**
   * 将缓冲区数据刷新到 React state（触发渲染）
   */
  const flushBuffer = useCallback(() => {
    timerRef.current = null
    if (!hasPendingRef.current) return

    hasPendingRef.current = false
    const snapshot = new Map(bufferRef.current)
    activeSubAgentsRef.current = snapshot
    setActiveSubAgents(snapshot)
  }, [])

  /**
   * 安排一次 throttle 刷新（如果还没有安排的话）
   */
  const scheduleFlush = useCallback(() => {
    hasPendingRef.current = true
    if (timerRef.current === null) {
      timerRef.current = setTimeout(flushBuffer, THROTTLE_INTERVAL)
    }
  }, [flushBuffer])

  /**
   * 立即刷新缓冲区（用于关键事件）
   */
  const immediateFlush = useCallback(() => {
    // 清除待执行的定时器
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    hasPendingRef.current = false
    const snapshot = new Map(bufferRef.current)
    activeSubAgentsRef.current = snapshot
    setActiveSubAgents(snapshot)
  }, [])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const handleSubAgentEvent = useCallback((event: SubAgentEvent) => {
    // 将事件应用到缓冲区（不触发 React 渲染）
    const updated = applyEvent(
      bufferRef.current,
      event,
      pendingToolCallsRef.current,
      toolToSubAgentRef.current,
    )
    bufferRef.current = updated

    // 关键事件立即刷新，高频事件走 throttle
    if (isImmediateEvent(event.type)) {
      immediateFlush()
    } else {
      scheduleFlush()
    }
  }, [immediateFlush, scheduleFlush])

  const linkToToolCall = useCallback((toolCallId: string, subAgentId: string) => {
    toolToSubAgentRef.current.set(toolCallId, subAgentId)
  }, [])

  // 使用 ref 获取状态，避免依赖 activeSubAgents 导致频繁重新创建函数
  const getSubAgentForTool = useCallback((toolCallId: string): SubAgentState | undefined => {
    const subAgentId = toolToSubAgentRef.current.get(toolCallId)
    if (!subAgentId) return undefined
    return activeSubAgentsRef.current.get(subAgentId)
  }, [])

  const registerPendingToolCall = useCallback((toolCallId: string) => {
    pendingToolCallsRef.current.push(toolCallId)
  }, [])

  const clear = useCallback(() => {
    // 清除定时器
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    hasPendingRef.current = false
    bufferRef.current = new Map()
    activeSubAgentsRef.current = new Map()
    setActiveSubAgents(new Map())
    toolToSubAgentRef.current.clear()
    pendingToolCallsRef.current = []
  }, [])

  return {
    activeSubAgents,
    handleSubAgentEvent,
    linkToToolCall,
    getSubAgentForTool,
    registerPendingToolCall,
    clear,
  }
}

// 导出内部函数用于测试
export { applyEvent, isImmediateEvent, THROTTLE_INTERVAL }
