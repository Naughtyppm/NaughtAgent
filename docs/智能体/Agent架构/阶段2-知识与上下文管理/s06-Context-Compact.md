# s06 - Context Compact

> 教材：`learn-claude-code-main/agents/s06_context_compact.py`
> 作业：`packages/agent/src/subtask/context/summary.ts`

## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| Context Compact | Context Compact（上下文压缩） | 在不丢失关键信息的前提下缩减对话历史 |
| Micro Compact | Micro Compact（微压缩） | 每轮静默执行，替换旧工具结果为占位符 |
| Auto Compact | Auto Compact（自动压缩） | Token 超阈值时触发，LLM 生成摘要替换全部历史 |
| Manual Compact | Manual Compact（手动压缩） | LLM 主动调用 compact 工具触发压缩 |
| Transcript | Transcript（转录） | 压缩前保存的完整对话记录，用于审计和恢复 |
| Sliding Window | Sliding Window（滑动窗口） | 只保留最近 N 条消息的压缩策略 |
| Importance Scoring | Importance Scoring（重要性评分） | 按内容特征给消息打分，保留高分消息 |
| Token Budget | Token Budget（Token 预算） | 分配给各部分（system/context/history/response）的 Token 上限 |

## 一、教材要点

核心洞察：**Agent 可以战略性地遗忘，从而永远工作下去。**

### 三层压缩管道

```
每一轮 LLM 调用前：
  │
  ▼
Layer 1: micro_compact（静默，每轮执行）
  把 3 轮之前的 tool_result 替换为 "[Previous: used {tool_name}]"
  效果：旧工具输出（可能几千 tokens）→ 一行占位符
  │
  ▼
检查：tokens > 50000？
  │         │
  否        是
  │         │
  ▼         ▼
继续     Layer 2: auto_compact
           1. 保存完整对话到 .transcripts/
           2. LLM 生成摘要
           3. 用 [summary] + ack 替换全部消息
  │
  ▼
Layer 3: compact 工具（LLM 主动触发）
  LLM 觉得上下文太乱时，自己调用 compact
  执行逻辑和 auto_compact 一样
```

### 教材关键代码

```python
# Layer 1: 替换旧工具结果
def micro_compact(messages):
    # 找到所有 tool_result
    # 保留最近 3 个，其余替换为占位符
    for _, _, result in to_clear:
        tool_name = tool_name_map.get(result["tool_use_id"], "unknown")
        result["content"] = f"[Previous: used {tool_name}]"

# Layer 2: LLM 摘要替换
def auto_compact(messages):
    # 1. 保存完整转录到磁盘
    transcript_path = f".transcripts/transcript_{time}.jsonl"
    # 2. LLM 生成摘要
    summary = llm.summarize(messages)
    # 3. 替换全部消息为 2 条
    return [
        {"role": "user", "content": f"[Compressed]\n{summary}"},
        {"role": "assistant", "content": "Understood. Continuing."},
    ]

# 在 agent_loop 中的位置
def agent_loop(messages):
    while True:
        micro_compact(messages)           # ← 每轮
        if estimate_tokens(messages) > 50000:
            messages[:] = auto_compact(messages)  # ← 超阈值
        response = llm.call(messages)
        # ... 工具执行 ...
        if manual_compact:
            messages[:] = auto_compact(messages)  # ← LLM 主动
```

### 设计哲学

- micro_compact 是**无损的**：工具名保留了，只是输出内容被替换
- auto_compact 是**有损的**：整个对话被摘要替换，但转录保存在磁盘
- compact 工具让 LLM 有**自主权**：它觉得乱了就自己压缩

## 二、NaughtyAgent 现状

NaughtyAgent 在 `subtask/context/` 下已经有一套压缩基础设施：

### 已有能力

| 组件 | 文件 | 能力 |
|------|------|------|
| TokenBudgetManager | budget.ts | Token 预算分配和追踪 |
| compressBySlidingWindow | summary.ts | 滑动窗口（保留最近 N 条） |
| compressByImportance | summary.ts | 重要性评分排序 |
| compressMessages | summary.ts | 混合策略（窗口 + 重要性） |
| generateSimpleSummary | summary.ts | 不用 LLM 的简单摘要 |
| generateLLMSummary | summary.ts | 用 LLM 生成摘要 |
| extractKeyFiles | summary.ts | 从对话中提取涉及的文件 |
| extractKeyDecisions | summary.ts | 从对话中提取关键决策 |

### 缺失的部分

| 教材有 | NaughtyAgent 缺 | 影响 |
|--------|-----------------|------|
| micro_compact（每轮静默） | ❌ 没有 | 旧工具输出一直占 token，上下文膨胀快 |
| auto_compact（阈值触发） | ❌ 没有集成到 Loop | 压缩函数存在但 Loop 不调用 |
| compact 工具（LLM 主动） | ❌ 没有 | LLM 无法自主决定何时压缩 |
| 转录保存 | ❌ 没有 | 压缩后无法审计或恢复 |
| 集成到 Agent Loop | ❌ 没有 | 所有压缩能力都在 subtask 里，主 Loop 不用 |

核心问题：**NaughtyAgent 有压缩的零件，但没有装到引擎上。**

## 三、差距分析

```
教材的三层管道：
  Loop 每轮 → micro_compact → 检查阈值 → auto_compact
                                          ↑
                              compact 工具（LLM 主动）

NaughtyAgent 现状：
  Loop 每轮 → （什么都不做）→ 直接调 LLM
  subtask/context/ 里有压缩函数，但只给 fork_agent 用

差距：
  1. 主 Loop 没有压缩管道
  2. 没有 micro_compact（旧工具结果替换）
  3. 没有 compact 工具（LLM 自主触发）
  4. 没有转录保存
```

NaughtyAgent 的 `compressMessages` 和 `generateLLMSummary` 其实比教材更丰富（有重要性评分、关键文件提取），但这些能力被锁在 subtask 模块里，主 Loop 完全不知道它们的存在。

## 四、改进方向

### 需要做的事

1. 实现 `microCompact`：在 Loop 每轮调用前，替换旧 tool_result
2. 在 Loop 中加入阈值检查：超过阈值时调用现有的 `generateLLMSummary`
3. 注册 `compact` 工具：让 LLM 能主动触发压缩
4. 加入转录保存：压缩前把完整对话写到磁盘

### 与融合代理的关系

上下文压缩是 Orchestrator Loop 的**生命线**：

```
Orchestrator 多轮编排：
  第1轮：派3个worker → 收集findings → 上下文+3000 tokens
  第2轮：再派2个worker → 收集findings → 上下文+2000 tokens
  第3轮：再派... → 上下文爆了

有了压缩管道：
  第1轮：派3个worker → 收集findings → micro_compact 清旧结果
  第2轮：再派2个worker → 收集findings → micro_compact
  第N轮：超阈值 → auto_compact → 摘要替换 → 继续工作
  → 可以无限轮次编排
```

没有 Context Compact，融合代理跑几轮就会上下文爆满。
这就是 TODO 里说的：s06 解决"长任务上下文爆满"问题。

## 五、面试考点

> Q：为什么需要三层压缩而不是一层？

单层压缩要么太激进（丢信息），要么太保守（不够用）。
三层是渐进式的：micro 是无损的（只替换旧输出），auto 是有损的（LLM 摘要），
manual 是自主的（LLM 判断时机）。大部分时候 micro 就够了，
auto 是兜底，manual 是给 LLM 的自主权。

> Q：micro_compact 为什么只替换 tool_result 不替换 tool_use？

tool_use 记录了"做了什么"（意图），tool_result 记录了"结果是什么"（数据）。
意图很短且重要，数据很长且会过时。保留意图、丢弃旧数据是最优策略。

> Q：auto_compact 为什么要保存转录？

两个原因：1）审计——出了问题可以回溯完整对话；
2）恢复——理论上可以从转录重建上下文（虽然教材没实现）。

> Q：这和 Orchestrator Loop 有什么关系？

Orchestrator 每轮派发 worker、收集结果，上下文增长很快。
没有压缩管道，几��就爆了。micro_compact 让每轮的旧 worker 结果
被替换为占位符，auto_compact 在极端情况下重置上下文。
这是融合代理能"无限轮次编排"的前提。
