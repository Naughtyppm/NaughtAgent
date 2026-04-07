# NaughtAgent VSCode 扩展 V2 功能设计

> 日期: 2026-04-05 | 4 个新功能的统一设计文档

## 1. 流式布局优化

### 目标
参考 VS Code Copilot Chat 的体验：思考 → 工具 → 文字交替流式展示，底部 TodoList 可视化。

### 当前问题
- 每次 `render()` 重绘全部 DOM（`innerHTML = ''`），闪烁严重
- 无 TodoList 展示

### 改动

**chat.js:**
- 增量 DOM 更新：只追加/修改变化的消息，不清空重绘
- 新增 `renderTodoList()` — 底部固定的待办面板

**ChatViewProvider.ts:**
- 新增 `todo_updated` 事件处理：daemon 的 TodoUpdateCallback → WS 消息
- `WebviewOutboundMessage` 新增 `todoList` 字段

**AgentMessage 扩展:**
```typescript
type: 'todo_updated'  // 新增
todoList?: { id: string; title: string; status: 'pending'|'in_progress'|'done' }[]
```

## 2. 多模态输入

### 目标
支持图片拖拽/粘贴到输入框，作为 Anthropic Vision API 的 image content 发送。

### 改动

**chat.js:**
- 输入区新增拖拽放置区（drop zone）
- 支持 `paste` 事件捕获剪贴板图片
- 附件预览条：显示已附加的图片缩略图，支持删除
- `sendMessage()` 携带 `attachments: [{type:'image', data: base64, mimeType}]`

**ChatViewProvider.ts:**
- `WebviewInboundMessage.send` 新增 `attachments` 字段
- `buildPrompt()` 处理附件，构建多模态 content
- CSP 新增 `img-src data:` 允许 base64 图片预览

**AgentClient.ts:**
- `sendMessage()` 新增 `attachments` 参数，通过 WS 传递

**Daemon 侧（不在本次范围，但需确认接口）：**
- WS `send` 消息需支持 `attachments` 字段

## 3. 用量和请求统计

### 目标
展示当前会话 token 消耗和请求次数。

### 当前状态
- Daemon `done` 事件已包含 `usage: { inputTokens, outputTokens }`
- AgentMessage 已定义 `usage` 字段
- VSCode 侧完全未使用

### 改动

**ChatViewProvider.ts:**
- 新增 `sessionUsage` 状态：`{ totalInput: number, totalOutput: number, requestCount: number }`
- `handleAgentMessage` 中 `done` 事件时累加 usage
- `WebviewOutboundMessage` 新增 `usage` 字段

**chat.js:**
- subheader 区域显示 token 统计：`输入: 12.3K | 输出: 5.6K | 请求: 3`
- 格式化函数：`formatTokenCount(n)` → `1.2K` / `15.6K`

## 4. 多会话多窗口

### 目标
支持同时打开多个会话标签页，类似浏览器多 Tab。

### 改动

**ChatViewProvider.ts:**
- 从 `WebviewViewProvider`（侧边栏单实例）改为同时支持 `WebviewPanel`（编辑器区域多实例）
- 每个 Panel 有独立的 sessionId、messages、agentClient 连接
- `openChatInEditor()` 方法：创建新的 WebviewPanel

**extension.ts:**
- 新增命令 `naughtyagent.openChatInEditor` — 在编辑器区域打开新 Chat tab
- 侧边栏保留单实例 ChatView（快速访问）

**SessionPicker.ts:**
- 不需要改动，已支持选择不同 session

**package.json:**
- 新增命令和快捷键

## 实现顺序

1. **流式布局优化 + TodoList** — 最核心的体验改进
2. **用量统计** — 最简单，daemon 数据已有
3. **多模态输入** — 中等复杂度
4. **多会话多窗口** — 最复杂，涉及架构变化
