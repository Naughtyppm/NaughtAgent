/**
 * useMessages Hook
 *
 * 管理消息列表状态，提供添加、更新、清空消息的方法。
 * 支持用户消息、AI 消息（含流式）、工具调用、系统消息。
 *
 * 需求: 5.1, 5.2, 5.5
 */

import { useState, useCallback, useRef } from 'react'
import type {
  Message,
  UserMessage,
  AIMessage,
  ToolMessage,
  SystemMessage,
  ToolCall,
  SystemMessageLevel,
  UseMessagesReturn,
} from '../types.js'

/**
 * 生成唯一 ID
 * 使用时间戳 + 随机数确保唯一性
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/** 流式更新节流间隔（毫秒）- 降低到 200ms 提高流畅性 */
const STREAM_THROTTLE_MS = 200

/** 最大更新频率（每秒最多更新次数） */
const MAX_UPDATES_PER_SECOND = 5

/**
 * useMessages Hook
 *
 * 管理消息列表状态，包括：
 * - 用户消息
 * - AI 消息（支持流式更新）
 * - 工具调用消息
 * - 系统消息
 *
 * @returns UseMessagesReturn 消息管理接口
 */
export function useMessages(): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([])
  
  // 用于节流的 refs
  const pendingContentRef = useRef<Map<string, string>>(new Map())
  const lastUpdateContentRef = useRef<Map<string, string>>(new Map())
  const lastUpdateTimeRef = useRef<Map<string, number>>(new Map())
  const throttleTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  /**
   * 添加用户消息
   * @param content 消息内容
   */
  const addUserMessage = useCallback((content: string): void => {
    const message: UserMessage = {
      id: generateId(),
      type: 'user',
      content,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, message])
  }, [])

  /**
   * 添加 AI 消息
   * @param content 初始内容
   * @param model 模型名称
   * @returns 消息 ID，用于后续更新
   */
  const addAIMessage = useCallback((content: string, model: string): string => {
    const id = generateId()
    const message: AIMessage = {
      id,
      type: 'ai',
      content,
      model,
      isStreaming: true,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, message])
    lastUpdateContentRef.current.set(id, content)
    lastUpdateTimeRef.current.set(id, Date.now())
    return id
  }, [])


  /**
   * 更新 AI 消息内容（流式，带激进节流）
   * 使用严格的时间窗口控制，防止突发大量内容导致界面抽搐
   * @param id 消息 ID
   * @param content 新内容（累积的完整内容）
   */
  const updateAIMessage = useCallback((id: string, content: string): void => {
    // 保存最新内容
    pendingContentRef.current.set(id, content)
    
    const now = Date.now()
    const lastUpdateTime = lastUpdateTimeRef.current.get(id) || 0
    const timeSinceLastUpdate = now - lastUpdateTime
    
    // 严格的时间窗口控制：必须等待足够时间才能更新
    // 这样即使突然来了大量内容，也不会频繁刷新
    const minInterval = 1000 / MAX_UPDATES_PER_SECOND // 500ms
    const shouldUpdate = timeSinceLastUpdate >= Math.max(STREAM_THROTTLE_MS, minInterval)
    
    // 如果已有定时器，只更新 pending 内容，不做其他事
    if (throttleTimerRef.current.has(id)) {
      return
    }
    
    if (shouldUpdate) {
      // 执行更新
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === id && msg.type === 'ai') {
            return { ...msg, content }
          }
          return msg
        })
      )
      lastUpdateContentRef.current.set(id, content)
      lastUpdateTimeRef.current.set(id, now)
    }
    
    // 设置节流定时器，确保最终内容会被更新
    // 使用较长的间隔，让界面有时间稳定
    const timer = setTimeout(() => {
      throttleTimerRef.current.delete(id)
      const latestContent = pendingContentRef.current.get(id)
      const currentLastContent = lastUpdateContentRef.current.get(id)
      
      if (latestContent !== undefined && latestContent !== currentLastContent) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === id && msg.type === 'ai') {
              return { ...msg, content: latestContent }
            }
            return msg
          })
        )
        lastUpdateContentRef.current.set(id, latestContent)
        lastUpdateTimeRef.current.set(id, Date.now())
      }
    }, STREAM_THROTTLE_MS)
    
    throttleTimerRef.current.set(id, timer)
  }, [])

  /**
   * 完成 AI 消息流式输出
   * 优化：使用 findIndex + 直接替换，避免全量 map 遍历
   * @param id 消息 ID
   */
  const finishAIMessage = useCallback((id: string): void => {
    // 清理节流定时器
    const timer = throttleTimerRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      throttleTimerRef.current.delete(id)
    }

    // 确保最终内容被更新
    const finalContent = pendingContentRef.current.get(id)
    pendingContentRef.current.delete(id)
    lastUpdateContentRef.current.delete(id)
    lastUpdateTimeRef.current.delete(id)

    setMessages((prev) => {
      const idx = prev.findIndex(msg => msg.id === id && msg.type === 'ai')
      if (idx === -1) return prev
      const msg = prev[idx] as AIMessage
      const next = [...prev]
      next[idx] = {
        ...msg,
        content: finalContent ?? msg.content,
        isStreaming: false,
        isThinking: false,
      }
      return next
    })
  }, [])

  /**
   * 更新 AI 消息的 thinking 状态（带节流，防止高频重渲染）
   * @param id 消息 ID
   * @param thinking thinking 内容（累积）
   * @param isThinking 是否正在思考
   */
  const thinkingPendingRef = useRef<Map<string, { thinking: string; isThinking: boolean }>>(new Map())
  const thinkingTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const updateAIThinking = useCallback((id: string, thinking: string, isThinking: boolean): void => {
    thinkingPendingRef.current.set(id, { thinking, isThinking })

    // 如果已有节流定时器，只更新 pending 数据
    if (thinkingTimerRef.current.has(id)) return

    // 立即执行第一次更新
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === id && msg.type === 'ai') {
          return { ...msg, thinking, isThinking }
        }
        return msg
      })
    )

    // 节流：200ms 内不再更新
    const timer = setTimeout(() => {
      thinkingTimerRef.current.delete(id)
      const pending = thinkingPendingRef.current.get(id)
      if (pending) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === id && msg.type === 'ai') {
              return { ...msg, thinking: pending.thinking, isThinking: pending.isThinking }
            }
            return msg
          })
        )
      }
    }, STREAM_THROTTLE_MS)
    thinkingTimerRef.current.set(id, timer)
  }, [])

  /**
   * 添加工具调用
   * @param tool 工具调用信息（不含 id、status、startTime、isError）
   * @returns 工具调用 ID
   */
  const addToolCall = useCallback(
    (tool: Omit<ToolCall, 'id' | 'status' | 'startTime' | 'isError'>): string => {
      const id = generateId()
      const toolCall: ToolCall = {
        ...tool,
        id,
        status: 'pending',
        startTime: Date.now(),
        isError: false,
      }
      const message: ToolMessage = {
        id: generateId(),
        type: 'tool',
        tool: toolCall,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, message])
      return id
    },
    []
  )

  /**
   * 更新工具调用状态
   * 优化：使用 findIndex + 直接替换，避免全量 map 遍历
   * @param id 工具调用 ID
   * @param update 更新内容
   */
  const updateToolCall = useCallback((id: string, update: Partial<ToolCall>): void => {
    setMessages((prev) => {
      const idx = prev.findIndex(msg => msg.type === 'tool' && msg.tool.id === id)
      if (idx === -1) return prev
      const msg = prev[idx] as ToolMessage
      const next = [...prev]
      next[idx] = { ...msg, tool: { ...msg.tool, ...update } }
      return next
    })
  }, [])

  /**
   * 添加系统消息
   * @param level 消息级别
   * @param content 消息内容
   */
  const addSystemMessage = useCallback((level: SystemMessageLevel, content: string): void => {
    const message: SystemMessage = {
      id: generateId(),
      type: 'system',
      level,
      content,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, message])
  }, [])

  /**
   * 清空所有消息
   */
  const clear = useCallback((): void => {
    setMessages([])
  }, [])

  return {
    messages,
    addUserMessage,
    addAIMessage,
    updateAIMessage,
    updateAIThinking,
    finishAIMessage,
    addToolCall,
    updateToolCall,
    addSystemMessage,
    clear,
  }
}
