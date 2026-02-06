/**
 * Ink 终端 UI 类型定义
 *
 * 定义 Ink UI 组件所需的所有类型，包括：
 * - 消息类型（Message）
 * - 工具调用类型（ToolCall）
 * - 应用状态（AppState）
 * - 组件 Props 接口
 */

// 从 justfile 模块导入类型
import type { RegisteredCommand } from '../../justfile/types.js'

// ============================================================================
// 消息类型
// ============================================================================

/**
 * 消息基础类型
 */
export interface BaseMessage {
  /** 消息唯一标识 */
  id: string
  /** 消息时间戳 */
  timestamp: number
}

/**
 * 用户消息
 */
export interface UserMessage extends BaseMessage {
  type: 'user'
  /** 消息内容 */
  content: string
}

/**
 * AI 消息
 */
export interface AIMessage extends BaseMessage {
  type: 'ai'
  /** 消息内容 */
  content: string
  /** 是否正在流式输出 */
  isStreaming: boolean
  /** 模型名称 */
  model: string
}

/**
 * 工具调用消息
 */
export interface ToolMessage extends BaseMessage {
  type: 'tool'
  /** 工具调用信息 */
  tool: ToolCall
}

/**
 * 系统消息级别
 */
export type SystemMessageLevel = 'info' | 'warning' | 'error'

/**
 * 系统消息（错误、提示等）
 */
export interface SystemMessage extends BaseMessage {
  type: 'system'
  /** 消息级别 */
  level: SystemMessageLevel
  /** 消息内容 */
  content: string
}

/**
 * 消息联合类型
 */
export type Message = UserMessage | AIMessage | ToolMessage | SystemMessage

// ============================================================================
// 工具调用类型
// ============================================================================

/**
 * 工具名称
 */
export type ToolName = 
  | 'read' 
  | 'write' 
  | 'edit' 
  | 'bash' 
  | 'glob' 
  | 'grep'
  // 子 Agent 工具
  | 'run_agent'
  | 'ask_llm'
  | 'fork_agent'
  | 'parallel_agents'
  | 'multi_agent'
  | 'run_workflow'

/**
 * 工具执行状态
 */
export type ToolStatus = 'pending' | 'running' | 'completed' | 'error'

/**
 * Read 工具输入
 */
export interface ReadToolInput {
  filePath: string
  startLine?: number
  endLine?: number
}

/**
 * Write 工具输入
 */
export interface WriteToolInput {
  filePath: string
  content: string
}

/**
 * Edit 工具输入
 */
export interface EditToolInput {
  filePath: string
  oldContent: string
  newContent: string
}

/**
 * Bash 工具输入
 */
export interface BashToolInput {
  command: string
  cwd?: string
  timeout?: number
}

/**
 * Glob 工具输入
 */
export interface GlobToolInput {
  pattern: string
  cwd?: string
}

/**
 * Grep 工具输入
 */
export interface GrepToolInput {
  pattern: string
  path?: string
  include?: string
  exclude?: string
}

/**
 * 工具输入联合类型
 */
export type ToolInput =
  | ReadToolInput
  | WriteToolInput
  | EditToolInput
  | BashToolInput
  | GlobToolInput
  | GrepToolInput
  | Record<string, unknown>

/**
 * 工具调用信息
 */
export interface ToolCall {
  /** 工具调用唯一标识 */
  id: string
  /** 工具名称 */
  name: ToolName
  /** 工具显示名称 */
  displayName: string
  /** 工具输入参数 */
  input: ToolInput
  /** 工具输出结果 */
  output?: string
  /** 是否执行出错 */
  isError: boolean
  /** 执行状态 */
  status: ToolStatus
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime?: number
  /** 如果是 run_agent 工具，包含子 Agent 状态 */
  subAgent?: SubAgentState
}

// ============================================================================
// 子 Agent 状态
// ============================================================================

/**
 * 子 Agent 模式类型
 */
export type SubAgentMode = 
  | 'run_agent' 
  | 'fork_agent' 
  | 'parallel_agents' 
  | 'multi_agent' 
  | 'run_workflow' 
  | 'ask_llm'

/**
 * 子 Agent 执行状态
 */
export type SubAgentStatus = 'running' | 'completed' | 'error'

/**
 * 子 Agent 内部工具调用（简化版）
 */
export interface SubAgentToolCall {
  id: string
  name: string
  displayName: string
  input: unknown
  output?: string
  isError: boolean
  status: ToolStatus
  startTime: number
  endTime?: number
  duration?: number
}

/**
 * 子 Agent 子任务（用于 parallel_agents, multi_agent）
 */
export interface SubAgentChild {
  id: string
  name: string
  prompt: string
  status: SubAgentStatus
  output?: string
  error?: string
}

/**
 * 子 Agent 状态
 */
export interface SubAgentState {
  /** 子 Agent ID */
  id: string
  /** 执行模式 */
  mode: SubAgentMode
  /** 任务描述 */
  prompt: string
  /** Agent 类型 */
  agentType: string
  /** 执行状态 */
  status: SubAgentStatus
  /** 累积文本输出 */
  text: string
  /** 工具调用列表 */
  tools: SubAgentToolCall[]
  /** 子任务列表（用于 parallel_agents, multi_agent） */
  children?: SubAgentChild[]
  /** 当前步骤 */
  currentStep: number
  /** 最大步骤 */
  maxSteps: number
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime?: number
  /** Token 使用 */
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  /** 重试次数 */
  retryCount?: number
  /** 配置信息 */
  config?: {
    timeout?: number
    maxTurns?: number
    tools?: string[]
  }
}

// ============================================================================
// 应用状态
// ============================================================================

/**
 * Agent 类型
 */
export type AgentType = 'build' | 'plan' | 'explore'

/**
 * 状态指示器类型
 */
export type StatusType = 'idle' | 'thinking' | 'executing' | 'waiting'

/**
 * 活跃视图类型 — 同一时间只有一个主要动态区域
 * 用于减少并发渲染，消除多区域交替闪烁
 */
export type ActiveView = 'idle' | 'streaming' | 'tool_execution' | 'subagent_active'

/**
 * 权限结果类型
 */
export type PermissionResult = 'allow' | 'always' | 'deny' | 'skip'

/**
 * REPL 配置
 */
export interface ReplConfig {
  /** 工作目录 */
  cwd: string
  /** Agent 类型 */
  agent: AgentType
  /** 模型名称 */
  model?: string
  /** 是否自动确认 */
  autoConfirm: boolean
}

/**
 * 应用状态
 */
export interface AppState {
  // 会话状态
  /** 消息列表 */
  messages: Message[]
  /** 是否正在运行 */
  isRunning: boolean
  /** 取消控制器 */
  abortController: AbortController | null

  // 配置状态
  /** 是否自动确认 */
  autoConfirm: boolean
  /** 当前 Agent 类型 */
  currentAgent: AgentType
  /** 当前模型 */
  currentModel: string
  /** 当前工作目录 */
  cwd: string

  // UI 状态
  /** 是否显示欢迎界面 */
  showWelcome: boolean
  /** 是否显示帮助 */
  showHelp: boolean
  /** 展开的工具面板 ID 集合 */
  expandedTools: Set<string>
  /** 输入历史 */
  inputHistory: string[]
  /** 历史索引 */
  historyIndex: number

  // 权限对话框状态
  /** 待处理的权限请求 */
  pendingPermission: PermissionRequest | null
  /** 权限解析器 */
  permissionResolver: ((result: boolean) => void) | null

  // 状态指示器
  /** 当前状态 */
  status: StatusType
  /** 状态消息 */
  statusMessage: string
  /** 状态详情 */
  statusDetail: string
}

// ============================================================================
// 权限相关类型
// ============================================================================

/**
 * 权限类型
 */
export type PermissionType = 'read' | 'write' | 'edit' | 'bash' | 'glob' | 'grep'

/**
 * 权限请求
 */
export interface PermissionRequest {
  /** 权限类型 */
  type: PermissionType
  /** 资源（文件路径或命令） */
  resource: string
  /** 描述（用于展示） */
  description?: string
}

// ============================================================================
// 组件 Props 接口
// ============================================================================

/**
 * App 组件 Props
 */
export interface AppProps {
  /** REPL 配置 */
  config: ReplConfig
}

/**
 * MessageList 组件 Props
 */
export interface MessageListProps {
  /** 消息列表 */
  messages: Message[]
  /** 展开的工具面板 ID 集合 */
  expandedTools: Set<string>
  /** 切换工具面板展开状态 */
  onToggleTool: (toolId: string) => void
  /** 当前选中的工具面板 ID（用于键盘导航） */
  selectedToolId?: string | null
  /** 获取工具关联的子 Agent 状态 */
  getSubAgentForTool?: (toolId: string) => SubAgentState | undefined
}

/**
 * ToolPanel 组件 Props
 */
export interface ToolPanelProps {
  /** 工具调用信息 */
  tool: ToolCall
  /** 是否展开 */
  isExpanded: boolean
  /** 切换展开状态 */
  onToggle: () => void
  /** 是否被选中（用于键盘导航） */
  isSelected?: boolean
}

/**
 * PermissionDialog 组件 Props
 */
export interface PermissionDialogProps {
  /** 权限请求 */
  request: PermissionRequest
  /** 响应回调 */
  onResponse: (result: PermissionResult) => void
}

/**
 * Token 使用量
 */
export interface TokenUsage {
  /** 输入 token 数 */
  input: number
  /** 输出 token 数 */
  output: number
  /** 总计 token 数 */
  total?: number
}

/**
 * 活跃子 Agent 摘要信息（用于 StatusIndicator 显示）
 */
export interface ActiveSubAgentSummary {
  /** 子 Agent ID */
  id: string
  /** 执行模式 */
  mode: SubAgentMode
  /** Agent 类型 */
  agentType: string
  /** 执行状态 */
  status: SubAgentStatus
  /** 当前步骤 */
  currentStep: number
  /** 最大步骤 */
  maxSteps: number
  /** 任务描述 */
  prompt?: string
  /** 子任务列表（讨论发言 / parallel 子任务） */
  children?: Array<{
    id: string
    name: string
    status: SubAgentStatus
    output?: string
  }>
  /** 最近的工具调用名称 */
  lastToolName?: string
  /** 最近的工具调用状态 */
  lastToolStatus?: ToolStatus
}

/**
 * StatusIndicator 组件 Props
 */
export interface StatusIndicatorProps {
  /** 状态类型 */
  status: StatusType
  /** 状态消息 */
  message?: string
  /** 状态详情 */
  detail?: string
  /** 当前步骤 */
  stepCurrent?: number
  /** 总步骤数 */
  stepTotal?: number
  /** Token 使用量 */
  tokenUsage?: TokenUsage
  /** 活跃子 Agent 列表（Requirements 5.4: 多子 Agent 摘要显示） */
  activeSubAgents?: ActiveSubAgentSummary[]
}

/**
 * InputArea 组件 Props
 */
export interface InputAreaProps {
  /** 提交回调 */
  onSubmit: (input: string) => void
  /** 是否禁用 */
  disabled: boolean
  /** 当前模式 */
  mode: 'auto' | 'manual'
  /** 输入历史 */
  history: string[]
  /** Justfile 命令列表（可选，已废弃，使用 unifiedCommands） */
  justCommands?: RegisteredCommand[]
  /** 执行 Justfile 命令回调（可选，已废弃） */
  onExecuteJustCommand?: (command: RegisteredCommand) => void
  /** 统一命令列表（可选） */
  unifiedCommands?: Array<{
    name: string
    description: string
    layer: 'builtin' | 'external' | 'skill'
    layerIcon: string
  }>
  /** 获取命令补全建议（可选） */
  getCompletions?: (input: string) => Array<{
    name: string
    description: string
    layer: 'builtin' | 'external' | 'skill'
    layerIcon: string
  }>
  /** Tab 键回调（用于切换工具面板） */
  onTab?: () => void
}

/**
 * WelcomeView 组件 Props
 */
export interface WelcomeViewProps {
  /** REPL 配置 */
  config: ReplConfig
  /** 版本号 */
  version?: string
}

/**
 * HelpView 组件 Props
 */
export interface HelpViewProps {
  /** 关闭回调 */
  onClose?: () => void
  /** 统一命令列表（可选，用于显示所有命令） */
  commands?: Array<{
    name: string
    description: string
    layer: 'builtin' | 'external' | 'skill'
    layerIcon: string
  }>
}

/**
 * UserMessage 组件 Props
 */
export interface UserMessageProps {
  /** 消息内容 */
  content: string
}

/**
 * AIMessage 组件 Props
 */
export interface AIMessageProps {
  /** 消息内容 */
  content: string
  /** 模型名称 */
  model: string
  /** 是否正在流式输出 */
  isStreaming: boolean
}

/**
 * SystemMessage 组件 Props
 */
export interface SystemMessageProps {
  /** 消息级别 */
  level: SystemMessageLevel
  /** 消息内容 */
  content: string
}

// ============================================================================
// Hook 相关类型
// ============================================================================

/**
 * useRunner Hook 选项
 */
export interface UseRunnerOptions {
  /** REPL 配置 */
  config: ReplConfig
  /** 权限请求回调 */
  onPermissionRequest: (request: PermissionRequest) => Promise<boolean>
}

/**
 * Runner 事件类型
 */
export type RunnerEventType = 'text' | 'tool_start' | 'tool_end' | 'error' | 'done' | 'permission_request'

/**
 * Runner 事件
 */
export interface RunnerEvent {
  type: RunnerEventType
  data: unknown
}

/**
 * useRunner Hook 返回值
 */
export interface UseRunnerReturn {
  /** 运行 Agent */
  run: (input: string) => Promise<void>
  /** 取消运行 */
  cancel: () => void
  /** 是否正在运行 */
  isRunning: boolean
  /** 事件列表 */
  events: RunnerEvent[]
}

/**
 * useKeyboard Hook 选项
 */
export interface UseKeyboardOptions {
  /** Escape 键回调 */
  onEscape?: () => void
  /** Ctrl+C 回调 */
  onCtrlC?: () => void
  /** Ctrl+O 回调（切换所有工具面板） */
  onCtrlO?: () => void
  /** Tab 键回调（切换当前工具面板） */
  onTab?: () => void
  /** 上方向键回调 */
  onArrowUp?: () => void
  /** 下方向键回调 */
  onArrowDown?: () => void
  /** Alt+P 回调 */
  onAltP?: () => void
}

/**
 * useMessages Hook 返回值
 */
export interface UseMessagesReturn {
  /** 消息列表 */
  messages: Message[]
  /** 添加用户消息 */
  addUserMessage: (content: string) => void
  /** 添加 AI 消息 */
  addAIMessage: (content: string, model: string) => string
  /** 更新 AI 消息（流式） */
  updateAIMessage: (id: string, content: string) => void
  /** 完成 AI 消息流式输出 */
  finishAIMessage: (id: string) => void
  /** 添加工具调用 */
  addToolCall: (tool: Omit<ToolCall, 'id' | 'status' | 'startTime' | 'isError'>) => string
  /** 更新工具调用 */
  updateToolCall: (id: string, update: Partial<ToolCall>) => void
  /** 添加系统消息 */
  addSystemMessage: (level: SystemMessageLevel, content: string) => void
  /** 清空消息 */
  clear: () => void
}

// ============================================================================
// 命令相关类型
// ============================================================================

/**
 * 斜杠命令名称
 */
export type SlashCommand =
  | '/help'
  | '/clear'
  | '/agent'
  | '/model'
  | '/exit'
  | '/mode'
  | '/history'
  | '/session'

/**
 * 命令处理结果
 */
export interface CommandResult {
  /** 是否成功 */
  success: boolean
  /** 结果消息 */
  message?: string
  /** 是否退出 */
  exit?: boolean
}

/**
 * 命令处理器
 */
export type CommandHandler = (args: string[]) => CommandResult | Promise<CommandResult>

/**
 * 命令定义
 */
export interface CommandDefinition {
  /** 命令名称 */
  name: SlashCommand
  /** 命令描述 */
  description: string
  /** 使用示例 */
  usage?: string
  /** 处理器 */
  handler: CommandHandler
}

// ============================================================================
// useAppReducer 状态和 Action 类型
// ============================================================================

/**
 * App 统一 Reducer 状态 — 将 App.tsx 的 15+ useState 合并为 4 个状态域
 */
export interface AppReducerState {
  // 运行时域
  /** 活跃视图（互斥，同一时间只有一个主要动态区域） */
  activeView: ActiveView
  /** 状态指示器类型 */
  status: StatusType
  /** 状态消息 */
  statusMessage: string
  /** 状态详情 */
  statusDetail: string
  /** 步骤计数 */
  stepCount: number
  /** Token 使用量 */
  tokenUsage: { input: number; output: number } | undefined

  // UI 域
  /** 是否显示帮助 */
  showHelp: boolean
  /** 展开的工具面板 ID 集合 */
  expandedTools: Set<string>
  /** 当前选中的工具面板 ID */
  selectedToolId: string | null
  /** 输入历史 */
  inputHistory: string[]

  // 配置域
  /** 当前模型 */
  currentModel: string
  /** 是否自动确认 */
  autoConfirm: boolean

  // 权限域
  /** 待处理的权限请求 */
  pendingPermission: PermissionRequest | null
}

/**
 * App Reducer Action 类型
 * 一个 Runner 事件对应一个 dispatch，内部批量更新所有相关状态
 */
export type AppAction =
  // 运行时 actions
  | { type: 'SET_STATUS'; status: StatusType; message: string; detail: string }
  | { type: 'SET_ACTIVE_VIEW'; view: ActiveView }
  | { type: 'INCREMENT_STEP' }
  | { type: 'SET_TOKEN_USAGE'; usage: { input: number; output: number } }
  | { type: 'RESET_RUNTIME' }
  // UI actions
  | { type: 'TOGGLE_HELP'; show?: boolean }
  | { type: 'TOGGLE_TOOL'; toolId: string }
  | { type: 'TOGGLE_ALL_TOOLS'; toolIds: string[] }
  | { type: 'SELECT_TOOL'; toolId: string | null }
  | { type: 'ADD_INPUT_HISTORY'; input: string }
  // 配置 actions
  | { type: 'SET_MODEL'; model: string }
  | { type: 'SET_AUTO_CONFIRM'; value: boolean }
  // 权限 actions
  | { type: 'SET_PENDING_PERMISSION'; request: PermissionRequest | null }
  // 批量 action — 用于 Runner 事件的原子更新
  | { type: 'TOOL_START'; toolId: string; status: StatusType; message: string; detail: string }
  | { type: 'TOOL_END'; status: StatusType; message: string; detail: string }
  | { type: 'STREAM_START'; status: StatusType; message: string; detail: string }
  | { type: 'TASK_DONE'; usage?: { input: number; output: number } }

// ============================================================================
// 工具函数类型
// ============================================================================

/**
 * 工具输入摘要格式化选项
 */
export interface FormatToolInputOptions {
  /** 最大长度 */
  maxLength?: number
  /** 是否显示完整路径 */
  showFullPath?: boolean
}

/**
 * 颜色主题
 */
export interface ColorTheme {
  /** 主色 */
  primary: string
  /** 次要色 */
  secondary: string
  /** 成功色 */
  success: string
  /** 警告色 */
  warning: string
  /** 错误色 */
  error: string
  /** 信息色 */
  info: string
  /** 静音色 */
  muted: string
}

/**
 * 工具颜色映射
 */
export interface ToolColors {
  read: string
  write: string
  edit: string
  bash: string
  glob: string
  grep: string
}
