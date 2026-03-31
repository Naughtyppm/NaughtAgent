# 教程 ↔ NaughtAgent 代码映射

> 教程 = Obsidian 智能体教程 12 章（基于 learn-claude-code）
> 代码 = `packages/agent/src/` 下的实际实现

## 一、核心概念映射

### s01: Agent Loop（智能体循环）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| `agent_loop()` while-True 循环 | `createAgentLoop().run()` async generator | `agent/loop.ts` | ✅ 已重写（782→220 行） |
| `messages: list` 消息累积 | `session.messages` 数组 | `session/session.ts` | ✅ |
| `stop_reason == "tool_use"` 继续循环 | `stopReason === "tool_use"` → 继续 | `agent/loop.ts:L78-82` | ✅ Phase A 修复 |
| `stop_reason == "end_turn"` 退出 | `stopReason !== "tool_use"` → break | `agent/loop.ts:L82` | ✅ |
| System Prompt（身份+上下文+行为） | `definition.systemPrompt` | `agent/agent.ts:L51` | ✅ |
| User/Assistant 消息交替 | Session 自动管理角色 | `session/session.ts` | ✅ |
| `response.content` 内容块列表 | `StreamEvent` 逐块 yield | `provider/types.ts:L58-64` | ✅ |

**教程核心原则**：Loop 是不变量，所有能力通过工具和上下文注入。

**NaughtAgent 遵守程度**：✅ Phase A 后已对齐。Loop 只做 LLM→Tool→LLM，不耦合业务逻辑。

---

### s02: Tool Use（工具使用）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| `TOOL_HANDLERS` Dispatch Map | `ToolRegistry` 类 | `tool/registry.ts` | ✅ 已重写为 class |
| `tool_name → handler_lambda` 映射 | `registry.execute(id, params, ctx)` | `tool/registry.ts` | ✅ |
| `safe_path()` 路径沙箱 | `PermissionChecker` 拦截 | `cli/runner.ts:L125-146` | ✅ Phase A 修复 |
| 四工具集（bash/read/write/edit） | 七工具集 + 子代理工具 | `tool/*.ts` | ✅ 超集 |
| 添加工具 = 加一行字典 | `ToolRegistry.register(tool)` | `tool/registry.ts` | ✅ |

**教程核心原则**：Dispatch Map 模式，添加工具不碰循环代码。

**NaughtAgent 遵守程度**：✅ ToolRegistry 实现了同等能力，且更强（支持 Zod schema 验证）。

---

### s04: Subagent（子智能体）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| 独立 `sub_messages = []` | 独立 Session + 独立 loop | `tool/subagent/` | ✅ |
| `PARENT_TOOLS / CHILD_TOOLS` | `definition.tools` 按 AgentType 分配 | `agent/agent.ts:L77-121` | ✅ |
| 单层委派（子不能派生孙） | `mode: "subagent"` 限制 | `agent/agent.ts:L23` | ✅ |
| 摘要返回（只取 TextBlock） | `ask_llm` / `run_agent` 返回文本 | `tool/subagent/register.ts` | ✅ |
| Max Turns 安全上限 | `maxSteps` + `depth` 参数 | `agent/loop.ts` + `agent/agent.ts` | ✅ |

**教程核心原则**：上下文隔离，父负责拆解协调，子负责专注执行。

**NaughtAgent 遵守程度**：✅ 完整实现，且支持更多模式（ask_llm、run_agent、fork_agent、parallel_agents、multi_agent、dispatch_agent）。

**⚠️ 注意**：教程是 Python 单文件实现，NaughtAgent 的子代理系统有 ~6 种工具变体，这是超出教程范围的扩展。

---

### s05: Skill Loading（技能加载）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| `SkillLoader` 类 | **尚未实现** | - | ❌ Phase B 待做 |
| `skills/{name}/SKILL.md` 约定 | `.naughty/agents/*.md` 自定义 Agent | `subtask/registry.ts` | ⚠️ 部分 |
| 两层注入（菜单 + 按需加载） | **尚未实现** | - | ❌ Phase B 待做 |
| `load_skill` 工具 | **尚未实现** | - | ❌ Phase B 待做 |

**教程核心原则**：Layer 1 在 system prompt 放菜单（低开销），Layer 2 通过 tool_result 按需加载。

**NaughtAgent 遵守程度**：❌ 这是最大的缺口。目前没有 SkillLoader，知识全部硬编码在 system prompt 中。Phase B 将实现。

---

### s06: Context Compact（上下文压缩）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| `micro_compact` (Layer 1) | `microCompact()` | `agent/compact.ts:L25-65` | ✅ |
| `auto_compact` (Layer 2) | `autoCompact()` | `agent/compact.ts:L85-180` | ✅ |
| `compact` 工具 (Layer 3) | 未注册为 LLM 工具 | - | ⚠️ 缺少 |
| `KEEP_RECENT = 3` | `KEEP_RECENT_RESULTS = 3` | `agent/compact.ts:L19` | ✅ |
| `estimate_tokens` | `estimateTokens()` | `agent/compact.ts:L67-83` | ✅ |
| transcript 磁盘备份 | **尚未实现** | - | ❌ |
| 压缩后 2 条消息 | `messages = [user摘要, assistant确认]` | `agent/compact.ts:L165-180` | ✅ |
| 管道集成到循环 | `onBeforeStep` 回调注入 | `cli/runner.ts:L265-277` | ✅ Phase A 修复 |

**教程核心原则**：三层渐进压缩（微压缩→自动压缩→手动压缩）+ transcript 备份。

**NaughtAgent 遵守程度**：⚠️ Layer 1/2 已实现且已接入 Loop。Layer 3（compact 工具让 LLM 主动触发）和 transcript 备份尚缺。

---

### s07: Task System（持久化依赖图）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| `TaskManager` 类 | 分布在多个文件 | `tool/subagent/task-*.ts` | ✅ |
| `.tasks/task_{id}.json` 持久化 | `.tasks/` 目录 | `tool/subagent/task-store.ts` | ✅ |
| `blockedBy / blocks` 依赖图 | 任务依赖关系 | 子代理任务系统 | ✅ |
| 三态状态机 `blocked→pending→done` | 任务状态管理 | 子代理任务系统 | ✅ |

**NaughtAgent 遵守程度**：✅ 已实现持久化任务系统。

---

### s10: Team Protocols（团队协议）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| `shutdown_request/response` | `request_shutdown` / `respond_shutdown` 工具 | `agent/agent.ts:L91` | ✅ 已注册 |
| `plan_approval` 审批 | `submit_plan` / `review_plan` 工具 | `agent/agent.ts:L91` | ✅ 已注册 |
| `request_id` 关联 | 协议实现中 | 子代理系统 | ✅ |

---

### s11: Autonomous Agents（自治智能体）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| `scan_unclaimed_tasks()` | `scan_tasks` 工具 | `agent/agent.ts:L93` | ✅ 已注册 |
| `claim_task()` 原子认领 | `claim_task` 工具 | `agent/agent.ts:L93` | ✅ 已注册 |
| `complete_task()` | `complete_task` 工具 | `agent/agent.ts:L93` | ✅ 已注册 |
| WORK/IDLE/SHUTDOWN 状态机 | 隐式在工具逻辑中 | 子代理系统 | ⚠️ 不够显式 |

---

### s12: Worktree Isolation（目录隔离）

| 教程概念 | NaughtAgent 对应 | 文件位置 | 状态 |
|---------|-----------------|---------|------|
| `WorktreeManager` | `worktree_*` 系列工具 | `agent/agent.ts:L95` | ✅ 已注册 |
| Control Plane / Execution Plane | `.tasks/` + `.worktrees/` | 子代理系统 | ✅ |
| `EventBus` 事件日志 | `worktree_events` 工具 | `agent/agent.ts:L95` | ✅ |

---

## 二、架构层次对照

### 教程的渐进式架构

```
s01-s02: Loop + Tools          → 基础执行引擎
s03-s04: Todo + Subagent       → 分治与规划
s05-s06: Skill + Compact       → 知识管理与记忆
s07-s08: Task + Background     → 持久化与并发
s09-s12: Team + Protocol       → 多 Agent 协作
```

### NaughtAgent 的实际架构

```
L1 核心引擎:
  agent/loop.ts        → 对应 s01 Agent Loop（✅ 已重写对齐）
  tool/registry.ts     → 对应 s02 Dispatch Map（✅ 已重写为 class）
  agent/compact.ts     → 对应 s06 Context Compact（✅ 2/3 层已实现）
  provider/            → 教程用 Anthropic SDK 直接调用，NaughtAgent 抽象为 Provider 层

L2 Session/消息:
  session/session.ts   → 教程的 messages 列表（✅）
  session/message.ts   → ContentBlock 类型定义（✅）
  agent/message-converter.ts → Session→Provider 格式转换（✅ Phase A 新建）

L3 安全/权限:
  permission/          → 对应 s02 safe_path + s04 工具分层（✅ Phase A 修复为真正拦截）
  cli/runner.ts        → 对应教程的 harness 外壳（✅ 已重写）

L4 扩展:
  tool/subagent/       → 对应 s04 Subagent + s09-s12 团队协作
  subtask/             → 对应 s07-s08 Task + Background

L5 UI:
  cli/                 → 对应教程的终端 REPL
  cli/ink/             → React Ink 现代 TUI（教程没有）
```

---

## 三、关键术语对照

| 教程术语 | NaughtAgent 术语 | 说明 |
|---------|-----------------|------|
| `agent_loop()` | `createAgentLoop()` | 函数式 → 工厂函数 |
| `TOOL_HANDLERS` | `ToolRegistry` | 字典 → 类实例 |
| `safe_path()` | `PermissionChecker` | 路径检查 → 通用权限拦截 |
| `messages` | `session.messages` | 裸列表 → Session 对象封装 |
| `stop_reason` | `stopReason` / `StopReason` | snake_case → camelCase |
| `tool_result` | `ToolResultBlock` → `ToolResultContent` | Session 格式 → Provider 格式 |
| `ContentBlock` | `ContentBlock`（Session） / `MessageContent`（Provider） | 同名但两层分离 |
| `SkillLoader` | **未实现** | Phase B |
| `micro_compact` | `microCompact()` | ✅ 同名 |
| `auto_compact` | `autoCompact()` | ✅ 同名 |
| `TaskManager` | 分布在 `tool/subagent/task-*.ts` | 非单类实现 |
| `WorktreeManager` | `worktree_*` 工具集 | 工具化而非类化 |
| Harness（线束） | `cli/runner.ts` | 包裹 Loop 的外壳 |

---

## 四、Phase A 修复了哪些教程偏差

| # | 偏差 | 教程要求 | 修复前 | 修复后 |
|---|------|---------|--------|-------|
| 1 | Loop 职责膨胀 | Loop 只做 LLM→Tool→LLM | 782 行，耦合 Session/权限/监控 | 220 行，纯循环 |
| 2 | 权限形同虚设 | 工具执行前拦截 | 只是事后通知 | `permissionChecker` 真正拦截 |
| 3 | stop_reason 丢失 | 完整传递链 | 完全没处理 | Provider→Loop→Session→Event 全链路 |
| 4 | text 累积输出 | 增量 delta | 每次发送完整文本 | 新增 `text_delta` 事件 |
| 5 | ToolRegistry 单例 | 可实例化 | namespace 全局单例 | class + ToolRegistryCompat 兼容层 |
| 6 | compact 断连 | 集成到循环 | compact 函数存在但没接入 | `onBeforeStep` 回调注入 |
| 7 | OpenAI .args | 正确取参数 | `(part as any).input` 错误 | 联合类型正确分支 |

---

## 五、尚未实现的教程能力

| 章节 | 能力 | 优先级 | 计划阶段 |
|------|------|--------|---------|
| s05 | SkillLoader + 两层注入 | P0 | Phase B |
| s06 | compact 工具（LLM 主动触发） | P1 | Phase B |
| s06 | transcript 磁盘备份 | P2 | 未规划 |
| s08 | Background Tasks 后台执行 | P1 | 已有雏形 |
| s11 | 显式 WORK/IDLE/SHUTDOWN 状态机 | P2 | 未规划 |

---

## 六、NaughtAgent 超出教程的扩展

教程是教学项目（每章 ~200-600 行 Python），NaughtAgent 是商业级项目。以下是超出教程的部分：

| 扩展 | 说明 |
|------|------|
| Provider 抽象层 | 支持 Anthropic / OpenAI / Kiro / Auto 四种后端 |
| 模型映射 | Anthropic / Copilot / Kiro 三套模型名互转 |
| Extended Thinking | thinking/thinking_end 事件流 |
| React Ink TUI | 现代终端 UI（教程只有 readline） |
| VS Code 扩展 | IDE 集成（教程没有） |
| 6+ 种子代理模式 | ask_llm / run_agent / fork_agent / parallel / multi / dispatch |
| Justfile 集成 | 跨平台命令执行 |
| Daemon 模式 | 后台服务 + IPC 通信 |
