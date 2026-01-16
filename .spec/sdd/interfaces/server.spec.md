# Interface Spec: Server 外部集成

> Phase 5.5 Server - HTTP API 和 WebSocket 实时通信

## 概述

Server 模块提供 HTTP API 和 WebSocket 接口，让外部应用（如 VS Code 插件）能够调用 Agent 服务。

**核心功能：**
- HTTP REST API：会话管理、消息发送
- WebSocket：实时流式输出
- SSE (Server-Sent Events)：备选流式方案

---

## 1. Types

```typescript
/**
 * Server 配置
 */
interface ServerConfig {
  /** 监听端口 */
  port?: number
  /** 监听地址 */
  host?: string
  /** API Key（用于认证） */
  apiKey: string
  /** Claude API Key */
  claudeApiKey: string
  /** Claude API Base URL */
  claudeBaseURL?: string
  /** 默认工作目录 */
  defaultCwd?: string
  /** 是否启用 CORS */
  cors?: boolean
}

/**
 * 会话创建请求
 */
interface CreateSessionRequest {
  /** 工作目录 */
  cwd?: string
  /** Agent 类型 */
  agentType?: "build" | "plan" | "explore"
}

/**
 * 会话响应
 */
interface SessionResponse {
  /** 会话 ID */
  id: string
  /** 创建时间 */
  createdAt: string
  /** Agent 类型 */
  agentType: string
  /** 工作目录 */
  cwd: string
}

/**
 * 消息发送请求
 */
interface SendMessageRequest {
  /** 用户消息 */
  message: string
  /** 是否流式响应 */
  stream?: boolean
}

/**
 * 消息响应（非流式）
 */
interface MessageResponse {
  /** 响应内容 */
  content: string
  /** 工具调用记录 */
  toolCalls: ToolCallRecord[]
  /** Token 使用 */
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * 工具调用记录
 */
interface ToolCallRecord {
  /** 工具 ID */
  id: string
  /** 工具名称 */
  name: string
  /** 输入参数 */
  input: unknown
  /** 输出结果 */
  output: string
  /** 是否出错 */
  isError?: boolean
}

/**
 * 流式事件
 */
type StreamEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; output: string; isError?: boolean }
  | { type: "error"; message: string }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number } }

/**
 * WebSocket 消息
 */
interface WSMessage {
  /** 消息类型 */
  type: "send" | "cancel" | "ping"
  /** 会话 ID */
  sessionId?: string
  /** 消息内容（send 时） */
  message?: string
}

/**
 * 权限确认请求（WebSocket）
 */
interface PermissionConfirmRequest {
  /** 请求 ID */
  requestId: string
  /** 权限类型 */
  type: string
  /** 资源 */
  resource: string
  /** 描述 */
  description: string
}

/**
 * 权限确认响应（WebSocket）
 */
interface PermissionConfirmResponse {
  /** 请求 ID */
  requestId: string
  /** 是否允许 */
  allowed: boolean
}
```

---

## 2. HTTP API

### 2.1 认证

所有 API 请求需要在 Header 中携带 API Key：

```
Authorization: Bearer <api-key>
```

### 2.2 端点

#### 健康检查

```
GET /health

Response: 200 OK
{
  "status": "ok",
  "version": "0.1.0"
}
```

#### 创建会话

```
POST /sessions

Request:
{
  "cwd": "/path/to/project",
  "agentType": "build"
}

Response: 201 Created
{
  "id": "session-uuid",
  "createdAt": "2026-01-15T10:00:00Z",
  "agentType": "build",
  "cwd": "/path/to/project"
}
```

#### 获取会话

```
GET /sessions/:id

Response: 200 OK
{
  "id": "session-uuid",
  "createdAt": "2026-01-15T10:00:00Z",
  "agentType": "build",
  "cwd": "/path/to/project",
  "messageCount": 5
}
```

#### 删除会话

```
DELETE /sessions/:id

Response: 204 No Content
```

#### 发送消息（非流式）

```
POST /sessions/:id/messages

Request:
{
  "message": "帮我写一个函数",
  "stream": false
}

Response: 200 OK
{
  "content": "好的，我来帮你写...",
  "toolCalls": [
    {
      "id": "tool-1",
      "name": "write",
      "input": { "filePath": "src/utils.ts", "content": "..." },
      "output": "File written successfully"
    }
  ],
  "usage": {
    "inputTokens": 100,
    "outputTokens": 200
  }
}
```

#### 发送消息（SSE 流式）

```
POST /sessions/:id/messages

Request:
{
  "message": "帮我写一个函数",
  "stream": true
}

Response: 200 OK
Content-Type: text/event-stream

data: {"type":"text","content":"好的"}
data: {"type":"text","content":"，我来"}
data: {"type":"tool_start","id":"tool-1","name":"write","input":{...}}
data: {"type":"tool_end","id":"tool-1","output":"File written"}
data: {"type":"done","usage":{"inputTokens":100,"outputTokens":200}}
```

#### 执行技能

```
POST /skills/:name

Request:
{
  "cwd": "/path/to/project",
  "args": ["--base", "main"]
}

Response: 200 OK
{
  "success": true,
  "output": "Commit message: feat: add new feature",
  "steps": [...]
}
```

---

## 3. WebSocket API

### 3.1 连接

```
ws://localhost:3000/ws?sessionId=xxx&token=xxx
```

### 3.2 客户端消息

#### 发送消息

```json
{
  "type": "send",
  "message": "帮我写一个函数"
}
```

#### 取消执行

```json
{
  "type": "cancel"
}
```

#### 心跳

```json
{
  "type": "ping"
}
```

#### 权限确认响应

```json
{
  "type": "permission_response",
  "requestId": "req-123",
  "allowed": true
}
```

### 3.3 服务端消息

#### 文本输出

```json
{
  "type": "text",
  "content": "好的，我来帮你..."
}
```

#### 工具开始

```json
{
  "type": "tool_start",
  "id": "tool-1",
  "name": "write",
  "input": { "filePath": "src/utils.ts", "content": "..." }
}
```

#### 工具结束

```json
{
  "type": "tool_end",
  "id": "tool-1",
  "output": "File written successfully",
  "isError": false
}
```

#### 权限确认请求

```json
{
  "type": "permission_request",
  "requestId": "req-123",
  "permissionType": "write",
  "resource": "src/utils.ts",
  "description": "Write file src/utils.ts"
}
```

#### 错误

```json
{
  "type": "error",
  "message": "Something went wrong"
}
```

#### 完成

```json
{
  "type": "done",
  "usage": {
    "inputTokens": 100,
    "outputTokens": 200
  }
}
```

#### 心跳响应

```json
{
  "type": "pong"
}
```

---

## 4. 实现架构

```
┌─────────────────────────────────────────────────────────┐
│                      HTTP Server                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Routes    │  │  Middleware │  │   WebSocket     │  │
│  │  /sessions  │  │  - auth     │  │   Handler       │  │
│  │  /messages  │  │  - cors     │  │                 │  │
│  │  /skills    │  │  - error    │  │                 │  │
│  └──────┬──────┘  └─────────────┘  └────────┬────────┘  │
│         │                                    │           │
│         └────────────────┬───────────────────┘           │
│                          │                               │
│                   ┌──────▼──────┐                        │
│                   │   Runner    │                        │
│                   │  (复用CLI)   │                        │
│                   └──────┬──────┘                        │
│                          │                               │
│         ┌────────────────┼────────────────┐              │
│         │                │                │              │
│   ┌─────▼─────┐   ┌──────▼──────┐  ┌──────▼──────┐      │
│   │  Session  │   │    Agent    │  │    Tools    │      │
│   │  Manager  │   │    Loop     │  │             │      │
│   └───────────┘   └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 文件结构

```
src/
├── server/
│   ├── index.ts        # 导出
│   ├── types.ts        # 类型定义
│   ├── server.ts       # HTTP Server 主体
│   ├── routes.ts       # API 路由
│   ├── middleware.ts   # 中间件（认证、CORS、错误处理）
│   └── websocket.ts    # WebSocket 处理
```

---

## 6. 使用示例

### 启动服务器

```typescript
import { createServer } from "./server"

const server = createServer({
  port: 3000,
  apiKey: "your-server-api-key",
  claudeApiKey: process.env.ANTHROPIC_API_KEY!,
  cors: true,
})

await server.start()
console.log("Server running on http://localhost:3000")
```

### 客户端调用（HTTP）

```typescript
// 创建会话
const session = await fetch("http://localhost:3000/sessions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer your-server-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ cwd: "/path/to/project" }),
}).then(r => r.json())

// 发送消息
const response = await fetch(`http://localhost:3000/sessions/${session.id}/messages`, {
  method: "POST",
  headers: {
    "Authorization": "Bearer your-server-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "帮我写一个函数" }),
}).then(r => r.json())
```

### 客户端调用（WebSocket）

```typescript
const ws = new WebSocket(`ws://localhost:3000/ws?sessionId=${session.id}&token=your-api-key`)

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  switch (data.type) {
    case "text":
      console.log(data.content)
      break
    case "tool_start":
      console.log(`Tool ${data.name} started`)
      break
    case "permission_request":
      // 显示确认对话框
      const allowed = confirm(data.description)
      ws.send(JSON.stringify({
        type: "permission_response",
        requestId: data.requestId,
        allowed,
      }))
      break
    case "done":
      console.log("Done!", data.usage)
      break
  }
}

// 发送消息
ws.send(JSON.stringify({
  type: "send",
  message: "帮我写一个函数",
}))
```

---

## 7. 错误处理

### HTTP 错误响应

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

### 错误码

| 状态码 | 错误码 | 说明 |
|--------|--------|------|
| 400 | BAD_REQUEST | 请求参数错误 |
| 401 | UNAUTHORIZED | 认证失败 |
| 404 | NOT_FOUND | 资源不存在 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

---

## 8. 安全考虑

1. **API Key 认证** - 所有请求需要有效的 API Key
2. **路径限制** - 只能访问指定 cwd 下的文件
3. **命令过滤** - 危险命令被拦截
4. **速率限制** - 防止滥用（可选）
5. **HTTPS** - 生产环境应使用 HTTPS
