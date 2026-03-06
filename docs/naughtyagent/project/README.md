# NaughtyAgent 项目文档

> 基于 Claude SDK 的 AI 编程助手，采用分离式架构（Agent 服务 + IDE 扩展）

## 文档结构

```
docs/Project/
├── README.md                    # 本文件 - 文档索引
│
├── 架构设计/                     # 架构设计
│   ├── 00-overview.md          # 架构总览
│   ├── 01-core-engine.md       # 核心引擎层
│   ├── 02-context-management.md # 上下文管理层
│   ├── 03-security-permission.md # 安全与权限层
│   ├── 04-user-interface.md    # 用户界面层
│   └── 05-extension-ecosystem.md # 扩展与生态层
│
├── 实现状态/                     # 实现状态
│   ├── current-status.md       # 当前进度总览
│   ├── module-maturity.md      # 模块成熟度评估
│   └── roadmap.md              # 迭代路线图
│
├── 参考资料/                     # 参考资料
│   ├── comparison.md           # 业界 Agent 横向对比
│   ├── tech-stack-overview.md  # 成熟 Agent 技术栈全景
│   └── development-phases.md   # 从零开发完整流程
│
└── 使用指南/                     # 使用指南
    ├── quick-start.md          # 快速开始
    ├── cli-usage.md            # CLI 使用手册
    ├── vscode-extension.md     # VS Code 扩展使用
    └── api-reference.md        # HTTP API 参考
```

## 快速导航

| 我想了解... | 阅读文档 |
|------------|---------|
| 项目整体架构 | [架构设计/00-overview.md](架构设计/00-overview.md) |
| 当前实现进度 | [实现状态/current-status.md](实现状态/current-status.md) |
| 与其他 Agent 对比 | [参考资料/comparison.md](参考资料/comparison.md) |
| 如何使用 | [使用指南/quick-start.md](使用指南/quick-start.md) |
| 下一步开发计划 | [实现状态/roadmap.md](实现状态/roadmap.md) |

## 技术栈速览

- 语言：TypeScript (ES2022, ESM)
- 运行时：Node.js / Bun
- 包管理：pnpm monorepo
- LLM：Anthropic Claude / OpenAI / Kiro
- CLI UI：Ink 5 (React for CLI)
- IDE：VS Code Extension
- 通信：HTTP + WebSocket

---

> 文档生成日期：2026-02-27
