# NaughtyAgent 开发文档

本目录包含基于 Claude Agent SDK 的架构设计、开发复盘和测试记录。

## 目录结构

### 📐 architecture/ - 架构决策记录（ADR）
记录重要的架构决策、设计理由和权衡考虑。

- `01-overall-design.md` - 整体架构设计（基于 Claude Agent SDK）
- `02-sdk-integration.md` - SDK 集成策略
- `03-extension-points.md` - 扩展点设计

### 🧠 core/ - SDK 核心组件
基于 Claude Agent SDK 的核心组件实现。

- `agent-harness.md` - Agent 执行引擎（query/ClaudeSDKClient）
- `message-protocol.md` - 消息协议（UserMessage/AssistantMessage/ResultMessage）
- `streaming.md` - 流式响应处理

### 🛠️ tools/ - 工具系统
Agent 可用的工具实现。

- `builtin-tools.md` - 内置工具（Read/Write/Edit/Bash/Glob/Grep）
- `custom-tools.md` - 自定义工具开发
- `mcp-servers.md` - MCP 服务器集成

### 🔐 permissions/ - 权限系统
工具使用的权限控制。

- `permission-modes.md` - 权限模式（default/acceptEdits/plan/bypassPermissions）
- `can-use-tool.md` - 工具权限回调
- `security-layers.md` - 多层安全防护（Swiss Cheese Defense）

### 📦 context/ - 上下文管理
Agent 的上下文和记忆系统。

- `context-window.md` - 上下文窗口管理
- `auto-compaction.md` - 自动压缩机制
- `file-system.md` - 文件系统访问

### 🎯 skills/ - 技能系统
可加载的技能模块。

- `skill-loading.md` - 技能加载机制
- `builtin-skills.md` - 内置技能
- `custom-skills.md` - 自定义技能开发

### 🤖 subagents/ - 子代理
专用子代理系统。

- `subagent-design.md` - 子代理设计
- `context-isolation.md` - 上下文隔离
- `task-delegation.md` - 任务委派

### 🪝 hooks/ - 生命周期钩子
Agent 执行的钩子系统。

- `hook-system.md` - 钩子系统设计
- `hook-events.md` - 钩子事件（PreToolUse/PostToolUse/etc）
- `hook-matchers.md` - 钩子匹配器

### 🔌 integration/ - 外部集成
VS Code 扩展和其他集成。

- `vscode-extension.md` - VS Code 扩展实现
- `cli-wrapper.md` - CLI 包装器
- `api-server.md` - HTTP/WebSocket API

### 🧪 testing/ - 测试记录
测试策略、用例和覆盖率报告。

- `unit-tests.md` - 单元测试记录
- `integration-tests.md` - 集成测试记录
- `e2e-tests.md` - 端到端测试
- `coverage-reports.md` - 覆盖率报告

## 文档规范

每个复盘文档应包含：

1. **概述** - 模块功能和职责
2. **作用** - 在整体架构中的位置
3. **业界方案** - 常见实现方式
4. **我们的实现** - 具体技术选择
5. **决策理由** - 为什么这样做
6. **关键文件** - 相关代码文件
7. **测试覆盖** - 测试用例和覆盖率
8. **问题记录** - 遇到的问题和解决方案
9. **后续注意** - 维护和扩展建议

## 更新规则

- 每完成一个模块/功能，立即更新对应文档
- 重大架构变更需更新 architecture/ 下的 ADR
- 测试完成后更新 testing/ 下的记录
- 保持文档与代码同步
