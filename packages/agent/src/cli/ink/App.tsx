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
 * 需求: 6.1, 6.6
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Box } from 'ink'
import type {
  AppProps,
  StatusType,
  PermissionRequest,
  PermissionResult,
  ToolName,
  AgentType,
} from './types.js'
import { useMessages } from './hooks/useMessages.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useRunner } from './hooks/useRunner.js'
import { WelcomeView } from './components/WelcomeView.js'
import { MessageList } from './components/MessageList.js'
import { StatusIndicator } from './components/StatusIndicator.js'
import { PermissionDialog } from './components/PermissionDialog.js'
import { InputArea } from './components/InputArea.js'
import { HelpView } from './components/HelpView.js'
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

/**
 * App 组件
 *
 * 主应用组件，管理全局状态和布局。
 *
 * @param props AppProps
 */
export function App({ config }: AppProps): React.ReactElement {
  // 消息管理
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

  // 动态配置状态（支持运行时切换）
  const [currentModel, setCurrentModel] = useState(config.model || 'claude-sonnet-4-20250514')
  const [currentAgent] = useState<AgentType>(config.agent)

  // UI 状态
  const [showHelp, setShowHelp] = useState(false)
  const [autoConfirm, setAutoConfirm] = useState(config.autoConfirm)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [commandsLoaded, setCommandsLoaded] = useState(0) // 用于触发命令列表更新

  // 状态指示器
  const [status, setStatus] = useState<StatusType>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [statusDetail, setStatusDetail] = useState('')

  // 权限对话框
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null)
  const permissionResolverRef = useRef<((result: boolean) => void) | null>(null)

  // 当前 AI 消息 ID（用于流式更新）
  const currentAIMessageIdRef = useRef<string | null>(null)
  // 工具 ID 映射（Runner ID -> Ink ID）
  const toolIdMapRef = useRef<Map<string, string>>(new Map())

  // 统一命令系统 - 传入 justfile 路径配置
  const unifiedRegistryRef = useRef<UnifiedRegistry>(createSyncRegistry({
    projectJustfilePath: `${config.cwd}/justfile`,
  }))
  const commandRouterRef = useRef<CommandRouter>(createCommandRouter(unifiedRegistryRef.current))
  const commandDispatcherRef = useRef<CommandDispatcher>(createCommandDispatcher())
  const completionProviderRef = useRef(createCompletionProvider())
  const diagnosticsRef = useRef(createErrorDiagnostics())

  // 加载命令（统一命令系统）
  useEffect(() => {
    const loadCommands = async () => {
      // 重新加载统一注册表（包括 justfile 命令）
      await unifiedRegistryRef.current.reload()
      commandRouterRef.current = createCommandRouter(unifiedRegistryRef.current)
      // 触发重新渲染以更新命令列表
      setCommandsLoaded(prev => prev + 1)
    }
    loadCommands()
  }, [config.cwd])

  // 权限请求处理
  const handlePermissionRequest = useCallback(
    async (request: PermissionRequest): Promise<boolean> => {
      // 如果是自动模式，直接允许
      if (autoConfirm) {
        return true
      }

      // 显示权限对话框
      setPendingPermission(request)

      // 等待用户响应
      return new Promise((resolve) => {
        permissionResolverRef.current = resolve
      })
    },
    [autoConfirm]
  )

  // Runner Hook - 使用动态配置
  const { run, cancel, isRunning, events, resetRunner } = useRunner({
    config: { 
      ...config, 
      model: currentModel,
      agent: currentAgent,
      autoConfirm,
    },
    onPermissionRequest: handlePermissionRequest,
  })

  // 处理 Runner 事件
  useEffect(() => {
    if (events.length === 0) return

    const latestEvent = events[events.length - 1]

    switch (latestEvent.type) {
      case 'text': {
        const { content } = latestEvent.data as { content: string }
        if (!currentAIMessageIdRef.current) {
          // 创建新的 AI 消息 - 使用当前模型而不是初始配置
          const id = addAIMessage('', currentModel)
          currentAIMessageIdRef.current = id
          setStatus('thinking')
          setStatusMessage('思考中...')
        }
        // 追加内容
        updateAIMessage(currentAIMessageIdRef.current, content)
        break
      }

      case 'tool_start': {
        const { id, name, input } = latestEvent.data as {
          id: string
          name: string
          input: unknown
        }
        // 完成当前 AI 消息的流式输出
        if (currentAIMessageIdRef.current) {
          finishAIMessage(currentAIMessageIdRef.current)
          currentAIMessageIdRef.current = null
        }
        // 添加工具调用
        const inkId = addToolCall({
          name: name as ToolName,
          displayName: TOOL_DISPLAY_NAMES[name] || name,
          input: input as Record<string, unknown>,
        })
        toolIdMapRef.current.set(id, inkId)
        setStatus('executing')
        setStatusMessage(TOOL_DISPLAY_NAMES[name] || name)
        // 提取详情
        const inputObj = input as Record<string, unknown>
        if (name === 'read' || name === 'write' || name === 'edit') {
          const path = String(inputObj.filePath || inputObj.file_path || '')
          setStatusDetail(path.split(/[/\\]/).pop() || '')
        } else if (name === 'bash') {
          const cmd = String(inputObj.command || '')
          setStatusDetail(cmd.length > 30 ? cmd.substring(0, 30) + '...' : cmd)
        } else {
          setStatusDetail('')
        }
        break
      }

      case 'tool_end': {
        const { id, output, isError } = latestEvent.data as {
          id: string
          output: string
          isError?: boolean
        }
        const inkId = toolIdMapRef.current.get(id)
        if (inkId) {
          updateToolCall(inkId, {
            output,
            isError: isError || false,
            status: isError ? 'error' : 'completed',
            endTime: Date.now(),
          })
        }
        setStatus('thinking')
        setStatusMessage('思考中...')
        setStatusDetail('')
        break
      }

      case 'error': {
        const { error } = latestEvent.data as { error: Error }
        addSystemMessage('error', error.message)
        setStatus('idle')
        setStatusMessage('')
        setStatusDetail('')
        break
      }

      case 'done': {
        // 完成当前 AI 消息
        if (currentAIMessageIdRef.current) {
          finishAIMessage(currentAIMessageIdRef.current)
          currentAIMessageIdRef.current = null
        }
        setStatus('idle')
        setStatusMessage('')
        setStatusDetail('')
        // 清理工具 ID 映射
        toolIdMapRef.current.clear()
        break
      }

      case 'permission_request': {
        // 权限请求已在 handlePermissionRequest 中处理
        break
      }
    }
  }, [
    events,
    config.model,
    addAIMessage,
    updateAIMessage,
    finishAIMessage,
    addToolCall,
    updateToolCall,
    addSystemMessage,
  ])

  // 切换工具面板展开状态
  const toggleTool = useCallback((toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev)
      if (next.has(toolId)) {
        next.delete(toolId)
      } else {
        next.add(toolId)
      }
      return next
    })
  }, [])

  // 处理命令（使用统一命令系统）
  const handleCommand = useCallback(
    async (input: string): Promise<CommandResult> => {
      const router = commandRouterRef.current
      const dispatcher = commandDispatcherRef.current
      const registry = unifiedRegistryRef.current

      // 路由输入
      const routingResult = router.route(input)

      // 如果不是命令
      if (routingResult.type !== 'command') {
        return { success: false, message: '输入不是命令' }
      }

      // 如果命令未找到
      if (!routingResult.found || !routingResult.command) {
        const diagnostics = diagnosticsRef.current
        // 直接使用 findSimilar 查找相似命令，而不是通过 diagnose
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

      // 构建调度上下文
      const context: DispatchContext = {
        cwd: config.cwd,
        addMessage: (type, message) => {
          addSystemMessage(type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info', message)
        },
        getState: () => ({
          currentModel,
          permissionMode: autoConfirm ? 'allow' : 'ask',
          commandHistory: inputHistory,
          conversationHistory: [],
          cwd: config.cwd,
        }),
        setState: (updates) => {
          if (updates.currentModel) {
            setCurrentModel(updates.currentModel)
            resetRunner()
          }
          if (updates.permissionMode) {
            setAutoConfirm(updates.permissionMode === 'allow')
          }
        },
        getRegistry: () => registry,
        reloadRegistry: async () => {
          await registry.reload()
          commandRouterRef.current = createCommandRouter(registry)
        },
      }

      // 执行命令
      const result = await dispatcher.dispatch(
        routingResult.command,
        routingResult.args,
        routingResult.namedArgs,
        context
      )

      // 处理退出
      if (result.exit) {
        return { success: true, exit: true }
      }

      // 返回结果
      return {
        success: result.success,
        message: result.success ? result.output : result.error,
      }
    },
    [config.cwd, currentModel, autoConfirm, inputHistory, addSystemMessage, resetRunner]
  )

  // 处理输入提交
  const handleSubmit = useCallback(
    async (input: string) => {
      // 隐藏帮助
      if (showHelp) {
        setShowHelp(false)
      }

      // 添加到历史
      setInputHistory((prev) => [...prev, input])

      // 处理命令
      if (input.startsWith('/')) {
        // 特殊处理 /help 命令（直接显示帮助视图）
        if (input.trim().toLowerCase() === '/help') {
          setShowHelp(true)
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

      // 添加用户消息
      addUserMessage(input)

      // 运行 Agent
      setStatus('thinking')
      setStatusMessage('思考中...')

      try {
        await run(input)
      } catch (error) {
        addSystemMessage('error', error instanceof Error ? error.message : String(error))
        setStatus('idle')
      }
    },
    [
      showHelp,
      handleCommand,
      addUserMessage,
      addSystemMessage,
      run,
    ]
  )

  // 处理权限响应
  const handlePermissionResponse = useCallback(
    (result: PermissionResult) => {
      if (result === 'always') {
        setAutoConfirm(true)
        addSystemMessage('info', '已切换到自动确认模式')
      }

      if (permissionResolverRef.current) {
        permissionResolverRef.current(result === 'allow' || result === 'always')
        permissionResolverRef.current = null
      }

      setPendingPermission(null)
    },
    [addSystemMessage]
  )

  // 键盘快捷键
  useKeyboard({
    onEscape: () => {
      if (autoConfirm) {
        setAutoConfirm(false)
        addSystemMessage('info', '已切换到手动确认模式')
      }
    },
    onCtrlC: () => {
      if (isRunning) {
        cancel()
        setStatus('idle')
        addSystemMessage('warning', '任务已取消')
      }
    },
    onCtrlO: () => {
      // 切换所有工具面板
    },
    onAltP: () => {
      if (autoConfirm) {
        setAutoConfirm(false)
        addSystemMessage('info', '已切换到手动确认模式')
      }
    },
  })

  return (
    <Box flexDirection="column" padding={1}>
      {/* 欢迎界面 - 始终显示在顶部（帮助视图除外） */}
      {!showHelp && <WelcomeView config={{ ...config, model: currentModel, agent: currentAgent, autoConfirm }} />}

      {/* 帮助视图 */}
      {showHelp && (
        <HelpView
          onClose={() => setShowHelp(false)}
          commands={React.useMemo(() =>
            unifiedRegistryRef.current.getAll().map(cmd => ({
              name: cmd.name,
              description: cmd.description,
              layer: cmd.layer,
              layerIcon: LAYER_ICONS[cmd.layer],
            })),
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [commandsLoaded]
          )}
        />
      )}

      {/* 消息列表 */}
      {!showHelp && (
        <MessageList
          messages={messages}
          expandedTools={expandedTools}
          onToggleTool={toggleTool}
        />
      )}

      {/* 状态指示器 */}
      <StatusIndicator
        status={status}
        message={statusMessage}
        detail={statusDetail}
      />

      {/* 权限对话框 */}
      {pendingPermission && (
        <PermissionDialog
          request={pendingPermission}
          onResponse={handlePermissionResponse}
        />
      )}

      {/* 输入区域 */}
      <InputArea
        onSubmit={handleSubmit}
        disabled={isRunning || !!pendingPermission}
        mode={autoConfirm ? 'auto' : 'manual'}
        history={inputHistory}
        unifiedCommands={React.useMemo(() => 
          unifiedRegistryRef.current.getAll().map(cmd => ({
            name: cmd.name,
            description: cmd.description,
            layer: cmd.layer,
            layerIcon: LAYER_ICONS[cmd.layer],
          })),
          // eslint-disable-next-line react-hooks/exhaustive-deps
          [commandsLoaded]
        )}
        getCompletions={(input) => {
          return completionProviderRef.current.getSuggestions(input, unifiedRegistryRef.current)
        }}
      />
    </Box>
  )
}
