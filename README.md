# NaughtyAgent

一个类似 Claude Code 的 AI 编程助手，采用 VS Code 扩展 + 独立后端服务的架构实现。

## 简介

NaughtyAgent 是一个功能强大的 AI 编程助手，能够帮助开发者进行代码分析、文件操作和项目管理。基于 Claude Agent SDK 构建，提供完整的会话管理、错误处理和日志监控能力。

## 核心原则

1. **显式触发** - AI 仅在用户主动调用时工作，无后台进程
2. **人工确认** - AI 的修改必须经用户确认后才应用
3. **可控可维护** - 完全掌控代码，支持长期迭代

## 功能特性

### 核心功能
- 🔍 代码阅读与分析
- ✏️ 代码编辑与生成
- 📁 文件操作（读/写/搜索）
- 💻 命令执行
- 🧠 上下文管理
- 💬 多轮对话

### Phase 1 新增功能 ✨
- 🖼️ **多模态支持**：支持图片和音频内容
- 🌳 **会话分支**：从历史对话点创建分支，尝试不同方案
- 🏷️ **标签管理**：使用标签组织和搜索会话
- 💰 **成本追踪**：自动追踪和统计 API 使用成本
- ⚠️ **错误处理**：统一的错误分类和自动重试机制
- 📊 **日志监控**：结构化日志和性能监控
- 🔍 **请求追踪**：基于 TraceId 的完整请求链路追踪

## 架构设计

分离式架构，包含两个主要组件：
- **VS Code 扩展**：UI 层，负责上下文收集、结果展示、用户交互
- **Agent 服务**：核心逻辑层，提供 CLI/HTTP 接口，调用 Claude API

## 技术栈

- **语言**：TypeScript（ES2022）
- **运行时**：Node.js / Bun
- **包管理**：pnpm（monorepo）
- **测试**：vitest
- **核心依赖**：@anthropic-ai/claude-agent-sdk

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 运行 agent
pnpm dev

# 运行测试
pnpm -C packages/agent test

# 类型检查
pnpm typecheck
```

### 构建

```bash
# 构建 agent 包
pnpm build

# 构建 VS Code 扩展
cd packages/vscode
npm run build
```

## 项目结构

```
naughtyagent/
├── packages/
│   ├── agent/              # 核心 Agent 服务
│   │   ├── src/
│   │   │   ├── agent/      # Agent 定义、循环、提示词
│   │   │   ├── session/    # 会话管理、存储
│   │   │   ├── error/      # 错误处理 ✨ Phase 1
│   │   │   ├── logging/    # 日志监控 ✨ Phase 1
│   │   │   ├── tool/       # 工具系统
│   │   │   └── ...
│   │   └── test/           # 测试目录
│   │
│   └── vscode/             # VS Code 扩展
│
├── docs/                   # 开发文档
│   ├── core/              # 核心组件文档
│   ├── api/               # API 参考文档
│   └── architecture/      # 架构决策记录
│
└── .kiro/
    ├── specs/             # 功能规格文档
    └── steering/          # AI 引导规则
```

## 文档

- [Phase 1 完成报告](./docs/core/phase-1-completion-report.md) - Phase 1 实现总结
- [迁移指南](./docs/core/migration-guide.md) - Phase 1 升级指南
- [API 参考](./docs/api/phase-1-api-reference.md) - Phase 1 API 文档
- [消息协议](./docs/core/message-protocol.md) - 多模态消息支持
- [会话管理](./docs/core/session-manager.md) - 会话分支和成本追踪
- [错误处理](./docs/core/error-handling.md) - 统一错误处理
- [日志监控](./docs/core/logging-monitoring.md) - 结构化日志和性能监控

## 测试

### 运行测试

```bash
# 运行所有测试
pnpm -C packages/agent test

# 监听模式
pnpm -C packages/agent test:watch

# 带覆盖率
pnpm -C packages/agent test:coverage
```

### 测试统计（Phase 1）

- **总测试数**：1138 个
- **通过率**：99.3%（1130/1138）
- **新增测试**：238 个
- **覆盖率**：95%

## 开发进度

### ✅ Phase 1: 基础设施层对齐（已完成）
- ✅ 消息协议扩展（多模态支持）
- ✅ 会话管理增强（分支、标签、成本追踪）
- ✅ 错误处理统一（错误分类和重试）
- ✅ 日志与监控（结构化日志和性能监控）

### 🚧 Phase 2: 工具系统优化（计划中）
- 工具权限细化
- 工具执行优化
- MCP 服务器集成

### 📋 Phase 3: Agent 能力增强（计划中）
- 多 Agent 协作
- 技能系统
- 上下文管理优化

## 贡献指南

欢迎贡献！请遵循以下规范：

1. **代码风格**：遵循 TypeScript 严格模式
2. **测试要求**：新功能必须有对应测试
3. **文档更新**：重要变更需更新文档
4. **中文交流**：所有对话、注释、文档使用中文

## 许可证

待定

## 联系方式

待定

---

**最后更新**：2026-01-17  
**当前版本**：Phase 1 完成