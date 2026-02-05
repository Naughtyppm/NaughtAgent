# 需求文档

## 简介

本文档定义了 Token 优化和命令增强功能的需求规格。该功能旨在显著降低 Token 消耗、支持更长对话、降低 API 成本，同时提升命令系统的易用性和功能性。

功能分为两个阶段：
- **Phase A: Token 优化** - 工具输出截断、Token 压缩、项目索引缓存、上下文自动注入
- **Phase B: 命令增强** - 命令别名、历史持久化、命令管道、命令组合

## 术语表

- **Token_Manager**: Token 管理器，负责估算、计数和截断 Token
- **Tool_Output_Truncator**: 工具输出截断器，防止单次工具输出占用过多 Token
- **Token_Compressor**: Token 压缩器，压缩历史消息保留关键信息
- **Index_Cache**: 项目索引缓存，缓存项目文件结构避免重复扫描
- **Context_Injector**: 上下文注入器，智能选择相关上下文注入
- **Command_Router**: 命令路由器，解析用户输入并路由到对应处理器
- **Alias_Manager**: 别名管理器，管理命令别名的配置和解析
- **History_Manager**: 历史管理器，管理命令历史的持久化和搜索
- **Pipeline_Executor**: 管道执行器，解析和执行命令管道
- **Chain_Executor**: 链式执行器，解析和执行命令组合

## 需求

### 需求 1：工具输出截断

**用户故事：** 作为开发者，我希望工具输出在超过阈值时自动截断，以避免单次工具调用消耗过多 Token。

#### 验收标准

1. 当工具返回的输出超过配置的最大 Token 数时，Tool_Output_Truncator 应将输出截断到配置的限制内
2. 当截断文件读取结果时，Tool_Output_Truncator 应保留文件结构并指示发生了截断
3. 当截断 bash 命令输出时，Tool_Output_Truncator 应保留输出的开头和结尾，并在中间添加截断指示器
4. 当截断 grep 结果时，Tool_Output_Truncator 应保留匹配上下文行并指示找到的总匹配数
5. Tool_Output_Truncator 应支持可配置的截断策略：head、tail 和 middle
6. 当截断 JSON 内容时，Tool_Output_Truncator 应尝试保留有效的 JSON 结构
7. Tool_Output_Truncator 应记录截断事件，包含原始和截断后的 Token 数

### 需求 2：Token 压缩

**用户故事：** 作为开发者，我希望历史消息在保留关键信息的同时被压缩，以便进行更长的对话而不超出上下文限制。

#### 验收标准

1. 当总 Token 数超过压缩阈值时，Token_Compressor 应压缩较旧的消息
2. Token_Compressor 应完整保留最近的 N 条消息（可配置，默认 10 条）
3. 当压缩消息时，Token_Compressor 应使用规则提取关键信息（工具调用、文件路径、决策点）生成摘要，不调用 LLM
4. Token_Compressor 应保留所有工具调用结果的关键信息（工具名、输入参数摘要、输出摘要）
5. Token_Compressor 应在压缩后保持消息角色完整性（user/assistant/tool）
6. 如果压缩无法将 Token 降低到阈值以下，则 Token_Compressor 应回退到删除最旧的消息

### 需求 3：增强项目索引缓存

**用户故事：** 作为开发者，我希望项目索引缓存支持增量更新和统计监控，以提高缓存效率。

**注意：** 基础 IndexCache 已在 `src/context/index-cache.ts` 实现，本需求仅扩展缺失功能。

#### 验收标准

1. 当文件被创建、修改或删除时，Index_Cache 应支持增量更新而非完全重建
2. Index_Cache 应提供缓存命中/未命中统计用于监控
3. Index_Cache 应提供 `getStats()` 方法返回命中率、缓存大小、最后刷新时间
4. 当执行 /refresh 命令时，现有 `invalidate()` 方法应被调用


### 需求 4：扩展上下文注入器

**用户故事：** 作为开发者，我希望上下文注入器支持智能文件选择和会话摘要，以提供更相关的上下文。

**注意：** 基础 ContextInjector 已在 `src/context/context-injector.ts` 实现，本需求仅扩展缺失功能。

#### 验收标准

1. Context_Injector 应新增 `selectRelevantFiles()` 方法，根据查询关键词选择相关文件
2. Context_Injector 应新增 `parseFileReferences()` 方法，解析 @file 语法手动指定上下文
3. Context_Injector 应新增 `injectSessionSummary()` 方法，注入会话历史摘要
4. 当注入项目上下文时，Context_Injector 应优先选择最近访问的文件
5. Context_Injector 应排除匹配配置的忽略模式的文件

### 需求 5：命令别名

**用户故事：** 作为开发者，我希望定义自定义命令快捷方式，以便快速执行常用命令。

#### 验收标准

1. Alias_Manager 应在启动时从 ~/.naughtyagent/aliases.json 加载别名
2. 当路由命令时，Command_Router 应在查找命令之前解析别名
3. /alias 命令应允许使用语法添加新别名：/alias <名称> <命令>
4. /alias 命令应允许使用语法删除别名：/alias --remove <名称>
5. /alias 命令在不带参数调用时应列出所有配置的别名
6. 当别名与内置命令冲突时，Alias_Manager 应警告并拒绝该别名
7. Alias_Manager 应立即将别名更改持久化到配置文件

### 需求 6：历史持久化

**用户故事：** 作为开发者，我希望命令历史跨会话持久化，以便回忆和重用之前的命令。

**注意：** 现有 `/history` 命令在 `src/command/builtin/history.ts`，本需求扩展其持久化能力。

#### 验收标准

1. History_Manager 应将命令历史持久化到 ~/.naughtyagent/history 文件
2. 当执行命令时，History_Manager 应立即将其追加到历史
3. History_Manager 应将历史限制在可配置的最大条目数（默认 1000）
4. History_Manager 应去重连续相同的命令
5. 当搜索历史时，History_Manager 应支持模式匹配
6. History_Manager 应在启动时从文件加载历史
7. 现有 /history 命令应使用 History_Manager 而非内存历史

### 需求 7：命令管道

**用户故事：** 作为开发者，我希望将命令输出管道到另一个命令，以便组合复杂操作。

#### 验收标准

1. 当输入在引号外包含 | 字符时，Pipeline_Executor 应将其解析为管道
2. Pipeline_Executor 应将前一个命令的输出作为下一个命令的第一个参数传递
3. 如果管道中的任何命令失败，则 Pipeline_Executor 应停止执行并报告错误
4. Pipeline_Executor 应支持多个管道阶段（例如 cmd1 | cmd2 | cmd3）
5. Pipeline_Executor 应保留最终命令的输出格式

### 需求 8：命令链式执行

**用户故事：** 作为开发者，我希望按顺序执行多个命令，以便自动化多步骤操作。

#### 验收标准

1. 当输入在引号外包含 && 时，Chain_Executor 应条件执行命令（仅当前一个成功时执行下一个）
2. 当输入在引号外包含 ; 时，Chain_Executor 应无条件按顺序执行命令
3. Chain_Executor 应报告所有执行命令的组合结果
4. 如果 && 链中的命令失败，则 Chain_Executor 应停止并报告哪个命令失败
5. Chain_Executor 应支持混合 && 和 ; 操作符，并具有正确的优先级
6. Chain_Executor 应支持组合管道和链式执行（例如 cmd1 | cmd2 && cmd3）
