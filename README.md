# NaughtyAgent

一个类似 Claude Code 的 AI 编程助手，采用 VS Code 扩展 + 独立 Agent 后端的分离式架构。

## 核心原则

1. **显式触发** - AI 仅在用户主动调用时工作，无后台进程
2. **人工确认** - AI 的修改必须经用户确认后才应用
3. **可控可维护** - 完全掌控代码，支持长期迭代

## 三种工作模式

| 模式 | 用途 | 权限 |
|------|------|------|
| **Build** | 全功能编程助手：代码编辑、命令执行、文件操作 | 读写 |
| **Plan** | 架构分析和规划，生成 plan.md | 只读 |
| **Explore** | 快速搜索和代码定位 | 只读 |

## 技术栈

- **语言**：TypeScript（ES2022, ESM）
- **运行时**：Node.js / Bun
- **包管理**：pnpm monorepo
- **LLM**：Anthropic Claude / OpenAI / Kiro
- **CLI UI**：Ink 5（React for CLI）
- **IDE**：VS Code Extension
- **测试**：vitest
- **通信**：HTTP + WebSocket

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建项目
just build

# 启动不同模式
just agent-build    # Build 模式
just agent-plan     # Plan 模式
just agent-explore  # Explore 模式

# 交互式 REPL
just repl

# 单次对话
just start "帮我重构这个函数"
```

### VS Code 扩展

```bash
cd packages/vscode
pnpm install && pnpm build
# 在 VS Code 中按 F5 启动扩展开发模式
```

**扩展功能**：
- Chat 界面（Webview），支持 Markdown 渲染、代码高亮
- **多会话并行**：侧边栏会话列表，支持新建/切换/删除会话，后台 session 继续运行
- 模型/模式选择（Build / Plan / Explore）
- 上下文采集（选中代码、打开文件、Git diff、终端输出等）
- question 工具交互（文本输入、确认弹窗、单选/多选）
- 子代理进度展示（parallel_agents 子任务实时状态）

## 项目结构

```
NaughtAgent/
├── packages/
│   ├── agent/                # 核心 Agent 服务
│   │   └── src/
│   │       ├── agent/        # Agent 定义、循环、提示词
│   │       ├── cli/          # CLI 接口、REPL、Ink TUI
│   │       ├── command/      # 命令系统
│   │       ├── context/      # 上下文管理
│   │       ├── daemon/       # 后台服务
│   │       ├── error/        # 错误处理
│   │       ├── interaction/  # 用户交互
│   │       ├── logging/      # 日志监控
│   │       ├── mcp/          # MCP 客户端
│   │       ├── permission/   # 权限系统
│   │       ├── provider/     # LLM 提供者（Anthropic/OpenAI/Kiro）
│   │       ├── security/     # 安全检查
│   │       ├── server/       # HTTP/WebSocket 服务器（多会话隔离）
│   │       ├── session/      # 会话管理
│   │       ├── skill/        # 技能系统
│   │       ├── subtask/      # 子代理系统
│   │       ├── token/        # Token 管理
│   │       └── tool/         # 工具系统
│   │
│   ├── vscode/               # VS Code 扩展
│   │   └── src/
│   │       ├── commands/     # VS Code 命令
│   │       ├── services/     # 扩展服务
│   │       └── views/        # Webview 提供者
│   │
│   └── iterative-probe-mcp/  # MCP Server（迭代探测工具）
│
├── docs/                     # 文档
│   ├── naughtyagent/         # 项目文档（架构、使用指南、参考资料）
│   └── 学习笔记/              # 学习记录
│
└── Skills/                   # Claude Skills
```

## 内置工具

- **read** / **write** / **edit** - 文件读写和精确编辑
- **bash** - Shell 命令执行
- **glob** - 文件模式匹配
- **grep** - 内容搜索
- **子代理工具** - ask_llm / run_agent / fork_agent / parallel_agents / multi_agent / run_workflow

## 配置

在 `packages/agent/.env` 中配置：

```bash
# Anthropic API
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# OpenAI 兼容 API（备用）
# OPENAI_API_KEY=
# OPENAI_BASE_URL=

# Kiro 代理
# ANTHROPIC_API_KEY=kiro-proxy
# ANTHROPIC_BASE_URL=http://127.0.0.1:8080
```

## 文档

- [架构总览](docs/naughtyagent/project/架构设计/00-overview.md)
- [使用指南](docs/naughtyagent/project/使用指南/quick-start.md)
- [CLI 手册](docs/naughtyagent/project/使用指南/cli-usage.md)
- [API 参考](docs/naughtyagent/project/使用指南/api-reference.md)
- [VS Code 扩展](docs/naughtyagent/project/使用指南/vscode-extension.md)

## 测试

```bash
pnpm -C packages/agent test           # 运行测试
pnpm -C packages/agent test:watch     # 监听模式
pnpm -C packages/agent test:coverage  # 带覆盖率
```

## 许可证

待定
