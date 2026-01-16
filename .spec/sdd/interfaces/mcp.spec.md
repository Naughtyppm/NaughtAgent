# Interface Spec: MCP Client

> Model Context Protocol 客户端实现

## 概述

MCP (Model Context Protocol) 是 Anthropic 推出的开放协议，用于 AI 应用与外部数据源和工具的标准化连接。

**核心功能：**
- 连接 MCP 服务器（通过 stdio 或 HTTP/SSE）
- 发现和调用远程工具
- 获取远程资源（文件、数据等）
- 使用远程提示模板

**架构：**
```
┌─────────────────┐     MCP Protocol      ┌─────────────────┐
│   NaughtAgent   │ ◄──────────────────► │   MCP Server    │
│   (MCP Client)  │    JSON-RPC 2.0       │  (外部工具)      │
└─────────────────┘                       └─────────────────┘
```

---

## 1. MCP 协议基础

### 1.1 传输层

MCP 支持两种传输方式：

| 传输方式 | 说明 | 适用场景 |
|----------|------|----------|
| stdio | 通过子进程的 stdin/stdout 通信 | 本地工具 |
| HTTP + SSE | HTTP POST 发送请求，SSE 接收响应 | 远程服务 |

### 1.2 消息格式

MCP 使用 JSON-RPC 2.0 协议：

```typescript
// 请求
interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: string | number
  method: string
  params?: unknown
}

// 响应
interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

// 通知（无需响应）
interface JsonRpcNotification {
  jsonrpc: "2.0"
  method: string
  params?: unknown
}
```

### 1.3 核心方法

| 方法 | 说明 |
|------|------|
| `initialize` | 初始化连接，交换能力 |
| `tools/list` | 列出可用工具 |
| `tools/call` | 调用工具 |
| `resources/list` | 列出可用资源 |
| `resources/read` | 读取资源 |
| `prompts/list` | 列出提示模板 |
| `prompts/get` | 获取提示模板 |

---

## 2. Types

```typescript
/**
 * MCP 服务器配置
 */
interface McpServerConfig {
  /** 服务器名称 */
  name: string
  /** 传输方式 */
  transport: "stdio" | "sse"
  /** stdio 配置 */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** SSE 配置 */
  url?: string
  headers?: Record<string, string>
}

/**
 * MCP 工具定义
 */
interface McpTool {
  /** 工具名称 */
  name: string
  /** 描述 */
  description?: string
  /** 输入参数 JSON Schema */
  inputSchema: {
    type: "object"
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/**
 * MCP 资源
 */
interface McpResource {
  /** 资源 URI */
  uri: string
  /** 名称 */
  name: string
  /** 描述 */
  description?: string
  /** MIME 类型 */
  mimeType?: string
}

/**
 * MCP 提示模板
 */
interface McpPrompt {
  /** 名称 */
  name: string
  /** 描述 */
  description?: string
  /** 参数 */
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

/**
 * 工具调用结果
 */
interface McpToolResult {
  /** 内容列表 */
  content: Array<{
    type: "text" | "image" | "resource"
    text?: string
    data?: string
    mimeType?: string
    uri?: string
  }>
  /** 是否出错 */
  isError?: boolean
}

/**
 * 服务器能力
 */
interface McpCapabilities {
  /** 支持的功能 */
  tools?: boolean
  resources?: boolean
  prompts?: boolean
  /** 实验性功能 */
  experimental?: Record<string, unknown>
}

/**
 * 客户端状态
 */
type McpClientState = "disconnected" | "connecting" | "connected" | "error"
```

---

## 3. MCP Client

### 3.1 接口

```typescript
interface McpClient {
  /** 连接状态 */
  readonly state: McpClientState

  /** 服务器能力 */
  readonly capabilities: McpCapabilities | null

  /** 连接到服务器 */
  connect(): Promise<void>

  /** 断开连接 */
  disconnect(): Promise<void>

  /** 列出工具 */
  listTools(): Promise<McpTool[]>

  /** 调用工具 */
  callTool(name: string, args: unknown): Promise<McpToolResult>

  /** 列出资源 */
  listResources(): Promise<McpResource[]>

  /** 读取资源 */
  readResource(uri: string): Promise<string>

  /** 列出提示模板 */
  listPrompts(): Promise<McpPrompt[]>

  /** 获取提示模板 */
  getPrompt(name: string, args?: Record<string, string>): Promise<string>
}
```

### 3.2 创建客户端

```typescript
function createMcpClient(config: McpServerConfig): McpClient
```

---

## 4. 传输层实现

### 4.1 Stdio Transport

```typescript
class StdioTransport {
  private process: ChildProcess

  constructor(command: string, args: string[], env?: Record<string, string>)

  /** 发送消息 */
  send(message: JsonRpcRequest | JsonRpcNotification): void

  /** 接收消息 */
  onMessage(handler: (message: JsonRpcResponse) => void): void

  /** 关闭 */
  close(): void
}
```

### 4.2 SSE Transport

```typescript
class SseTransport {
  private eventSource: EventSource

  constructor(url: string, headers?: Record<string, string>)

  /** 发送消息 */
  send(message: JsonRpcRequest | JsonRpcNotification): Promise<void>

  /** 接收消息 */
  onMessage(handler: (message: JsonRpcResponse) => void): void

  /** 关闭 */
  close(): void
}
```

---

## 5. 与 Agent 集成

### 5.1 动态工具注册

```typescript
/**
 * 从 MCP 服务器加载工具并注册到 ToolRegistry
 */
async function loadMcpTools(client: McpClient): Promise<void> {
  const tools = await client.listTools()

  for (const tool of tools) {
    // 创建工具包装器
    const wrappedTool = createMcpToolWrapper(client, tool)
    ToolRegistry.register(wrappedTool)
  }
}

/**
 * 创建 MCP 工具包装器
 */
function createMcpToolWrapper(client: McpClient, mcpTool: McpTool): Tool {
  return {
    name: `mcp_${mcpTool.name}`,
    description: mcpTool.description || "",
    parameters: mcpTool.inputSchema,
    execute: async (params, context) => {
      const result = await client.callTool(mcpTool.name, params)
      return formatMcpResult(result)
    }
  }
}
```

### 5.2 MCP 管理器

```typescript
/**
 * MCP 管理器 - 管理多个 MCP 服务器连接
 */
class McpManager {
  private clients = new Map<string, McpClient>()

  /** 添加服务器 */
  async addServer(config: McpServerConfig): Promise<void>

  /** 移除服务器 */
  async removeServer(name: string): Promise<void>

  /** 获取所有工具 */
  async getAllTools(): Promise<McpTool[]>

  /** 调用工具 */
  async callTool(serverName: string, toolName: string, args: unknown): Promise<McpToolResult>

  /** 关闭所有连接 */
  async closeAll(): Promise<void>
}
```

---

## 6. 配置文件

### 6.1 .naught/mcp.json

```json
{
  "servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/allowed"]
    },
    {
      "name": "github",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    {
      "name": "database",
      "transport": "sse",
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer ${DB_TOKEN}"
      }
    }
  ]
}
```

### 6.2 加载配置

```typescript
async function loadMcpConfig(cwd: string): Promise<McpServerConfig[]> {
  const configPath = path.join(cwd, ".naught", "mcp.json")
  // 读取并解析配置，替换环境变量
}
```

---

## 7. 文件结构

```
src/
├── mcp/
│   ├── index.ts        # 导出
│   ├── types.ts        # 类型定义
│   ├── client.ts       # MCP Client 实现
│   ├── transport.ts    # 传输层（stdio/sse）
│   ├── tools.ts        # 工具集成
│   └── manager.ts      # MCP 管理器
```

---

## 8. 使用示例

### 8.1 基本使用

```typescript
import { createMcpClient, McpManager } from "./mcp"

// 创建单个客户端
const client = createMcpClient({
  name: "filesystem",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@anthropic/mcp-server-filesystem", "/tmp"],
})

await client.connect()

// 列出工具
const tools = await client.listTools()
console.log(tools)

// 调用工具
const result = await client.callTool("read_file", { path: "/tmp/test.txt" })
console.log(result)

await client.disconnect()
```

### 8.2 与 Agent 集成

```typescript
import { McpManager, loadMcpTools } from "./mcp"
import { ToolRegistry } from "./tool"

// 创建管理器
const mcpManager = new McpManager()

// 加载配置的服务器
const configs = await loadMcpConfig(cwd)
for (const config of configs) {
  await mcpManager.addServer(config)
}

// 注册所有 MCP 工具到 ToolRegistry
await loadMcpTools(mcpManager)

// 现在 Agent 可以使用 MCP 工具了
```

---

## 9. 错误处理

| 场景 | 处理 |
|------|------|
| 服务器启动失败 | 抛出错误，记录日志 |
| 连接超时 | 重试 3 次后放弃 |
| 工具调用失败 | 返回错误结果，不中断 Agent |
| 服务器崩溃 | 自动重连 |

---

## 10. 安全考虑

1. **命令白名单** - 只允许执行配置中的命令
2. **路径限制** - stdio 服务器只能访问指定目录
3. **环境变量** - 敏感信息通过环境变量传递
4. **超时控制** - 工具调用有超时限制
