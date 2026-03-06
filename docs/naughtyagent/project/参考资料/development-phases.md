# 从零开发一个成熟 Agent 的完整流程

> 基于业界最佳实践，分 10 个阶段构建生产级 AI 编程助手

---

## 目录

1. [Phase 0：项目脚手架](#phase-0项目脚手架)
2. [Phase 1：最小可用 Agent](#phase-1最小可用-agent)
3. [Phase 2：核心能力完善](#phase-2核心能力完善)
4. [Phase 3：高级 CLI 体验](#phase-3高级-cli-体验)
5. [Phase 4：Daemon 服务化](#phase-4daemon-服务化)
6. [Phase 5：IDE 集成](#phase-5ide-集成)
7. [Phase 6：扩展生态](#phase-6扩展生态)
8. [Phase 7：安全加固](#phase-7安全加固)
9. [Phase 8：性能优化](#phase-8性能优化)
10. [Phase 9：测试与质量](#phase-9测试与质量)

---

## Phase 0：项目脚手架（1-2 天）

### 目标
搭建 monorepo 基础设施，建立开发环境。

### 步骤

#### 1. 初始化 pnpm monorepo

```bash
mkdir naughtyagent && cd naughtyagent
pnpm init
```

创建 `pnpm-workspace.yaml`：
```yaml
packages:
  - 'packages/*'
```

创建工作区目录：
```
packages/
├── agent/     # 核心 Agent 服务
└── vscode/    # VS Code 扩展（或其他 IDE）
```

#### 2. TypeScript 配置

根目录 `tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Agent 包使用 `tsup.config.ts` 打包：
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true
})
```

#### 3. 测试框架

`vitest.config.ts`：
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 85,
        lines: 80
      }
    }
  }
})
```

#### 4. 代码质量

- ESLint + Prettier 配置
- husky + lint-staged（pre-commit 检查）

#### 5. CLI 入口

`package.json` 添加 bin 字段：
```json
{
  "bin": {
    "naughtyagent": "./dist/cli/cli.js",
    "na": "./dist/cli/cli.js"
  }
}
```

### 产出
能运行 `pnpm build` 和 `pnpm test` 的空项目骨架。

---

## Phase 1：最小可用 Agent（1-2 周）

### 目标
实现 "用户输入 → LLM 响应 → 工具调用" 的基本循环。

### 1.1 LLM Provider

定义 Provider 接口：
```typescript
interface LLMProvider {
  stream(messages: Message[], options: StreamOptions): AsyncIterable<StreamEvent>
  chat(messages: Message[], options: ChatOptions): Promise<AssistantMessage>
}
```

实现 Anthropic Provider（最核心）：
- 消息格式转换（内部格式 ↔ API 格式）
- 流式输出处理
- 错误处理（认证、限流、网络）

### 1.2 Tool System

工具定义模式：
```typescript
export const readTool = Tool.define({
  id: "read",
  description: "读取文件内容",
  parameters: z.object({
    path: z.string().describe("文件路径")
  }),
  execute: async (params, ctx) => {
    // 实现逻辑
  }
})
```

最小工具集：
- `read` - 读取文件
- `write` - 写入文件
- `bash` - 执行命令

### 1.3 Agent Loop

核心循环伪代码：
```typescript
async function agentLoop(session: Session) {
  while (true) {
    const response = await provider.stream(session.messages)
    
    for await (const event of response) {
      if (event.type === 'text') {
        emit('text', event.content)
      }
      if (event.type === 'tool_use') {
        const result = await executeTool(event.tool, event.input)
        session.addToolResult(event.id, result)
      }
    }
    
    // 无工具调用 = 完成
    if (!hasToolCalls(response)) break
  }
}
```

### 1.4 Session

基础会话结构：
```typescript
interface Session {
  id: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}
```

### 1.5 CLI

最简 REPL：
```typescript
const rl = readline.createInterface({ input, output })

rl.on('line', async (input) => {
  session.addUserMessage(input)
  await agentLoop(session)
})
```

### 产出
能在终端中对话、读写文件、执行命令的基础 Agent。

---

## Phase 2：核心能力完善（2-3 周）

### 目标
补齐生产级 Agent 的核心能力。

### 2.1 完整工具集

| 工具 | 功能 | 超时 |
|------|------|------|
| `edit` | 搜索替换编辑 | 10s |
| `append` | 追加内容 | 10s |
| `glob` | 文件名搜索 | 10s |
| `grep` | 内容搜索 | 15s |

工具增强：
- 输出截断（大文件智能截取）
- 超时控制（AbortController）
- 错误分类

### 2.2 权限系统

三级权限模式：
| 模式 | 读 | 写 | 执行 |
|------|----|----|------|
| ask | ✅ | ⚠️ 询问 | ⚠️ 询问 |
| allow | ✅ | ✅ | ✅ |
| sandbox | ✅ | ✅ 沙箱内 | ✅ 沙箱内 |

细粒度规则：
```typescript
interface PermissionRule {
  tool: string | string[]      // 工具类型
  pattern: string              // glob 模式
  action: 'allow' | 'deny' | 'ask'
}
```

### 2.3 上下文管理

- 项目结构自动检测（遍历目录生成树）
- 技术栈识别（package.json / Cargo.toml / go.mod 等）
- Git 上下文（分支、最近提交、diff）
- 系统提示词动态构建

### 2.4 会话持久化

JSON 文件存储：
```
~/.naughtyagent/sessions/
├── session-abc123.json
├── session-def456.json
└── index.json
```

### 2.5 Token 管理

- Token 估算（字符数 / 4 或 tiktoken）
- 上下文窗口监控
- 工具输出截断策略

### 产出
功能完整的 CLI Agent，可日常使用。

---

## Phase 3：高级 CLI 体验（1-2 周）

### 目标
打造优秀的终端交互体验。

### 3.1 TUI 界面（Ink）

核心组件：
- `MessageList` - 消息列表（分轮次展示）
- `InputArea` - 输入区域（多行编辑）
- `StatusBar` - 状态指示器（Token、模型、模式）
- `PermissionDialog` - 权限确认对话框
- `MarkdownRenderer` - Markdown 渲染（代码高亮）
- `DiffPreview` - Diff 预览

### 3.2 命令系统

内置命令：
| 命令 | 功能 |
|------|------|
| `/help` | 帮助信息 |
| `/mode` | 切换权限模式 |
| `/config` | 查看/修改配置 |
| `/history` | 对话历史 |
| `/alias` | 别名管理 |
| `/init` | 项目初始化 |

命令路由：
```typescript
const router = new CommandRouter()
router.register('/help', helpCommand)
router.register('/mode', modeCommand)
// ...
```

### 3.3 错误处理增强

错误分类：
- 网络错误（重试）
- 认证错误（提示配置）
- 限流错误（等待重试）
- 工具执行错误（显示详情）

自动重试策略：
```typescript
const retryStrategy = {
  maxRetries: 3,
  backoff: 'exponential',
  retryableErrors: ['network', 'rate_limit']
}
```

### 3.4 日志与监控

- 分级日志（DEBUG/INFO/WARN/ERROR）
- 性能监控（操作耗时）
- 分布式追踪（traceId）

### 产出
体验良好的终端 AI 助手。

---

## Phase 4：Daemon 服务化（1-2 周）

### 目标
将 Agent 服务化，支持多客户端接入。

### 4.1 HTTP Server

RESTful API：
| 端点 | 方法 | 功能 |
|------|------|------|
| `/sessions` | GET/POST | 会话管理 |
| `/sessions/:id/messages` | POST | 发送消息 |
| `/sessions/:id/messages/stream` | POST | 流式消息 |
| `/tasks` | GET/POST | 任务管理 |

流式响应（SSE）：
```typescript
app.post('/sessions/:id/messages/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  
  for await (const event of agentLoop(session)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
})
```

### 4.2 WebSocket

实时双向通信：
```typescript
wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    const { type, payload } = JSON.parse(data)
    // 处理消息
  })
})
```

### 4.3 Daemon 进程

- 后台运行（detach）
- Worker 池（并发任务）
- 任务队列（优先级调度）
- 会话池管理

### 4.4 客户端 SDK

```typescript
const client = new NaughtyAgentClient('http://localhost:31415')
const session = await client.createSession()
const stream = client.sendMessage(session.id, 'Hello')

for await (const event of stream) {
  console.log(event)
}
```

### 产出
可被 IDE 扩展和 Web 前端接入的后端服务。

---

## Phase 5：IDE 集成（2-3 周）

### 目标
深度集成到 VS Code。

### 5.1 基础扩展

- Webview Chat 面板
- 上下文收集（当前文件、选中代码）
- 命令注册（打开聊天、解释代码、修复代码）
- 状态栏指示器

### 5.2 深度集成

- Diff Editor 集成（修改预览和确认）
- 文件引用（#file 语法）
- 终端集成（在 VS Code 终端执行命令）
- 诊断集成（错误/警告面板）
- 内联代码建议（Inline Completion Provider）

### 5.3 高级功能

- Code Actions（快速修复建议）
- 文件装饰器（AI 修改标记）
- 多会话管理
- 设置面板

### 产出
功能丰富的 VS Code AI 助手。

---

## Phase 6：扩展生态（2-4 周）

### 目标
构建可扩展的生态系统。

### 6.1 MCP 客户端

- 连接管理（stdio / SSE / WebSocket）
- 工具发现和注册
- 资源访问
- 提示模板
- 连接池和重试

### 6.2 子代理系统

| 工具 | 功能 |
|------|------|
| `run_agent` | 启动子 Agent |
| `fork_agent` | 分叉 Agent |
| `parallel_agents` | 并行多 Agent |
| `multi_agent` | 多 Agent 协作 |
| `run_workflow` | 工作流执行 |

### 6.3 规则系统

触发器类型：
- `glob` - 文件路径匹配
- `command` - 命令匹配
- `keyword` - 关键词匹配
- `tool` - 工具调用匹配

### 6.4 技能系统

- 技能定义和注册
- 参数化技能
- 内置技能库

### 产出
可扩展的 Agent 平台。

---

## Phase 7：安全加固（1-2 周）

### 目标
生产级安全保障。

### 7.1 沙箱执行

- Docker 容器隔离（推荐）
- 文件系统限制
- 网络隔离

### 7.2 安全检查增强

- 路径遍历深度防护
- 符号链接检测
- 命令注入检测
- 敏感信息扫描
- 代码注入检测

### 7.3 审计日志

- 所有工具调用记录
- 文件修改历史
- 命令执行记录
- 可回溯的操作链

### 产出
安全可靠的生产级 Agent。

---

## Phase 8：性能优化（1-2 周）

### 目标
优化响应速度和资源使用。

### 8.1 Token 优化

- 精确 Token 计数（tiktoken）
- 智能上下文压缩
- 工具输出智能截断
- 预留 Token 预算管理

### 8.2 缓存策略

- 文件内容缓存（hash 校验）
- 项目结构缓存
- LLM 响应缓存
- MCP 工具列表缓存

### 8.3 并发优化

- 工具并行执行
- 预加载
- 连接池复用

### 产出
快速响应的高性能 Agent。

---

## Phase 9：测试与质量（持续）

### 目标
确保代码质量和稳定性。

### 9.1 单元测试

- 每个模块的核心逻辑测试
- 工具执行测试（mock 文件系统）
- Provider 测试（mock API）
- 权限系统测试

### 9.2 集成测试

- Agent Loop 端到端测试
- Daemon 服务测试
- WebSocket 通信测试

### 9.3 E2E 测试

- CLI 交互测试
- VS Code 扩展测试
- 真实 LLM 调用测试（可选）

### 9.4 覆盖率目标

| 指标 | 目标 |
|------|------|
| 语句覆盖率 | 80%+ |
| 分支覆盖率 | 75%+ |
| 函数覆盖率 | 85%+ |
| 行覆盖率 | 80%+ |

### 产出
高质量、可维护的代码库。

---

## 总结：开发时间线

| 阶段 | 内容 | 预估时间 |
|------|------|---------|
| Phase 0 | 项目脚手架 | 1-2 天 |
| Phase 1 | 最小可用 Agent | 1-2 周 |
| Phase 2 | 核心能力完善 | 2-3 周 |
| Phase 3 | 高级 CLI 体验 | 1-2 周 |
| Phase 4 | Daemon 服务化 | 1-2 周 |
| Phase 5 | IDE 集成 | 2-3 周 |
| Phase 6 | 扩展生态 | 2-4 周 |
| Phase 7 | 安全加固 | 1-2 周 |
| Phase 8 | 性能优化 | 1-2 周 |
| Phase 9 | 测试与质量 | 持续 |

总计：约 3-4 个月可完成一个生产级 AI 编程助手的核心功能。

---

> 文档生成日期：2026-02-27
