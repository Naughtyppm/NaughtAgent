# 架构总览

NaughtyAgent 采用**分离式架构**，由两个核心包组成：Agent 服务 + IDE 扩展。

## 系统架构图

```
┌─────────────────────────────────────────────────────┐
│                    用户界面层                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  VS Code 扩展 │  │  Ink CLI TUI │  │  HTTP API │  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
│         │                 │                │         │
│         └────────┬────────┴────────┬───────┘         │
│                  ▼                 ▼                  │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Daemon 服务层                        │ │
│  │  HTTP Server + WebSocket + 任务调度器 + 会话池    │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         ▼                            │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Agent 核心层                         │ │
│  │  Agent Loop → Provider → LLM API                 │ │
│  │  Tool System → Permission → Security             │ │
│  │  Session → Context → Token Management            │ │
│  │  MCP Client → SubAgent → Skill/Workflow          │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 五层架构

| 层级 | 职责 | 详细文档 |
|------|------|---------|
| 核心引擎层 | Agent Loop、LLM Provider、Tool System | [01-core-engine.md](01-core-engine.md) |
| 上下文管理层 | Token 管理、项目上下文、会话管理 | [02-context-management.md](02-context-management.md) |
| 安全与权限层 | 权限模式、安全检查、沙箱执行 | [03-security-permission.md](03-security-permission.md) |
| 用户界面层 | CLI TUI、IDE 集成、Web 界面 | [04-user-interface.md](04-user-interface.md) |
| 扩展与生态层 | MCP、子代理、技能系统、Hooks | [05-extension-ecosystem.md](05-extension-ecosystem.md) |

## 核心设计原则

1. **显式触发** - AI 仅在用户主动调用时工作，无后台进程
2. **人工确认** - AI 的修改必须经用户确认后才应用
3. **可控可维护** - 完全掌控代码，支持长期迭代

## 包结构

```
naughtyagent/
├── packages/
│   ├── agent/              # 核心 Agent 服务
│   │   └── src/
│   │       ├── agent/      # Agent 定义、循环、提示词
│   │       ├── cli/        # CLI 接口、REPL、Ink TUI
│   │       ├── context/    # 上下文管理
│   │       ├── daemon/     # 后台服务
│   │       ├── mcp/        # MCP 客户端
│   │       ├── permission/ # 权限系统
│   │       ├── provider/   # LLM 提供者
│   │       ├── server/     # HTTP/WebSocket 服务器
│   │       ├── session/    # 会话管理
│   │       ├── subtask/    # 子代理系统
│   │       └── tool/       # 工具系统
│   │
│   └── vscode/             # VS Code 扩展
│       └── src/
│           ├── commands/   # VS Code 命令
│           ├── services/   # 扩展服务
│           └── views/      # Webview 提供者
```
