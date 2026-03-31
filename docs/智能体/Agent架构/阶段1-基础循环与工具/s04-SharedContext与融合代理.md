# s04 扩展 - SharedContext 与融合代理模式

> 作业：`packages/agent/src/subtask/shared-context.ts`
> 参考：LangGraph StateGraph 架构

## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| SharedContext | SharedContext（共享上下文） | 融合代理模式的共享状态容器，所有子代理读写同一份 |
| Orchestrator | Orchestrator（编排者） | 融合代理的中心节点，负责任务分配和结果汇总 |
| Worker | Worker（工作者） | 执行具体子任务的子代理 |
| StateGraph | StateGraph（状态图） | LangGraph 的核心抽象，节点是 Agent，边是条件路由 |
| Finding | Finding（发现） | Worker 写入的探索结果 |
| Decision | Decision（决策） | Orchestrator 做出的路由决策 |
| Artifact | Artifact（产物） | 子代理产出的具体成果（代码、文档等） |
| Depth Limit | Depth Limit（深度限制） | 防止子代理无限递归的安全阀，默认最大 3 层 |

## 一、执行流程图

```
用户请求（需求不明确的复杂任务）
    │
    ▼
┌─────────────────────────────────────────┐
│  Orchestrator（融合代理，depth=0）        │
│  创建 SharedContext                      │
│  分析任务 → 决定派发策略                  │
└────────────┬────────────────────────────┘
             │ 派发子任务（传递 sharedContextId）
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
```
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Worker A │ │ Worker B │ │ Worker C │
│ depth=1  │ │ depth=1  │ │ depth=1  │
│ 探索模块X│ │ 探索模块Y│ │ 探索模块Z│
└────┬─────┘ └────┬─────┘ └────┬─────┘
     │ 写入        │ 写入        │ 写入
     │ finding     │ finding     │ finding
     ▼             ▼             ▼
┌─────────────────────────────────────────┐
│         SharedContext（共享状态）          │
│  findings: [A的发现, B的发现, C的发现]    │
│  decisions: [orchestrator的决策]          │
│  artifacts: [产出的代码/文档]             │
│  errors: [失败记录]                      │
└────────────────┬────────────────────────┘
                 │ Orchestrator 读取所有 findings
                 ▼
┌─────────────────────────────────────────┐
│  Orchestrator（第二轮）                   │
│  读取 SharedContext.summarize()           │
│  判断：信息够了？需要深入哪个方向？         │
│  决策 → 写入 decision → 再派发            │
└────────────┬────────────────────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Worker D │ │ Worker E │ │ Worker A │
│ depth=1  │ │ depth=1  │ │ (再次)   │
│ 深入方向1│ │ 深入方向2│ │ 补充探索 │
└──────────┘ └──────────┘ └──────────┘
     │             │             │
     ▼             ▼             ▼
   (写入 findings/artifacts 到 SharedContext)
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Orchestrator（最终轮）                   │
│  汇总所有 findings + artifacts            │
│  生成最终输出返回用户                     │
└─────────────────────────────────────────┘
```

## 二、与 LangGraph 的对比

### LangGraph StateGraph 模型

```python
# LangGraph 的方式：显式定义图
graph = StateGraph(AgentState)
graph.add_node("orchestrator", orchestrator_fn)
graph.add_node("worker_a", worker_a_fn)
graph.add_node("worker_b", worker_b_fn)
graph.add_conditional_edges("orchestrator", route_fn, {
    "explore_a": "worker_a",
    "explore_b": "worker_b",
    "done": END,
})
# 所有节点读写同一个 AgentState
```

### NaughtyAgent 融合代理模型

```typescript
// NaughtyAgent 的方式：LLM 动态决定图结构
// Orchestrator 通过 run_agent/fork_agent 派发
// 所有子代理通过 sharedContextId 访问同一个 SharedContext
const ctx = createSharedContext("orchestrator")
// 子代理执行时：
const shared = getSharedContext(ctx.id)
shared.add("finding", "worker_a", "发现模块X有性能问题", {
  data: { file: "src/x.ts", issue: "O(n²) 循环" }
})
```

### 核心差异

| 方面 | LangGraph | NaughtyAgent |
|------|-----------|-------------|
| 图定义 | 编译时显式定义节点和边 | 运行时 LLM 动态决定 |
| 状态 | TypedDict，强类型 | SharedContext，灵活的 entries |
| 路由 | 条件边函数（代码/LLM） | 完全由 LLM 判断 |
| 循环 | 图原生支持环 | 通过 orchestrator 多轮实现 |
| 持久化 | Checkpoint 内置 | SharedContext.snapshot() |
| 适用场景 | 流程已知，需要可靠执行 | 需求不明确，需要探索 |

## 三、SharedContext 实现细节

### 数据模型

```typescript
SharedContext {
  id: string                    // 唯一标识
  entries: SharedEntry[]        // 所有条目
  metadata: Map<string, unknown> // 元数据

  // 写入
  add(type, source, content, options?)  → SharedEntry

  // 查询
  getByType("finding")    → 所有发现
  getBySource("worker_a") → 某个 worker 的所有输出
  getByTag("performance") → 按标签过滤

  // 汇总
  summarize()  → 结构化摘要（给 orchestrator 看）
  snapshot()   → 可序列化快照（可持久化）
}
```

### 条目类型

| 类型 | 写入者 | 用途 |
|------|--------|------|
| finding | Worker | 探索发现、分析结果 |
| decision | Orchestrator | 路由决策、策略调整 |
| artifact | Worker | 产出的代码、文档、配置 |
| error | 任何 | 失败记录，供后续 worker 避坑 |

### 安全机制

- 最大条目数限制（默认 100），超限时移除最早的非 decision 条目
- 递归深度限制（MAX_SUBAGENT_DEPTH = 3）
- 通过全局注册表管理，任务完成后可清理

### 数据流转

```
Tool.Context.sharedContextId
    → 子代理工具读取，传给 config.sharedContextId
    → runRunAgent/runForkAgent 传给 createAgentLoop
    → AgentLoop 传给 executeTool 的 ctx
    → 子代理的子代理也能访问同一个 SharedContext
```

## 四、与之前改动的关系

| 改动 | 文件 | 作用 |
|------|------|------|
| depth 深度限制 | tool.ts, loop.ts, *-tool.ts | 防止无限递归 |
| sharedContextId | tool.ts, loop.ts, types.ts | 共享状态传递链路 |
| SharedContext 类 | shared-context.ts | 共享状态容器 |
| 全局注册表 | shared-context.ts | 通过 ID 跨代理访问 |

## 五、面试考点

> Q：融合代理和 LangGraph 的本质区别？

LangGraph 是显式图——你在代码里定义节点和边，执行路径可预测。融合代理是隐式图——LLM 在运行时决定派发谁、派发几个、要不要再来一轮。前者适合流程已知的场景，后者适合探索性任务。

> Q：SharedContext 解决了什么问题？

之前子代理只返回字符串摘要，orchestrator 丢失了结构化信息。SharedContext 让所有子代理写入结构化的 findings/decisions/artifacts，orchestrator 可以精确查询和汇总。

> Q：为什么不直接用 LangGraph？

NaughtyAgent 的核心优势是 LLM 动态决策。LangGraph 需要预定义图结构，对于"需求不明确的探索性长任务"不够灵活。但借鉴了它的 SharedState 思想。
