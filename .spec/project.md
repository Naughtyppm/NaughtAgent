# NaughtAgent 项目规范

## 项目概述

NaughtAgent 是一个类似 Claude Code 的 AI 编程助手，基于 VS Code 插件实现。

## 目标

在 VS Code 中打造一套自己掌控的 AI 编程助手，实现主流 agent 功能。

## 技术栈

- **VS Code 扩展**: TypeScript
- **Agent 后端**: TypeScript（独立服务）
- **模型**: Claude API（通过 Kiro 代理）

## 架构

**分离式架构**：
- VS Code 插件：UI 层，负责上下文收集、结果展示、用户交互
- Agent 服务：核心逻辑，CLI/HTTP 接口，调用 Claude API

## 核心原则

1. **显式触发** - 只有用户主动调用时 AI 才工作，无后台进程
2. **人工确认** - AI 的修改必须经用户确认才应用
3. **可控可维护** - 自己掌控代码，长期可迭代

## 功能范围

参考 Claude Code：
- 代码阅读/理解
- 代码编辑/生成
- 文件操作（读/写/搜索）
- 命令执行
- 上下文管理
- 多轮对话

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

### 提交规范
- feat: 新功能
- fix: 修复
- docs: 文档
- refactor: 重构
- chore: 杂项
