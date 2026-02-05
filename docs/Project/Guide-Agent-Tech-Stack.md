# Claude Agent SDK 技术栈演进指南

> 渐进式理解 Agent 体系：每个环节要解决什么问题，如何解决
>
> 创建时间：2026-01-31

## 目录

1. [学习路径总览](#1-学习路径总览)
2. [Level 0: LLM 基础调用](#2-level-0-llm-基础调用)
3. [Level 1: 工具调用](#3-level-1-工具调用)
4. [Level 2: Agent 循环](#4-level-2-agent-循环)
5. [Level 3: 上下文管理](#5-level-3-上下文管理)
6. [Level 4: 流式响应](#6-level-4-流式响应)
7. [Level 5: 会话持久化](#7-level-5-会话持久化)
8. [Level 6: 错误处理与重试](#8-level-6-错误处理与重试)
9. [Level 7: 权限与安全](#9-level-7-权限与安全)
10. [Level 8: MCP 协议集成](#10-level-8-mcp-协议集成)
11. [Level 9: 多执行模式](#11-level-9-多执行模式)
12. [Level 10: 高级能力](#12-level-10-高级能力)
13. [完整架构图](#13-完整架构图)

---

## 1. 学习路径总览

### 1.1 演进层次

```
Level 10: 高级能力      ─── 技能系统、子代理、钩子、任务规划
Level 9:  多执行模式    ─── ask_llm, run_agent, fork_agent, run_workflow
Level 8:  MCP 协议      ─── 外部工具发现、标准化接口
Level 7:  权限与安全    ─── 多层防护、沙箱隔离
Level 6:  错误处理      ─── 错误分类、自动重试、优雅降级
Level 5:  会话持久化    ─── 保存、恢复、分支、成本追踪
Level 4:  流式响应      ─── 实时输出、增量更新、可中断
Level 3:  上下文管理    ─── Token 限制、压缩、项目记忆
Level 2:  Agent 循环    ─── while(tool_call) 模式
Level 1:  工具调用      ─── Function Calling、Tool Use
Level 0:  LLM 基础      ─── API 调用、消息格式
```

### 1.2 每层解决的核心问题

| Level | 核心问题 | 一句话答案 |
|-------|----------|------------|
| 0 | 如何调用 LLM？ | 发送消息，获取响应 |
| 1 | 如何让 LLM 执行操作？ | Tool Use / Function Calling |
| 2 | 如何让 LLM 自主完成任务？ | 循环执行直到完成 |
| 3 | 对话太长怎么办？ | 压缩、摘要、分层记忆 |
| 4 | 等待太久怎么办？ | 流式输出、实时反馈 |
| 5 | 如何保存对话？ | 持久化存储、会话管理 |
| 6 | 出错了怎么办？ | 分类处理、自动重试 |
| 7 | 如何防止危险操作？ | 多层防护、权限控制 |
| 8 | 如何扩展工具？ | MCP 协议、动态发现 |
| 9 | 不同任务如何处理？ | 多种执行模式 |
| 10 | 如何增强能力？ | 技能、子代理、钩子 |

### 1.3 NaughtyAgent 实现评级

| Level | 模块 | 实现状态 | 评级 | 说明 |
|-------|------|----------|------|------|
| 0 | LLM 基础调用 | ✅ 完成 | ⭐⭐⭐⭐⭐ | Vercel AI SDK 封装，多模型支持 |
| 1 | 工具调用 | ✅ 完成 | ⭐⭐⭐⭐⭐ | 完整工具集：Read/Write/Edit/Bash/Grep/Glob |
| 2 | Agent 循环 | ✅ 完成 | ⭐⭐⭐⭐⭐ | 标准 while(tool_use) 实现 |
| 3 | 上下文管理 | ✅ 完成 | ⭐⭐⭐⭐ | Token 计数、压缩策略、滑动窗口 |
| 4 | 流式响应 | ✅ 完成 | ⭐⭐⭐⭐⭐ | 完整流式支持 |
| 5 | 会话持久化 | ✅ 完成 | ⭐⭐⭐⭐⭐ | Session 管理、分支、标签、成本追踪 |
| 6 | 错误处理 | ✅ 完成 | ⭐⭐⭐⭐⭐ | 错误分类、指数退避、Fallback |
| 7 | 权限与安全 | ✅ 完成 | ⭐⭐⭐⭐ | 权限回调、命令风险分类 |
| 8 | MCP 协议 | ✅ 完成 | ⭐⭐⭐⭐⭐ | 完整实现：Client/Pool/Retry/Adapter |
| 9 | 多执行模式 | ✅ 完成 | ⭐⭐⭐⭐⭐ | 4 种模式全部实现 + Chain API |
| 10 | 高级能力 | ✅ 完成 | ⭐⭐⭐⭐ | 技能系统、TODO、部分钩子 |

**总体评级**: ⭐⭐⭐⭐⭐ (4.7/5)

**亮点**:
- 四种执行模式完整实现（ask_llm/run_agent/fork_agent/run_workflow）
- MCP 协议完整支持（连接池、重试、适配器）
- Chain API 链式调用
- 上下文压缩策略丰富

**待完善**:
- 钩子系统（Hooks）可进一步增强
- 子代理调度可增加更多内置代理

---

## 2. Level 0: LLM 基础调用

### 2.1 要解决的问题

**问题**：如何与 LLM 通信？

**具体挑战**：
- API 认证和调用
- 消息格式规范
- 响应解析

### 2.2 解决方案

**消息格式**（Anthropic 规范）：

```typescript
// 消息类型
type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
};

// 内容块类型
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource }
  | { type: 'tool_use'; id: string; name: string; input: object }
  | { type: 'tool_result'; tool_use_id: string; content: string };
```

**基础调用**：

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 最简单的调用
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: '你好' }
  ]
});

console.log(response.content[0].text);
```

### 2.3 关键概念

| 概念 | 说明 |
|------|------|
| `messages` | 对话历史，交替的 user/assistant 消息 |
| `max_tokens` | 最大输出 token 数 |
| `stop_reason` | 停止原因：`end_turn` / `max_tokens` / `tool_use` |
| `usage` | Token 使用统计 |

### 2.4 NaughtyAgent 实现

```typescript
// packages/agent/src/provider/anthropic.ts
// 使用 Vercel AI SDK 封装
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const result = await generateText({
  model: anthropic('claude-sonnet-4-20250514'),
  messages: [{ role: 'user', content: '你好' }]
});
```

### 2.5 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐⭐ | 完整实现 |
| 代码质量 | ⭐⭐⭐⭐⭐ | Vercel AI SDK 封装，类型安全 |
| 扩展性 | ⭐⭐⭐⭐⭐ | 支持多模型（Anthropic/OpenAI） |

**实现位置**: `packages/agent/src/provider/`

**特色**:
- 使用 Vercel AI SDK 统一封装
- 支持 Anthropic 和 OpenAI
- Provider 工厂模式，易于扩展

---

## 3. Level 1: 工具调用

### 3.1 要解决的问题

**问题**：LLM 只能生成文本，如何让它执行实际操作？

**具体挑战**：
- LLM 无法读写文件
- LLM 无法执行命令
- LLM 无法访问外部系统

### 3.2 解决方案：Tool Use

**核心思想**：让 LLM 输出"我想调用某个工具"，由程序执行后返回结果。

```
用户: "读取 package.json 文件"
  ↓
LLM: "我需要调用 Read 工具，参数是 {path: 'package.json'}"
  ↓
程序: 执行 Read('package.json')，返回文件内容
  ↓
LLM: "这个文件包含..."
```

**关键问题**：LLM 怎么知道有哪些工具可用？

**答案**：在 API 调用时，通过 `tools` 参数告诉 LLM。

### 3.3 告诉 LLM 有哪些工具

**工具定义格式**（JSON Schema）：

```typescript
// 每个工具需要定义：
// 1. name - 工具名称（LLM 调用时使用）
// 2. description - 工具描述（LLM 理解用途）
// 3. input_schema - 参数格式（LLM 知道传什么参数）

const tools = [
  {
    name: 'Read',
    description: '读取文件内容。当需要查看文件时使用此工具。',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要读取的文件路径，如 src/index.ts'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'Write',
    description: '写入文件内容。当需要创建或覆盖文件时使用此工具。',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要写入的文件路径'
        },
        content: {
          type: 'string',
          description: '要写入的文件内容'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'Bash',
    description: '执行 shell 命令。当需要运行命令行操作时使用。',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令，如 npm install'
        }
      },
      required: ['command']
    }
  }
];
```

**调用 API 时传入工具列表**：

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  tools: tools,  // ← 关键：告诉 LLM 有哪些工具
  messages: [
    { role: 'user', content: '读取 package.json 文件' }
  ]
});
```

**LLM 收到的信息**（概念上）：

```
系统：你可以使用以下工具：

1. Read - 读取文件内容
   参数：path (string, 必填) - 要读取的文件路径

2. Write - 写入文件内容
   参数：path (string, 必填), content (string, 必填)

3. Bash - 执行 shell 命令
   参数：command (string, 必填)

用户：读取 package.json 文件
```

**LLM 的响应**：

```typescript
// LLM 理解了用户意图，决定调用 Read 工具
{
  stop_reason: 'tool_use',
  content: [
    { type: 'text', text: '我来读取这个文件。' },
    {
      type: 'tool_use',
      id: 'toolu_01ABC123',
      name: 'Read',           // 选择了 Read 工具
      input: { path: 'package.json' }  // 填入了正确的参数
    }
  ]
}
```

### 3.4 完整的工具定义示例

**NaughtyAgent 的工具定义**（实际代码）：

```typescript
// packages/agent/src/tool/read.ts
import { z } from 'zod';

export const ReadTool = {
  name: 'Read',
  description: `读取文件内容。
- 支持任意文本文件
- 可指定行范围（offset, limit）
- 返回带行号的内容`,

  // 使用 Zod 定义参数 schema（会自动转换为 JSON Schema）
  parameters: z.object({
    path: z.string().describe('文件路径'),
    offset: z.number().optional().describe('起始行号（从 0 开始）'),
    limit: z.number().optional().describe('读取行数限制')
  }),

  // 工具执行函数
  execute: async ({ path, offset, limit }) => {
    const content = await fs.readFile(path, 'utf-8');
    // ... 处理 offset/limit
    return content;
  }
};
```

**转换为 API 格式**：

```typescript
// Zod schema 转换为 JSON Schema
import { zodToJsonSchema } from 'zod-to-json-schema';

function toolToApiFormat(tool) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: zodToJsonSchema(tool.parameters)
  };
}

// 结果
{
  name: 'Read',
  description: '读取文件内容...',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      offset: { type: 'number', description: '起始行号（从 0 开始）' },
      limit: { type: 'number', description: '读取行数限制' }
    },
    required: ['path']
  }
}
```

### 3.5 工具描述的重要性

**好的描述** vs **差的描述**：

```typescript
// ❌ 差的描述 - LLM 不知道什么时候用
{
  name: 'Read',
  description: '读取文件'
}

// ✅ 好的描述 - LLM 清楚知道用途和限制
{
  name: 'Read',
  description: `读取文件内容。
使用场景：
- 查看源代码文件
- 检查配置文件
- 分析日志文件

注意：
- 大文件建议使用 offset/limit 分页读取
- 二进制文件不适用此工具`
}
```

**参数描述也很重要**：

```typescript
// ❌ 差的参数描述
properties: {
  path: { type: 'string' }
}

// ✅ 好的参数描述
properties: {
  path: {
    type: 'string',
    description: '文件路径，相对于项目根目录，如 src/index.ts'
  }
}
```

### 3.6 执行工具并返回结果

```typescript
// 执行工具
const toolResult = await executeRead({ path: 'package.json' });

// 将结果返回给 LLM
const followUp = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  tools: tools,
  messages: [
    { role: 'user', content: '读取 package.json 文件' },
    { role: 'assistant', content: response.content },  // LLM 的工具调用
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_01ABC123',
          content: toolResult  // 工具执行结果
        }
      ]
    }
  ]
});
```

### 3.7 关键概念

| 概念 | 说明 |
|------|------|
| `tools` | 工具定义列表，告诉 LLM 有哪些工具可用 |
| `tool_use` | LLM 输出的工具调用请求 |
| `tool_result` | 程序返回给 LLM 的工具执行结果 |
| `tool_use_id` | 关联工具调用和结果的 ID |
| `description` | 工具描述，帮助 LLM 理解何时使用 |
| `input_schema` | 参数格式，帮助 LLM 知道传什么参数 |

### 3.8 这一层解决了什么？

✅ LLM 可以"执行"操作了（通过程序代理执行）
❌ 但只能执行一次，复杂任务需要多次工具调用

### 3.9 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐⭐ | 完整实现 |
| 工具丰富度 | ⭐⭐⭐⭐⭐ | Read/Write/Edit/Bash/Grep/Glob |
| 代码质量 | ⭐⭐⭐⭐⭐ | Zod Schema 验证，类型安全 |

**实现位置**: `packages/agent/src/tool/`

**内置工具**:
- `Read` - 读取文件
- `Write` - 写入文件
- `Edit` - 编辑文件（diff-based）
- `Bash` - 执行命令
- `Grep` - 正则搜索
- `Glob` - 文件匹配

**特色**:
- 统一的 Tool 接口
- JSON Schema 输入验证
- 支持 MCP 工具动态加载

---

## 4. Level 2: Agent 循环

### 4.1 要解决的问题

**问题**：复杂任务需要多次工具调用，如何自动化？

**具体挑战**：
- "重构这个模块" 需要：读文件 → 分析 → 修改 → 写文件 → 测试
- 每次工具调用后，需要继续让 LLM 决定下一步
- 什么时候停止？

### 4.2 解决方案：Agent Loop

**核心模式**：`while (stop_reason === 'tool_use')` 循环

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent 循环                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    用户输入                                                  │
│        │                                                    │
│        ▼                                                    │
│    ┌───────────┐                                           │
│    │  调用 LLM  │◄─────────────────────┐                   │
│    └─────┬─────┘                       │                   │
│          │                             │                   │
│          ▼                             │                   │
│    ┌───────────┐    是    ┌───────────┐│                   │
│    │ tool_use? │────────►│ 执行工具   ││                   │
│    └─────┬─────┘         └─────┬─────┘│                   │
│          │ 否                   │       │                   │
│          ▼                     │       │                   │
│    ┌───────────┐               │       │                   │
│    │ 返回结果   │               └───────┘                   │
│    └───────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 实现代码

```typescript
async function runAgent(userPrompt: string): Promise<string> {
  const messages: Message[] = [
    { role: 'user', content: userPrompt }
  ];

  // Agent 主循环
  while (true) {
    // 1. 调用 LLM
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: tools,
      messages: messages
    });

    // 2. 将 LLM 响应加入历史
    messages.push({ role: 'assistant', content: response.content });

    // 3. 检查是否需要执行工具
    if (response.stop_reason === 'tool_use') {
      // 找到所有工具调用
      const toolUses = response.content.filter(b => b.type === 'tool_use');

      // 执行每个工具
      const toolResults = [];
      for (const toolUse of toolUses) {
        const result = await executeTool(toolUse.name, toolUse.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result
        });
      }

      // 4. 将工具结果加入历史
      messages.push({ role: 'user', content: toolResults });

      // 继续循环
      continue;
    }

    // 5. 没有工具调用，返回最终结果
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text || '';
  }
}
```

### 4.4 工具执行器

```typescript
async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'Read':
      return await fs.readFile(input.path, 'utf-8');

    case 'Write':
      await fs.writeFile(input.path, input.content);
      return `文件已写入: ${input.path}`;

    case 'Bash':
      const { stdout, stderr } = await exec(input.command);
      return stdout || stderr;

    default:
      return `未知工具: ${name}`;
  }
}
```

### 4.5 防止无限循环

```typescript
async function runAgent(userPrompt: string, maxTurns = 10): Promise<string> {
  let turns = 0;

  while (turns < maxTurns) {
    turns++;

    const response = await client.messages.create({ ... });

    if (response.stop_reason !== 'tool_use') {
      return extractText(response);
    }

    // 执行工具...
  }

  throw new Error(`超过最大轮次限制: ${maxTurns}`);
}
```

### 4.6 关键概念

| 概念 | 说明 |
|------|------|
| Agent Loop | 循环执行 LLM 调用和工具执行 |
| `stop_reason` | 判断循环是否继续的关键 |
| `max_turns` | 防止无限循环的安全阀 |
| 消息历史 | 累积的对话记录，提供上下文 |

### 4.7 这一层解决了什么？

✅ LLM 可以自主完成多步骤任务
✅ 自动决定何时停止
❌ 对话太长会超出 token 限制

### 4.8 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐⭐ | 完整实现 |
| 代码质量 | ⭐⭐⭐⭐⭐ | 清晰的循环结构 |
| 可配置性 | ⭐⭐⭐⭐⭐ | max_turns、超时控制 |

**实现位置**: `packages/agent/src/agent/agent.ts`

**特色**:
- 标准 while(tool_use) 模式
- 支持 max_turns 限制
- 支持中断和恢复
- 集成权限检查

---

## 5. Level 3: 上下文管理

### 5.1 要解决的问题

**问题**：对话历史越来越长，超出 LLM 的上下文窗口怎么办？

**具体挑战**：
- Claude 上下文窗口：200K tokens（约 15 万字）
- 长对话 + 大文件内容 = 快速耗尽
- 简单截断会丢失重要信息

### 5.2 解决方案

**策略 1：Token 计数与预警**

```typescript
import { countTokens } from '@anthropic-ai/tokenizer';

function getContextSize(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    total += countTokens(content);
  }
  return total;
}

// 在 Agent 循环中检查
const contextSize = getContextSize(messages);
if (contextSize > 150000) {  // 预留 50K 给输出
  messages = await compressContext(messages);
}
```

**策略 2：上下文压缩**

```typescript
async function compressContext(messages: Message[]): Promise<Message[]> {
  // 保留：第一条用户消息 + 最近 N 轮
  const firstUser = messages[0];
  const recentMessages = messages.slice(-10);

  // 中间部分让 LLM 摘要
  const middleMessages = messages.slice(1, -10);
  const summary = await summarize(middleMessages);

  return [
    firstUser,
    { role: 'assistant', content: `[之前的对话摘要]\n${summary}` },
    ...recentMessages
  ];
}

async function summarize(messages: Message[]): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-haiku-3-20240307',  // 用便宜的模型做摘要
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `请摘要以下对话的关键信息：\n${JSON.stringify(messages)}`
      }
    ]
  });
  return response.content[0].text;
}
```

**策略 3：项目记忆（CLAUDE.md）**

```typescript
// 层级加载项目记忆
function loadProjectMemory(workingDir: string): string[] {
  const memories: string[] = [];

  // 1. 全局记忆 ~/.claude/CLAUDE.md
  const globalPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  if (fs.existsSync(globalPath)) {
    memories.push(fs.readFileSync(globalPath, 'utf-8'));
  }

  // 2. 项目记忆 ./CLAUDE.md
  const projectPath = path.join(workingDir, 'CLAUDE.md');
  if (fs.existsSync(projectPath)) {
    memories.push(fs.readFileSync(projectPath, 'utf-8'));
  }

  return memories;
}

// 注入到系统提示
const systemPrompt = `
你是一个编程助手。

${loadProjectMemory(cwd).join('\n\n')}
`;
```

**策略 4：智能文件加载**

```typescript
// 不要一次性读取整个大文件
async function smartRead(path: string, options?: {
  startLine?: number;
  endLine?: number;
  maxLines?: number;
}): Promise<string> {
  const content = await fs.readFile(path, 'utf-8');
  const lines = content.split('\n');

  const start = options?.startLine || 0;
  const end = options?.endLine || Math.min(start + (options?.maxLines || 200), lines.length);

  return lines.slice(start, end).join('\n');
}
```

### 5.3 关键概念

| 概念 | 说明 |
|------|------|
| 上下文窗口 | LLM 能处理的最大 token 数 |
| Token 计数 | 预估消息占用的 token |
| 上下文压缩 | 摘要旧消息，保留关键信息 |
| 项目记忆 | 持久化的项目知识（CLAUDE.md） |

### 5.4 这一层解决了什么？

✅ 长对话不会超出限制
✅ 重要信息不会丢失
✅ 项目知识可以持久化
❌ 用户等待响应时间长

### 5.5 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐ | 核心功能完整 |
| 压缩策略 | ⭐⭐⭐⭐⭐ | 滑动窗口、重要性评估、LLM 摘要 |
| Token 管理 | ⭐⭐⭐⭐⭐ | TokenBudgetManager 完整实现 |

**实现位置**: `packages/agent/src/subtask/context/`

**特色**:
- `TokenBudgetManager` - Token 预算管理
- `compressBySlidingWindow` - 滑动窗口压缩
- `compressByImportance` - 重要性评估压缩
- `generateLLMSummary` - LLM 生成摘要
- `ContextManager` - 统一上下文管理

**压缩策略**:
```typescript
type CompressionStrategy = 'sliding_window' | 'importance' | 'hybrid';
```

---

## 6. Level 4: 流式响应

### 6.1 要解决的问题

**问题**：LLM 响应需要几秒到几十秒，用户干等着？

**具体挑战**：
- 长响应可能需要 10-30 秒
- 用户不知道是否在工作
- 无法中途取消或调整

### 6.2 解决方案：Streaming

**核心思想**：LLM 边生成边返回，逐字显示。

```
传统模式：
用户 ──────────────────────────────────────► [等待 10 秒] ──► 完整响应

流式模式：
用户 ──► 我 ──► 我来 ──► 我来帮 ──► 我来帮你 ──► ... ──► 完整响应
         ↑      ↑        ↑          ↑
       即时    即时      即时       即时
```

### 6.3 实现代码

**基础流式调用**：

```typescript
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{ role: 'user', content: '写一个快速排序' }]
});

// 逐块处理
for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    if (event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text);  // 实时输出
    }
  }
}
```

**流式事件类型**：

```typescript
type StreamEvent =
  | { type: 'message_start'; message: { id: string; model: string } }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: Delta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string } }
  | { type: 'message_stop' };

type Delta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string };
```

**流式 Agent 循环**：

```typescript
async function* streamAgent(userPrompt: string): AsyncGenerator<StreamEvent> {
  const messages: Message[] = [{ role: 'user', content: userPrompt }];

  while (true) {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: tools,
      messages: messages
    });

    let assistantContent: ContentBlock[] = [];
    let stopReason: string = '';

    // 流式输出
    for await (const event of stream) {
      yield event;  // 转发给调用者

      // 收集完整响应
      if (event.type === 'content_block_start') {
        assistantContent.push(event.content_block);
      }
      if (event.type === 'content_block_delta') {
        // 更新内容块...
      }
      if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason;
      }
    }

    messages.push({ role: 'assistant', content: assistantContent });

    if (stopReason === 'tool_use') {
      // 执行工具...
      const toolResults = await executeTools(assistantContent);
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }
}

// 使用
for await (const event of streamAgent('重构登录模块')) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
```

### 6.4 流式工具调用

工具调用的参数也是流式的（`input_json_delta`）：

```typescript
// 工具调用的流式事件
{ type: 'content_block_start', content_block: { type: 'tool_use', name: 'Read' } }
{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"pa' } }
{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: 'th":' } }
{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '"src' } }
{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '.ts"}' } }
{ type: 'content_block_stop' }

// 需要累积 partial_json 后解析
let jsonStr = '';
for (const delta of deltas) {
  jsonStr += delta.partial_json;
}
const input = JSON.parse(jsonStr);  // { path: 'src.ts' }
```

### 6.5 关键概念

| 概念 | 说明 |
|------|------|
| Streaming | 边生成边返回，实时输出 |
| `text_delta` | 文本增量 |
| `input_json_delta` | 工具参数增量 |
| AsyncGenerator | 异步生成器，用于流式 API |

### 6.6 这一层解决了什么？

✅ 用户立即看到响应
✅ 可以中途取消
✅ 更好的用户体验
❌ 对话关闭后历史丢失

### 6.7 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐⭐ | 完整实现 |
| 用户体验 | ⭐⭐⭐⭐⭐ | CLI 实时输出、Markdown 渲染 |
| 代码质量 | ⭐⭐⭐⭐⭐ | AsyncGenerator 模式 |

**实现位置**: `packages/agent/src/cli/`, `packages/agent/src/ux/`

**特色**:
- 完整的流式事件处理
- CLI Markdown 实时渲染
- Diff 预览显示
- 工具调用实时通知

---

## 7. Level 5: 会话持久化

### 7.1 要解决的问题

**问题**：关闭程序后对话历史丢失，如何保存和恢复？

**具体挑战**：
- 长任务中断后如何继续
- 如何管理多个会话
- 如何追踪成本

### 7.2 解决方案

**会话数据结构**：

```typescript
interface Session {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
  metadata: {
    title?: string;
    tags: string[];
    totalTokens: number;
    totalCostUsd: number;
    numTurns: number;
  };
}
```

**会话管理器**：

```typescript
class SessionManager {
  private sessions = new Map<string, Session>();
  private storageDir: string;

  constructor(storageDir = './.sessions') {
    this.storageDir = storageDir;
  }

  // 创建新会话
  async create(): Promise<Session> {
    const session: Session = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      metadata: {
        tags: [],
        totalTokens: 0,
        totalCostUsd: 0,
        numTurns: 0
      }
    };

    await this.save(session);
    this.sessions.set(session.id, session);
    return session;
  }

  // 保存会话
  async save(session: Session): Promise<void> {
    const filePath = path.join(this.storageDir, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  }

  // 加载会话
  async load(sessionId: string): Promise<Session> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const filePath = path.join(this.storageDir, `${sessionId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    const session = JSON.parse(data);
    this.sessions.set(sessionId, session);
    return session;
  }

  // 追加消息
  async append(sessionId: string, message: Message): Promise<void> {
    const session = await this.load(sessionId);
    session.messages.push(message);
    session.updatedAt = new Date();
    await this.save(session);
  }

  // 列出所有会话
  async list(): Promise<Session[]> {
    const files = await fs.readdir(this.storageDir);
    const sessions = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(f => this.load(f.replace('.json', '')))
    );
    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
}
```

**会话分支**（从历史点创建新分支）：

```typescript
async branch(sessionId: string, fromIndex: number): Promise<Session> {
  const original = await this.load(sessionId);

  const branched: Session = {
    id: crypto.randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: original.messages.slice(0, fromIndex),  // 只保留前 N 条
    metadata: {
      tags: [...original.metadata.tags, 'branched'],
      totalTokens: 0,
      totalCostUsd: 0,
      numTurns: 0
    }
  };

  await this.save(branched);
  return branched;
}
```

**成本追踪**：

```typescript
// 在每次 LLM 调用后更新
function updateCost(session: Session, usage: Usage): void {
  const inputCost = usage.input_tokens * 0.000003;   // $3/M tokens
  const outputCost = usage.output_tokens * 0.000015; // $15/M tokens

  session.metadata.totalTokens += usage.input_tokens + usage.output_tokens;
  session.metadata.totalCostUsd += inputCost + outputCost;
  session.metadata.numTurns += 1;
}
```

### 7.3 与 Agent 循环集成

```typescript
async function runAgentWithSession(
  sessionId: string,
  userPrompt: string
): Promise<string> {
  const sessionMgr = new SessionManager();
  const session = await sessionMgr.load(sessionId);

  // 添加用户消息
  session.messages.push({ role: 'user', content: userPrompt });

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: tools,
      messages: session.messages
    });

    // 更新成本
    updateCost(session, response.usage);

    // 添加助手消息
    session.messages.push({ role: 'assistant', content: response.content });

    // 保存会话
    await sessionMgr.save(session);

    if (response.stop_reason === 'tool_use') {
      // 执行工具...
      continue;
    }

    return extractText(response);
  }
}
```

### 7.4 关键概念

| 概念 | 说明 |
|------|------|
| Session | 一次完整的对话会话 |
| 持久化 | 保存到文件系统/数据库 |
| 分支 | 从历史点创建新会话 |
| 成本追踪 | 记录 token 使用和费用 |

### 7.5 这一层解决了什么？

✅ 对话可以保存和恢复
✅ 可以管理多个会话
✅ 可以追踪成本
❌ 网络错误、API 限流怎么办？

### 7.6 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐⭐ | 完整实现 |
| 功能丰富度 | ⭐⭐⭐⭐⭐ | 分支、标签、成本追踪、迁移 |
| 代码质量 | ⭐⭐⭐⭐⭐ | 清晰的分层设计 |

**实现位置**: `packages/agent/src/session/`

**模块结构**:
- `message.ts` - 消息协议（多模态支持）
- `session.ts` - 会话数据结构
- `storage.ts` - 存储后端
- `manager.ts` - 会话管理器
- `migrate.ts` - 数据迁移

**特色**:
- 会话分支（branch）
- 标签管理（tags）
- 成本追踪（cost tracking）
- 数据迁移工具

---

## 8. Level 6: 错误处理与重试

### 8.1 要解决的问题

**问题**：网络不稳定、API 限流、工具执行失败怎么办？

**具体挑战**：
- 网络超时
- API 429 限流
- 工具执行异常
- 哪些错误可以重试？哪些不行？

### 8.2 解决方案

**错误分类**：

```typescript
enum ErrorCode {
  // 可重试的错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',

  // 部分可重试
  API_ERROR = 'API_ERROR',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',

  // 不可重试
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

class AgentError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public recoverable: boolean,
    public context?: any
  ) {
    super(message);
  }
}
```

**重试策略（指数退避）**：

```typescript
interface RetryPolicy {
  maxAttempts: number;      // 最大重试次数
  initialDelay: number;     // 初始延迟 (ms)
  maxDelay: number;         // 最大延迟 (ms)
  backoffMultiplier: number; // 退避倍数
  retryableErrors: ErrorCode[];
}

const defaultPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.TIMEOUT,
    ErrorCode.RATE_LIMIT
  ]
};
```

**重试执行器**：

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = defaultPolicy
): Promise<T> {
  let lastError: Error;
  let delay = policy.initialDelay;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 检查是否可重试
      if (error instanceof AgentError) {
        if (!policy.retryableErrors.includes(error.code)) {
          throw error;  // 不可重试，直接抛出
        }
      }

      // 最后一次尝试失败
      if (attempt === policy.maxAttempts) {
        throw error;
      }

      // 等待后重试
      console.log(`重试 ${attempt}/${policy.maxAttempts}，等待 ${delay}ms...`);
      await sleep(delay);

      // 指数退避
      delay = Math.min(delay * policy.backoffMultiplier, policy.maxDelay);
    }
  }

  throw lastError!;
}
```

**错误转换**：

```typescript
function wrapApiError(error: any): AgentError {
  // Anthropic API 错误
  if (error.status === 429) {
    return new AgentError(
      'API 限流，请稍后重试',
      ErrorCode.RATE_LIMIT,
      true,
      { retryAfter: error.headers?.['retry-after'] }
    );
  }

  if (error.status === 401) {
    return new AgentError(
      'API 认证失败',
      ErrorCode.AUTHENTICATION_ERROR,
      false
    );
  }

  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return new AgentError(
      '网络连接失败',
      ErrorCode.NETWORK_ERROR,
      true
    );
  }

  return new AgentError(
    error.message || '未知错误',
    ErrorCode.INTERNAL_ERROR,
    false
  );
}
```

**在 Agent 循环中使用**：

```typescript
async function runAgent(userPrompt: string): Promise<string> {
  const messages: Message[] = [{ role: 'user', content: userPrompt }];

  while (true) {
    // 带重试的 LLM 调用
    const response = await withRetry(async () => {
      try {
        return await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          tools: tools,
          messages: messages
        });
      } catch (error) {
        throw wrapApiError(error);
      }
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      // 带重试的工具执行
      const toolResults = await withRetry(async () => {
        return await executeTools(response.content);
      }, {
        ...defaultPolicy,
        retryableErrors: [ErrorCode.TOOL_EXECUTION_ERROR]
      });

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    return extractText(response);
  }
}
```

### 8.3 关键概念

| 概念 | 说明 |
|------|------|
| 错误分类 | 区分可重试和不可重试错误 |
| 指数退避 | 每次重试等待时间翻倍 |
| 最大重试 | 防止无限重试 |
| 错误上下文 | 保留错误详情便于调试 |

### 8.4 这一层解决了什么？

✅ 临时错误自动恢复
✅ 不会因为网络抖动中断任务
✅ 清晰的错误信息
❌ 危险操作如何防护？

### 8.5 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐⭐ | 完整实现 |
| 策略丰富度 | ⭐⭐⭐⭐⭐ | Retry/Fallback/Timeout 组合 |
| 代码质量 | ⭐⭐⭐⭐⭐ | Builder 模式，链式调用 |

**实现位置**: `packages/agent/src/error/`, `packages/agent/src/subtask/error-handler.ts`

**特色**:
- 错误分类（ErrorCode 枚举）
- 指数退避重试（withRetry）
- Fallback 降级（withFallback）
- 超时控制（withTimeout）
- ErrorHandlerBuilder 链式组合

**使用示例**:
```typescript
import { errorHandler } from './subtask';

const result = await errorHandler()
  .retry({ maxAttempts: 3, backoffMultiplier: 2 })
  .timeout({ ms: 30000 })
  .fallback({ fallbackFn: () => defaultResult })
  .run(async () => {
    return await riskyOperation();
  });
```

---

## 9. Level 7: 权限与安全

### 9.1 要解决的问题

**问题**：LLM 可能执行危险操作（如 `rm -rf /`），如何防护？

**具体挑战**：
- LLM 可能被提示注入攻击
- 某些命令有破坏性
- 用户需要控制哪些操作自动执行

### 9.2 解决方案：多层防护（Swiss Cheese Defense）

```
┌─────────────────────────────────────────────────────────────┐
│                 多层安全防护                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: 模型对齐                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Claude 训练时的安全意识，拒绝明显危险请求           │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  Layer 2: 权限回调                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  canUseTool() 回调，用户确认高风险操作              │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  Layer 3: 命令解析                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  检测危险命令模式，阻止注入攻击                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  Layer 4: 沙箱隔离                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  容器/chroot 隔离，限制文件系统访问                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**权限模式**：

```typescript
type PermissionMode =
  | 'default'           // 每次询问用户
  | 'acceptEdits'       // 自动接受文件编辑
  | 'plan'              // 仅规划，不执行
  | 'bypassPermissions' // 完全信任（危险）
```

**权限回调**：

```typescript
type PermissionResult = 'allow' | 'deny' | 'ask';

interface PermissionCallback {
  (tool: string, input: any, context: ToolContext): Promise<PermissionResult>;
}

// 默认权限策略
async function defaultPermissionCallback(
  tool: string,
  input: any,
  context: ToolContext
): Promise<PermissionResult> {
  // 读取操作：自动允许
  if (['Read', 'Grep', 'Glob'].includes(tool)) {
    return 'allow';
  }

  // 写入操作：需要确认
  if (['Write', 'Edit'].includes(tool)) {
    return 'ask';
  }

  // Bash 命令：检查危险性
  if (tool === 'Bash') {
    const risk = classifyCommandRisk(input.command);
    if (risk === 'high') return 'deny';
    if (risk === 'medium') return 'ask';
    return 'allow';
  }

  return 'ask';
}
```

**命令风险分类**：

```typescript
type RiskLevel = 'low' | 'medium' | 'high';

function classifyCommandRisk(command: string): RiskLevel {
  // 高风险：直接拒绝
  const highRiskPatterns = [
    /rm\s+(-rf?|--recursive).*\//,  // rm -rf /
    /mkfs/,                          // 格式化
    /dd\s+.*of=\/dev/,              // 写入设备
    />\s*\/dev\/sd/,                // 重定向到设备
    /chmod\s+777\s+\//,             // 危险权限
    /curl.*\|\s*(ba)?sh/,           // 管道执行
  ];

  for (const pattern of highRiskPatterns) {
    if (pattern.test(command)) return 'high';
  }

  // 中风险：需要确认
  const mediumRiskPatterns = [
    /rm\s/,                          // 删除文件
    /mv\s/,                          // 移动文件
    /sudo\s/,                        // 提权
    /npm\s+(install|i)\s+-g/,       // 全局安装
    /pip\s+install/,                // Python 安装
  ];

  for (const pattern of mediumRiskPatterns) {
    if (pattern.test(command)) return 'medium';
  }

  return 'low';
}
```

**用户确认 UI**：

```typescript
async function askUserPermission(
  tool: string,
  input: any
): Promise<boolean> {
  console.log('\n⚠️  需要确认操作:');
  console.log(`工具: ${tool}`);
  console.log(`参数: ${JSON.stringify(input, null, 2)}`);

  const answer = await readline.question('允许执行? (y/n): ');
  return answer.toLowerCase() === 'y';
}
```

**在 Agent 循环中集成**：

```typescript
async function executeToolWithPermission(
  tool: string,
  input: any,
  permissionCallback: PermissionCallback
): Promise<ToolResult> {
  // 1. 检查权限
  const permission = await permissionCallback(tool, input, context);

  if (permission === 'deny') {
    return {
      type: 'tool_result',
      content: '操作被拒绝：权限不足',
      isError: true
    };
  }

  if (permission === 'ask') {
    const allowed = await askUserPermission(tool, input);
    if (!allowed) {
      return {
        type: 'tool_result',
        content: '操作被用户取消',
        isError: true
      };
    }
  }

  // 2. 执行工具
  return await executeTool(tool, input);
}
```

### 9.3 关键概念

| 概念 | 说明 |
|------|------|
| Swiss Cheese | 多层防护，每层都可能有漏洞，但组合起来安全 |
| 权限回调 | 在执行前检查权限 |
| 风险分类 | 根据操作危险程度分级 |
| 沙箱 | 隔离执行环境 |

### 9.4 这一层解决了什么？

✅ 防止危险操作
✅ 用户可控制信任级别
✅ 多层防护，纵深防御
❌ 如何扩展更多工具？

### 9.5 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐ | 核心功能完整 |
| 安全性 | ⭐⭐⭐⭐ | 权限回调、命令风险分类 |
| 可配置性 | ⭐⭐⭐⭐ | 支持自定义权限策略 |

**实现位置**: `packages/agent/src/permission/`, `packages/agent/src/security/`

**特色**:
- 权限回调机制（PermissionCallback）
- 命令风险分类（classifyCommandRisk）
- 用户确认 UI
- 可配置的权限模式

**待完善**:
- 沙箱隔离（容器级别）
- 更细粒度的权限规则

---

## 10. Level 8: MCP 协议集成

### 10.1 要解决的问题

**问题**：内置工具有限，如何接入外部工具（GitHub、Jira、数据库等）？

**具体挑战**：
- 每个外部服务都要单独集成？
- 工具接口不统一
- 如何动态发现新工具？

### 10.2 解决方案：MCP 协议

**MCP (Model Context Protocol)** 是 Anthropic 定义的标准协议，让 Agent 可以动态发现和调用外部工具。

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP 架构                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐                                           │
│  │   Agent     │                                           │
│  │  (Client)   │                                           │
│  └──────┬──────┘                                           │
│         │ MCP 协议                                          │
│         │                                                   │
│    ┌────┴────┬────────────┬────────────┐                   │
│    ▼         ▼            ▼            ▼                   │
│ ┌──────┐ ┌──────┐    ┌──────┐    ┌──────┐                 │
│ │GitHub│ │ Jira │    │ DB   │    │ ...  │                 │
│ │Server│ │Server│    │Server│    │Server│                 │
│ └──────┘ └──────┘    └──────┘    └──────┘                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**MCP 工具定义**：

```typescript
// MCP 服务器返回的工具定义
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JSONSchema>;
    required?: string[];
  };
}

// 示例：GitHub MCP 服务器提供的工具
const githubTools: MCPTool[] = [
  {
    name: 'github_create_issue',
    description: '创建 GitHub Issue',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '仓库名 (owner/repo)' },
        title: { type: 'string', description: 'Issue 标题' },
        body: { type: 'string', description: 'Issue 内容' }
      },
      required: ['repo', 'title']
    }
  },
  {
    name: 'github_list_prs',
    description: '列出 Pull Requests',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'] }
      },
      required: ['repo']
    }
  }
];
```

**MCP 客户端实现**：

```typescript
class MCPClient {
  private transport: Transport;

  // 连接 MCP 服务器
  async connect(config: MCPServerConfig): Promise<void> {
    if (config.type === 'stdio') {
      // 启动子进程，通过 stdin/stdout 通信
      this.transport = new StdioTransport(config.command, config.args);
    } else if (config.type === 'sse') {
      // HTTP SSE 连接
      this.transport = new SSETransport(config.url);
    }

    // 初始化握手
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: { listChanged: true } }
    });
  }

  // 发现工具
  async listTools(): Promise<MCPTool[]> {
    const response = await this.request('tools/list', {});
    return response.tools;
  }

  // 调用工具
  async callTool(name: string, args: any): Promise<any> {
    const response = await this.request('tools/call', {
      name: name,
      arguments: args
    });
    return response.content;
  }

  // 监听工具变化
  onToolsChanged(callback: () => void): void {
    this.transport.on('notification', (msg) => {
      if (msg.method === 'notifications/tools/list_changed') {
        callback();
      }
    });
  }
}
```

**工具注册表集成**：

```typescript
class ToolRegistry {
  private tools = new Map<string, Tool>();
  private mcpClients = new Map<string, MCPClient>();

  // 注册内置工具
  registerBuiltin(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  // 发现 MCP 工具
  async discoverMCPTools(config: MCPServerConfig): Promise<void> {
    const client = new MCPClient();
    await client.connect(config);

    // 获取工具列表
    const mcpTools = await client.listTools();

    // 包装为统一的 Tool 接口
    for (const mcpTool of mcpTools) {
      const wrappedTool: Tool = {
        name: mcpTool.name,
        description: mcpTool.description,
        inputSchema: mcpTool.inputSchema,
        execute: async (input) => {
          return await client.callTool(mcpTool.name, input);
        }
      };
      this.tools.set(mcpTool.name, wrappedTool);
    }

    // 监听工具变化
    client.onToolsChanged(async () => {
      await this.discoverMCPTools(config);  // 重新发现
    });

    this.mcpClients.set(config.name, client);
  }

  // 获取所有工具（给 LLM 用）
  getAllToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }));
  }
}
```

**MCP 服务器配置**：

```json
// .claude/mcp.json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "custom": {
      "type": "sse",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### 10.3 关键概念

| 概念 | 说明 |
|------|------|
| MCP | Model Context Protocol，工具标准协议 |
| stdio 传输 | 通过子进程 stdin/stdout 通信 |
| SSE 传输 | 通过 HTTP Server-Sent Events 通信 |
| 动态发现 | 运行时获取可用工具列表 |
| 热更新 | 工具变化时自动更新 |

### 10.4 这一层解决了什么？

✅ 统一的工具接口
✅ 动态发现外部工具
✅ 丰富的 MCP 生态
❌ 不同任务需要不同的执行策略

### 10.5 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐⭐ | 完整实现 |
| 架构设计 | ⭐⭐⭐⭐⭐ | Client/Pool/Retry/Adapter 分层 |
| 健壮性 | ⭐⭐⭐⭐⭐ | 连接池、重试、健康检查 |

**实现位置**: `packages/agent/src/mcp/`

**模块结构**:
- `types.ts` - MCP 协议类型定义
- `transport.ts` - 传输层（Stdio/SSE）
- `client.ts` - MCP 客户端
- `pool.ts` - 连接池管理
- `retry.ts` - 重试策略
- `adapter.ts` - 工具适配器
- `tools.ts` - 工具加载/卸载
- `manager.ts` - 统一管理器

**特色**:
- 完整的 MCP 协议实现
- 连接池（McpClientPool）
- 自动重连和重试
- 工具热加载/卸载
- 健康检查机制

**使用示例**:
```typescript
import { McpManager, loadMcpConfig } from './mcp';

const config = await loadMcpConfig('.claude/mcp.json');
const manager = new McpManager(config);
await manager.initialize();

// 工具自动注册到 ToolRegistry
const tools = manager.getAllTools();
```

---

## 11. Level 9: 多执行模式

### 11.1 要解决的问题

**问题**：所有任务都用同一个 Agent 循环？简单问答也要循环？

**具体挑战**：
- 简单问答不需要工具
- 子任务需要继承父上下文
- 复杂流程需要编排

### 11.2 解决方案：四种执行模式

```
┌─────────────────────────────────────────────────────────────┐
│                    四种执行模式                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ask_llm        run_agent       fork_agent     run_workflow │
│  ┌─────┐        ┌─────┐         ┌─────┐        ┌─────┐     │
│  │ Q&A │        │Loop │         │Child│        │Flow │     │
│  │     │        │     │         │     │        │     │     │
│  │ 1次 │        │ N次 │         │继承 │        │编排 │     │
│  └─────┘        └─────┘         └─────┘        └─────┘     │
│                                                             │
│  简单问答        独立任务        子任务         复杂流程     │
│  无工具          有工具          继承上下文     条件分支     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**模式对比**：

| 模式 | 工具调用 | 上下文 | 多轮 | 适用场景 |
|------|----------|--------|------|----------|
| `ask_llm` | ❌ | 无状态 | ❌ | 翻译、解释、生成文本 |
| `run_agent` | ✅ | 全新 | ✅ | 独立任务、修复 Bug |
| `fork_agent` | ✅ | 继承父 | ✅ | 子任务、并行探索 |
| `run_workflow` | ✅ | 编排 | ✅ | CI/CD、审批流程 |

### 11.3 实现代码

**ask_llm：简单问答**

```typescript
async function askLLM(prompt: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
    // 注意：没有 tools 参数
  });

  return response.content[0].text;
}

// 使用
const answer = await askLLM('什么是 TypeScript?');
```

**run_agent：独立任务**

```typescript
async function runAgent(
  task: string,
  options?: { maxTurns?: number; tools?: Tool[] }
): Promise<AgentResult> {
  const messages: Message[] = [{ role: 'user', content: task }];
  const maxTurns = options?.maxTurns || 10;
  let turns = 0;

  while (turns < maxTurns) {
    turns++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: options?.tools || defaultTools,
      messages: messages
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      const results = await executeTools(response.content);
      messages.push({ role: 'user', content: results });
      continue;
    }

    return {
      success: true,
      result: extractText(response),
      turns: turns
    };
  }

  return { success: false, error: '超过最大轮次' };
}

// 使用
const result = await runAgent('修复 src/utils.ts 中的 bug');
```

**fork_agent：继承上下文的子任务**

```typescript
async function forkAgent(
  parentMessages: Message[],  // 继承父上下文
  subtask: string,
  options?: { maxTurns?: number }
): Promise<AgentResult> {
  // 复制父消息历史
  const messages: Message[] = [
    ...parentMessages,
    { role: 'user', content: `[子任务] ${subtask}` }
  ];

  const maxTurns = options?.maxTurns || 5;
  let turns = 0;

  while (turns < maxTurns) {
    turns++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: defaultTools,
      messages: messages
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      const results = await executeTools(response.content);
      messages.push({ role: 'user', content: results });
      continue;
    }

    return {
      success: true,
      result: extractText(response),
      turns: turns
    };
  }

  return { success: false, error: '超过最大轮次' };
}

// 使用：在主 Agent 中 fork 子任务
async function mainAgent(task: string) {
  const messages: Message[] = [{ role: 'user', content: task }];

  // ... 主任务处理 ...

  // Fork 子任务（继承当前上下文）
  const securityCheck = await forkAgent(
    messages,
    '检查这段代码的安全问题'
  );

  const performanceCheck = await forkAgent(
    messages,
    '分析性能瓶颈'
  );

  // 合并结果
  return mergeResults(securityCheck, performanceCheck);
}
```

**run_workflow：工作流编排**

```typescript
interface WorkflowStep {
  name: string;
  type: 'agent' | 'tool' | 'condition';
  config: any;
  next?: string | ((result: any) => string);
}

async function runWorkflow(
  steps: WorkflowStep[],
  initialContext: any
): Promise<any> {
  let currentStep = steps[0];
  let context = initialContext;

  while (currentStep) {
    console.log(`执行步骤: ${currentStep.name}`);

    // 执行当前步骤
    let result: any;
    switch (currentStep.type) {
      case 'agent':
        result = await runAgent(currentStep.config.task);
        break;
      case 'tool':
        result = await executeTool(currentStep.config.tool, currentStep.config.input);
        break;
      case 'condition':
        result = currentStep.config.evaluate(context);
        break;
    }

    // 更新上下文
    context = { ...context, [currentStep.name]: result };

    // 决定下一步
    if (typeof currentStep.next === 'function') {
      const nextName = currentStep.next(result);
      currentStep = steps.find(s => s.name === nextName)!;
    } else if (currentStep.next) {
      currentStep = steps.find(s => s.name === currentStep.next)!;
    } else {
      break;  // 工作流结束
    }
  }

  return context;
}

// 使用：代码审查工作流
const codeReviewWorkflow: WorkflowStep[] = [
  {
    name: 'analyze',
    type: 'agent',
    config: { task: '分析代码结构' },
    next: 'check_complexity'
  },
  {
    name: 'check_complexity',
    type: 'tool',
    config: { tool: 'complexity', input: {} },
    next: (result) => result.score > 10 ? 'refactor' : 'security_check'
  },
  {
    name: 'refactor',
    type: 'agent',
    config: { task: '重构复杂代码' },
    next: 'security_check'
  },
  {
    name: 'security_check',
    type: 'agent',
    config: { task: '安全审计' },
    next: 'report'
  },
  {
    name: 'report',
    type: 'agent',
    config: { task: '生成审查报告' }
    // 无 next，工作流结束
  }
];

const result = await runWorkflow(codeReviewWorkflow, { file: 'src/main.ts' });
```

### 11.4 执行模式选择流程

```
需要执行任务
    │
    ├─ 不需要工具? ──────────────────► ask_llm
    │
    └─ 需要工具
           │
           ├─ 需要父上下文? ─────────► fork_agent
           │
           └─ 不需要父上下文
                  │
                  ├─ 流程预定义? ────► run_workflow
                  │
                  └─ 流程动态 ────────► run_agent
```

### 11.5 这一层解决了什么？

✅ 不同任务用不同策略
✅ 子任务可以继承上下文
✅ 复杂流程可以编排
❌ 如何增强 Agent 的专业能力？

### 11.6 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 完成度 | ⭐⭐⭐⭐⭐ | 4 种模式全部实现 |
| 架构设计 | ⭐⭐⭐⭐⭐ | 统一接口 + Chain API |
| 扩展性 | ⭐⭐⭐⭐⭐ | 支持自定义 Workflow |

**实现位置**: `packages/agent/src/subtask/`

**四种执行模式**:
- `runAskLlm()` - 简单问答
- `runRunAgent()` - 独立任务
- `runForkAgent()` - 继承上下文子任务
- `runRunWorkflow()` - 工作流编排

**特色功能**:
- **Chain API** - 链式任务组合
- **TaskExecutor** - 任务队列执行器
- **ContextManager** - 上下文管理
- **ErrorHandler** - 错误处理组合

**Chain API 示例**:
```typescript
import { chain } from './subtask';

const result = await chain()
  .ask('分析这段代码的问题')
  .agent('修复发现的问题', { maxTurns: 5 })
  .fork('检查安全性')
  .run();
```

**Workflow 示例**:
```typescript
import { registerWorkflow, runRunWorkflow } from './subtask';

registerWorkflow({
  name: 'code-review',
  steps: [
    { name: 'analyze', type: 'agent', config: { task: '分析代码' } },
    { name: 'security', type: 'agent', config: { task: '安全检查' } },
    { name: 'report', type: 'agent', config: { task: '生成报告' } }
  ]
});

await runRunWorkflow({ workflow: 'code-review' }, runtime);
```

---

## 12. Level 10: 高级能力

### 12.1 要解决的问题

**问题**：如何让 Agent 具备专业知识？如何自动化重复操作？

**具体挑战**：
- 不同项目有不同规范
- 某些任务需要专业知识
- 重复操作如何自动化

### 12.2 解决方案

**四大高级能力**：

```
┌─────────────────────────────────────────────────────────────┐
│                    高级能力                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │   技能系统   │  │  子代理系统  │                          │
│  │   Skills    │  │  Subagents  │                          │
│  │             │  │             │                          │
│  │ 专业知识模块 │  │ 专用 AI 助手 │                          │
│  └─────────────┘  └─────────────┘                          │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │  生命周期钩子 │  │  任务规划   │                          │
│  │   Hooks     │  │  Planning   │                          │
│  │             │  │             │                          │
│  │ 自动化触发   │  │ TODO 系统   │                          │
│  └─────────────┘  └─────────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 12.3 技能系统（Skills）

**问题**：如何让 Agent 了解项目特定的规范和知识？

**解决方案**：技能文件，按需加载专业知识。

```markdown
<!-- .claude/skills/vue-component.md -->
---
name: vue-component-generator
description: 生成 Vue 3 组件时自动激活
globs: ["**/*.vue", "**/components/**"]
---

# Vue 组件生成规范

生成 Vue 3 组件时必须遵循：

1. 使用 Composition API (`<script setup>`)
2. TypeScript 类型定义
3. Props 使用 defineProps 并定义类型
4. Emits 使用 defineEmits 并定义类型
5. 组件名使用 PascalCase
6. 样式使用 scoped
```

**技能加载器**：

```typescript
interface Skill {
  name: string;
  description: string;
  globs?: string[];        // 文件匹配模式
  allowedTools?: string[]; // 限制可用工具
  instructions: string;    // 详细指令
}

class SkillLoader {
  // 加载所有技能
  async loadSkills(): Promise<Skill[]> {
    const skills: Skill[] = [];

    // 1. 全局技能 ~/.claude/skills/
    skills.push(...await this.loadFromDir(
      path.join(os.homedir(), '.claude', 'skills')
    ));

    // 2. 项目技能 ./.claude/skills/
    skills.push(...await this.loadFromDir('./.claude/skills'));

    return skills;
  }

  // 根据上下文匹配技能
  matchSkills(context: { files?: string[]; task?: string }): Skill[] {
    const allSkills = this.loadSkills();

    return allSkills.filter(skill => {
      // 按文件匹配
      if (skill.globs && context.files) {
        for (const file of context.files) {
          if (skill.globs.some(g => minimatch(file, g))) {
            return true;
          }
        }
      }

      // 按任务描述匹配
      if (skill.description && context.task) {
        if (context.task.toLowerCase().includes(skill.name.toLowerCase())) {
          return true;
        }
      }

      return false;
    });
  }
}

// 在 Agent 中使用
async function runAgentWithSkills(task: string, files: string[]) {
  const skillLoader = new SkillLoader();
  const matchedSkills = skillLoader.matchSkills({ task, files });

  // 将技能注入系统提示
  const systemPrompt = `
你是一个编程助手。

${matchedSkills.map(s => `## ${s.name}\n${s.instructions}`).join('\n\n')}
`;

  // 运行 Agent...
}
```

---

### 12.4 子代理系统（Subagents）

**问题**：某些任务需要专业知识，主 Agent 不够专业？

**解决方案**：专用子代理，有独立的系统提示和工具集。

```typescript
interface Subagent {
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
  model?: string;  // 可以用不同模型
}

// 内置子代理
const subagents: Subagent[] = [
  {
    name: 'security-auditor',
    description: '代码安全审计专家',
    systemPrompt: `你是安全审计专家，专注于：
- XSS, SQL 注入, CSRF 检测
- 依赖漏洞扫描
- 认证授权检查
- 数据验证审查

按 OWASP Top 10 标准评估，提供严重等级。`,
    allowedTools: ['Read', 'Grep'],
    model: 'claude-sonnet-4-20250514'
  },
  {
    name: 'code-reviewer',
    description: '代码审查专家',
    systemPrompt: `你是代码审查专家，关注：
- 代码质量和可读性
- 设计模式和架构
- 性能优化建议
- 测试覆盖率`,
    allowedTools: ['Read', 'Grep', 'Bash'],
    model: 'claude-sonnet-4-20250514'
  }
];

// 子代理调度工具
const dispatchAgentTool: Tool = {
  name: 'dispatch_agent',
  description: '委派任务给专用子代理',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', enum: subagents.map(s => s.name) },
      task: { type: 'string' }
    },
    required: ['agent', 'task']
  },
  execute: async ({ agent, task }, context) => {
    // 检查深度限制（防止无限嵌套）
    if (context.depth >= 2) {
      return { error: '子代理不能再创建子代理' };
    }

    const subagent = subagents.find(s => s.name === agent);
    if (!subagent) {
      return { error: `未知子代理: ${agent}` };
    }

    // 运行子代理
    const result = await runAgent(task, {
      systemPrompt: subagent.systemPrompt,
      tools: subagent.allowedTools,
      model: subagent.model,
      context: { ...context, depth: context.depth + 1 }
    });

    return result;
  }
};
```

---

### 12.5 生命周期钩子（Hooks）

**问题**：如何在特定事件时自动执行操作？

**解决方案**：钩子系统，在生命周期事件时触发。

```typescript
type HookEvent =
  | 'PreToolUse'        // 工具使用前
  | 'PostToolUse'       // 工具使用后
  | 'UserPromptSubmit'  // 用户提交提示
  | 'SessionStart'      // 会话开始
  | 'SessionEnd';       // 会话结束

interface Hook {
  event: HookEvent;
  matcher?: string;     // 正则匹配（如工具名）
  type: 'command' | 'prompt';
  command?: string;     // 执行命令
  prompt?: string;      // 发送给 Agent
}

// 钩子配置
const hooks: Hook[] = [
  {
    event: 'PostToolUse',
    matcher: 'Edit|Write',  // 匹配 Edit 或 Write 工具
    type: 'command',
    command: 'pnpm lint:fix'  // 自动格式化
  },
  {
    event: 'SessionStart',
    type: 'prompt',
    prompt: '记住：始终编写测试，遵循 TDD'
  }
];

// 钩子系统
class HookSystem {
  async trigger(event: HookEvent, context: HookContext): Promise<void> {
    for (const hook of hooks) {
      if (hook.event !== event) continue;

      // 检查匹配器
      if (hook.matcher && context.toolName) {
        if (!new RegExp(hook.matcher).test(context.toolName)) {
          continue;
        }
      }

      // 执行钩子
      if (hook.type === 'command') {
        await exec(hook.command!);
      } else if (hook.type === 'prompt') {
        context.injectPrompt(hook.prompt!);
      }
    }
  }
}

// 在 Agent 循环中使用
async function runAgentWithHooks(task: string) {
  const hookSystem = new HookSystem();

  // 会话开始钩子
  await hookSystem.trigger('SessionStart', context);

  while (true) {
    // ... LLM 调用 ...

    if (response.stop_reason === 'tool_use') {
      for (const toolUse of toolUses) {
        // 工具使用前钩子
        await hookSystem.trigger('PreToolUse', {
          toolName: toolUse.name,
          input: toolUse.input
        });

        const result = await executeTool(toolUse.name, toolUse.input);

        // 工具使用后钩子
        await hookSystem.trigger('PostToolUse', {
          toolName: toolUse.name,
          result: result
        });
      }
    }
  }
}
```

---

### 12.6 任务规划（Planning）

**问题**：复杂任务如何让用户看到计划？

**解决方案**：TODO 工具，显式的任务列表。

```typescript
interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

let currentTodos: TodoItem[] = [];

const todoWriteTool: Tool = {
  name: 'TodoWrite',
  description: '创建或更新任务列表，用于规划复杂任务',
  inputSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] }
          }
        }
      }
    }
  },
  execute: async ({ items }) => {
    currentTodos = items;

    // 渲染 UI
    console.log('\n📋 任务列表:');
    for (const item of items) {
      const icon = item.status === 'completed' ? '✅' :
                   item.status === 'in_progress' ? '🔄' : '⬜';
      console.log(`${icon} [${item.priority}] ${item.content}`);
    }

    return { success: true };
  }
};

// LLM 使用示例
// 用户: "重构登录模块"
// LLM 调用 TodoWrite:
// {
//   items: [
//     { id: '1', content: '分析现有代码', status: 'pending', priority: 'high' },
//     { id: '2', content: '设计新架构', status: 'pending', priority: 'high' },
//     { id: '3', content: '实现重构', status: 'pending', priority: 'medium' },
//     { id: '4', content: '编写测试', status: 'pending', priority: 'medium' },
//     { id: '5', content: '更新文档', status: 'pending', priority: 'low' }
//   ]
// }
```

### 12.7 这一层解决了什么？

✅ Agent 可以具备专业知识（技能）
✅ 可以委派给专用子代理
✅ 自动化重复操作（钩子）
✅ 复杂任务可视化（任务规划）

### 12.8 NaughtyAgent 实现评级

| 维度 | 评分 | 说明 |
|------|------|------|
| 技能系统 | ⭐⭐⭐⭐ | 内置技能 + 注册机制 |
| 子代理 | ⭐⭐⭐ | TaskTool 实现，可增强 |
| 钩子系统 | ⭐⭐⭐ | 基础实现，可增强 |
| 任务规划 | ⭐⭐⭐⭐ | TODO 交互实现 |

**实现位置**:
- 技能: `packages/agent/src/skill/`
- 子代理: `packages/agent/src/subtask/task-tool.ts`
- 交互: `packages/agent/src/interaction/`

**技能系统**:
```typescript
// 内置技能
- /commit  - 生成 commit 消息并提交
- /pr      - 生成 PR 描述
- /review  - 代码审查
- /test    - 运行测试并分析
```

**特色**:
- 技能注册表（registerSkill/getSkill）
- 技能执行器（executeSkill）
- 命令解析（parseSkillCommand）
- TODO 交互（interaction/todo.ts）
- 问答交互（interaction/question.ts）

**待完善**:
- 钩子系统可增加更多事件类型
- 子代理可增加更多内置专家代理
- 技能可支持从文件动态加载

---

## 13. 完整架构图

### 13.1 技术栈全景

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Claude Agent SDK 完整架构                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 10: 高级能力                            │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │  技能   │  │ 子代理  │  │  钩子   │  │任务规划 │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 9: 多执行模式                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │ ask_llm │  │run_agent│  │fork_agent│ │workflow │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 8: MCP 协议                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                       │   │
│  │  │   MCP Client    │  │  Tool Registry  │                       │   │
│  │  │ (stdio/SSE)     │  │  (动态发现)     │                       │   │
│  │  └─────────────────┘  └─────────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 7: 权限与安全                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │模型对齐 │  │权限回调 │  │命令解析 │  │沙箱隔离 │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 6: 错误处理                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                       │   │
│  │  │   错误分类      │  │   指数退避重试   │                       │   │
│  │  └─────────────────┘  └─────────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 5: 会话持久化                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │保存/恢复│  │会话分支 │  │成本追踪 │  │标签管理 │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 4: 流式响应                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                       │   │
│  │  │   text_delta    │  │ input_json_delta │                       │   │
│  │  └─────────────────┘  └─────────────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 3: 上下文管理                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                          │   │
│  │  │Token计数│  │上下文压缩│  │项目记忆 │                          │   │
│  │  └─────────┘  └─────────┘  └─────────┘                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 2: Agent 循环                           │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  while (stop_reason === 'tool_use') { ... }             │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 1: 工具调用                             │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │  Read   │  │  Write  │  │  Edit   │  │  Bash   │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Level 0: LLM 基础                             │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │  Claude API (messages.create / messages.stream)         │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 13.2 数据流

```
用户输入
    │
    ▼
┌─────────────────┐
│  Session 加载   │ ◄── Level 5
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  技能匹配       │ ◄── Level 10
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  执行模式选择   │ ◄── Level 9
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│              Agent 主循环                    │ ◄── Level 2
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │  ┌─────────┐     ┌─────────────┐   │   │
│  │  │ 调用LLM │────►│ 流式响应    │   │   │ ◄── Level 0, 4
│  │  └────┬────┘     └─────────────┘   │   │
│  │       │                             │   │
│  │       ▼                             │   │
│  │  ┌─────────┐                        │   │
│  │  │tool_use?│                        │   │
│  │  └────┬────┘                        │   │
│  │       │ 是                          │   │
│  │       ▼                             │   │
│  │  ┌─────────┐     ┌─────────────┐   │   │
│  │  │权限检查 │────►│ 执行工具    │   │   │ ◄── Level 1, 7, 8
│  │  └─────────┘     └──────┬──────┘   │   │
│  │                         │           │   │
│  │       ┌─────────────────┘           │   │
│  │       │                             │   │
│  │       ▼                             │   │
│  │  ┌─────────┐                        │   │
│  │  │钩子触发 │                        │   │ ◄── Level 10
│  │  └────┬────┘                        │   │
│  │       │                             │   │
│  │       └──────────► 继续循环         │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  出错? ──► 重试策略                         │ ◄── Level 6
│                                             │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Session 保存   │ ◄── Level 5
└────────┬────────┘
         │
         ▼
    返回结果
```

### 13.3 NaughtyAgent 实现进度

| Level | 模块 | 状态 | 评级 | 实现位置 |
|-------|------|------|------|----------|
| 0 | LLM 基础调用 | ✅ 完成 | ⭐⭐⭐⭐⭐ | `provider/` |
| 1 | 工具调用 | ✅ 完成 | ⭐⭐⭐⭐⭐ | `tool/` |
| 2 | Agent 循环 | ✅ 完成 | ⭐⭐⭐⭐⭐ | `agent/` |
| 3 | 上下文管理 | ✅ 完成 | ⭐⭐⭐⭐ | `subtask/context/` |
| 4 | 流式响应 | ✅ 完成 | ⭐⭐⭐⭐⭐ | `cli/`, `ux/` |
| 5 | 会话持久化 | ✅ 完成 | ⭐⭐⭐⭐⭐ | `session/` |
| 6 | 错误处理 | ✅ 完成 | ⭐⭐⭐⭐⭐ | `error/`, `subtask/error-handler.ts` |
| 7 | 权限与安全 | ✅ 完成 | ⭐⭐⭐⭐ | `permission/`, `security/` |
| 8 | MCP 协议 | ✅ 完成 | ⭐⭐⭐⭐⭐ | `mcp/` |
| 9 | 多执行模式 | ✅ 完成 | ⭐⭐⭐⭐⭐ | `subtask/` |
| 10 | 高级能力 | ✅ 完成 | ⭐⭐⭐⭐ | `skill/`, `interaction/` |

**总体评级**: ⭐⭐⭐⭐⭐ (4.7/5)

**亮点实现**:
- 四种执行模式 + Chain API
- MCP 完整实现（连接池、重试、适配器）
- 上下文压缩策略丰富
- ErrorHandler Builder 模式

**可增强方向**:
- 钩子系统事件类型
- 内置专家子代理
- 沙箱隔离

### 13.4 学习建议

**渐进式学习路径**：

```
Week 1: Level 0-2 (基础)
├── 理解 LLM API 调用
├── 实现简单的工具调用
└── 实现基础 Agent 循环

Week 2: Level 3-4 (体验优化)
├── 实现上下文压缩
└── 实现流式响应

Week 3: Level 5-6 (健壮性)
├── 实现会话持久化
└── 实现错误处理和重试

Week 4: Level 7-8 (扩展性)
├── 实现权限系统
└── 实现 MCP 集成

Week 5: Level 9-10 (高级)
├── 实现多执行模式
└── 实现技能/子代理/钩子
```

---

## 附录：参考资源

### 官方文档
- [Anthropic API 文档](https://docs.anthropic.com/claude/reference)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
- [MCP 协议规范](https://modelcontextprotocol.io)

### 相关项目
- [NaughtyAgent](https://github.com/xxx/naughtyagent) - 本项目
- [OpenCode](https://github.com/opencode-ai/opencode) - Claude Code Go 复刻
- [Vercel AI SDK](https://sdk.vercel.ai) - LLM 调用库

### 学习资源
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Tool Use Best Practices](https://docs.anthropic.com/claude/docs/tool-use)

---

*文档创建于 2026-01-31*
