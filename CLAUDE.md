# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Agent 和 LLM一定要执行的是：始终跟我用中文交流。包括所有子代 Agent（sub-agent、task agent）也必须用中文输出。

## 交互规则

- **术语纠正**：如果用户用词不规范或不准确（如混淆概念、错误术语），必须主动纠正并解释正确用法。
- **不确定就查**：对于不确定的技术概念、API、架构细节，必须先查阅资料再回答，不要凭记忆猜测。

## 学习笔记

学习笔记统一存放在 `docs/学习笔记/` 目录下，按主题分类：
- `docs/学习笔记/Agent架构/` - Agent 相关的架构、设计模式、功能调研
- 后续按需扩展更多分类

## 项目概述

NaughtyAgent - 一个类似 Claude Code 的 AI 编程助手，自主可控。
- **架构**：VS Code 扩展（UI 层）+ 独立 Agent 后端（核心逻辑）
- **技术栈**：TypeScript / pnpm monorepo / Ink 5 (React CLI) / Vercel AI SDK
- **子包**：`packages/agent`（核心）、`packages/vscode`（VS Code 扩展）、`packages/iterative-probe-mcp`

## 重构进度与审核体系（2026-03-31 更新）

> 完整计划：`Docs/Project/Design-重构计划.md`
> 教程↔代码映射：`Docs/Project/Tutorial-CodeMapping.md`
> Phase B/C/D 执行计划：`docs/superpowers/plans/2026-03-31-phase-*.md`

### 两套编号系统说明

- **教程 s01-s12**（Obsidian 智能体教程）：Agent 架构知识体系，定义"应该有什么能力"
- **Phase A-D**（重构执行计划）：NaughtAgent 代码改动步骤，按依赖关系排序
- **关系**：教程是标准，重构是对齐到标准的工程步骤
- **沟通约定**：以教程章节 + 具体行动来定位，不再用 A6/A7 这种编号

### Phase A — 核心引擎重建 ✅ 已完成

已修复 7 个致命/严重 bug，Loop 782→220 行，Runner 535→300 行。

### 教程对照审核进度

| 章节 | 主题 | 审核状态 | 补充行动 |
|------|------|---------|---------|
| s01 | Agent Loop | ✅ 全部对齐 | 无 |
| s02 | Tool Use | ✅ 全部对齐 | 补充 safePath、ToolRegistry 实例注入 |
| s03 | Todo Write | ✅ 全部对齐 | 补充 TodoTool + QuestionTool 注册到 ToolRegistry |
| s04 | Subagent | ✅ 全部对齐 | 7 种模式远超教程标准，无需修改 |
| s05 | Skill Loading | ✅ 已修复 | 补充 initSkills/initKnowledgeSkillDirs 调用 + LoadSkillTool 注册 |
| s06 | Context Compact | ✅ 已修复 | 补充 compact 工具（Layer 3）+ toolMeta 传递链 |
| s07 | Task System | ⚠️ 偏移 | task-tool.ts 是统一子任务入口，任务板 CRUD 由 s11 工具覆盖 |
| s08 | Background Tasks | ✅ 全部对齐 | concurrency + events + global-listener 完整 |
| s09 | Agent Teams | ⚠️ 部分 | 仅 SubAgent 配置管理，缺 Team 创建/成员管理 |
| s10 | Team Protocols | ✅ 全部对齐 | 关机协议 + 计划审批，5 工具已注册 |
| s11 | Autonomous Agents | ✅ 全部对齐 | 全局任务板 + Inbox + Idle 轮询，5 工具已注册 |
| s12 | Worktree Isolation | ✅ 全部对齐 | Git worktree CRUD + 事件日志，6 工具已注册 |

### NaughtAgent 特有功能（不套教程编号）

- Provider 抽象层（Anthropic/OpenAI/Kiro/Auto 四后端）
- 模型映射（Anthropic/Copilot/Kiro 三套模型名互转）
- Copilot API 反代支持（localhost:4141）
- Extended Thinking 支持
- React Ink TUI
- VS Code 扩展
- 6+ 种子代理模式
- Justfile 集成 + Daemon 模式

### 架构原则（不可违反）

1. **Loop 200 行**：只做 `LLM → Tool → LLM`，不耦合 Session/权限/监控
2. **ToolRegistry class 实例化**：每个 Runner 独立，消灭全局状态
3. **权限在工具执行前拦截**：不是事后通知
4. **增量文本输出**：`text_delta` 事件，不是累积 `text`
5. **stop_reason 必须处理**：max_tokens 截断时告知用户

### 不可妥协的底线

- `pnpm typecheck` 零错误 —— 每个 Phase 结束时
- 零 `as any` —— 用正确的类型适配替代
- 权限真正生效 —— 工具执行前拦截
- 增量文本输出 —— `text_delta` 而非累积 `text`
- stop_reason 必须处理 —— max_tokens 截断时告知用户

### 可复用零件（不要重写这些）

- 工具实现：`tool/bash.ts`, `read.ts`, `edit.ts`, `glob.ts`, `grep.ts` — 直接复用
- MCP 客户端：`mcp/` 全目录 — 直接复用
- Session 数据结构：`session/session.ts` — 直接复用
- Ink 组件：`cli/ink/components/` — 修小 bug 后复用
- 统一命令系统：`command/` — 直接复用
- Zod→JSON Schema：`tool/tool.ts` 中的 `zodToJsonSchema` — 直接复用

### 删除清单（已全部完成 ✅）

- ~~`src/cli/repl.ts`（943 行传统 REPL）~~ → Phase C 已删除
- ~~`provider/types.ts` 中 3 套独立映射表~~ → 已合并到 `config/models.ts`
- ~~`provider/types.ts` 中 DEFAULT_MODEL/FAST_MODEL~~ → FAST_MODEL 已删，DEFAULT_MODEL 仍被 loop.ts/recovery.ts 引用（非死代码）
- ~~冗余子代理模式（parallel_agents, multi_agent, run_workflow, dispatch_agent）~~ → v0.6.0 已删除，净减 1281 行，保留 ask_llm/run_agent/fork_agent 3 核心原语

## 核心原则

1. **显式触发** - 只有用户主动调用时 AI 才工作，无后台进程
2. **人工确认** - AI 的修改必须经用户确认才应用
3. **可控可维护** - 自己掌控代码，长期可迭代

## 版本更新日志

### v0.8.0（2026-04-01）
- **feat**: Prompt Cache 完善——TokenUsage 扩展 cache 统计字段，anthropic.ts 提取 cache_creation/cache_read tokens，消息层+工具层 cache_control 断点
- **feat**: Cron 定时任务——CronCreate/CronDelete/CronList 3 个工具，内置 cron 解析器，setInterval 驱动，支持 recurring/one-shot
- **feat**: MCP 资源工具——ListMcpResourcesTool/ReadMcpResourceTool，runner.ts 集成 MCP 客户端池初始化
- **refactor**: 子代理精简 7→3 核心原语（-1337行），删除 parallel_agents/multi_agent/dispatch_agent/run_workflow
- **工具总数**: 47 个（基础 7 + 交互 2 + 管理 7 + CC 对齐 6 + MCP 2 + Cron 3 + 子代理 4 + 团队 16）

### v0.6.0（2026-04-01）
- **feat**: 追平 CC 工具集——新增 6 个工具（WebFetch/NotebookEdit/TaskOutput/TaskStop/EnterPlanMode/ExitPlanMode）
- **feat**: bash 后台执行——`run_in_background` 参数，spawn 进程注册到 BackgroundTask 注册表，配合 TaskOutput/TaskStop 管理
- **feat**: PlanMode 权限拦截——计划模式下 wrappedPermissionChecker 阻断 write/edit/append/bash/notebook_edit
- **feat**: 独立 memoryExtractor——分离记忆提取（MEMORY_EXTRACT_PROMPT）与摘要（COMPACT_SYSTEM_PROMPT），避免互相干扰
- **refactor**: 子代理精简——删除 parallel_agents/multi_agent/dispatch_agent/run_workflow（1281行），保留 ask_llm/run_agent/fork_agent 3 核心原语
- **fix**: Copilot review 4 项修复（compact.ts 独立提取器/cwd 路径/loop.ts 串行错误处理/registry.ts 泛型协变）

### v0.5.0（2026-04-01）
- **feat**: CC 源码改进 Phase D（系统提示词/工具并行/Reactive Compact/StreamingToolExecutor）
- 详见 memory/naughtagent-history.md

### v0.3.0（2026-03-31）
- **fix(致命)**: 子代理（run_agent/fork_agent/parallel_agents/dispatch_agent）无法使用 read/write/edit 等基础工具——createAgentLoop 未传 toolRegistry，fallback 到全局空实例。修复：RunAgentRuntime/ForkAgentRuntime 新增 toolRegistry 字段，runner.ts 传入
- **fix**: dispatch_agent 的 callExpert 未传 cwd——子代理在 daemon 模式下工作目录错误（fallback 到 process.cwd()）。修复：callExpert 接受 cwd 参数
- **test**: compact.ts 14 个单元测试（microCompact/estimateTokens/autoCompact/shouldAutoCompact）

### v0.2.9（2026-03-31）
- **fix(致命)**: read 缓存警告适得其反——LLM 看到警告后绕道 bash 的 Get-Content/ReadAllText 读文件（v0.2.8 回归）。修复：缓存改为静默返回内容（不加任何前缀）
- **feat**: bash 工具拦截文件读取命令——检测 Get-Content/cat/type/ReadAllText 等纯读文件命令，返回错误提示"请用 read 工具"，堵死绕道路径

### v0.2.8（2026-03-31）
- **feat**: read 工具 session 级缓存——第 2 次读同文件返回警告+完整内容，第 3+ 次返回截断摘要，检测 mtime 变化自动刷新（read.ts + clearReadCache）
- **feat**: autoCompact 保留文件内容——压缩时提取最近 3 个 read 结果的完整内容，嵌入 compact 摘要，避免 LLM 因"信息饥饿"重读文件（compact.ts extractRecentFileContents）

### v0.2.7（2026-03-31）
- **fix(致命)**: 无限循环读取修复——loop 层重复工具调用检测（同一工具+参数 >3 次注入警告），autoCompact 摘要增强（列出已读文件+禁止重读指令）

### v0.2.6（2026-03-31）
- **feat**: 系统提示词全面增强——工具使用规则、执行纪律、安全指引、Git 规范、错误恢复、Windows 环境感知（prompt-manager.ts + prompt.ts）

### v0.2.5（2026-03-31）
- **fix(致命)**: Ink TUI 文本输出截断——text_delta 未累积，每个 delta 覆盖前文，LLM 输出 90%+ 丢失（App.tsx accumulatedTextRef）

### v0.2.4（2026-03-31）
- **fix**: `/model`、`/mode`、`/refresh` 命令输出叠加 bug（addMessage + return output 双重输出）
- **fix**: 版本号完全动态化（cli.ts, repl.ts, WelcomeView.tsx 改用 `VERSION` 从 package.json 读取）

### v0.2.3（2026-03-31）
- **refactor**: 常量统一化完成（token.ts, token-compressor.ts, optimization-config.ts, compact.ts → config/constants.ts）
- **feat**: Phase B/C/D 详细实施计划已生成（`docs/superpowers/plans/`）

### v0.2.2（2026-03-30）
- **refactor**: 常量统一化（25 处硬编码→config/constants.ts），涉及 13 文件
- **feat**: debug 日志埋点（dispatch/provider/ask-llm/loop）
- **feat**: logger.ts INFO 默认开启（`QUIET=1` 关闭）

### v0.2.1（2026-03-30）
- **fix**: maxSteps 100→20000（避免 Agent 被中断）
- **feat**: 系统提示词增加工具选择规则 + 输出效率指引（借鉴 Claude Code）
- **fix**: dispatch_agent 工具描述加 "Do NOT use this when" 反向指引

### v0.2.0（2026-03-30）
- **fix**: text 输出叠加→onText→onTextDelta 全链路改造（10 文件）
- **fix**: daemon 权限弹窗过多→onPermissionRequest 移到 checkPermission 之后
- **fix**: dispatch_agent 超时→TOOL_TIMEOUTS 加 dispatch_agent:300s
- **fix**: tool_use/tool_result 400 错误→repairOrphanToolUse() 自动补缺失 tool_result
- **feat**: safe-path.ts 单元测试 12 用例

### v0.1.0（Phase A 完成）
- 核心引擎重建：Loop 782→220 行，Runner 535→300 行
- 修复 7 个致命/严重 bug（详见 Phase A 记录）
- config/ 统一配置模块
- ToolRegistry class 重写
- 教程对照审核 s01-s12 全部完成

