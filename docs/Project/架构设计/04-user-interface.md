# 用户界面层

用户界面层提供多种交互方式：CLI TUI、IDE 集成、HTTP API。

## 1. CLI 终端界面

### Ink TUI 架构

```
┌─────────────────────────────────────────┐
│  App.tsx                                │
│  ├── StatusIndicator    状态栏          │
│  ├── MessageList        消息列表        │
│  │   ├── UserMessage    用户消息        │
│  │   └── AIMessage      AI 响应         │
│  ├── SubAgentPanel      子代理面板      │
│  ├── InputArea          输入区域        │
│  └── PermissionDialog   权限确认对话框   │
└─────────────────────────────────────────┘
```

### 核心组件

| 组件 | 文件 | 功能 |
|------|------|------|
| App | `cli/ink/App.tsx` | 主应用容器 |
| MessageList | `cli/ink/components/MessageList.tsx` | 消息列表，分轮次展示 |
| AIMessage | `cli/ink/components/AIMessage.tsx` | AI 响应渲染 |
| InputArea | `cli/ink/components/InputArea.tsx` | 多行输入 |
| StatusIndicator | `cli/ink/components/StatusIndicator.tsx` | Token/模型/模式状态 |
| PermissionDialog | `cli/ink/components/PermissionDialog.tsx` | 权限确认 |
| SubAgentPanel | `cli/ink/components/SubAgentPanel.tsx` | 子代理进度 |
| CommandPrompt | `cli/ink/components/CommandPrompt.tsx` | 命令补全 |
| HelpView | `cli/ink/components/HelpView.tsx` | 帮助界面 |

### 命令系统

```typescript
// command/builtin/index.ts
const builtinCommands = [
  { name: "help", description: "显示帮助" },
  { name: "mode", description: "切换权限模式" },
  { name: "config", description: "查看配置" },
  { name: "history", description: "查看历史" },
  { name: "alias", description: "管理别名" },
  { name: "init", description: "初始化项目" },
]
```

## 2. VS Code 扩展

### 扩展架构

```
packages/vscode/src/
├── extension.ts           # 入口，激活/停用
├── commands/              # VS Code 命令
│   └── index.ts
├── services/              # 服务层
│   ├── AgentClient.ts     # Agent 通信客户端
│   ├── DaemonClient.ts    # Daemon 连接管理
│   ├── ContextCollector.ts # 上下文收集
│   ├── DiffProvider.ts    # Diff 预览
│   └── FileReferenceProvider.ts
└── views/                 # 视图
    ├── chat/
    │   └── ChatViewProvider.ts  # Webview Chat
    └── SessionPicker.ts   # 会话选择器
```

### 已实现功能

| 功能 | 状态 | 说明 |
|------|------|------|
| Webview Chat | ✅ | 侧边栏聊天面板 |
| 上下文收集 | ✅ | 当前文件、选中代码 |
| 会话管理 | ✅ | 新建、切换、删除会话 |
| Daemon 连接 | ✅ | 自动连接、重连 |
| 状态栏 | ✅ | 连接状态指示 |
| 右键菜单 | ✅ | 询问/解释/修复代码 |
| 快捷键 | ✅ | Ctrl+Shift+A 打开聊天 |

### 待实现功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| Diff Editor 集成 | P1 | 修改预览和确认 |
| 内联补全 | P2 | Inline Completion Provider |
| Code Actions | P2 | 快速修复建议 |
| 诊断集成 | P2 | Problems Panel 联动 |
| 终端集成 | P2 | 在 VS Code 终端执行命令 |
| 文件装饰器 | P3 | AI 修改标记 |

## 3. HTTP API

### Daemon 服务

```
默认地址：http://127.0.0.1:31415
```

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/daemon/status` | GET | Daemon 状态 |
| `/sessions` | GET | 会话列表 |
| `/sessions` | POST | 创建会话 |
| `/sessions/:id` | GET | 获取会话 |
| `/sessions/:id` | DELETE | 删除会话 |
| `/sessions/:id/messages` | POST | 发送消息 |
| `/sessions/:id/messages/stream` | POST | 流式发送（SSE） |
| `/skills` | GET | 技能列表 |
| `/skills/:name` | POST | 执行技能 |
| `/tasks` | GET/POST | 任务管理 |

### WebSocket

```
ws://127.0.0.1:31415/ws?session={sessionId}
```

事件类型：
- `text` - 文本输出
- `tool_start` - 工具开始执行
- `tool_end` - 工具执行完成
- `error` - 错误
- `done` - 完成

## 4. 关键文件索引

| 文件 | 职责 |
|------|------|
| `cli/cli.ts` | CLI 入口、参数解析 |
| `cli/ink/App.tsx` | Ink TUI 主组件 |
| `cli/repl-ink.ts` | Ink REPL 启动 |
| `server/server.ts` | HTTP 服务器 |
| `server/routes.ts` | API 路由 |
| `server/websocket.ts` | WebSocket 服务 |
| `vscode/extension.ts` | VS Code 扩展入口 |
| `vscode/views/chat/ChatViewProvider.ts` | Chat Webview |
