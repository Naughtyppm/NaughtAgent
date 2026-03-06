xq# Unit 1.1: Token 精确计数

| 属性 | 值 |
|------|-----|
| 优先级 | P0 |
| 预估工时 | 2 天 |
| 前置依赖 | 无 |
| 状态 | ✅ 已完成 |
| 完成日期 | 2026-02-27 |
| Spec | [.kiro/specs/token-precise-counting/](/.kiro/specs/token-precise-counting/) |
| 完成报告 | [docs/core/token-precise-counting-completion.md](/docs/core/token-precise-counting-completion.md) |

## 目标

将当前的字符估算（chars/4）替换为精确 tokenizer 计数。

## 实现内容

### 新增文件
- `packages/agent/src/token/types.ts` - 类型定义
- `packages/agent/src/token/errors.ts` - 错误类型
- `packages/agent/src/token/claude-tokenizer.ts` - Claude tokenizer
- `packages/agent/src/token/gpt-tokenizer.ts` - GPT tokenizer (tiktoken)
- `packages/agent/src/token/estimate-tokenizer.ts` - 估算 tokenizer（回退）
- `packages/agent/src/token/tokenizer-factory.ts` - 工厂
- `packages/agent/src/token/tokenizer-provider.ts` - Provider（缓存+模型映射）

### 改造文件
- `packages/agent/src/token/token.ts` - 集成精确 tokenizer
- `packages/agent/src/token/index.ts` - 导出更新

## 任务清单

- [x] 集成 tiktoken 和 @anthropic-ai/tokenizer
- [x] 实现 Tokenizer 接口，支持多模型
- [x] 实现 ClaudeTokenizer、GPTTokenizer、EstimateTokenizer
- [x] 实现 TokenizerFactory 和 TokenizerProvider
- [x] 改造 TokenManager 使用精确 tokenizer
- [x] 添加单元测试（104 tests）

## 完成标准

- [x] Token 计数误差 < 1%（使用原生 tokenizer）
- [x] 支持 Claude / GPT 两种 tokenizer
- [x] 保留估算模式作为回退
- [x] 现有测试全部通过

## 测试覆盖

| 测试文件 | 测试数 | 状态 |
|---------|--------|------|
| tokenizer.test.ts | 69 | ✅ |
| token.test.ts | 35 | ✅ |

## 关键修复

- GPT tokenizer 的 `decode` 方法：tiktoken 返回 `Uint8Array`，需要 `TextDecoder` 转换

## 影响范围

- 上下文管理 - 更精确的 token 预算
- 工具截断 - 更准确的截断点
- 预算控制 - 更可靠的限制
