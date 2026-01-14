# OpenCode 架构调研

> 调研时间：2026-01-14
> 参考项目：https://github.com/opencode-ai/opencode

OpenCode 是一个开源的 AI 编程助手，几乎 1:1 复刻了 Claude Code 的功能和架构。

## 技术栈

| 类别 | 技术选型 |
|------|---------|
| 语言 | TypeScript |
| 运行时 | Bun |
| LLM 调用 | Vercel AI SDK（支持 20+ 提供商） |
| TUI 框架 | OpenTUI（基于 SolidJS） |
| HTTP 服务 | Hono |
| 数据库 | Drizzle ORM |
| 桌面应用 | Tauri |
| 代码解析 | tree-sitter |
| 类型验证 | Zod |

## 项目结构

```
packages/
├── opencode/          # 核心 CLI 和服务器
│   └── src/
│       ├── agent/     # Agent 定义和管理
│       ├── session/   # 会话管理
│       ├── tool/      # 工具系统
│       ├── provider/  # LLM 提供商
│       ├── permission/# 权限控制
│       ├── server/    # HTTP 服务器
│       ├── cli/       # CLI 命令
│       ├── mcp/       # MCP 协议
│       ├── config/    # 配置管理
│       ├── storage/   # 数据持久化
│       ├── lsp/       # 语言服务器协议
│       └── plugin/    # 插件系统
├── app/               # Web UI 组件（SolidJS）
├── desktop/           # 桌面应用（Tauri）
├── plugin/            # 插件 SDK
├── sdk/               # JavaScript SDK
└── ui/                # UI 组件库
```

## 核心模块

### Agent 系统

内置 Agent 类型：
- **build** - 默认全功能 Agent，可编辑文件、执行命令
- **plan** - 只读分析 Agent，拒绝编辑操作
- **explore** - 代码探索 Agent，快速搜索和分析
- **general** - 通用子 Agent，处理复杂多步任务

Agent 配置结构：
```typescript
Agent.Info {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  permission: PermissionNext.Ruleset
  model?: { modelID, providerID }
  prompt?: string
  temperature?: number
  steps?: number
}
```

### 工具系统

内置工具（20+）：
- **文件操作**: read、write、edit、glob
- **代码搜索**: grep、codesearch
- **执行**: bash、batch
- **Web**: websearch、webfetch
- **交互**: question、task、todo
- **特殊**: skill、lsp

工具注册机制：
1. 内置工具直接注册
2. 插件工具从 `.opencode/tool/` 加载
3. 自定义工具通过 `ToolRegistry.register()` 注册

### 权限系统

- 基于规则的细粒度权限控制
- 支持 allow/deny/ask 三种操作
- 支持通配符和路径匹配
- 每个 Agent 有独立权限集合

权限类型：
- `edit` - 文件编辑
- `bash` - 命令执行
- `read` - 文件读取
- `question` - 用户提问
- `external_directory` - 外部目录访问

### 会话管理

消息结构：
```typescript
MessageV2 {
  User { id, sessionID, text, system?, files? }
  Assistant { id, sessionID, parts: (TextPart | ToolPart | ReasoningPart)[] }
  ToolPart { id, toolID, args, result, status }
}
```

特性：
- 会话存储在本地文件系统或云端
- 支持会话分叉（fork）和继续
- 自动压缩长会话（compaction）
- 支持会话回滚（revert）

## 数据流

```
User Input (CLI/Web/TUI)
    ↓
CLI Command Handler
    ↓
Server Connection (Hono)
    ↓
Session Processor
    ├─ 加载消息历史
    ├─ 构建系统提示
    └─ 收集可用工具
    ↓
LLM Stream (AI SDK)
    ├─ 选择模型/提供商
    └─ 流式生成
    ↓
Tool Execution Loop
    ├─ 解析工具调用
    ├─ 权限检查
    ├─ 执行工具
    └─ 返回结果给 LLM
    ↓
Message Storage
    ↓
Response Streaming
```

## 架构特点

1. **客户端/服务器分离** - CLI、TUI、Web 都连接到后端服务
2. **多提供商支持** - 不绑定任何 LLM，支持 Anthropic、OpenAI、Google 等 20+ 提供商
3. **MCP 集成** - 完整支持 Model Context Protocol
4. **插件系统** - 支持自定义工具、命令、Agent
5. **多层级配置** - 全局配置 → 项目配置 → 环境变量

## 与 Claude Code 对比

| 特性 | OpenCode | Claude Code |
|------|----------|-------------|
| 开源 | ✅ MIT | ❌ 闭源 |
| LLM 支持 | 20+ 提供商 | 仅 Claude |
| 工具系统 | 几乎相同 | 原版 |
| Agent 类型 | build/plan/explore | 类似 |
| 权限模型 | 几乎相同 | 原版 |
| TUI | OpenTUI | 自研 |
| 可定制性 | 完全可控 | 有限 |

## 对 NaughtAgent 的参考价值

### 可借鉴
- 模块划分方式（agent/tool/session/permission）
- 工具注册和执行机制
- 权限控制模型
- 客户端/服务器分离架构

### 可简化
- 不需要 20+ 提供商支持，只用 Claude
- 初期不需要 Web UI 和桌面应用
- 不需要云端会话存储
- 插件系统可后期再加

### 技术选型建议
- TypeScript 统一前后端
- Vercel AI SDK 调用 Claude API
- 先做 CLI，再做 VS Code 插件
- Hono 做 HTTP 服务（轻量）
