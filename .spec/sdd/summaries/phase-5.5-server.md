# Phase 5.5 总结：Server 外部集成

> 完成时间：2026-01-15

## 做了什么

实现了 HTTP Server 和 WebSocket 支持，让外部应用（如 VS Code 插件）能够调用 Agent 服务。

### 1. 类型定义 (`src/server/types.ts`)
- `ServerConfig`: 服务器配置
- `SessionResponse`: 会话响应
- `SendMessageRequest`: 消息请求
- `StreamEvent`: 流式事件（text/tool_start/tool_end/error/done）
- `WSClientMessage` / `WSServerMessage`: WebSocket 消息类型

### 2. 中间件 (`src/server/middleware.ts`)
- `createAuthMiddleware()`: Bearer Token 认证
- `createCorsMiddleware()`: CORS 跨域支持
- `sendError()` / `sendJson()`: 响应辅助函数
- `parseBody()` / `parseQuery()`: 请求解析
- `matchRoute()`: 路由匹配（支持参数）

### 3. API 路由 (`src/server/routes.ts`)
- 会话管理：创建、获取、删除
- 消息发送：非流式和 SSE 流式
- 技能执行：列出和执行 Skills

### 4. HTTP Server (`src/server/server.ts`)
- 服务器生命周期管理
- 中间件集成
- WebSocket 升级处理

### 5. WebSocket (`src/server/websocket.ts`)
- 原生 WebSocket 协议实现
- 帧解析和编码
- 实时双向通信
- 权限确认交互

## 能干什么

### 启动 HTTP Server

```typescript
import { createServer } from "./server"

const server = createServer({
  port: 3000,
  apiKey: "your-api-key",
  claudeApiKey: process.env.ANTHROPIC_API_KEY!,
  cors: true,
})

await server.start()
console.log("Server running on http://localhost:3000")
```

### HTTP API 调用

```typescript
// 创建会话
const session = await fetch("http://localhost:3000/sessions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ cwd: "/path/to/project" }),
}).then(r => r.json())

// 发送消息（非流式）
const response = await fetch(`http://localhost:3000/sessions/${session.id}/messages`, {
  method: "POST",
  headers: {
    "Authorization": "Bearer your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "帮我写一个函数" }),
}).then(r => r.json())

// 发送消息（SSE 流式）
const eventSource = await fetch(`http://localhost:3000/sessions/${session.id}/messages`, {
  method: "POST",
  headers: {
    "Authorization": "Bearer your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "帮我写一个函数", stream: true }),
})
// 处理 SSE 事件...
```

### WebSocket 实时通信

```typescript
const ws = new WebSocket(`ws://localhost:3000/ws?token=your-api-key`)

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  switch (data.type) {
    case "text":
      console.log(data.content)
      break
    case "tool_start":
      console.log(`Tool ${data.name} started`)
      break
    case "done":
      console.log("Done!", data.usage)
      break
  }
}

// 发送消息
ws.send(JSON.stringify({ type: "send", message: "帮我写一个函数" }))
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（无需认证） |
| POST | `/sessions` | 创建会话 |
| GET | `/sessions/:id` | 获取会话信息 |
| DELETE | `/sessions/:id` | 删除会话 |
| POST | `/sessions/:id/messages` | 发送消息 |
| GET | `/skills` | 列出可用技能 |
| POST | `/skills/:name` | 执行技能 |
| WS | `/ws` | WebSocket 连接 |

## 在 Agent 中的作用

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code 插件                          │
│                    或其他客户端                           │
└─────────────────────────────────────────────────────────┘
                           │
                           │ HTTP / WebSocket
                           ▼
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

**核心价值：**
- VS Code 插件可以通过 HTTP 调用 Agent
- 支持流式输出，实时显示 AI 响应
- WebSocket 支持双向通信和权限确认

## 当前整体能力

**Agent 核心功能全部完成！**

- ✅ 读写编辑文件、执行命令、搜索代码
- ✅ 调用 Claude API（流式/非流式）
- ✅ 维护对话上下文、多轮对话
- ✅ Agent Loop（LLM → Tool → LLM）
- ✅ CLI 命令行执行、权限检查
- ✅ 上下文管理（规则、项目结构、Git）
- ✅ Token 管理、安全检查
- ✅ Diff 预览、撤销操作
- ✅ 子任务分解（API/Workflow/Agent 模式）
- ✅ 交互工具（question/todo）
- ✅ Skills 技能系统（/commit /pr /review /test）
- ✅ 按需加载规则（根据任务上下文）
- ✅ 动态指令发现（Justfile/Makefile/package.json）
- ✅ **HTTP API 服务**
- ✅ **WebSocket 实时通信**
- ✅ **SSE 流式响应**

**未实现（可选扩展）：**
- ❌ MCP 协议支持（连接外部工具服务器）

## 测试覆盖

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| middleware.test.ts | 9 | 路由匹配、查询解析 |
| server.test.ts | 14 | 服务器生命周期、API 端点、认证 |

**总测试数：702 个测试全部通过**

## 文件结构

```
packages/agent/src/server/
├── index.ts        # 模块导出
├── types.ts        # 类型定义
├── middleware.ts   # 中间件
├── routes.ts       # API 路由
├── server.ts       # HTTP Server
└── websocket.ts    # WebSocket 处理

packages/agent/test/server/
├── middleware.test.ts
└── server.test.ts
```

## 项目完成总结

NaughtAgent 核心功能已全部完成！

### 开发历程

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基础能力（Tool + Provider） | ✅ |
| Phase 2 | 对话能力（Session） | ✅ |
| Phase 3 | Agent 能力（Loop） | ✅ |
| Phase 4 | 交互能力（CLI + Permission） | ✅ |
| Phase 4.5 | 核心补强（Context/Token/Security/UX） | ✅ |
| Phase 5.1 | SubTask 子任务系统 | ✅ |
| Phase 5.2 | 交互工具（question/todo） | ✅ |
| Phase 5.3 | Skills 技能系统 | ✅ |
| Phase 5.4 | Rules 索引系统 | ✅ |
| Phase 5.5 | Server 外部集成 | ✅ |

### 下一步建议

1. **VS Code 插件开发** - 使用 HTTP API 构建 UI
2. **MCP 协议支持** - 连接外部工具服务器
3. **更多内置 Skills** - 根据实际需求扩展
4. **性能优化** - 缓存、并发处理
5. **生产部署** - HTTPS、日志、监控
