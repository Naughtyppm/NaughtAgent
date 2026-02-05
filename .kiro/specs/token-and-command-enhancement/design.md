# 设计文档：Token 优化与命令增强

## 概述

本设计文档描述 Token 优化和命令增强功能的技术实现方案。该功能扩展现有的 Token 管理系统和命令系统，提供更智能的 Token 控制和更强大的命令能力。

### 目标

1. **降低 Token 消耗** - 通过截断、压缩、缓存减少 30%+ 的 Token 使用
2. **支持更长对话** - 50+ 轮对话不超出上下文限制
3. **提升命令易用性** - 别名、历史、管道、链式执行

### 非目标

- 不实现跨会话的消息持久化（仅命令历史持久化）
- 不实现分布式缓存（仅内存缓存）
- 不实现命令宏录制功能

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent 核心                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Token 层                                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │   输出      │  │   Token     │  │    上下文       │   │   │
│  │  │  截断器     │  │   压缩器    │  │    注入器       │   │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘   │   │
│  │         │                │                   │            │   │
│  │         └────────────────┼───────────────────┘            │   │
│  │                          ▼                                │   │
│  │                  ┌───────────────┐                        │   │
│  │                  │ Token 管理器  │                        │   │
│  │                  │   (现有)      │                        │   │
│  │                  └───────────────┘                        │   │
│  │                          │                                │   │
│  │                          ▼                                │   │
│  │                  ┌───────────────┐                        │   │
│  │                  │  索引缓存     │                        │   │
│  │                  └───────────────┘                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  命令层                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │   │
│  │  │   别名      │  │   历史      │  │    管道         │   │   │
│  │  │  管理器     │  │   管理器    │  │    执行器       │   │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘   │   │
│  │         │                │                   │            │   │
│  │         └────────────────┼───────────────────┘            │   │
│  │                          ▼                                │   │
│  │                  ┌───────────────┐                        │   │
│  │                  │ 命令路由器    │                        │   │
│  │                  │   (现有)      │                        │   │
│  │                  └───────────────┘                        │   │
│  │                          │                                │   │
│  │                          ▼                                │   │
│  │                  ┌───────────────┐                        │   │
│  │                  │   链式        │                        │   │
│  │                  │   执行器      │                        │   │
│  │                  └───────────────┘                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户输入
    │
    ▼
┌─────────────────┐
│ 链式解析器      │ ─── 解析 && 和 ; 分隔符
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 管道解析器      │ ─── 解析 | 分隔符
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 别名解析器      │ ─── 解析命令别名
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 命令路由器      │ ─── 路由到具体命令
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 命令执行        │ ─── 执行命令
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 输出截断器      │ ─── 截断过长输出
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 历史管理器      │ ─── 记录历史
└─────────────────┘
```

## 组件和接口

### Phase A: Token 优化组件

#### 1. 工具输出截断器

```typescript
interface TruncationConfig {
  /** 单次输出最大 Token 数（默认 4000） */
  maxOutputTokens: number
  /** 截断策略 */
  strategy: 'head' | 'tail' | 'middle'
  /** 是否保留结构（JSON/代码） */
  preserveStructure: boolean
  /** 截断指示器模板 */
  truncationIndicator: string
}

interface TruncationResult {
  /** 截断后的内容 */
  content: string
  /** 是否发生截断 */
  truncated: boolean
  /** 原始 Token 数 */
  originalTokens: number
  /** 截断后 Token 数 */
  finalTokens: number
}

interface ToolOutputTruncator {
  /** 截断文本内容 */
  truncate(content: string, config?: Partial<TruncationConfig>): TruncationResult
  
  /** 截断文件读取结果 */
  truncateFileContent(content: string, filePath: string): TruncationResult
  
  /** 截断 bash 输出 */
  truncateBashOutput(stdout: string, stderr: string): TruncationResult
  
  /** 截断 grep 结果 */
  truncateGrepResults(results: GrepMatch[], totalMatches: number): TruncationResult
  
  /** 截断 JSON 内容（保持有效结构） */
  truncateJson(json: string): TruncationResult
}
```


#### 2. Token 压缩器

```typescript
interface CompressionConfig {
  /** 保留最近消息数（默认 10） */
  keepRecentMessages: number
  /** 压缩触发阈值（占最大上下文比例，默认 0.8） */
  compressionThreshold: number
  /** 摘要最大 Token 数 */
  summaryMaxTokens: number
  /** 是否保留工具调用完整性 */
  preserveToolCalls: boolean
}

interface CompressionResult {
  /** 压缩后的消息列表 */
  messages: Message[]
  /** 压缩的消息数 */
  compressedCount: number
  /** 生成的摘要 */
  summary?: string
  /** 压缩前 Token 数 */
  beforeTokens: number
  /** 压缩后 Token 数 */
  afterTokens: number
}

interface TokenCompressor {
  /** 压缩消息历史 */
  compress(messages: Message[], config?: Partial<CompressionConfig>): CompressionResult
  
  /** 生成消息摘要 */
  summarize(messages: Message[]): string
  
  /** 选择重要消息 */
  selectImportant(messages: Message[]): Message[]
  
  /** 检查是否需要压缩 */
  needsCompression(messages: Message[], maxTokens: number): boolean
}
```

#### 3. 项目索引缓存

```typescript
interface FileEntry {
  /** 文件路径（相对于项目根） */
  path: string
  /** 文件大小（字节） */
  size: number
  /** 修改时间戳 */
  mtime: number
  /** 是否是目录 */
  isDirectory: boolean
  /** 文件类型（扩展名） */
  type: string
}

interface ProjectIndex {
  /** 文件列表 */
  files: FileEntry[]
  /** 目录树字符串 */
  structure: string
  /** 最后更新时间 */
  lastUpdated: number
  /** 内容哈希（用于变更检测） */
  hash: string
  /** 文件总数 */
  totalFiles: number
  /** 目录总数 */
  totalDirs: number
}

interface CacheStats {
  /** 缓存命中次数 */
  hits: number
  /** 缓存未命中次数 */
  misses: number
  /** 命中率 */
  hitRate: number
  /** 缓存大小（条目数） */
  size: number
  /** 最后刷新时间 */
  lastRefresh: number
}

interface IndexCache {
  /** 获取项目索引（优先返回缓存） */
  getIndex(projectPath: string): Promise<ProjectIndex>
  
  /** 强制刷新缓存 */
  refresh(projectPath: string): Promise<ProjectIndex>
  
  /** 增量更新（文件变更时） */
  update(projectPath: string, changes: FileChange[]): Promise<void>
  
  /** 使缓存失效 */
  invalidate(projectPath: string): void
  
  /** 获取缓存统计 */
  getStats(): CacheStats
  
  /** 检查缓存是否有效 */
  isValid(projectPath: string): boolean
}

interface FileChange {
  type: 'create' | 'modify' | 'delete'
  path: string
}
```

#### 4. 上下文注入器

```typescript
interface InjectionConfig {
  /** 最大注入 Token 数 */
  maxInjectionTokens: number
  /** 忽略的文件模式 */
  ignorePatterns: string[]
  /** 优先文件模式 */
  priorityPatterns: string[]
  /** 是否注入会话摘要 */
  injectSessionSummary: boolean
  /** 是否注入项目结构 */
  injectProjectStructure: boolean
}

interface InjectionResult {
  /** 注入的上下文内容 */
  context: string
  /** 选中的文件列表 */
  selectedFiles: string[]
  /** 注入的 Token 数 */
  tokenCount: number
  /** 选择原因 */
  selectionReasons: Map<string, string>
}

interface ContextInjector {
  /** 根据查询选择相关文件 */
  selectRelevantFiles(query: string, projectPath: string): Promise<string[]>
  
  /** 注入项目上下文 */
  injectProjectContext(projectPath: string): Promise<string>
  
  /** 注入会话摘要 */
  injectSessionSummary(messages: Message[]): string
  
  /** 完整注入流程 */
  inject(query: string, projectPath: string, messages: Message[]): Promise<InjectionResult>
  
  /** 解析 @file 语法 */
  parseFileReferences(query: string): string[]
}
```


### Phase B: 命令增强组件

#### 5. 别名管理器

```typescript
interface AliasConfig {
  /** 别名映射：别名 -> 原命令 */
  aliases: Record<string, string>
}

interface AliasManager {
  /** 加载别名配置 */
  load(): Promise<void>
  
  /** 保存别名配置 */
  save(): Promise<void>
  
  /** 添加别名 */
  add(alias: string, command: string): Result<void, string>
  
  /** 移除别名 */
  remove(alias: string): boolean
  
  /** 解析别名（返回原命令或原输入） */
  resolve(input: string): string
  
  /** 获取所有别名 */
  getAll(): Record<string, string>
  
  /** 检查是否与内置命令冲突 */
  hasConflict(alias: string): boolean
}
```

#### 6. 历史管理器

```typescript
interface HistoryEntry {
  /** 命令内容 */
  command: string
  /** 执行时间戳 */
  timestamp: number
  /** 执行是否成功 */
  success: boolean
}

interface HistoryConfig {
  /** 历史文件路径 */
  filePath: string
  /** 最大条目数 */
  maxEntries: number
  /** 是否去重连续相同命令 */
  deduplicateConsecutive: boolean
}

interface HistoryManager {
  /** 加载历史 */
  load(): Promise<void>
  
  /** 保存历史 */
  save(): Promise<void>
  
  /** 添加历史记录 */
  add(command: string, success: boolean): void
  
  /** 搜索历史 */
  search(pattern: string): HistoryEntry[]
  
  /** 获取最近 N 条 */
  recent(count: number): HistoryEntry[]
  
  /** 获取全部历史 */
  getAll(): HistoryEntry[]
  
  /** 清空历史 */
  clear(): void
}
```

#### 7. 管道执行器

```typescript
interface PipelineStage {
  /** 命令名称 */
  command: string
  /** 命令参数 */
  args: string[]
  /** 命名参数 */
  namedArgs: Record<string, string>
  /** 原始输入 */
  rawInput: string
}

interface PipelineResult {
  /** 是否成功 */
  success: boolean
  /** 最终输出 */
  output: string
  /** 错误信息 */
  error?: string
  /** 各阶段结果 */
  stageResults: ExecutionResult[]
  /** 失败的阶段索引（如果有） */
  failedStage?: number
}

interface PipelineExecutor {
  /** 解析管道语法 */
  parse(input: string): PipelineStage[]
  
  /** 检查输入是否包含管道 */
  hasPipe(input: string): boolean
  
  /** 执行管道 */
  execute(stages: PipelineStage[], context: DispatchContext): Promise<PipelineResult>
}
```

#### 8. 链式执行器

```typescript
type ChainOperator = '&&' | ';'

interface ChainSegment {
  /** 命令或管道 */
  input: string
  /** 与下一段的连接符 */
  operator?: ChainOperator
}

interface ChainResult {
  /** 是否成功 */
  success: boolean
  /** 合并的输出 */
  output: string
  /** 错误信息 */
  error?: string
  /** 各段结果 */
  segmentResults: (ExecutionResult | PipelineResult)[]
  /** 失败的段索引（如果有） */
  failedSegment?: number
}

interface ChainExecutor {
  /** 解析链式语法 */
  parse(input: string): ChainSegment[]
  
  /** 检查输入是否包含链式操作符 */
  hasChain(input: string): boolean
  
  /** 执行链式命令 */
  execute(segments: ChainSegment[], context: DispatchContext): Promise<ChainResult>
}
```

## 数据模型

### Token 配置

```typescript
interface TokenOptimizationConfig {
  /** 工具输出截断配置 */
  truncation: TruncationConfig
  /** Token 压缩配置 */
  compression: CompressionConfig
  /** 上下文注入配置 */
  injection: InjectionConfig
  /** 索引缓存 TTL（毫秒） */
  cacheTTL: number
}

const DEFAULT_TOKEN_OPTIMIZATION_CONFIG: TokenOptimizationConfig = {
  truncation: {
    maxOutputTokens: 4000,
    strategy: 'middle',
    preserveStructure: true,
    truncationIndicator: '\n... [已截断: 移除了 {removed} 个 token] ...\n'
  },
  compression: {
    keepRecentMessages: 10,
    compressionThreshold: 0.8,
    summaryMaxTokens: 500,
    preserveToolCalls: true
  },
  injection: {
    maxInjectionTokens: 2000,
    ignorePatterns: ['node_modules/**', '.git/**', 'dist/**'],
    priorityPatterns: ['src/**/*.ts', '*.md'],
    injectSessionSummary: true,
    injectProjectStructure: true
  },
  cacheTTL: 5 * 60 * 1000 // 5 分钟
}
```

### 命令配置

```typescript
interface CommandEnhancementConfig {
  /** 别名配置文件路径 */
  aliasPath: string
  /** 历史配置 */
  history: HistoryConfig
  /** 是否启用管道 */
  enablePipes: boolean
  /** 是否启用链式执行 */
  enableChaining: boolean
}

const DEFAULT_COMMAND_ENHANCEMENT_CONFIG: CommandEnhancementConfig = {
  aliasPath: '~/.naughtyagent/aliases.json',
  history: {
    filePath: '~/.naughtyagent/history',
    maxEntries: 1000,
    deduplicateConsecutive: true
  },
  enablePipes: true,
  enableChaining: true
}
```

### 持久化数据格式

#### aliases.json

```json
{
  "h": "/help",
  "c": "/clear",
  "q": "/exit",
  "r": "/refresh",
  "m": "/model"
}
```

#### history（行格式）

```
1704067200000|true|/help
1704067260000|true|/model claude-sonnet
1704067320000|false|/invalid-command
```


## 正确性属性

*属性是系统在所有有效执行中应保持为真的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规格和机器可验证正确性保证之间的桥梁。*

### Token 优化属性

**属性 1：截断遵守 Token 限制**
*对于任意*工具输出字符串和配置的最大 Token 限制，截断后的输出的 Token 数应小于或等于配置的限制。
**验证需求：1.1**

**属性 2：截断策略一致性**
*对于任意*内容字符串和截断策略（head/tail/middle），截断后的输出应根据策略保留内容：head 保留开头，tail 保留结尾，middle 同时保留开头和结尾。
**验证需求：1.5**

**属性 3：JSON 截断有效性**
*对于任意*需要截断的有效 JSON 字符串，截断后的输出应是有效的 JSON 或包含清晰的截断指示器。
**验证需求：1.6**

**属性 4：压缩保留最近消息**
*对于任意*消息列表和配置的 keepRecentMessages 数量 N，压缩后最后 N 条消息应保持不变。
**验证需求：2.2**

**属性 5：压缩维护角色完整性**
*对于任意*消息列表，压缩后每条消息应具有与其原始角色匹配的有效角色（user/assistant/tool）。
**验证需求：2.5**

**属性 6：压缩减少 Token 数量**
*对于任意*超过压缩阈值的消息列表，压缩应导致更低的总 Token 数（或回退到删除消息）。
**验证需求：2.1, 2.6**

**属性 7：缓存统计准确性**
*对于任意*缓存操作序列，命中/未命中计数应准确反映缓存命中和未命中的次数。
**验证需求：3.2**

**属性 8：增量更新正确性**
*对于任意*文件变更操作，增量更新后的索引应与完全重建的索引等价。
**验证需求：3.1**

**属性 9：上下文注入忽略模式**
*对于任意*匹配配置的忽略模式的文件，它不应被包含在注入的上下文中。
**验证需求：4.5**

**属性 10：@file 语法解析**
*对于任意*包含 @file 引用的查询，所有引用的文件应被包含在选中的文件列表中。
**验证需求：4.2**

**属性 11：关键词匹配选择**
*对于任意*包含文件名或路径关键词的查询，相关文件应被优先选择。
**验证需求：4.1**

### 命令增强属性

**属性 12：别名在查找前解析**
*对于任意*匹配配置别名的命令输入，路由器应在执行命令查找之前将别名解析为其目标命令。
**验证需求：5.2**

**属性 13：别名冲突拒绝**
*对于任意*与内置命令名称匹配的别名名称，添加该别名应失败并返回错误。
**验证需求：5.6**

**属性 14：别名持久化**
*对于任意*别名添加或删除操作，aliases.json 文件应被更新以反映更改。
**验证需求：5.7**

**属性 15：历史追加带去重**
*对于任意*命令执行，命令应立即追加到历史，除非它与紧接着的前一个命令相同。
**验证需求：6.2, 6.4**

**属性 16：历史最大条目数**
*对于任意*超过 maxEntries 条命令的历史，最旧的条目应被移除以维持限制。
**验证需求：6.3**

**属性 17：历史模式搜索**
*对于任意*搜索模式，搜索结果应仅包含命令匹配该模式的条目。
**验证需求：6.5**

**属性 18：引号外管道解析**
*对于任意*输入字符串，引号字符串内的管道字符（|）不应被解析为管道操作符。
**验证需求：7.1**

**属性 19：管道数据流**
*对于任意*具有多个阶段的管道，阶段 N 的输出应作为阶段 N+1 的第一个参数传递。
**验证需求：7.2**

**属性 20：管道失败停止执行**
*对于任意*阶段 N 失败的管道，阶段 N+1 及之后的阶段不应被执行。
**验证需求：7.3**

**属性 21：链式条件执行（&&）**
*对于任意*使用 && 操作符的链，如果命令 N 失败，命令 N+1 不应被执行。
**验证需求：8.1, 8.4**

**属性 22：链式无条件执行（;）**
*对于任意*使用 ; 操作符的链，所有命令应被执行，无论前一个命令成功/失败。
**验证需求：8.2**

**属性 23：链式结果聚合**
*对于任意*链式执行，结果应包含所有执行命令的组合输出和单独结果。
**验证需求：8.3**

**属性 24：混合操作符优先级**
*对于任意*包含混合 && 和 ; 操作符的输入，操作符应从左到右求值（同优先级，遵循 shell 语义）。
**验证需求：8.5**


## 错误处理

### Token 优化错误

| 错误场景 | 处理策略 |
|---------|---------|
| Token 估算不准确 | 为所有限制添加 10% 安全缓冲 |
| JSON 截断破坏结构 | 回退到带指示器的纯文本截断 |
| 压缩丢失关键上下文 | 保留所有被后续消息引用的工具调用 |
| 缓存损坏 | 在下次访问时使缓存失效并重建 |
| 索引期间文件系统错误 | 记录错误，返回带警告的部分索引 |

### 命令增强错误

| 错误场景 | 处理策略 |
|---------|---------|
| 别名配置文件缺失 | 创建默认空配置 |
| 别名配置解析错误 | 记录警告，使用空别名 |
| 历史文件损坏 | 截断到最后一个有效条目 |
| 管道命令未找到 | 停止管道，报告哪个命令失败 |
| 管道到不支持 stdin 的命令 | 报告错误并提供建议 |
| 链式语法错误 | 报告解析错误及位置 |

### 错误响应格式

```typescript
interface ErrorResponse {
  code: string           // 错误代码，如 'TRUNCATION_FAILED'
  message: string        // 用户友好的错误消息
  details?: string       // 技术细节（调试用）
  suggestion?: string    // 建议的解决方案
  recoverable: boolean   // 是否可恢复
}
```

## 测试策略

### 单元测试

单元测试覆盖各组件的核心逻辑：

1. **工具输出截断器**
   - 各截断策略的正确性
   - JSON 结构保留
   - Token 计数准确性

2. **Token 压缩器**
   - 消息压缩逻辑
   - 摘要生成
   - 角色完整性保持

3. **索引缓存**
   - 缓存命中/未命中
   - TTL 过期
   - 增量更新

4. **上下文注入器**
   - 关键词匹配
   - @file 解析
   - Token 限制

5. **别名管理器**
   - 别名解析
   - 冲突检测
   - 持久化

6. **历史管理器**
   - 添加/搜索
   - 去重
   - 最大条目限制

7. **管道执行器**
   - 管道解析
   - 数据流传递
   - 错误处理

8. **链式执行器**
   - 链式解析
   - 条件执行
   - 操作符优先级

### 属性测试

使用 **fast-check** 库进行属性测试，每个属性测试至少运行 100 次迭代。

```typescript
// 示例：截断属性测试
import fc from 'fast-check'

describe('工具输出截断器属性', () => {
  // 功能: token-and-command-enhancement, 属性 1: 截断遵守 Token 限制
  it('截断后的输出不应超过 Token 限制', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 100, maxLength: 10000 }),
        fc.integer({ min: 100, max: 1000 }),
        (content, maxTokens) => {
          const result = truncator.truncate(content, { maxOutputTokens: maxTokens })
          const actualTokens = estimateTokens(result.content)
          return actualTokens <= maxTokens
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

### 集成测试

集成测试验证组件间的协作：

1. **Token 优化流程**
   - 工具执行 → 输出截断 → 消息存储 → 压缩触发

2. **命令执行流程**
   - 输入解析 → 别名解析 → 管道/链式解析 → 命令执行 → 历史记录

### 测试文件组织

```
packages/agent/test/
├── token/
│   ├── truncator.test.ts
│   ├── compressor.test.ts
│   ├── cache.test.ts
│   └── injector.test.ts
└── command/
    ├── alias.test.ts
    ├── history.test.ts
    ├── pipeline.test.ts
    └── chain.test.ts
```
