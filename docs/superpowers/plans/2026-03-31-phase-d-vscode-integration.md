# Phase D: VS Code IDE 集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VS Code 扩展 MVP — Chat 面板能发送消息、接收流式回复、显示工具调用

**Architecture:** VS Code WebviewViewProvider + Daemon 通信。扩展通过 HTTP/WebSocket 连接 NaughtAgent Daemon，Webview 渲染聊天界面。不做 @file 补全、Diff 预览、多会话。

**Tech Stack:** TypeScript, VS Code Extension API, WebviewViewProvider, Markdown rendering

**Current State Analysis:**
- `packages/vscode/` 已存在，有基础骨架 (1890行):
  - `extension.ts` (248行): 激活入口
  - `services/AgentClient.ts` (417行): Agent 通信客户端
  - `services/DaemonClient.ts` (272行): Daemon 连接
  - `services/DiffProvider.ts` (296行): Diff 展示
  - `services/ContextCollector.ts` (177行): 上下文收集
  - `views/SessionPicker.ts` (241行): 会话选择器
  - `commands/index.ts` (96行): 命令注册
- **缺失**: `ChatViewProvider`（核心聊天面板）和对应的 Webview HTML/JS/CSS

---

## File Structure

### Files to Create
- `packages/vscode/src/views/chat/ChatViewProvider.ts` — WebviewViewProvider 实现
- `packages/vscode/src/views/chat/webview/index.html` — Webview 入口
- `packages/vscode/src/views/chat/webview/main.ts` — 消息处理 + 渲染
- `packages/vscode/src/views/chat/webview/styles.css` — VS Code 主题变量适配
- `packages/vscode/src/views/chat/webview/markdown.ts` — Markdown 渲染 + 代码高亮

### Files to Modify
- `packages/vscode/src/extension.ts` — 注册 ChatViewProvider
- `packages/vscode/package.json` — 添加 viewsContainers + views 配置

---

## Task 1: ChatViewProvider 骨架

**Files:**
- Create: `packages/vscode/src/views/chat/ChatViewProvider.ts`
- Modify: `packages/vscode/src/extension.ts`
- Modify: `packages/vscode/package.json`

- [ ] **Step 1: 在 package.json 添加 Chat 视图配置**

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "naughtyagent",
        "title": "NaughtyAgent",
        "icon": "resources/icon.svg"
      }]
    },
    "views": {
      "naughtyagent": [{
        "type": "webview",
        "id": "naughtyagent.chat",
        "name": "Chat"
      }]
    }
  }
}
```

- [ ] **Step 2: 创建 ChatViewProvider**

```typescript
// packages/vscode/src/views/chat/ChatViewProvider.ts
import * as vscode from "vscode"

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "naughtyagent.chat"
  private _view?: vscode.WebviewView

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    }
    webviewView.webview.html = this._getHtml(webviewView.webview)
    webviewView.webview.onDidReceiveMessage(this._onMessage.bind(this))
  }

  private _onMessage(message: { type: string; content?: string }) {
    switch (message.type) {
      case "send":
        this._handleUserMessage(message.content ?? "")
        break
    }
  }

  private async _handleUserMessage(text: string) {
    // TODO: Task 2 连接 Daemon
    this._view?.webview.postMessage({
      type: "assistant",
      content: `Echo: ${text}`,
    })
  }

  private _getHtml(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html><head><style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 8px; display: flex; flex-direction: column; height: 100vh; }
  #messages { flex: 1; overflow-y: auto; }
  .msg { margin: 4px 0; padding: 8px; border-radius: 4px; }
  .user { background: var(--vscode-input-background); }
  .assistant { background: var(--vscode-editor-inactiveSelectionBackground); }
  #input-area { display: flex; gap: 4px; padding-top: 8px; }
  #input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; border-radius: 4px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
</style></head><body>
  <div id="messages"></div>
  <div id="input-area">
    <input id="input" placeholder="Type a message..." />
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi()
    const messages = document.getElementById("messages")
    const input = document.getElementById("input")
    document.getElementById("send").addEventListener("click", () => {
      const text = input.value.trim()
      if (!text) return
      addMessage("user", text)
      vscode.postMessage({ type: "send", content: text })
      input.value = ""
    })
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("send").click() })
    window.addEventListener("message", (e) => {
      const msg = e.data
      if (msg.type === "assistant") addMessage("assistant", msg.content)
      if (msg.type === "text_delta") appendDelta(msg.delta)
      if (msg.type === "tool_start") addToolIndicator(msg.name)
    })
    function addMessage(role, text) {
      const el = document.createElement("div"); el.className = "msg " + role; el.textContent = text
      messages.appendChild(el); messages.scrollTop = messages.scrollHeight
    }
    function appendDelta(delta) {
      let last = messages.lastElementChild
      if (!last || !last.classList.contains("streaming")) {
        last = document.createElement("div"); last.className = "msg assistant streaming"
        messages.appendChild(last)
      }
      last.textContent += delta; messages.scrollTop = messages.scrollHeight
    }
    function addToolIndicator(name) {
      const el = document.createElement("div"); el.className = "msg tool"
      el.textContent = "🔧 " + name + "..."; messages.appendChild(el)
    }
  </script>
</body></html>`
  }
}
```

- [ ] **Step 3: 在 extension.ts 注册 Provider**

```typescript
const chatProvider = new ChatViewProvider(context.extensionUri)
context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
)
```

- [ ] **Step 4: 编译验证**

Run: `cd packages/vscode && npm run compile` (或 tsc)

- [ ] **Step 5: Commit**

```bash
git add packages/vscode/
git commit -m "feat: ChatViewProvider skeleton with inline HTML"
```

---

## Task 2: 连接 Daemon（流式通信）

**Files:**
- Modify: `packages/vscode/src/views/chat/ChatViewProvider.ts`
- Use: `packages/vscode/src/services/DaemonClient.ts`

- [ ] **Step 1: 注入 DaemonClient 到 ChatViewProvider**

```typescript
constructor(
  private readonly _extensionUri: vscode.Uri,
  private readonly _daemonClient: DaemonClient
) {}
```

- [ ] **Step 2: 实现 _handleUserMessage 连接 Daemon**

通过 DaemonClient 发送消息，监听流式事件（text_delta, tool_start, done），postMessage 到 Webview。

- [ ] **Step 3: 处理流式事件**

```typescript
private async _handleUserMessage(text: string) {
  const stream = this._daemonClient.chat(text)
  for await (const event of stream) {
    this._view?.webview.postMessage(event)
  }
}
```

- [ ] **Step 4: 测试（手动）**

1. 启动 Daemon: `na --daemon`
2. 在 VS Code 中打开 Chat 面板
3. 发送消息，验证流式回复

- [ ] **Step 5: Commit**

---

## Task 3: Markdown 渲染 + 代码高亮

**Files:**
- Modify: Webview HTML/JS — 添加 marked.js + highlight.js
- Or: 使用 VS Code 内置 Markdown API

- [ ] **Step 1: 在 Webview 中集成 Markdown 渲染**

使用 `marked` 库将 assistant 回复渲染为 HTML，代码块使用 `highlight.js` 高亮。

- [ ] **Step 2: 工具调用展示美化**

工具名称 + 状态（running/completed/error）图标。

- [ ] **Step 3: Commit**

---

## Task 4: 权限确认弹窗

**Files:**
- Modify: ChatViewProvider — 处理 permission_request 事件

- [ ] **Step 1: 接收 Daemon 的权限请求事件**

- [ ] **Step 2: 使用 vscode.window.showWarningMessage 弹窗**

```typescript
const choice = await vscode.window.showWarningMessage(
  `NaughtyAgent wants to run: ${toolName}`,
  "Allow", "Deny"
)
```

- [ ] **Step 3: 发送权限响应回 Daemon**

- [ ] **Step 4: Commit**

---

## Phase D 完成标准

- [ ] VS Code 扩展能编译 (`pnpm --filter @naughtyagent/vscode build`)
- [ ] VSIX 安装后能打开 Chat 面板
- [ ] 能发送消息并接收流式回复
- [ ] Markdown 正确渲染（代码块高亮）
- [ ] 工具调用有视觉反馈
- [ ] 权限确认弹窗工作

---

## 工作量评估

| Task | 预估 | 复杂度 |
|------|------|--------|
| Task 1: ChatViewProvider 骨架 | 2 步 | 中 |
| Task 2: Daemon 流式通信 | 2-3 步 | 高（涉及 DaemonClient 协议） |
| Task 3: Markdown + 代码高亮 | 2 步 | 中 |
| Task 4: 权限弹窗 | 1 步 | 低 |
| **总计** | **3-5 个会话** | |

Phase D 是最大的工作量，因为涉及 Webview 全栈开发和 DaemonClient 流式协议接通。
