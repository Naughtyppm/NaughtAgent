# 核心引擎层

核心引擎层是 Agent 的心脏，负责 LLM 交互、工具执行和循环控制。

## 1. Agent Loop（核心循环）

```
用户输入 → LLM 生成 → 工具调用 → 结果反馈 → LLM 继续 → ... → 完成
```

### 关键能力

| 能力 | 说明 | 实现文件 |
|------|------|---------|
| 流式输出 | SSE / WebSocket 实时推送 | `agent/loop.ts` |
| 错误恢复 | 错误分类 + 自动重试策略 | `agent/loop.ts` |
| 循环终止 | 最大轮次、无工具调用、用户中断 | `agent/loop.ts` |
| 中断控制 | AbortController 优雅取消 | `agent/loop.ts` |

### 错误追踪机制

```typescript
interface ErrorTracker {
  count: number
  lastError: string
  errorType: ErrorType
}

// 错误类型分类
type ErrorType = 
  | "network"      // 网络错误 → 重试
  | "auth"         // 认证错误 → 提示用户
  | "rate_limit"   // 限流 → 等待重试
  | "tool_error"   // 工具执行错误 → 反馈给 LLM
  | "unknown"      // 未知错误 → 记录并继续
```

## 2. LLM Provider（模型提供者）

### 接口定义

```typescript
interface LLMProvider {
  stream(messages: Message[], tools: ToolDefinition[]): AsyncIterable<StreamEvent>
  chat(messages: Message[], tools: ToolDefinition[]): Promise<ChatResponse>
}
```

### 已实现 Provider

| Provider | 文件 | 状态 |
|----------|------|------|
| Anthropic | `provider/anthropic.ts` | ✅ 主力 |
| OpenAI | `provider/openai.ts` | ✅ 备选 |
| Kiro | `provider/kiro.ts` | ✅ 实验 |

### 工厂模式

```typescript
// provider/factory.ts
function createProvider(config: ModelConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic": return createAnthropicProvider(config)
    case "openai": return createOpenAIProvider(config)
    case "kiro": return createKiroProvider(config)
    case "auto": return createAutoProvider(config) // 自动选择
  }
}
```

## 3. Tool System（工具系统）

### 工具定义模式

```typescript
// tool/tool.ts - Tool.define() 模式
export const ReadTool = Tool.define({
  id: "read",
  description: "读取文件内容",
  parameters: z.object({
    path: z.string().describe("文件路径"),
    start_line: z.number().optional(),
    end_line: z.number().optional(),
  }),
  execute: async (params, ctx) => {
    // 执行逻辑
    return { title: "read", output: content, metadata: {} }
  }
})
```

### 内置工具清单

| 工具 | ID | 功能 | 超时 |
|------|-----|------|------|
| 读取文件 | `read` | 读取文件内容，支持行范围 | 5s |
| 写入文件 | `write` | 创建或覆盖文件 | 10s |
| 追加内容 | `append` | 追加内容到文件末尾 | 10s |
| 编辑文件 | `edit` | 搜索替换编辑 | 10s |
| 文件搜索 | `glob` | 按文件名模式搜索 | 10s |
| 内容搜索 | `grep` | 正则表达式搜索文件内容 | 15s |
| 执行命令 | `bash` | 执行 Shell 命令 | 60s |

### 子代理工具

| 工具 | ID | 功能 | 超时 |
|------|-----|------|------|
| LLM 调用 | `ask_llm` | 无窗口单次 LLM 调用 | 60s |
| 运行子代理 | `run_agent` | 启动独立子 Agent | 180s |
| 分叉代理 | `fork_agent` | 从当前上下文分叉 | 180s |
| 并行代理 | `parallel_agents` | 并行执行多个子任务 | 300s |
| 多代理协作 | `multi_agent` | 多 Agent 协作完成任务 | 300s |
| 工作流 | `run_workflow` | 执行预定义工作流 | 300s |

### 工具执行流程

```
1. 参数验证（Zod schema）
2. 权限检查（Permission System）
3. 安全检查（Security Checker）
4. 执行工具（带超时控制）
5. 输出截断（大输出处理）
6. 返回结果
```

## 4. 关键文件索引

| 文件 | 职责 |
|------|------|
| `agent/agent.ts` | Agent 定义、类型、事件 |
| `agent/loop.ts` | 核心循环、错误追踪 |
| `agent/prompt.ts` | 系统提示词构建 |
| `provider/types.ts` | Provider 接口定义 |
| `provider/anthropic.ts` | Anthropic 实现 |
| `provider/factory.ts` | Provider 工厂 |
| `tool/tool.ts` | 工具系统核心 |
| `tool/registry.ts` | 工具注册表 |
