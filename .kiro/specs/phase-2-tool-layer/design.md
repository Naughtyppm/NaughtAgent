# Design Document: Phase 2 - 工具层重构（MCP 集成）

## Overview

Phase 2 的核心目标是将现有的工具系统重构为符合 Model Context Protocol (MCP) 规范的架构，使 NaughtyAgent 能够无缝集成外部 MCP 工具服务器，同时保持对现有内置工具的向后兼容。

设计遵循以下原则：
1. **标准化接口**：所有工具（内置和外部）遵循统一的接口规范
2. **动态发现**：支持运行时发现和注册 MCP 工具
3. **向后兼容**：现有工具代码无需修改即可继续工作
4. **类型安全**：完整的 TypeScript 类型支持和 Zod 运行时验证
5. **性能优先**：最小化工具调用开销，优化连接复用

## Architecture

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent Core                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tool Registry                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Built-in     │  │ MCP Wrapped  │  │ Custom       │      │
│  │ Tools        │  │ Tools        │  │ Tools        │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Built-in     │ │ MCP Client   │ │ Custom       │
│ Execution    │ │ Pool         │ │ Execution    │
└──────────────┘ └──────┬───────┘ └──────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ MCP Server 1 │ │ MCP Server 2 │ │ MCP Server N │
│ (stdio)      │ │ (SSE)        │ │ (stdio)      │
└──────────────┘ └──────────────┘ └──────────────┘
```

### 分层设计

1. **接口层（Tool Interface）**：定义统一的工具接口规范
2. **注册层（Tool Registry）**：管理所有工具的注册、查找和执行
3. **适配层（MCP Adapter）**：将 MCP 工具包装为内部工具接口
4. **传输层（MCP Transport）**：处理与 MCP 服务器的通信（已实现）
5. **执行层（Execution）**：实际执行工具逻辑

## Components and Interfaces

### 1. Tool Interface（工具接口）

#### 扩展后的 Tool 接口

```typescript
export namespace Tool {
  /**
   * 工具定义（扩展版）
   */
  export interface Definition<TParams = unknown> {
    /** 工具 ID */
    id: string
    
    /** 工具描述（给 LLM 看） */
    description: string
    
    /** 参数 Schema（Zod） */
    parameters: z.ZodType<TParams>
    
    /** 执行函数 */
    execute(params: TParams, ctx: Context): Promise<Result>
    
    // ===== 新增字段（MCP 对齐） =====
    
    /** 输入 JSON Schema（从 Zod 自动生成） */
    inputSchema?: JsonSchema
    
    /** 输出 JSON Schema（可选） */
    outputSchema?: JsonSchema
    
    /** 显示标题（可选，默认使用 id） */
    title?: string
    
    /** 图标（可选） */
    icons?: {
      light?: string
      dark?: string
    }
    
    /** 工具来源（内置 | MCP | 自定义） */
    source?: "builtin" | "mcp" | "custom"
    
    /** MCP 服务器名称（仅 MCP 工具） */
    mcpServer?: string
  }
  
  /**
   * JSON Schema 类型
   */
  export interface JsonSchema {
    type?: string | string[]
    description?: string
    properties?: Record<string, JsonSchema>
    required?: string[]
    items?: JsonSchema
    enum?: unknown[]
    default?: unknown
    [key: string]: unknown
  }
}
```

#### 向后兼容策略

现有的 `Tool.define()` 方法保持不变，新增字段为可选。内部会自动：
1. 从 Zod schema 生成 `inputSchema`
2. 设置 `source` 为 `"builtin"`
3. 使用 `id` 作为 `title`

### 2. Tool Registry（工具注册表）

#### 增强的 ToolRegistry

```typescript
export namespace ToolRegistry {
  /**
   * 工具存储结构
   */
  interface ToolEntry {
    tool: Tool.Definition
    metadata: {
      registeredAt: Date
      source: "builtin" | "mcp" | "custom"
      mcpServer?: string
    }
  }
  
  /**
   * 注册工具（支持批量）
   */
  export function register(
    tool: Tool.Definition | Tool.Definition[]
  ): void
  
  /**
   * 注销工具
   */
  export function unregister(id: string): boolean
  
  /**
   * 获取工具
   */
  export function get(id: string): Tool.Definition | undefined
  
  /**
   * 列出所有工具
   */
  export function list(filter?: ToolFilter): Tool.Definition[]
  
  /**
   * 工具过滤器
   */
  export interface ToolFilter {
    source?: "builtin" | "mcp" | "custom"
    mcpServer?: string
    tags?: string[]
  }
  
  /**
   * 检查工具是否存在
   */
  export function has(id: string): boolean
  
  /**
   * 获取工具数量
   */
  export function count(filter?: ToolFilter): number
  
  /**
   * 清空注册表（测试用）
   */
  export function clear(): void
  
  /**
   * 监听工具变更
   */
  export function onChange(
    handler: (event: ToolChangeEvent) => void
  ): () => void
  
  export type ToolChangeEvent =
    | { type: "registered"; tool: Tool.Definition }
    | { type: "unregistered"; id: string }
    | { type: "updated"; tool: Tool.Definition }
}
```

### 3. MCP Client Pool（MCP 客户端池）

#### 客户端池管理

```typescript
/**
 * MCP 客户端池
 * 管理多个 MCP 服务器连接
 */
export class McpClientPool {
  private clients = new Map<string, McpClient>()
  private config: McpConfig
  private healthCheckInterval = 30000 // 30 秒
  
  constructor(config: McpConfig)
  
  /**
   * 连接所有配置的服务器
   */
  async connectAll(): Promise<void>
  
  /**
   * 启动健康检查
   */
  startHealthCheck(): void {
    setInterval(async () => {
      for (const [name, client] of this.clients) {
        try {
          // 发送 ping 请求
          await client.request('ping', {}, { timeout: 5000 })
        } catch (error) {
          // 标记为不健康并尝试重连
          this.logger.warn('MCP server unhealthy, reconnecting', { server: name })
          await this.reconnect(name)
        }
      }
    }, this.healthCheckInterval)
  }
  
  /**
   * 连接单个服务器
   */
  async connect(serverName: string): Promise<void>
  
  /**
   * 断开单个服务器
   */
  async disconnect(serverName: string): Promise<void>
  
  /**
   * 断开所有服务器
   */
  async disconnectAll(): Promise<void>
  
  /**
   * 获取客户端
   */
  getClient(serverName: string): McpClient | undefined
  
  /**
   * 列出所有客户端
   */
  listClients(): Array<{
    name: string
    state: McpClientState
    serverInfo: McpServerInfo | null
  }>
  
  /**
   * 发现所有工具
   */
  async discoverAllTools(): Promise<Tool.Definition[]>
  
  /**
   * 发现单个服务器的工具
   */
  async discoverTools(serverName: string): Promise<Tool.Definition[]>
  
  /**
   * 监听工具变更
   */
  onToolsChanged(
    handler: (serverName: string) => void
  ): () => void
}
```

### 4. MCP Tool Adapter（MCP 工具适配器）

#### 工具包装器

```typescript
/**
 * 将 MCP 工具包装为内部 Tool.Definition
 */
export function wrapMcpTool(
  mcpTool: McpTool,
  client: McpClient,
  serverName: string
): Tool.Definition {
  // 从 JSON Schema 生成 Zod schema
  const zodSchema = jsonSchemaToZod(mcpTool.inputSchema)
  
  return Tool.define({
    id: `${serverName}:${mcpTool.name}`,
    description: mcpTool.description || mcpTool.name,
    parameters: zodSchema,
    inputSchema: mcpTool.inputSchema,
    title: mcpTool.name,
    source: "mcp",
    mcpServer: serverName,
    
    async execute(params, ctx) {
      // 检查取消信号
      if (ctx.abort.aborted) {
        throw new AgentError(
          "Tool execution cancelled",
          ErrorCode.CANCELLED,
          false
        )
      }
      
      // 调用 MCP 工具
      const result = await client.callTool(mcpTool.name, params)
      
      // 转换 MCP 结果为内部格式
      return convertMcpResult(result, mcpTool.name)
    }
  })
}

/**
 * JSON Schema 转 Zod Schema
 */
function jsonSchemaToZod(schema: McpToolInputSchema): z.ZodType {
  // 递归转换 JSON Schema 为 Zod schema
  // 支持：object, string, number, boolean, array, enum
}

/**
 * 转换 MCP 结果为内部格式
 */
function convertMcpResult(
  mcpResult: McpToolResult,
  toolName: string
): Tool.Result {
  // 提取文本内容
  const textContent = mcpResult.content
    .filter(c => c.type === "text")
    .map(c => (c as McpTextContent).text)
    .join("\n")
  
  return {
    title: toolName,
    output: textContent || "(No output)",
    isError: mcpResult.isError,
    metadata: {
      contentTypes: mcpResult.content.map(c => c.type),
      hasImages: mcpResult.content.some(c => c.type === "image"),
      hasResources: mcpResult.content.some(c => c.type === "resource")
    }
  }
}
```

### 5. Tool Discovery（工具发现）

#### 自动发现机制

```typescript
/**
 * 工具发现服务
 */
export class ToolDiscoveryService {
  constructor(
    private clientPool: McpClientPool,
    private registry: typeof ToolRegistry
  )
  
  /**
   * 发现并注册所有 MCP 工具
   */
  async discoverAndRegister(): Promise<{
    discovered: number
    registered: number
    errors: Array<{ server: string; error: Error }>
  }>
  
  /**
   * 刷新单个服务器的工具
   */
  async refreshServer(serverName: string): Promise<void>
  
  /**
   * 启用热重载
   */
  enableHotReload(): () => void
  
  /**
   * 禁用热重载
   */
  disableHotReload(): void
}
```

### 6. Built-in Tools Optimization（内置工具优化）

#### 工具超时配置

工具超时时间可以通过配置文件自定义，默认值如下：

```typescript
/**
 * 默认工具超时配置
 */
const DEFAULT_TOOL_TIMEOUTS: Record<string, number> = {
  Read: 5000,      // 5 秒
  Write: 10000,    // 10 秒
  Edit: 10000,     // 10 秒
  Grep: 15000,     // 15 秒
  Bash: 60000,     // 60 秒 (可能需要编译等)
  Glob: 10000,     // 10 秒
  default: 30000   // 默认 30 秒
}

/**
 * 获取工具超时时间
 * 
 * 优先级：配置文件 > 默认值
 */
function getToolTimeout(toolName: string, config?: McpConfig): number {
  // 从配置文件读取
  const configTimeout = config?.settings?.toolTimeouts?.[toolName]
  if (configTimeout !== undefined) {
    return configTimeout
  }
  
  // 使用默认值
  return DEFAULT_TOOL_TIMEOUTS[toolName] || DEFAULT_TOOL_TIMEOUTS.default
}
```

用户可以在 `.kiro/mcp.json` 中覆盖默认超时：

```json
{
  "settings": {
    "toolTimeouts": {
      "default": 30000,
      "Bash": 120000,
      "MyCustomTool": 5000
    }
  }
}
```

#### 统一错误处理

所有内置工具将使用统一的错误处理包装器：

```typescript
/**
 * 工具执行包装器
 * 添加超时、错误处理、日志记录
 */
function withToolWrapper<TParams>(
  execute: (params: TParams, ctx: Tool.Context) => Promise<Tool.Result>,
  options: {
    timeout?: number
    toolId: string
  }
): (params: TParams, ctx: Tool.Context) => Promise<Tool.Result> {
  return async (params, ctx) => {
    const startTime = Date.now()
    const timeout = options.timeout || getToolTimeout(options.toolId)
    
    try {
      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new AgentError(
            `Tool execution timeout after ${timeout}ms`,
            ErrorCode.TIMEOUT,
            true,
            { tool: options.toolId, timeout }
          ))
        }, timeout)
      })
      
      // 竞速执行
      const result = await Promise.race([
        execute(params, ctx),
        timeoutPromise
      ])
      
      // 记录成功执行
      const duration = Date.now() - startTime
      logger.debug("Tool executed successfully", {
        tool: options.toolId,
        duration
      })
      
      return result
      
    } catch (error) {
      const duration = Date.now() - startTime
      
      // 记录错误
      logger.error("Tool execution failed", {
        tool: options.toolId,
        duration,
        error: error instanceof Error ? error.message : String(error)
      })
      
      throw error
    }
  }
}
```

#### 内置工具更新

每个内置工具（Read, Write, Edit, Bash, Glob, Grep）将：
1. 使用 `withToolWrapper` 包装执行函数
2. 添加更详细的错误信息（包含上下文）
3. 优化性能（缓存、流式处理等）
4. 添加进度反馈（对于长时间操作）

## Data Models

### Tool Definition Schema

```typescript
/**
 * 工具定义的完整类型
 */
export interface ToolDefinitionFull {
  // 核心字段
  id: string
  description: string
  parameters: z.ZodType
  execute: (params: unknown, ctx: Tool.Context) => Promise<Tool.Result>
  
  // MCP 对齐字段
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  title: string
  icons?: {
    light?: string
    dark?: string
  }
  
  // 元数据
  source: "builtin" | "mcp" | "custom"
  mcpServer?: string
  tags?: string[]
  version?: string
  author?: string
}
```

### MCP Configuration Schema

```typescript
/**
 * MCP 配置文件结构
 * 
 * 配置文件路径：`.kiro/mcp.json`
 * 格式：JSON
 */
export interface McpConfig {
  /** 服务器列表 */
  servers: McpServerConfig[]
  
  /** 全局设置 */
  settings?: {
    /** 默认超时（毫秒） */
    defaultTimeout?: number
    
    /** 是否启用热重载 */
    hotReload?: boolean
    
    /** 重连策略 */
    reconnect?: {
      enabled: boolean
      maxAttempts: number
      backoffMs: number
    }
    
    /** 工具超时配置（可选，覆盖默认值） */
    toolTimeouts?: {
      /** 默认超时（毫秒） */
      default?: number
      /** 按工具名称配置超时 */
      [toolName: string]: number | undefined
    }
  }
}

/**
 * 配置文件示例
 * 
 * 文件位置：`.kiro/mcp.json`
 */
const exampleConfig: McpConfig = {
  servers: [
    {
      name: "filesystem",
      transport: {
        type: "stdio",
        command: "mcp-server-filesystem",
        args: ["--root", "/path/to/workspace"]
      }
    },
    {
      name: "github",
      transport: {
        type: "sse",
        url: "https://api.github.com/mcp",
        headers: {
          "Authorization": "Bearer ${GITHUB_TOKEN}"
        }
      }
    }
  ],
  settings: {
    defaultTimeout: 30000,
    hotReload: true,
    reconnect: {
      enabled: true,
      maxAttempts: 3,
      backoffMs: 1000
    },
    toolTimeouts: {
      default: 30000,
      Read: 5000,
      Write: 10000,
      Edit: 10000,
      Grep: 15000,
      Bash: 60000,
      Glob: 10000
    }
  }
}

/**
 * 从文件加载配置
 */
export async function loadMcpConfig(
  configPath: string = ".kiro/mcp.json"
): Promise<McpConfig>

/**
 * 验证配置
 */
export function validateMcpConfig(
  config: unknown
): McpConfig
```

### Tool Registry State

```typescript
/**
 * 注册表状态
 */
interface RegistryState {
  /** 所有工具 */
  tools: Map<string, ToolEntry>
  
  /** 按来源索引 */
  bySource: Map<"builtin" | "mcp" | "custom", Set<string>>
  
  /** 按 MCP 服务器索引 */
  byMcpServer: Map<string, Set<string>>
  
  /** 变更监听器 */
  listeners: Set<(event: ToolChangeEvent) => void>
}
```

## Error Handling

### 错误分类

工具层将使用 Phase 1 定义的错误分类系统：

1. **ValidationError**（`INVALID_REQUEST`）
   - 工具参数验证失败
   - JSON Schema 转换失败
   - 配置文件格式错误

2. **ConnectionError**（`NETWORK_ERROR`）
   - MCP 服务器连接失败
   - 传输层错误
   - 超时错误

3. **ToolExecutionError**（`TOOL_EXECUTION_ERROR`）
   - 工具执行失败
   - MCP 工具调用失败
   - 内置工具执行错误

4. **PermissionError**（`PERMISSION_DENIED`）
   - 文件访问权限不足
   - 命令执行权限不足

### 错误处理策略

```typescript
/**
 * 工具执行错误处理
 */
async function executeToolWithErrorHandling(
  tool: Tool.Definition,
  params: unknown,
  ctx: Tool.Context
): Promise<Tool.Result> {
  try {
    return await tool.execute(params, ctx)
    
  } catch (error) {
    // 已经是 AgentError，直接抛出
    if (error instanceof AgentError) {
      throw error
    }
    
    // Zod 验证错误
    if (error instanceof z.ZodError) {
      throw new AgentError(
        `Tool parameter validation failed: ${formatZodError(error)}`,
        ErrorCode.INVALID_REQUEST,
        false,
        {
          tool: tool.id,
          errors: error.errors
        }
      )
    }
    
    // MCP 错误
    if (isMcpError(error)) {
      throw new AgentError(
        `MCP tool execution failed: ${error.message}`,
        ErrorCode.TOOL_EXECUTION_ERROR,
        true,
        {
          tool: tool.id,
          mcpServer: tool.mcpServer,
          originalError: error
        }
      )
    }
    
    // 其他错误
    throw new AgentError(
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.TOOL_EXECUTION_ERROR,
      true,
      {
        tool: tool.id,
        originalError: error
      }
    )
  }
}
```

### 重试策略

MCP 连接失败时使用指数退避重试：

```typescript
/**
 * 重试配置
 */
interface RetryConfig {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2
}

/**
 * 带重试的连接
 */
async function connectWithRetry(
  client: McpClient,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<void> {
  let lastError: Error | null = null
  let delay = config.initialDelayMs
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      await client.connect()
      return
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt < config.maxAttempts) {
        logger.warn(`MCP connection failed, retrying in ${delay}ms`, {
          server: client.name,
          attempt,
          maxAttempts: config.maxAttempts
        })
        
        await sleep(delay)
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs)
      }
    }
  }
  
  throw new AgentError(
    `Failed to connect to MCP server after ${config.maxAttempts} attempts`,
    ErrorCode.NETWORK_ERROR,
    true,
    {
      server: client.name,
      lastError
    }
  )
}
```

## Testing Strategy

### 测试方法

Phase 2 将采用双重测试策略：

1. **单元测试**：测试具体示例、边界情况和错误条件
2. **属性测试**：验证跨所有输入的通用属性

### 测试工具选择

- **单元测试框架**：Vitest（已在使用）
- **属性测试库**：fast-check（TypeScript 生态最成熟的 PBT 库）
- **覆盖率工具**：v8（Vitest 内置）

### 属性测试配置

每个属性测试将运行最少 100 次迭代：

```typescript
import fc from "fast-check"

describe("Tool Registry Properties", () => {
  it("Property 1: Tool registration is idempotent", () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          description: fc.string(),
          // ... 其他字段
        }),
        (toolDef) => {
          // 测试逻辑
        }
      ),
      { numRuns: 100 } // 最少 100 次迭代
    )
  })
})
```

### 测试标签格式

每个属性测试必须包含注释标签：

```typescript
/**
 * Feature: phase-2-tool-layer, Property 1: Tool registration is idempotent
 * 
 * For any tool definition, registering it multiple times should result
 * in the same state as registering it once.
 */
it("Property 1: Tool registration is idempotent", () => {
  // ...
})
```


## Correctness Properties

属性（Property）是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的形式化陈述。属性是人类可读规范和机器可验证正确性保证之间的桥梁。

### Property 1: 工具注册的唯一性约束

*对于任何*工具定义，当注册到 Tool Registry 时，如果已存在相同 ID 的工具，则应该拒绝注册或覆盖旧工具，并且注册后通过 ID 查询应该返回最新注册的工具。

**Validates: Requirements 1.4, 1.5**

### Property 2: 工具接口字段完整性

*对于任何*通过 `Tool.define()` 创建的工具定义，返回的对象应该包含所有必需字段（`id`, `description`, `parameters`, `execute`），并且可选字段（`inputSchema`, `outputSchema`, `title`, `icons`）如果提供则应该保留。

**Validates: Requirements 1.1, 1.2**

### Property 3: JSON Schema 验证正确性

*对于任何*提供的 JSON Schema，系统应该能够正确识别其是否符合 JSON Schema 规范，有效的 schema 应该被接受，无效的 schema 应该被拒绝并返回验证错误。

**Validates: Requirements 1.3**

### Property 4: MCP 连接后自动发现工具

*对于任何*成功连接的 MCP 服务器，客户端应该自动发送 `tools/list` 请求并接收工具列表，发现的工具数量应该与服务器返回的工具数量一致。

**Validates: Requirements 2.3, 3.1**

**注意**: 此属性适合用集成测试验证（需要 mock MCP 服务器），而非纯属性测试

### Property 5: MCP 工具调用请求格式

*对于任何*工具调用请求，MCP 客户端应该发送符合 JSON-RPC 2.0 规范的 `tools/call` 请求，包含正确的 `method`、`params`（工具名称和参数），并且参数应该通过 Zod 验证。

**Validates: Requirements 2.4**

### Property 6: 工具列表变更事件响应

*对于任何*接收到的 `tools/list_changed` 通知，系统应该重新获取工具列表，并且更新后的工具列表应该反映服务器的最新状态，无需重启系统。

**Validates: Requirements 2.5, 3.3**

**注意**: 此属性适合用集成测试验证（需要模拟服务器事件），而非纯属性测试

### Property 7: 连接失败的指数退避重试

*对于任何*MCP 服务器连接失败，客户端应该实施指数退避重试策略，每次重试的延迟应该是前一次的倍数（直到达到最大延迟），并且在达到最大重试次数后应该抛出 ConnectionError。

**Validates: Requirements 2.6**

### Property 8: MCP 客户端状态转换

*对于任何*MCP 客户端，其状态转换应该遵循有效的状态机：`disconnected` → `connecting` → `connected` 或 `error`，并且从 `connected` 状态可以转换回 `disconnected`，状态转换应该触发相应的事件。

**Validates: Requirements 2.7**

### Property 9: MCP 工具包装后的接口一致性

*对于任何*从 MCP 服务器发现的工具，包装后的 Tool 实例应该符合内部 Tool.Definition 接口，包含所有必需字段，并且 `execute` 方法应该能够成功调用 MCP 服务器的对应工具。

**Validates: Requirements 3.2**

### Property 10: 大量工具的分页加载

*对于任何*包含大量工具（超过阈值）的 MCP 服务器，系统应该支持分页加载，每次加载的工具数量不应超过页面大小，并且所有页面加载完成后，工具总数应该与服务器报告的总数一致。

**Validates: Requirements 3.4**

**注意**: 此属性适合用集成测试验证，而非属性测试

### Property 11: 内置工具接口一致性

*对于所有*内置工具（Read, Write, Edit, Bash, Glob, Grep），每个工具都应该符合标准化的 Tool.Definition 接口，包含所有必需字段，并且 `source` 字段应该为 `"builtin"`。

**Validates: Requirements 4.1**

### Property 12: 工具执行失败的结构化错误

*对于任何*工具执行失败的情况，系统应该返回 AgentError 实例，包含 `type`（错误码）、`message`（错误消息）和 `context`（上下文信息，包括工具 ID），并且错误应该被正确分类（ValidationError, ConnectionError, ToolExecutionError, PermissionError）。

**Validates: Requirements 4.2, 8.1**

### Property 13: 参数验证失败返回 ValidationError

*对于任何*无效的工具参数，Zod schema 验证应该在工具执行前失败，并且系统应该抛出 AgentError，错误码为 `INVALID_REQUEST`，context 中应该包含详细的字段级错误信息。

**Validates: Requirements 4.5, 8.3**

### Property 14: 工具执行错误日志记录

*对于任何*工具执行错误，系统应该使用结构化日志记录器记录错误，日志级别应该为 `error`，日志内容应该包含工具 ID、错误消息和执行时长。

**Validates: Requirements 8.5**

### Property 15: 向后兼容的格式转换

*对于任何*使用旧格式定义的工具（不包含 `inputSchema` 等新字段），系统应该自动将其转换为新格式，转换后的工具应该包含从 Zod schema 生成的 `inputSchema`，并且 `source` 应该设置为 `"builtin"`。

**Validates: Requirements 5.1, 5.2**

### Property 16: 新旧 API 共存

*对于任何*工具注册操作，无论使用旧 API 还是新 API，都应该能够成功注册工具，并且注册后的工具应该能够通过 `ToolRegistry.get()` 查询到。

**Validates: Requirements 5.3**

### Property 17: Zod 运行时验证

*对于任何*工具参数，系统应该使用 Zod 进行运行时验证，验证失败应该抛出 ZodError，并且该错误应该被转换为 AgentError（错误码 `INVALID_REQUEST`）。

**Validates: Requirements 6.2**

### Property 18: Schema 缓存避免重复解析

*对于任何*工具的 JSON Schema，第一次访问时应该从 Zod schema 生成并缓存，后续访问相同工具的 schema 应该返回缓存的实例（引用相等），而不是重新生成。

**Validates: Requirements 7.4**

### Property 19: MCP 连接复用

*对于任何*对同一 MCP 服务器的多次工具调用，应该复用同一个 MCP 客户端连接，而不是为每次调用创建新连接，可以通过验证连接建立次数来确认。

**Validates: Requirements 7.5**

**注意**: 此属性适合用集成测试验证（需要监控连接实例），而非纯属性测试

### Property 20: 配置文件加载和验证

*对于任何*有效的 MCP 配置文件（包含 stdio 和 SSE 传输配置），系统应该能够成功加载并解析，解析后的配置应该通过 schema 验证，并且包含所有必需字段。

**Validates: Requirements 10.1, 10.2, 10.4**

### Property 21: 配置热重载

*对于任何*配置文件的变更，如果启用了热重载，系统应该检测到变更并重新加载配置，新配置应该生效（新增的服务器应该被连接，移除的服务器应该被断开），并且无需重启系统。

**Validates: Requirements 10.3**

**注意**: 此属性适合用集成测试验证（需要文件系统监听），而非纯属性测试

### 单元测试场景

以下场景适合使用单元测试（具体示例）而非属性测试：

1. **stdio 传输支持**（Requirements 2.1）：测试使用 stdio 配置创建 MCP 客户端能够成功连接
2. **SSE 传输支持**（Requirements 2.2）：测试使用 SSE 配置创建 MCP 客户端能够成功连接
3. **工具执行超时**（Requirements 4.3）：测试长时间运行的工具会在 30 秒后超时
4. **旧 API 弃用警告**（Requirements 5.4）：测试使用旧 API 注册工具会产生弃用警告
5. **MCP 服务器不可达错误**（Requirements 8.2）：测试连接失败返回 ConnectionError
6. **工具执行超时错误**（Requirements 8.4）：测试超时返回 TimeoutError 并包含执行时长
7. **无效配置的错误处理**（Requirements 10.5）：测试无效配置记录错误并使用默认设置

### 边界情况和错误条件

属性测试的生成器应该包含以下边界情况：

1. **空字符串和空对象**：工具 ID、描述、参数
2. **特殊字符**：工具 ID 包含特殊字符（`:`, `/`, `.`）
3. **大数据量**：大量工具（1000+）、大参数对象
4. **并发操作**：同时注册/注销多个工具
5. **网络异常**：连接超时、连接中断、服务器无响应
6. **无效数据**：格式错误的 JSON、不符合 schema 的参数

