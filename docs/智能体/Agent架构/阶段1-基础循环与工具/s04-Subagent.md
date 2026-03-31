# s04 - Subagent

> 教材：`learn-claude-code-main/agents/s04_subagent.py`
> 作业：`packages/agent/src/tool/subagent/`

## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| Subagent | Subagent（子代理） | 用空白 messages 启动的独立 agent loop，完成后只返回摘要 |
| Context Isolation | Context Isolation（上下文隔离） | 子代理不继承父代理的对话历史，避免噪音污染 |
| Fork | Fork（分叉） | 子代理继承父代理上下文的副本，类似 Unix fork() |
| Summary Return | Summary Return（摘要返回） | 子代理只返回最终文本摘要，不返回中间过程 |
| Recursive Spawning | Recursive Spawning（递归生成） | 子代理再生成子代理，教材禁止此行为防止失控 |
| Delegation | Delegation（委派） | 父代理把子任务交给子代理执行 |
| Context Protection | Context Protection（上下文保护） | fork 模式的核心价值，子任务在副本里干活不污染主线 |

## 一、教材要点

s04 的核心洞察：**进程隔离天然带来上下文隔离。**


子代理本质：用空白 `messages=[]` 启动新的 agent loop，共享文件系统但不共享对话历史。

```python
def run_subagent(prompt: str) -> str:
    sub_messages = [{"role": "user", "content": prompt}]  # 全新上下文
    for _ in range(30):  # 安全限制
        response = client.messages.create(
            model=MODEL, system=SUBAGENT_SYSTEM, 
            messages=sub_messages, tools=CHILD_TOOLS, ...
        )
        # ... 标准 agent loop ...
    return "".join(b.text for b in response.content 
                   if hasattr(b, "text")) or "(no summary)"
```

关键设计：
- 子代理没有 `task` 工具，不能递归生成子代理
- 子代理用独立的 `SUBAGENT_SYSTEM` 提示词
- 父代理只收到一个摘要字符串

## 二、NaughtyAgent 现状

NaughtyAgent 有 7 种子代理模式，远超教材的 1 种：

| 工具 | 上下文 | 工具调用 | 用途 |
|------|--------|---------|------|
| `ask_llm` | 无（单次） | 无 | 简单问答 |
| `run_agent` | 独立会话 | 有 | 独立任务（= 教材 task） |
| `fork_agent` | 继承父上下文 | 有 | 保留上下文的分支执行 |
| `parallel_agents` | 多个独立 | 有 | 并行执行 + 结果融合 |
| `multi_agent` | 共享讨论 | 有 | 多角色协作 |
| `run_workflow` | 多阶段 | 有 | 结构化流程 |
| `task` | （待实现） | 有 | 教材兼容模式 |


## 三、fork_agent 的价值（NaughtyAgent 特色）

教材只有空上下文模式，但 fork 模式有独特价值：

### fork 解决的问题：上下文保护

```
场景：用户和 Agent 讨论了 20 轮架构方案

不用 fork：
  父代理继续干活 -> 上下文被实现细节污染 -> 架构讨论被挤出窗口

用 fork：
  fork 子代理（带上下文副本）-> 子代理专注实现 -> 返回摘要
  父代理上下文干净，还记得架构讨论
```

### 三种子代理模式对比

| 模式 | 上下文 | 适用场景 |
|------|--------|---------|
| `ask_llm` | 无（单次问答） | "帮我写个正则" |
| `run_agent` | 空（隔离） | "搜索代码库找某个函数" |
| `fork_agent` | 继承（副本） | "基于刚才的讨论，生成实现计划" |

### 与教材观点的分歧

教材认为继承上下文违背隔离原则。但 fork 不是"不隔离"，而是"带初始状态的隔离"。子代理拿到的是副本，后续操作不会写回父代理。这和 Unix 的 fork() 语义一致：子进程继承父进程的内存，但之后各自独立。

## 四、重构计划

保留核心 4 个：ask_llm、run_agent、fork_agent、task
暂时搁置高级模式（parallel_agents、multi_agent、run_workflow），等学完 s09-s11 再评估。
需要添加递归限制：子代理工具列表不包含 run_agent/fork_agent/task。

## 五、面试考点

> Q：为什么需要子代理？

上下文污染问题。子任务的工具调用噪音会挤占主 Agent 的上下文窗口。子代理隔离执行，只返回摘要。

> Q：子代理和主 Agent 的本质区别？

唯一区别是 `messages=[]`。共享文件系统，不共享对话历史。

> Q：fork_agent 和 run_agent 哪个更好？

各有场景。run_agent 适合独立任务（搜索、分析），fork_agent 适合需要延续讨论的任务（基于已有方案生成代码）。fork 的核心是上下文保护，不是违背隔离。
