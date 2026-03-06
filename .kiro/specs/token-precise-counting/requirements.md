# 需求文档：Token 精确计数

## 简介

本文档定义了 Token 精确计数功能的需求规格。该功能旨在替换 NaughtyAgent 现有的字符估算方法，通过集成专业的 tokenizer 库实现精确的 token 计数，支持 Claude 和 GPT 两种模型系列，同时保持与现有 TokenManager 接口的完全兼容。

## 术语表

- **TokenManager**: Token 管理器，负责 token 计数和上下文管理的核心组件
- **Tokenizer**: 分词器，将文本转换为 token 序列的组件
- **TokenizerProvider**: 分词器提供者，管理 tokenizer 实例的生命周期
- **TokenizerFactory**: 分词器工厂，负责创建不同类型的 tokenizer 实例
- **Token**: 语言模型处理的最小文本单元
- **Token_ID**: Token 的数字标识符
- **Encoding**: 编码方案，定义文本到 token 的映射规则
- **Round_Trip**: 往返测试，encode 后 decode 应产生等效文本
- **FallbackStrategy**: 回退策略，tokenizer 加载失败时的处理方式
- **CacheStats**: 缓存统计，记录缓存命中和未命中次数

## 需求

### 需求 1：Token 计数

**用户故事：** 作为开发者，我希望能够精确计算文本的 token 数量，以便准确管理上下文窗口大小。

#### 验收标准

1. WHEN 调用 countTokens 方法并传入有效文本 THEN TokenManager SHALL 返回该文本的精确 token 数量
2. WHEN 传入空字符串 THEN TokenManager SHALL 返回 0
3. WHEN 传入包含中英文混合的文本 THEN TokenManager SHALL 正确计算所有字符的 token 数量
4. WHEN 传入包含特殊字符（emoji、标点、换行符）的文本 THEN TokenManager SHALL 正确处理并返回准确的 token 数量
5. IF tokenizer 加载失败 THEN TokenManager SHALL 根据配置的回退策略处理

### 需求 2：Tokenizer 类型支持

**用户故事：** 作为开发者，我希望系统支持多种模型的 tokenizer，以便在不同模型间切换时获得准确的 token 计数。

#### 验收标准

1. THE TokenizerFactory SHALL 支持创建 Claude 类型的 tokenizer（使用 @anthropic-ai/tokenizer）
2. THE TokenizerFactory SHALL 支持创建 GPT 类型的 tokenizer（使用 tiktoken）
3. THE TokenizerFactory SHALL 支持创建 Estimate 类型的 tokenizer（使用字符估算）
4. WHEN 传入以 "claude" 开头的模型名称 THEN TokenizerProvider SHALL 返回 Claude tokenizer
5. WHEN 传入以 "gpt" 开头的模型名称 THEN TokenizerProvider SHALL 返回 GPT tokenizer
6. WHEN 传入未知的模型名称 THEN TokenizerProvider SHALL 回退到 Estimate tokenizer

### 需求 3：编码与解码

**用户故事：** 作为开发者，我希望能够将文本编码为 token 序列并解码回文本，以便进行精确的文本截断操作。

#### 验收标准

1. WHEN 调用 encode 方法并传入有效文本 THEN Tokenizer SHALL 返回对应的 token ID 数组
2. WHEN 调用 decode 方法并传入有效的 token ID 数组 THEN Tokenizer SHALL 返回解码后的文本
3. WHEN 对文本执行 encode 后再 decode THEN Tokenizer SHALL 产生与原文本等效的结果
4. WHEN 传入空字符串进行 encode THEN Tokenizer SHALL 返回空数组
5. WHEN 传入空数组进行 decode THEN Tokenizer SHALL 返回空字符串
6. IF decode 接收到无效的 token ID THEN Tokenizer SHALL 抛出 InvalidTokenError


### 需求 4：文本截断

**用户故事：** 作为开发者，我希望能够按 token 数量截断文本，以便在上下文窗口限制内保留尽可能多的内容。

#### 验收标准

1. WHEN 调用 truncateToTokens 方法并传入文本和最大 token 数 THEN Tokenizer SHALL 返回不超过指定 token 数的文本
2. WHEN 原文本的 token 数不超过最大限制 THEN Tokenizer SHALL 返回原文本不变
3. WHEN 需要截断时 THEN Tokenizer SHALL 在 token 边界处截断，不产生乱码
4. THE truncateToTokens 方法 SHALL 保证返回文本的 token 数小于等于 maxTokens 参数

### 需求 5：缓存机制

**用户故事：** 作为开发者，我希望 tokenizer 实例被缓存复用，以便提高性能并减少内存占用。

#### 验收标准

1. WHEN 多次请求相同类型的 tokenizer THEN TokenizerProvider SHALL 返回缓存的实例而非创建新实例
2. WHEN 首次请求某类型的 tokenizer THEN TokenizerProvider SHALL 创建新实例并缓存
3. THE TokenizerProvider SHALL 提供 getCacheStats 方法返回缓存命中和未命中统计
4. WHEN 调用 clearCache 方法 THEN TokenizerProvider SHALL 清除所有缓存的 tokenizer 实例
5. THE TokenizerProvider SHALL 支持懒加载，仅在首次使用时加载 tokenizer

### 需求 6：回退策略

**用户故事：** 作为开发者，我希望在 tokenizer 加载失败时有合理的回退机制，以便系统能够继续运行。

#### 验收标准

1. WHEN tokenizer 库加载失败且回退策略为 'estimate' THEN TokenizerProvider SHALL 回退到字符估算方法
2. WHEN tokenizer 库加载失败且回退策略为 'error' THEN TokenizerProvider SHALL 抛出 TokenizerLoadError
3. WHEN tokenizer 库加载失败且回退策略为 'none' THEN TokenizerProvider SHALL 返回 null
4. THE TokenizerProvider SHALL 在回退时记录警告日志
5. WHEN 使用估算回退时 THEN TokenManager SHALL 使用英文 4 字符/token、中文 1.5 字符/token 的比例

### 需求 7：接口兼容性

**用户故事：** 作为开发者，我希望新的 token 计数功能与现有 TokenManager 接口完全兼容，以便无需修改现有代码。

#### 验收标准

1. THE TokenManager SHALL 保持现有的 estimate 方法签名不变
2. THE TokenManager SHALL 保持现有的 countMessages 方法签名不变
3. THE TokenManager SHALL 保持现有的 countContext 方法签名不变
4. WHEN 使用现有 API 调用 TokenManager THEN TokenManager SHALL 返回与之前兼容的结果类型
5. THE TokenManager SHALL 支持通过配置选择使用精确计数或估算方法

### 需求 8：预加载支持

**用户故事：** 作为开发者，我希望能够在应用启动时预加载 tokenizer，以便减少首次使用时的延迟。

#### 验收标准

1. THE TokenizerProvider SHALL 提供 preload 方法接受模型类型数组
2. WHEN 调用 preload 方法 THEN TokenizerProvider SHALL 异步加载指定类型的 tokenizer
3. WHEN preload 完成后请求已预加载的 tokenizer THEN TokenizerProvider SHALL 立即返回缓存实例
4. IF preload 过程中某个 tokenizer 加载失败 THEN TokenizerProvider SHALL 记录错误但不影响其他 tokenizer 的加载

### 需求 9：消息和上下文计数

**用户故事：** 作为开发者，我希望能够计算完整消息列表和上下文的 token 数量，以便准确管理对话历史。

#### 验收标准

1. WHEN 调用 countMessages 方法并传入消息数组 THEN TokenManager SHALL 返回所有消息的总 token 数
2. WHEN 调用 countContext 方法并传入完整上下文 THEN TokenManager SHALL 返回包含 system、messages、tools 各部分 token 数的详细统计
3. THE countContext 方法 SHALL 返回 total、system、messages 字段
4. WHEN 消息包含多个内容块 THEN TokenManager SHALL 正确累加所有内容块的 token 数

### 需求 10：错误处理

**用户故事：** 作为开发者，我希望系统能够优雅地处理各种错误情况，以便提供清晰的错误信息和恢复路径。

#### 验收标准

1. IF 输入文本超过处理限制 THEN TokenManager SHALL 抛出包含限制信息的错误
2. IF decode 接收到无效的 token ID THEN Tokenizer SHALL 抛出 InvalidTokenError 并包含无效的 token ID
3. IF tokenizer 库版本不兼容 THEN TokenizerFactory SHALL 抛出包含版本信息的错误
4. THE 所有错误 SHALL 包含足够的上下文信息以便调试
