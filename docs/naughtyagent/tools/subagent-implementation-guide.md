# 子 Agent 实现指南

## 目录

1. [概述](#概述)
2. [业界主流方案对比](#业界主流方案对比)
3. [核心架构模式](#核心架构模式)
4. [Claude Code 子 Agent 设计](#claude-code-子-agent-设计)
5. [OpenAI Swarm 设计](#openai-swarm-设计)
6. [LangGraph 多 Agent 编排](#langgraph-多-agent-编排)
7. [CrewAI 委托机制](#crewai-委托机制)
8. [AutoGen 对话模式](#autogen-对话模式)
9. [NaughtyAgent 实现建议](#naughtyagent-实现建议)
10. [最佳实践](#最佳实践)

---

## 概述

子 Agent（Subagent）是 AI Agent 系统中的核心能力，允许主 Agent 将任务委托给专门的子 Agent 执行。这种模式解决了几个关键问题：

1. **上下文窗口管理**：大型任务会耗尽主 Agent 的上下文窗口
2. **并行执行**：多个子 Agent 可以同时处理不同任务
3. **专业化分工**：不同子 Agent 可以有不同的工具集和系统提示
4. **隔离性**：子 Agent 的中间结果不会污染主对话


## 业界主流方案对比

| 框架 | 核心理念 | 子 Agent 模式 | 通信方式 | 适用场景 |
|------|---------|--------------|---------|---------|
| **Claude Code** | Task 工具 + 隔离上下文 | 独立实例，返回摘要 | 单向（父→子→结果） | 编程助手 |
| **OpenAI Swarm** | Routines + Handoffs | 无状态，控制权移交 | Handoff 函数 | 客服、流程 |
| **LangGraph** | 图状态机 | 节点即 Agent | 共享状态 + 边 | 复杂工作流 |
| **CrewAI** | 角色 + 委托 | 层级委托 | 任务传递 | 团队协作 |
| **AutoGen** | 对话驱动 | 多 Agent 聊天 | 消息传递 | 研究、讨论 |

---

## 核心架构模式

### 模式 1：独立实例模式（Claude Code）

```
主 Agent → Task 工具 → 子 Agent 实例（独立上下文）
                              ↓
                         独立执行任务
                              ↓
主 Agent ← 精炼结果摘要 ← 任务完成
```

**特点**：
- 每个子 Agent 有独立的上下文窗口
- 子 Agent 执行完毕后返回摘要，不是完整历史
- 父 Agent 无法监控子 Agent 执行过程
- 适合：大型任务分解、并行处理

### 模式 2：Handoff 模式（OpenAI Swarm）

```
Agent A → handoff_to_agent_b() → Agent B 接管控制
                                      ↓
                                 Agent B 执行
                                      ↓
                                 可能再次 handoff
```

**特点**：
- 无状态设计，每次调用独立
- 控制权完全移交，不是并行
- 通过函数返回值传递上下文
- 适合：流程型任务、客服路由

### 模式 3：图编排模式（LangGraph）

```
     ┌─────────────────────────────────┐
     │           共享状态              │
     └─────────────────────────────────┘
           ↑         ↑         ↑
     ┌─────┴───┐ ┌───┴───┐ ┌───┴─────┐
     │ Agent A │ │Agent B│ │ Agent C │
     └─────────┘ └───────┘ └─────────┘
           │         │         │
           └────→ 边 ←────────┘
```

**特点**：
- Agent 是图中的节点
- 通过边定义控制流
- 共享状态存储中间结果
- 适合：复杂工作流、需要回溯


---

## Claude Code 子 Agent 设计

Claude Code 的子 Agent 实现是目前最成熟的参考。

### 核心概念

**Task 工具**：主 Agent 通过 Task 工具生成子 Agent
```typescript
// 主 Agent 调用
Task({
  description: "分析 src/api/ 目录的代码结构",
  agent_type: "explore"  // explore | plan | build
})
```

**隔离上下文**：每个子 Agent 有独立的上下文窗口
- 不继承父对话历史
- 只接收任务描述和必要文件
- 返回精炼摘要，不是完整对话

**内置子 Agent 类型**：
| 类型 | 用途 | 工具权限 |
|------|------|---------|
| Explore | 代码探索、只读分析 | read, glob, grep |
| Plan | 规划阶段研究 | read, glob, grep |
| Build | 完整任务执行 | 全部工具 |

### 自定义子 Agent

Claude Code 支持通过 Markdown 文件定义自定义子 Agent：

```markdown
# .claude/agents/security-reviewer.md

---
name: security-reviewer
description: 分析代码安全漏洞，专注 OWASP Top 10
tools:
  - read
  - glob
  - grep
model: sonnet
permissionMode: plan  # 只读模式
---

## 系统提示

你是安全审计专家，专注于：
1. 注入漏洞（SQL、命令、XSS）
2. 认证和会话处理
3. 敏感数据处理

返回结构化报告，包含严重级别和修复建议。
```

### 并行执行模式

```
"使用 4 个并行任务重构代码库：
- 任务 1: 重构 src/components/auth/*
- 任务 2: 重构 src/components/dashboard/*
- 任务 3: 重构 src/components/settings/*
- 任务 4: 重构 src/components/shared/*"
```

**关键洞察**：
- 显式指定并行比自动并行效果更好
- 每个任务需要明确的范围边界
- 避免多个子 Agent 操作同一文件



---

## OpenAI Swarm 设计

OpenAI Swarm 是一个轻量级的多 Agent 编排框架，核心理念是"无状态"和"控制权移交"。

### 核心概念

**Routines（例程）**：定义 Agent 的行为模式
```python
# Swarm Agent 定义
sales_agent = Agent(
    name="Sales Agent",
    instructions="你是销售专家，帮助客户选择产品...",
    functions=[get_products, check_inventory, handoff_to_support]
)
```

**Handoffs（移交）**：Agent 之间的控制权转移
```python
def handoff_to_support():
    """将对话移交给技术支持 Agent"""
    return support_agent  # 返回另一个 Agent 实例
```

### 设计哲学

1. **无状态**：每次调用独立，不保留会话状态
2. **函数即工具**：Python 函数自动转换为 Agent 工具
3. **显式移交**：通过返回 Agent 实例实现控制权转移
4. **上下文变量**：通过 `context_variables` 传递状态

### 典型流程

```
用户 → Triage Agent → 判断意图
                         ↓
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
    Sales Agent    Support Agent    Refund Agent
         ↓               ↓               ↓
    处理销售咨询    处理技术问题    处理退款请求
```

### 代码示例

```python
from swarm import Swarm, Agent

# 定义移交函数
def transfer_to_sales():
    return sales_agent

def transfer_to_support():
    return support_agent

# 定义 Agents
triage_agent = Agent(
    name="Triage",
    instructions="判断用户意图，路由到合适的 Agent",
    functions=[transfer_to_sales, transfer_to_support]
)

sales_agent = Agent(
    name="Sales",
    instructions="处理销售相关问题",
    functions=[get_products, create_order]
)

# 运行
client = Swarm()
response = client.run(
    agent=triage_agent,
    messages=[{"role": "user", "content": "我想买一台笔记本"}]
)
```

### 适用场景

- 客服路由系统
- 流程型任务（审批、工单）
- 需要明确分工的场景

### 局限性

- 不支持真正的并行执行
- 无内置状态管理
- 移交后无法返回原 Agent



---

## LangGraph 多 Agent 编排

LangGraph 是 LangChain 团队开发的图状态机框架，专为复杂 Agent 工作流设计。

### 核心概念

**StateGraph**：定义工作流的状态和转换
```python
from langgraph.graph import StateGraph, END

# 定义状态 Schema
class AgentState(TypedDict):
    messages: list[BaseMessage]
    next_agent: str
    results: dict

# 创建图
workflow = StateGraph(AgentState)
```

**节点（Nodes）**：每个节点是一个 Agent 或处理函数
```python
# 添加 Agent 节点
workflow.add_node("researcher", researcher_agent)
workflow.add_node("writer", writer_agent)
workflow.add_node("reviewer", reviewer_agent)
```

**边（Edges）**：定义节点之间的控制流
```python
# 条件边：根据状态决定下一步
workflow.add_conditional_edges(
    "researcher",
    should_continue,  # 路由函数
    {
        "continue": "writer",
        "end": END
    }
)
```

### 架构图

```
                    ┌─────────────┐
                    │   START     │
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
              ┌─────│ Researcher  │─────┐
              │     └─────────────┘     │
              ↓                         ↓
       ┌─────────────┐           ┌─────────────┐
       │   Writer    │           │    END      │
       └──────┬──────┘           └─────────────┘
              ↓
       ┌─────────────┐
       │  Reviewer   │──────┐
       └──────┬──────┘      │
              ↓             │ (需要修改)
       ┌─────────────┐      │
       │    END      │←─────┘
       └─────────────┘
```

### 共享状态模式

LangGraph 的核心优势是共享状态：

```python
# 状态在所有节点间共享
def researcher_node(state: AgentState):
    # 读取之前的结果
    previous_results = state.get("results", {})
    
    # 执行研究
    research = do_research(state["messages"])
    
    # 更新状态
    return {
        "results": {**previous_results, "research": research},
        "next_agent": "writer"
    }
```

### 人机协作（Human-in-the-Loop）

```python
# 添加人工审核节点
workflow.add_node("human_review", human_review_node)

# 在关键步骤插入人工审核
workflow.add_edge("writer", "human_review")
workflow.add_conditional_edges(
    "human_review",
    lambda x: x["human_decision"],
    {"approve": "reviewer", "reject": "writer"}
)
```

### 适用场景

- 复杂工作流（需要回溯、分支）
- 需要人工审核的流程
- 多 Agent 协作（共享状态）
- 可视化调试需求

### 局限性

- 学习曲线较陡
- 状态管理复杂度高
- 不适合简单任务



---

## CrewAI 委托机制

CrewAI 采用"团队协作"隐喻，将 Agent 组织成有角色分工的团队。

### 核心概念

**Agent（代理）**：具有特定角色和目标的 AI 实体
```python
from crewai import Agent

researcher = Agent(
    role="高级研究员",
    goal="发现关于 {topic} 的最新信息",
    backstory="你是一位经验丰富的研究员...",
    tools=[search_tool, web_scraper],
    allow_delegation=True  # 允许委托任务
)
```

**Task（任务）**：分配给 Agent 的具体工作
```python
from crewai import Task

research_task = Task(
    description="研究 {topic} 的最新发展",
    expected_output="详细的研究报告",
    agent=researcher
)
```

**Crew（团队）**：Agent 的集合，定义协作方式
```python
from crewai import Crew, Process

crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, write_task, edit_task],
    process=Process.sequential  # 或 Process.hierarchical
)
```

### 委托机制

CrewAI 的核心特性是 Agent 之间的任务委托：

```python
# 启用委托
manager = Agent(
    role="项目经理",
    goal="协调团队完成项目",
    allow_delegation=True,  # 可以委托任务
    verbose=True
)

# 委托发生时
# Manager: "我需要将数据分析任务委托给数据分析师"
# → 自动调用 data_analyst Agent
# → 结果返回给 Manager
```

### 层级模式

```
                    ┌─────────────┐
                    │   Manager   │
                    └──────┬──────┘
                           │ 委托
         ┌─────────────────┼─────────────────┐
         ↓                 ↓                 ↓
    ┌─────────┐      ┌─────────┐      ┌─────────┐
    │Researcher│      │ Writer  │      │ Editor  │
    └─────────┘      └─────────┘      └─────────┘
```

### 代码示例

```python
from crewai import Agent, Task, Crew, Process

# 定义团队成员
researcher = Agent(
    role="研究员",
    goal="收集准确的信息",
    backstory="你是资深研究员",
    tools=[search_tool]
)

writer = Agent(
    role="作家",
    goal="撰写引人入胜的内容",
    backstory="你是专业作家"
)

# 定义任务
research_task = Task(
    description="研究 AI Agent 的最新发展",
    agent=researcher,
    expected_output="研究报告"
)

write_task = Task(
    description="基于研究撰写文章",
    agent=writer,
    expected_output="完整文章",
    context=[research_task]  # 依赖研究任务
)

# 组建团队
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    process=Process.sequential,
    verbose=True
)

# 执行
result = crew.kickoff()
```

### 适用场景

- 内容创作流水线
- 需要明确角色分工的项目
- 层级管理结构

### 局限性

- 角色定义需要精心设计
- 委托逻辑不够透明
- 调试困难



---

## AutoGen 对话模式

Microsoft AutoGen 采用"对话驱动"的多 Agent 协作模式。

### 核心概念

**ConversableAgent**：可对话的 Agent 基类
```python
from autogen import ConversableAgent

assistant = ConversableAgent(
    name="assistant",
    system_message="你是一个有帮助的 AI 助手",
    llm_config={"model": "gpt-4"}
)
```

**GroupChat**：多 Agent 群聊
```python
from autogen import GroupChat, GroupChatManager

group_chat = GroupChat(
    agents=[user_proxy, coder, reviewer],
    messages=[],
    max_round=10
)
```

### 对话模式

AutoGen 的核心是 Agent 之间的对话：

```
User Proxy: "请帮我写一个排序算法"
     ↓
Coder: "好的，这是快速排序实现..."
     ↓
Reviewer: "代码有个边界问题..."
     ↓
Coder: "已修复，更新后的代码..."
     ↓
User Proxy: "TERMINATE"（结束信号）
```

### 代码示例

```python
from autogen import AssistantAgent, UserProxyAgent, GroupChat

# 定义 Agents
user_proxy = UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",  # 自动模式
    code_execution_config={"work_dir": "coding"}
)

coder = AssistantAgent(
    name="coder",
    system_message="你是专业程序员，编写高质量代码",
    llm_config=llm_config
)

reviewer = AssistantAgent(
    name="reviewer",
    system_message="你是代码审查专家，发现潜在问题",
    llm_config=llm_config
)

# 创建群聊
group_chat = GroupChat(
    agents=[user_proxy, coder, reviewer],
    messages=[],
    max_round=12,
    speaker_selection_method="auto"  # 自动选择发言者
)

manager = GroupChatManager(groupchat=group_chat)

# 启动对话
user_proxy.initiate_chat(
    manager,
    message="请实现一个线程安全的单例模式"
)
```

### 发言者选择策略

```python
# 自动选择（LLM 决定）
speaker_selection_method="auto"

# 轮询
speaker_selection_method="round_robin"

# 随机
speaker_selection_method="random"

# 自定义函数
def custom_speaker_selection(last_speaker, groupchat):
    if last_speaker == coder:
        return reviewer
    return coder
```

### 嵌套对话

AutoGen 支持 Agent 内部启动子对话：

```python
# 在 Agent 内部启动嵌套对话
class NestedAgent(ConversableAgent):
    def generate_reply(self, messages, sender):
        # 启动子对话解决子问题
        sub_result = self.initiate_chat(
            sub_agent,
            message="解决这个子问题..."
        )
        return f"子问题结果: {sub_result}"
```

### 适用场景

- 代码生成与审查
- 研究讨论
- 需要多轮迭代的任务

### 局限性

- 对话可能发散
- 终止条件需要精心设计
- Token 消耗较高



---

## NaughtyAgent 实现建议

基于以上调研，为 NaughtyAgent 提出以下实现建议。

### 当前架构分析

NaughtyAgent 已有的子 Agent 工具：

| 工具 | 用途 | 特点 |
|------|------|------|
| `ask_llm` | 简单 LLM 调用 | 无工具，快速响应 |
| `run_agent` | 完整子 Agent | 独立上下文，有工具 |
| `fork_agent` | 分叉 Agent | 继承父上下文 |
| `multi_agent` | 多 Agent 协作 | 顺序执行多个 Agent |
| `parallel_agents` | 并行 Agent | 并行执行多个任务 |
| `run_workflow` | 工作流执行 | 按步骤执行 |

### 建议 1：采用 Claude Code 的 Task 模式

**理由**：
- 与 NaughtyAgent 的编程助手定位一致
- 独立上下文模式已经实现
- 用户体验成熟

**实现要点**：
```typescript
// 统一的 Task 工具接口
interface TaskParams {
  description: string;
  type: "explore" | "plan" | "build" | "custom";
  customAgent?: string;  // 自定义 Agent 路径
  files?: string[];      // 初始文件上下文
  tools?: string[];      // 工具白名单
}
```

### 建议 2：增强事件传递机制

当前问题：子 Agent 执行时 UI 无法显示进度。

**解决方案**：全局事件总线
```typescript
// 已实现的事件类型
interface SubAgentEvent {
  type: "start" | "progress" | "tool_call" | "complete" | "error";
  agentId: string;
  parentId?: string;
  data: any;
}

// 建议增强：添加流式文本事件
interface SubAgentTextEvent {
  type: "text_delta";
  agentId: string;
  delta: string;
}
```

### 建议 3：实现 Abort 信号链

**问题**：Ctrl+C 无法停止子 Agent。

**解决方案**（已部分实现）：
```typescript
// 1. SubTaskProvider 接口添加 abort 参数
interface SubTaskProvider {
  chat(params: ChatParams & { abort?: AbortSignal }): Promise<Result>;
}

// 2. 传递链
// CLI → Agent Loop → Tool Execute → SubTaskProvider → 子 Agent Loop
//                                                          ↓
//                                                    检查 abort.aborted
```

### 建议 4：自定义子 Agent 支持

参考 Claude Code，支持通过 Markdown 定义自定义子 Agent：

```markdown
# .naughty/agents/code-reviewer.md

---
name: code-reviewer
description: 代码审查专家
tools: [read, glob, grep]
model: claude-sonnet
---

## 系统提示

你是代码审查专家，专注于：
1. 代码质量和可维护性
2. 潜在 Bug 和边界情况
3. 性能问题

输出结构化审查报告。
```

**加载逻辑**：
```typescript
// 扫描 .naughty/agents/ 目录
const customAgents = await loadCustomAgents(".naughty/agents/");

// 注册为可用的子 Agent 类型
for (const agent of customAgents) {
  registerSubAgentType(agent.name, agent);
}
```

### 建议 5：并行执行优化

当前 `parallel_agents` 工具的问题：
- 无法控制并发数
- 错误处理不够优雅

**改进方案**：
```typescript
interface ParallelAgentsParams {
  tasks: TaskDefinition[];
  maxConcurrency?: number;  // 最大并发数，默认 3
  failFast?: boolean;       // 遇错即停，默认 false
  timeout?: number;         // 单任务超时
}

// 使用 Promise.allSettled 而非 Promise.all
const results = await Promise.allSettled(
  tasks.map(task => executeWithTimeout(task, timeout))
);
```

### 建议 6：状态可视化

参考 LangGraph 的状态管理，为复杂工作流提供可视化：

```
┌─────────────────────────────────────────────┐
│ 工作流: 代码重构                              │
├─────────────────────────────────────────────┤
│ [✓] 分析代码结构        2.3s                 │
│ [✓] 识别重构点          1.8s                 │
│ [→] 执行重构            进行中...            │
│     ├─ [✓] 重构 auth/   完成                 │
│     ├─ [→] 重构 api/    进行中               │
│     └─ [ ] 重构 utils/  等待中               │
│ [ ] 运行测试            等待中               │
│ [ ] 生成报告            等待中               │
└─────────────────────────────────────────────┘
```



---

## 最佳实践

### 1. 任务分解原则

**好的分解**：
```
"重构 src/components/ 目录"
  → 子任务 1: 分析当前组件结构（explore）
  → 子任务 2: 制定重构计划（plan）
  → 子任务 3-N: 按组件执行重构（build）
```

**差的分解**：
```
"重构整个项目"  // 太大，无法有效执行
"修改一行代码"  // 太小，不需要子 Agent
```

### 2. 上下文传递策略

| 策略 | 适用场景 | 示例 |
|------|---------|------|
| 最小上下文 | 独立任务 | 只传递任务描述 |
| 文件上下文 | 代码分析 | 传递相关文件路径 |
| 摘要上下文 | 依赖前序结果 | 传递前一步的摘要 |
| 完整上下文 | 需要历史 | fork 模式继承 |

### 3. 错误处理模式

```typescript
// 推荐：优雅降级
try {
  const result = await subAgent.execute(task);
  return result;
} catch (error) {
  if (error.name === "AbortError") {
    return { status: "cancelled", partial: error.partialResult };
  }
  if (error.name === "TimeoutError") {
    return { status: "timeout", suggestion: "尝试分解任务" };
  }
  // 记录错误但不中断主流程
  logger.error("子 Agent 执行失败", { task, error });
  return { status: "failed", error: error.message };
}
```

### 4. 并行执行注意事项

**避免冲突**：
- 不要让多个子 Agent 同时修改同一文件
- 使用文件锁或分区策略

**资源控制**：
- 限制并发数（建议 3-5）
- 设置单任务超时
- 监控总 Token 消耗

### 5. 可观测性

**必须记录的信息**：
- 子 Agent 启动/结束时间
- 工具调用序列
- Token 消耗
- 错误和重试

**推荐的日志格式**：
```
[SubAgent:abc123] Started: "分析代码结构"
[SubAgent:abc123] Tool: read_file("src/index.ts")
[SubAgent:abc123] Tool: glob("src/**/*.ts")
[SubAgent:abc123] Completed: 2.3s, 1,234 tokens
```

### 6. 用户体验

**进度反馈**：
- 显示当前执行的子 Agent
- 显示工具调用（简化版）
- 显示预估剩余时间

**中断支持**：
- Ctrl+C 应该能停止所有子 Agent
- 提供部分结果而非完全失败

**结果呈现**：
- 摘要优先，详情可展开
- 错误信息要有可操作性

---

## 总结

子 Agent 实现的核心挑战：

1. **上下文管理**：独立 vs 共享，各有利弊
2. **控制流**：顺序、并行、条件分支
3. **可观测性**：用户需要知道发生了什么
4. **错误处理**：优雅降级，不要全盘失败
5. **资源控制**：Token、时间、并发数

NaughtyAgent 的建议路线：

1. **短期**：完善事件传递，解决 UI 可见性问题
2. **中期**：实现自定义子 Agent，增加灵活性
3. **长期**：考虑图编排模式，支持复杂工作流

---

## 参考资料

- [Claude Code 文档](https://docs.anthropic.com/claude-code)
- [OpenAI Swarm](https://github.com/openai/swarm)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [CrewAI 文档](https://docs.crewai.com/)
- [AutoGen 文档](https://microsoft.github.io/autogen/)
- [Agentic Patterns](https://www.anthropic.com/research/building-effective-agents)

