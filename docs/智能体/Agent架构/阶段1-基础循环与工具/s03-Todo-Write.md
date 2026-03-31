# s03 - Todo Write

> 教材：`learn-claude-code-main/agents/s03_todo_write.py`
> 作业：`packages/agent/src/interaction/todo.ts`（已有）+ `packages/agent/src/agent/loop.ts`（新增 nag reminder）

## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| TodoManager | TodoManager | 结构化的任务状态容器，LLM 通过工具读写它 |
| Nag Reminder | Nag Reminder（催促提醒） | 当模型连续 N 轮未更新 todo 时，Harness 自动注入的提醒消息 |
| Nudge | Nudge（轻推） | Harness 提醒模型保持纪律，但不替模型做决策 |
| External Working Memory | External Working Memory（外部工作记忆） | 把计划写到 todo 里，弥补 LLM 上下文窗口有限的问题 |
| Task Status | Task Status | 任务状态：pending（待做）、in_progress（进行中）、completed（已完成） |
| Full Replacement | Full Replacement（全量替换） | 教材/Claude Code 的方式，每次传完整列表 |
| Incremental Update | Incremental Update（增量更新） | NaughtyAgent 的方式，add/update/remove 单个操作 |

## 一、教材要点

s03 的核心洞察：**模型可以追踪自己的进度，而我能看到它。**

引入 `TodoManager`，LLM 通过 `todo` 工具读写任务列表。


### TodoManager 设计

```python
class TodoManager:
    def update(self, items: list) -> str:
        # 验证规则：
        # - 最多 20 个 todo
        # - status 只能是 pending / in_progress / completed
        # - 同时只能有 1 个 in_progress
        # 返回渲染后的文本状态
    
    def render(self) -> str:
        # [ ] pending
        # [>] in_progress
        # [x] completed
```

### Nag Reminder（催促机制）

```python
if rounds_since_todo >= 3:
    results.insert(0, {
        "type": "text", 
        "text": "<reminder>Update your todos.</reminder>"
    })
```

`insert(0, ...)` 插在工具结果最前面，确保模型先看到提醒。

### 设计哲学

- ✅ Harness 可以做：提供状态容器、验证约束、提醒更新
- ❌ Harness 不应该做：替模型决定任务拆分、自动标记完成

TodoManager 是**模型的笔记本**，不是**模型的老板**。

### 与 s01/s02 的关系

循环还是那个循环。todo 只是又一个工具，唯一的循环变化是加了计数器和 reminder 注入。


## 二、NaughtyAgent 现状（已实现）

NaughtyAgent 在 `interaction/todo.ts` 中已有 TodoTool，采用**增量操作**模式。

### 与教材的设计差异

| 方面 | 教材 | NaughtyAgent |
|------|------|-------------|
| 操作方式 | 全量替换（每次传完整列表） | 增量操作（add/update/remove） |
| 约束 | 最多 20 个，1 个 in_progress | ✅ 已加上（本次改动） |
| 子任务 | 不支持 | 支持 parentId |
| 状态值 | pending/in_progress/completed | 多一个 cancelled |
| Nag Reminder | 有 | ✅ 已加上（本次改动） |

### 全量替换 vs 增量操作

教材和 Claude Code 都用全量替换，对 LLM 更友好——模型不需要记住当前列表状态。
NaughtyAgent 用增量操作，更灵活（支持子任务），但模型需要记住 ID。

## 三、代码拆解

### Nag Reminder 在 loop.ts 中的实现

```typescript
let roundsSinceTodo = 0
const NAG_THRESHOLD = 3

for (const toolCall of toolCalls) {
  if (toolCall.name === "todo") {
    roundsSinceTodo = 0    // 用了 todo，重置
  } else {
    roundsSinceTodo++      // 没用 todo，+1
  }
}

// 注入提醒（插在工具结果最前面）
if (roundsSinceTodo >= NAG_THRESHOLD && stepCount > NAG_THRESHOLD) {
  toolResults.unshift({
    type: "text",
    text: "<reminder>Update your todos to track progress.</reminder>",
  })
}
```


### 约束在 interaction/todo.ts 中的实现

```typescript
const MAX_TODO_ITEMS = 20
const MAX_IN_PROGRESS = 1

// addTodo 时检查总数
if (list.items.length >= MAX_TODO_ITEMS) {
  throw new Error(`任务数量已达上限 (${MAX_TODO_ITEMS})`)
}

// updateTodo 时检查 in_progress
if (status === "in_progress") {
  const currentInProgress = list.items.filter(
    (i) => i.status === "in_progress" && i.id !== id
  )
  if (currentInProgress.length >= MAX_IN_PROGRESS) {
    throw new Error(`同时只能有 ${MAX_IN_PROGRESS} 个任务处于 in_progress`)
  }
}
```

## 四、面试考点

> Q：为什么 Agent 需要 Todo 机制？

LLM 的上下文窗口有限，复杂任务执行到后半段时，模型可能"忘记"最初的计划。Todo 是外部工作记忆，让模型把计划写下来，每一步都能回顾。

> Q：Nag Reminder 算不算"替模型做决策"？

不算。只是提醒"你该更新进度了"，不告诉它该做什么。类比：闹钟提醒你该起床了，但不替你决定穿什么。

> Q：为什么限制同时只能有 1 个 in_progress？

防止模型分心。强制串行聚焦，做完一件再做下一件。

> Q：全量替换和增量操作哪个更好？

全量替换对 LLM 更友好（不需要记住 ID），增量操作更灵活（支持子任务）。Claude Code 用全量替换。
