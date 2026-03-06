# Token 精确计数 完成报告

## 概述
- 完成日期：2026-02-27
- 状态：✅ 完成

## 实现内容

### 这个系统/模块做了什么
Token 精确计数模块为 NaughtyAgent 提供了精确的 token 计数能力，支持 Claude 和 GPT 模型的原生 tokenizer，并保留了估算模式作为回退方案。

### 起到什么作用
- 精确计算上下文窗口使用量
- 支持智能截断和压缩决策
- 为多模型路由提供准确的 token 预算管理

### 一般怎么做（业界常见方案）
- 使用字符数估算（4 字符/token）
- 调用 API 获取 token 数（延迟高）
- 使用本地 tokenizer 库

### 我们怎么做的
采用分层架构：
1. **Tokenizer 接口** - 统一的 tokenizer 抽象
2. **三种实现** - ClaudeTokenizer、GPTTokenizer、EstimateTokenizer
3. **工厂模式** - TokenizerFactory 负责创建和回退
4. **Provider 模式** - TokenizerProvider 负责缓存和模型映射

### 为什么这样做
- 本地 tokenizer 零延迟，适合频繁调用
- 分层设计便于扩展新模型
- 回退机制确保系统稳定性
- 缓存机制避免重复加载

## 关键文件
- `packages/agent/src/token/types.ts` - 类型定义
- `packages/agent/src/token/errors.ts` - 错误类型
- `packages/agent/src/token/claude-tokenizer.ts` - Claude tokenizer
- `packages/agent/src/token/gpt-tokenizer.ts` - GPT tokenizer
- `packages/agent/src/token/estimate-tokenizer.ts` - 估算 tokenizer
- `packages/agent/src/token/tokenizer-factory.ts` - 工厂
- `packages/agent/src/token/tokenizer-provider.ts` - Provider
- `packages/agent/src/token/token.ts` - 主入口（改造）
- `packages/agent/src/token/index.ts` - 导出


## 测试覆盖

### 测试用例列表

| 测试文件 | 测试数 | 状态 | 覆盖场景 |
|---------|--------|------|---------|
| tokenizer.test.ts | 69 | ✅ | Tokenizer 实现 |
| token.test.ts | 35 | ✅ | TokenManager 集成 |

### 详细测试场景

#### ClaudeTokenizer 测试
- 基本 token 计数
- 编码/解码往返
- 文本截断
- 空字符串处理
- 特殊字符处理

#### GPTTokenizer 测试
- 基本 token 计数
- 编码/解码往返（修复：tiktoken 返回 Uint8Array）
- 文本截断
- 不同模型编码支持

#### EstimateTokenizer 测试
- 英文估算（4 字符/token）
- 中文估算（1.5 字符/token）
- 混合文本估算

#### TokenizerProvider 测试
- 缓存机制
- 预加载功能
- 模型类型推断
- 回退策略

#### TokenManager 集成测试
- estimate 方法兼容性
- countMessages 方法
- countContext 方法
- truncateToTokens 方法

## 遇到的问题和解决方案

### 问题 1: GPT Tokenizer decode 返回乱码
- 原因：tiktoken 的 `decode()` 返回 `Uint8Array`，不是字符串
- 解决：使用 `new TextDecoder().decode(bytes)` 转换

### 问题 2: GPT Tokenizer truncateToTokens 失败
- 原因：同上，`decode()` 返回类型问题
- 解决：同上

## 架构决策

### 为什么使用分层架构
1. **Tokenizer 接口** - 统一抽象，便于扩展
2. **Factory 模式** - 处理库加载和回退
3. **Provider 模式** - 缓存和模型映射

### 为什么保留 EstimateTokenizer
1. 作为回退方案，确保系统稳定
2. 在库加载失败时仍能工作
3. 性能更好（无需加载外部库）

## 后续注意事项

1. tiktoken 库较大，首次加载可能较慢
2. 不同 GPT 模型使用不同编码，需正确映射
3. Claude tokenizer 目前只支持 Claude 3 系列
