# Phase 5.1 阶段总结：SubTask 子任务系统

> 完成时间：2026-01-15

## 做了什么

实现了 SubTask 子任务系统，提供三种执行模式：

### API 模式

最简单的模式，单次 LLM 调用，无工具。

```typescript
const result = await runSubTask({
  mode: "api",
  prompt: "总结这段代码的功能",
  systemPrompt: "你是代码分析专家",
}, runtime)
```

**适用场景**：
- 文本生成、翻译、总结
- 代码解释、注释生成
- 简单问答
- 结构化数据提取

### Workflow 模式

预定义流程，开发者控制每一步。

```typescript
registerWorkflow({
  name: "commit",
  description: "生成 commit 消息",
  steps: [
    { name: "get-diff", type: "tool", tool: { name: "bash", params: { command: "git diff --staged" } } },
    { name: "generate", type: "llm", llm: { prompt: (ctx) => `生成 commit: ${ctx.results["get-diff"]}` } },
  ]
})

const result = await runSubTask({
  mode: "workflow",
  workflow: "commit",
  prompt: "",
}, runtime)
```

**适用场景**：
- Skills（/commit、/pr、/review）
- 固定流程任务
- 需要可预测结果的场景

### Agent 模式

LLM 自主决策，最灵活但不可预测。

```typescript
const result = await runSubTask({
  mode: "agent",
  prompt: "找到所有处理用户认证的代码",
  agentType: "explore",
  maxSteps: 20,
}, runtime)
```

**适用场景**：
- 复杂探索任务
- 需要多步推理的任务
- 子 Agent 分解

## 能干什么

### 三种模式对比

| 模式 | 控制权 | 灵活性 | 可预测性 | Token | 场景 |
|------|--------|--------|----------|-------|------|
| API | 开发者 | 低 | 高 | 低 | 简单生成 |
| Workflow | 开发者 | 中 | 高 | 中 | Skills |
| Agent | LLM | 高 | 低 | 高 | 复杂探索 |

### Task 工具

统一入口，让 Agent 能启动子任务：

```typescript
// Agent 可以调用 Task 工具
{
  id: "task",
  parameters: {
    mode: "api" | "workflow" | "agent",
    prompt: "任务描述",
    // API 模式
    systemPrompt?: string,
    outputFormat?: "text" | "json",
    // Workflow 模式
    workflow?: string,
    params?: Record<string, unknown>,
    // Agent 模式
    agentType?: "build" | "plan" | "explore",
    maxSteps?: number,
  }
}
```

## 在 Agent 中的作用

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Loop (主)                         │
│                                                              │
│  用户: "帮我重构这个模块并提交代码"                            │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ LLM 决定分解任务，调用 Task 工具                      │    │
│  │                                                      │    │
│  │ Task(mode: "agent", prompt: "分析现有代码结构")       │    │
│  │     └─→ 子 Agent 执行探索                            │    │
│  │                                                      │    │
│  │ Task(mode: "agent", prompt: "重构代码")              │    │
│  │     └─→ 子 Agent 执行修改                            │    │
│  │                                                      │    │
│  │ Task(mode: "workflow", workflow: "commit")           │    │
│  │     └─→ 执行预定义的 commit 流程                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 当前整体能力

### 能做什么

1. **子任务分解** - 主 Agent 可以启动子任务
2. **三种模式选择** - 根据任务复杂度选择合适模式
3. **Workflow 注册** - 预定义可复用的流程
4. **上下文传递** - Workflow 步骤间共享数据

### 不能做什么

1. **Skills 命令** - 需要 Phase 5.3 实现 /commit 等
2. **并行子任务** - 当前只支持顺序执行
3. **子任务取消** - 需要更完善的取消机制

## 测试覆盖率

| 模块 | 语句 | 分支 | 函数 | 测试数 |
|------|------|------|------|--------|
| api.ts | 100% | 90% | 100% | 8 |
| workflow.ts | 80.68% | 70.66% | 92.3% | 17 |
| agent.ts | 46.66% | 29.62% | 50% | - |
| runner.ts | 100% | 100% | 100% | 7 |
| task-tool.ts | 100% | 100% | 100% | 14 |

**总计：46 个测试**

> agent.ts 覆盖率较低是因为需要真实 API 调用，已通过集成测试验证

## 文件清单

```
packages/agent/src/subtask/
├── types.ts        # 类型定义
├── api.ts          # API 模式
├── workflow.ts     # Workflow 模式 + 注册表
├── agent.ts        # Agent 模式
├── runner.ts       # 统一入口
├── task-tool.ts    # Task 工具
└── index.ts        # 导出

packages/agent/test/subtask/
├── api.test.ts
├── workflow.test.ts
├── runner.test.ts
└── task-tool.test.ts
```

## 下一步

Phase 5.2 交互工具：
- question 工具 - 向用户提问
- todo 工具 - 任务管理
