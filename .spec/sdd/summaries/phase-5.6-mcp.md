# Phase 5.6 总结：MCP 协议支持

> 完成时间：2026-01-15

## 做了什么

实现了 MCP (Model Context Protocol) 客户端，让 Agent 能够连接外部 MCP 服务器，动态加载更多工具。

### 1. 类型定义 (`src/mcp/types.ts`)
- JSON-RPC 2.0 消息类型
- `McpServerConfig`: 服务器配置（stdio/SSE）
- `McpTool`: 工具定义
- `McpResource`: 资源定义
- `McpPrompt`: 提示模板定义
- `McpClientState`: 客户端状态

### 2. 传输层 (`src/mcp/transport.ts`)
- `StdioTransport`: 通过子进程 stdin/stdout 通信
- `SseTransport`: 通过 HTTP + SSE 通信
- 请求/响应匹配、超时处理

### 3. MCP Client (`src/mcp/client.ts`)
- 连接/断开服务器
- 初始化握手（交换能力）
- 列出和调用工具
- 列出和读取资源
- 列出和获取提示模板
- 事件通知处理

### 4. MCP Tools (`src/mcp/tools.ts`)
- `createMcpToolWrapper()`: 将 MCP 工具转换为 NaughtAgent Tool
- `loadMcpTools()`: 加载并注册工具到 ToolRegistry
- 工具名解析和识别

### 5. MCP Manager (`src/mcp/manager.ts`)
- 管理多个 MCP 服务器连接
- 统一的工具/资源/提示访问接口
- 配置文件加载（支持环境变量）
- 全局单例管理

## 能干什么

### 连接 MCP 服务器

```typescript
import { createMcpClient } from "./mcp"

// 连接 stdio 服务器
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
// [{ name: "read_file", description: "Read a file", inputSchema: {...} }, ...]

// 调用工具
const result = await client.callTool("read_file", { path: "/tmp/test.txt" })
console.log(result.content)
// [{ type: "text", text: "File content..." }]

await client.disconnect()
```

### 管理多个服务器

```typescript
import { McpManager, loadMcpConfig } from "./mcp"

const manager = new McpManager()

// 添加服务器
await manager.addServer({
  name: "filesystem",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@anthropic/mcp-server-filesystem", "/tmp"],
})

await manager.addServer({
  name: "github",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@anthropic/mcp-server-github"],
  env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
})

// 获取所有工具
const allTools = await manager.getAllTools()

// 调用特定服务器的工具
const result = await manager.callTool("filesystem", "read_file", { path: "/tmp/test.txt" })

// 关闭所有连接
await manager.closeAll()
```

### 配置文件

`.naught/mcp.json`:
```json
{
  "servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/home/user"]
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

### 与 Agent 集成

```typescript
import { McpManager, loadMcpTools } from "./mcp"
import { ToolRegistry } from "./tool"

// 初始化 MCP
const manager = new McpManager()
await manager.addServer(config)

// 加载工具到 ToolRegistry
// 工具名格式: mcp_<serverName>_<toolName>
await loadMcpTools(manager.getClient("filesystem")!)

// 现在 Agent 可以使用 MCP 工具了
// 例如: mcp_filesystem_read_file
```

## 在 Agent 中的作用

```
┌─────────────────────────────────────────────────────────┐
│                     NaughtAgent                          │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │ ToolRegistry │◄───│  MCP Tools   │                   │
│  │              │    │  Wrapper     │                   │
│  │ - read       │    └──────┬───────┘                   │
│  │ - write      │           │                           │
│  │ - bash       │           │                           │
│  │ - mcp_*      │◄──────────┘                           │
│  └──────────────┘                                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                   MCP Manager                     │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  │   │
│  │  │  Client 1  │  │  Client 2  │  │  Client N  │  │   │
│  │  │ filesystem │  │   github   │  │  database  │  │   │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  │   │
│  └────────┼───────────────┼───────────────┼─────────┘   │
│           │               │               │              │
└───────────┼───────────────┼───────────────┼──────────────┘
            │               │               │
            ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ MCP Server │  │ MCP Server │  │ MCP Server │
     │  (stdio)   │  │  (stdio)   │  │   (SSE)    │
     └────────────┘  └────────────┘  └────────────┘
```

**核心价值：**
- 扩展工具生态：连接任意 MCP 服务器获取更多工具
- 标准化协议：使用 Anthropic 官方 MCP 协议
- 动态加载：运行时添加/移除工具

## 当前整体能力

**Agent 核心功能全部完成！**

- ✅ 文件操作（读/写/编辑/搜索）
- ✅ 命令执行
- ✅ Claude API 调用（流式/非流式）
- ✅ 多轮对话、会话管理
- ✅ Agent Loop（LLM ↔ Tool 循环）
- ✅ CLI 命令行、权限检查
- ✅ 上下文管理、Token 管理、安全检查
- ✅ Diff 预览、撤销操作
- ✅ 子任务分解（API/Workflow/Agent）
- ✅ 交互工具（question/todo）
- ✅ Skills（/commit /pr /review /test）
- ✅ 按需加载规则
- ✅ HTTP API + WebSocket
- ✅ **MCP 协议支持**

## 测试覆盖

| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| tools.test.ts | 13 | 工具包装、结果格式化、名称解析 |
| client.test.ts | 4 | 客户端初始化、常量 |
| manager.test.ts | 10 | 配置加载、管理器操作 |

**总测试数：729 个测试全部通过**

## 文件结构

```
packages/agent/src/mcp/
├── index.ts        # 模块导出
├── types.ts        # 类型定义
├── transport.ts    # 传输层（stdio/SSE）
├── client.ts       # MCP Client
├── tools.ts        # 工具集成
└── manager.ts      # MCP Manager

packages/agent/test/mcp/
├── tools.test.ts
├── client.test.ts
└── manager.test.ts
```

## 下一步建议

Agent 核心功能已全部完成，下一步是：

### VS Code 插件开发

1. **UI 设计** - 聊天界面、工具调用展示
2. **HTTP 集成** - 调用 Agent HTTP API
3. **WebSocket 集成** - 实时流式输出
4. **权限确认** - 弹窗确认危险操作
5. **Diff 预览** - 文件修改预览

### 可选优化

1. **更多内置 Skills** - 根据实际需求扩展
2. **性能优化** - 缓存、并发处理
3. **日志系统** - 结构化日志
4. **监控指标** - Token 使用、响应时间
