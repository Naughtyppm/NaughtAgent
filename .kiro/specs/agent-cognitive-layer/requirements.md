# Requirements Document

## Introduction

本文档定义了为现有 SubTask 子任务系统添加认知能力层的需求。认知能力层将为 Agent 提供规划、反思、工具增强和记忆能力，使其能够处理更复杂的任务场景。

现有 SubTask 系统位于 `packages/agent/src/subtask/`，已具备四种执行模式（ask_llm、run_agent、fork_agent、run_workflow）以及 Token 预算管理、消息压缩、任务队列、链式调用和错误处理等基础能力。

认知能力层将在此基础上扩展，提供：
- 规划层：任务分解、依赖分析、执行策略
- 反思循环：结果验证、错误诊断、自我纠错
- 工具系统增强：动态注册、权限控制（参考 Claude Code）、参数校验、执行沙箱
- 向量记忆：短期记忆、长期记忆、记忆检索

**架构决策（2026-01-17）**：
- ❌ 废弃 build/plan/explore 角色机制
- ✅ 采用 Claude Code 的权限模式（ask/allow/sandbox）
- ✅ 单一 Agent，根据任务自动选择工具
- ✅ 通过声明式规则控制权限，而非角色切换

---

## AI 协作开发经验（参考）

> 以下经验来自实践总结，供后续 SDD/Spec 系统设计参考，暂不直接实现。

### 核心认知

**LLM 本质**：输入上下文（文本/图片/音频），输出文本。Tools、MCP、Skills 都是解决"输出转功能"的方案，与模型本身无关。

**工具链演进**：
| 概念 | 解决的问题 | 特点 |
|------|-----------|------|
| Tools | 文本输出→可执行指令 | OpenAI 首创，各厂商格式不统一 |
| MCP | 统一工具调用标准 | 解决 Tools 扩展性问题 |
| Skills | 减少重复喂工具定义 | rules + 本地执行，对模型长上下文能力要求高 |

### Spec 驱动开发要点

**Spec 的价值**：解决逻辑冲突、可实施性、模糊发散三大问题。

**核心原则**：
1. Spec 是给 LLM 用的，排版结构优先服务 AI 理解
2. 谁写 Spec 谁执行，选定模型后保持一致
3. 复杂特性：找相关源码喂给 AI 参考

**验证方法**：完成 Spec 后，新开会话 → 喂入 Specs → 提问需求相关问题 → 检验 AI 能否正确提取需求

**审阅提示词**：
```
请审阅当前 specs 内所有文档，汇报所有你能预见的问题：
- 冲突点
- 逻辑问题
- 任何阻碍 AI Agent 实施的问题
```

### 文档关系体系

```
spec ──产生──→ task
  ↑              │
  └───引用───────┘

index ──索引──→ rules ──指导使用──→ 脚本
```

**关键**：不要孤立，孤立的文档没有实际价值。

### 好的 Rule 特征

- 明确触发条件
- 清晰执行步骤
- 关联相关资源

### 实施策略

**开发阶段**：
1. 市场研究
2. 需求整理 → AI 转 Specs → 对话完善
3. 说服 AI 接受 Specs（他是执行者）
4. 任务规划 → 监督完整实施

**动态性原则**：

| 可变项 | 说明 |
|--------|------|
| 代码 | 成果，必然可变 |
| 任务 | 实施中状况超预期需调整 |
| Specs | 不改目标的调整可接受 |
| 规则 | AI 发现的方法技巧需留存 |

**编码约束**：
- ❌ 不能让 AI 天马行空写代码
- ✅ 用工具约束：验证、检查、排除错误
- ✅ 代码文件 > 500 行必须拆分
- ✅ 测试与逻辑分离（控制 token 消耗）

### 任务启动检查清单

AI 启动任务时应完成：
- [ ] 确认任务依赖完整性
- [ ] 读取相关 Specs 文档
- [ ] 读取规则文档
- [ ] 探索项目结构和状态
- [ ] 在充足上下文基础上开始工作

### 动态指令系统

```
AI 优先使用顶层指令
    ↓ 达不到要求
设计脚本
    ↓ 测试通过
优化顶层指令 + 形成规则
```

**效果**：每次会话重启，但知识和技能沉淀让 AI 越来越懂项目，越来越顺手。

### 测试策略

| 类型 | 特点 |
|------|------|
| 前端界面测试 | 很重要！AI 视觉理解差，需多轮修改 |
| 后端/纯逻辑 | AI 基本能一次性完成 |
| E2E 测试 | 推荐 playwright-mcp |

### AI 行为校准提示词

**询问触发行为**：
```
请告诉我，是什么触发了你刚才的行为？
```

**记录发现**：
```
请记录你在这次任务中发现的新问题和技巧点
```

**决策追问**：
```
你在执行 XX 时，提到 YY：
请问在当前上下文中，是什么提示词或规则导致你做出这个判断？
```

---

## Glossary

- **Cognitive_Layer**: 认知能力层，为 Agent 提供规划、反思、工具增强和记忆能力的抽象层
- **Planning_Layer**: 规划层，负责任务分解、依赖分析和执行策略决策
- **Task_Decomposer**: 任务分解器，将复杂任务分解为可执行的子步骤
- **Dependency_Analyzer**: 依赖分析器，识别步骤间的依赖关系
- **Execution_Planner**: 执行规划器，决定步骤的串行或并行执行策略
- **Reflection_Loop**: 反思循环，执行后验证结果并进行自我纠错的机制
- **Result_Validator**: 结果验证器，检查执行结果是否符合预期
- **Error_Diagnoser**: 错误诊断器，分析失败原因并生成诊断报告
- **Self_Corrector**: 自我纠错器，生成修复方案并协调重试
- **Tool_System**: 工具系统，复用现有 `packages/agent/src/tool/` 模块，使用 `Tool.define()` 模式
- **Vector_Memory**: 向量记忆系统，提供基于语义相似度的记忆存储和检索
- **Working_Memory**: 工作记忆，当前会话的短期记忆存储
- **Semantic_Memory**: 语义记忆，跨会话的长期记忆存储
- **Memory_Retriever**: 记忆检索器，基于相似度召回相关记忆
- **Embedding_Provider**: 嵌入向量提供者，将文本转换为向量表示（默认使用 TF-IDF）
- **SubTask_System**: 现有的子任务系统，提供 ask_llm、run_agent、fork_agent、run_workflow 四种执行模式
- **Claude_SDK**: Anthropic 提供的 Claude API SDK (@anthropic-ai/sdk)

## Requirements

### Requirement 1: 任务分解

**User Story:** As a developer, I want the system to decompose complex tasks into executable steps, so that I can handle multi-step tasks automatically.

#### Acceptance Criteria

1. WHEN a complex task is submitted to the Task_Decomposer, THE Task_Decomposer SHALL analyze the task and generate a list of sub-steps with clear objectives
2. WHEN generating sub-steps, THE Task_Decomposer SHALL assign a unique identifier to each step
3. WHEN generating sub-steps, THE Task_Decomposer SHALL estimate the complexity level (low, medium, high) for each step
4. WHEN the task description is empty or contains only whitespace, THE Task_Decomposer SHALL return an error indicating invalid input
5. THE Task_Decomposer SHALL use Claude's tool_use capability to perform structured task analysis
6. WHEN decomposition is complete, THE Task_Decomposer SHALL return a TaskPlan object containing all sub-steps and metadata

### Requirement 2: 依赖分析

**User Story:** As a developer, I want the system to identify dependencies between task steps, so that I can ensure correct execution order.

#### Acceptance Criteria

1. WHEN a TaskPlan is submitted to the Dependency_Analyzer, THE Dependency_Analyzer SHALL identify dependencies between steps
2. WHEN a step requires output from another step, THE Dependency_Analyzer SHALL mark this as a data dependency
3. WHEN a step must complete before another can start, THE Dependency_Analyzer SHALL mark this as an execution dependency
4. THE Dependency_Analyzer SHALL detect circular dependencies and return an error if found
5. WHEN analysis is complete, THE Dependency_Analyzer SHALL return a dependency graph representing step relationships
6. THE Dependency_Analyzer SHALL validate that all referenced step IDs exist in the TaskPlan

### Requirement 3: 执行策略

**User Story:** As a developer, I want the system to determine optimal execution strategies, so that I can maximize efficiency while respecting dependencies.

#### Acceptance Criteria

1. WHEN a dependency graph is provided, THE Execution_Planner SHALL generate an execution schedule
2. WHEN steps have no dependencies between them, THE Execution_Planner SHALL mark them for parallel execution
3. WHEN steps have dependencies, THE Execution_Planner SHALL schedule them in correct sequential order
4. THE Execution_Planner SHALL respect the maximum concurrency limit specified in configuration
5. WHEN generating the schedule, THE Execution_Planner SHALL group independent steps into execution batches
6. THE Execution_Planner SHALL integrate with the existing TaskExecutor queue system

### Requirement 4: 结果验证

**User Story:** As a developer, I want the system to verify execution results against expectations, so that I can detect failures early.

#### Acceptance Criteria

1. WHEN a step execution completes, THE Result_Validator SHALL check if the result meets the expected criteria
2. WHEN validation criteria are provided, THE Result_Validator SHALL evaluate the result against each criterion
3. WHEN the result fails validation, THE Result_Validator SHALL generate a detailed validation report
4. THE Result_Validator SHALL support custom validation functions for complex criteria
5. WHEN no explicit criteria are provided, THE Result_Validator SHALL perform basic success/failure validation
6. THE Result_Validator SHALL record validation history for debugging purposes

### Requirement 5: 错误诊断

**User Story:** As a developer, I want the system to diagnose execution failures, so that I can understand what went wrong.

#### Acceptance Criteria

1. WHEN a step execution fails, THE Error_Diagnoser SHALL analyze the error and generate a diagnosis report
2. THE Error_Diagnoser SHALL categorize errors into types (input_error, execution_error, timeout_error, resource_error, validation_error)
3. WHEN diagnosing errors, THE Error_Diagnoser SHALL identify the root cause when possible
4. THE Error_Diagnoser SHALL suggest potential fixes based on error patterns
5. WHEN the error is related to tool execution, THE Error_Diagnoser SHALL include tool-specific context
6. THE Error_Diagnoser SHALL use Claude to perform intelligent error analysis when pattern matching is insufficient

### Requirement 6: 自我纠错

**User Story:** As a developer, I want the system to automatically attempt to fix failures, so that I can reduce manual intervention.

#### Acceptance Criteria

1. WHEN an error is diagnosed as recoverable, THE Self_Corrector SHALL generate a correction plan
2. THE Self_Corrector SHALL respect the maximum retry limit specified in configuration
3. WHEN generating a correction plan, THE Self_Corrector SHALL modify the failed step's parameters based on diagnosis
4. THE Self_Corrector SHALL track correction attempts and avoid repeating failed strategies
5. WHEN all correction attempts fail, THE Self_Corrector SHALL escalate with a comprehensive failure report
6. THE Self_Corrector SHALL integrate with the existing error-handler retry mechanism

---

### Requirement 7: 工具注册增强

**User Story:** As a developer, I want to dynamically register and manage tools at runtime, so that I can extend agent capabilities without restarting.

#### Background

现有 `packages/agent/src/tool/registry.ts` 提供基础的工具注册能力（register/get/list），但缺少：
- 运行时注销工具
- 按类别/标签查询
- 注册事件通知
- Claude tool_use 格式转换

#### Acceptance Criteria

1. THE ToolRegistry SHALL support registering tools with optional category and tags metadata
2. THE ToolRegistry SHALL support unregistering tools by name
3. THE ToolRegistry SHALL support querying tools by name pattern, category, or tags
4. WHEN a tool is registered or unregistered, THE ToolRegistry SHALL emit corresponding events
5. THE ToolRegistry SHALL provide a method to convert registered tools to Claude's tool_use format
6. WHEN registering a tool with an existing name, THE ToolRegistry SHALL reject unless override option is specified

### Requirement 8: 工具权限控制（参考 Claude Code）

**User Story:** As a developer, I want to control tool execution permissions through declarative rules, so that I can balance security and automation.

#### Background

参考 Claude Code 的权限模式，采用声明式规则而非基于角色的权限：
- **ask（默认）**：每次操作询问用户
- **allow**：自动允许，不询问
- **deny**：拒绝执行
- **sandbox**：沙箱内自由执行，超出边界才询问

现有 `packages/agent/src/permission/` 提供文件/命令级别的权限控制，需要扩展支持：
- 工具级权限规则
- 静态分析自动允许安全命令
- 声明式规则配置（JSON/YAML）

#### Acceptance Criteria

1. THE PermissionController SHALL support three permission modes: ask, allow, deny
2. THE PermissionController SHALL support declarative rules defined in configuration files
3. THE PermissionController SHALL check rules in order: deny first, then allow, then ask
4. THE PermissionController SHALL support pattern matching for tool names and parameters
5. THE PermissionController SHALL integrate with existing permission module for file/command checks
6. THE PermissionController SHALL support static analysis to auto-allow safe commands (echo, cat, ls, etc.)
7. WHEN a tool call is made, THE PermissionController SHALL evaluate rules and return permission decision
8. THE PermissionController SHALL return detailed rejection reasons when permission is denied

### Requirement 9: 参数校验增强

**User Story:** As a developer, I want robust parameter validation with type coercion and sanitization, so that I can prevent invalid or malicious inputs.

#### Background

现有工具使用 Zod 进行参数验证，但缺少：
- JSON Schema 格式支持（Claude tool_use 需要）
- 类型强制转换
- 字符串输入清理（防注入）

#### Acceptance Criteria

1. THE ParameterValidator SHALL validate parameters against JSON Schema definitions
2. THE ParameterValidator SHALL support type coercion (e.g., string "123" to number 123)
3. THE ParameterValidator SHALL sanitize string inputs to prevent injection attacks
4. WHEN validation fails, THE ParameterValidator SHALL return detailed error messages with paths
5. THE ParameterValidator SHALL support Zod schema to JSON Schema conversion
6. THE ParameterValidator SHALL integrate with existing Tool.define() pattern

### Requirement 10: 执行沙箱

**User Story:** As a developer, I want tool executions to run in a controlled sandbox, so that I can enforce timeouts and monitor resource usage.

#### Acceptance Criteria

1. THE ExecutionSandbox SHALL enforce configurable timeout for tool executions
2. WHEN execution exceeds timeout, THE ExecutionSandbox SHALL terminate it and return timeout error
3. THE ExecutionSandbox SHALL collect execution metrics (duration, memory peak if available)
4. THE ExecutionSandbox SHALL support optional memory monitoring via Node.js process.memoryUsage()
5. WHEN execution completes, THE ExecutionSandbox SHALL return result with metrics
6. THE ExecutionSandbox SHALL integrate with existing Tool.Context abort signal

---

### Requirement 11: 短期记忆

**User Story:** As a developer, I want the system to maintain working memory during a session, so that context is preserved across interactions.

#### Acceptance Criteria

1. WHEN information is stored in Working_Memory, THE Working_Memory SHALL associate it with the current session
2. THE Working_Memory SHALL support storing key-value pairs with optional metadata
3. WHEN the session ends, THE Working_Memory SHALL clear all associated entries unless persistence is requested
4. THE Working_Memory SHALL enforce a maximum entry count per session
5. WHEN the limit is exceeded, THE Working_Memory SHALL evict least recently used entries
6. THE Working_Memory SHALL support querying entries by key pattern or metadata filter

### Requirement 12: 长期记忆

**User Story:** As a developer, I want the system to persist important information across sessions, so that learned knowledge is retained.

#### Acceptance Criteria

1. WHEN information is stored in Semantic_Memory, THE Semantic_Memory SHALL persist it with a vector embedding
2. THE Semantic_Memory SHALL use the configured Embedding_Provider to generate embeddings
3. WHEN storing memories, THE Semantic_Memory SHALL assign importance scores based on content analysis
4. THE Semantic_Memory SHALL support memory consolidation to merge similar entries
5. WHEN memory storage exceeds the limit, THE Semantic_Memory SHALL prune low-importance entries
6. THE Semantic_Memory SHALL support tagging memories with categories for filtered retrieval

### Requirement 13: 记忆检索

**User Story:** As a developer, I want to retrieve relevant memories based on semantic similarity, so that past knowledge can inform current tasks.

#### Acceptance Criteria

1. WHEN a query is submitted, THE Memory_Retriever SHALL return memories ranked by semantic similarity
2. THE Memory_Retriever SHALL support configuring the maximum number of results to return
3. THE Memory_Retriever SHALL support filtering results by minimum similarity threshold
4. WHEN both Working_Memory and Semantic_Memory are available, THE Memory_Retriever SHALL search both and merge results
5. THE Memory_Retriever SHALL support filtering by memory tags or metadata
6. THE Memory_Retriever SHALL return similarity scores with each result for transparency

### Requirement 14: 认知层集成

**User Story:** As a developer, I want the cognitive capabilities to integrate seamlessly with the existing SubTask system, so that I can use them with current execution modes.

#### Acceptance Criteria

1. THE Cognitive_Layer SHALL provide a unified interface that wraps existing SubTask execution modes
2. WHEN cognitive features are enabled, THE Cognitive_Layer SHALL automatically apply planning before execution
3. WHEN cognitive features are enabled, THE Cognitive_Layer SHALL automatically apply reflection after execution
4. THE Cognitive_Layer SHALL allow selective enabling of individual cognitive features (planning, reflection, tools, memory)
5. THE Cognitive_Layer SHALL integrate with the existing ContextManager for token budget management
6. THE Cognitive_Layer SHALL emit events for cognitive operations to support monitoring and debugging

### Requirement 15: 配置管理

**User Story:** As a developer, I want to configure cognitive layer behavior through a unified configuration, so that I can customize behavior for different use cases.

#### Acceptance Criteria

1. THE Cognitive_Layer SHALL accept a configuration object specifying enabled features and their settings
2. WHEN configuration is not provided, THE Cognitive_Layer SHALL use sensible defaults
3. THE Cognitive_Layer SHALL validate configuration and return errors for invalid settings
4. THE Cognitive_Layer SHALL support runtime configuration updates for dynamic adjustment
5. THE Cognitive_Layer SHALL support configuration presets for common use cases (minimal, standard, full)
6. THE Cognitive_Layer SHALL serialize and deserialize configuration for persistence


---

## 前置重构需求

> 以下需求为认知层实现的前置优化，建议在认知层开发前完成。

### Requirement 16: Provider 层重构（Claude SDK）

**User Story:** As a developer, I want to use the official Claude SDK for better tool handling and new features, so that I can leverage native toolRunner and Batch API capabilities.

#### Background

当前项目使用 Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) 作为 Claude 调用层。官方 Claude SDK (`@anthropic-ai/sdk`) 提供了更多原生能力：

- **toolRunner**: 自动处理工具调用循环，简化 Agent Loop
- **Batch API**: 批量处理请求，降低成本
- **Structured Outputs**: 严格的 JSON Schema 输出验证（Beta）
- **Files API**: 原生文件上传支持
- **官方维护**: 新功能第一时间可用

#### Acceptance Criteria

1. THE ClaudeProvider SHALL use `@anthropic-ai/sdk` to implement the LLMProvider interface
2. THE ClaudeProvider SHALL support streaming via `client.messages.stream()`
3. THE ClaudeProvider SHALL support non-streaming via `client.messages.create()`
4. THE ClaudeProvider SHALL convert tool definitions to Claude's native format using `betaZodTool` helper
5. THE ClaudeProvider SHALL expose `toolRunner` capability for automatic tool call loops
6. THE ClaudeProvider SHALL support Batch API for bulk request processing
7. THE existing LLMProvider interface SHALL remain unchanged to ensure backward compatibility
8. THE OpenAIProvider and KiroProvider SHALL remain functional without modification
9. THE factory `createProvider()` SHALL support both legacy 'anthropic' and new 'claude' provider types

#### Migration Notes

**依赖变更策略**：

当前 Provider 架构：
- `anthropic.ts` - 使用 `@ai-sdk/anthropic` 调用 Claude API
- `openai.ts` - 使用 `@ai-sdk/openai` 调用 OpenRouter 等 OpenAI 兼容服务
- `kiro.ts` - **独立实现**，直接调用 Kiro API，不依赖任何 SDK

由于 `@ai-sdk/openai` 依赖 `ai` 包作为 peer dependency，我们采用渐进式迁移：

| 依赖 | 操作 | 原因 |
|------|------|------|
| `ai` | **保留** | OpenAI Provider 的 peer dependency |
| `@ai-sdk/anthropic` | **移除** | 被 `@anthropic-ai/sdk` 替代 |
| `@anthropic-ai/sdk` | **新增** | Claude 官方 SDK |
| `@ai-sdk/openai` | **保留** | OpenAI/OpenRouter Provider 继续使用 |

**文件变更**：
- `provider/anthropic.ts` → `provider/claude.ts`（重写，使用官方 SDK）
- `provider/openai.ts`（保持不变，继续使用 Vercel AI SDK）
- `provider/kiro.ts`（保持不变，独立实现）
- `provider/types.ts`（微调，确保两种 SDK 的消息格式兼容）
- `provider/factory.ts`（更新，支持 'claude' 和 'anthropic' 两种 provider type）

**后续可选优化**：
- OpenAI Provider 可在后续版本切换到 `openai` 官方 SDK
- 届时可完全移除 `ai` 和 `@ai-sdk/openai` 依赖
