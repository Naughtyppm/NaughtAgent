---
tags:
  - deep-dive
  - langchain
  - langgraph
  - autogpt
  - agent
  - interview
aliases:
  - LangChain 核心机制
  - AutoGPT 原理
date: 2026-01-31
---

Related: [[Report-Agent-Survey]] | [[NaughtyAgent]] | [[ReAct]] | [[Tool Use]]

# LangChain / LangGraph / AutoGPT 核心机制深度解析

> 本文是 [[Report-Agent-Survey]] 的补充，深入讲解面试常问的核心机制

---

## 1. LangChain 核心机制

### 1.1 设计哲学

LangChain 的核心思想是 **组件化 + 链式组合**：

```
┌─────────────────────────────────────────────────────────────┐
│                    LangChain 设计哲学                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  "把 LLM 应用拆成乐高积木，按需组装"                         │
│                                                             │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐    │
│  │ Prompt  │ + │   LLM   │ + │ Parser  │ + │  Tool   │    │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘    │
│       │             │             │             │          │
│       └─────────────┴─────────────┴─────────────┘          │
│                         │                                   │
│                    Chain / Agent                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```



### 1.2 核心抽象层

```python
# LangChain 的 6 大核心抽象

┌─────────────────────────────────────────────────────────────┐
│  1. Model I/O（模型输入输出）                                │
│     ├── PromptTemplate    # 提示词模板                      │
│     ├── LLM / ChatModel   # 语言模型封装                    │
│     └── OutputParser      # 输出解析器                      │
├─────────────────────────────────────────────────────────────┤
│  2. Retrieval（检索）                                       │
│     ├── DocumentLoader    # 文档加载器                      │
│     ├── TextSplitter      # 文本分割器                      │
│     ├── Embeddings        # 向量嵌入                        │
│     └── VectorStore       # 向量存储                        │
├─────────────────────────────────────────────────────────────┤
│  3. Chains（链）                                            │
│     ├── LLMChain          # 基础链                          │
│     ├── SequentialChain   # 顺序链                          │
│     └── RouterChain       # 路由链                          │
├─────────────────────────────────────────────────────────────┤
│  4. Agents（代理）                                          │
│     ├── Agent             # 决策逻辑                        │
│     ├── AgentExecutor     # 执行引擎                        │
│     └── Tools             # 工具集合                        │
├─────────────────────────────────────────────────────────────┤
│  5. Memory（记忆）                                          │
│     ├── ConversationBufferMemory    # 完整历史              │
│     ├── ConversationSummaryMemory   # 摘要记忆              │
│     └── VectorStoreMemory           # 向量记忆              │
├─────────────────────────────────────────────────────────────┤
│  6. Callbacks（回调）                                       │
│     ├── StdOutCallbackHandler       # 标准输出              │
│     ├── StreamingCallbackHandler    # 流式输出              │
│     └── CustomCallbackHandler       # 自定义回调            │
└─────────────────────────────────────────────────────────────┘
```



### 1.3 LCEL（LangChain Expression Language）

**面试重点**：LCEL 是 LangChain 的声明式语法，用 `|` 管道符组合组件。

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser

# LCEL 链式语法
chain = (
    ChatPromptTemplate.from_template("讲一个关于{topic}的笑话")
    | ChatOpenAI(model="gpt-4")
    | StrOutputParser()
)

# 调用
result = chain.invoke({"topic": "程序员"})
```

**LCEL 的优势**：
1. **流式支持**：自动支持 `.stream()` 流式输出
2. **批处理**：自动支持 `.batch()` 批量处理
3. **异步**：自动支持 `.ainvoke()` 异步调用
4. **可组合**：任意组件可通过 `|` 组合



### 1.4 Agent 执行机制（ReAct 模式）

**面试必问**：LangChain Agent 基于 ReAct（Reasoning + Acting）论文实现。

```
┌─────────────────────────────────────────────────────────────┐
│                    ReAct 循环                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户输入: "北京今天天气怎么样？"                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Thought: 我需要查询北京的天气信息                   │   │
│  │  Action: weather_tool                               │   │
│  │  Action Input: {"city": "北京"}                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Observation: 北京今天晴，气温 25°C                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Thought: 我已经获得了天气信息，可以回答用户        │   │
│  │  Final Answer: 北京今天天气晴朗，气温 25°C          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**ReAct Prompt 模板核心**：

```
Answer the following questions as best you can. You have access to the following tools:

{tools}

Use the following format:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

Begin!

Question: {input}
Thought: {agent_scratchpad}
```

### 1.5 Tool 定义机制

```python
from langchain.tools import tool
from pydantic import BaseModel, Field

# 方式 1：装饰器定义
@tool
def search(query: str) -> str:
    """搜索互联网获取信息"""
    return f"搜索结果: {query}"

# 方式 2：Pydantic Schema 定义（推荐）
class SearchInput(BaseModel):
    query: str = Field(description="搜索关键词")
    max_results: int = Field(default=10, description="最大结果数")

@tool(args_schema=SearchInput)
def search_v2(query: str, max_results: int) -> str:
    """搜索互联网获取信息"""
    return f"搜索 {query}，返回 {max_results} 条结果"
```

**Tool 的关键属性**：
- `name`：工具名称（LLM 用来选择）
- `description`：工具描述（LLM 用来理解何时使用）
- `args_schema`：参数 Schema（LLM 用来构造输入）

---

## 2. LangGraph 核心机制

### 2.1 为什么需要 LangGraph？

LangChain 的局限：
- **线性执行**：Chain 只能顺序执行，无法循环
- **状态管理弱**：Memory 是隐式的，难以精确控制
- **并行困难**：多分支并行需要手动实现

LangGraph 解决方案：**图状态机**

```
┌─────────────────────────────────────────────────────────────┐
│              LangChain vs LangGraph                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LangChain (链式)           LangGraph (图式)                │
│                                                             │
│  A → B → C → D              A ──→ B ──→ C                   │
│                              ↑         │                    │
│  只能单向流动                  │    ┌────┘                    │
│                              │    ↓                         │
│                              └── D ──→ E                    │
│                                                             │
│                             支持循环、分支、并行             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心概念

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator

# 1. 定义状态（State）—— 图的全局数据
class AgentState(TypedDict):
    messages: Annotated[list, operator.add]  # 消息累加
    next_action: str                          # 下一步动作

# 2. 定义节点（Node）—— 处理逻辑
def agent_node(state: AgentState) -> AgentState:
    """Agent 决策节点"""
    # 调用 LLM 决定下一步
    return {"next_action": "use_tool"}

def tool_node(state: AgentState) -> AgentState:
    """工具执行节点"""
    # 执行工具
    return {"messages": ["工具执行结果"]}

# 3. 定义边（Edge）—— 流转逻辑
def should_continue(state: AgentState) -> str:
    """条件边：决定下一个节点"""
    if state["next_action"] == "finish":
        return END
    return "tool"

# 4. 构建图
graph = StateGraph(AgentState)

# 添加节点
graph.add_node("agent", agent_node)
graph.add_node("tool", tool_node)

# 添加边
graph.add_edge("tool", "agent")  # 工具 → Agent（固定边）
graph.add_conditional_edges(     # Agent → ? （条件边）
    "agent",
    should_continue,
    {"tool": "tool", END: END}
)

# 设置入口
graph.set_entry_point("agent")

# 编译
app = graph.compile()
```

### 2.3 状态管理机制

**面试重点**：LangGraph 的状态是显式的、类型安全的。

```python
from typing import TypedDict, Annotated
import operator

class AgentState(TypedDict):
    # 累加器模式：新消息追加到列表
    messages: Annotated[list, operator.add]

    # 覆盖模式：新值覆盖旧值
    current_step: str

    # 计数器模式
    iteration_count: Annotated[int, operator.add]
```

**Annotated 的作用**：
- `operator.add`：新值与旧值相加（列表追加、数字累加）
- 无 Annotated：新值直接覆盖旧值

### 2.4 Human-in-the-Loop（人工介入）

```python
from langgraph.checkpoint.memory import MemorySaver

# 添加检查点（支持暂停/恢复）
memory = MemorySaver()
app = graph.compile(checkpointer=memory, interrupt_before=["tool"])

# 执行到 tool 节点前暂停
config = {"configurable": {"thread_id": "1"}}
result = app.invoke({"messages": ["查询天气"]}, config)

# 人工审核后继续
app.invoke(None, config)  # 继续执行
```

### 2.5 并行执行

```python
from langgraph.graph import StateGraph

graph = StateGraph(AgentState)

# 添加并行分支
graph.add_node("search_web", search_web_node)
graph.add_node("search_db", search_db_node)
graph.add_node("merge", merge_results_node)

# 从 start 同时到两个搜索节点（并行）
graph.add_edge("start", "search_web")
graph.add_edge("start", "search_db")

# 两个搜索都完成后到 merge
graph.add_edge("search_web", "merge")
graph.add_edge("search_db", "merge")
```

---

## 3. AutoGPT 核心机制

### 3.1 设计哲学

AutoGPT 的核心思想是 **目标驱动的自主循环**：

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoGPT 设计哲学                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  "给 AI 一个目标，让它自己想办法完成"                        │
│                                                             │
│  传统 Agent:  用户 → 指令 → AI → 结果                       │
│                                                             │
│  AutoGPT:     用户 → 目标 → AI 自主规划 → 自主执行 → 结果   │
│                        ↑                    │               │
│                        └────────────────────┘               │
│                           持续循环直到完成                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心循环（OODA Loop 变体）

**面试重点**：AutoGPT 使用 Goal → Think → Act → Observe 循环。

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoGPT 主循环                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. GOAL（目标）                                     │   │
│  │     • 用户设定的最终目标                            │   │
│  │     • 分解为子目标列表                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2. THINK（思考）                                    │   │
│  │     • 分析当前状态                                  │   │
│  │     • 回顾历史行动和结果                            │   │
│  │     • 决定下一步行动                                │   │
│  │     • 输出: Thoughts + Reasoning + Plan             │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  3. ACT（行动）                                      │   │
│  │     • 选择工具/命令                                 │   │
│  │     • 构造参数                                      │   │
│  │     • 执行命令                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  4. OBSERVE（观察）                                  │   │
│  │     • 获取执行结果                                  │   │
│  │     • 更新记忆                                      │   │
│  │     • 评估是否达成目标                              │   │
│  │     • 未完成 → 回到 THINK                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Prompt 结构

AutoGPT 的 System Prompt 非常复杂，核心结构：

```
You are {ai_name}, {ai_role}
Your decisions must always be made independently.

GOALS:
1. {goal_1}
2. {goal_2}
...

CONSTRAINTS:
1. ~4000 word limit for short term memory
2. No user assistance
3. Exclusively use the commands listed below

COMMANDS:
1. Google Search: "google", args: "input": "<search>"
2. Browse Website: "browse_website", args: "url": "<url>"
3. Write to file: "write_to_file", args: "filename": "<filename>", "text": "<text>"
4. Read file: "read_file", args: "filename": "<filename>"
5. Execute Python: "execute_python_file", args: "filename": "<filename>"
...

RESOURCES:
1. Internet access for searches and information gathering
2. Long Term memory management
3. GPT-3.5 powered Agents for delegation
4. File output

PERFORMANCE EVALUATION:
1. Continuously review and analyze your actions
2. Constructively self-criticize your big-picture behavior
3. Reflect on past decisions and strategies

You should only respond in JSON format as described below:
{
    "thoughts": {
        "text": "thought",
        "reasoning": "reasoning",
        "plan": "- short bulleted\n- list that conveys\n- long-term plan",
        "criticism": "constructive self-criticism",
        "speak": "thoughts summary to say to user"
    },
    "command": {
        "name": "command name",
        "args": {"arg name": "value"}
    }
}
```

### 3.4 记忆系统

**面试重点**：AutoGPT 使用向量数据库实现长期记忆。

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoGPT 记忆系统                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  短期记忆（Short-term Memory）                       │   │
│  │  • 最近 N 轮对话历史                                │   │
│  │  • 直接放入 Prompt                                  │   │
│  │  • 受 Token 限制（~4000 tokens）                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  长期记忆（Long-term Memory）                        │   │
│  │  • 向量数据库存储（Pinecone/Chroma/Weaviate）       │   │
│  │  • 每次行动后存储摘要                               │   │
│  │  • 相关记忆通过语义搜索召回                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  记忆流程：                                                 │
│  1. 执行动作 → 2. 生成摘要 → 3. 向量化 → 4. 存入 DB        │
│  5. 下次思考时 → 6. 语义搜索相关记忆 → 7. 注入 Prompt      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.5 自我批评机制

AutoGPT 的独特设计：**强制自我反思**

```json
{
    "thoughts": {
        "text": "我应该先搜索相关信息",
        "reasoning": "在开始编码前，需要了解最新的 API 文档",
        "plan": [
            "- 搜索 API 文档",
            "- 阅读关键部分",
            "- 编写代码",
            "- 测试验证"
        ],
        "criticism": "我之前直接开始编码导致了错误，这次应该先做调研",
        "speak": "让我先搜索一下相关文档"
    }
}
```

**criticism 字段的作用**：
- 强制 LLM 反思之前的决策
- 避免重复犯错
- 提高决策质量

---

## 4. 对比总结（面试答题框架）

### 4.1 执行模式对比

| 维度 | LangChain | LangGraph | AutoGPT |
|------|-----------|-----------|---------|
| **执行模型** | 链式（线性） | 图状态机 | 目标驱动循环 |
| **状态管理** | Memory 对象 | 显式 State | 向量记忆 |
| **循环支持** | ❌ 不支持 | ✅ 原生支持 | ✅ 核心机制 |
| **并行执行** | 有限 | ✅ 原生支持 | ❌ 单线程 |
| **人工介入** | 回调函数 | Interrupt | 可选确认 |
| **自主程度** | 低（需指令） | 中（可配置） | 高（目标驱动） |

### 4.2 适用场景

```
┌─────────────────────────────────────────────────────────────┐
│                    选型决策树                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  需要构建 LLM 应用？                                        │
│       │                                                     │
│       ├─ 简单问答/RAG ──────────────► LangChain            │
│       │                                                     │
│       ├─ 需要循环/分支/并行 ────────► LangGraph            │
│       │                                                     │
│       ├─ 需要完全自主执行 ──────────► AutoGPT              │
│       │                                                     │
│       └─ 需要多角色协作 ────────────► MetaGPT / CrewAI     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 面试常见问题

**Q1: LangChain 和 LangGraph 的区别？**

> LangChain 是链式执行，适合线性流程；LangGraph 是图状态机，支持循环、分支、并行，适合复杂工作流。LangGraph 的状态是显式类型化的，更易于调试和控制。

**Q2: ReAct 是什么？**

> ReAct = Reasoning + Acting，是一种让 LLM 交替进行推理和行动的范式。LLM 先输出 Thought（思考），再输出 Action（行动），然后观察结果，循环直到完成任务。LangChain Agent 就是基于 ReAct 实现的。

**Q3: AutoGPT 为什么容易陷入循环？**

> AutoGPT 是目标驱动的自主循环，没有明确的终止条件。当 LLM 无法判断目标是否完成，或者遇到无法解决的问题时，会不断重试相同的策略，导致死循环。解决方案包括：设置最大迭代次数、添加人工确认点、改进目标定义。

**Q4: 如何选择 Agent 框架？**

> - 简单场景（RAG、问答）：LangChain
> - 复杂工作流（循环、并行）：LangGraph
> - 研究/实验（自主代理）：AutoGPT
> - 生产环境：Claude Code / Cursor 等成熟产品
> - 多角色协作：MetaGPT / CrewAI

---

## 5. 代码示例

### 5.1 LangChain ReAct Agent

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools import tool
from langchain import hub

# 定义工具
@tool
def search(query: str) -> str:
    """搜索互联网"""
    return f"搜索结果: {query} 的相关信息..."

@tool
def calculator(expression: str) -> str:
    """计算数学表达式"""
    return str(eval(expression))

# 创建 Agent
llm = ChatOpenAI(model="gpt-4")
tools = [search, calculator]
prompt = hub.pull("hwchase17/react")

agent = create_react_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 执行
result = executor.invoke({"input": "北京的人口是多少？乘以 2 是多少？"})
```

### 5.2 LangGraph 循环 Agent

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated
import operator

class State(TypedDict):
    messages: Annotated[list, operator.add]
    iteration: int

def agent(state: State) -> State:
    # 调用 LLM 决策
    return {"messages": ["Agent 思考..."], "iteration": state["iteration"] + 1}

def tool(state: State) -> State:
    # 执行工具
    return {"messages": ["工具执行结果"]}

def should_continue(state: State) -> str:
    if state["iteration"] >= 3:
        return END
    return "tool"

# 构建图
graph = StateGraph(State)
graph.add_node("agent", agent)
graph.add_node("tool", tool)
graph.add_edge("tool", "agent")
graph.add_conditional_edges("agent", should_continue)
graph.set_entry_point("agent")

app = graph.compile()
result = app.invoke({"messages": [], "iteration": 0})
```

### 5.3 AutoGPT 风格循环

```python
import json

def autogpt_loop(goal: str, max_iterations: int = 10):
    memory = []

    for i in range(max_iterations):
        # 1. 构造 Prompt
        prompt = f"""
        Goal: {goal}
        Previous actions: {memory[-5:]}

        Respond in JSON:
        {{
            "thoughts": {{"text": "...", "criticism": "..."}},
            "command": {{"name": "...", "args": {{}}}}
        }}
        """

        # 2. 调用 LLM
        response = llm.invoke(prompt)
        result = json.loads(response)

        # 3. 执行命令
        command = result["command"]
        if command["name"] == "finish":
            return result

        observation = execute_command(command)

        # 4. 更新记忆
        memory.append({
            "thought": result["thoughts"],
            "action": command,
            "observation": observation
        })

    return {"error": "Max iterations reached"}
```

---

## 6. 实践案例：iterative-probe（AutoGPT 的工程化实现）

### 6.1 背景

`iterative-probe` 是一个专用于 C++/UE 项目的 Claude Code Skill，其核心机制与 AutoGPT 高度相似，但针对实际工程场景做了关键改进。

### 6.2 核心循环对比

```
┌─────────────────────────────────────────────────────────────┐
│              两者的核心循环本质相同                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AutoGPT:                                                   │
│  Goal → Think → Act → Observe → (循环)                      │
│    │      │      │       │                                  │
│    │      │      │       └── 获取执行结果                    │
│    │      │      └────────── 执行命令/工具                   │
│    │      └───────────────── 分析+决策                       │
│    └──────────────────────── 用户设定目标                    │
│                                                             │
│  iterative-probe:                                           │
│  目标 → 探测 → 分析 → 修复 → 验证 → (循环)                   │
│    │      │      │      │      │                            │
│    │      │      │      │      └── Observe（验证效果）       │
│    │      │      │      └───────── Act（执行修复）           │
│    │      │      └──────────────── Think（分析问题）         │
│    │      └─────────────────────── Act（探测执行）           │
│    └────────────────────────────── Goal（链路/功能目标）     │
│                                                             │
│  本质都是：目标驱动的自主循环 + 观察反馈 + 迭代收敛          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 机制映射

| AutoGPT 概念 | iterative-probe 对应 | 说明 |
|-------------|---------------------|------|
| Goal | 探测目标 | 链路通畅 / 问题修复 / 功能验证 |
| Think | 分析探测结果 | 问题分类、优先级、修复方案 |
| Act | 探测 + 修复 | 子 Agent 探测，主 Agent 修复 |
| Observe | 验证 | 修复后再次探测验证 |
| Memory | probe_log.md | 每轮迭代记录到文件 |
| criticism | 心态检查清单 | 5 个自问确保不遗漏 |

### 6.4 关键改进

| 问题 | AutoGPT | iterative-probe 改进 |
|------|---------|---------------------|
| **死循环** | 无明确终止条件，容易无限循环 | 迭代上限（5 轮）+ 严格定义硬阻塞 |
| **可追溯性** | 向量数据库存储，难以查看过程 | Markdown 日志，完整记录每轮尝试 |
| **执行效率** | 单线程串行 | 支持并行探测 + 并行修复 |
| **领域适配** | 通用但不精 | 专注 C++/UE，提供探测模板 |
| **人机边界** | 模糊，要么全自主要么全手动 | 明确定义硬阻塞 vs 应继续尝试 |
| **自驱强度** | 可选人工确认 | 强制自驱，禁止中途停止等待 |

### 6.5 防死循环机制

**AutoGPT 的问题**：
```python
# AutoGPT 没有明确终止条件
while True:
    result = think_and_act()
    if result == "goal_achieved":  # LLM 自己判断，不可靠
        break
    # 可能永远循环...
```

**iterative-probe 的解决方案**：
```
终止条件 = 以下任一：
├── ✅ 目标达成：链路通畅 / 问题全部修复 / 功能验证通过
├── 🚫 硬阻塞：需要用户物理操作 / 需要凭证 / 用户明确说停
├── ❓ 需求不明确：无法判断用户真正想要什么
└── ⚠️ 迭代上限：达到 5 轮仍未收敛，需重新评估
```

**硬阻塞的严格定义**：
| 是硬阻塞 | 不是硬阻塞（继续尝试） |
|----------|------------------------|
| 需要用户在游戏中操作验证 | API 报错 → 换参数/换方法试 |
| 需要用户提供密码/凭证 | 不确定工具能不能做 → 先试 |
| 物理上无法访问的资源 | 文档没写这个功能 → 探索 API |
| 用户明确说"先停" | 第一次尝试失败 → 换思路 |

### 6.6 可追溯日志 vs 向量记忆

**AutoGPT 的记忆**：
```python
# 存入向量数据库，语义搜索召回
memory.add(f"Action: {action}, Result: {result}")
relevant = memory.search(current_context)  # 可能召回不相关的
```

**iterative-probe 的日志**：
```markdown
## 迭代 #1

### 尝试方法
1. **方法**：读取 DT_Heroes 检查 BaseAttributeDA 字段
   - **操作**：使用 Explore agent 读取 DataTable
   - **预期**：找到 DA 引用
   - **实际**：字段为空

### 发现问题
| # | 问题描述 | 位置 | 类型 | 严重程度 |
|---|----------|------|------|----------|
| 1 | BaseAttributeDA 未配置 | DT_Heroes | 配置缺失 | P0 |
```

**优势**：
- 人类可读，便于 Debug
- 完整记录每次尝试，不会丢失
- 可作为知识沉淀

### 6.7 并行加速

**AutoGPT**：单线程，一次只能做一件事

**iterative-probe**：
```
// 并行探测多条链路
Task(prompt="探测 DT→DA 链路...", run_in_background=true)
Task(prompt="探测代码调用链...", run_in_background=true)
Task(prompt="探测 GE 配置...", run_in_background=true)

// 等待所有完成，汇总分析
// 独立问题可并行修复
```

### 6.8 自我反思机制对比

**AutoGPT 的 criticism**：
```json
{
    "thoughts": {
        "criticism": "我之前直接开始编码导致了错误，这次应该先做调研"
    }
}
```

**iterative-probe 的心态检查清单**：
```markdown
每轮迭代结束时自问：
- [ ] 我验证了修复效果吗？
- [ ] 有没有引入新问题？
- [ ] 还有关联的部分没检查吗？
- [ ] 用户的真正目标达成了吗？
- [ ] 我是在等用户还是真的遇到阻塞？

**如果不是硬阻塞，继续探测！**
```

### 6.9 总结：iterative-probe 的定位

```
iterative-probe = AutoGPT 核心循环
                + 领域专用化（C++/UE）
                + 防死循环机制（迭代上限 + 硬阻塞定义）
                + 可追溯日志（Markdown 记录）
                + 并行加速（多链路并行探测）
                + 明确的人机边界（硬阻塞 vs 继续尝试）
```

### 6.10 面试答题模板

> **Q: 你了解 AutoGPT 吗？有没有实践过类似的系统？**
>
> A: 了解。AutoGPT 的核心是目标驱动的自主循环：Goal → Think → Act → Observe。
>
> 我在实际项目中设计过一个类似的系统叫 `iterative-probe`，专门用于 C++/UE 项目的集成调试。它的核心循环是：探测 → 分析 → 修复 → 验证 → 循环。
>
> 相比 AutoGPT，我做了几个关键改进：
> 1. **防死循环**：设置 5 轮迭代上限，严格定义什么是"硬阻塞"
> 2. **可追溯性**：用 Markdown 日志记录每轮探测，而不是向量库
> 3. **并行加速**：支持多条链路并行探测、独立问题并行修复
> 4. **人机边界**：明确定义什么情况必须停下来问用户
>
> 这些改进让它在实际工程中更可控、更高效、更易调试。

---

## 参考资源

- [LangChain 官方文档](https://python.langchain.com/)
- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/)
- [AutoGPT GitHub](https://github.com/Significant-Gravitas/AutoGPT)
- [ReAct 论文](https://arxiv.org/abs/2210.03629)
- [Toolformer 论文](https://arxiv.org/abs/2302.04761)

---

*文档创建于 2026-01-31*
