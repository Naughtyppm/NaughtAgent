# Technical Design: Agent Cognitive Layer

## Overview

本设计文档描述了为现有 SubTask 子任务系统添加认知能力层的技术方案。认知能力层将为 Agent 提供规划、反思、工具增强和记忆能力，使其能够处理更复杂的任务场景。

### 设计目标

1. **模块化**: 各认知能力独立实现，可按需组合
2. **可扩展**: 支持自定义规划策略、验证器、工具和记忆后端
3. **兼容性**: 与现有 SubTask 系统无缝集成
4. **可观测**: 提供完整的事件和指标支持

### 技术栈

- TypeScript 实现
- Claude SDK (@anthropic-ai/sdk) 用于 LLM 调用
- Zod 用于 Schema 验证
- Vitest 用于测试

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Cognitive Layer                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Planning   │  │ Reflection  │  │    Tool     │  │   Memory    │ │
│  │   Layer     │  │    Loop     │  │   System    │  │   System    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │                │        │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐ │
│  │ Decomposer  │  │  Validator  │  │  Registry+  │  │  Working    │ │
│  │ Dependency  │  │  Diagnoser  │  │ Permission+ │  │  Semantic   │ │
│  │  Planner    │  │  Corrector  │  │  Validator  │  │  Retriever  │ │
│  │             │  │             │  │  Sandbox    │  │             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                     Integration Layer                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  CognitiveSubTask - Unified Interface                           ││
│  │  - Wraps existing SubTask modes                                 ││
│  │  - Orchestrates cognitive features                              ││
│  │  - Manages configuration and events                             ││
│  └─────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│                   Existing SubTask System                            │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐           │
│  │  ask_llm  │ │ run_agent │ │fork_agent │ │run_workflow│           │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘           │
│  ┌───────────────────────────────────────────────────────┐         │
│  │  Context Manager │ Task Executor │ Error Handler      │         │
│  └───────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘

注：Tool System 中带 + 的组件表示在现有模块基础上增强
  - Registry+: 扩展 tool/registry.ts，添加查询、事件、格式转换
  - Permission+: 新增 permission/controller.ts，基于角色的权限控制
  - Validator: 新增 tool/validator.ts，参数校验增强
  - Sandbox: 新增 tool/sandbox.ts，执行沙箱
```

### 目录结构

```
packages/agent/src/subtask/cognitive/
├── index.ts                 # 统一导出
├── types.ts                 # 类型定义
├── config.ts                # 配置管理
├── cognitive-subtask.ts     # 统一入口
├── planning/
│   ├── index.ts
│   ├── decomposer.ts        # 任务分解器
│   ├── dependency.ts        # 依赖分析器
│   └── planner.ts           # 执行规划器
├── reflection/
│   ├── index.ts
│   ├── validator.ts         # 结果验证器
│   ├── diagnoser.ts         # 错误诊断器
│   └── corrector.ts         # 自我纠错器
└── memory/
    ├── index.ts
    ├── working.ts           # 工作记忆
    ├── semantic.ts          # 语义记忆
    ├── retriever.ts         # 记忆检索器
    └── embedding.ts         # 嵌入向量提供者

# 工具系统增强（扩展现有模块）
packages/agent/src/tool/
├── validator.ts             # 参数校验器（新增）
└── sandbox.ts               # 执行沙箱（新增）

packages/agent/src/permission/
└── controller.ts            # 权限控制器（新增）

# 测试目录（镜像 src 结构）
packages/agent/test/subtask/cognitive/
├── planning/
│   ├── decomposer.test.ts
│   ├── dependency.test.ts
│   └── planner.test.ts
├── reflection/
│   ├── validator.test.ts
│   ├── diagnoser.test.ts
│   └── corrector.test.ts
├── memory/
│   ├── working.test.ts
│   ├── semantic.test.ts
│   ├── retriever.test.ts
│   └── embedding.test.ts
├── config.test.ts
└── cognitive-subtask.test.ts

packages/agent/test/tool/
├── validator.test.ts
└── sandbox.test.ts

packages/agent/test/permission/
└── controller.test.ts
```

## Components and Interfaces

### Planning Layer

#### TaskDecomposer

```typescript
interface TaskStep {
  id: string;
  objective: string;
  description: string;
  complexity: 'low' | 'medium' | 'high';
  estimatedTokens?: number;
  metadata?: Record<string, unknown>;
}

interface TaskPlan {
  id: string;
  originalTask: string;
  steps: TaskStep[];
  createdAt: number;
  metadata?: Record<string, unknown>;
}

interface DecomposerConfig {
  maxSteps?: number;
  minComplexityForDecomposition?: 'low' | 'medium' | 'high';
  model?: string;
}

interface TaskDecomposer {
  decompose(task: string, config?: DecomposerConfig): Promise<TaskPlan>;
}
```

实现策略：
- 使用 Claude 的 tool_use 能力进行结构化任务分析
- 定义 `analyze_task` 工具，输出结构化的步骤列表
- 支持配置最大步骤数和最小分解复杂度阈值

#### DependencyAnalyzer

```typescript
type DependencyType = 'data' | 'execution' | 'resource';

interface Dependency {
  from: string;  // step id
  to: string;    // step id
  type: DependencyType;
  description?: string;
}

interface DependencyGraph {
  planId: string;
  dependencies: Dependency[];
  roots: string[];      // 无依赖的起始步骤
  leaves: string[];     // 无后续的终止步骤
}

interface DependencyAnalyzer {
  analyze(plan: TaskPlan): Promise<DependencyGraph>;
  detectCycles(graph: DependencyGraph): string[][] | null;
  getExecutionOrder(graph: DependencyGraph): string[][];
}
```

实现策略：
- 使用拓扑排序检测循环依赖
- 分析步骤描述中的输入/输出关系
- 支持显式依赖声明和自动推断

#### 循环依赖检测算法对比

| 算法 | 时间复杂度 | 特点 | 适用场景 |
|------|-----------|------|----------|
| **Kahn 算法** | O(V+E) | 基于入度，同时产生拓扑排序 | ✅ 推荐：简单直观，能同时得到执行顺序 |
| **DFS 三色标记** | O(V+E) | 基于递归，能找到具体环路径 | 需要报告环路径时使用 |
| **Tarjan SCC** | O(V+E) | 找强连通分量，功能更强 | 需要找所有环或分析复杂图结构 |

**选择 Kahn 算法的理由**：
1. 实现简单，代码量少（约 30 行）
2. 检测循环的同时产生拓扑排序，一举两得
3. 非递归，无栈溢出风险
4. 对于任务依赖图（通常节点数 < 100）性能足够

**Kahn 算法伪代码**：
```typescript
function kahnTopologicalSort(graph: DependencyGraph): string[] | null {
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  const result: string[] = [];
  
  // 初始化入度
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
  }
  for (const edge of graph.dependencies) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }
  
  // 入度为 0 的节点入队
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }
  
  // BFS 处理
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    
    for (const edge of graph.dependencies.filter(e => e.from === node)) {
      const newDegree = inDegree.get(edge.to)! - 1;
      inDegree.set(edge.to, newDegree);
      if (newDegree === 0) queue.push(edge.to);
    }
  }
  
  // 如果结果数量不等于节点数，说明有环
  return result.length === graph.nodes.length ? result : null;
}
```

#### ExecutionPlanner

```typescript
interface ExecutionBatch {
  batchId: number;
  stepIds: string[];
  parallel: boolean;
}

interface ExecutionSchedule {
  planId: string;
  batches: ExecutionBatch[];
  estimatedDuration?: number;
  maxConcurrency: number;
}

interface ExecutionPlannerConfig {
  maxConcurrency?: number;
  preferParallel?: boolean;
}

interface ExecutionPlanner {
  createSchedule(
    plan: TaskPlan,
    graph: DependencyGraph,
    config?: ExecutionPlannerConfig
  ): ExecutionSchedule;
  
  executeSchedule(
    schedule: ExecutionSchedule,
    executor: (stepId: string) => Promise<StepResult>
  ): Promise<PlanExecutionResult>;
}
```

实现策略：
- 基于依赖图生成执行批次
- 同一批次内的步骤可并行执行
- 与现有 TaskExecutor 集成

### Reflection Loop

#### ResultValidator

```typescript
interface ValidationCriterion {
  name: string;
  check: (result: StepResult) => boolean | Promise<boolean>;
  errorMessage?: string;
}

interface ValidationResult {
  valid: boolean;
  criteria: Array<{
    name: string;
    passed: boolean;
    message?: string;
  }>;
  timestamp: number;
}

interface ValidationHistory {
  stepId: string;
  results: ValidationResult[];
}

interface ResultValidator {
  validate(
    result: StepResult,
    criteria?: ValidationCriterion[]
  ): Promise<ValidationResult>;
  
  addDefaultCriterion(criterion: ValidationCriterion): void;
  getHistory(stepId: string): ValidationHistory | undefined;
  clearHistory(): void;
}
```

实现策略：
- 支持同步和异步验证函数
- 内置基础验证（成功/失败、输出非空）
- 记录验证历史用于调试

#### ErrorDiagnoser

```typescript
type ErrorCategory = 
  | 'input_error'
  | 'execution_error'
  | 'timeout_error'
  | 'resource_error'
  | 'validation_error'
  | 'unknown';

interface DiagnosisReport {
  stepId: string;
  category: ErrorCategory;
  rootCause?: string;
  context: Record<string, unknown>;
  suggestedFixes: string[];
  confidence: number;  // 0-1
  timestamp: number;
}

interface ErrorDiagnoser {
  diagnose(
    stepId: string,
    error: string,
    context?: Record<string, unknown>
  ): Promise<DiagnosisReport>;
  
  registerPattern(
    pattern: RegExp,
    category: ErrorCategory,
    suggestedFix: string
  ): void;
}
```

实现策略：
- 基于模式匹配进行快速分类
- 对复杂错误使用 Claude 进行智能分析
- 维护错误模式库

#### SelfCorrector

```typescript
interface CorrectionPlan {
  stepId: string;
  strategy: 'retry' | 'modify_params' | 'alternative_approach';
  modifications?: Record<string, unknown>;
  reasoning: string;
}

interface CorrectionAttempt {
  attemptNumber: number;
  plan: CorrectionPlan;
  result: StepResult;
  timestamp: number;
}

interface CorrectorConfig {
  maxAttempts?: number;
  cooldownMs?: number;
}

interface SelfCorrector {
  createCorrectionPlan(
    diagnosis: DiagnosisReport,
    previousAttempts: CorrectionAttempt[]
  ): Promise<CorrectionPlan | null>;
  
  executeCorrection(
    plan: CorrectionPlan,
    executor: (params: Record<string, unknown>) => Promise<StepResult>
  ): Promise<CorrectionAttempt>;
  
  getAttempts(stepId: string): CorrectionAttempt[];
}
```

实现策略：
- 跟踪已尝试的修复策略，避免重复
- 支持参数修改和替代方案
- 与现有 error-handler 重试机制集成

### Tool System

#### ToolRegistry

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  category?: string;
  tags?: string[];
  handler: (input: unknown) => Promise<unknown>;
  metadata?: Record<string, unknown>;
}

interface ToolQuery {
  name?: string;
  category?: string;
  tags?: string[];
}

type ToolRegistryEvent = 
  | { type: 'registered'; tool: ToolDefinition }
  | { type: 'unregistered'; toolName: string }
  | { type: 'updated'; tool: ToolDefinition };

interface ToolRegistry {
  register(tool: ToolDefinition, options?: { override?: boolean }): void;
  unregister(name: string): boolean;
  get(name: string): ToolDefinition | undefined;
  query(query: ToolQuery): ToolDefinition[];
  list(): ToolDefinition[];
  
  toClaudeTools(): ClaudeTool[];
  
  on(listener: (event: ToolRegistryEvent) => void): () => void;
}
```

实现策略：
- 使用 Map 存储工具定义
- 支持按名称、类别、标签查询
- 提供 Claude tool_use 格式转换

#### PermissionController（参考 Claude Code）

```typescript
type PermissionMode = 'ask' | 'allow' | 'deny';

interface PermissionRule {
  // 规则匹配
  toolPattern?: string | RegExp;  // 工具名称模式，如 "bash", "write_*", /^read/
  pathPattern?: string | RegExp;  // 路径模式，如 "src/**", "*.config.js"
  commandPattern?: string | RegExp;  // 命令模式，如 "npm *", /^git/
  
  // 权限决策
  mode: PermissionMode;
  
  // 元数据
  reason?: string;  // 规则说明
  priority?: number;  // 优先级，数字越大越优先（默认 0）
}

interface PermissionContext {
  toolName: string;
  params: Record<string, unknown>;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

interface PermissionResult {
  mode: PermissionMode;
  reason?: string;
  appliedRule?: PermissionRule;
}

interface PermissionConfig {
  defaultMode: PermissionMode;  // 默认权限模式（默认 'ask'）
  rules: PermissionRule[];
  safeCommands?: string[];  // 静态分析自动允许的安全命令
}

interface PermissionController {
  // 配置管理
  setConfig(config: PermissionConfig): void;
  getConfig(): PermissionConfig;
  addRule(rule: PermissionRule): void;
  removeRule(index: number): boolean;
  
  // 权限检查
  check(context: PermissionContext): PermissionResult;
  
  // 静态分析
  isSafeCommand(command: string): boolean;
  
  // 与现有 permission 模块集成
  checkFilePermission(path: string, operation: 'read' | 'write'): Promise<boolean>;
  checkCommandPermission(command: string): Promise<boolean>;
}
```

实现策略：
- **规则优先级**：deny > allow > ask（参考 Claude Code）
- **模式匹配**：支持字符串、glob、正则表达式
- **静态分析**：自动允许安全命令（echo、cat、ls、pwd 等）
- **声明式配置**：通过 JSON/YAML 文件定义规则
- **与现有模块集成**：调用 `permission/` 模块的文件/命令检查

**配置示例**：
```typescript
const config: PermissionConfig = {
  defaultMode: 'ask',
  safeCommands: ['echo', 'cat', 'ls', 'pwd', 'which', 'type'],
  rules: [
    // 拒绝危险命令
    { commandPattern: /^rm\s+-rf/, mode: 'deny', reason: '危险的删除命令', priority: 100 },
    { commandPattern: 'sudo *', mode: 'deny', reason: '禁止使用 sudo', priority: 100 },
    
    // 允许读取操作
    { toolPattern: 'read', mode: 'allow', priority: 10 },
    { toolPattern: 'glob', mode: 'allow', priority: 10 },
    { toolPattern: 'grep', mode: 'allow', priority: 10 },
    
    // 允许特定路径的写入
    { toolPattern: 'write', pathPattern: 'src/**', mode: 'allow', priority: 5 },
    { toolPattern: 'write', pathPattern: 'test/**', mode: 'allow', priority: 5 },
    
    // 其他写入需要询问
    { toolPattern: 'write', mode: 'ask', priority: 0 },
    
    // 允许安全的 bash 命令
    { toolPattern: 'bash', commandPattern: 'npm test', mode: 'allow', priority: 5 },
    { toolPattern: 'bash', commandPattern: 'npm run build', mode: 'allow', priority: 5 },
  ],
};
```

#### ParameterValidator

```typescript
interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
}

interface ParameterValidationResult {
  valid: boolean;
  errors: ValidationError[];
  coercedValue?: unknown;
}

interface ValidatorConfig {
  strict?: boolean;
  coerceTypes?: boolean;
  removeAdditional?: boolean;
  useDefaults?: boolean;
}

interface ParameterValidator {
  validate(
    schema: JSONSchema,
    value: unknown,
    config?: ValidatorConfig
  ): ParameterValidationResult;
  
  sanitize(value: unknown, schema: JSONSchema): unknown;
}
```

实现策略：
- 使用 Ajv 或 Zod 进行 JSON Schema 验证
- 支持类型强制转换
- 字符串输入清理防止注入

#### ExecutionSandbox

```typescript
interface SandboxConfig {
  timeoutMs?: number;
  maxMemoryMB?: number;
  enableMonitoring?: boolean;
}

interface ExecutionMetrics {
  durationMs: number;
  memoryPeakMB?: number;
  cpuTimeMs?: number;
}

interface SandboxResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  metrics: ExecutionMetrics;
  timedOut: boolean;
}

interface ExecutionSandbox {
  execute<T>(
    fn: () => Promise<T>,
    config?: SandboxConfig
  ): Promise<SandboxResult<T>>;
  
  getDefaultConfig(): SandboxConfig;
  setDefaultConfig(config: SandboxConfig): void;
}
```

实现策略：
- 使用 Promise.race 实现超时
- 可选的内存监控（Node.js process.memoryUsage）
- 执行指标收集

### Memory System

#### WorkingMemory

```typescript
interface MemoryEntry {
  key: string;
  value: unknown;
  metadata?: Record<string, unknown>;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
}

interface WorkingMemoryConfig {
  maxEntries?: number;
  sessionId: string;
}

interface WorkingMemory {
  set(key: string, value: unknown, metadata?: Record<string, unknown>): void;
  get(key: string): unknown | undefined;
  has(key: string): boolean;
  delete(key: string): boolean;
  
  query(filter: {
    keyPattern?: RegExp;
    metadata?: Record<string, unknown>;
  }): MemoryEntry[];
  
  clear(): void;
  getStats(): { entryCount: number; totalAccesses: number };
}
```

实现策略：
- 使用 Map 存储，LRU 淘汰策略
- 会话隔离
- 访问计数用于重要性评估

#### SemanticMemory

```typescript
interface SemanticEntry {
  id: string;
  content: string;
  embedding: number[];
  importance: number;  // 0-1
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  consolidatedFrom?: string[];  // 合并来源
}

interface SemanticMemoryConfig {
  maxEntries?: number;
  embeddingProvider: EmbeddingProvider;
  similarityThreshold?: number;
}

interface SemanticMemory {
  store(
    content: string,
    options?: {
      importance?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<string>;  // returns id
  
  retrieve(id: string): SemanticEntry | undefined;
  delete(id: string): boolean;
  
  consolidate(ids: string[]): Promise<string>;  // merge similar entries
  prune(keepCount: number): number;  // returns pruned count
  
  getStats(): { entryCount: number; totalTokens: number };
}
```

实现策略：
- 向量存储（内存实现，可扩展到外部向量数据库）
- 基于重要性的淘汰
- 支持记忆合并

#### 记忆合并策略

当多条记忆语义相似时，可以合并以减少存储和提高检索效率：

```typescript
interface ConsolidationConfig {
  similarityThreshold: number;  // 默认 0.85，高于此阈值认为相似
  strategy: 'concatenate' | 'summarize' | 'latest';
}

// 合并逻辑
async function consolidateMemories(
  entries: SemanticEntry[],
  config: ConsolidationConfig
): Promise<SemanticEntry> {
  // 1. 按创建时间排序
  const sorted = entries.sort((a, b) => a.createdAt - b.createdAt);
  
  // 2. 根据策略生成合并内容
  let mergedContent: string;
  switch (config.strategy) {
    case 'concatenate':
      // 简单拼接，用分隔符连接
      mergedContent = sorted.map(e => e.content).join('\n---\n');
      break;
    case 'latest':
      // 保留最新的内容
      mergedContent = sorted[sorted.length - 1].content;
      break;
    case 'summarize':
      // 使用 LLM 生成摘要（可选，增加成本）
      mergedContent = await summarizeWithLLM(sorted.map(e => e.content));
      break;
  }
  
  // 3. 计算合并后的重要性（取最大值 + 合并奖励）
  const maxImportance = Math.max(...entries.map(e => e.importance));
  const mergedImportance = Math.min(1, maxImportance + 0.1);
  
  // 4. 合并标签（去重）
  const mergedTags = [...new Set(entries.flatMap(e => e.tags))];
  
  return {
    id: generateId(),
    content: mergedContent,
    embedding: await embeddingProvider.embed(mergedContent),
    importance: mergedImportance,
    tags: mergedTags,
    createdAt: Date.now(),
    consolidatedFrom: entries.map(e => e.id),
  };
}
```

**默认配置**：
- `similarityThreshold`: 0.85
- `strategy`: 'concatenate'（简单可靠，不依赖 LLM）

#### 记忆合并触发时机

记忆合并不是实时进行的，而是在特定时机触发：

**触发条件**（满足任一即触发）：

| 触发时机 | 条件 | 说明 |
|----------|------|------|
| 存储时检查 | 新记忆与现有记忆相似度 > 0.85 | 存储前检查，避免重复 |
| 容量阈值 | 记忆数量 > maxEntries * 0.8 | 接近上限时主动合并 |
| 空闲时合并 | 会话空闲 > 30s | 后台异步执行 |
| 手动触发 | 调用 `consolidate()` | 显式合并指定记忆 |

**实现策略**：

```typescript
class SemanticMemory {
  private consolidationQueue: string[] = [];  // 待合并的记忆 ID
  private lastConsolidation: number = 0;
  
  async store(content: string, options?: StoreOptions): Promise<string> {
    // 1. 生成嵌入向量
    const embedding = await this.embeddingProvider.embed(content);
    
    // 2. 检查是否有相似记忆
    const similar = this.findSimilar(embedding, this.config.similarityThreshold);
    
    if (similar.length > 0) {
      // 3a. 有相似记忆：加入合并队列
      const id = this.storeEntry(content, embedding, options);
      this.consolidationQueue.push(id, ...similar.map(s => s.id));
      this.scheduleConsolidation();
      return id;
    } else {
      // 3b. 无相似记忆：直接存储
      return this.storeEntry(content, embedding, options);
    }
  }
  
  private scheduleConsolidation(): void {
    // 防抖：30s 内只执行一次
    if (Date.now() - this.lastConsolidation < 30000) return;
    
    setTimeout(() => {
      this.executeConsolidation();
      this.lastConsolidation = Date.now();
    }, 100);  // 异步执行，不阻塞存储
  }
  
  private async executeConsolidation(): Promise<void> {
    if (this.consolidationQueue.length < 2) return;
    
    // 按相似度分组
    const groups = this.groupBySimilarity(this.consolidationQueue);
    
    for (const group of groups) {
      if (group.length >= 2) {
        await this.consolidate(group);
      }
    }
    
    this.consolidationQueue = [];
  }
}
```

**注意事项**：
- 合并是异步的，不阻塞主流程
- 合并后原记忆标记为已合并，不立即删除（支持回溯）
- 合并操作幂等，重复触发不会产生副作用

#### MemoryRetriever

```typescript
interface RetrievalResult {
  entry: SemanticEntry | MemoryEntry;
  source: 'working' | 'semantic';
  similarity?: number;
}

interface RetrievalConfig {
  maxResults?: number;
  minSimilarity?: number;
  sources?: ('working' | 'semantic')[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface MemoryRetriever {
  search(
    query: string,
    config?: RetrievalConfig
  ): Promise<RetrievalResult[]>;
  
  setWorkingMemory(memory: WorkingMemory): void;
  setSemanticMemory(memory: SemanticMemory): void;
}
```

实现策略：
- 余弦相似度计算
- 多源检索合并
- 结果排序和过滤

#### EmbeddingProvider

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimension(): number;
}
```

#### TF-IDF 嵌入实现（默认）

TF-IDF（Term Frequency - Inverse Document Frequency）是一种经典的文本向量化方法，适合作为默认嵌入提供者：

**原理科普**：
- **TF（词频）**：一个词在文档中出现的频率。出现越多，TF 越高。
- **IDF（逆文档频率）**：衡量词的稀有程度。在越少文档中出现的词，IDF 越高。
- **TF-IDF = TF × IDF**：既频繁出现又相对稀有的词得分最高。

**为什么选择 TF-IDF**：
1. 纯本地计算，无 API 调用成本
2. 实现简单，约 100 行代码
3. 对于短文本（任务描述、记忆片段）效果足够
4. 可解释性强，便于调试

**局限性**：
- 无法捕捉语义相似性（"汽车" vs "轿车"）
- 对词序不敏感
- 需要维护词汇表

```typescript
class TFIDFEmbeddingProvider implements EmbeddingProvider {
  private vocabulary: Map<string, number> = new Map();  // 词 -> 索引
  private idfScores: Map<string, number> = new Map();   // 词 -> IDF 分数
  private documentCount: number = 0;
  private dimension: number;
  
  constructor(config: { maxVocabularySize?: number } = {}) {
    this.dimension = config.maxVocabularySize ?? 1000;
  }
  
  // 分词（简单实现，可替换为更好的分词器）
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/)  // 支持中英文
      .filter(token => token.length >= 2);
  }
  
  // 更新词汇表和 IDF（增量学习）
  addDocument(text: string): void {
    const tokens = new Set(this.tokenize(text));
    this.documentCount++;
    
    for (const token of tokens) {
      // 更新词频统计
      const docFreq = (this.idfScores.get(token) ?? 0) + 1;
      this.idfScores.set(token, docFreq);
      
      // 添加到词汇表
      if (!this.vocabulary.has(token) && this.vocabulary.size < this.dimension) {
        this.vocabulary.set(token, this.vocabulary.size);
      }
    }
  }
  
  // 计算 TF-IDF 向量
  async embed(text: string): Promise<number[]> {
    const tokens = this.tokenize(text);
    const vector = new Array(this.dimension).fill(0);
    
    // 计算词频
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    
    // 计算 TF-IDF
    for (const [token, freq] of tf) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) {
        const tfScore = freq / tokens.length;
        const docFreq = this.idfScores.get(token) ?? 1;
        const idfScore = Math.log((this.documentCount + 1) / (docFreq + 1)) + 1;
        vector[idx] = tfScore * idfScore;
      }
    }
    
    // L2 归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    
    return vector;
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }
  
  getDimension(): number {
    return this.dimension;
  }
}
```

#### TF-IDF 词汇表初始化策略

TF-IDF 需要词汇表才能正常工作。以下是初始化策略：

**自动学习模式（默认）**：
```typescript
class SemanticMemory {
  private embeddingProvider: TFIDFEmbeddingProvider;
  
  async store(content: string, options?: StoreOptions): Promise<string> {
    // 存储前自动学习词汇
    if (this.embeddingProvider instanceof TFIDFEmbeddingProvider) {
      this.embeddingProvider.addDocument(content);
    }
    
    // 生成嵌入向量
    const embedding = await this.embeddingProvider.embed(content);
    // ... 存储逻辑
  }
}
```

**冷启动处理**：
- 前 N 条记忆（默认 N=10）使用关键词匹配而非向量相似度
- 词汇表积累足够后自动切换到向量检索
- 可通过配置 `minDocumentsForVectorSearch` 调整阈值

**持久化**：
```typescript
interface TFIDFSnapshot {
  vocabulary: [string, number][];  // 词 -> 索引
  idfScores: [string, number][];   // 词 -> IDF 分数
  documentCount: number;
}

// 保存/加载词汇表
embeddingProvider.save(): TFIDFSnapshot;
embeddingProvider.load(snapshot: TFIDFSnapshot): void;
```

**注意**：词汇表随记忆一起持久化，重启后自动恢复。

#### 外部嵌入服务（可选扩展）

当需要更好的语义理解时，可以切换到外部嵌入服务：

```typescript
// OpenAI Embedding Provider
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model = 'text-embedding-3-small';  // 1536 维，$0.02/1M tokens
  
  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }
  
  getDimension(): number {
    return 1536;
  }
}

// 本地 Transformers.js（浏览器/Node.js 均可运行）
class TransformersEmbeddingProvider implements EmbeddingProvider {
  // 使用 all-MiniLM-L6-v2 模型，384 维
  // 完全本地运行，无 API 成本
}
```

**嵌入方案对比**：

| 方案 | 维度 | 成本 | 语义理解 | 适用场景 |
|------|------|------|----------|----------|
| TF-IDF | 1000 | 免费 | 弱 | 默认方案，关键词匹配 |
| OpenAI | 1536 | $0.02/1M | 强 | 生产环境，高质量检索 |
| Transformers.js | 384 | 免费 | 中 | 本地部署，隐私敏感 |

### Integration Layer

#### CognitiveSubTask

```typescript
interface CognitiveConfig {
  planning?: {
    enabled: boolean;
    decomposer?: DecomposerConfig;
    maxConcurrency?: number;
  };
  reflection?: {
    enabled: boolean;
    maxCorrectionAttempts?: number;
    validationCriteria?: ValidationCriterion[];
  };
  tools?: {
    enabled: boolean;
    registry?: ToolRegistry;
    permissionLevel?: PermissionLevel;
    sandboxConfig?: SandboxConfig;
  };
  memory?: {
    enabled: boolean;
    workingMemory?: WorkingMemory;
    semanticMemory?: SemanticMemory;
  };
}

type CognitiveEvent =
  | { type: 'planning_start'; task: string }
  | { type: 'planning_complete'; plan: TaskPlan }
  | { type: 'step_start'; stepId: string }
  | { type: 'step_complete'; stepId: string; result: StepResult }
  | { type: 'validation_complete'; stepId: string; result: ValidationResult }
  | { type: 'correction_attempt'; stepId: string; attempt: CorrectionAttempt }
  | { type: 'memory_stored'; key: string }
  | { type: 'memory_retrieved'; query: string; count: number };

interface CognitiveSubTask {
  // 配置
  configure(config: CognitiveConfig): void;
  getConfig(): CognitiveConfig;
  
  // 运行时配置更新（参考 Claude SDK 模式）
  updateConfig(partial: Partial<CognitiveConfig>): void;
  
  // 执行（包装现有模式）
  execute(
    config: SubTaskConfig,
    runtime: SubTaskRuntime
  ): Promise<SubTaskResult>;
  
  // 带规划的执行
  executeWithPlanning(
    task: string,
    runtime: SubTaskRuntime
  ): Promise<PlanExecutionResult>;
  
  // 事件
  on(listener: (event: CognitiveEvent) => void): () => void;
  
  // 访问子系统
  getPlanner(): ExecutionPlanner;
  getReflector(): { validator: ResultValidator; diagnoser: ErrorDiagnoser; corrector: SelfCorrector };
  getMemory(): { working: WorkingMemory; semantic: SemanticMemory; retriever: MemoryRetriever };
}
```

#### 运行时配置更新

参考 Claude SDK 的配置管理模式，支持运行时动态调整配置：

```typescript
class CognitiveSubTaskImpl implements CognitiveSubTask {
  private config: CognitiveConfig;
  private configVersion: number = 0;
  
  updateConfig(partial: Partial<CognitiveConfig>): void {
    // 深度合并配置
    this.config = deepMerge(this.config, partial);
    this.configVersion++;
    
    // 发出配置变更事件
    this.emit({ type: 'config_updated', version: this.configVersion });
    
    // 注意：正在执行的任务使用旧配置完成
    // 新任务使用新配置
  }
  
  // 配置快照（用于任务执行时锁定配置）
  private snapshotConfig(): CognitiveConfig {
    return structuredClone(this.config);
  }
}
```

**配置更新规则**：
1. 配置更新立即生效于新任务
2. 正在执行的任务使用启动时的配置快照
3. 不支持热更新的配置项（如 embeddingProvider）需要重新初始化
```

#### 配置预设

```typescript
const COGNITIVE_PRESETS = {
  minimal: {
    planning: { enabled: false },
    reflection: { enabled: true, maxCorrectionAttempts: 1 },
    tools: { enabled: true },
    memory: { enabled: false },
  },
  standard: {
    planning: { enabled: true, maxConcurrency: 2 },
    reflection: { enabled: true, maxCorrectionAttempts: 3 },
    tools: { enabled: true },
    memory: { enabled: true },
  },
  full: {
    planning: { enabled: true, maxConcurrency: 4 },
    reflection: { enabled: true, maxCorrectionAttempts: 5 },
    tools: { enabled: true },
    memory: { enabled: true },
  },
};
```

## Data Models

### Core Types

```typescript
// 步骤执行结果
interface StepResult {
  stepId: string;
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
  duration: number;
  usage: { inputTokens: number; outputTokens: number };
}

// 计划执行结果
interface PlanExecutionResult {
  planId: string;
  success: boolean;
  stepResults: Map<string, StepResult>;
  failedSteps: string[];
  totalDuration: number;
  totalUsage: { inputTokens: number; outputTokens: number };
}

// JSON Schema 类型
type JSONSchema = {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  default?: unknown;
  description?: string;
  // ... 其他 JSON Schema 关键字
};

// Claude Tool 格式
interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

### 持久化格式

```typescript
// 语义记忆持久化
interface SemanticMemorySnapshot {
  version: string;
  entries: SemanticEntry[];
  metadata: {
    createdAt: number;
    entryCount: number;
  };
}

// 配置持久化
interface CognitiveConfigSnapshot {
  version: string;
  config: CognitiveConfig;
  presetName?: string;
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Planning Layer Properties (1-7)

**Property 1: Task decomposition produces valid plans**
*For any* non-empty, non-whitespace task description, the Task_Decomposer SHALL return a TaskPlan containing at least one step, where each step has a unique ID, a non-empty objective, and a valid complexity level (low, medium, or high).
**Validates: Requirements 1.1, 1.2, 1.3, 1.6**

**Property 2: Empty task rejection**
*For any* task description that is empty or contains only whitespace characters, the Task_Decomposer SHALL return an error and not produce a TaskPlan.
**Validates: Requirements 1.4**

**Property 3: Circular dependency detection**
*For any* TaskPlan where the steps form a circular dependency (A depends on B, B depends on C, C depends on A), the Dependency_Analyzer SHALL detect the cycle and return an error.
**Validates: Requirements 2.4**

**Property 4: Dependency reference integrity**
*For any* DependencyGraph produced by the Dependency_Analyzer, all step IDs referenced in dependencies SHALL exist in the original TaskPlan.
**Validates: Requirements 2.6**

**Property 5: Execution order respects dependencies**
*For any* ExecutionSchedule produced by the Execution_Planner, if step A depends on step B, then B's batch number SHALL be less than A's batch number (B executes before A).
**Validates: Requirements 3.3**

**Property 6: Concurrency limit enforcement**
*For any* ExecutionSchedule with a configured maxConcurrency of N, no execution batch SHALL contain more than N steps.
**Validates: Requirements 3.4**

**Property 7: Independent steps parallelization**
*For any* set of steps with no dependencies between them, the Execution_Planner SHALL place them in the same execution batch (marked for parallel execution).
**Validates: Requirements 3.2, 3.5**

### Reflection Loop Properties (8-13)

**Property 8: Validation criteria completeness**
*For any* validation with N criteria provided, the ValidationResult SHALL contain exactly N criterion results, one for each provided criterion.
**Validates: Requirements 4.2**

**Property 9: Validation history persistence**
*For any* step that has been validated, calling getHistory(stepId) SHALL return a ValidationHistory containing all previous validation results for that step.
**Validates: Requirements 4.6**

**Property 10: Error categorization validity**
*For any* DiagnosisReport produced by the Error_Diagnoser, the category field SHALL be one of: input_error, execution_error, timeout_error, resource_error, validation_error, or unknown.
**Validates: Requirements 5.2**

**Property 11: Tool error context inclusion**
*For any* error related to tool execution, the DiagnosisReport SHALL include the tool name in its context.
**Validates: Requirements 5.5**

**Property 12: Retry limit enforcement**
*For any* Self_Corrector with maxAttempts configured to N, the total number of correction attempts for a single step SHALL not exceed N.
**Validates: Requirements 6.2**

**Property 13: No repeated correction strategies**
*For any* sequence of correction attempts on the same step, no two CorrectionPlans SHALL have identical strategy and modifications.
**Validates: Requirements 6.4**

### Tool System Properties (14-24)

**Property 14: Tool registration round-trip**
*For any* tool registered with ToolRegistry, calling get(toolName) SHALL return the same tool definition.
**Validates: Requirements 7.1**

**Property 15: Tool query by category**
*For any* tool registered with category C, querying by category C SHALL include that tool in results.
**Validates: Requirements 7.3**

**Property 16: Duplicate tool rejection**
*For any* tool name already registered, registering another tool with the same name SHALL fail unless override option is true.
**Validates: Requirements 7.6**

**Property 17: Permission level hierarchy**
*For any* caller with permission level L, the caller SHALL be able to access tools requiring level L or lower (admin > standard > restricted).
**Validates: Requirements 8.2**

**Property 18: Permission denial reason**
*For any* permission check that fails, the PermissionResult SHALL include a non-empty reason string.
**Validates: Requirements 8.5**

**Property 19: Conditional rule evaluation**
*For any* permission rule with conditions, the rule SHALL only apply when all conditions are satisfied.
**Validates: Requirements 8.3**

**Property 20: Parameter validation error paths**
*For any* validation failure, the ValidationError SHALL include the exact path to the invalid field.
**Validates: Requirements 9.4**

**Property 21: Type coercion correctness**
*For any* string value that represents a valid number, type coercion SHALL convert it to the correct numeric value.
**Validates: Requirements 9.2**

**Property 22: Input sanitization**
*For any* string input containing potential injection patterns, sanitize() SHALL escape or remove dangerous characters.
**Validates: Requirements 9.3**

**Property 23: Sandbox timeout enforcement**
*For any* execution that runs longer than the configured timeoutMs, the ExecutionSandbox SHALL terminate it and return timedOut=true.
**Validates: Requirements 10.1, 10.2**

**Property 24: Execution metrics collection**
*For any* completed sandbox execution, the SandboxResult SHALL include durationMs metric.
**Validates: Requirements 10.3, 10.5**

### Memory System Properties (25-37)

**Property 25: Session-scoped storage**
*For any* entry stored in Working_Memory with sessionId S, the entry SHALL only be retrievable within session S.
**Validates: Requirements 11.1**

**Property 26: Working memory entry limit**
*For any* Working_Memory with maxEntries=N, the entry count SHALL never exceed N.
**Validates: Requirements 11.4**

**Property 27: LRU eviction**
*For any* Working_Memory at capacity, storing a new entry SHALL evict the least recently accessed entry.
**Validates: Requirements 11.5**

**Property 28: Working memory query correctness**
*For any* query with keyPattern, the result SHALL contain exactly those entries whose keys match the pattern.
**Validates: Requirements 11.6**

**Property 29: Semantic memory embedding storage**
*For any* content stored in Semantic_Memory, the resulting SemanticEntry SHALL have a non-empty embedding array.
**Validates: Requirements 12.1**

**Property 30: Importance score assignment**
*For any* content stored in Semantic_Memory, the resulting SemanticEntry SHALL have an importance score between 0 and 1.
**Validates: Requirements 12.3**

**Property 31: Memory pruning by importance**
*For any* Semantic_Memory prune operation, the entries removed SHALL be those with the lowest importance scores.
**Validates: Requirements 12.5**

**Property 32: Tag-based filtering**
*For any* Semantic_Memory query filtered by tags, all returned entries SHALL have at least one of the specified tags.
**Validates: Requirements 12.6**

**Property 33: Similarity ranking**
*For any* Memory_Retriever search result with multiple entries, the entries SHALL be ordered by descending similarity score.
**Validates: Requirements 13.1**

**Property 34: Result count limit**
*For any* Memory_Retriever search with maxResults=N, the result count SHALL not exceed N.
**Validates: Requirements 13.2**

**Property 35: Similarity threshold filtering**
*For any* Memory_Retriever search with minSimilarity=T, all returned entries SHALL have similarity >= T.
**Validates: Requirements 13.3**

**Property 36: Multi-source search**
*For any* Memory_Retriever with both Working_Memory and Semantic_Memory configured, search results SHALL include entries from both sources.
**Validates: Requirements 13.4**

**Property 37: Similarity score transparency**
*For any* RetrievalResult from Memory_Retriever, the similarity field SHALL be present and be a number between 0 and 1.
**Validates: Requirements 13.6**

### Integration Properties (38-44)

**Property 38: Automatic planning application**
*For any* CognitiveSubTask execution with planning.enabled=true, a planning event SHALL be emitted before execution begins.
**Validates: Requirements 14.2**

**Property 39: Automatic reflection application**
*For any* CognitiveSubTask execution with reflection.enabled=true, a validation event SHALL be emitted after execution completes.
**Validates: Requirements 14.3**

**Property 40: Selective feature enabling**
*For any* CognitiveConfig with only planning.enabled=true, reflection and memory features SHALL not be activated.
**Validates: Requirements 14.4**

**Property 41: Cognitive event emission**
*For any* cognitive operation (planning, validation, correction, memory access), the Cognitive_Layer SHALL emit a corresponding event.
**Validates: Requirements 14.6**

**Property 42: Default configuration application**
*For any* CognitiveSubTask created without explicit configuration, getConfig() SHALL return the default configuration values.
**Validates: Requirements 15.2**

**Property 43: Invalid configuration rejection**
*For any* configuration with invalid values (e.g., negative maxConcurrency), configure() SHALL throw an error.
**Validates: Requirements 15.3**

**Property 44: Configuration serialization round-trip**
*For any* valid CognitiveConfig, serializing and then deserializing SHALL produce an equivalent configuration.
**Validates: Requirements 15.6**

## Error Handling

### Error Categories

```typescript
// 认知层错误基类
class CognitiveError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CognitiveError';
  }
}

// 规划错误
class PlanningError extends CognitiveError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PLANNING_ERROR', context);
    this.name = 'PlanningError';
  }
}

// 依赖错误
class DependencyError extends CognitiveError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DEPENDENCY_ERROR', context);
    this.name = 'DependencyError';
  }
}

// 验证错误
class ValidationError extends CognitiveError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

// 权限错误
class PermissionError extends CognitiveError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PERMISSION_ERROR', context);
    this.name = 'PermissionError';
  }
}

// 沙箱错误
class SandboxError extends CognitiveError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SANDBOX_ERROR', context);
    this.name = 'SandboxError';
  }
}

// 记忆错误
class MemoryError extends CognitiveError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MEMORY_ERROR', context);
    this.name = 'MemoryError';
  }
}
```

### Error Recovery Strategies

1. **规划失败**: 降级为单步执行，不进行任务分解
2. **依赖分析失败**: 使用串行执行策略
3. **验证失败**: 触发反思循环，尝试自我纠错
4. **权限拒绝**: 返回明确错误，不尝试重试
5. **沙箱超时**: 终止执行，返回部分结果（如有）
6. **记忆存储失败**: 记录警告，继续执行（记忆为可选功能）

### Integration with Existing Error Handler

```typescript
// 与现有 error-handler 集成
import { ErrorHandlerBuilder, isRetryableError } from '../error-handler';

const cognitiveErrorHandler = new ErrorHandlerBuilder()
  .retry({
    maxRetries: 3,
    delay: 1000,
    backoffMultiplier: 2,
    retryOn: (error) => {
      // 认知层特定的可重试错误
      if (error.includes('rate limit')) return true;
      if (error.includes('timeout')) return true;
      return isRetryableError(error);
    },
  })
  .fallback(async (error, config) => {
    // 降级策略：禁用认知功能，直接执行
    console.warn(`Cognitive layer failed: ${error}, falling back to direct execution`);
    return runSubTask(config, runtime);
  })
  .timeout(60000)
  .build();
```

## Testing Strategy

### 测试框架

- **单元测试**: Vitest
- **属性测试**: fast-check（用于属性基测试）
- **模拟**: vitest mock 功能

### 测试目录结构

```
packages/agent/test/subtask/cognitive/
├── planning/
│   ├── decomposer.test.ts
│   ├── dependency.test.ts
│   └── planner.test.ts
├── reflection/
│   ├── validator.test.ts
│   ├── diagnoser.test.ts
│   └── corrector.test.ts
├── memory/
│   ├── working.test.ts
│   ├── semantic.test.ts
│   ├── retriever.test.ts
│   └── embedding.test.ts
├── config.test.ts
└── cognitive-subtask.test.ts
```

### LLM 测试策略

> **核心问题**：LLM 输出不确定，传统 Mock 无法真正验证行为正确性。

#### 测试分层策略

| 层级 | 测试类型 | LLM 依赖 | 目的 |
|------|----------|----------|------|
| **L1 纯逻辑** | 单元测试 | 无 | 验证数据结构、算法、转换逻辑 |
| **L2 接口契约** | 契约测试 | Mock | 验证输入输出格式符合预期 |
| **L3 行为验证** | 集成测试 | 真实 API | 验证端到端行为（可选，CI 中跳过） |

#### L1 纯逻辑测试（推荐重点）

不依赖 LLM 的组件应该有完整的单元测试：

```typescript
// dependency.test.ts - 循环检测是纯算法
describe('DependencyAnalyzer', () => {
  it('should detect simple cycle', () => {
    const graph = {
      nodes: ['A', 'B', 'C'],
      dependencies: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' },  // 形成环
      ],
    };
    
    const result = detectCycles(graph);
    expect(result).not.toBeNull();
    expect(result).toContain('A');
  });
  
  it('should return null for DAG', () => {
    const graph = {
      nodes: ['A', 'B', 'C'],
      dependencies: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ],
    };
    
    expect(detectCycles(graph)).toBeNull();
  });
});

// working.test.ts - LRU 淘汰是纯逻辑
describe('WorkingMemory', () => {
  it('should evict LRU entry when at capacity', () => {
    const memory = new WorkingMemory({ maxEntries: 2, sessionId: 'test' });
    
    memory.set('a', 1);
    memory.set('b', 2);
    memory.get('a');  // 访问 a，使 b 成为 LRU
    memory.set('c', 3);  // 触发淘汰
    
    expect(memory.has('a')).toBe(true);
    expect(memory.has('b')).toBe(false);  // b 被淘汰
    expect(memory.has('c')).toBe(true);
  });
});
```

#### L2 契约测试（Mock Provider）

验证与 LLM 的交互格式正确，但不验证 LLM 输出内容：

```typescript
// decomposer.test.ts
describe('TaskDecomposer', () => {
  // Mock Provider 只验证调用格式
  const mockProvider = {
    chat: vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'analyze_task',
          input: {
            steps: [
              { id: 'step-1', objective: 'Mock step', complexity: 'low' }
            ]
          }
        }
      ],
      usage: { input_tokens: 100, output_tokens: 50 }
    })
  };
  
  it('should call provider with correct tool definition', async () => {
    const decomposer = new TaskDecomposer(mockProvider);
    await decomposer.decompose('Build a REST API');
    
    // 验证调用格式，不验证结果内容
    expect(mockProvider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'analyze_task' })
        ])
      })
    );
  });
  
  it('should handle empty task input', async () => {
    const decomposer = new TaskDecomposer(mockProvider);
    
    // 这是纯逻辑验证，不需要真实 LLM
    await expect(decomposer.decompose('')).rejects.toThrow('Invalid input');
  });
});
```

#### L3 集成测试（真实 API，可选）

用于验证真实行为，但不作为 CI 必须通过的测试：

```typescript
// decomposer.integration.test.ts
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('TaskDecomposer Integration', () => {
  it('should decompose a real task', async () => {
    const provider = createClaudeProvider();
    const decomposer = new TaskDecomposer(provider);
    
    const plan = await decomposer.decompose('Create a user login form');
    
    // 宽松断言：只验证结构，不验证具体内容
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every(s => s.id && s.objective)).toBe(true);
  });
});
```

#### 为什么不推荐 Mock LLM 做属性测试

1. **Mock 无法捕捉真实问题**：LLM 的问题往往是输出格式异常、幻觉、拒绝回答等，Mock 无法模拟
2. **Mock 与实现耦合**：Mock 的响应格式与实现细节绑定，重构时需要同步更新
3. **虚假的覆盖率**：100 次 Mock 调用本质上是同一个测试
4. **成本问题**：真实 API 测试成本高，但 Mock 测试价值低

**推荐策略**：
- 将 LLM 调用隔离到最小范围
- 对 LLM 输出做防御性解析
- 重点测试解析和后处理逻辑
- 集成测试用于验收，不用于回归

### 属性测试策略

属性测试适用于纯逻辑组件，不适用于 LLM 相关组件：

```typescript
// dependency.property.test.ts
import { fc } from '@fast-check/vitest';

describe('DependencyAnalyzer Properties', () => {
  // Property 4: 依赖引用完整性（纯逻辑）
  it.prop([arbitraryDependencyGraph()], { numRuns: 100 })(
    'all dependency references should exist in nodes',
    (graph) => {
      const nodeSet = new Set(graph.nodes);
      for (const dep of graph.dependencies) {
        expect(nodeSet.has(dep.from)).toBe(true);
        expect(nodeSet.has(dep.to)).toBe(true);
      }
    }
  );
});

// working.property.test.ts
describe('WorkingMemory Properties', () => {
  // Property 32: 容量限制（纯逻辑）
  it.prop(
    [fc.array(fc.tuple(fc.string(), fc.anything()), { minLength: 1, maxLength: 50 })],
    { numRuns: 100 }
  )(
    'entry count should never exceed maxEntries',
    (entries) => {
      const maxEntries = 10;
      const memory = new WorkingMemory({ maxEntries, sessionId: 'test' });
      
      for (const [key, value] of entries) {
        memory.set(key, value);
      }
      
      expect(memory.getStats().entryCount).toBeLessThanOrEqual(maxEntries);
    }
  );
});
```

### 单元测试策略

单元测试用于验证特定示例和边界情况：

```typescript
// 示例：decomposer.test.ts
describe('TaskDecomposer', () => {
  it('should decompose a simple task into steps', async () => {
    const decomposer = createTaskDecomposer(mockProvider);
    const plan = await decomposer.decompose('Create a REST API with user authentication');
    
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0]).toHaveProperty('id');
    expect(plan.steps[0]).toHaveProperty('objective');
  });

  it('should reject empty task descriptions', async () => {
    const decomposer = createTaskDecomposer(mockProvider);
    
    await expect(decomposer.decompose('')).rejects.toThrow('Invalid input');
    await expect(decomposer.decompose('   ')).rejects.toThrow('Invalid input');
  });
});
```

### 属性测试策略

属性测试用于验证普遍性质，每个属性测试至少运行 100 次迭代：

```typescript
// 示例：decomposer.property.test.ts
import { fc } from '@fast-check/vitest';

describe('TaskDecomposer Properties', () => {
  // Feature: agent-cognitive-layer, Property 1: Task decomposition produces valid plans
  it.prop([fc.string().filter(s => s.trim().length > 0)], { numRuns: 100 })(
    'should produce valid plans for any non-empty task',
    async (task) => {
      const decomposer = createTaskDecomposer(mockProvider);
      const plan = await decomposer.decompose(task);
      
      // 每个步骤都有唯一 ID
      const ids = plan.steps.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      
      // 每个步骤都有有效的复杂度
      for (const step of plan.steps) {
        expect(['low', 'medium', 'high']).toContain(step.complexity);
      }
    }
  );

  // Feature: agent-cognitive-layer, Property 2: Empty task rejection
  it.prop([fc.string().filter(s => s.trim().length === 0)], { numRuns: 100 })(
    'should reject whitespace-only tasks',
    async (task) => {
      const decomposer = createTaskDecomposer(mockProvider);
      await expect(decomposer.decompose(task)).rejects.toThrow();
    }
  );
});
```

```typescript
// 示例：dependency.property.test.ts
describe('DependencyAnalyzer Properties', () => {
  // Feature: agent-cognitive-layer, Property 3: Circular dependency detection
  it.prop([arbitraryPlanWithCycle()], { numRuns: 100 })(
    'should detect circular dependencies',
    async (plan) => {
      const analyzer = createDependencyAnalyzer();
      const result = await analyzer.analyze(plan);
      
      const cycles = analyzer.detectCycles(result);
      expect(cycles).not.toBeNull();
    }
  );

  // Feature: agent-cognitive-layer, Property 4: Dependency reference integrity
  it.prop([arbitraryTaskPlan()], { numRuns: 100 })(
    'should only reference existing step IDs',
    async (plan) => {
      const analyzer = createDependencyAnalyzer();
      const graph = await analyzer.analyze(plan);
      
      const stepIds = new Set(plan.steps.map(s => s.id));
      for (const dep of graph.dependencies) {
        expect(stepIds.has(dep.from)).toBe(true);
        expect(stepIds.has(dep.to)).toBe(true);
      }
    }
  );
});
```

```typescript
// 示例：registry.property.test.ts
describe('ToolRegistry Properties', () => {
  // Feature: agent-cognitive-layer, Property 14: Tool registration round-trip
  it.prop([arbitraryToolDefinition()], { numRuns: 100 })(
    'should round-trip tool registration',
    (tool) => {
      const registry = createToolRegistry();
      registry.register(tool);
      
      const retrieved = registry.get(tool.name);
      expect(retrieved?.name).toBe(tool.name);
      expect(retrieved?.description).toBe(tool.description);
    }
  );

  // Feature: agent-cognitive-layer, Property 16: Duplicate tool rejection
  it.prop([arbitraryToolDefinition()], { numRuns: 100 })(
    'should reject duplicate registration without override',
    (tool) => {
      const registry = createToolRegistry();
      registry.register(tool);
      
      expect(() => registry.register(tool)).toThrow();
      expect(() => registry.register(tool, { override: true })).not.toThrow();
    }
  );
});
```

```typescript
// 示例：working.property.test.ts
describe('WorkingMemory Properties', () => {
  // Feature: agent-cognitive-layer, Property 32: Working memory entry limit
  it.prop([fc.array(fc.tuple(fc.string(), fc.anything()), { minLength: 1, maxLength: 50 })], { numRuns: 100 })(
    'should never exceed maxEntries',
    (entries) => {
      const maxEntries = 10;
      const memory = createWorkingMemory({ maxEntries, sessionId: 'test' });
      
      for (const [key, value] of entries) {
        memory.set(key, value);
      }
      
      expect(memory.getStats().entryCount).toBeLessThanOrEqual(maxEntries);
    }
  );

  // Feature: agent-cognitive-layer, Property 33: LRU eviction
  it.prop([fc.array(fc.string(), { minLength: 5, maxLength: 20 })], { numRuns: 100 })(
    'should evict LRU entries when at capacity',
    (keys) => {
      const maxEntries = 3;
      const memory = createWorkingMemory({ maxEntries, sessionId: 'test' });
      
      // 存储所有 key
      for (const key of keys) {
        memory.set(key, 'value');
      }
      
      // 最近的 key 应该存在
      const recentKeys = keys.slice(-maxEntries);
      for (const key of recentKeys) {
        expect(memory.has(key)).toBe(true);
      }
    }
  );
});
```

```typescript
// 示例：retriever.property.test.ts
describe('MemoryRetriever Properties', () => {
  // Feature: agent-cognitive-layer, Property 39: Similarity ranking
  it.prop([fc.string(), fc.array(arbitrarySemanticEntry(), { minLength: 2 })], { numRuns: 100 })(
    'should return results in descending similarity order',
    async (query, entries) => {
      const retriever = createMemoryRetriever(mockEmbeddingProvider);
      // Setup entries...
      
      const results = await retriever.search(query);
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity!);
      }
    }
  );

  // Feature: agent-cognitive-layer, Property 41: Similarity threshold filtering
  it.prop([fc.string(), fc.float({ min: 0, max: 1 })], { numRuns: 100 })(
    'should filter by minimum similarity',
    async (query, minSimilarity) => {
      const retriever = createMemoryRetriever(mockEmbeddingProvider);
      
      const results = await retriever.search(query, { minSimilarity });
      
      for (const result of results) {
        expect(result.similarity).toBeGreaterThanOrEqual(minSimilarity);
      }
    }
  );
});
```

```typescript
// 示例：config.property.test.ts
describe('Configuration Properties', () => {
  // Feature: agent-cognitive-layer, Property 50: Configuration serialization round-trip
  it.prop([arbitraryCognitiveConfig()], { numRuns: 100 })(
    'should round-trip configuration through serialization',
    (config) => {
      const serialized = serializeConfig(config);
      const deserialized = deserializeConfig(serialized);
      
      expect(deserialized).toEqual(config);
    }
  );
});
```

### 自定义生成器

```typescript
// 测试数据生成器
import * as fc from 'fast-check';

// 生成有效的 TaskStep
const arbitraryTaskStep = (): fc.Arbitrary<TaskStep> =>
  fc.record({
    id: fc.uuid(),
    objective: fc.string({ minLength: 1 }),
    description: fc.string(),
    complexity: fc.constantFrom('low', 'medium', 'high'),
  });

// 生成有效的 TaskPlan
const arbitraryTaskPlan = (): fc.Arbitrary<TaskPlan> =>
  fc.record({
    id: fc.uuid(),
    originalTask: fc.string({ minLength: 1 }),
    steps: fc.array(arbitraryTaskStep(), { minLength: 1, maxLength: 10 }),
    createdAt: fc.nat(),
  });

// 生成包含循环依赖的 TaskPlan
const arbitraryPlanWithCycle = (): fc.Arbitrary<TaskPlan> =>
  arbitraryTaskPlan().map(plan => {
    if (plan.steps.length >= 2) {
      // 添加循环依赖标记
      plan.steps[0].metadata = { dependsOn: plan.steps[plan.steps.length - 1].id };
      plan.steps[plan.steps.length - 1].metadata = { dependsOn: plan.steps[0].id };
    }
    return plan;
  });

// 生成有效的 ToolDefinition
const arbitraryToolDefinition = (): fc.Arbitrary<ToolDefinition> =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-z_][a-z0-9_]*$/i.test(s)),
    description: fc.string({ minLength: 1 }),
    inputSchema: fc.constant({ type: 'object', properties: {} }),
    handler: fc.constant(async () => ({})),
  });

// 生成有效的 CognitiveConfig
const arbitraryCognitiveConfig = (): fc.Arbitrary<CognitiveConfig> =>
  fc.record({
    planning: fc.option(fc.record({
      enabled: fc.boolean(),
      maxConcurrency: fc.nat({ max: 10 }),
    })),
    reflection: fc.option(fc.record({
      enabled: fc.boolean(),
      maxCorrectionAttempts: fc.nat({ max: 10 }),
    })),
    tools: fc.option(fc.record({
      enabled: fc.boolean(),
    })),
    memory: fc.option(fc.record({
      enabled: fc.boolean(),
    })),
  });
```

### Mock 策略

```typescript
// Claude SDK Mock
const mockClaudeClient = {
  messages: {
    create: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'mocked response' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  },
};

// Embedding Provider Mock
const mockEmbeddingProvider: EmbeddingProvider = {
  embed: vi.fn().mockResolvedValue(new Array(384).fill(0).map(() => Math.random())),
  embedBatch: vi.fn().mockImplementation((texts: string[]) =>
    Promise.resolve(texts.map(() => new Array(384).fill(0).map(() => Math.random())))
  ),
  getDimension: () => 384,
};
```

### 测试覆盖目标

- 单元测试覆盖率: >= 80%
- 属性测试: 每个正确性属性至少一个对应的属性测试
- 集成测试: 覆盖主要使用场景
