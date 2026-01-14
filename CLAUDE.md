# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

NaughtAgent - 一个类似 Claude Code 的 AI 编程助手，基于 VS Code 插件实现。

## 需求

### 目标
在 VS Code 中打造一套自己掌控的 AI 编程助手，实现主流 agent 功能。

### 为什么自己做
- 需要实现定制功能
- 掌控整个系统，可长期维护
- 不被现有工具限制

### 技术栈
- **VS Code 扩展**: TypeScript
- **Agent 后端**: TypeScript（独立服务）
- **模型**: Claude API（通过 Kiro 代理）

### 架构
**分离式架构**：
- VS Code 插件：UI 层，负责上下文收集、结果展示、用户交互
- Agent 服务：核心逻辑，CLI/HTTP 接口，调用 Claude API

### 功能范围（参考 Claude Code）
- 代码阅读/理解
- 代码编辑/生成
- 文件操作（读/写/搜索）
- 命令执行
- 上下文管理
- 多轮对话

### 核心原则
1. **显式触发** - 只有用户主动调用时 AI 才工作，无后台进程
2. **人工确认** - AI 的修改必须经用户确认才应用
3. **可控可维护** - 自己掌控代码，长期可迭代

## 参考资料

- [需求.md](需求.md) - GPT 的路线建议（仅参考）
- [docs/opencode-architecture.md](docs/opencode-architecture.md) - OpenCode 架构调研
