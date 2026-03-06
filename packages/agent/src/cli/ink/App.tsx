/**
 * App 组件
 *
 * Ink REPL 主应用组件，组合所有子组件：
 * - WelcomeView: 欢迎界面
 * - MessageList: 消息列表
 * - StatusIndicator: 状态指示器
 * - PermissionDialog: 权限对话框
 * - InputArea: 输入区域
 * - HelpView: 帮助视图
 *
 * 性能优化（UI 闪烁修复 Phase 2）：
 * - 使用 useAppReducer 统一状态管理，单次 dispatch 批量更新
 * - activeView 状态机确保同一时间只有一个主要动态区域
 * - 增量事件处理（lastProcessedIndex），避免重复处理
 *
 * 需求: 6.1, 6.6
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box } from 'ink'
import type {
  AppProps,
  PermissionRequest,
  PermissionResult,
  ToolName,
  AgentType,
  ToolMessage,
} from './types.js'
import { useMessages } from './hooks/useMessages.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useRunner } from './hooks/useRunner.js'
import { useSubAgent } from './hooks/useSubAgent.js'
import { useAppReducer } from './hooks/useAppReducer.js'
import { WelcomeView } from './components/WelcomeView.js'
import { MessageList } from './components/MessageList.js'
import { StatusIndicator } from './components/StatusIndicator.js'
import { PermissionDialog } from './components/PermissionDialog.js'
import { InputArea } from './components/InputArea.js'
import { HelpView } from './components/HelpView.js'
import { ThinkingPanel } from './components/ThinkingPanel.js'
// SubAgentPanel 已统一在 ToolPanel 内嵌显示，App.tsx 不再直接使用
// 统一命令系统
import {
  createSyncRegistry,
  createCommandRouter,
  createCommandDispatcher,
  createCompletionProvider,
  createErrorDiagnostics,
  type UnifiedRegistry,
  type CommandRouter,
  type CommandDispatcher,
  type DispatchContext,
  LAYER_ICONS,
} from '../../command/index.js'
// 子 Agent 事件监听
import { setGlobalSubAgentEventListener } from '../../subtask/index.js'

/**
 * 命令处理结果
 */
interface CommandResult {
  success: boolean
  message?: string
  exit?: boolean
}

/**
 * 工具显示名称映射
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  bash: '执行命令',
  glob: '搜索文件',
  grep: '搜索内容',
}

/** 子 Agent 工具名称列表 */
const SUB_AGENT_TOOLS = ['run_agent', 'fork_agent', 'parallel_agents', 'multi_agent', 'run_workflow', 'ask_llm']

/**
 * App 组件
 *
 * 主应用组件，使用 useAppReducer 统一管理全局状态。
 * 原来的 15+ useState 已合并为 4 个状态域，单次 dispatch 批量更新。
 */
export function App({ config }: AppProps): React.ReactElement {
  // ========== 统一状态管理 ==========
  const { state, dispatch } = useAppReducer(
    config.model || 'claude-sonnet-4-20250514',
    config.autoConfirm,
  )
  const [currentAgent] = useState<AgentType>(config.agent)
  const [commandsLoaded, setCommandsLoaded] = useState(0)

  // ========== Extended Thinking 状态 ==========
  const [thinkingContent, setThinkingContent] = useState('')
  const [isThinking, setIsThinking] = useState(false)

  // ========== 消息管理（保持独立，因为流式更新有自己的节流逻辑） ==========
  const {
    messages,
    addUserMessage,
    addAIMessage,
    updateAIMessage,
    finishAIMessage,
    addToolCall,
    updateToolCall,
    addSystemMessage,
  } = useMessages()

  // ========== Refs ==========
  const permissionResolverRef = useRef<((result: boolean) => void) | null>(null)
  const currentAIMessageIdRef = useRef<string | null>(null)
  const toolIdMapRef = useRef<Map<string, string>>(new Map())
  const toggleSelectedToolRef = useRef<() => void>(() => {})
  // 增量事件处理：记录已处理的事件索引
  const lastProcessedEventRef = useRef<number>(0)

  // ========== 统一命令系统 ==========
  const unifiedRegistryRef = useRef<UnifiedRegistry>(createSyncRegistry({
    projectJustfilePath: `${config.cwd}/justfile`,
  }))
  const commandRouterRef = useRef<CommandRouter>(createCommandRouter(unifiedRegistryRef.current))
  const commandDispatcherRef = useRef<CommandDispatcher>(createCommandDispatcher())
  const completionProviderRef = useRef(createCompletionProvider())
  const diagnosticsRef = useRef(createErrorDiagnostics())

  // ========== 子 Agent 状态管理 ==========
  const {
    activeSubAgents,
    handleSubAgentEvent,
    getSubAgentForTool,
    registerPendingToolCall,
    clear: clearSubAgents,
  } = useSubAgent()

  // 设置全局子 Agent 事件监听器
  useEffect(() => {
    setGlobalSubAgentEventListener(handleSubAgentEvent)
    return () => {
      setGlobalSubAgentEventListener(null)
    }
  }, [handleSubAgentEvent])

  // Tab 键处理已统一在 useKeyboard 的 onTab 中，不再重复注册
  // （之前 useInput + useKeyboard 双重注册导致 toggle 被调用两次 → 展开又折叠）

  // 加载命令（统一命令系统）
  useEffect(() => {
    const loadCommands = async () => {
      await unifiedRegistryRef.current.reload()
      commandRouterRef.current = createCommandRouter(unifiedRegistryRef.current)
      setCommandsLoaded(prev => prev + 1)
    }
    loadCommands()
  }, [config.cwd])

  // ========== 权限请求处理 ==========
  const handlePermissionRequest = useCallback(
    async (request: PermissionRequest): Promise<boolean> => {
      if (state.autoConfirm) return true
      dispatch({ type: 'SET_PENDING_PERMISSION', request })
      return new Promise((resolve) => {
        permissionResolverRef.current = resolve
      })
    },
    [state.autoConfirm, dispatch]
  )

  // ========== Runner Hook ==========
  const { run, cancel, isRunning, events, resetRunner } = useRunner({
    config: {
      ...config,
      model: state.currentModel,
      agent: currentAgent,
      autoConfirm: state.autoConfirm,
    },
    onPermissionRequest: handlePermissionRequest,
  })

  // ========== 增量事件处理 ==========
  // 只处理新到达的事件，避免重复处理已处理过的事件
  useEffect(() => {
    if (events.length === 0) {
      lastProcessedEventRef.current = 0
      return
    }

    // 只处理从 lastProcessedIndex 开始的新事件
    const startIdx = lastProcessedEventRef.current
    if (startIdx >= events.length) return

    for (let i = startIdx; i < events.length; i++) {
      const event = events[i]

      switch (event.type) {
        case 'text': {
          const { content } = event.data as { content: string }
          if (!currentAIMessageIdRef.current) {
            const id = addAIMessage('', state.currentModel)
            currentAIMessageIdRef.current = id
            // 批量更新：activeView + status 一次 dispatch
            dispatch({ type: 'STREAM_START', status: 'thinking', message: '生成响应...', detail: '正在输出' })
          }
          updateAIMessage(currentAIMessageIdRef.current, content)
          break
        }

        case 'tool_start': {
          const { id, name, input } = event.data as { id: string; name: string; input: unknown }
          if (currentAIMessageIdRef.current) {
            finishAIMessage(currentAIMessageIdRef.current)
            currentAIMessageIdRef.current = null
          }
          const inkId = addToolCall({
            name: name as ToolName,
            displayName: TOOL_DISPLAY_NAMES[name] || name,
            input: input as Record<string, unknown>,
          })
          toolIdMapRef.current.set(id, inkId)

          if (SUB_AGENT_TOOLS.includes(name)) {
            registerPendingToolCall(inkId)
          }

          // 提取详情
          const inputObj = input as Record<string, unknown>
          let detail = ''
          if (name === 'read' || name === 'write' || name === 'edit') {
            const path = String(inputObj.filePath || inputObj.file_path || '')
            detail = path.split(/[/\\]/).pop() || ''
          } else if (name === 'bash') {
            const cmd = String(inputObj.command || '')
            detail = cmd.length > 30 ? cmd.substring(0, 30) + '...' : cmd
          } else if (SUB_AGENT_TOOLS.includes(name)) {
            const prompt = String(inputObj.prompt || inputObj.task || inputObj.topic || '')
            detail = prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt
          }
          // 批量更新：activeView + status + stepCount + selectedToolId
          dispatch({
            type: 'TOOL_START',
            toolId: inkId,
            status: 'executing',
            message: TOOL_DISPLAY_NAMES[name] || name,
            detail,
          })
          break
        }

        case 'tool_end': {
          const { id, output, isError } = event.data as { id: string; output: string; isError?: boolean }
          const inkId = toolIdMapRef.current.get(id)
          if (inkId) {
            updateToolCall(inkId, {
              output,
              isError: isError || false,
              status: isError ? 'error' : 'completed',
              endTime: Date.now(),
            })
          }
          dispatch({ type: 'TOOL_END', status: 'thinking', message: '分析结果...', detail: '准备下一步' })
          break
        }

        case 'error': {
          const { error } = event.data as { error: Error }
          addSystemMessage('error', error.message)
          dispatch({ type: 'RESET_RUNTIME' })
          break
        }

        case 'thinking': {
          // Extended Thinking 内容流式输出
          const { content } = event.data as { content: string }
          if (!isThinking) {
            setIsThinking(true)
            setThinkingContent(content)
          } else {
            setThinkingContent(prev => prev + content)
          }
          break
        }

        case 'thinking_end': {
          // Extended Thinking 结束
          setIsThinking(false)
          break
        }

        case 'done': {
          const { usage } = event.data as { usage?: { inputTokens: number; outputTokens: number } }
          if (currentAIMessageIdRef.current) {
            finishAIMessage(currentAIMessageIdRef.current)
            currentAIMessageIdRef.current = null
          }
          // 显示 token 消耗信息
          if (usage) {
            const formatTokens = (n: number) => n < 1000 ? String(n) : n < 10000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`
            addSystemMessage('info', `📊 Token: ${formatTokens(usage.inputTokens)}↓ ${formatTokens(usage.outputTokens)}↑ (总计 ${formatTokens(usage.inputTokens + usage.outputTokens)})`)
          }
          // 批量更新：activeView + status + stepCount + tokenUsage 一次 dispatch
          dispatch({
            type: 'TASK_DONE',
            usage: usage ? { input: usage.inputTokens, output: usage.outputTokens } : undefined,
          })
          toolIdMapRef.current.clear()
          clearSubAgents()
          // 重置 thinking 状态
          setThinkingContent('')
          setIsThinking(false)
          break
        }

        case 'permission_request':
          break
      }
    }

    // 更新已处理索引
    lastProcessedEventRef.current = events.length
  }, [
    events,
    state.currentModel,
    addAIMessage,
    updateAIMessage,
    finishAIMessage,
    addToolCall,
    updateToolCall,
    addSystemMessage,
    dispatch,
    registerPendingToolCall,
    clearSubAgents,
  ])

  // ========== 工具面板交互 ==========
  const toggleTool = useCallback((toolId: string) => {
    dispatch({ type: 'TOGGLE_TOOL', toolId })
  }, [dispatch])

  const getToolIds = useCallback(() => {
    return messages
      .filter((m): m is ToolMessage => m.type === 'tool')
      .map((m) => m.tool.id)
  }, [messages])

  const toggleSelectedTool = useCallback(() => {
    const toolIds = getToolIds()
    if (toolIds.length === 0) return

    if (!state.selectedToolId || !toolIds.includes(state.selectedToolId)) {
      const lastToolId = toolIds[toolIds.length - 1]
      dispatch({ type: 'SELECT_TOOL', toolId: lastToolId })
      dispatch({ type: 'TOGGLE_TOOL', toolId: lastToolId })
      return
    }
    dispatch({ type: 'TOGGLE_TOOL', toolId: state.selectedToolId })
  }, [state.selectedToolId, getToolIds, dispatch])

  useEffect(() => {
    toggleSelectedToolRef.current = toggleSelectedTool
  }, [toggleSelectedTool])

  const toggleAllTools = useCallback(() => {
    const toolIds = getToolIds()
    if (toolIds.length === 0) return
    dispatch({ type: 'TOGGLE_ALL_TOOLS', toolIds })
  }, [getToolIds, dispatch])

  // ========== 命令处理 ==========
  const handleCommand = useCallback(
    async (input: string): Promise<CommandResult> => {
      const router = commandRouterRef.current
      const dispatcher = commandDispatcherRef.current
      const registry = unifiedRegistryRef.current

      const routingResult = router.route(input)

      if (routingResult.type !== 'command') {
        return { success: false, message: '输入不是命令' }
      }

      if (!routingResult.found || !routingResult.command) {
        const diagnostics = diagnosticsRef.current
        const similarCommands = diagnostics.findSimilar(
          routingResult.commandName || '',
          registry
        )
        const suggestions = similarCommands.length > 0
          ? `\n建议: 您是否想输入 /${similarCommands[0]}？`
          : '\n建议: 使用 /help 查看所有可用命令'
        return {
          success: false,
          message: `未知命令: /${routingResult.commandName || ''}${suggestions}`,
        }
      }

      const context: DispatchContext = {
        cwd: config.cwd,
        addMessage: (type, message) => {
          addSystemMessage(type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info', message)
        },
        getState: () => ({
          currentModel: state.currentModel,
          permissionMode: state.autoConfirm ? 'allow' : 'ask',
          commandHistory: state.inputHistory,
          conversationHistory: [],
          cwd: config.cwd,
        }),
        setState: (updates) => {
          if (updates.currentModel) {
            dispatch({ type: 'SET_MODEL', model: updates.currentModel })
            resetRunner()
          }
          if (updates.permissionMode) {
            dispatch({ type: 'SET_AUTO_CONFIRM', value: updates.permissionMode === 'allow' })
          }
        },
        getRegistry: () => registry,
        reloadRegistry: async () => {
          await registry.reload()
          commandRouterRef.current = createCommandRouter(registry)
        },
      }

      const result = await dispatcher.dispatch(
        routingResult.command,
        routingResult.args,
        routingResult.namedArgs,
        context
      )

      if (result.exit) {
        return { success: true, exit: true }
      }

      return {
        success: result.success,
        message: result.success ? result.output : result.error,
      }
    },
    [config.cwd, state.currentModel, state.autoConfirm, state.inputHistory, addSystemMessage, resetRunner, dispatch]
  )

  // ========== 输入提交 ==========
  const handleSubmit = useCallback(
    async (input: string) => {
      if (state.showHelp) {
        dispatch({ type: 'TOGGLE_HELP', show: false })
      }

      dispatch({ type: 'ADD_INPUT_HISTORY', input })

      // 处理命令
      if (input.startsWith('/')) {
        if (input.trim().toLowerCase() === '/help') {
          dispatch({ type: 'TOGGLE_HELP', show: true })
          return
        }

        const result = await handleCommand(input)
        if (result.message) {
          addSystemMessage(result.success ? 'info' : 'error', result.message)
        }
        if (result.exit) {
          process.exit(0)
        }
        return
      }

      addUserMessage(input)
      dispatch({ type: 'STREAM_START', status: 'thinking', message: '理解问题...', detail: '准备响应' })

      try {
        await run(input)
      } catch (error) {
        addSystemMessage('error', error instanceof Error ? error.message : String(error))
        dispatch({ type: 'RESET_RUNTIME' })
      }
    },
    [state.showHelp, handleCommand, addUserMessage, addSystemMessage, run, dispatch]
  )

  // ========== 权限响应 ==========
  const handlePermissionResponse = useCallback(
    (result: PermissionResult) => {
      if (result === 'always') {
        dispatch({ type: 'SET_AUTO_CONFIRM', value: true })
        addSystemMessage('info', '已切换到自动确认模式')
      }

      if (permissionResolverRef.current) {
        permissionResolverRef.current(result === 'allow' || result === 'always')
        permissionResolverRef.current = null
      }

      dispatch({ type: 'SET_PENDING_PERMISSION', request: null })
    },
    [addSystemMessage, dispatch]
  )

  // ========== 键盘快捷键 ==========
  useKeyboard({
    onEscape: () => {
      if (state.autoConfirm) {
        dispatch({ type: 'SET_AUTO_CONFIRM', value: false })
        addSystemMessage('info', '已切换到手动确认模式')
      }
    },
    onCtrlC: () => {
      if (isRunning) {
        cancel()
        if (currentAIMessageIdRef.current) {
          finishAIMessage(currentAIMessageIdRef.current)
          currentAIMessageIdRef.current = null
        }
        dispatch({ type: 'RESET_RUNTIME' })
        toolIdMapRef.current.clear()
        clearSubAgents()
        addSystemMessage('warning', '⏹ 任务已中止 (Ctrl+C)')
      }
    },
    onCtrlO: () => toggleAllTools(),
    onTab: () => toggleSelectedTool(),
    onAltP: () => {
      if (state.autoConfirm) {
        dispatch({ type: 'SET_AUTO_CONFIRM', value: false })
        addSystemMessage('info', '已切换到手动确认模式')
      }
    },
  })

  // ========== 渲染 ==========
  return (
    <Box flexDirection="column" padding={1}>
      {/* 欢迎界面 */}
      {!state.showHelp && <WelcomeView config={{ ...config, model: state.currentModel, agent: currentAgent, autoConfirm: state.autoConfirm }} />}

      {/* 帮助视图 */}
      {state.showHelp && (
        <HelpView
          onClose={() => dispatch({ type: 'TOGGLE_HELP', show: false })}
          commands={React.useMemo(() =>
            unifiedRegistryRef.current.getAll().map(cmd => ({
              name: cmd.name,
              description: cmd.description,
              layer: cmd.layer,
              layerIcon: LAYER_ICONS[cmd.layer],
            })),
            [commandsLoaded]
          )}
        />
      )}

      {/* Extended Thinking 面板 */}
      {(isThinking || thinkingContent) && (
        <ThinkingPanel
          content={thinkingContent}
          isThinking={isThinking}
          defaultExpanded={false}
        />
      )}

      {/* 消息列表 */}
      {!state.showHelp && (
        <MessageList
          messages={messages}
          expandedTools={state.expandedTools}
          onToggleTool={toggleTool}
          selectedToolId={state.selectedToolId}
          getSubAgentForTool={getSubAgentForTool}
        />
      )}

      {/* 状态指示器 — 包含多子 Agent 摘要 */}
      <StatusIndicator
        status={state.status}
        message={state.statusMessage}
        detail={state.statusDetail}
        stepCurrent={state.stepCount > 0 ? state.stepCount : undefined}
        tokenUsage={state.tokenUsage}
        activeSubAgents={React.useMemo(() => {
          if (activeSubAgents.size === 0) return undefined
          return Array.from(activeSubAgents.values()).map(sa => {
            const lastTool = sa.tools.length > 0 ? sa.tools[sa.tools.length - 1] : null
            return {
              id: sa.id,
              mode: sa.mode,
              agentType: sa.agentType,
              status: sa.status,
              currentStep: sa.currentStep,
              maxSteps: sa.maxSteps,
              prompt: sa.prompt,
              children: sa.children && sa.children.length > 0
                ? sa.children.map(c => ({
                    id: c.id,
                    name: c.name,
                    status: c.status,
                    output: c.output,
                  }))
                : undefined,
              lastToolName: lastTool?.displayName || lastTool?.name,
              lastToolStatus: lastTool?.status,
            }
          })
        }, [activeSubAgents])}
      />

      {/* 权限对话框 */}
      {state.pendingPermission && (
        <PermissionDialog
          request={state.pendingPermission}
          onResponse={handlePermissionResponse}
        />
      )}

      {/* 输入区域 */}
      <InputArea
        onSubmit={handleSubmit}
        disabled={isRunning || !!state.pendingPermission}
        mode={state.autoConfirm ? 'auto' : 'manual'}
        history={state.inputHistory}
        onTab={toggleSelectedTool}
        unifiedCommands={React.useMemo(() =>
          unifiedRegistryRef.current.getAll().map(cmd => ({
            name: cmd.name,
            description: cmd.description,
            layer: cmd.layer,
            layerIcon: LAYER_ICONS[cmd.layer],
          })),
          [commandsLoaded]
        )}
        getCompletions={(input) => {
          return completionProviderRef.current.getSuggestions(input, unifiedRegistryRef.current)
        }}
      />
    </Box>
  )
}
