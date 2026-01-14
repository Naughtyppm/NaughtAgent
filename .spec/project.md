# NaughtAgent 项目规范

## 项目概述

NaughtAgent 是一个类似 Claude Code 的 AI 编程助手，采用 VS Code 插件 + 独立 Agent 服务的分离式架构。

### 为什么自己做

- 需要实现定制功能，现有工具无法满足
- 掌控整个系统，可长期维护和迭代
- 不被现有工具的设计决策限制

## 核心原则

### 1. 显式触发

- AI 只在用户主动调用时工作
- 无后台监听进程
- 无文件变动自动触发
- 无定时任务
- AI 是"工具"，不是"守护进程"

### 2. 人工确认

- 所有文件修改需用户确认（Apply/Reject）
- 危险命令执行前需确认
- 用户可预览将要执行的操作
- 人永远在方向盘上

### 3. 可控可维护

- 自己掌控代码，不依赖闭源服务
- 模块化设计，易于理解和修改
- 长期可迭代，不被模型更新牵着跑

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| VS Code 扩展 | TypeScript | UI 层 |
| Agent 后端 | TypeScript | 核心逻辑 |
| HTTP 服务 | Hono | 轻量级框架 |
| LLM 调用 | Vercel AI SDK | Claude API 封装 |
| 模型 | Claude API | 通过 Kiro 代理 |

## 架构设计

### 分离式架构

```
┌─────────────────────────────────────────────┐
│              VS Code 插件                    │
│  - 上下文收集（选区、文件、项目结构）          │
│  - 用户交互（输入、确认、预览）               │
│  - 结果展示（diff、消息）                    │
└─────────────────┬───────────────────────────┘
                  │ HTTP/WebSocket
                  ▼
┌─────────────────────────────────────────────┐
│              Agent 服务                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Session │ │  Tool   │ │Permission│       │
│  │ 会话管理 │ │ 工具系统 │ │ 权限控制 │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  Agent  │ │ Provider│ │  CLI    │       │
│  │ Agent定义│ │ LLM调用 │ │ 命令入口 │       │
│  └─────────┘ └─────────┘ └─────────┘       │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│           Claude API (Kiro 代理)             │
└─────────────────────────────────────────────┘
```

### 核心模块

| 模块 | 职责 |
|------|------|
| agent | Agent 定义和管理（build、plan、explore） |
| session | 会话管理、消息处理、上下文维护 |
| tool | 工具系统（文件操作、代码搜索、命令执行） |
| permission | 权限控制（allow/deny/ask） |
| provider | LLM 提供商管理和调用 |
| server | HTTP 服务器，对外接口 |
| cli | CLI 命令入口 |

### 工具系统

内置工具（参考 Claude Code）：

| 类别 | 工具 | 说明 |
|------|------|------|
| 文件操作 | read | 读取文件内容 |
| | write | 写入文件 |
| | edit | 编辑文件（精确替换） |
| | glob | 文件模式匹配 |
| 代码搜索 | grep | 正则搜索 |
| 执行 | bash | 执行命令 |
| 交互 | question | 向用户提问 |
| | todo | 任务管理 |
| 子任务 | task | 启动子 Agent |

### Agent 类型

| Agent | 模式 | 说明 |
|-------|------|------|
| build | primary | 默认全功能，可编辑文件、执行命令 |
| plan | primary | 只读分析，拒绝编辑，用于规划 |
| explore | subagent | 代码探索，快速搜索和分析 |

### 权限模型

```typescript
Permission {
  type: "edit" | "bash" | "read" | "question"
  action: "allow" | "deny" | "ask"
  pattern?: string  // 路径或命令匹配
}
```

- 每个 Agent 有独立权限集合
- 支持通配符匹配
- 危险操作默认 ask

## 功能范围

### Phase 1: 核心功能

- [ ] CLI 基础框架
- [ ] Claude API 调用（通过 Kiro）
- [ ] 基础工具（read、write、edit、bash）
- [ ] 单轮对话
- [ ] 权限确认

### Phase 2: 完整 Agent

- [ ] 多轮对话和上下文管理
- [ ] 完整工具集（grep、glob、task）
- [ ] 多 Agent 支持（build、plan、explore）
- [ ] 会话持久化

### Phase 3: VS Code 集成

- [ ] VS Code 扩展基础框架
- [ ] 与 Agent 服务通信
- [ ] 上下文收集（选区、文件）
- [ ] 结果展示和确认 UI

### Phase 4: 增强功能

- [ ] MCP 协议支持
- [ ] 自定义工具/插件
- [ ] 会话分叉和回滚

## 设计参考

- **OpenCode** - 架构和模块划分（见 docs/opencode-architecture.md）
- **Zed AI** - 交互理念（见 docs/zed-ai-philosophy.md）

## 开发约定

### 命名规范

- 文件/目录：kebab-case
- 变量/函数：camelCase
- 类/接口：PascalCase
- 常量：UPPER_SNAKE_CASE

### 代码风格

- TypeScript 严格模式
- ESLint + Prettier
- 优先使用 async/await
- 显式类型声明

### 提交规范

- feat: 新功能
- fix: 修复
- docs: 文档
- refactor: 重构
- chore: 杂项

### 目录结构（规划）

```
packages/
├── agent/                 # Agent 核心服务
│   └── src/
│       ├── agent/         # Agent 定义
│       ├── session/       # 会话管理
│       ├── tool/          # 工具系统
│       ├── permission/    # 权限控制
│       ├── provider/      # LLM 调用
│       ├── server/        # HTTP 服务
│       └── cli/           # CLI 入口
├── vscode/                # VS Code 扩展
│   └── src/
│       ├── extension.ts   # 扩展入口
│       ├── context/       # 上下文收集
│       ├── ui/            # UI 组件
│       └── client/        # Agent 客户端
└── shared/                # 共享类型和工具
```
