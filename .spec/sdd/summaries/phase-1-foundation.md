# Phase 1 总结：基础能力

> 完成时间：2026-01-15
> 状态：✅ 完成

## 做了什么

实现了 Agent 的两个基础模块：

### 1. Tool 工具系统

Agent 的"手"，提供与文件系统和命令行交互的能力。

| 组件 | 文件 | 说明 |
|------|------|------|
| Tool 定义 | `src/tool/tool.ts` | 工具的类型、上下文、结果格式 |
| Registry | `src/tool/registry.ts` | 工具注册表，管理注册/查找/执行 |
| read | `src/tool/read.ts` | 读取文件，支持行号范围 |
| write | `src/tool/write.ts` | 写入文件，自动创建目录 |
| edit | `src/tool/edit.ts` | 精确字符串替换 |
| bash | `src/tool/bash.ts` | 执行 shell 命令 |
| glob | `src/tool/glob.ts` | 文件模式匹配 |
| grep | `src/tool/grep.ts` | 正则内容搜索 |

### 2. Provider LLM 调用

Agent 的"嘴"，提供调用 Claude API 的能力。

| 组件 | 文件 | 说明 |
|------|------|------|
| Provider | `src/provider/provider.ts` | Anthropic API 封装 |
| stream() | - | 流式调用，逐步返回文本和工具调用 |
| chat() | - | 非流式调用，一次性返回结果 |

## 能干什么

### Tool 系统

```typescript
// 定义工具
const MyTool = Tool.define({
  id: "my-tool",
  description: "工具描述（给 LLM 看）",
  parameters: z.object({ ... }),
  execute: async (params, ctx) => {
    return { title: "...", output: "..." }
  }
})

// 注册和执行
ToolRegistry.register(MyTool)
const result = await ToolRegistry.execute("my-tool", params, ctx)
```

### Provider 系统

```typescript
// 创建 Provider
const provider = Provider.createAnthropicProvider({
  apiKey: "...",
  baseURL: "https://kiro.proxy/v1"  // 可选代理
})

// 流式调用
for await (const event of provider.stream({
  model: Provider.DEFAULT_MODEL,
  system: "You are a coding assistant.",
  messages: [{ role: "user", content: "Hello" }],
  tools: [...]
})) {
  if (event.type === "text") console.log(event.text)
  if (event.type === "tool_call") console.log(event.name, event.args)
}
```

## 在 Agent 中的作用

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent Loop                            │
│                                                              │
│   User Input                                                 │
│       ↓                                                      │
│   ┌─────────────────┐                                       │
│   │    Provider     │  ← Phase 1: 调用 LLM                  │
│   │  (Claude API)   │                                       │
│   └────────┬────────┘                                       │
│            ↓                                                 │
│   LLM Response (text + tool_calls)                          │
│            ↓                                                 │
│   ┌─────────────────┐                                       │
│   │  Tool System    │  ← Phase 1: 执行工具                  │
│   │  read/write/... │                                       │
│   └────────┬────────┘                                       │
│            ↓                                                 │
│   Tool Results                                               │
│            ↓                                                 │
│   ┌─────────────────┐                                       │
│   │    Session      │  ← Phase 2: 管理上下文（未实现）       │
│   └────────┬────────┘                                       │
│            ↓                                                 │
│   Continue Loop...                                           │
└─────────────────────────────────────────────────────────────┘
```

**Phase 1 提供了 Agent 的两个核心原子能力：**
1. **Provider** - 让 Agent 能"思考"（调用 LLM）
2. **Tool** - 让 Agent 能"行动"（操作环境）

但还缺少把它们串联起来的"循环"和"记忆"。

## 当前整体能力

### 能做什么

| 能力 | 状态 | 说明 |
|------|------|------|
| 读取文件 | ✅ | 支持行号、offset、limit |
| 写入文件 | ✅ | 自动创建目录 |
| 编辑文件 | ✅ | 精确替换，支持 replaceAll |
| 执行命令 | ✅ | 跨平台，超时控制 |
| 搜索文件 | ✅ | glob 模式匹配 |
| 搜索内容 | ✅ | 正则表达式，上下文行 |
| 调用 LLM | ✅ | 流式/非流式，工具调用 |

### 不能做什么

| 能力 | 状态 | 需要 |
|------|------|------|
| 多轮对话 | ❌ | Session 系统 |
| 记住上下文 | ❌ | Session 系统 |
| 自动循环 | ❌ | Agent Loop |
| 用户交互 | ❌ | CLI / Permission |

## 设计决策

### 1. 使用 Zod 做参数验证

- 类型安全，编译时检查
- 自动生成 JSON Schema（给 LLM）
- 运行时验证

### 2. 使用 Vercel AI SDK

- 统一的 API 抽象
- 内置流式处理
- 支持多提供商（虽然我们只用 Anthropic）

### 3. Tool 结果格式

```typescript
Result {
  title: string    // 简短标题，用于 UI
  output: string   // 主要内容，返回给 LLM
  metadata?: {}    // 扩展信息，不影响 LLM
}
```

### 4. Context 传递

每次工具执行携带上下文：
- `sessionID` - 会话隔离
- `cwd` - 工作目录
- `abort` - 取消信号

## 下一步

进入 **Phase 2: 对话能力**，实现 Session 系统：

1. **Session** - 会话管理（创建、加载、保存）
2. **Message** - 消息结构（用户、助手、工具结果）
3. **History** - 构建发送给 LLM 的消息列表

完成 Phase 2 后，就可以进入 Phase 3 实现 Agent Loop，让整个系统跑起来。

## 相关文件

### 规格文件

- `.spec/sdd/interfaces/tool.spec.md`
- `.spec/sdd/interfaces/provider.spec.md`
- `.spec/sdd/behaviors/tools/*.behavior.md`

### 实现文件

- `packages/agent/src/tool/`
- `packages/agent/src/provider/`
