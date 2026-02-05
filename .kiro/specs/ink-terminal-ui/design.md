# 设计文档: Ink 终端 UI

## 概述

本设计文档描述使用 Ink (React for CLI) 重写 NaughtyAgent 终端 UI 的技术方案。Ink 是一个基于 React 的 CLI 框架，允许使用 React 组件模型构建交互式终端应用。

### 设计目标

1. **组件化架构**: 使用 React 组件模式构建可复用的 UI 组件
2. **状态管理**: 使用 React hooks 管理 UI 状态
3. **事件驱动**: 与现有 Runner 事件系统无缝集成
4. **渐进增强**: 保持与现有 CLI 的兼容性

### 技术选型

- **Ink 5.x**: React for CLI 框架
- **@inkjs/ui**: 官方 UI 组件库（Spinner, Select, TextInput 等）
- **React 18**: 底层渲染引擎
- **TypeScript**: 类型安全

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI 入口 (cli.ts)                     │
│                    (保持不变，参数解析)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Ink REPL 应用                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    App 组件                              ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐││
│  │  │ WelcomeView │ │ MessageList │ │   InputArea         │││
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘││
│  │                        │                                 ││
│  │  ┌─────────────────────┴─────────────────────┐          ││
│  │  │              消息组件                       │          ││
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ │          ││
│  │  │  │ UserMsg  │ │  AIMsg   │ │ ToolPanel  │ │          ││
│  │  │  └──────────┘ └──────────┘ └────────────┘ │          ││
│  │  └────────────────────────────────────────────┘          ││
│  │                                                          ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │              覆盖层组件                               │││
│  │  │  ┌──────────────────┐ ┌────────────────────────────┐│││
│  │  │  │ PermissionDialog │ │     StatusIndicator        ││││
│  │  │  └──────────────────┘ └────────────────────────────┘│││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Runner (runner.ts)                        │
│                      (保持不变)                               │
└─────────────────────────────────────────────────────────────┘
```

### 文件结构

```
packages/agent/src/cli/
├── cli.ts              # CLI 入口（保持不变）
├── runner.ts           # Runner（保持不变）
├── repl.ts             # 旧 REPL（保留作为 fallback）
├── markdown.ts         # Markdown 渲染（保持不变）
└── ink/                # 新增 Ink UI 目录
    ├── index.ts        # Ink REPL 入口
    ├── App.tsx         # 主应用组件
    ├── hooks/          # 自定义 hooks
    │   ├── useRunner.ts
    │   ├── useKeyboard.ts
    │   └── useMessages.ts
    ├── components/     # UI 组件
    │   ├── WelcomeView.tsx
    │   ├── MessageList.tsx
    │   ├── UserMessage.tsx
    │   ├── AIMessage.tsx
    │   ├── ToolPanel.tsx
    │   ├── PermissionDialog.tsx
    │   ├── StatusIndicator.tsx
    │   ├── InputArea.tsx
    │   └── HelpView.tsx
    ├── utils/          # 工具函数
    │   ├── colors.ts
    │   └── format.ts
    └── types.ts        # 类型定义
```

## 组件和接口

### 核心组件

#### 1. App 组件

主应用组件，管理全局状态和布局。

```typescript
interface AppProps {
  config: ReplConfig
}

interface AppState {
  messages: Message[]
  isRunning: boolean
  autoConfirm: boolean
  currentAgent: AgentType
  currentModel: string
  showHelp: boolean
  showWelcome: boolean
}
```

#### 2. MessageList 组件

消息列表组件，渲染对话历史。

```typescript
interface MessageListProps {
  messages: Message[]
  expandedTools: Set<string>
  onToggleTool: (toolId: string) => void
}
```

#### 3. ToolPanel 组件

可折叠的工具调用面板。

```typescript
interface ToolPanelProps {
  tool: ToolCall
  isExpanded: boolean
  onToggle: () => void
}

interface ToolCall {
  id: string
  name: string
  input: unknown
  output?: string
  isError?: boolean
  status: 'pending' | 'running' | 'completed' | 'error'
}
```

#### 4. PermissionDialog 组件

权限确认对话框。

```typescript
interface PermissionDialogProps {
  request: PermissionRequest
  onResponse: (result: PermissionResult) => void
}

type PermissionResult = 'allow' | 'always' | 'deny' | 'skip'
```

#### 5. StatusIndicator 组件

状态指示器。

```typescript
interface StatusIndicatorProps {
  status: StatusType
  message?: string
  detail?: string
}

type StatusType = 'idle' | 'thinking' | 'executing' | 'waiting'
```

#### 6. InputArea 组件

输入区域组件。

```typescript
interface InputAreaProps {
  onSubmit: (input: string) => void
  disabled: boolean
  mode: 'auto' | 'manual'
  history: string[]
}
```

### 自定义 Hooks

#### useRunner Hook

封装 Runner 交互逻辑。

```typescript
interface UseRunnerOptions {
  config: ReplConfig
  onPermissionRequest: (request: PermissionRequest) => Promise<boolean>
}

interface UseRunnerReturn {
  run: (input: string) => Promise<void>
  cancel: () => void
  isRunning: boolean
  events: RunnerEvent[]
}
```

#### useKeyboard Hook

处理键盘快捷键。

```typescript
interface UseKeyboardOptions {
  onEscape: () => void
  onCtrlC: () => void
  onCtrlO: () => void
  onArrowUp: () => void
  onArrowDown: () => void
}
```

#### useMessages Hook

管理消息状态。

```typescript
interface UseMessagesReturn {
  messages: Message[]
  addUserMessage: (content: string) => void
  addAIMessage: (content: string) => void
  addToolCall: (tool: ToolCall) => void
  updateToolCall: (id: string, update: Partial<ToolCall>) => void
  clear: () => void
}
```

## 数据模型

### 消息类型

```typescript
// 消息基础类型
interface BaseMessage {
  id: string
  timestamp: number
}

// 用户消息
interface UserMessage extends BaseMessage {
  type: 'user'
  content: string
}

// AI 消息
interface AIMessage extends BaseMessage {
  type: 'ai'
  content: string
  isStreaming: boolean
  model: string
}

// 工具调用消息
interface ToolMessage extends BaseMessage {
  type: 'tool'
  tool: ToolCall
}

// 系统消息（错误、提示等）
interface SystemMessage extends BaseMessage {
  type: 'system'
  level: 'info' | 'warning' | 'error'
  content: string
}

type Message = UserMessage | AIMessage | ToolMessage | SystemMessage
```

### 工具调用状态

```typescript
interface ToolCall {
  id: string
  name: ToolName
  displayName: string
  input: ToolInput
  output?: string
  isError: boolean
  status: ToolStatus
  startTime: number
  endTime?: number
}

type ToolName = 'read' | 'write' | 'edit' | 'bash' | 'glob' | 'grep'
type ToolStatus = 'pending' | 'running' | 'completed' | 'error'

// 工具输入类型
interface ReadToolInput {
  filePath: string
}

interface WriteToolInput {
  filePath: string
  content: string
}

interface BashToolInput {
  command: string
}

type ToolInput = ReadToolInput | WriteToolInput | BashToolInput | Record<string, unknown>
```

### 应用状态

```typescript
interface AppState {
  // 会话状态
  messages: Message[]
  isRunning: boolean
  abortController: AbortController | null
  
  // 配置状态
  autoConfirm: boolean
  currentAgent: AgentType
  currentModel: string
  cwd: string
  
  // UI 状态
  showWelcome: boolean
  showHelp: boolean
  expandedTools: Set<string>
  inputHistory: string[]
  historyIndex: number
  
  // 权限对话框状态
  pendingPermission: PermissionRequest | null
  permissionResolver: ((result: boolean) => void) | null
  
  // 状态指示器
  status: StatusType
  statusMessage: string
  statusDetail: string
}
```

### 配置

```typescript
interface ReplConfig {
  cwd: string
  agent: AgentType
  model?: string
  autoConfirm: boolean
}

type AgentType = 'build' | 'plan' | 'explore'
```

## 正确性属性

*属性是指在系统所有有效执行中都应保持为真的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性是人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1: 工具面板渲染完整性

*对于任何* 具有任意状态（pending、running、completed、error）的 ToolCall 对象，渲染的 ToolPanel 输出必须包含：
- 工具名称
- 输入摘要（read/write/edit 的文件路径，bash 的命令，glob/grep 的模式）
- 当状态为 'completed' 或 'error' 时：状态指示器和结果摘要
- 当展开时：完整的输入参数和输出内容

**验证: 需求 2.1, 2.2, 2.4, 2.5**

### 属性 2: 工具面板切换状态一致性

*对于任何* 工具面板集合和任意切换操作序列，切换特定面板只能影响该面板的展开状态，且展开状态必须是其先前状态的逻辑反转。

**验证: 需求 2.3, 2.6**

### 属性 3: 权限对话框内容完整性

*对于任何* PermissionRequest 对象，渲染的 PermissionDialog 必须包含：
- 操作类型（read、write、edit、bash、glob、grep）
- 资源路径或命令
- 操作描述

**验证: 需求 3.1, 3.5**

### 属性 4: 权限对话框"总是允许"状态转换

*对于任何* 用户选择"总是允许"的权限对话框交互，应用的 autoConfirm 状态必须从 false 转换为 true，并在会话期间保持为 true。

**验证: 需求 3.4**

### 属性 5: 状态指示器状态映射

*对于任何* StatusType 值，StatusIndicator 必须渲染：
- 'idle': 无可见指示器（空或隐藏）
- 'thinking': 带有"思考中..."文本的 spinner
- 'executing': 带有工具名称和描述的 spinner
- 'waiting': 带有等待消息的 spinner

**验证: 需求 4.1, 4.2, 4.3, 4.4**

### 属性 6: 消息渲染类型区分

*对于任何* Message 对象，渲染输出必须：
- 对于 UserMessage：包含用户标题模式 "═══ Me ═══" 或类似
- 对于 AIMessage：在标题中包含模型名称
- 对于包含 Markdown 的内容：包含适当的 ANSI 格式化代码

**验证: 需求 5.1, 5.2, 5.3**

### 属性 7: 流式消息累积

*对于任何* 流式 AI 消息的文本块序列，累积的内容必须等于所有块按顺序的连接，且组件必须处理部分更新而不丢失内容。

**验证: 需求 5.5**

### 属性 8: 命令处理有效性

*对于任何* 以 "/" 开头的输入字符串，命令处理器必须：
- 识别有效命令（/help、/clear、/agent、/model、/exit 等）并执行相应的处理器
- 对于无效命令：显示错误消息，指示命令未知

**验证: 需求 6.1, 6.6**

### 属性 9: 键盘快捷键模式切换

*对于任何* 在 autoConfirm 为 true 时匹配 Escape 或 Alt+P 的按键事件，autoConfirm 状态必须转换为 false。

**验证: 需求 6.2**

### 属性 10: Ctrl+C 任务取消

*对于任何* 在 isRunning 为 true 时的 Ctrl+C 按键事件，必须调用 abort controller 的 abort() 方法。

**验证: 需求 6.3**

### 属性 11: 提示符模式指示

*对于任何* 提示符渲染，视觉输出必须包含区分 auto 模式和 manual 模式的指示器。

**验证: 需求 6.4**

### 属性 12: 历史导航边界

*对于任何* 历史数组和任意上/下方向键事件序列，历史索引必须保持在 [0, history.length] 范围内，且导航必须返回正确的历史条目。

**验证: 需求 6.5**

### 属性 13: 欢迎界面配置显示

*对于任何* ReplConfig 对象，欢迎界面必须显示：
- 当前 agent 类型
- 当前模型名称（或默认值）
- 权限模式（auto/manual）
- 当前工作目录

**验证: 需求 7.2, 7.5**

### 属性 14: Runner 事件处理器兼容性

*对于任何* Runner 发出的事件（text、tool_start、tool_end、error、done），Ink UI 事件处理器必须处理该事件并相应更新 UI 状态，不抛出错误。

**验证: 需求 8.2**

## 错误处理

### 终端兼容性错误

```typescript
// 检测终端是否支持 Ink
function checkTerminalSupport(): boolean {
  // 检查是否为 TTY
  if (!process.stdout.isTTY) {
    return false
  }
  
  // 检查是否支持 ANSI
  if (process.env.TERM === 'dumb') {
    return false
  }
  
  return true
}

// 启动时检查，不支持则回退到旧 REPL
if (!checkTerminalSupport()) {
  console.warn('终端不支持 Ink，使用传统 REPL 模式')
  return startLegacyRepl(config)
}
```

### Runner 错误处理

```typescript
// 在 useRunner hook 中处理错误
const handleRunnerError = (error: Error) => {
  // 区分错误类型
  if (error.name === 'AbortError') {
    // 用户取消，不显示错误
    return
  }
  
  if (error.message.includes('API')) {
    // API 错误，显示友好提示
    addSystemMessage('error', `API 错误: ${error.message}`)
  } else {
    // 其他错误
    addSystemMessage('error', `执行错误: ${error.message}`)
  }
}
```

### 权限对话框超时

```typescript
// 权限请求超时处理
const PERMISSION_TIMEOUT = 60000 // 60 秒

const requestPermission = async (request: PermissionRequest): Promise<boolean> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // 超时默认拒绝
      resolve(false)
    }, PERMISSION_TIMEOUT)
    
    setPendingPermission(request)
    setPermissionResolver((result) => {
      clearTimeout(timeout)
      resolve(result)
    })
  })
}
```

### 渲染错误边界

```tsx
// React 错误边界组件
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column">
          <Text color="red">UI 渲染错误</Text>
          <Text color="gray">{this.state.error?.message}</Text>
          <Text>请尝试 /clear 或重启</Text>
        </Box>
      )
    }
    return this.props.children
  }
}
```

## 测试策略

### 测试框架

- **vitest**: 单元测试和属性测试运行器
- **fast-check**: 属性测试库
- **ink-testing-library**: Ink 组件测试工具

### 单元测试

单元测试用于验证具体示例和边界情况：

1. **组件渲染测试**: 验证组件在特定输入下的渲染输出
2. **Hook 行为测试**: 验证自定义 hooks 的状态管理
3. **命令解析测试**: 验证斜杠命令的解析和执行
4. **边界情况测试**: 空输入、超长内容、特殊字符等

### 属性测试

属性测试用于验证通用属性，每个测试运行至少 100 次迭代：

```typescript
// 示例：工具面板渲染属性测试
describe('ToolPanel 属性测试', () => {
  // 功能: ink-terminal-ui, 属性 1: 工具面板渲染完整性
  it('对于任何工具调用都应渲染所有必需元素', () => {
    fc.assert(
      fc.property(
        arbitraryToolCall(),
        (toolCall) => {
          const { lastFrame } = render(<ToolPanel tool={toolCall} isExpanded={false} onToggle={() => {}} />)
          const output = lastFrame()
          
          // 验证包含工具名称
          expect(output).toContain(toolCall.displayName)
          
          // 验证包含输入摘要
          if (toolCall.status === 'completed' || toolCall.status === 'error') {
            expect(output).toMatch(/[✓✗]/)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

### 测试文件结构

```
packages/agent/test/cli/ink/
├── components/
│   ├── ToolPanel.test.tsx
│   ├── ToolPanel.property.test.tsx
│   ├── PermissionDialog.test.tsx
│   ├── PermissionDialog.property.test.tsx
│   ├── StatusIndicator.test.tsx
│   ├── StatusIndicator.property.test.tsx
│   ├── MessageList.test.tsx
│   └── MessageList.property.test.tsx
├── hooks/
│   ├── useRunner.test.ts
│   ├── useKeyboard.test.ts
│   └── useMessages.test.ts
└── utils/
    ├── format.test.ts
    └── colors.test.ts
```

### 测试覆盖率目标

- 语句覆盖率: 80%
- 分支覆盖率: 75%
- 函数覆盖率: 85%
- 行覆盖率: 80%

### 属性测试标注格式

每个属性测试必须包含注释标注：

```typescript
// 功能: ink-terminal-ui, 属性 N: [属性标题]
// 验证: 需求 X.Y, X.Z
```
