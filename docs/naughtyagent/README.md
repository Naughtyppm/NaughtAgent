# NaughtyAgent 开发文档

当前 Agent 的实现状态、开发进度和改进计划。

## 目录

### project/ - 项目管理
- `参考资料/` - 业界对比、技术栈概览
- `架构设计/` - 当前架构设计文档
- `开发计划/` - L1~L5 分层开发计划
- `实现状态/` - 当前实现状态和 roadmap
- `使用指南/` - CLI、API、VS Code 扩展使用说明

### refactor/ - 重构计划
- `roadmap.md` - 重构路线图
- `phase-1-*.md` - Phase 1 相关文档

### tools/ - 工具和子代理设计
- `agent-teams-design.md` - Agent 团队协作设计
- `subagent-*.md` - 子代理相关设计
- `autonomous-dev-design.md` - 自主开发设计
- `naughtyagent-optimization-plan.md` - 优化计划

### api/ - API 参考
- `phase-1-api-reference.md` - Phase 1 API 参考

## 当前方向

项目正在从 **分离式架构**（Webview + Daemon）转向 **VS Code Copilot Chat 模式**：
- Chat Participant API 替代 Webview
- 进程内 Agent Engine 替代 Daemon
- Skills 目录自动发现替代代码内注册
