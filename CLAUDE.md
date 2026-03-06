# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Agent 和 LLM一定要执行的是：始终跟我用中文交流。

## 项目概述

NaughtyAgent - 一个类似 Claude Code 的 AI 编程助手，基于 VS Code 插件实现。

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

## 开发流程

### SDD 规格驱动

本项目采用 SDD 方式开发，仿照 VS Code Copilot Chat 模式构建 AI 编程助手。

**核心文件：**
- **进度跟踪**: [.spec/sdd/progress.md](.spec/sdd/progress.md) - 做了什么、还差什么
- **接口规格**: [.spec/sdd/interfaces/](.spec/sdd/interfaces/) - 类型定义、契约
- **行为规格**: [.spec/sdd/behaviors/](.spec/sdd/behaviors/) - 场景、约束、错误处理

**开发步骤（每个任务必须遵循）：**

```
1. 看 progress.md 确定要做什么
2. 检查对应的规格文件（没有则先写规格）
3. 实现代码
4. 更新 progress.md 状态
5. 输出阶段总结
```

**用户指令：**
- "继续" / "下一个" - 按 progress.md 顺序开发
- "做 xxx" - 指定开发某个模块
- "看进度" - 汇报当前进度
- "总结" - 输出当前阶段总结

### 阶段总结要求

**每完成一个大任务后，必须输出总结，包含：**

1. **做了什么** - 实现了哪些模块/功能
2. **能干什么** - 具体能力，输入输出
3. **在 Agent 中的作用** - 这个模块在整体架构中的位置和职责
4. **当前整体能力** - 现在能做什么、不能做什么
5. **下一步建议** - 按依赖关系的开发顺序

这样做是为了让用户理解 Agent 的工作原理，而不只是完成代码。

### 文档记录要求

**所有总结必须记录到 spec 文档中，不能只在对话中输出：**

1. **阶段总结** → `.spec/sdd/summaries/phase-N-xxx.md`
2. **进度更新** → `.spec/sdd/progress.md`
3. **项目概览** → `.spec/project.md`

**project.md 必须包含清晰的开发进度：**

- 每个节点的技术栈名称
- 功能简述
- 状态标记：✅ 完成 / 🔨 进行中 / ⬜ 未开始
- 对应的规格文件和实现文件路径

## 参考资料

- [需求.md](需求.md) - GPT 的路线建议（仅参考）
- [docs/zed-ai-philosophy.md](docs/zed-ai-philosophy.md) - Zed AI 设计理念
