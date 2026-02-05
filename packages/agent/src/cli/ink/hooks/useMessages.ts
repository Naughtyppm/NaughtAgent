/**
 * useMessages Hook
 *
 * 管理消息列表状态，提供添加、更新、清空消息的方法。
 * 支持用户消息、AI 消息（含流式）、工具调用、系统消息。
 *
 * 需求: 5.1, 5.2, 5.5
 */

import { useState, useCallback } from 'react'
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
    return id
  }, [])


  /**
   * 更新 AI 消息内容（流式）
   * @param id 消息 ID
   * @param content 新内容（累积的完整内容）
   */
  const updateAIMessage = useCallback((id: string, content: string): void => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === id && msg.type === 'ai') {
          return { ...msg, content }
        }
        return msg
      })
    )
  }, [])

  /**
   * 完成 AI 消息流式输出
   * @param id 消息 ID
   */
  const finishAIMessage = useCallback((id: string): void => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === id && msg.type === 'ai') {
          return { ...msg, isStreaming: false }
        }
        return msg
      })
    )
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
   * @param id 工具调用 ID
   * @param update 更新内容
   */
  const updateToolCall = useCallback((id: string, update: Partial<ToolCall>): void => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type === 'tool' && msg.tool.id === id) {
          return {
            ...msg,
            tool: { ...msg.tool, ...update },
          }
        }
        return msg
      })
    )
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
    finishAIMessage,
    addToolCall,
    updateToolCall,
    addSystemMessage,
    clear,
  }
}
