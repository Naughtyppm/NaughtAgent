# Spec 审阅报告：Token 优化与命令增强

> 审阅日期：2026-02-05
> 审阅范围：`.kiro/specs/token-and-command-enhancement/`

## 🔴 严重问题（阻塞实施）

### 1. 与现有实现的重复/冲突

#### 1.1 项目索引缓存已存在
**位置**: `packages/agent/src/context/index-cache.ts`

**问题**: Spec 中的需求 3（项目索引缓存）与现有实现高度重叠：
- 现有 `IndexCache` 接口已实现：`getOrCreate()`, `isValid()`, `invalidate()`, `save()`, `load()`
- 现有 `ProjectIndex` 结构已包含：`hash`, `updatedAt`, `structure`, `metadata`
- 现有实现已支持 TTL 和哈希验证

**影响**: 任务 4（实现项目索引缓存）会创建重复代码

**建议**: 
- 删除任务 4，改为"增强现有 IndexCache"
- 仅添加缺失功能：增量更新、缓存统计

---

#### 1.2 上下文注入器已存在
**位置**: `packages/agent/src/context/context-injector.ts`

**问题**: Spec 中的需求 4（上下文自动注入）与现有实现重叠：
- 现有 `ContextInjector` 接口已实现：`buildProjectContext()`, `injectIntoSystemPrompt()`, `estimateTokens()`
- 现有配置已支持：`maxTokens`, `enabled`, `include` 选项

**缺失功能**:
- `selectRelevantFiles()` - 关键词匹配选择文件
- `parseFileReferences()` - @file 语法解析
- `injectSessionSummary()` - 会话摘要注入

**建议**: 
- 任务 5 改为"扩展现有 ContextInjector"
- 仅实现缺失的三个方法

---

#### 1.3 /history 命令已存在
**位置**: `packages/agent/src/command/builtin/history.ts`

**问题**: 现有 `/history` 命令已实现：
- 显示命令历史
- 支持 count 参数
- 支持 --all 参数

**但**: 现有实现是内存历史，不持久化

**建议**: 
- 任务 8.4 改为"增强现有 /history 命令"
- 添加持久化支持而非重写

---

#### 1.4 /refresh 命令已存在
**位置**: `packages/agent/src/command/builtin/refresh.ts`

**问题**: 任务 12.4 要求"添加 /refresh 命令"，但该命令已存在

**建议**: 
- 任务 12.4 改为"扩展 /refresh 命令以支持索引缓存失效"

---

### 2. 文件路径冲突

#### 2.1 Token 模块位置不一致
**Spec 设计**: 新文件放在 `src/token/` 目录
- `src/token/truncator.ts`
- `src/token/compressor.ts`
- `src/token/cache.ts`
- `src/token/injector.ts`

**现有代码**: 相关功能在 `src/context/` 目录
- `src/context/index-cache.ts`
- `src/context/context-injector.ts`

**问题**: 
- `cache.ts` 和 `injector.ts` 会与现有 `context/` 模块功能重叠
- 模块职责边界不清晰

**建议**:
- 截断器和压缩器放 `src/token/`（Token 相关）
- 缓存和注入器扩展现有 `src/context/` 模块

---

## 🟡 中等问题（需要澄清）

### 3. 需求逻辑问题

#### 3.1 Token 压缩的摘要生成
**需求 2.3**: "Token_Compressor 应生成保留关键决策和上下文的摘要"

**问题**: 
- 摘要生成需要 LLM 调用吗？还是纯规则？
- 如果需要 LLM，会增加 API 成本，与"降低成本"目标矛盾
- 设计文档中 `summarize()` 方法签名是同步的，暗示不调用 LLM

**建议**: 明确摘要生成策略：
- 选项 A：纯规则（提取关键词、保留工具调用）
- 选项 B：调用 LLM（需要权衡成本）

---

#### 3.2 需求 2.5 实现复杂度
**需求 2.5**: "当引用被压缩的消息时，Token_Compressor 应按需展开它"

**问题**:
- 如何检测"引用"？需要解析消息内容
- "展开"意味着需要存储原始消息，增加内存占用
- 设计文档中没有对应的接口方法

**建议**: 
- 简化为"保留被引用的工具调用结果"
- 或明确定义"引用"的检测规则

---

#### 3.3 管道 stdin 支持
**需求 7.5**: "当命令不支持 stdin 输入时，Pipeline_Executor 应报告错误"

**问题**:
- 现有命令系统没有 stdin 支持的概念
- 需要为每个命令定义是否支持 stdin
- 设计文档中 `UnifiedCommand` 接口没有 `supportsStdin` 字段

**建议**: 
- 添加 `supportsStdin?: boolean` 到 `UnifiedCommand` 接口
- 或简化为"所有命令都接受前一命令输出作为第一个参数"

---

### 4. 设计文档问题

#### 4.1 数据流图与实际不符
**设计文档数据流**:
```
用户输入 → 链式解析器 → 管道解析器 → 别名解析器 → 命令路由器 → ...
```

**问题**: 
- 现有 `CommandRouter` 直接处理输入
- 需要修改路由器以支持预处理链

**建议**: 明确集成点：
- 在 `createCommandRouter()` 之前添加预处理
- 或修改 `route()` 方法内部逻辑

---

#### 4.2 属性 25 优先级定义模糊
**属性 25**: "; 应具有比 && 更低的优先级"

**问题**: 
- "更低优先级"通常意味着"更晚绑定"
- 但 shell 中 `;` 和 `&&` 是同优先级，从左到右求值
- 需要明确是 shell 语义还是自定义语义

**建议**: 
- 采用 shell 标准语义：同优先级，从左到右
- 或明确自定义语义并添加示例

---

## 🟢 轻微问题（建议改进）

### 5. 任务组织问题

#### 5.1 测试任务分散
**问题**: 属性测试任务（1.5, 2.4, 4.4, 5.4, 7.5, 8.5, 10.4, 11.4）分散在各功能任务后

**建议**: 
- 保持当前结构（测试紧跟实现）
- 但确保每个测试任务明确依赖前置实现任务

---

#### 5.2 集成任务过于笼统
**任务 12**: 集成和连接（4 个子任务）

**问题**: 
- 12.1-12.4 每个都涉及多个模块的修改
- 可能需要更细粒度的拆分

**建议**: 
- 12.1 拆分为：修改工具执行器 + 添加配置
- 12.3 拆分为：别名集成 + 管道集成 + 链式集成 + 历史集成

---

### 6. 配置路径问题

#### 6.1 配置目录不一致
**Spec 使用**: `~/.naughtyagent/`
**现有代码**: 部分使用 `.naught/`

**建议**: 统一为 `~/.naughtyagent/`

---

## 📋 修复建议汇总

### 必须修复（阻塞实施）

| 问题 | 修复方案 |
|------|----------|
| IndexCache 重复 | 任务 4 改为"增强现有 IndexCache" |
| ContextInjector 重复 | 任务 5 改为"扩展现有 ContextInjector" |
| /history 重复 | 任务 8.4 改为"增强现有 /history" |
| /refresh 重复 | 任务 12.4 改为"扩展 /refresh" |
| 文件路径冲突 | 截断器/压缩器放 token/，缓存/注入器扩展 context/ |

### 建议修复（提高质量）

| 问题 | 修复方案 |
|------|----------|
| 摘要生成策略 | 明确为纯规则或 LLM 调用 |
| 需求 2.5 复杂度 | 简化为保留被引用的工具调用 |
| stdin 支持 | 添加 supportsStdin 字段或简化语义 |
| 属性 25 优先级 | 采用 shell 标准语义 |
| 集成任务粒度 | 拆分为更细的子任务 |

---

## 🔧 推荐的 Spec 修改

### requirements.md 修改

1. **需求 3** 改为"增强项目索引缓存"
   - 移除已实现的功能
   - 保留：增量更新、缓存统计

2. **需求 4** 改为"扩展上下文注入器"
   - 移除已实现的功能
   - 保留：关键词匹配、@file 语法、会话摘要

3. **需求 2.3** 明确摘要策略
4. **需求 2.5** 简化或移除
5. **需求 7.5** 简化 stdin 语义

### tasks.md 修改

1. **任务 4** 改为"增强现有 IndexCache"
   - 4.1 添加增量更新方法
   - 4.2 添加缓存统计
   - 4.3 编写属性测试

2. **任务 5** 改为"扩展现有 ContextInjector"
   - 5.1 添加 selectRelevantFiles()
   - 5.2 添加 parseFileReferences()
   - 5.3 添加 injectSessionSummary()
   - 5.4 编写属性测试

3. **任务 8.4** 改为"增强现有 /history 命令"
4. **任务 12.4** 改为"扩展 /refresh 命令"
5. **任务 12** 拆分为更细粒度的子任务

### design.md 修改

1. 更新架构图，标注现有组件
2. 添加 `supportsStdin` 到 `UnifiedCommand` 接口
3. 明确属性 25 的优先级语义
4. 添加与现有代码的集成说明

