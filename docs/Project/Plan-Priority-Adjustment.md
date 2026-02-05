# 优先级调整计划

> 日期：2026-02-05
> 背景：MCP Skill 实现后延，优先提升性能和扩展旧功能

## 调整后的优先级

| 优先级 | 功能 | 原状态 | 调整后 |
|--------|------|--------|--------|
| P0 | Token 优化 | 规格已定义 | **立即实现** |
| P1 | 命令增强 | 待规划 | **紧随其后** |
| P2 | MCP Skill | Phase 2 进行中 | **后延** |

---

## Phase A: Token 优化（预计 3-5 天）

### 目标
显著降低 Token 消耗，支持更长对话，降低 API 成本。

### 现有基础
- `src/token/token.ts` - 基础 Token 估算和截断
- 已有：`estimateTokens()`, `truncateMessages()`, `TokenManager`

### 待实现功能

#### A1. 项目索引缓存 (Index_Cache)
**目的**：避免重复读取项目结构

```typescript
interface ProjectIndex {
  files: FileEntry[]        // 文件列表
  structure: string         // 目录树字符串
  lastUpdated: number       // 更新时间戳
  hash: string              // 内容哈希
}
```

**实现要点**：
- 首次扫描后缓存到内存
- 文件变更时增量更新
- 提供 `/refresh` 命令强制刷新

#### A2. 上下文自动注入 (Context_Injector)
**目的**：智能选择相关上下文

```typescript
interface ContextInjector {
  // 根据用户输入选择相关文件
  selectRelevantFiles(query: string): string[]
  // 注入项目上下文
  injectProjectContext(): string
  // 注入会话摘要
  injectSessionSummary(): string
}
```

**实现要点**：
- 关键词匹配选择相关文件
- 限制注入的总 Token 数
- 支持手动指定上下文

#### A3. Token 压缩 (Token_Compressor)
**目的**：压缩历史消息，保留关键信息

```typescript
interface CompressionStrategy {
  // 摘要压缩：将多条消息压缩为摘要
  summarize(messages: Message[]): Message
  // 选择性保留：保留重要消息
  selectImportant(messages: Message[]): Message[]
  // 工具结果压缩：截断长输出
  compressToolResults(message: Message): Message
}
```

**实现要点**：
- 保留最近 N 条完整消息
- 旧消息转为摘要
- 工具输出超过阈值时截断

#### A4. 工具输出截断 (Tool_Output_Truncator)
**目的**：防止单次工具输出占用过多 Token

```typescript
interface TruncationConfig {
  maxOutputTokens: number   // 单次输出上限（默认 4000）
  truncateStrategy: 'head' | 'tail' | 'middle'
  preserveStructure: boolean // 保留 JSON/代码结构
}
```

**实现要点**：
- 文件读取结果截断
- bash 输出截断
- grep 结果截断（保留匹配行上下文）

---

## Phase B: 命令增强（预计 3-4 天）

### 目标
提升命令系统的易用性和功能性。

### 现有基础
- `src/command/` - 完整的三层命令架构
- 已有：路由、调度、补全、诊断

### 待实现功能

#### B1. 命令别名 (Aliases)
**目的**：支持自定义命令快捷方式

```typescript
interface AliasConfig {
  aliases: Record<string, string>  // 别名 -> 原命令
}

// 示例
{
  "h": "/help",
  "c": "/clear",
  "q": "/exit",
  "r": "/refresh"
}
```

**实现要点**：
- 配置文件：`~/.naughtyagent/aliases.json`
- 路由时先解析别名
- `/alias` 命令管理别名

#### B2. 命令管道 (Pipes)
**目的**：支持命令输出作为下一命令输入

```typescript
// 语法：command1 | command2
// 示例：/grep "TODO" | /count

interface PipelineExecutor {
  parse(input: string): PipelineStage[]
  execute(stages: PipelineStage[]): ExecutionResult
}
```

**实现要点**：
- 解析 `|` 分隔符
- 前一命令的 output 作为后一命令的 stdin
- 错误时中断管道

#### B3. 历史持久化 (History Persistence)
**目的**：跨会话保留命令历史

```typescript
interface HistoryManager {
  // 添加历史记录
  add(command: string): void
  // 搜索历史
  search(pattern: string): string[]
  // 获取最近 N 条
  recent(count: number): string[]
  // 持久化到文件
  save(): void
  // 从文件加载
  load(): void
}
```

**实现要点**：
- 存储位置：`~/.naughtyagent/history`
- 最大保留条数：1000
- 支持 Ctrl+R 搜索历史
- 去重连续相同命令

#### B4. 命令组合 (Command Chaining)
**目的**：支持顺序执行多个命令

```typescript
// 语法：command1 && command2（前一个成功才执行后一个）
// 语法：command1 ; command2（无条件顺序执行）
```

**实现要点**：
- 解析 `&&` 和 `;` 分隔符
- `&&` 检查前一命令的 success 状态
- `;` 无条件继续

---

## 实现顺序

### Week 1: Token 优化核心
1. Day 1-2: 工具输出截断（A4）- 最直接的优化
2. Day 2-3: Token 压缩（A3）- 历史消息压缩
3. Day 3-4: 项目索引缓存（A1）- 减少重复扫描

### Week 2: 命令增强 + 收尾
1. Day 1: 命令别名（B1）- 简单实用
2. Day 2: 历史持久化（B3）- 用户体验
3. Day 3: 命令管道（B2）- 高级功能
4. Day 4: 上下文自动注入（A2）- 智能优化

---

## 验收标准

### Token 优化
- [ ] 长对话（>50 轮）不超出上下文限制
- [ ] 工具输出自动截断，保留关键信息
- [ ] 项目索引缓存命中率 > 90%
- [ ] Token 消耗降低 30%+

### 命令增强
- [ ] 别名配置可持久化
- [ ] 命令历史跨会话保留
- [ ] 管道语法正确解析执行
- [ ] 所有新功能有测试覆盖

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Token 估算不准确 | 截断过多/过少 | 增加安全缓冲，可配置阈值 |
| 压缩丢失关键信息 | 上下文断裂 | 保留工具调用完整性 |
| 管道语法冲突 | 误解析 | 明确转义规则 |

