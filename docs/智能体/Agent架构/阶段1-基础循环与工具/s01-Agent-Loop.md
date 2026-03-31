# s01 - Agent Loop

> 教材：`learn-claude-code-main/agents/s01_agent_loop.py`
> 作业：`packages/agent/src/agent/loop.ts`

## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| Agent Loop | Agent Loop | 核心执行循环，LLM → Tool → LLM 的反复过程 |
| Stop Reason | Stop Reason | LLM 返回的停止原因，`tool_use` 表示需要工具，`end_turn` 表示直接回答 |
| Messages | Messages | 对话历史数组，记录 user/assistant 的完整交互 |
| Harness | Harness | Agent 的外壳/载具，给模型提供工具和环境，不替模型做决策 |
| Safety Valve | Safety Valve（安全阀） | 防止循环失控的机制，如 maxSteps、ErrorTracker |
| Tool Result | Tool Result | 工具执行结果，以 `role: "user"` 的形式喂回 LLM |

## 一、教材要点

Agent 的全部秘密就一个模式：

```
while stop_reason == "tool_use":
    response = LLM(messages, tools)
    execute tools
    append results
```

教材用 ~80 行 Python 实现了一个完整可运行的 Agent。核心就三件事：

1. 调用 LLM，拿到 response
2. 如果 `stop_reason == "tool_use"`，执行工具，把结果追加到 messages
3. 如果不是 tool_use，循环结束

教材只给了一个 `bash` 工具，加了基础的危险命令拦截和超时控制。

关键洞察：**Agent 是模型，不是框架。** Harness（外壳）的职责是给模型提供感知和行动的通道，而不是替模型做决策。


## 二、NaughtyAgent 现状

`loop.ts` 约 650 行，在教材的基础模式上叠加了大量工程层：

### 核心循环（与教材一致）

```typescript
// loop.ts 的核心 — 和教材完全同构
while (stepCount < maxSteps) {
  response = await provider.chat({ model, system, messages, tools })
  // 处理 response.content
  // 如果有 tool_use → 执行工具 → 追加结果 → 继续
  // 如果没有 → break
}
```

### 额外工程层

| 层 | 功能 | 教材有没有 |
|----|------|-----------|
| ErrorTracker | 连续错误追踪，3 次同类错误自动停止 | ❌ |
| PerformanceMonitor | LLM 调用耗时/成功率统计 | ❌ |
| OutputTruncator | 工具输出超长时截断 | ❌ |
| AbortController | 外部中止信号 | ❌ |
| Session 集成 | 消息持久化到 Session | ❌ |
| AgentEvent 流 | AsyncGenerator 流式输出事件 | ❌ |
| 错误恢复策略 | 按错误类型给出恢复建议注入 LLM | ❌ |
| maxSteps 限制 | 防止无限循环 | ❌ |


## 三、差距分析

### ✅ 做得好的

- 核心循环结构与教材同构，没有偏离 `while tool_use → execute → append` 的本质
- ErrorTracker 是合理的生产加固，教材没有但实际需要
- AsyncGenerator 流式事件输出，比教材的同步 print 更适合 IDE 集成
- maxSteps 防无限循环，教材没有但属于必要的安全阀

### ⚠️ 需要注意的

1. **过度工程化风险**：650 行 vs 教材 80 行，复杂度膨胀了 8 倍。教材的核心观点是"Harness 要薄"，我们的 loop 承担了太多职责
2. **错误恢复策略耦合**：`analyzeErrorType` + `getRecoveryStrategy` 把错误分类逻辑硬编码在 loop 里，这应该是可插拔的
3. **Session 耦合**：loop 直接操作 Session（addMessage, updateUsage），违反了单一职责。loop 应该只管循环，消息持久化应该在外层
4. **Provider 转换层**：loop 里有大量 ContentBlock ↔ MessageContent 的类型转换代码，这是 Provider 抽象不够干净导致的


## 四、重构计划

### 目标：让 loop 回归本质

教材的 loop 是纯粹的：`LLM → Tool → LLM`。我们的 loop 应该也是，额外的关注点通过组合而非内嵌来实现。

### 具体步骤

1. **抽离 Session 操作**：loop 只 yield 事件，由外层（runner/orchestrator）负责写入 Session
2. **抽离错误恢复策略**：ErrorTracker 保留在 loop 内（它是循环控制的一部分），但 `analyzeErrorType` / `getRecoveryStrategy` 抽成独立模块
3. **统一类型**：消除 ContentBlock ↔ MessageContent 的双向转换，让 Provider 直接返回 loop 能用的类型
4. **目标行数**：核心 loop 控制在 200 行以内，辅助逻辑外移

### 优先级

- P0：抽离 Session 耦合（影响后续所有阶段）
- P1：统一类型系统（减少转换代码）
- P2：错误恢复策略可插拔化

## 五、面试考点

> Q：Agent Loop 的本质是什么？

Agent Loop 就是一个 while 循环。调用 LLM，如果 LLM 返回 tool_use，就执行工具，把结果喂回去，再调用 LLM。直到 LLM 决定不再调用工具为止。整个 Agent 的"智能"来自模型，不是来自循环逻辑。Harness 的职责是提供工具通道和安全边界，不是替模型做决策。

> Q：生产环境的 Agent Loop 比教学版多了什么？

主要是三类加固：安全阀（maxSteps、abort signal）、可观测性（事件流、性能监控、日志）、容错（错误追踪、恢复策略注入）。但核心模式不变。

> Q：为什么说"Agent 是模型，不是框架"？

因为 agency（自主行动能力）是模型通过训练学到的，不是代码编排出来的。框架只是给模型提供了感知环境和执行动作的接口。把 LLM 塞进 if-else 流水线不会产生 Agent，只会产生一个脆弱的脚本。
