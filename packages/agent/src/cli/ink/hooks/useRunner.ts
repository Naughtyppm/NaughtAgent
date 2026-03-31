/**
 * useRunner Hook
 *
 * 封装 Runner 交互逻辑，提供：
 * - 运行 Agent
 * - 取消运行
 * - 事件处理
 * - 重置 Runner（用于切换模型/Agent，保留会话历史）
 *
 * 需求: 1.3, 8.1, 8.2
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createRunner, type Runner, type RunnerEventHandlers } from '../../runner.js'
import type { Session } from '../../../session/session.js'
import type {
  UseRunnerOptions,
  UseRunnerReturn,
  RunnerEvent,
  PermissionRequest,
} from '../types.js'

/**
 * useRunner Hook
 *
 * 封装 Runner 的创建和事件处理逻辑。
 * 提供 run 和 cancel 方法，以及运行状态和事件列表。
 *
 * @param options 配置选项
 * @returns UseRunnerReturn
 */
export function useRunner(options: UseRunnerOptions): UseRunnerReturn & { resetRunner: () => void } {
  const { config, onPermissionRequest } = options

  const [isRunning, setIsRunning] = useState(false)
  const [events, setEvents] = useState<RunnerEvent[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const runnerRef = useRef<Runner | null>(null)
  const autoConfirmRef = useRef({ value: config.autoConfirm })
  
  // 保存会话引用，确保切换模型/Agent 时不丢失对话历史
  const sessionRef = useRef<Session | null>(null)
  
  // 保存最新的配置引用
  const configRef = useRef(config)
  configRef.current = config

  // 同步 autoConfirm 状态
  useEffect(() => {
    autoConfirmRef.current.value = config.autoConfirm
  }, [config.autoConfirm])

  // 创建 Runner（懒加载）
  const getRunner = useCallback(() => {
    if (!runnerRef.current) {
      const currentConfig = configRef.current
      runnerRef.current = createRunner({
        agentType: currentConfig.agent,
        cwd: currentConfig.cwd,
        model: currentConfig.model,
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: process.env.ANTHROPIC_BASE_URL,
        autoConfirmRef: autoConfirmRef.current,
        // 传入已有的 session（如果有）
        existingSession: sessionRef.current,
        // Extended Thinking 配置
        thinking: currentConfig.thinking,
        onConfirm: async (request) => {
          // 转换权限请求格式
          const inkRequest: PermissionRequest = {
            type: request.type,
            resource: request.resource,
            description: request.description || `执行 ${request.type} 操作`,
          }
          return onPermissionRequest(inkRequest)
        },
      })
      
      // 保存 session 引用
      const session = runnerRef.current.getSession()
      if (session) {
        sessionRef.current = session
      }
    }
    return runnerRef.current
  }, [onPermissionRequest])

  /**
   * 重置 Runner（用于切换模型/Agent）
   * 注意：保留 session，只重置 runner 实例
   */
  const resetRunner = useCallback(() => {
    // 保存当前 session
    if (runnerRef.current) {
      const session = runnerRef.current.getSession()
      if (session) {
        sessionRef.current = session
      }
    }
    runnerRef.current = null
  }, [])

  /**
   * 添加事件到事件列表
   */
  const addEvent = useCallback((event: RunnerEvent) => {
    setEvents((prev) => [...prev, event])
  }, [])

  /**
   * 运行 Agent
   *
   * @param input 用户输入
   */
  const run = useCallback(
    async (input: string): Promise<void> => {
      if (isRunning) {
        return
      }

      setIsRunning(true)
      setEvents([])
      abortControllerRef.current = new AbortController()

      const runner = getRunner()

      // 创建事件处理器
      const handlers: RunnerEventHandlers = {
        onTextDelta: (delta) => {
          addEvent({ type: 'text', data: { content: delta } })
        },
        onThinking: (content) => {
          addEvent({ type: 'thinking', data: { content } })
        },
        onThinkingEnd: () => {
          addEvent({ type: 'thinking_end', data: {} })
        },
        onToolStart: (id, name, toolInput) => {
          addEvent({
            type: 'tool_start',
            data: { id, name, input: toolInput },
          })
        },
        onToolEnd: (id, output, isError) => {
          addEvent({
            type: 'tool_end',
            data: { id, output, isError },
          })
        },
        onError: (error) => {
          addEvent({ type: 'error', data: { error } })
        },
        onDone: (usage) => {
          addEvent({ type: 'done', data: { usage } })
        },
        onPermissionRequest: (request) => {
          addEvent({
            type: 'permission_request',
            data: { request },
          })
        },
      }

      try {
        await runner.run(input, handlers, {
          abort: abortControllerRef.current.signal,
        })
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // 用户取消，不记录错误
          return
        }
        addEvent({ type: 'error', data: { error } })
      } finally {
        setIsRunning(false)
        abortControllerRef.current = null
      }
    },
    [isRunning, addEvent, getRunner]
  )

  /**
   * 取消运行
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  return {
    run,
    cancel,
    isRunning,
    events,
    resetRunner,
  }
}
