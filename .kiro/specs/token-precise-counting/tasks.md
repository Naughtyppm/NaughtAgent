# 实现任务：Token 精确计数

## 任务总览

| 阶段 | 任务数 | 预估工时 |
|------|--------|----------|
| Phase 1: 基础设施 | 4 | 4h |
| Phase 2: Tokenizer 实现 | 5 | 6h |
| Phase 3: TokenManager 改造 | 4 | 4h |
| Phase 4: 测试与集成 | 3 | 2h |

---

## Phase 1: 基础设施 ✅

### Task 1.1: 安装依赖 ✅
- [x] 安装 `tiktoken` 包
- [x] 安装 `@anthropic-ai/tokenizer` 包
- [x] 更新 `packages/agent/package.json`
- [x] 验证依赖安装成功

**文件**: `packages/agent/package.json`
**验收**: REQ-2.1, REQ-2.2

### Task 1.2: 定义类型接口 ✅
- [x] 创建 `TokenizerType` 类型
- [x] 创建 `ModelType` 类型
- [x] 创建 `TokenizerConfig` 接口
- [x] 创建 `CacheStats` 接口
- [x] 创建 `FallbackStrategy` 类型

**文件**: `packages/agent/src/token/types.ts`
**验收**: REQ-2, REQ-5, REQ-6


### Task 1.3: 创建 Tokenizer 接口 ✅
- [x] 定义 `Tokenizer` 接口
  - `type: TokenizerType`
  - `countTokens(text: string): number`
  - `encode(text: string): number[]`
  - `decode(tokens: number[]): string`
  - `truncateToTokens(text: string, maxTokens: number): string`

**文件**: `packages/agent/src/token/types.ts`
**验收**: REQ-1, REQ-3, REQ-4

### Task 1.4: 创建错误类型 ✅
- [x] 创建 `TokenizerLoadError` 类
- [x] 创建 `InvalidTokenError` 类
- [x] 添加错误上下文信息

**文件**: `packages/agent/src/token/errors.ts`
**验收**: REQ-10

---

## Phase 2: Tokenizer 实现 ✅

### Task 2.1: 实现 ClaudeTokenizer ✅
- [x] 封装 `@anthropic-ai/tokenizer`
- [x] 实现 `countTokens` 方法
- [x] 实现 `encode` / `decode` 方法
- [x] 实现 `truncateToTokens` 方法
- [x] 处理加载失败情况

**文件**: `packages/agent/src/token/claude-tokenizer.ts`
**验收**: REQ-2.1, REQ-3

### Task 2.2: 实现 GPTTokenizer ✅
- [x] 封装 `tiktoken`
- [x] 实现 `countTokens` 方法
- [x] 实现 `encode` / `decode` 方法
- [x] 实现 `truncateToTokens` 方法
- [x] 支持不同 GPT 模型的编码

**文件**: `packages/agent/src/token/gpt-tokenizer.ts`
**验收**: REQ-2.2, REQ-3


### Task 2.3: 实现 EstimateTokenizer ✅
- [x] 保留现有字符估算逻辑
- [x] 实现 Tokenizer 接口
- [x] 英文: 4 字符/token
- [x] 中文: 1.5 字符/token

**文件**: `packages/agent/src/token/estimate-tokenizer.ts`
**验收**: REQ-2.3, REQ-6.5

### Task 2.4: 实现 TokenizerFactory ✅
- [x] 实现 `create(config)` 方法
- [x] 实现 `isAvailable(type)` 检查
- [x] 实现 `getSupportedTypes()` 方法
- [x] 处理库加载失败

**文件**: `packages/agent/src/token/tokenizer-factory.ts`
**验收**: REQ-2

### Task 2.5: 实现 TokenizerProvider ✅
- [x] 实现 `getTokenizer(modelType)` 方法
- [x] 实现缓存机制（Map）
- [x] 实现 `preload(modelTypes)` 方法
- [x] 实现 `clearCache()` 方法
- [x] 实现 `getCacheStats()` 方法
- [x] 实现模型类型推断逻辑

**文件**: `packages/agent/src/token/tokenizer-provider.ts`
**验收**: REQ-5, REQ-8

---

## Phase 3: TokenManager 改造 ✅

### Task 3.1: 改造 estimate 方法 ✅
- [x] 注入 TokenizerProvider
- [x] 调用精确 tokenizer
- [x] 保持方法签名不变
- [x] 添加 modelType 可选参数

**文件**: `packages/agent/src/token/token.ts`
**验收**: REQ-1, REQ-7.1


### Task 3.2: 改造 countMessages 方法 ✅
- [x] 使用精确 tokenizer 计算消息
- [x] 处理多内容块消息
- [x] 保持方法签名不变

**文件**: `packages/agent/src/token/token.ts`
**验收**: REQ-9.1, REQ-7.2

### Task 3.3: 改造 countContext 方法 ✅
- [x] 分别计算 system/messages/tools
- [x] 返回详细统计对象
- [x] 保持方法签名不变

**文件**: `packages/agent/src/token/token.ts`
**验收**: REQ-9.2, REQ-9.3, REQ-7.3

### Task 3.4: 添加 truncateToTokens 方法 ✅
- [x] 委托给 Tokenizer 实现
- [x] 处理回退情况

**文件**: `packages/agent/src/token/token.ts`
**验收**: REQ-4

---

## Phase 4: 测试与集成 ✅

### Task 4.1: 单元测试 ✅
- [x] 测试 ClaudeTokenizer
- [x] 测试 GPTTokenizer
- [x] 测试 EstimateTokenizer
- [x] 测试 TokenizerProvider 缓存
- [x] 测试回退策略
- [x] 测试边界情况（空字符串、特殊字符）

**文件**: `packages/agent/test/token/tokenizer.test.ts`
**验收**: REQ-1 ~ REQ-10
**测试结果**: 69 tests passed

### Task 4.2: 集成测试 ✅
- [x] 测试与 Compressor 集成（通过现有 token.test.ts 验证）
- [x] 测试与 Truncator 集成（通过现有 token.test.ts 验证）
- [x] 验证现有功能不受影响（35 tests passed）

**文件**: `packages/agent/test/token/token.test.ts`
**验收**: REQ-7

### Task 4.3: 更新导出 ✅
- [x] 更新 `packages/agent/src/token/index.ts`
- [x] 导出新类型和接口
- [x] 保持向后兼容

**文件**: `packages/agent/src/token/index.ts`
**验收**: REQ-7

---

## 需求追溯矩阵

| 需求 | 任务 |
|------|------|
| REQ-1 Token计数 | 1.3, 3.1, 4.1 |
| REQ-2 Tokenizer类型 | 1.2, 2.1, 2.2, 2.3, 2.4 |
| REQ-3 编码解码 | 1.3, 2.1, 2.2 |
| REQ-4 文本截断 | 1.3, 3.4 |
| REQ-5 缓存机制 | 1.2, 2.5 |
| REQ-6 回退策略 | 1.2, 1.4, 2.3 |
| REQ-7 接口兼容 | 3.1, 3.2, 3.3, 4.2, 4.3 |
| REQ-8 预加载 | 2.5 |
| REQ-9 消息计数 | 3.2, 3.3 |
| REQ-10 错误处理 | 1.4, 4.1 |
