# 设计文档：上下文与 Token 优化

## 概述

本设计实现 NaughtyAgent 的上下文感知增强和 Token 优化功能。核心目标是：

1. **减少重复工作**：通过缓存项目索引，避免每次对话都重新探索项目结构
2. **降低 Token 消耗**：通过消息压缩、输出截断和内容缓存，优化 Token 使用
3. **提升响应速度**：缓存命中时直接使用，无需等待项目分析

### 设计原则

- **渐进式集成**：复用现有 `context/` 和 `subtask/context/` 模块的能力
- **最小侵入**：不改变现有 Agent Loop 的核心流程
- **可配置性**：所有阈值和策略都可通过配置调整
- **透明性**：压缩和截断操作对用户可见（通过日志或提示）

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Agent Loop                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   输入      │───▶│   LLM       │───▶│   工具      │             │
│  │   处理器    │    │   调用      │    │   执行      │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │  上下文     │    │   Token     │    │   输出      │             │
│  │  注入器     │    │  压缩器     │    │  截断器     │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│         │                  │                  │                     │
└─────────┼──────────────────┼──────────────────┼─────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         优化层                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  索引缓存       │  │  内容缓存       │  │  配置管理器     │     │
│  │  (持久化)       │  │  (会话级)       │  │  (持久化)       │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│           │                    │                    │               │
│           ▼                    ▼                    ▼               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                       文件系统                               │   │
│  │  .naught/cache/project-index.json                           │   │
│  │  .naught/config.json                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 数据流

1. **启动时**：索引缓存检查缓存有效性 → 加载或重建索引 → 上下文注入器注入到系统提示
2. **对话中**：Token 压缩器监控消息历史 → 超阈值时压缩 → 保留重要消息
3. **工具执行后**：输出截断器检查输出长度 → 超限时截断 → 添加摘要指示
4. **文件读取时**：内容缓存计算 hash → 命中则返回引用 → 未命中则缓存并返回内容

## 组件与接口

### 1. 索引缓存 (`src/context/index-cache.ts`)

负责项目索引的持久化缓存管理。

```typescript
interface IndexCacheConfig {
  /** 缓存目录 */
  cacheDir: string
  /** 缓存文件名 */
  cacheFile: string
  /** 缓存有效期（毫秒），默认 24 小时 */
  ttl?: number
}

interface IndexCache {
  /** 加载缓存的项目索引 */
  load(): Promise<ProjectIndex | null>
  
  /** 保存项目索引到缓存 */
  save(index: ProjectIndex): Promise<void>
  
  /** 检查缓存是否有效 */
  isValid(index: ProjectIndex): Promise<boolean>
  
  /** 清除缓存 */
  clear(): Promise<void>
  
  /** 获取或创建索引（带缓存逻辑） */
  getOrCreate(cwd: string): Promise<ProjectIndex>
}

function createIndexCache(config: IndexCacheConfig): IndexCache
```

### 2. 哈希计算器 (`src/context/hash-calculator.ts`)

计算项目内容哈希，用于检测变更。

```typescript
interface HashCalculatorConfig {
  /** 要包含在哈希计算中的关键文件 */
  keyFiles: string[]
  /** 排除模式 */
  excludePatterns: string[]
  /** 是否包含文件修改时间 */
  includeTimestamps: boolean
}

interface HashCalculator {
  /** 计算项目哈希 */
  computeProjectHash(cwd: string): Promise<string>
  
  /** 计算单个文件内容哈希 */
  computeFileHash(filePath: string): Promise<string>
  
  /** 计算字符串内容哈希 */
  computeContentHash(content: string): string
}

function createHashCalculator(config?: Partial<HashCalculatorConfig>): HashCalculator
```

### 3. 上下文注入器 (`src/context/context-injector.ts`)

将项目上下文注入到系统提示中。

```typescript
interface ContextInjectorConfig {
  /** 是否启用自动注入 */
  enabled: boolean
  /** 最大注入 Token 数 */
  maxTokens: number
  /** 注入的内容类型 */
  include: {
    structure: boolean
    techStack: boolean
    keyFiles: boolean
    gitStatus: boolean
  }
}

interface ContextInjector {
  /** 构建项目上下文字符串 */
  buildProjectContext(index: ProjectIndex): string
  
  /** 注入到系统提示 */
  injectIntoSystemPrompt(basePrompt: string, index: ProjectIndex): string
  
  /** 估算注入内容的 Token 数 */
  estimateTokens(index: ProjectIndex): number
}

function createContextInjector(config?: Partial<ContextInjectorConfig>): ContextInjector
```

### 4. Token 压缩器 (`src/context/token-compressor.ts`)

主循环中的消息历史压缩器。

```typescript
interface TokenCompressorConfig {
  /** 触发压缩的 Token 阈值 */
  threshold: number
  /** 压缩后的目标 Token 数 */
  targetTokens: number
  /** 压缩策略 */
  strategy: 'sliding_window' | 'importance' | 'summary'
  /** 始终保留的最近消息数 */
  keepRecentCount: number
}

interface CompressionResult {
  /** 压缩后的消息 */
  messages: Message[]
  /** 压缩前 Token 数 */
  beforeTokens: number
  /** 压缩后 Token 数 */
  afterTokens: number
  /** 是否发生了压缩 */
  compressed: boolean
  /** 压缩摘要（如果生成） */
  summary?: string
}

interface TokenCompressor {
  /** 检查是否需要压缩 */
  needsCompression(messages: Message[]): boolean
  
  /** 执行压缩 */
  compress(messages: Message[]): Promise<CompressionResult>
  
  /** 获取当前 Token 使用量 */
  estimateTokens(messages: Message[]): number
}

function createTokenCompressor(config?: Partial<TokenCompressorConfig>): TokenCompressor
```

### 5. 输出截断器 (`src/tool/output-truncator.ts`)

工具输出截断器。

```typescript
interface OutputTruncatorConfig {
  /** 最大输出字符数 */
  maxLength: number
  /** 保留头部字符数 */
  headLength: number
  /** 保留尾部字符数 */
  tailLength: number
  /** 是否尝试在逻辑边界截断 */
  smartTruncate: boolean
}

interface TruncationResult {
  /** 截断后的输出 */
  output: string
  /** 是否被截断 */
  truncated: boolean
  /** 原始长度 */
  originalLength: number
  /** 截断后长度 */
  truncatedLength: number
}

interface OutputTruncator {
  /** 截断输出 */
  truncate(output: string, contentType?: string): TruncationResult
  
  /** 检查是否需要截断 */
  needsTruncation(output: string): boolean
}

function createOutputTruncator(config?: Partial<OutputTruncatorConfig>): OutputTruncator
```

### 6. 内容缓存 (`src/context/content-cache.ts`)

会话级别的文件内容缓存。

```typescript
interface ContentCacheEntry {
  /** 文件路径 */
  path: string
  /** 内容哈希 */
  hash: string
  /** 缓存时间 */
  cachedAt: number
  /** 内容长度 */
  length: number
}

interface ContentCache {
  /** 检查文件是否已缓存 */
  has(filePath: string, contentHash: string): boolean
  
  /** 添加到缓存 */
  add(filePath: string, content: string): ContentCacheEntry
  
  /** 获取哈希引用字符串 */
  getReference(filePath: string): string | null
  
  /** 清除缓存 */
  clear(): void
  
  /** 获取缓存统计 */
  getStats(): { entries: number; totalSize: number }
}

function createContentCache(): ContentCache
```

### 7. 优化配置 (`src/context/optimization-config.ts`)

优化配置管理。

```typescript
interface OptimizationConfig {
  /** Token 压缩配置 */
  compression: {
    enabled: boolean
    threshold: number
    targetTokens: number
    strategy: 'sliding_window' | 'importance' | 'summary'
  }
  /** 输出截断配置 */
  truncation: {
    enabled: boolean
    maxLength: number
  }
  /** 内容缓存配置 */
  contentCache: {
    enabled: boolean
  }
  /** 上下文注入配置 */
  contextInjection: {
    enabled: boolean
    maxTokens: number
  }
  /** 索引缓存配置 */
  indexCache: {
    enabled: boolean
    ttl: number
  }
}

interface OptimizationConfigManager {
  /** 加载配置 */
  load(cwd: string): Promise<OptimizationConfig>
  
  /** 获取默认配置 */
  getDefaults(): OptimizationConfig
  
  /** 合并配置 */
  merge(base: OptimizationConfig, override: Partial<OptimizationConfig>): OptimizationConfig
}

function createOptimizationConfigManager(): OptimizationConfigManager
```


## 数据模型

### ProjectIndex（项目索引）

项目索引的核心数据结构，存储在 `.naught/cache/project-index.json`。

```typescript
interface ProjectIndex {
  /** 索引版本号 */
  version: string
  /** 更新时间戳 */
  updatedAt: number
  /** 项目内容哈希（用于检测变更） */
  hash: string
  /** 项目根目录 */
  root: string
  /** 项目结构信息 */
  structure: {
    /** 目录树字符串 */
    tree: string
    /** 关键文件列表 */
    keyFiles: string[]
    /** 检测到的技术栈 */
    techStack: TechStack
  }
  /** 缓存元数据 */
  metadata: {
    /** 生成耗时（毫秒） */
    generationTime: number
    /** 文件数量 */
    fileCount: number
    /** 目录数量 */
    dirCount: number
  }
}
```

### TechStack（技术栈，复用现有）

```typescript
interface TechStack {
  /** 语言列表 */
  languages: string[]
  /** 框架列表 */
  frameworks: string[]
  /** 包管理器 */
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun'
  /** 测试框架 */
  testFramework?: string
  /** 构建工具 */
  buildTool?: string
}
```

### ContentCacheEntry（内容缓存条目）

会话级内容缓存条目。

```typescript
interface ContentCacheEntry {
  /** 文件路径 */
  path: string
  /** 内容 SHA-256 哈希（前 8 位） */
  hash: string
  /** 缓存时间戳 */
  cachedAt: number
  /** 内容长度（字节） */
  length: number
}
```

### CompressionResult（压缩结果）

消息压缩结果。

```typescript
interface CompressionResult {
  /** 压缩后的消息列表 */
  messages: Message[]
  /** 压缩前 Token 数 */
  beforeTokens: number
  /** 压缩后 Token 数 */
  afterTokens: number
  /** 是否发生了压缩 */
  compressed: boolean
  /** 移除的消息数量 */
  removedCount: number
  /** 压缩摘要（插入到消息历史中） */
  summary?: string
}
```

### TruncationResult（截断结果）

工具输出截断结果。

```typescript
interface TruncationResult {
  /** 截断后的输出 */
  output: string
  /** 是否被截断 */
  truncated: boolean
  /** 原始长度 */
  originalLength: number
  /** 截断后长度 */
  truncatedLength: number
  /** 截断指示器文本 */
  indicator?: string
}
```

### OptimizationConfig（优化配置）

完整的优化配置结构。

```typescript
interface OptimizationConfig {
  /** Token 压缩配置 */
  compression: {
    /** 是否启用 */
    enabled: boolean
    /** 触发阈值（Token 数） */
    threshold: number
    /** 目标 Token 数 */
    targetTokens: number
    /** 压缩策略 */
    strategy: 'sliding_window' | 'importance' | 'summary'
    /** 始终保留的最近消息数 */
    keepRecentCount: number
  }
  /** 输出截断配置 */
  truncation: {
    /** 是否启用 */
    enabled: boolean
    /** 最大输出长度（字符） */
    maxLength: number
    /** 头部保留长度 */
    headLength: number
    /** 尾部保留长度 */
    tailLength: number
  }
  /** 内容缓存配置 */
  contentCache: {
    /** 是否启用 */
    enabled: boolean
  }
  /** 上下文注入配置 */
  contextInjection: {
    /** 是否启用 */
    enabled: boolean
    /** 最大注入 Token 数 */
    maxTokens: number
  }
  /** 索引缓存配置 */
  indexCache: {
    /** 是否启用 */
    enabled: boolean
    /** 缓存有效期（毫秒） */
    ttl: number
  }
}
```

### 默认配置值

```typescript
const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  compression: {
    enabled: true,
    threshold: 80000,
    targetTokens: 50000,
    strategy: 'importance',
    keepRecentCount: 10
  },
  truncation: {
    enabled: true,
    maxLength: 10000,
    headLength: 4000,
    tailLength: 2000
  },
  contentCache: {
    enabled: true
  },
  contextInjection: {
    enabled: true,
    maxTokens: 2000
  },
  indexCache: {
    enabled: true,
    ttl: 24 * 60 * 60 * 1000  // 24 小时
  }
}
```


## 正确性属性

*属性是在系统所有有效执行中都应保持为真的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性是人类可读规范与机器可验证正确性保证之间的桥梁。*

### 属性 1: 索引缓存有效性和加载

*对于任何*具有缓存 Project_Index 的项目目录，如果缓存存在且项目哈希匹配，加载缓存应返回缓存的索引；如果缓存缺失或哈希不同，应生成新索引并持久化。

**验证: 需求 1.1, 1.2, 1.3**

### 属性 2: 项目索引结构完整性

*对于任何*生成的 Project_Index，它应包含所有必需字段：version、updatedAt、hash、root、structure.tree、structure.keyFiles、structure.techStack 和 metadata。

**验证: 需求 1.4**

### 属性 3: 强制刷新重新生成

*对于任何*有效的缓存 Project_Index，执行刷新命令应始终重新生成索引，无论缓存有效性如何，且新索引应具有不同的 updatedAt 时间戳。

**验证: 需求 1.6**

### 属性 4: 哈希计算包含关键文件

*对于任何*项目目录，如果关键项目文件（package.json、tsconfig.json、Cargo.toml 等）被修改，计算的项目哈希应与之前的哈希不同。

**验证: 需求 2.1**

### 属性 5: 哈希包含时间戳

*对于任何*项目目录，如果仅关键文件的修改时间戳改变（内容不变），计算的项目哈希应与之前的哈希不同。

**验证: 需求 2.2**

### 属性 6: 哈希排除忽略文件

*对于任何*项目目录，如果匹配 `.gitignore` 模式或常见排除模式（node_modules、dist 等）的文件被修改，计算的项目哈希应保持不变。

**验证: 需求 2.3**

### 属性 7: 项目索引序列化往返

*对于任何*有效的 Project_Index 对象，序列化为 JSON 然后反序列化应产生与原始对象等价的对象。

**验证: 需求 2.4**

### 属性 8: 上下文注入完整性

*对于任何*有效的 Project_Index，注入的上下文字符串应包含项目结构树、技术栈信息、关键文件列表，并包装在 `<project-context>` 标签内。

**验证: 需求 3.1, 3.2, 3.3, 3.4**

### 属性 9: 上下文注入在缓存过期时触发重新生成

*对于任何*过期或缺失的 Project_Index 缓存，在构建系统提示时，Context_Injector 应在注入前触发索引重新生成，产生有效的注入上下文。

**验证: 需求 3.5**

### 属性 10: Token 压缩阈值行为

*对于任何*总输入 Token 超过配置阈值的消息历史，Token_Compressor 应压缩消息，使结果 Token 数等于或低于目标值。

**验证: 需求 4.1**

### 属性 11: 压缩保留重要消息

*对于任何*正在压缩的消息历史，标记为重要的消息（包含错误、决策或工具结果）和最近 N 条消息应在压缩输出中保留。

**验证: 需求 4.3**

### 属性 12: 压缩添加摘要消息

*对于任何*移除消息的压缩操作，应在压缩后的消息历史中添加一条摘要消息，说明早期上下文已被摘要。

**验证: 需求 4.5**

### 属性 13: 输出截断阈值行为

*对于任何*超过配置字符限制的工具输出，Tool_Output_Truncator 应将输出截断到等于或低于限制的长度。

**验证: 需求 5.1**

### 属性 14: 截断保留头尾并带指示器

*对于任何*被截断的输出，结果应包含原始头部部分、原始尾部部分和显示原始长度及截断点的截断指示器。

**验证: 需求 5.2, 5.3**

### 属性 15: 智能截断在逻辑边界

*对于任何*正在截断的结构化输出（JSON 或代码），截断点应在逻辑边界（闭合括号、语句结尾等）而非 token 或结构中间。

**验证: 需求 5.5**

### 属性 16: 内容缓存行为

*对于任何*会话内的文件读取操作，如果文件之前已读取且内容哈希匹配，应返回哈希引用；如果哈希不同或文件之前未读取，应返回完整内容并缓存。

**验证: 需求 6.1, 6.2, 6.3, 6.5**

### 属性 17: 哈希引用格式

*对于任何* Content_Cache 返回的哈希引用，它应匹配格式 `[内容已缓存: {文件名} (哈希: {短哈希})]`，其中短哈希为 8 个字符。

**验证: 需求 6.4**

### 属性 18: 默认配置值

*对于任何*缺失或部分配置，系统应对所有未指定设置使用定义的默认值，且结果配置应有效且完整。

**验证: 需求 7.5**


## 错误处理

### 索引缓存错误

| 错误场景 | 处理策略 |
|---------|---------|
| 缓存文件损坏（JSON 解析失败） | 删除损坏缓存，重新生成索引 |
| 缓存目录不存在 | 自动创建目录 |
| 缓存写入失败（权限问题） | 记录警告日志，继续运行（无缓存模式） |
| 项目目录不存在 | 抛出 `AgentError(INVALID_REQUEST)` |

### 哈希计算错误

| 错误场景 | 处理策略 |
|---------|---------|
| 关键文件不可读 | 跳过该文件，使用可读文件计算哈希 |
| 所有关键文件都不可读 | 使用空哈希，每次都重新生成索引 |
| 文件系统错误 | 记录错误日志，返回空哈希 |

### Token 压缩错误

| 错误场景 | 处理策略 |
|---------|---------|
| 压缩后仍超出限制 | 强制截断到最近 N 条消息 |
| LLM 摘要生成失败 | 降级到简单摘要策略 |
| Token 计数器异常 | 使用字符估算作为后备 |

### 输出截断错误

| 错误场景 | 处理策略 |
|---------|---------|
| 智能截断失败（无法找到边界） | 降级到简单字符截断 |
| 输出为空 | 直接返回，不做处理 |

### 内容缓存错误

| 错误场景 | 处理策略 |
|---------|---------|
| 哈希计算失败 | 不缓存，返回完整内容 |
| 缓存查找失败 | 返回完整内容 |

### 错误恢复原则

1. **优雅降级**：优化功能失败不应影响核心 Agent 功能
2. **透明性**：所有降级操作都应记录日志
3. **无状态污染**：错误不应导致缓存状态不一致

## 测试策略

### 测试框架

- **单元测试**：vitest
- **属性测试**：fast-check（TypeScript 属性测试库）
- **覆盖率目标**：语句 80%，分支 75%，函数 85%，行 80%

### 单元测试范围

| 模块 | 测试重点 |
|------|---------|
| IndexCache | 缓存加载/保存、有效性检查、过期处理 |
| HashCalculator | 哈希计算、文件排除、时间戳处理 |
| ContextInjector | 上下文格式化、标签包装、Token 估算 |
| TokenCompressor | 阈值检测、压缩策略、消息保留 |
| OutputTruncator | 截断逻辑、边界检测、指示器生成 |
| ContentCache | 缓存命中/未命中、引用格式、会话隔离 |
| OptimizationConfig | 配置加载、默认值合并、验证 |

### 属性测试配置

```typescript
// vitest.config.ts 中配置
export default defineConfig({
  test: {
    // 属性测试最少运行 100 次
    fuzz: {
      numRuns: 100
    }
  }
})
```

### 属性测试标签格式

每个属性测试必须包含注释标签：

```typescript
// 功能: context-token-optimization, 属性 7: 项目索引序列化往返
// 验证: 需求 2.4
test.prop([projectIndexArbitrary])('序列化往返', (index) => {
  const serialized = JSON.stringify(index)
  const deserialized = JSON.parse(serialized)
  expect(deserialized).toEqual(index)
})
```

### 测试数据生成器

```typescript
// 项目索引生成器
const projectIndexArbitrary = fc.record({
  version: fc.constant('1.0.0'),
  updatedAt: fc.integer({ min: 0 }),
  hash: fc.hexaString({ minLength: 64, maxLength: 64 }),
  root: fc.string({ minLength: 1 }),
  structure: fc.record({
    tree: fc.string(),
    keyFiles: fc.array(fc.string()),
    techStack: techStackArbitrary
  }),
  metadata: fc.record({
    generationTime: fc.integer({ min: 0 }),
    fileCount: fc.integer({ min: 0 }),
    dirCount: fc.integer({ min: 0 })
  })
})

// 消息生成器
const messageArbitrary = fc.record({
  role: fc.constantFrom('user', 'assistant'),
  content: fc.array(contentBlockArbitrary)
})
```

### 集成测试

| 测试场景 | 验证点 |
|---------|-------|
| 冷启动 | 无缓存时正确生成索引并注入上下文 |
| 热启动 | 有效缓存时直接加载，无重新生成 |
| 缓存失效 | 项目变更后正确检测并重新生成 |
| 长对话 | Token 超阈值时正确压缩 |
| 大文件读取 | 输出正确截断 |
| 重复文件读取 | 第二次返回引用而非内容 |

### 测试文件结构

```
packages/agent/test/context/
├── index-cache.test.ts
├── hash-calculator.test.ts
├── context-injector.test.ts
├── token-compressor.test.ts
├── content-cache.test.ts
└── optimization-config.test.ts

packages/agent/test/tool/
└── output-truncator.test.ts
```
