# AI / LLM 面试宝典 2025-2026

> 目标：每个概念一句话说清，每个技术附带实战场景，面试时信手拈来。

---

## 目录

1. [LLM 基础高频问题](#1-llm-基础高频问题)
2. [Prompt Engineering](#2-prompt-engineering)
3. [RAG（检索增强生成）](#3-rag检索增强生成)
4. [LangChain 框架](#4-langchain-框架)
5. [AI Agent & AutoGPT](#5-ai-agent--autogpt)
6. [向量数据库 & Embedding](#6-向量数据库--embedding)
7. [微调 Fine-tuning](#7-微调-fine-tuning)
8. [模型部署与推理优化](#8-模型部署与推理优化)
9. [多模态 & 前沿方向](#9-多模态--前沿方向)
10. [系统设计题](#10-系统设计题)
11. [实战项目话术模板](#11-实战项目话术模板)

---

## 1. LLM 基础高频问题

### Q: 什么是大语言模型（LLM）？
> 一句话：基于 Transformer 架构、在海量文本上预训练的生成式模型，通过预测下一个 token 来理解和生成自然语言。

### Q: Transformer 的核心机制是什么？
> 一句话：Self-Attention 机制让模型在处理每个 token 时能"看到"序列中所有其他 token 的信息，从而捕获长距离依赖。

- **Q-K-V**：Query 问"我该关注谁"，Key 回答"我是谁"，Value 提供"我的内容"
- **Multi-Head Attention**：多组 Q-K-V 并行，捕获不同维度的语义关系
- **位置编码**：因为 Attention 本身不含位置信息，需要额外注入（正弦/RoPE/ALiBi）

### Q: GPT 和 BERT 的区别？
| 维度 | GPT（Decoder-only） | BERT（Encoder-only） |
|------|---------------------|---------------------|
| 训练目标 | 自回归，预测下一个 token | 掩码语言模型，预测被遮住的 token |
| 注意力 | 因果注意力（只看左边） | 双向注意力（看全部） |
| 擅长 | 文本生成、对话 | 文本理解、分类、NER |

### Q: Temperature、Top-p、Top-k 分别控制什么？
- **Temperature**：控制概率分布的"锐度"。低温→确定性高，高温→多样性高
- **Top-p（nucleus sampling）**：只从累积概率达到 p 的最小 token 集合中采样
- **Top-k**：只从概率最高的 k 个 token 中采样

### Q: 什么是 Token？为什么要关注 Context Window？
> 一句话：Token 是模型处理文本的最小单位（大约 0.75 个英文单词或 0.5 个中文字），Context Window 是模型单次能处理的最大 token 数，超出就会丢失信息。

### Q: 什么是幻觉（Hallucination）？怎么缓解？
> 一句话：模型生成看似合理但事实错误的内容，本质是模型在"编造"训练数据中不存在的关联。

缓解手段：
1. RAG 引入外部知识源做事实锚定
2. 提示词中要求"如果不确定就说不知道"
3. 输出后做事实校验（Fact-checking chain）
4. 降低 Temperature 减少随机性

### Q: 什么是 RLHF？
> 一句话：用人类偏好反馈训练一个奖励模型，再用强化学习（PPO）让 LLM 的输出对齐人类期望，是 ChatGPT 背后的关键技术。

流程：`SFT 监督微调 → 训练 Reward Model → PPO 强化学习`

### Q: DPO 和 RLHF 的区别？
> 一句话：DPO 跳过了训练奖励模型的步骤，直接用偏好数据对优化策略模型，更简单更稳定。

### Q: 什么是 KV Cache？
> 一句话：在自回归生成时缓存已计算的 Key 和 Value，避免每生成一个新 token 都重新计算整个序列，是推理加速的核心技巧。

---

## 2. Prompt Engineering

### Q: 什么是 Prompt Engineering？
> 一句话：通过精心设计输入提示词来引导 LLM 产生期望输出的技术，不改模型参数就能大幅提升效果。

### Q: 常见的 Prompt 策略有哪些？

| 策略 | 一句话解释 | 适用场景 |
|------|-----------|---------|
| Zero-shot | 不给示例，直接问 | 简单任务 |
| Few-shot | 给几个示例再问 | 格式化输出、分类 |
| Chain-of-Thought (CoT) | 让模型"一步步思考" | 数学推理、逻辑题 |
| ReAct | 交替进行推理(Reasoning)和行动(Action) | Agent 场景 |
| Self-Consistency | 多次采样取多数投票 | 提高推理准确率 |
| Tree-of-Thought | 探索多条思维路径并评估 | 复杂规划问题 |

### Q: 什么是 System Prompt / User Prompt / Assistant Prompt？
- **System**：设定模型角色和行为边界（"你是一个专业翻译"）
- **User**：用户的实际输入
- **Assistant**：模型的回复，也可预填来引导输出格式

### Q: 实际项目中你怎么优化 Prompt 的？
> 话术模板：我在 XX 项目中，最初用简单 zero-shot 效果不好（准确率约 60%），后来通过以下步骤优化到 90%+：
> 1. 加入角色设定和输出格式约束
> 2. 用 few-shot 给了 3 个典型示例
> 3. 对复杂逻辑加了 CoT 引导
> 4. 用结构化输出（JSON mode）确保下游可解析

---

## 3. RAG（检索增强生成）

### Q: 什么是 RAG？
> 一句话：先从外部知识库中检索相关文档，再把检索结果作为上下文喂给 LLM 生成回答，让模型"开卷考试"而非"闭卷瞎编"。

### Q: RAG 的完整流程？

```
文档 → 分块(Chunking) → Embedding 向量化 → 存入向量数据库
                                                    ↓
用户提问 → Query Embedding → 向量检索(Top-K) → 拼接上下文 → LLM 生成回答
```

### Q: RAG 解决了什么问题？
1. **知识时效性**：模型训练数据有截止日期，RAG 可接入实时数据
2. **幻觉问题**：用检索到的真实文档做事实锚定
3. **私有知识**：企业内部文档、代码库等模型没见过的数据
4. **成本**：比微调便宜得多，更新知识只需更新文档库

### Q: Chunking 策略有哪些？怎么选？

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| 固定大小切分 | 按 token 数切，有重叠 | 通用场景，简单快速 |
| 递归字符切分 | 按段落→句子→字符逐级切 | LangChain 默认，效果不错 |
| 语义切分 | 按语义相似度变化点切 | 内容主题跳跃大的文档 |
| 文档结构切分 | 按 Markdown 标题/HTML 标签切 | 结构化文档 |
| 父子切分 | 小块检索，返回大块上下文 | 需要更多上下文的场景 |

> 实战经验话术：我们项目中用 512 token 的块大小，128 token 重叠，对技术文档效果最好。后来发现法律合同需要更大的块（1024）才能保持条款完整性。

### Q: 怎么评估 RAG 系统的效果？

| 指标 | 说明 |
|------|------|
| Retrieval Recall@K | 前 K 个检索结果中包含正确答案的比例 |
| Retrieval Precision@K | 前 K 个结果中相关文档的比例 |
| Faithfulness | 生成的回答是否忠于检索到的文档 |
| Answer Relevancy | 回答与问题的相关程度 |
| Context Relevancy | 检索到的上下文与问题的相关程度 |

> 工具：RAGAS 框架可以自动化评估以上指标。

### Q: RAG 效果不好怎么排查优化？

```
检索阶段问题：
├── 检索不到相关文档 → 优化 Chunking / 换 Embedding 模型 / 加 Hybrid Search
├── 检索到但排序不对 → 加 Reranker（如 Cohere Rerank、bge-reranker）
└── 检索到太多噪音 → 调整 Top-K / 加相似度阈值过滤

生成阶段问题：
├── 有上下文但回答不对 → 优化 Prompt / 换更强的 LLM
├── 回答不忠于文档 → 加 "只根据以下内容回答" 约束
└── 回答太泛 → 让模型引用具体段落
```

### Q: 什么是 Hybrid Search？
> 一句话：同时使用向量语义检索（捕捉语义相似）和关键词检索（BM25，捕捉精确匹配），用 RRF 等算法融合排序，兼顾语义理解和精确匹配。

### Q: 什么是 Reranker？为什么需要它？
> 一句话：在初步检索后用一个交叉编码器对 query-document 对做精细打分重排序，因为双塔 Embedding 的相似度是近似的，Reranker 的交互式打分更准确。

### Q: 什么是 Multi-Query RAG / RAG Fusion？
> 一句话：把用户的一个问题改写成多个不同角度的查询，分别检索后合并去重，提高召回率，解决单一查询表述不够全面的问题。

### Q: Advanced RAG 有哪些进阶技术？

| 技术 | 一句话 | 解决什么问题 |
|------|--------|-------------|
| Self-RAG | 模型自己判断是否需要检索、检索结果是否有用 | 减少不必要的检索，提高效率 |
| Corrective RAG (CRAG) | 检索后评估文档质量，不够好就触发 Web 搜索补充 | 检索质量不稳定 |
| Agentic RAG | 用 Agent 动态决定检索策略、工具选择、多轮检索 | 复杂多步骤问答 |
| Graph RAG | 结合知识图谱做结构化检索 | 实体关系密集的领域（医疗、金融） |
| Contextual Retrieval | Anthropic 提出，给每个 chunk 加上文档级上下文前缀 | chunk 脱离上下文后语义不完整 |

---

## 4. LangChain 框架

### Q: 什么是 LangChain？
> 一句话：一个用于构建 LLM 应用的开发框架，提供了链式调用、Agent、RAG、Memory 等模块的标准化抽象，让你像搭积木一样组合 LLM 能力。

### Q: LangChain 的核心组件？

| 组件 | 一句话 | 用来干嘛 |
|------|--------|---------|
| LLM / ChatModel | 对各种模型的统一封装 | 一套代码切换 OpenAI/Claude/本地模型 |
| Prompt Template | 提示词模板，支持变量插入 | 复用和管理 Prompt |
| Output Parser | 把 LLM 输出解析为结构化数据 | JSON/Pydantic 对象解析 |
| Chain (LCEL) | 用管道符 `|` 串联组件 | `prompt | llm | parser` |
| Retriever | 检索器抽象 | 对接各种向量库做 RAG |
| Memory | 对话历史管理 | 多轮对话上下文保持 |
| Agent | 让 LLM 自主选择工具和行动 | 复杂任务自动化 |
| Tool | 外部工具封装（搜索、计算、API） | 扩展 LLM 能力边界 |

### Q: 什么是 LCEL（LangChain Expression Language）？
> 一句话：LangChain 的声明式链式调用语法，用 `|` 管道符把组件串起来，支持流式输出、并行、fallback，是 LangChain 推荐的编排方式。

```python
# 示例：一个简单的 RAG Chain
chain = (
    {"context": retriever, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)
answer = chain.invoke("什么是向量数据库？")
```

### Q: LangChain 的 Memory 有哪些类型？

| 类型 | 一句话 | 适用场景 |
|------|--------|---------|
| ConversationBufferMemory | 保存完整对话历史 | 短对话 |
| ConversationSummaryMemory | 用 LLM 总结历史对话 | 长对话，节省 token |
| ConversationBufferWindowMemory | 只保留最近 K 轮 | 平衡上下文和成本 |
| VectorStoreMemory | 把历史存向量库，按相关性检索 | 超长期记忆 |

### Q: LangChain 实际项目中你用它做了什么？
> 话术模板：我用 LangChain 搭建了一个企业知识库问答系统：
> 1. 用 `RecursiveCharacterTextSplitter` 对内部文档做分块
> 2. 用 `OpenAIEmbeddings` + `Chroma` 构建向量库
> 3. 用 LCEL 编排 RAG Chain：检索 → 重排序 → 生成
> 4. 加了 `ConversationSummaryMemory` 支持多轮追问
> 5. 用 `LangSmith` 做链路追踪和效果评估

### Q: LangChain vs LlamaIndex 怎么选？
| 维度 | LangChain | LlamaIndex |
|------|-----------|------------|
| 定位 | 通用 LLM 应用框架 | 专注数据索引和检索 |
| 强项 | Agent、Chain 编排、工具集成 | RAG 管线、多种索引结构 |
| 选择建议 | 需要 Agent 或复杂编排时选 | 纯 RAG 场景选，索引能力更强 |

---

## 5. AI Agent & AutoGPT

### Q: 什么是 AI Agent？
> 一句话：能自主感知环境、制定计划、选择工具、执行行动并根据反馈迭代的 LLM 应用，从"你问我答"升级为"你说目标我来干"。

### Q: Agent 的核心组成？

```
Agent = LLM（大脑）+ Tools（手脚）+ Memory（记忆）+ Planning（规划）
```

| 组件 | 作用 | 示例 |
|------|------|------|
| LLM | 推理和决策 | GPT-4、Claude |
| Tools | 与外部世界交互 | 搜索、代码执行、API 调用、数据库查询 |
| Memory | 短期/长期记忆 | 对话历史、向量存储 |
| Planning | 任务分解和规划 | ReAct、Plan-and-Execute |

### Q: 什么是 ReAct 模式？
> 一句话：让 LLM 交替进行 Reasoning（思考）和 Acting（行动），每一步先想"我该做什么"，再执行工具，观察结果后继续思考，直到得出最终答案。

```
循环：Thought → Action → Observation → Thought → Action → ... → Final Answer
```

### Q: 什么是 AutoGPT？
> 一句话：最早的自主 Agent 项目之一，给 GPT-4 设定一个目标后，它会自动分解任务、上网搜索、读写文件、执行代码，循环执行直到完成目标。

AutoGPT 的意义：
- 验证了 LLM 作为自主 Agent 的可行性
- 暴露了核心问题：循环失控、成本爆炸、任务漂移
- 推动了整个 Agent 生态的发展

### Q: AutoGPT 的局限性？
1. **循环失控**：容易陷入无意义的重复循环
2. **成本高**：每一步都要调用 LLM，token 消耗巨大
3. **任务漂移**：执行过程中偏离原始目标
4. **可靠性差**：复杂任务成功率低
5. **缺乏人类监督**：全自动模式风险高

### Q: 主流 Agent 框架对比？

| 框架 | 一句话 | 特点 |
|------|--------|------|
| AutoGPT | 最早的自主 Agent，全自动循环执行 | 概念验证，实用性有限 |
| LangChain Agents | LangChain 内置的 Agent 模块 | 生态丰富，工具集成方便 |
| LangGraph | LangChain 团队出品，基于图的 Agent 编排 | 支持循环、条件分支、人机协作 |
| CrewAI | 多 Agent 协作框架，角色扮演模式 | 多角色分工，适合复杂任务 |
| AutoGen (Microsoft) | 多 Agent 对话框架 | 支持人类参与、代码执行 |
| Dify | 低代码 LLM 应用平台 | 可视化编排，适合快速搭建 |
| Coze (字节) | Agent 构建平台 | 插件生态，适合 C 端场景 |

### Q: 什么是 LangGraph？
> 一句话：LangChain 团队推出的 Agent 编排框架，用有向图（节点=步骤，边=流转条件）来定义 Agent 的执行流程，支持循环、条件分支、人机协作和持久化状态。

```python
# LangGraph 核心概念
graph = StateGraph(AgentState)
graph.add_node("agent", call_model)        # 节点：LLM 决策
graph.add_node("tools", call_tools)        # 节点：执行工具
graph.add_edge("tools", "agent")           # 边：工具结果回到 Agent
graph.add_conditional_edges("agent", should_continue)  # 条件边
```

### Q: 什么是 Function Calling / Tool Use？
> 一句话：LLM 不直接执行工具，而是输出结构化的"我想调用 XX 函数，参数是 YY"的指令，由应用层执行后把结果返回给 LLM，实现 LLM 与外部工具的安全交互。

### Q: 什么是 MCP（Model Context Protocol）？
> 一句话：Anthropic 提出的开放协议，标准化了 LLM 应用与外部工具/数据源的连接方式，类似于 AI 世界的 USB 接口，一次对接处处可用。

### Q: 多 Agent 系统的常见架构？

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| 主从模式 | 一个 Orchestrator 分配任务给子 Agent | 任务可明确分解 |
| 辩论模式 | 多个 Agent 各自生成方案，互相评审 | 需要多角度思考 |
| 流水线模式 | Agent A 的输出是 Agent B 的输入 | 顺序处理流程 |
| 协作模式 | Agent 之间平等对话协商 | 开放式问题探索 |

---

## 6. 向量数据库 & Embedding

### Q: 什么是 Embedding？
> 一句话：把文本/图片等非结构化数据映射为高维空间中的稠密向量，语义相近的内容在向量空间中距离也近，是 RAG 和语义搜索的基础。

### Q: 常见的 Embedding 模型？

| 模型 | 来源 | 特点 |
|------|------|------|
| text-embedding-3-small/large | OpenAI | 效果好，API 调用，有成本 |
| bge-large-zh-v1.5 | 智源 BAAI | 中文效果优秀，可本地部署 |
| m3e-base/large | Moka AI | 中文场景性价比高 |
| jina-embeddings-v3 | Jina AI | 多语言，支持超长文本 |
| Cohere embed-v3 | Cohere | 多语言，支持不同检索类型 |

### Q: 什么是向量数据库？为什么不用传统数据库？
> 一句话：专门为高维向量的存储和近似最近邻（ANN）检索优化的数据库，传统数据库的 B-tree 索引无法高效处理高维向量的相似度搜索。

### Q: 主流向量数据库对比？

| 数据库 | 类型 | 一句话特点 |
|--------|------|-----------|
| Chroma | 嵌入式 | 轻量级，适合原型开发和小规模 |
| FAISS | 库（Meta） | 纯向量检索库，性能极强，无数据库功能 |
| Milvus | 分布式 | 生产级，支持万亿级向量，功能全面 |
| Pinecone | 云托管 | 全托管免运维，按需付费 |
| Weaviate | 开源 | 支持混合搜索，GraphQL API |
| Qdrant | 开源 | Rust 编写，性能好，过滤能力强 |
| pgvector | PG 扩展 | 已有 PostgreSQL 的团队首选 |

### Q: ANN 检索的常见算法？

| 算法 | 一句话 | 特点 |
|------|--------|------|
| HNSW | 基于分层可导航小世界图的近似搜索 | 查询快，内存占用大，最常用 |
| IVF | 先聚类再在最近的几个簇内搜索 | 内存友好，需要训练 |
| PQ (Product Quantization) | 把向量压缩后再搜索 | 极大节省内存，精度有损 |
| ScaNN | Google 出品，各项指标均衡 | 综合性能好 |

### Q: 相似度度量方式？
- **余弦相似度**：衡量方向相似性，忽略长度，最常用
- **欧氏距离（L2）**：衡量绝对距离
- **内积（IP）**：向量归一化后等价于余弦相似度

---

## 7. 微调 Fine-tuning

### Q: 什么时候该用 RAG，什么时候该微调？

| 维度 | RAG | 微调 |
|------|-----|------|
| 知识更新 | 实时更新，改文档即可 | 需要重新训练 |
| 成本 | 低（只需向量库） | 高（GPU + 数据标注） |
| 适用场景 | 知识密集型问答 | 风格/格式/领域适配 |
| 幻觉控制 | 好（有事实锚定） | 一般 |
| 推理成本 | 较高（检索+生成） | 较低（直接生成） |

> 一句话结论：先试 RAG，不够再微调，两者可以结合使用。

### Q: 什么是 LoRA / QLoRA？
> **LoRA 一句话**：冻结原始模型权重，只训练两个小矩阵（低秩分解），参数量降低 99%+，效果接近全量微调。
> **QLoRA 一句话**：在 LoRA 基础上把模型量化到 4-bit 再训练，单张消费级显卡就能微调 70B 模型。

### Q: 微调的数据需要多少？
- **SFT（指令微调）**：高质量数据 1000-10000 条通常够用
- **关键是质量而非数量**：100 条高质量数据 > 10000 条低质量数据
- **格式**：instruction-input-output 三元组

### Q: 常见微调方法对比？

| 方法 | 参数量 | 显存需求 | 效果 |
|------|--------|---------|------|
| 全量微调 | 100% | 极高 | 最好 |
| LoRA | ~0.1% | 低 | 接近全量 |
| QLoRA | ~0.1% | 极低 | 略低于 LoRA |
| Prefix Tuning | 极少 | 极低 | 一般 |
| Adapter | ~1-5% | 低 | 较好 |

---

## 8. 模型部署与推理优化

### Q: 常见的模型推理框架？

| 框架 | 一句话 | 适用场景 |
|------|--------|---------|
| vLLM | 基于 PagedAttention 的高吞吐推理引擎 | 生产级 LLM 服务，吞吐量优先 |
| TGI (HuggingFace) | HuggingFace 官方推理服务 | HF 生态用户，快速部署 |
| Ollama | 一键本地运行开源模型 | 本地开发测试 |
| llama.cpp | C++ 实现的 CPU/GPU 推理 | 边缘设备、低资源环境 |
| TensorRT-LLM | NVIDIA 官方优化引擎 | NVIDIA GPU 极致性能 |

### Q: 什么是量化（Quantization）？
> 一句话：把模型权重从高精度（FP16/FP32）压缩到低精度（INT8/INT4），大幅减少显存占用和推理延迟，精度损失通常可接受。

| 量化方式 | 说明 |
|----------|------|
| GPTQ | 训练后量化，需要校准数据，效果好 |
| AWQ | 保护重要权重的量化，效果优于 GPTQ |
| GGUF | llama.cpp 使用的格式，CPU 友好 |
| bitsandbytes | HuggingFace 集成，4/8-bit 量化 |

### Q: 什么是 PagedAttention？
> 一句话：vLLM 的核心技术，借鉴操作系统虚拟内存的分页思想管理 KV Cache，避免内存碎片，让 GPU 显存利用率从 ~50% 提升到 ~95%。

### Q: 什么是 Continuous Batching？
> 一句话：不等一个 batch 全部完成再处理下一个，而是有请求完成就立即插入新请求，大幅提高 GPU 利用率和吞吐量。

---

## 9. 多模态 & 前沿方向

### Q: 什么是多模态大模型？
> 一句话：能同时理解和生成文本、图片、音频、视频等多种模态信息的模型，如 GPT-4o、Gemini、Claude 3.5。

### Q: 当前 AI 领域的前沿方向？

| 方向 | 一句话 | 代表 |
|------|--------|------|
| 长上下文 | 支持百万级 token 上下文窗口 | Gemini 1.5 (1M)、Claude (200K) |
| 小模型 | 3B 以下模型达到实用水平 | Phi-3、Gemma 2、Qwen2.5 |
| 推理模型 | 专门优化复杂推理能力 | o1/o3、DeepSeek-R1、QwQ |
| 多 Agent | 多个 Agent 协作完成复杂任务 | CrewAI、AutoGen、LangGraph |
| 端侧部署 | 模型在手机/PC 本地运行 | Apple MLX、Qualcomm AI |
| 世界模型 | 理解物理世界规律的模型 | Sora、Genie |

---

## 10. 系统设计题

### Q: 设计一个企业级 RAG 知识库系统

```
架构要点：
├── 数据层
│   ├── 文档解析：PDF/Word/HTML → 结构化文本（Unstructured/LlamaParse）
│   ├── 分块策略：递归切分 + 语义切分混合
│   ├── Embedding：bge-large 或 OpenAI text-embedding-3
│   └── 向量库：Milvus（生产）/ pgvector（已有 PG 的团队）
├── 检索层
│   ├── Hybrid Search：向量检索 + BM25 关键词检索
│   ├── Reranker：bge-reranker 或 Cohere Rerank 精排
│   ├── Multi-Query：查询改写提高召回
│   └── 权限过滤：基于元数据的文档级权限控制
├── 生成层
│   ├── Prompt 模板：角色设定 + 上下文注入 + 输出约束
│   ├── 流式输出：SSE 推送，提升用户体验
│   └── 引用溯源：回答附带来源文档链接
└── 工程层
    ├── 评估：RAGAS 自动化评估 + 人工抽检
    ├── 监控：LangSmith / LangFuse 链路追踪
    ├── 缓存：语义缓存减少重复查询成本
    └── 反馈：用户点赞/踩收集偏好数据
```

### Q: 设计一个智能客服 Agent 系统

```
核心设计：
├── 意图识别：LLM 判断用户意图类别
├── 工具路由：根据意图选择对应工具
│   ├── 知识库查询（RAG）→ 产品问答
│   ├── 订单系统 API → 查询/修改订单
│   ├── 工单系统 API → 创建/跟踪工单
│   └── 人工转接 → 复杂/敏感问题
├── 多轮对话：ConversationSummaryMemory 管理上下文
├── 安全护栏：
│   ├── 输入过滤：拒绝注入攻击和敏感内容
│   ├── 输出审核：防止泄露内部信息
│   └── 操作确认：涉及修改操作需用户二次确认
└── 兜底策略：Agent 不确定时主动转人工
```

### Q: 如何保证 LLM 应用的安全性？

| 威胁 | 防御措施 |
|------|---------|
| Prompt Injection | 输入清洗 + System Prompt 隔离 + 输出验证 |
| 数据泄露 | 权限控制 + PII 脱敏 + 输出过滤 |
| 幻觉 | RAG 事实锚定 + 置信度阈值 + 人工审核 |
| 滥用 | 速率限制 + 用量监控 + 内容审核 |
| 越狱 | 多层防御 + 行为监控 + 模型对齐 |

---

## 11. 实战项目话术模板

### 模板一：RAG 知识库项目

> "我负责搭建了公司内部的知识库问答系统。技术栈是 LangChain + OpenAI Embedding + Milvus + GPT-4。
> 核心挑战是文档类型多样（PDF/Word/网页），我用 Unstructured 做解析，RecursiveCharacterTextSplitter 做分块（512 token，128 重叠）。
> 检索用了 Hybrid Search（向量+BM25）加 Reranker 精排，最终 Recall@5 从 72% 提升到 91%。
> 上线后日均处理 2000+ 次查询，用户满意度 85%+。"

### 模板二：Agent 自动化项目

> "我用 LangGraph 构建了一个数据分析 Agent，用户用自然语言描述分析需求，Agent 自动生成 SQL、执行查询、生成可视化图表。
> 核心是 ReAct 模式：LLM 先理解需求，选择工具（SQL 生成器/Python 执行器/图表生成器），观察结果后决定下一步。
> 加了人机协作节点，涉及数据修改操作需要用户确认。
> 上线后数据分析师的重复性查询工作减少了 60%。"

### 模板三：Prompt 优化项目

> "我负责优化公司 AI 客服的回答质量。最初用简单 Prompt 准确率只有 65%。
> 我做了几件事：1）加入角色设定和回答规范；2）用 Few-shot 给了 5 个标准回答示例；3）对复杂问题加了 CoT 引导；4）用 JSON mode 确保输出可解析。
> 最终准确率提升到 92%，平均响应时间从 5s 降到 2s（通过 Prompt 精简减少 token）。"

---

## 附录：一句话速查表

> 面试前 10 分钟快速过一遍，每个概念一句话搞定。

| 概念 | 一句话 |
|------|--------|
| LLM | 基于 Transformer 的大规模预训练生成模型，通过预测下一个 token 工作 |
| Transformer | 用 Self-Attention 让每个 token 能关注序列中所有其他 token |
| RAG | 先检索再生成，让 LLM 开卷考试而非闭卷瞎编 |
| LangChain | LLM 应用开发框架，提供 Chain/Agent/RAG/Memory 等标准化积木 |
| LCEL | LangChain 的管道式编排语法，`prompt | llm | parser` |
| LangGraph | 基于有向图的 Agent 编排框架，支持循环和条件分支 |
| AutoGPT | 最早的自主 Agent，给目标后自动循环执行，验证了 Agent 可行性 |
| AI Agent | 能自主规划、选择工具、执行行动并迭代的 LLM 应用 |
| ReAct | 思考→行动→观察的循环模式，Agent 的核心推理框架 |
| Function Calling | LLM 输出结构化工具调用指令，由应用层执行并返回结果 |
| MCP | Anthropic 提出的 AI 工具连接标准协议，类似 AI 的 USB 接口 |
| Embedding | 把文本映射为高维向量，语义相近的内容距离也近 |
| 向量数据库 | 专为高维向量 ANN 检索优化的数据库 |
| HNSW | 最常用的近似最近邻搜索算法，基于分层小世界图 |
| Hybrid Search | 向量语义检索 + BM25 关键词检索的融合 |
| Reranker | 初步检索后用交叉编码器精细重排序 |
| Chunking | 把长文档切成适合检索的小块 |
| LoRA | 冻结原模型，只训练低秩小矩阵，参数量降 99%+ |
| QLoRA | LoRA + 4-bit 量化，单卡微调大模型 |
| RLHF | 用人类偏好训练奖励模型，再用 RL 对齐 LLM 输出 |
| DPO | 跳过奖励模型，直接用偏好数据优化策略，比 RLHF 更简单 |
| KV Cache | 缓存已计算的 Key/Value 避免重复计算，推理加速核心 |
| PagedAttention | vLLM 的分页式 KV Cache 管理，显存利用率从 50% 到 95% |
| 量化 | 把模型权重从高精度压缩到低精度，减少显存和延迟 |
| vLLM | 高吞吐 LLM 推理引擎，生产部署首选 |
| Prompt Engineering | 通过设计输入提示词引导 LLM 输出，不改参数提升效果 |
| CoT | Chain-of-Thought，让模型一步步思考，提升推理准确率 |
| Few-shot | 给几个示例再提问，引导输出格式和质量 |
| Temperature | 控制输出随机性，低温确定高温多样 |
| 幻觉 | 模型生成看似合理但事实错误的内容 |
| RAGAS | RAG 系统自动化评估框架 |
| Faithfulness | 生成的回答是否忠于检索到的文档 |
| Self-RAG | 模型自己判断是否需要检索以及检索结果是否有用 |
| Graph RAG | 结合知识图谱做结构化检索 |
| Multi-Agent | 多个 Agent 分工协作完成复杂任务 |

---

> 祝面试顺利 🎯 有底气，不慌张。


---

## 12. 2025-2026 最新热点补充（基于网络检索更新）

> 以下内容基于 mlabonne/llm-course、LangChain 官方博客等最新资料整理。

### Q: 什么是推理模型（Reasoning Model）？
> 一句话：通过强化学习训练出的模型，能在推理时花更多计算资源"深度思考"，用 Chain-of-Thought 逐步推理来解决复杂问题。

代表模型：OpenAI o1/o3、DeepSeek-R1、QwQ

核心技术：
- Test-time Compute Scaling：推理时给更多计算预算，效果更好
- Process Reward Model (PRM)：对推理的每一步打分，而非只看最终结果
- MCTS（蒙特卡洛树搜索）：探索多条推理路径选最优

> 面试话术："推理模型的核心思路是把计算从训练阶段转移到推理阶段，通过 RL 训练让模型学会'慢思考'，在复杂数学和编程任务上效果显著提升。"

### Q: 什么是 GRPO？和 PPO 的区别？
> 一句话：GRPO（Group Relative Policy Optimization）是 DeepSeek 提出的 RL 算法，不需要单独的 Critic 模型，而是用同一 batch 内多个采样的相对排名作为基线，更省资源。

| 维度 | PPO | GRPO |
|------|-----|------|
| Critic 模型 | 需要 | 不需要 |
| 基线计算 | Value function | 组内相对排名 |
| 显存占用 | 高（需要额外模型） | 低 |
| 适用场景 | 通用 RL 对齐 | 推理模型训练 |

### Q: 什么是模型合并（Model Merging）？
> 一句话：不经过额外训练，直接把多个微调模型的权重按特定算法合并成一个新模型，是 2024-2025 年开源社区最火的技术之一。

常见合并算法：
| 算法 | 一句话 |
|------|--------|
| SLERP | 球面线性插值，适合合并两个模型 |
| TIES | 只保留变化最大的参数，减少冲突 |
| DARE | 随机丢弃大部分微调参数，保留关键差异 |
| Linear | 简单加权平均，最基础 |

> 工具：mergekit 是最流行的模型合并工具。

### Q: 什么是 Agentic 光谱？
> 一句话：Andrew Ng 和 LangChain 的 Harrison Chase 提出，Agent 不是非黑即白的概念，而是一个从简单到复杂的光谱。

```
低 Agentic ←————————————————————→ 高 Agentic
  Router → Chain → State Machine → Autonomous Agent
  (路由)   (链式)   (状态机/循环)    (完全自主)
```

- 越 Agentic 的系统，越需要编排框架（如 LangGraph）
- 越 Agentic 的系统，越需要可观测性和人机协作
- 越 Agentic 的系统，评估越困难（需要评估中间步骤）

### Q: MCP（Model Context Protocol）详解
> 一句话：Anthropic 2024 年底推出的开放协议，标准化 LLM 与外部工具/数据源的连接方式。

为什么重要：
- 之前每个 LLM 框架都有自己的工具调用方式，互不兼容
- MCP 统一了接口：一个工具适配一次，所有支持 MCP 的客户端都能用
- 类比：USB-C 统一了充电接口，MCP 统一了 AI 工具接口

架构：
```
LLM 应用（MCP Client）←→ MCP Server（封装工具/数据源）
```

> 面试话术："MCP 解决了 AI 工具生态碎片化的问题，我在项目中用 MCP 把搜索、数据库查询、文件操作等工具标准化封装，任何支持 MCP 的 IDE 或 Agent 框架都能直接调用。"

### Q: 什么是结构化输出（Structured Output）？
> 一句话：约束 LLM 的输出必须符合特定格式（如 JSON Schema），确保下游系统能可靠解析，是 LLM 工程化的关键技术。

实现方式：
| 方式 | 说明 |
|------|------|
| JSON Mode | OpenAI/Claude 原生支持，输出合法 JSON |
| Function Calling | 模型输出结构化的函数调用 |
| Outlines/Guidance | 在 token 采样时用语法约束强制格式 |
| Pydantic + LangChain | 定义 Pydantic 模型，自动解析输出 |

### Q: 什么是可解释性 / 机械可解释性（Mechanistic Interpretability）？
> 一句话：通过分析模型内部的神经元激活模式来理解 LLM "为什么这样回答"，核心工具是稀疏自编码器（SAE），能提取出可理解的特征方向。

应用场景：
- Abliteration：找到"拒绝回答"的特征方向并移除，无需重新训练就能修改模型行为
- 安全审计：检测模型是否存在有害偏见
- 调试：理解模型为什么在某些输入上出错

### Q: 什么是合成数据（Synthetic Data）？为什么重要？
> 一句话：用强大的 LLM（如 GPT-4o）生成训练数据来训练/微调较小的模型，是当前解决高质量标注数据稀缺问题的主流方案。

关键技术：
| 技术 | 说明 |
|------|------|
| Self-Instruct | 让模型自己生成指令-回答对 |
| Evol-Instruct | 逐步增加指令复杂度 |
| Rejection Sampling | 生成多个回答，用奖励模型选最好的 |
| Distillation | 用大模型的输出训练小模型 |

### Q: 什么是 Dify / Coze 这类平台？
> 一句话：低代码/无代码的 LLM 应用构建平台，通过可视化拖拽编排 RAG、Agent、工作流，降低 AI 应用开发门槛。

| 平台 | 特点 |
|------|------|
| Dify | 开源，支持私有部署，RAG + Agent + 工作流 |
| Coze（扣子） | 字节出品，插件生态丰富，适合 C 端 |
| FastGPT | 开源，专注知识库问答 |
| Flowise | 开源，LangChain 可视化编排 |

> 面试话术："我用 Dify 快速搭建了内部知识库原型验证可行性，确认方案后再用 LangChain/LangGraph 做生产级实现，兼顾了开发效率和系统可控性。"

### Q: 2025-2026 面试高频新概念速查

| 概念 | 一句话 |
|------|--------|
| 推理模型 | 用 RL 训练的"慢思考"模型，推理时花更多算力换更好结果 |
| GRPO | DeepSeek 的 RL 算法，不需要 Critic 模型，用组内相对排名做基线 |
| Test-time Compute | 推理时给更多计算预算提升效果，推理模型的核心思路 |
| Model Merging | 不训练直接合并多个模型权重，开源社区热门技术 |
| MCP | AI 工具连接的标准协议，一次适配处处可用 |
| Agentic 光谱 | Agent 能力是一个从路由到完全自主的连续光谱 |
| SAE | 稀疏自编码器，可解释性的核心工具 |
| Abliteration | 用可解释性技术直接修改模型行为，无需重训练 |
| 合成数据 | 用大模型生成训练数据，解决标注数据稀缺 |
| 结构化输出 | 约束 LLM 输出为 JSON 等格式，工程化关键技术 |
| Contextual Retrieval | Anthropic 提出，给 chunk 加文档级上下文前缀 |
| Dify/Coze | 低代码 AI 应用平台，快速搭建 RAG/Agent |
| SmoothQuant | 量化前做数学变换消除异常值，提升量化精度 |
| verl/OpenRLHF | 新一代 RL 训练框架，专为 LLM 对齐优化 |

---

> 最后更新：2026-03-19 | 数据来源：mlabonne/llm-course, LangChain Blog, dev.to 等
