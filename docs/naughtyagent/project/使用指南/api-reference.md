# HTTP API 参考

> NaughtyAgent Daemon 服务 HTTP API 文档

---

## 概述

Daemon 服务提供 RESTful API 和 WebSocket 接口。

- 默认地址：`http://localhost:31415`
- 内容类型：`application/json`

---

## 健康检查

### GET /health

检查服务是否正常运行。

**响应**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600
}
```

### GET /daemon/status

获取 Daemon 详细状态。

**响应**
```json
{
  "status": "running",
  "sessions": 3,
  "tasks": {
    "pending": 0,
    "running": 1,
    "completed": 42
  },
  "workers": {
    "total": 4,
    "busy": 1,
    "idle": 3
  }
}
```

---

## 会话管理

### GET /sessions

获取所有会话列表。

**响应**
```json
{
  "sessions": [
    {
      "id": "session-abc123",
      "agentType": "build",
      "createdAt": "2026-02-27T10:00:00Z",
      "updatedAt": "2026-02-27T10:30:00Z",
      "messageCount": 10
    }
  ]
}
```

### POST /sessions

创建新会话。

**请求**
```json
{
  "agentType": "build",
  "cwd": "/path/to/project"
}
```

**响应**
```json
{
  "id": "session-abc123",
  "agentType": "build",
  "createdAt": "2026-02-27T10:00:00Z"
}
```

### GET /sessions/:id

获取会话详情。

**响应**
```json
{
  "id": "session-abc123",
  "agentType": "build",
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help?"
    }
  ],
  "createdAt": "2026-02-27T10:00:00Z",
  "updatedAt": "2026-02-27T10:30:00Z"
}
```

### DELETE /sessions/:id

删除会话。

**响应**
```json
{
  "success": true
}
```

---

## 消息

### POST /sessions/:id/messages

发送消息（同步，等待完成）。

**请求**
```json
{
  "content": "帮我看看 package.json"
}
```

**响应**
```json
{
  "messages": [
    {
      "role": "assistant",
      "content": "好的，我来读取 package.json..."
    }
  ],
  "toolCalls": [
    {
      "tool": "read",
      "input": { "path": "package.json" },
      "output": "{ ... }"
    }
  ]
}
```

### POST /sessions/:id/messages/stream

发送消息（流式响应，SSE）。

**请求**
```json
{
  "content": "帮我看看 package.json"
}
```

**响应**（SSE 格式）
```
data: {"type":"text","content":"好的"}

data: {"type":"text","content":"，我来"}

data: {"type":"tool_start","tool":"read","input":{"path":"package.json"}}

data: {"type":"tool_end","tool":"read","output":"{ ... }"}

data: {"type":"done"}
```

---

## 任务

### GET /tasks

获取任务列表。

**查询参数**
- `status`: 过滤状态（pending/running/completed/failed）
- `limit`: 返回数量限制

**响应**
```json
{
  "tasks": [
    {
      "id": "task-xyz789",
      "sessionId": "session-abc123",
      "status": "completed",
      "createdAt": "2026-02-27T10:00:00Z",
      "completedAt": "2026-02-27T10:01:00Z"
    }
  ]
}
```

### POST /tasks

提交异步任务。

**请求**
```json
{
  "sessionId": "session-abc123",
  "content": "重构整个项目的错误处理",
  "priority": "normal"
}
```

**响应**
```json
{
  "id": "task-xyz789",
  "status": "pending"
}
```

### GET /tasks/:id

获取任务状态。

**响应**
```json
{
  "id": "task-xyz789",
  "status": "running",
  "progress": {
    "current": 3,
    "total": 10
  }
}
```

### POST /tasks/:id/cancel

取消任务。

**响应**
```json
{
  "success": true
}
```

---

## 技能

### GET /skills

获取可用技能列表。

**响应**
```json
{
  "skills": [
    {
      "name": "refactor",
      "description": "重构代码",
      "parameters": {
        "target": "string",
        "strategy": "string"
      }
    }
  ]
}
```

### POST /skills/:name

执行技能。

**请求**
```json
{
  "sessionId": "session-abc123",
  "parameters": {
    "target": "src/utils.ts",
    "strategy": "extract-function"
  }
}
```

**响应**
```json
{
  "taskId": "task-xyz789"
}
```

---

## WebSocket

### 连接

```
ws://localhost:31415/ws
```

### 消息格式

**客户端 → 服务端**
```json
{
  "type": "message",
  "sessionId": "session-abc123",
  "content": "Hello"
}
```

**服务端 → 客户端**
```json
{
  "type": "text",
  "content": "Hi!"
}
```

```json
{
  "type": "tool_start",
  "tool": "read",
  "input": { "path": "package.json" }
}
```

```json
{
  "type": "tool_end",
  "tool": "read",
  "output": "{ ... }"
}
```

```json
{
  "type": "done"
}
```

```json
{
  "type": "error",
  "code": "TOOL_EXECUTION_ERROR",
  "message": "文件不存在"
}
```

---

## 错误响应

所有错误响应格式：

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "会话不存在",
    "details": {}
  }
}
```

### 错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|----------|------|
| `INVALID_REQUEST` | 400 | 请求参数错误 |
| `SESSION_NOT_FOUND` | 404 | 会话不存在 |
| `TASK_NOT_FOUND` | 404 | 任务不存在 |
| `PERMISSION_DENIED` | 403 | 权限不足 |
| `RATE_LIMITED` | 429 | 请求过于频繁 |
| `INTERNAL_ERROR` | 500 | 内部错误 |

---

## 客户端示例

### JavaScript/TypeScript

```typescript
// 创建会话
const session = await fetch('http://localhost:31415/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agentType: 'build' })
}).then(r => r.json())

// 流式发送消息
const response = await fetch(
  `http://localhost:31415/sessions/${session.id}/messages/stream`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Hello' })
  }
)

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  const text = decoder.decode(value)
  const lines = text.split('\n')
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6))
      console.log(event)
    }
  }
}
```

### cURL

```bash
# 创建会话
curl -X POST http://localhost:31415/sessions \
  -H "Content-Type: application/json" \
  -d '{"agentType": "build"}'

# 发送消息
curl -X POST http://localhost:31415/sessions/session-abc123/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello"}'

# 流式消息
curl -N http://localhost:31415/sessions/session-abc123/messages/stream \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello"}'
```

---

> 文档生成日期：2026-02-27
