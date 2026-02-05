# MVP Sprint - 设计文档

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Input     │  │   Output    │  │   Tool Display      │  │
│  │   Handler   │  │   Renderer  │  │   (spinner, diff)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Agent Loop                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                      │    │
│  │   User Message ──► LLM Call ──► Response Parse      │    │
│  │         ▲                              │             │    │
│  │         │                              ▼             │    │
│  │   Tool Result ◄── Tool Execute ◄── Tool Call?       │    │
│  │                                        │             │    │
│  │                                        ▼             │    │
│  │                                   Final Response     │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   LLM Provider  │ │  Tool Registry  │ │    Session      │
│   (Claude API)  │ │  (内置工具)      │ │    (简化版)     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## 核心组件

### 1. Agent Loop（核心引擎）

**职责**：协调 LLM 调用和工具执行的循环

**接口**：
```typescript
interface AgentLoop {
  // 运行一轮对话
  run(input: string, options?: RunOptions): Promise<AgentResponse>;

  // 中断当前执行
  abort(): void;
}

interface RunOptions {
  // 最大循环次数（防止无限循环）
  maxIterations?: number;  // 默认 10

  // 工具调用回调（用于 UI 显示）
  onToolCall?: (tool: string, args: unknown) => void;
  onToolResult?: (tool: string, result: unknown) => void;
}

interface AgentResponse {
  // 最终文本响应
  content: string;

  // 工具调用历史
  toolCalls: ToolCallRecord[];

  // 使用统计
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
```

**状态机**：
```
IDLE ──► CALLING_LLM ──► PARSING_RESPONSE
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        EXECUTING_TOOL                   COMPLETED
              │
              ▼
        CALLING_LLM (循环)
```

### 2. LLM Provider（模型调用）

**职责**：封装 Claude API 调用

**接口**：
```typescript
interface LLMProvider {
  // 调用 LLM
  call(request: LLMRequest): Promise<LLMResponse>;
}

interface LLMRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  system?: string;
}

interface LLMResponse {
  content: ContentBlock[];  // 文本或工具调用
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: TokenUsage;
}
```

**实现**：使用 `@ai-sdk/anthropic` 或直接调用 Anthropic API

### 3. Tool Registry（工具注册）

**职责**：管理可用工具

**接口**：
```typescript
interface ToolRegistry {
  // 获取工具
  get(id: string): Tool | undefined;

  // 列出所有工具
  list(): Tool[];

  // 执行工具
  execute(id: string, args: unknown, ctx: ToolContext): Promise<ToolResult>;
}
```

**MVP 内置工具**：
- `read` - 读取文件
- `write` - 写入文件
- `edit` - 编辑文件
- `bash` - 执行命令
- `glob` - 文件匹配
- `grep` - 文本搜索

### 4. CLI Interface（命令行界面）

**职责**：用户交互

**功能**：
- 读取用户输入（readline）
- 显示 Agent 响应（markdown 渲染）
- 显示工具调用（spinner + 结果）
- 处理中断（Ctrl+C）

## 数据流

### 正常对话流程

```
1. 用户输入 "读一下 package.json"
   │
2. CLI 调用 AgentLoop.run(input)
   │
3. AgentLoop 构建消息，调用 LLMProvider.call()
   │
4. LLM 返回工具调用：{ tool: "read", args: { path: "package.json" } }
   │
5. AgentLoop 调用 ToolRegistry.execute("read", args)
   │
6. Read 工具返回文件内容
   │
7. AgentLoop 将工具结果添加到消息，再次调用 LLM
   │
8. LLM 返回最终响应（文本）
   │
9. AgentLoop 返回 AgentResponse
   │
10. CLI 显示响应
```

### 错误处理流程

```
工具执行失败：
  Tool.execute() throws Error
       │
       ▼
  AgentLoop 捕获错误，构造错误消息
       │
       ▼
  将错误信息作为工具结果返回给 LLM
       │
       ▼
  LLM 根据错误信息决定下一步（重试/报告/换方案）

LLM 调用失败：
  LLMProvider.call() throws Error
       │
       ▼
  AgentLoop 重试（最多 3 次，指数退避）
       │
       ▼
  仍然失败则抛出错误给 CLI
       │
       ▼
  CLI 显示友好错误信息
```

## 文件结构

```
packages/agent/src/
├── agent/
│   ├── loop.ts          # Agent Loop 实现 ← MVP 核心
│   ├── types.ts         # Agent 类型定义
│   └── index.ts         # 导出
├── provider/
│   ├── anthropic.ts     # Claude API 封装 ← MVP 核心
│   ├── types.ts         # Provider 类型
│   └── index.ts         # 导出
├── tool/
│   ├── registry.ts      # 工具注册表（已有）
│   ├── tool.ts          # 工具定义（已有）
│   ├── read.ts          # Read 工具（已有）
│   ├── write.ts         # Write 工具（已有）
│   ├── edit.ts          # Edit 工具（已有）
│   ├── bash.ts          # Bash 工具（已有）
│   ├── glob.ts          # Glob 工具（已有）
│   ├── grep.ts          # Grep 工具（已有）
│   └── index.ts         # 导出
├── cli/
│   ├── repl.ts          # REPL 交互 ← MVP 核心
│   ├── renderer.ts      # 输出渲染
│   └── index.ts         # CLI 入口
└── index.ts             # 主入口
```

## 配置

### 环境变量

```bash
# 必需
ANTHROPIC_API_KEY=sk-ant-xxx

# 可选
ANTHROPIC_BASE_URL=https://api.anthropic.com  # 或代理地址
AGENT_MODEL=claude-sonnet-4                    # 默认模型
AGENT_MAX_TOKENS=4096                          # 最大输出 token
```

### 系统提示词

```typescript
const SYSTEM_PROMPT = `你是 NaughtAgent，一个 AI 编程助手。

你可以使用以下工具来帮助用户：
- read: 读取文件内容
- write: 写入文件内容
- edit: 编辑文件（查找替换）
- bash: 执行 shell 命令
- glob: 查找匹配的文件
- grep: 搜索文件内容

工作原则：
1. 先理解用户意图，再决定使用什么工具
2. 修改文件前先读取确认内容
3. 执行命令前考虑安全性
4. 遇到错误时尝试其他方案
5. 保持响应简洁清晰
`;
```

## 依赖

### 必需依赖
- `@anthropic-ai/sdk` - Anthropic 官方 SDK
- `zod` - 参数验证（已有）

### CLI 依赖
- `readline` - Node.js 内置
- `chalk` - 终端颜色
- `ora` - 加载动画

## 测试策略

### MVP 测试重点

1. **Agent Loop 单元测试**
   - 正常对话流程
   - 工具调用流程
   - 多轮工具调用
   - 错误处理

2. **集成测试**
   - 真实 LLM 调用（需要 API Key）
   - 完整场景测试

3. **手动测试**
   - CLI 交互体验
   - 各种边界情况

### 测试命令

```bash
# 单元测试
pnpm test

# 集成测试（需要 API Key）
pnpm test:integration

# 手动测试
pnpm cli
```
