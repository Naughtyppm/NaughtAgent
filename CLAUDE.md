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

- Provider 抽象层（Anthropic/OpenAI/Auto 三后端）
- 模型映射（Anthropic/Copilot 两套模型名互转）
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
6. **每次改动必须推版本号**：修改代码后必须 bump `packages/agent/package.json` 的 version（patch +1），同步更新 CLAUDE.md changelog。版本号是区分构建产物的唯一可靠手段，不推版本会导致新旧代码混淆、bug 无法定位

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

## 版本管理规则（强制）

**每次修改代码后必须执行：**
1. **推版本号** — 修改 `packages/agent/package.json` 的 version（patch +1）
2. **Build** — `cd packages/agent && npx tsup`
3. **验证** — `npx tsc --noEmit` 零错误
4. **更新 changelog** — 本文件 `版本更新日志` 章节添加新版本

**不推版本 = 用户测试的仍然是旧代码。这是反复出 bug 的根因。**

## 版本更新日志

### v0.9.11（2026-04-04）— CLI 记忆命令增强

- **feat**: plain-text REPL 新增 `/memory` 命令——支持 `show`/`add`/`edit`，可直接查看与追加 `.naughty/memory.md`
- **feat**: 启动时显示记忆加载状态——存在时提示已加载行数，不存在时提示可用 `/memory add`
- **docs**: `/help` 增加 `/memory` 命令说明，提升持久记忆能力可发现性

### v0.9.9（2026-04-03）— CC Ink Phase 2 适配层

- **feat**: `cc-ink/index.js` + `cc-ink/index.d.ts` 适配层——re-export render/Box/Text/Newline/Spacer/useInput/useApp/useStdin
- **refactor**: 14 个 ink/ 组件的 `from 'ink'` 全部迁移到 `from '../cc-ink/index.js'`——运行时不再依赖 npm ink@5
- **refactor**: `startInkRepl` 改为 async（cc-ink 的 render 是 async）
- **fix**: 补充 `cc-ink/ink/devtools.js` 和 `cc-ink/ink/global.d.ts` stub（esbuild 缺失文件）
- **fix**: tsup `noExternal` 内联 `react-reconciler`/`auto-bind`/`signal-exit`/`usehooks-ts`——CJS named export 在 ESM 中运行时报错 `NoEventPriority not found`
- **config**: tsconfig exclude 扩大为 `cc-ink/**`（整个目录），类型由手写 `.d.ts` 提供

### v0.9.8（2026-04-03）— /model 命令增强

- **feat**: `/model` 无参时显示所有可用模型列表——从 MODEL_REGISTRY 动态读取，显示 shortName、displayName、tier 图标、thinking 支持、当前选中标记
- **feat**: `/model` 支持任意格式输入（`opus-4.6`、`claude-opus-4.6`、`claude-opus-4-6-20260206`）——底层 `resolveModelId` 已有模糊匹配

### v0.9.7（2026-04-03）— 模型识别修复 + 日志优化

- **feat**: 系统提示词注入当前模型名——LLM 现在知道自己是 opus/sonnet/haiku（`prompt.ts` + `loop.ts`）
- **fix**: `Session started` 日志从 info 降为 debug——终端不再显示无意义日志（`runner.ts`）

### v0.9.6（2026-04-03）— CC Ink 迁移 Phase 1

- **feat**: CC 自定义 Ink fork 搬入 `src/cli/cc-ink/`（96 文件 + yoga 布局引擎）
- **feat**: React Compiler `_c()` shim（`compiler-runtime.ts`）
- **feat**: 11 个 stub 文件（debug, log, envUtils, intl, earlyInput, fullscreen, semver, execFileNoThrow, env, sliceAnsi, state）
- **fix**: 8 个绝对路径 import 修正 + 12 个 compiler-runtime import 重写
- **deps**: 新增 19 个 npm 依赖（react-reconciler@0.29 配 React 18）
- **config**: tsconfig.json exclude 加 `src/cli/cc-ink/ink/**`
- **注意**: cc-ink 尚未接入 CLI，是 Phase 2/3 的前置工作

### v0.9.5（2026-04-03）— Kiro 清理 + 模型切换修复

- **refactor**: 删除 `provider/kiro.ts`（944行）及所有 Kiro 引用——移除 6 个文件中的 Kiro 类型、索引、case 分支、环境变量
- **fix**: `/model` 命令切换后 renderer header 显示旧模型名——添加 `renderer.setModel()` 方法
- **fix**: `/model` 无参输出缺少切换用法提示——补充 `/model <name>` 示例

### v0.9.4（2026-04-03）— Thinking 400 错误修复 + UI 美化

- **fix**: 多轮对话 API 400 错误（"thinking enabled but assistant message doesn't start with thinking block"）——在 `loop.ts` 保存 assistant 消息时保留 thinking 块和 signature
- **fix**: thinking 竖线 `│` 在流式输出中断裂——竖线前缀只在行首输出
- **feat**: 欢迎界面猫咪 ASCII art + 版本 + 模型高亮
- **feat**: AI 回复前显示 `═══ claude-sonnet ═══` 身份标识
- **feat**: 思考用洋红边框 `╭─💭 thinking─╮`
- **feat**: `/thinking on|off` 和 `/cost` 命令
- **fix**: 默认启用 thinking（对齐 CC）

### v0.9.3（2026-04-03）— CLI Plain-Text 模式

**新增纯文本流式 CLI，用 readline + ANSI 直写 stdout 替代 Ink React 渲染树：**

- **feat**: `cli/plain-text/` 新建 8 个模块（types/constants/formatter/renderer/fold-manager/scroll-buffer/interaction/permission-dialog/index）
- **feat**: `StreamRenderer` 流式渲染器——O(1) 直写 stdout，无累积无重绘，对标 CC 文本流体验
- **feat**: `FoldManager` 折叠管理——工具输出 >5 行自动折叠为一行摘要，`#N` 命令展开
- **feat**: `ScrollBuffer` 虚拟滚动——大输出分页显示（50 行/页）
- **feat**: `PlainTextInput` 交互层——readline 输入、/help /clear /folds /model /agent /exit 命令
- **feat**: `showPermissionDialog` 权限对话框——Box 绘制，y/a/n 快捷键
- **feat**: `cli.ts` 新增 `--ui=plain-text|ink` 参数——默认 plain-text，`NAUGHTY_UI_MODE` 环境变量覆盖
- **refactor**: `handleChat` 根据 `--ui` 参数分发到 plain-text 或 ink REPL

### v0.9.2（2026-04-03）— 项目目录结构统一

**将所有散落的运行时目录统一到 `.naughty/` 下，对齐 CC `.claude/` 的做法：**

- **refactor**: `.naught/` → `.naughty/` 命名统一——修复 `.naught` vs `.naughty` 命名不一致（10 个源文件），消除笔误导致的双目录问题
- **refactor**: `.tasks/` → `.naughty/tasks/`——Todo 工具存储路径迁入统一目录（`interaction/todo.ts`）
- **refactor**: `.team/` → `.naughty/teams/`——全局任务板、inbox、worktree 元数据迁入统一目录（`subtask/autonomous.ts` + `worktree.ts`）
- **refactor**: `.worktrees/` → `.naughty/worktrees/`——Git worktree 执行目录迁入统一目录
- **fix**: `autonomous.ts` / `worktree.ts` 路径硬编码——模块级 `process.cwd()` 常量改为函数延迟求值，修复 Daemon 模式下路径错误
- **feat**: `config/constants.ts` 新增 `NAUGHTY_PROJECT_DIR = ".naughty"` 统一常量
- **chore**: `.gitignore` 添加 `.naughty/` 等运行时目录忽略规则
- **chore**: 清理项目根目录旧运行时目录（`.tasks/`、`.team/`）

**统一后的 `.naughty/` 目录结构：**
```
{cwd}/.naughty/
├── memory.md          # 持久记忆
├── logs/              # 日志
├── transcripts/       # 对话存档
├── skills/            # 项目级 Skills
├── agents/            # 自定义 Agent 定义
├── sessions/          # 会话数据
├── mcp.json           # MCP 配置
├── config.json        # 优化配置
├── cache/             # 项目缓存
├── rules/             # 项目规则
├── tasks/             # Todo 任务数据
├── teams/             # 全局任务板+inbox+worktree 元数据
└── worktrees/         # Git worktree 执行目录
```

### v0.9.1（2026-04-02）— 审计修复批次

**基于 opus 深度审计发现的 P0/P1/P2 问题全部修复：**

- **fix(P0)**: 熔断器重置后死循环——circuit breaker 重置 `globalDuplicateBlockCount` 时未同步清零 `toolCallCounts`，导致 breaker→reset→re-trigger→breaker 无限循环。现在两个计数器同步清零
- **fix(P0)**: read cache 分段读取 bug——cache 存储的是格式化后的 output（含 offset/limit），`read(file, offset=100)` 命中缓存时返回 `offset=0` 的内容。改为缓存 `allLines` 数组，按请求的 offset/limit 实时截取
- **fix(P1)**: grep 重复检测被 pattern 变化绕过——loop.ts 中 grep 的 argsKey 用完整 JSON，LLM 换 pattern 即绕过。改为按 `path` 归类（与 read 按 `filePath` 归类对齐）
- **fix(P1)**: grep catch-all 模式扩展——覆盖 `.+`、`\S`、`\w`、`[^\n]+`、`(?s).` 等高匹配率模式，堵死更多绕道
- **fix(P1)**: DEFAULT_MAX_STEPS 20000→200——对齐 CC（约 200 步），靠 compact 续命而非无限循环
- **fix(P1)**: 全局 Map 跨 session 泄漏——readCache/accessMap/autoCompactFailures 三个模块级 Map 在 Daemon 模式下跨 session 泄漏。runner.ts `resetSession()` 现在统一清理这三个缓存
- **fix(P1)**: file-access-budget 路径归一化——Windows NTFS 大小写不敏感，`D:\Dir\File` 和 `d:\dir\file` 创建不同 key。加入 `normalizePath()` 统一为 `path.resolve().toLowerCase()`
- **fix(P2)**: compact transcript 写入路径——从 `process.cwd()/.transcripts/` 改为 `options.cwd/.naughty/transcripts/`，Daemon 模式下正确写入项目目录
- **fix(P2)**: ToolRegistryCompat 全局实例——loop.ts 和 subagent/register.ts 不再 fallback 到全局 ToolRegistryCompat，改为必须传入 registry 实例
- **fix(P2)**: memory dedup 误判——`existingMemory.includes(line)` substring match 改为 Set 精确行匹配
- **feat**: 系统提示词"文件读取纪律"——BASE_PROMPT 新增 FRC 段，告诉 LLM 不要重复读取已在上下文中的文件
- **feat**: compact.ts 导出 `clearAutoCompactFailures()`，runner 在 session 结束时调用
- **feat**: tool/index.ts 导出 file-access-budget 全部 API

### v0.9.0（2026-04-02）— 反无限读取三管齐下
- **feat**: 全局文件访问预算（`file-access-budget.ts`）——跨 read/grep 统一计量文件访问次数，同一文件超 5 次直接返回 "budget exhausted" stub，堵死所有绕道读取路径
- **feat**: POST_COMPACT 文件恢复注入——compact 前从 read cache 取快照，compact 后将最近 5 个文件（每个最多 250 行）注入 summary，对齐 CC 的 `createPostCompactFileAttachments`，减少 LLM 重读需求
- **feat**: 循环检测持续化——runner 循环模式检测从"只触发一次"改为"每 20 步可再触发"，消除 compact 后的不设防窗口
- **feat**: compact 后同时重置 read cache 和文件访问预算
- **refactor**: `extractRecentFileContents` 改用 `getReadCacheSnapshot`（从 read cache 而非 session 消息提取，更可靠），删除旧的 session 扫描实现

### v0.8.8（2026-04-02）
- **fix**: grep 滥用检测——`grep "." filepath` 等 catch-all pattern 对单文件时返回错误，堵死 LLM 用 grep 绕过 read cache 读全文的路径

### v0.8.7（2026-04-02）
- **fix**: bash 拦截分号复合命令——`[Console]::...; Get-Content "file"` 现在被正确拦截（之前分号导致判定为复合命令而跳过）
- **fix**: read cache 全局化——cache key 不含 sessionID，子代理和主 Agent 共享缓存，防止 LLM 通过开子代理绕过去重
- **fix**: microCompact 保留量不足——`KEEP_RECENT_RESULTS` 3→10（3 太少，LLM 并行调用 3 个工具就占满，导致 `[Previous: used read]` 内容丢失）
- **feat**: 文件日志系统——`Logger.enableFileLog(dir)` 全局静态方法，所有模块日志自动写入 `.naughty/logs/{date}-{pid}.log`，异步批量写入（50ms/20条）
- **fix**: tsconfig.json 删除未使用的 `baseUrl`/`paths`（消除 TS 5.9 deprecation 警告）

### v0.8.6（2026-04-02）
- **fix**: compact 后 assistant prefill 导致 Copilot API 400 错误——删除 compact.ts 中的 assistant prefill 消息，改为纯 user 消息
- **fix**: compact 后 read cache 未清空——LLM compact 后真需要重读但 cache count 未重置导致只返回摘要。改为 compact 后清空 read cache（对齐 CC `readFileState.clear()`）
- **improve**: compact 保留文件量对齐 CC——`MAX_PRESERVED_FILES` 3→5，`MAX_PRESERVED_LINES` 150→250（≈5000 token/文件，对齐 CC `POST_COMPACT_MAX_FILES_TO_RESTORE=5`）
- **improve**: 所有 assistant prefill 现在仅限 `provider.type === 'anthropic'` 时注入

### v0.8.5（2026-04-02）
- **fix(致命)**: 无限读取循环修复——四层防护机制，根因是 HARD_BLOCK_THRESHOLD 定义未使用 + WARNING 仍返回完整内容导致 LLM "刷新记忆"无视警告
  - **Layer 1 (read.ts)**: 缓存命中 ≥3 次返回文件头 10 行摘要，不返回完整内容
  - **Layer 2 (loop.ts)**: 硬阻断——>10 次同参数直接阻断不返回内容，标 isError
  - **Layer 3 (runner.ts)**: 循环模式检测——最近 20 条消息中 read/glob/grep 占比>80% 时强制触发 compact
  - **Layer 4 (loop.ts)**: 全局熔断器——累计 5 次硬阻断注入系统指令强制行动
- **fix**: autoCompact 连续失败熔断——对齐 CC circuit breaker，连续失败 3 次后永久停止该 session 的 autoCompact

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

