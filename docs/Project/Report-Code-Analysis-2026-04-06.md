# 📊 NaughtAgent 三维度深度分析报告

> 生成时间：2026-04-06
> 分析方式：3 探索型 Agent 并行 + 人工补充
> 分析范围：`packages/agent/src/tool/` · `packages/agent/src/agent/` · `packages/agent/src/cli/`

---

## 目录

- [1. src/tool/ — 错误处理模式分析](#1-srctool--错误处理模式分析)
- [2. src/agent/ — 核心循环流程分析](#2-srcagent--核心循环流程分析)
- [3. src/cli/ — 命令行入口设计分析](#3-srccli--命令行入口设计分析)
- [4. 综合交叉观察](#4-综合交叉观察)

---

## 1. src/tool/ — 错误处理模式分析

### 1.1 发现四种错误处理模式

| 模式 | 描述 | 使用的工具 |
|------|------|-----------|
| **A: `throw new Error()`** | 直接抛异常，由 Tool.define 统一 catch | read, edit, notebook-edit, cron(解析层) |
| **B: `return { isError: true, output }` 结构体** | 最规范的模式，调用方可程序判断 | bash, grep, background-task, cron(执行层), mcp-resource, read(外层) |
| **C: `return { output: "❌ ERROR: ..." }` 无 isError** | ⚠️ 危险：调用方无法区分成功/失败 | append, compact, memory, create-skill, load-skill |
| **D: try/catch → 吞异常返回友好文本** | 对外表现为成功，但内容含错误描述 | web-fetch, vscode-reload, webview-snapshot, discovery |

### 1.2 统计分布

```
模式 A (throw)       : ~8 个工具   ← 由 tool.ts:540 统一 catch 兜底
模式 B (isError)     : ~6 个工具   ← 最规范
模式 C (纯文本错误)  : ~5 个工具   ← ⚠️ 最危险
模式 D (吞异常)      : ~4 个工具   ← 对 LLM 不透明
```

### 1.3 具体代码位置

#### 模式 A — throw new Error

| 文件 | 行号 | 抛出内容 |
|------|------|---------|
| `read.ts` | :99, :105, :110 | File not found / Is directory / Binary file |
| `edit.ts` | :36, :44, :52, :58 | Same strings / Not found / oldString not found / Multiple matches |
| `notebook-edit.ts` | :124-242 | 8 处 throw（文件/单元格/模式校验） |
| `cron.ts` | :139, :171, :189 | 无效步进值 / 无效字段 / 解析失败 |

#### 模式 B — return { isError: true }

| 文件 | 行号 | 场景 |
|------|------|------|
| `bash.ts` | :100 | 命令执行超时 |
| `grep.ts` | :183, :252, :284 | 路径不存在 / 搜索错误 |
| `background-task.ts` | :127, :215, :252 | 任务未找到 / 已完成 / 超时 |
| `cron.ts` | :315, :375 | 执行层错误（外层 catch） |
| `mcp-resource.ts` | :44-195 | 6 处（连接/权限/解析错误） |
| `read.ts` | :122 | 外层包装返回 |

#### 模式 C — 纯文本错误（⚠️ 无 isError 标记）

| 文件 | 行号 | 返回内容 |
|------|------|---------|
| `append.ts` | :44 | `"❌ ERROR: Content too large..."` |
| `compact.ts` | :39 | `"Error: Compact not available..."` |
| `memory.ts` | :60 | `"Error: content is required..."` |
| `create-skill.ts` | :64 | `"Error: Knowledge skill system not initialized."` |
| `load-skill.ts` | :44 | `"Error: Knowledge skill system not initialized."` |

#### 模式 D — 吞异常

| 文件 | 行号 | 处理方式 |
|------|------|---------|
| `web-fetch.ts` | :165, :197, :256 | catch → 返回 fetch 失败描述文本 |
| `vscode-reload.ts` | :47, :64 | catch → 返回构建失败信息 |
| `webview-snapshot.ts` | :204 | catch → 返回快照失败描述 |
| `discovery.ts` | :152, :159, :255 | catch → 静默跳过错误项 |

### 1.4 Tool.define 统一兜底机制

`tool.ts:540` 提供了统一的 catch 处理：
```typescript
} catch (error) {
  return { isError: true, output: formatError(error) }
}
```

这意味着**模式 A 最终也被转为模式 B 通道**，是安全的。真正的问题在模式 C 和 D。

### 1.5 一致性评估与改进建议

| 评分项 | 当前状态 | 评分 |
|--------|---------|------|
| 框架层统一性 | Tool.define 兜底完善 | ✅ 8/10 |
| 工具层一致性 | 四种模式并存 | ⚠️ 4/10 |
| 错误信息质量 | 中英文混用，格式不统一 | ⚠️ 5/10 |

**推荐方案**：统一为"内部 throw + Tool.define 兜底转 isError"模式：
1. 模式 C 的 5 个工具：改为 `throw new Error(...)` 
2. 模式 D 的 4 个工具：评估是否需要区分"可恢复错误"（当前吞异常可能是有意设计）
3. 保留 `cron.ts` 的做法作为范例：内部 throw + 外层 catch 返回 isError

---

## 2. src/agent/ — 核心循环流程分析

### 2.1 架构总览

```
┌──────────────────────────────────────────────────────────┐
│                  CLI / VSCode / Daemon                    │
├──────────────────────────────────────────────────────────┤
│                  Runner (runner.ts)                       │
│  ┌───────────────────────────────────────────────────┐   │
│  │  createRunner() — 工程编排层                       │   │
│  │  • 工具注册  • Skill 初始化  • MCP 初始化         │   │
│  │  • Provider 创建  • 权限  • Compact 管道注入      │   │
│  └────────────────────┬──────────────────────────────┘   │
│                       │ createAgentLoop()                 │
│  ┌────────────────────▼──────────────────────────────┐   │
│  │  Agent Loop (loop.ts) — 纯执行引擎                │   │
│  │  while(true) {                                     │   │
│  │    1. 前置钩子 (compact, nag)                      │   │
│  │    2. LLM 流式调用 → stream events                │   │
│  │    3. 工具执行 (并行安全 / 串行)                   │   │
│  │    4. 结果回写 Session → 回到 1                    │   │
│  │  }                                                 │   │
│  └──────────┬──────────┬──────────┬──────────────────┘   │
│             │          │          │                       │
│  ┌──────────▼──┐ ┌─────▼────┐ ┌──▼──────────┐           │
│  │ ToolRegistry│ │ Provider │ │   Session    │           │
│  │ (50+ tools) │ │(Anthropic│ │ (messages,   │           │
│  │             │ │  stream) │ │  usage)      │           │
│  └─────────────┘ └──────────┘ └─────────────┘           │
└──────────────────────────────────────────────────────────┘
```

### 2.2 主循环每一步的执行序列（loop.ts:100-611）

```
while(true) {
  ┌─── 守卫检查 ──────────────────────────────────┐
  │ ① maxSteps 检查 (≥20000步)                    │ → 持久模式: await_input; 非持久: break
  │ ② abort 信号检查                               │ → break
  │ ③ 循环熔断器 (≥5次硬阻断)                     │ → 注入 CIRCUIT BREAKER 消息
  │ ④ 后台通知注入 (backgroundNotifications)       │
  │ ⑤ onBeforeStep 回调 (compact 管道)            │ → microCompact + autoCompact
  └────────────────────────────────────────────────┘
          │
  ┌─── LLM 流式调用 ──────────────────────────────┐
  │ provider.stream({model, messages, system,      │
  │                   tools, abortSignal})          │
  │                                                │
  │ 事件处理:                                       │
  │   thinking → yield thinking event              │
  │   text → yield text_delta + text               │
  │   tool_call → 收集 + StreamingToolExec         │
  │   message_end → usage, stopReason              │
  │   error → throw                                │
  └──────────────┬─────────────────────────────────┘
                 │
  ┌─── 错误处理 (catch) ──────────────────────────┐
  │ 413 prompt_too_long → onReactiveCompact        │ → stepCount-- + continue
  │ 429/529/503 rate_limit → sleep + retry         │ → stepCount-- + continue
  │ 其他错误 → yield error + break                 │
  └────────────────────────────────────────────────┘
                 │
  ┌─── Token 统计 + 消息保存 ─────────────────────┐
  │ updateUsage(session, usage)                    │
  │ addMessage(session, "assistant", content)      │
  └──────────────┬─────────────────────────────────┘
                 │
  ┌─── max_tokens 恢复 ──────────────────────────-┐
  │ stop_reason == "max_tokens" && 无工具调用       │
  │ → 注入 "Resume where you left off"             │ → continue (最多3次)
  └──────────────┬─────────────────────────────────┘
                 │
  ┌─── 无工具调用 → 结束判断 ─────────────────────┐
  │ toolCalls.length === 0                         │
  │   持久模式: question 提醒 → await_input        │
  │   非持久模式: break                            │
  └──────────────┬─────────────────────────────────┘
                 │
  ┌─── 工具执行 ──────────────────────────────────┐
  │ 1) 分区: concurrentCalls / serialCalls         │
  │ 2) 并行安全工具 → Promise.all()               │
  │    (优先用 streaming 期间已启动的结果)          │
  │ 3) 串行非安全工具 → 顺序 execute              │
  │ 4) postProcess: 截断 + 重复检测 + 错误         │
  │    • 软警告 (>3次) → 硬阻断 (>10次)           │
  └──────────────┬─────────────────────────────────┘
                 │
  ┌─── 工具结果回写 ──────────────────────────────┐
  │ addMessage(session, "user", toolResults)       │
  │ writeOpCount 计数                              │
  └──────────────┬─────────────────────────────────┘
                 │
  ┌─── 连续错误恢复 ──────────────────────────────┐
  │ consecutiveErrors ≥ 3 → 注入恢复提示           │
  │ (不终止循环，让 LLM 自行修正)                  │
  └────────────────────────────────────────────────┘
  → 回到 while(true) 顶部
}

yield { type: "done", usage, stopReason, writeOpCount }
```

### 2.3 关键函数调用链

```
createRunner()                           // runner.ts:187
  ├── registerBuiltinTools(registry)     // 注册 50+ 工具
  ├── initSkills() / initKnowledgeSkills // Skill 系统
  ├── initializeSubAgentSystem()         // 子代理注册
  ├── initializeMcpSystem()              // MCP 连接
  ├── createProvider()                   // LLM Provider
  │
  └── runner.run(input, handlers)        // runner.ts:279
       ├── createSession()               // 会话创建
       ├── applyModelConfig()            // 模型+Thinking配置
       ├── buildPermissionChecker()      // 权限（当前全部自动批准）
       │
       ├── createAgentLoop({             // loop.ts:88
       │     definition, session, provider, toolRegistry,
       │     onBeforeStep, onReactiveCompact, waitForInput
       │   })
       │
       └── for await (event of loop.run(input))
              └── dispatchEvent(event, handlers)  // 分发给 UI 回调
```

### 2.4 状态机描述

```
                    ┌──────────┐
                    │  IDLE    │
                    └────┬─────┘
                         │ run(input)
                    ┌────▼─────┐
              ┌────►│STEP_INIT │◄──────────────────────┐
              │     └────┬─────┘                        │
              │          │ onBeforeStep (compact)        │
              │     ┌────▼─────────┐                    │
              │     │ LLM_STREAMING│                    │
              │     └────┬─────────┘                    │
              │          │                              │
              │     ┌────▼──────┐   413/429    ┌───────┤
              │     │ RESPONSE  │──────────────►RETRY  │
              │     │ RECEIVED  │              └───────┘
              │     └────┬──────┘
              │          │
              │   ┌──────┴──────┐
              │   │             │
              │  no tools    has tools
              │   │             │
              │   ▼             ▼
              │ ┌──────┐  ┌──────────┐
              │ │CHECK │  │TOOL_EXEC │
              │ │END   │  │(并行+串行)│
              │ └──┬───┘  └────┬─────┘
              │    │           │ results → session
              │    │           └──────────────────┐
              │    │                              │
              │ ┌──▼────────────┐                 │
              │ │ waitForInput? │                 │
              │ └──┬──────┬────┘                 │
              │  yes      no                      │
              │    │       │                      │
              │ ┌──▼───┐   ▼                      │
              │ │AWAIT │  DONE                    │
              │ │INPUT │                          │
              │ └──┬───┘                          │
              │    │ user input                   │
              └────┴──────────────────────────────┘
```

**关键状态变量：**

| 变量 | 用途 | 初始值 |
|------|------|--------|
| `stepCount` | 当前步数 | 0 |
| `consecutiveErrors` | 连续工具错误数 | 0 |
| `maxTokensRecoveryCount` | max_tokens 恢复次数 | 0 (上限 3) |
| `toolCallCounts` | 重复调用计数 Map | 空 |
| `globalDuplicateBlockCount` | 累计硬阻断次数 | 0 (熔断阈值 5) |
| `questionReminderUsed` | question 提醒是否已用 | false |
| `writeOpCount` | 写操作累计 | 0 |

### 2.5 五大设计亮点

| # | 亮点 | 说明 |
|---|------|------|
| 1 | **AsyncGenerator 事件流** | `run()` 返回 `AsyncGenerator<AgentEvent>`，天然支持流式输出/取消/背压控制 |
| 2 | **StreamingToolExecutor** | LLM stream 期间提前启动并行安全工具（read/glob/grep），省一个往返延迟 |
| 3 | **三层 Compact 管道** | micro（静默裁剪旧 tool_result）→ auto（LLM 摘要@140K）→ reactive（413 应急），压缩前自动存档 |
| 4 | **三级重复熔断** | 软警告(3x) → 硬阻断(10x) → 全局熔断(5次硬阻断)，按文件路径归类防 LLM 绕过 |
| 5 | **Runner/Loop 关注点分离** | Loop 保持 ~620 行精简纯执行引擎，所有工程逻辑（Skill/MCP/权限/Compact）通过回调注入 |

### 2.6 三个潜在问题

| 问题 | 位置 | 影响 | 建议 |
|------|------|------|------|
| 权限系统空壳 | runner.ts:146 `return true` | 所有操作自动批准，无安全边界 | 如短期不实现，移除死代码减少误解 |
| toolCallCounts 无限增长 | loop.ts 循环内 Map | 超长会话（数千轮）可能内存泄漏 | 定期清理或限制 Map 大小 |
| 循环检测硬编码阈值 | runner.ts:351 (20条/80%) | 复杂分析任务可能误触发 compact | 考虑阈值可配置化 |

---

## 3. src/cli/ — 命令行入口设计分析

### 3.1 文件规模统计

| 区域 | 文件数 | 总行数(约) | 核心职责 |
|------|--------|-----------|---------|
| 顶层 (cli/) | 7 | ~2,200 | 入口 + 执行器 + WS 客户端 + 工具函数 |
| plain-text/ | 9 | ~1,500 | 流式文本 UI：渲染器/折叠/滚动/交互 |
| ink/ | 24 | ~2,000 | React 组件化 UI：App + 11 组件 + 6 hooks |
| cc-ink/ | 113 | ~8,500 | 自定义 Ink 渲染引擎 Fork（含 Yoga 布局） |
| **合计** | **153** | **~14,200** | CLI 占 src/ 总代码量的 **~40%** |

### 3.2 命令路由图

```
naughtyagent [options] [message...]
  │
  ├── daemon <cmd>
  │   ├── start    → daemonStart()    // 启动后台进程
  │   ├── stop     → daemonStop()     // 停止后台进程
  │   ├── restart  → daemonRestart()  // 重启
  │   └── status   → daemonStatus()   // 显示状态
  │
  ├── sessions <cmd>
  │   ├── list     → sessionsList()   // 列出所有会话
  │   └── delete   → sessionsDelete() // 删除指定会话
  │
  ├── test <cmd>
  │   └── phase1   → testPhase1()     // 内置验收测试
  │
  └── (default) → chat mode
       │
       ├── 有 message 参数
       │   ├── 尝试 Daemon 模式 (sendSingleMessage)
       │   └── 失败回退 Standalone (handleChatStandalone)
       │
       └── 无 message 参数 → REPL 模式
            │
            ├── --ui ink   → startInkUI()
            │   └── React 组件树 (App → Chat → Messages → Input)
            │
            └── --ui plain (默认) → startPlainTextUI()
                └── 流式文本渲染 (PlainTextRenderer)
```

### 3.3 两种运行模式

```
┌─────────────────────────────────────────────────────────────────┐
│                    Daemon 模式（默认）                            │
│                                                                  │
│  CLI  ──HTTP POST──► Daemon /api/sessions  → sessionId          │
│  CLI  ──WebSocket──► Daemon /ws?session=xxx                     │
│       │                                                          │
│       │  ┌─ WS 事件流 ─────────────────────────────────────┐    │
│       │  │ text, thinking, tool_start, tool_end,           │    │
│       │  │ question, error, done, await_input              │    │
│       │  └─────────────────────────────────────────────────┘    │
│       │                                                          │
│       │  特点: 多会话并行 / 后台持久 / 跨端共享                   │
├─────────────────────────────────────────────────────────────────┤
│                  Standalone 模式 (回退)                           │
│                                                                  │
│  CLI  ──直接调用──► createRunner() → AgentLoop                  │
│       │                                                          │
│       │  ┌─ 事件迭代器 ───────────────────────────────────┐    │
│       │  │ for await (event of loop.run(input))           │    │
│       │  └─────────────────────────────────────────────────┘    │
│       │                                                          │
│       │  特点: 简单直接 / 离线可用 / 进程结束即丢失                │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 参数解析

手写轻量解析器（零依赖），不使用 yargs/commander：

```typescript
// cli.ts 中的参数定义
--model, -m        : 模型选择 (claude-sonnet-4-20250514 等)
--thinking         : 启用 extended thinking + token 预算
--reasoning-effort : 推理力度 (low/medium/high)
--standalone       : 强制独立模式
--ui               : UI 模式选择 (plain/ink)
--session          : 指定会话 ID
--resume           : 恢复历史会话
--verbose          : 详细输出
--version          : 显示版本
--help             : 帮助信息
```

### 3.5 WebSocket 客户端（手写零依赖）

`client.ts` (~451行) 实现了完整的 WS 客户端，核心特点：

| 特性 | 实现方式 |
|------|---------|
| 协议 | 手写 WebSocket 帧编解码，不依赖 ws/socket.io |
| 事件 | 解析 JSON 事件流：text/thinking/tool_start/tool_end/question/error/done |
| 重连 | 无自动重连（连接失败直接回退 Standalone） |
| 心跳 | WS ping/pong |
| 加密 | 仅 localhost 通信，无 TLS |

### 3.6 UI 双模式切换

#### Plain-text 模式（默认）

```
PlainTextRenderer
  ├── StreamWriter          → 流式文本输出（逐字符）
  ├── CollapsibleSection    → 工具执行可折叠区域
  ├── ProgressIndicator     → 加载动画 (⠋⠙⠹⠸...)
  ├── InteractionHandler    → 用户交互（confirm/select/text）
  └── ScrollManager         → 终端滚动控制
```

#### Ink 模式 (--ui ink)

```
<App>
  ├── <StatusBar />         → 连接状态 + 模型信息
  ├── <MessageList>
  │    ├── <ThinkingBlock /> → 思考过程折叠显示
  │    ├── <TextBlock />     → Markdown 渲染
  │    ├── <ToolBlock />     → 工具执行状态
  │    └── <ErrorBlock />    → 错误高亮
  ├── <InputArea />          → 多行编辑器
  └── <QuestionPanel />      → 交互式提问面板
```

### 3.7 亮点与问题

#### ✅ 设计亮点

| # | 亮点 | 说明 |
|---|------|------|
| 1 | 手写 WS 客户端 | 零第三方 WS 依赖，减少供应链攻击面 |
| 2 | 优雅降级 | Daemon 连接失败自动回退 Standalone，用户无感知 |
| 3 | `.env` override | `override: true` 解决 VS Code terminal 注入旧 API Key 问题 |
| 4 | 轻量参数解析 | 无 yargs/commander 依赖，启动速度快 |
| 5 | UI 解耦 | plain-text 和 ink 共用事件处理器，仅渲染层不同 |

#### ⚠️ 潜在问题

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | 事件处理重复代码 | `handleChatDaemon` vs `createOutputHandlers` | Daemon/Standalone 大量相似的事件分发逻辑 |
| 2 | 参数解析无错误提示 | `cli.ts` parseArgs | 未知参数静默忽略，用户拼错无提醒 |
| 3 | cc-ink 113 文件 Fork | `cli/cc-ink/` | Ink 渲染引擎整体 Fork，长期维护成本高 |
| 4 | 静默后台进程 | `ensureDaemon()` | 自动 spawn 后台进程，用户可能不知情 |
| 5 | REPL 缺少 history | 交互模式 | 没有命令历史持久化，重启后丢失 |

---

## 4. 综合交叉观察

### 4.1 跨模块一致性问题

| 观察 | 涉及模块 | 建议 |
|------|---------|------|
| 错误处理不一致贯穿 tool→loop→cli 三层 | 全部 | 统一为 throw + Tool.define 兜底，loop 层的 `isError` 判断才能可靠工作 |
| Runner 名称冲突 | agent/runner.ts + cli/runner.ts | 名称易混淆，cli/runner.ts 实际是 Agent 编排器，建议重命名为 cli/agent-runner.ts |
| compact 管道跨三层 | tool/compact.ts → agent/compact → session/ | 正是审查报告中 H1 的体现，compact 的 session 操作应下沉到 session/ |
| 权限系统全链路空壳 | agent/runner + cli/runner | 如果短期不实现，应移除死代码减少误解 |

### 4.2 事件流贯穿三层

```
  tool 层                    agent 层                    cli 层
  ──────                    ────────                    ──────
  execute() →               yield AgentEvent →          handleEvent() →
  { output, isError }       { type, data }              render/display

  ⚠️ 模式 C 的工具          loop 无法识别              UI 显示为"成功"
  返回无 isError            这是一个错误                用户被误导
```

**这就是错误处理统一的必要性**：一个工具层的不一致，会沿事件流扩散到 UI 层。

### 4.3 代码量分布对比

```
  tool/    (~3,800行, 23文件)   ■■■■■■■■   核心业务
  agent/   (~2,100行, 8文件)    ■■■■■       紧凑精练 ✅
  cli/     (~14,200行, 153文件) ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■  ⚠️ 严重膨胀
                                            其中 cc-ink 占 ~8,500 行 (60%)
```

**建议优先级**：
1. **P0**: 统一 tool 层错误处理（消除模式 C 和 D） — 1 天
2. **P0**: 解耦 tool/compact.ts → agent 的反向依赖 — 0.5 天
3. **P1**: 提取 Daemon/Standalone 重复事件处理代码 — 0.5 天
4. **P2**: cc-ink 独立为 package 或替换为官方 Ink — 评估后决定

---

> 📝 本报告与 `Code-Review-Report-2026-04-06.md` 互补：审查报告给出问题清单，本报告提供深度分析和流程图解。
