# Agent Loop（智能循环）—— 编程 Agent 的心脏

> 调研时间：2026-03-14
> 关联：[核心.md](核心.md) 中的功能总览

## Loop 存在的根本原因

> ⚠️ 易混淆：Loop 不是因为"工具会出错所以需要循环"。错误恢复只是 Loop 的增强特性，不是它存在的原因。

**Loop 存在的根本原因：LLM 无法一步完成复杂任务。**

LLM 本质上是一个"根据输入生成输出"的函数。没有 Loop，LLM 只能**说**不能**做**——它可以告诉你"你应该运行 npm test"，但无法自己去运行、看到结果、再决定下一步。

**Loop 把 LLM 从"顾问"变成了"执行者"。**

### ReAct 模式（Reasoning + Acting）

Agent Loop 的理论基础是 AI 领域的 **ReAct 模式**：

```
思考（Reasoning）→ 行动（Acting）→ 观察（Observation）→ 思考 → 行动 → 观察 → ... → 完成
       │                │                │
       │                │                └─ 工具执行结果反馈回 LLM（下一步决策的依据）
       │                └─ 调用工具（tool_use）
       └─ LLM 推理下一步该做什么
```

**示例：即使全程没有任何错误，也需要多轮 Loop**

```
用户: "修复 auth.ts 的测试"

Turn 1: LLM 思考"先看看哪些测试挂了"
        → 调用 Bash("npm test")
        → 观察：3 个测试失败

Turn 2: LLM 思考"看看源码是什么样的"
        → 调用 Read("auth.ts")
        → 观察：代码内容

Turn 3: LLM 思考"看看测试在检查什么"
        → 调用 Read("auth.test.ts")
        → 观察：测试内容

Turn 4: LLM 思考"找到 bug 了，需要改这里"
        → 调用 Edit("auth.ts", ...)
        → 观察：文件已修改

Turn 5: LLM 思考"改完了，验证一下"
        → 调用 Bash("npm test")
        → 观察：全部通过 ✅

Turn 6: LLM 返回纯文本 → "已修复，3 个测试全部通过"
        → Loop 结束（无工具调用 = 任务完成）
```

**每一轮的观察结果，驱动下一轮的决策。这才是 Loop 的核心价值。**

---

## 为什么说 Loop 是核心？

Agent Loop 是编程 Agent **最核心的架构单元**，相当于人的心脏。所有其他功能（工具、记忆、子代理、MCP）都是围绕 Loop 运转的外围系统。Loop 的质量直接决定了：

| 影响维度 | Loop 好 | Loop 差 |
|---------|---------|---------|
| **任务完成率** | 能自主解决多步骤问题 | 一步出错就卡死 |
| **用户体验** | 实时看到进度，可随时中断 | 等半天没反应，或一堆乱输出 |
| **Token 成本** | 高效利用上下文，按需调用工具 | 重复调用、无限循环，烧钱 |
| **可靠性** | 遇错自恢复，不会崩溃 | 一个工具报错整个 Agent 挂掉 |
| **可扩展性** | 容易接入新工具、新模型 | 改一处牵一发动全身 |

---

## 1. Agent Loop 的本质：一个 while 循环

无论 Claude Code、Kiro、还是你的 NaughtyAgent，Agent Loop 的核心都是同一个模式：

```
用户输入
  ↓
┌──────────────────────────────────┐
│  while (未完成 && 未超限) {       │
│    1. 把消息历史发给 LLM          │
│    2. LLM 返回 文本 和/或 工具调用 │
│    3. 如果有工具调用：             │
│       - 执行工具                  │
│       - 把结果放回消息历史         │
│       - continue（回到步骤1）      │
│    4. 如果没有工具调用：           │
│       - break（任务完成）          │
│  }                               │
└──────────────────────────────────┘
  ↓
最终结果返回给用户
```

**就这么简单。** 所有复杂性都在这个循环的"细节"里。

## 2. Anthropic 官方定义的 Agent Loop

来源：Anthropic Agent SDK 文档（`docs.anthropic.com/en/docs/agent-sdk/agent-loop`）

### 2.1 五个阶段

```
1. Receive prompt     → 接收用户输入 + system prompt + 工具定义 + 对话历史
2. Evaluate & respond → LLM 评估当前状态，返回文本和/或工具调用
3. Execute tools      → SDK 执行工具，收集结果
4. Repeat             → 步骤 2-3 反复循环，每个循环叫一个 "turn"
5. Return result      → LLM 返回纯文本（无工具调用）= 任务完成
```

### 2.2 关键概念：Turn（回合）

- **一个 Turn** = LLM 产出工具调用 → SDK 执行工具 → 结果反馈回 LLM
- 简单问题可能 1-2 个 turn，复杂任务可能几十个 turn
- 可通过 `max_turns` 或 `max_budget_usd` 限制

### 2.3 消息类型

| 类型 | 含义 | 何时产生 |
|------|------|----------|
| `SystemMessage` | 会话生命周期事件 | 初始化、compaction |
| `AssistantMessage` | LLM 的回复（文本+工具调用） | 每个 turn |
| `UserMessage` | 工具执行结果 | 工具完成后 |
| `StreamEvent` | 流式增量事件 | 实时输出时 |
| `ResultMessage` | 最终结果（含 token 用量、成本、session_id） | 循环结束 |

### 2.4 工具结果反馈的协议（最关键的细节）

这是 Anthropic API 的**硬性规定**：

```
消息历史结构：
[
  { role: "user",      content: "请修复 auth.ts 的测试" },
  { role: "assistant",  content: [
    { type: "text", text: "我来看看测试..." },
    { type: "tool_use", id: "call_1", name: "Bash", input: { command: "npm test" } }
  ]},
  { role: "user",      content: [
    { type: "tool_result", tool_use_id: "call_1", content: "3 tests failed..." }
  ]},
  { role: "assistant",  content: [
    { type: "tool_use", id: "call_2", name: "Read", input: { file: "auth.ts" } }
  ]},
  { role: "user",      content: [
    { type: "tool_result", tool_use_id: "call_2", content: "文件内容..." }
  ]},
  ... 继续循环
]
```

**规则**：
1. `tool_result` 必须紧跟在对应的 `tool_use` 后面
2. `tool_result` 通过 `tool_use_id` 关联到具体的工具调用
3. `tool_result` 放在 `user` 角色的消息中（不是新角色）
4. 错误结果设置 `is_error: true`

## 3. Claude Code 的 Loop 实现细节

Claude Code 的 Loop 在官方 Agent SDK 之上增加了大量生产级特性。

### 3.1 上下文窗口管理

上下文窗口是**整个循环共享的**，不会每轮重置：

| 上下文来源 | 何时加载 | 备注 |
|-----------|---------|------|
| System Prompt | 每次请求 | 固定开销 |
| CLAUDE.md | 会话开始 | Prompt Cache，首次全量后续缓存 |
| 工具定义 | 每次请求 | 工具多时开销大 → Tool Search 按需加载 |
| 对话历史 | 累积增长 | **最大的上下文消耗来源** |

### 3.2 自动 Compaction（上下文压缩）

当上下文接近窗口限制时自动触发：
- 将旧对话总结为摘要
- 保留最近的对话和关键决策
- 发出 `compact_boundary` 事件
- **CLAUDE.md 不受影响**（每次请求重新注入）

**这对 Loop 的影响**：Loop 可以"无限"运行，不会因为上下文满了而崩溃。

### 3.3 并行工具执行

```
LLM 一次返回多个 tool_use：
  ├─ Read("file1.ts")    ──┐
  ├─ Read("file2.ts")    ──┤── 并行执行（只读工具）
  ├─ Grep("pattern")     ──┘
  └─ Edit("file3.ts")    ──── 串行执行（写入工具）
```

规则：
- 只读工具（Read/Glob/Grep）→ 并行
- 写入工具（Edit/Write/Bash）→ 串行（避免冲突）
- 自定义工具默认串行，可标记 `readOnly` 启用并行

### 3.4 终止条件

| 终止原因 | ResultMessage subtype | 说明 |
|---------|----------------------|------|
| 正常完成 | `success` | LLM 返回纯文本，无工具调用 |
| 回合超限 | `error_max_turns` | 超过 `maxTurns` 设定 |
| 预算超限 | `error_max_budget_usd` | 超过 `maxBudgetUsd` 设定 |
| 执行错误 | `error_during_execution` | API 故障或请求被取消 |

### 3.5 Effort Level（推理深度控制）

| 等级 | 行为 | 适用场景 |
|------|------|---------|
| `low` | 最少推理，快速响应 | 列目录、简单查找 |
| `medium` | 平衡推理 | 常规编辑 |
| `high` | 深度分析 | 重构、调试 |
| `max` | 最大推理深度 | 多步复杂问题 |

### 3.6 子代理 = 独立 Loop

子代理的核心价值：**每个子代理有自己的上下文窗口**。

```
主 Loop                          子代理 Loop
  │                                │
  ├─ 对话历史（很长）               ├─ 只有 system prompt + CLAUDE.md
  ├─ 调用子代理 ──────────────────→ ├─ 执行任务（独立上下文）
  │                                ├─ 返回结果摘要
  ├─ 收到摘要（很短）←──────────── ┘
  │
  └─ 主 Loop 上下文只增长了"摘要"的大小
```

**好处**：主 Loop 上下文不会因为子任务膨胀。

## 4. NaughtyAgent 的 Loop 实现

核心文件：`packages/agent/src/agent/loop.ts`

### 4.1 主循环结构

```typescript
// createAgentLoop() 返回 { run, abort }
async function* executeLoop(input: string): AsyncGenerator<AgentEvent> {
  // 1. 添加用户消息
  addMessage(session, "user", [{ type: "text", text: input }])

  while (stepCount < maxSteps) {
    stepCount++

    // 2. 检查中止信号
    if (abortController.signal.aborted) {
      yield { type: "error", error: abortError }
      break
    }

    // 3. 调用 LLM 流式 API
    for await (const event of provider.stream({...})) {
      switch (event.type) {
        case 'thinking':  yield { type: "thinking", content: event.text }; break
        case 'text':      responseText += event.text; yield { type: "text", content: responseText }; break
        case 'tool_call': toolCalls.push({id, name, args}); break
      }
    }

    // 4. 保存助手消息
    addMessage(session, "assistant", assistantContent)

    // 5. 无工具调用 → 结束
    if (toolCalls.length === 0) break

    // 6. 执行工具
    for (const toolCall of toolCalls) {
      const { result, isError } = await executeTool(toolCall)
      toolResults.push({ type: "tool_result", tool_use_id: toolCall.id, content: result.output, is_error: isError })
    }

    // 7. 工具结果反馈（关键！放入 user 消息）
    if (toolResults.length > 0) {
      addMessage(session, "user", toolResults)
    }
  }
}
```

### 4.2 流式事件类型

```typescript
// Provider 层（LLM 原始事件）
type StreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "thinking_end" }
  | { type: "tool_call"; id, name, args }
  | { type: "message_end"; usage }
  | { type: "error"; error: Error }

// Agent 层（对外暴露的事件）
type AgentEvent =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "thinking_end" }
  | { type: "tool_start"; id, name, input }
  | { type: "tool_end"; id, result, isError }
  | { type: "error"; error: Error }
  | { type: "done"; usage: TokenUsage }
```

### 4.3 错误恢复机制

```typescript
interface ErrorTracker {
  consecutiveErrors: number        // 连续错误计数
  lastErrors: string[]             // 最近 5 个错误记录
  errorTypes: Map<string, number>  // 按类型统计
}

// 自动分析错误类型
function analyzeErrorType(error: string): ErrorType {
  // truncation → 截断 → 建议分段操作
  // invalid_params → 参数错误 → 建议检查格式
  // file_not_found → 文件不存在 → 建议用 glob 确认路径
  // permission → 权限问题
  // timeout → 超时
}

// 生成恢复策略，注入到工具结果中
function getRecoveryStrategy(errorType, toolName): string {
  // 返回具体建议文本，LLM 下一轮会看到
}
```

### 4.4 中断控制

```typescript
const abortController = new AbortController()

// 合并外部 abort 信号
if (runConfig.abort) {
  runConfig.abort.addEventListener("abort", () => abortController.abort())
}

// 导出 abort 函数
return { run, abort: () => abortController.abort() }
```

## 5. 对比分析：NaughtyAgent vs Claude Code

### 5.1 做得好的地方 ✅

| 方面 | NaughtyAgent | 评价 |
|------|-------------|------|
| **异步生成器** | `async function*` | ✅ 和 Claude Code 一致，支持实时流式 |
| **工具结果反馈** | `addMessage("user", toolResults)` | ✅ 严格遵循 Anthropic 协议 |
| **Extended Thinking** | 支持 thinking/thinking_end 事件 | ✅ 有这个就比很多同类项目强 |
| **错误恢复** | ErrorTracker + 错误类型分析 + 恢复策略 | ✅ 比 Claude Code SDK 的基础实现更智能 |
| **中断控制** | AbortController + 外部信号合并 | ✅ 标准做法 |
| **双层事件** | Provider StreamEvent → Agent AgentEvent | ✅ 关注点分离，好的设计 |
| **maxSteps 限制** | while (stepCount < maxSteps) | ✅ 防止无限循环 |

### 5.2 缺失的能力 ❌

| 缺失功能 | Claude Code 有 | 影响 | 优先级 |
|---------|---------------|------|--------|
| **上下文 Compaction** | 自动压缩旧对话 | 长任务会撑爆上下文窗口 | 🔴 高 |
| **并行工具执行** | 只读并行/写入串行 | 多文件读取效率低 | 🟡 中 |
| **预算控制** | max_budget_usd | 无法限制 API 成本 | 🟡 中 |
| **Effort Level** | low/medium/high/max | 无法按任务调节推理深度 | 🟢 低 |
| **ResultMessage** | 结构化终止状态 | 调用方无法区分"完成"和"超限" | 🟡 中 |
| **Prompt Cache** | 自动缓存重复前缀 | 多轮对话成本偏高 | 🟡 中 |
| **Hooks 集成** | PreToolUse/PostToolUse | 无法在循环中注入自定义逻辑 | 🟡 中 |

### 5.3 设计差异分析

#### 差异1：事件类型丰富度

```
Claude Code:  SystemMessage / AssistantMessage / UserMessage / StreamEvent / ResultMessage
NaughtyAgent: text / thinking / thinking_end / tool_start / tool_end / error / done
```

Claude Code 的消息类型更**结构化**，每种消息携带完整的元数据（session_id、cost、usage）。NaughtyAgent 的事件更**扁平**，信息散落在不同字段中。

**影响**：调用方（VS Code 插件）拿到的信息不够完整，难以做精细的 UI 展示。

#### 差异2：工具执行模型

```
Claude Code:  串行/并行混合，根据工具 readOnly 属性自动决定
NaughtyAgent: 全部串行 for...of 执行
```

**影响**：当 LLM 一次请求读取 5 个文件时，NaughtyAgent 需要串行等待，而 Claude Code 可以并行完成。

#### 差异3：上下文生命周期

```
Claude Code:  无限 → 自动 Compaction → 关键信息保留
NaughtyAgent: 有 maxSteps 限制 → 但无 Compaction → 上下文可能溢出
```

**影响**：长任务场景下，NaughtyAgent 要么步数用完任务未完成，要么上下文窗口被撑满报错。

## 6. Loop 写得好与坏的影响

### 6.1 对整个 Agent 的连锁影响

```
Loop 质量
  ├─ 影响 → 工具系统
  │         Loop 决定了工具怎么被调用、结果怎么反馈
  │         坏的 Loop：工具报错后 Agent 崩溃
  │         好的 Loop：错误自恢复，换策略重试
  │
  ├─ 影响 → 上下文管理
  │         Loop 的每一轮都在消耗上下文
  │         坏的 Loop：上下文膨胀失控，后面的回复质量暴降
  │         好的 Loop：自动 Compaction，长任务也稳定
  │
  ├─ 影响 → 用户体验
  │         Loop 控制了用户看到什么、什么时候看到
  │         坏的 Loop：等 30 秒没反应，然后一堆文字涌出来
  │         好的 Loop：实时流式输出，可中断，有进度感
  │
  ├─ 影响 → 成本控制
  │         Loop 决定了调用 LLM 的次数
  │         坏的 Loop：重复错误 → 无限重试 → 烧钱
  │         好的 Loop：错误检测 + 步数/预算限制
  │
  └─ 影响 → 子代理系统
            子代理本质上就是一个独立的 Loop
            坏的 Loop：无法复用，子代理要另写一套
            好的 Loop：同一个 Loop 实现，不同配置
```

### 6.2 常见的 Loop 缺陷模式

| 缺陷 | 表现 | 根因 |
|------|------|------|
| **死循环** | Agent 反复调用同一个工具，参数都一样 | 没有错误检测/重复检测 |
| **上下文爆炸** | 对话到后期回复质量急剧下降 | 没有 Compaction，大量工具输出堆积 |
| **错误雪崩** | 一个工具报错，后续连环出错 | 没有错误恢复策略 |
| **单点故障** | 网络抖动导致整个 Agent 崩溃 | 没有重试/断点续传 |
| **过度调用** | 简单问题也调了十几个工具 | Effort Level 不可调，LLM 不知道"适可而止" |
| **信息丢失** | 用户说的重要信息在 Compaction 后丢失 | Compaction 策略太粗暴 |

### 6.3 好的 Loop 应该像什么？

**像一个有经验的开发者的工作方式**：

1. **先想后做**（Plan Mode / Extended Thinking）
2. **按步骤执行**（工具调用链）
3. **遇错不慌**（错误分析 + 恢复策略）
4. **知道何时停**（终止条件 + 预算限制）
5. **及时汇报**（流式输出 + 进度事件）
6. **复杂任务分工**（子代理 = 独立 Loop）
7. **长期任务不忘事**（Compaction 保留关键信息）

---

## 7. 总结：NaughtyAgent Loop 的改进路线

按优先级排序：

```
P0（必须做）：
  └─ 上下文 Compaction → 否则长任务必崩

P1（应该做）：
  ├─ 并行工具执行 → 多文件操作效率翻倍
  ├─ 结构化终止状态 → 调用方能区分完成/超限/错误
  └─ 预算控制（max_budget） → 防止 API 成本失控

P2（可以做）：
  ├─ Effort Level 支持 → 简单任务省 token
  ├─ Prompt Cache 集成 → 降低多轮对话成本
  └─ Hooks 注入点 → PreToolUse / PostToolUse
```

**你的 Loop 基础是扎实的**——异步生成器、流式输出、错误恢复、中断控制都有了。最大的短板是 **Compaction**，这是长任务稳定性的关键。
