# NaughtAgent VS Code 插件设计方案

## 1. 概述

### 1.1 目标
在 VS Code 中实现一个 AI 编程助手，类似 Claude Code / Cursor / GitHub Copilot Chat，但完全自主可控。

### 1.2 架构
```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Chat View  │  │  Diff View  │  │  Status Bar Item    │  │
│  │  (Webview)  │  │  (Native)   │  │  (Quick Actions)    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│  ┌──────┴────────────────┴─────────────────────┴──────────┐  │
│  │                   Extension Host                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │  │
│  │  │ Commands │  │ Context  │  │ Session  │  │ Config │  │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │  │
│  └───────┼─────────────┼─────────────┼────────────┼───────┘  │
└──────────┼─────────────┼─────────────┼────────────┼──────────┘
           │             │             │            │
           └─────────────┴──────┬──────┴────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   Agent Service       │
                    │   (HTTP + WebSocket)  │
                    │   localhost:3000      │
                    └───────────────────────┘
```

### 1.3 核心原则
1. **显式触发** - 只有用户主动调用时 AI 才工作
2. **人工确认** - 文件修改必须经用户确认才应用
3. **流式输出** - 实时显示 AI 响应
4. **上下文感知** - 自动收集当前文件、选中代码、项目结构

---

## 2. 功能规划

### 2.1 Phase 1: 基础对话 (MVP)
- [ ] Chat 面板（Webview）
- [ ] 发送消息和接收响应
- [ ] 流式输出显示
- [ ] 基本 Markdown 渲染
- [ ] 代码高亮

### 2.2 Phase 2: 上下文集成
- [ ] 当前文件上下文
- [ ] 选中代码上下文
- [ ] @file 引用文件
- [ ] @workspace 项目结构
- [ ] @git 版本信息

### 2.3 Phase 3: 工具交互
- [ ] 文件操作确认对话框
- [ ] Diff 预览（使用 VS Code 原生 Diff）
- [ ] 命令执行确认
- [ ] 操作撤销

### 2.4 Phase 4: 高级功能
- [ ] 内联代码建议
- [ ] 快捷命令（/commit, /review 等）
- [ ] 多会话管理
- [ ] 历史记录

### 2.5 Phase 5: 体验优化
- [ ] 快捷键绑定
- [ ] 状态栏集成
- [ ] 设置面板
- [ ] 主题适配

---

## 3. 技术方案

### 3.1 项目结构
```
packages/vscode/
├── src/
│   ├── extension.ts          # 插件入口
│   ├── commands/             # 命令注册
│   │   ├── index.ts
│   │   ├── chat.ts           # 打开聊天
│   │   ├── ask.ts            # 快速提问
│   │   └── actions.ts        # 快捷操作
│   ├── views/
│   │   ├── chat/             # Chat Webview
│   │   │   ├── ChatViewProvider.ts
│   │   │   └── webview/      # 前端代码
│   │   │       ├── index.html
│   │   │       ├── main.ts
│   │   │       ├── styles.css
│   │   │       └── components/
│   │   └── diff/             # Diff 预览
│   │       └── DiffProvider.ts
│   ├── services/
│   │   ├── AgentClient.ts    # Agent 服务客户端
│   │   ├── ContextCollector.ts # 上下文收集
│   │   └── SessionManager.ts # 会话管理
│   ├── utils/
│   │   ├── config.ts         # 配置管理
│   │   └── logger.ts         # 日志
│   └── types.ts              # 类型定义
├── webview/                  # Webview 前端（可选独立构建）
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── package.json
├── tsconfig.json
└── esbuild.js                # 构建脚本
```

### 3.2 依赖关系
```json
{
  "dependencies": {
    "ws": "^8.x"               // WebSocket 客户端
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@vscode/webview-ui-toolkit": "^1.4.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  }
}
```

### 3.3 与 Agent 服务通信

#### HTTP API（会话管理）
```typescript
// 创建会话
POST /sessions
{ agentType: "build", cwd: "/path/to/project" }

// 发送消息（SSE 流式）
POST /sessions/:id/messages
{ message: "帮我写一个函数" }
Content-Type: text/event-stream
```

#### WebSocket（实时交互）
```typescript
// 连接
ws://localhost:3000/ws?sessionId=xxx

// 发送消息
{ type: "message", content: "你好" }

// 接收事件
{ type: "text", content: "..." }
{ type: "tool_start", name: "read", input: {...} }
{ type: "tool_end", output: "..." }
{ type: "permission_request", ... }
{ type: "done", usage: {...} }
```

---

## 4. 核心组件设计

### 4.1 AgentClient

```typescript
// src/services/AgentClient.ts

export interface AgentClientConfig {
  baseURL: string;        // 默认 http://localhost:3000
  wsURL: string;          // 默认 ws://localhost:3000
}

export interface AgentMessage {
  type: 'text' | 'tool_start' | 'tool_end' | 'permission_request' | 'error' | 'done';
  content?: string;
  // ...
}

export class AgentClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;

  constructor(private config: AgentClientConfig) {}

  // 创建会话
  async createSession(cwd: string, agentType: string): Promise<string>;

  // 发送消息（返回 AsyncIterator 用于流式处理）
  async *sendMessage(message: string): AsyncGenerator<AgentMessage>;

  // 响应权限请求
  async respondPermission(requestId: string, allowed: boolean): Promise<void>;

  // 关闭会话
  async closeSession(): Promise<void>;
}
```

### 4.2 ChatViewProvider

```typescript
// src/views/chat/ChatViewProvider.ts

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'naughtagent.chatView';

  private _view?: vscode.WebviewView;
  private agentClient: AgentClient;
  private contextCollector: ContextCollector;

  constructor(
    private readonly extensionUri: vscode.Uri,
    agentClient: AgentClient,
    contextCollector: ContextCollector
  ) {}

  // 实现 WebviewViewProvider
  resolveWebviewView(webviewView: vscode.WebviewView): void;

  // 发送消息到 Webview
  private postMessage(message: any): void;

  // 处理来自 Webview 的消息
  private handleWebviewMessage(message: any): void;

  // 发送用户消息到 Agent
  public async sendMessage(text: string): Promise<void>;
}
```

### 4.3 ContextCollector

```typescript
// src/services/ContextCollector.ts

export interface CollectedContext {
  currentFile?: {
    path: string;
    content: string;
    language: string;
  };
  selection?: {
    text: string;
    startLine: number;
    endLine: number;
  };
  referencedFiles?: Array<{
    path: string;
    content: string;
  }>;
  workspaceInfo?: {
    name: string;
    rootPath: string;
    fileCount: number;
  };
  gitInfo?: {
    branch: string;
    status: string;
    recentCommits: string[];
  };
}

export class ContextCollector {
  // 收集当前上下文
  async collect(): Promise<CollectedContext>;

  // 解析 @file 引用
  async resolveFileReference(ref: string): Promise<string>;

  // 构建上下文提示
  buildContextPrompt(context: CollectedContext): string;
}
```

### 4.4 Webview 前端

```typescript
// webview/src/main.ts

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'pending' | 'streaming' | 'done' | 'error';
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  name: string;
  input: any;
  output?: string;
  status: 'running' | 'done' | 'error';
}

// 与 Extension Host 通信
const vscode = acquireVsCodeApi();

// 发送消息
function sendMessage(text: string) {
  vscode.postMessage({ type: 'sendMessage', text });
}

// 接收消息
window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'addMessage':
      // 添加新消息
      break;
    case 'updateMessage':
      // 更新消息（流式）
      break;
    case 'showPermissionRequest':
      // 显示权限确认
      break;
  }
});
```

---

## 5. 用户交互流程

### 5.1 基本对话流程
```
用户输入 "帮我写一个排序函数"
    │
    ▼
Extension 收集上下文（当前文件、选中代码）
    │
    ▼
发送到 Agent Service（WebSocket）
    │
    ▼
Agent 调用 LLM，流式返回响应
    │
    ▼
Webview 实时显示 AI 回复
    │
    ▼
如果 AI 要写文件 → 显示 Diff 预览 → 用户确认 → 应用修改
```

### 5.2 权限确认流程
```
Agent 请求执行 bash 命令
    │
    ▼
Extension 收到 permission_request 事件
    │
    ▼
显示确认对话框：
  ┌─────────────────────────────────────┐
  │  🔧 Agent 请求执行命令              │
  │                                     │
  │  npm install lodash                 │
  │                                     │
  │  [允许]  [拒绝]  [始终允许此类操作]  │
  └─────────────────────────────────────┘
    │
    ▼
用户选择 → 发送响应到 Agent
```

### 5.3 文件修改流程
```
Agent 请求写入文件 src/utils.ts
    │
    ▼
Extension 收到 tool_start (write) 事件
    │
    ▼
打开 VS Code Diff 编辑器：
  ┌─────────────────────────────────────┐
  │  src/utils.ts (Original ↔ Modified) │
  │  ─────────────────────────────────  │
  │  - const old = 1;                   │
  │  + const new = 2;                   │
  │  ─────────────────────────────────  │
  │  [应用修改]  [放弃]                  │
  └─────────────────────────────────────┘
    │
    ▼
用户确认 → 应用修改 → 通知 Agent 继续
```

---

## 6. 配置项

```json
// package.json contributes.configuration
{
  "naughtagent.serverUrl": {
    "type": "string",
    "default": "http://localhost:3000",
    "description": "Agent 服务地址"
  },
  "naughtagent.defaultAgent": {
    "type": "string",
    "enum": ["build", "plan", "explore"],
    "default": "build",
    "description": "默认 Agent 类型"
  },
  "naughtagent.autoConfirm": {
    "type": "object",
    "properties": {
      "read": { "type": "boolean", "default": true },
      "glob": { "type": "boolean", "default": true },
      "grep": { "type": "boolean", "default": true },
      "write": { "type": "boolean", "default": false },
      "edit": { "type": "boolean", "default": false },
      "bash": { "type": "boolean", "default": false }
    },
    "description": "自动确认的操作类型"
  },
  "naughtagent.contextInclude": {
    "type": "array",
    "default": ["currentFile", "selection"],
    "description": "自动包含的上下文"
  }
}
```

---

## 7. 命令注册

```json
// package.json contributes.commands
[
  {
    "command": "naughtagent.openChat",
    "title": "打开 AI 助手",
    "category": "NaughtAgent"
  },
  {
    "command": "naughtagent.askAboutSelection",
    "title": "询问选中代码",
    "category": "NaughtAgent"
  },
  {
    "command": "naughtagent.explainCode",
    "title": "解释代码",
    "category": "NaughtAgent"
  },
  {
    "command": "naughtagent.fixCode",
    "title": "修复代码",
    "category": "NaughtAgent"
  },
  {
    "command": "naughtagent.generateTests",
    "title": "生成测试",
    "category": "NaughtAgent"
  },
  {
    "command": "naughtagent.commit",
    "title": "智能提交",
    "category": "NaughtAgent"
  }
]
```

---

## 8. 快捷键

```json
// package.json contributes.keybindings
[
  {
    "command": "naughtagent.openChat",
    "key": "ctrl+shift+a",
    "mac": "cmd+shift+a"
  },
  {
    "command": "naughtagent.askAboutSelection",
    "key": "ctrl+shift+e",
    "mac": "cmd+shift+e",
    "when": "editorHasSelection"
  }
]
```

---

## 9. 开发计划

### Phase 1: MVP (1-2 周)
1. 项目初始化和构建配置
2. 基础 Webview Chat 面板
3. AgentClient 实现（HTTP + WebSocket）
4. 消息发送和流式接收
5. 基本 Markdown 渲染

### Phase 2: 上下文 (1 周)
1. ContextCollector 实现
2. 当前文件和选中代码
3. @file 引用解析
4. 上下文提示构建

### Phase 3: 工具交互 (1-2 周)
1. 权限确认对话框
2. Diff 预览集成
3. 文件修改确认流程
4. 操作撤销支持

### Phase 4: 完善 (1 周)
1. 快捷命令支持
2. 多会话管理
3. 设置面板
4. 错误处理和重连

---

## 10. 启动方式

### 开发模式
```bash
# 终端 1: 启动 Agent 服务
cd packages/agent
npm run dev:server

# 终端 2: 启动插件开发
cd packages/vscode
npm run watch

# 按 F5 启动 Extension Development Host
```

### 生产模式
```bash
# 构建插件
cd packages/vscode
npm run package

# 安装 .vsix 文件
code --install-extension naughtagent-0.1.0.vsix
```

---

## 11. 后续扩展

1. **内联补全** - 类似 Copilot 的代码补全
2. **代码审查** - PR 审查集成
3. **终端集成** - 在终端中使用 Agent
4. **多模型支持** - 支持其他 LLM
5. **团队协作** - 共享会话和配置
