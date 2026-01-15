# Interface Spec: Tool System

> 工具系统的核心接口定义

## Types

```typescript
/**
 * 工具执行上下文
 */
interface ToolContext {
  /** 会话 ID，用于关联日志和状态 */
  sessionID: string
  /** 当前工作目录，所有相对路径基于此解析 */
  cwd: string
  /** 取消信号，用于中断长时间运行的操作 */
  abort: AbortSignal
}

/**
 * 工具执行结果
 */
interface ToolResult {
  /** 显示标题，简短描述操作 */
  title: string
  /** 主要输出内容，展示给用户/LLM */
  output: string
  /** 结构化元数据，用于程序处理 */
  metadata?: Record<string, unknown>
}

/**
 * 工具定义
 */
interface ToolDefinition<TParams = unknown> {
  /** 工具唯一标识符 */
  id: string
  /** 工具描述，供 LLM 理解用途 */
  description: string
  /** 参数 Schema (Zod) */
  parameters: ZodType<TParams>
  /** 执行函数 */
  execute(params: TParams, ctx: ToolContext): Promise<ToolResult>
}

/**
 * 工具注册表
 */
interface ToolRegistry {
  register<T>(tool: ToolDefinition<T>): void
  get(id: string): ToolDefinition | undefined
  list(): ToolDefinition[]
  ids(): string[]
  execute(id: string, params: unknown, ctx: ToolContext): Promise<ToolResult>
  clear(): void
}
```

## Contracts

### ToolDefinition

#### 前置条件 (Preconditions)

1. `id` 必须是非空字符串，只包含 `[a-z0-9-]`
2. `description` 必须是非空字符串
3. `parameters` 必须是有效的 Zod schema
4. `execute` 必须是异步函数

#### 后置条件 (Postconditions)

1. `execute` 返回的 `ToolResult.title` 必须非空
2. `execute` 返回的 `ToolResult.output` 必须是字符串（可为空）
3. 执行失败时必须抛出 `Error`，不返回错误码

#### 不变量 (Invariants)

1. 同一 `id` 的工具行为必须一致
2. 工具执行不应修改 `ToolContext`
3. 工具必须响应 `abort` 信号（在合理时间内）

### ToolRegistry

#### 前置条件

1. `register`: 工具 `id` 不能重复注册
2. `execute`: `id` 必须已注册

#### 后置条件

1. `register` 后，`get(id)` 必须返回该工具
2. `clear` 后，`list()` 必须返回空数组

#### 不变量

1. `list().length === ids().length`
2. 注册表是全局单例

## Error Handling

| 错误场景 | 错误类型 | 错误消息模式 |
|---------|---------|-------------|
| 工具未找到 | Error | `Tool not found: {id}` |
| 参数验证失败 | ZodError | Zod 默认消息 |
| 执行失败 | Error | 工具特定消息 |

## Extension Points

1. **自定义工具**: 通过 `Tool.define()` 创建
2. **工具中间件**: 未来可在 `execute` 前后插入钩子
3. **工具分组**: 未来可按类别组织工具
