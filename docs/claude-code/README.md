# Claude Code 架构研究

研究 Claude Code / Claude Agent SDK 的架构设计，作为 NaughtyAgent 重写的参考。

## 目录

### architecture/ - 架构设计参考
- `01-overall-design.md` - 整体分层架构（Agent Loop、工具系统、Provider 等）

### core/ - 核心组件研究
- `message-protocol.md` - 消息协议（多模态支持）
- `session-manager.md` - 会话管理器
- `session-storage.md` - 会话存储
- `error-handling.md` - 错误处理系统
- `logging-monitoring.md` - 日志与监控
- `extended-thinking-completion.md` - Extended Thinking
- `token-precise-counting-completion.md` - Token 精确计数
- `migration-guide.md` - 迁移指南
- `phase-1-completion-report.md` - Phase 1 完成报告

## 用途

这些文档是在学习 Claude Code 工作原理时产生的研究笔记和架构分析。
现在项目方向转为仿照 **VS Code Copilot Chat 模式**重写，这些文档作为底层架构参考仍有价值。
