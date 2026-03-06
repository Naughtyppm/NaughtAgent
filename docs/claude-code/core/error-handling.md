# 错误处理系统 - Phase 1 完成报告

## 概述
- 完成日期：2026-01-17
- 耗时：约 30 分钟（模块创建）
- 状态：⏳ 部分完成（模块已创建，应用和测试待完成）

## 这个系统/模块做了什么

错误处理模块提供统一的错误分类、处理和重试机制，包括：
- **AgentError 类**：统一的错误类，包含错误码、可恢复性、上下文
- **ErrorCode 枚举**：11 种错误类型分类
- **withRetry() 函数**：带指数退避的自动重试机制
- **恢复建议**：根据错误类型提供用户友好的建议

## 起到什么作用

在整体架构中的位置：
- **基础设施层**：为所有模块提供统一的错误处理标准
- **健壮性保障**：自动重试网络错误，提高系统可靠性
- **问题诊断**：结构化错误信息，便于日志记录和问题定位

## 一般怎么做（业界常见方案）

业界常见的错误处理方案：
1. **自定义错误类**：继承 Error，添加错误码和上下文
2. **重试库**：使用 `retry`、`p-retry` 等第三方库
3. **错误边界**：React 的 Error Boundary 模式
4. **Result 类型**：Rust 风格的 Result<T, E> 类型

## 我们怎么做的

### 实现方案

#### 1. AgentError 类
```typescript
class AgentError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public recoverable: boolean,
    public context?: Record<string, unknown>
  )
  
  getRecoverySuggestion(): string
  toJSON(): Record<string, unknown>
}
```

**特点**：
- 继承 Error，保持标准错误接口
- 添加 code、recoverable、context 字段
- 使用 `Object.setPrototypeOf()` 保持正确的原型链
- 提供 `getRecoverySuggestion()` 返回用户友好的建议
- 提供 `toJSON()` 便于序列化和日志记录

#### 2. ErrorCode 枚举
```typescript
enum ErrorCode {
  // 网络错误（可恢复）
  NETWORK_ERROR, TIMEOUT, RATE_LIMIT,
  
  // API 错误（部分可恢复）
  API_ERROR, INVALID_REQUEST, AUTHENTICATION_ERROR,
  
  // 工具错误（可恢复）
  TOOL_EXECUTION_ERROR, PERMISSION_DENIED,
  
  // 系统错误（不可恢复）
  INTERNAL_ERROR, CONFIGURATION_ERROR
}
```

**分类逻辑**：
- **可恢复错误**：网络错误、超时、限流 → 可以重试
- **部分可恢复**：API 错误、无效请求 → 根据具体情况
- **不可恢复**：配置错误、内部错误 → 立即失败

#### 3. withRetry() 函数
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = defaultRetryPolicy
): Promise<T>
```

**特点**：
- 指数退避算法：delay = initialDelay * (backoffMultiplier ^ attempt)
- 最大延迟限制：避免等待时间过长
- 智能重试：只重试可恢复的错误
- 可配置策略：支持自定义重试参数

**默认策略**：
- 最多重试 3 次
- 初始延迟 1 秒
- 最大延迟 10 秒
- 退避倍数 2
- 仅重试网络相关错误

### 为什么这样做

**设计决策理由**：

1. **自定义错误类而非第三方库**：
   - 完全掌控错误结构，便于扩展
   - 避免引入额外依赖
   - 与项目的类型系统深度集成

2. **可恢复性标记**：
   - 明确区分可恢复和不可恢复错误
   - 避免无意义的重试（如配置错误）
   - 提高系统响应速度

3. **上下文信息**：
   - 保留错误发生时的关键信息
   - 便于问题诊断和日志分析
   - 支持结构化日志记录

4. **指数退避**：
   - 避免过度重试导致系统负载
   - 给服务端恢复时间
   - 业界标准做法

5. **用户友好的建议**：
   - 帮助用户快速解决问题
   - 减少支持成本
   - 提升用户体验

## 关键文件

### 实现文件
- `packages/agent/src/error/types.ts` - 错误类型定义
- `packages/agent/src/error/retry.ts` - 重试机制
- `packages/agent/src/error/index.ts` - 模块导出

### 测试文件
⚠️ 测试尚未编写（任务 3.5）

### 应用文件
⏸️ 应用尚未完成（任务 3.4）

## 测试覆盖

### 当前状态
⚠️ 测试尚未编写

### 计划的测试用例
| 测试用例 | 描述 | 覆盖场景 |
|---------|------|---------|
| test_error_creation | 测试 AgentError 创建 | 正常流程 |
| test_error_codes | 测试所有错误码 | 完整性 |
| test_recovery_suggestions | 测试恢复建议 | 正常流程 |
| test_retry_success | 测试重试成功场景 | 正常流程 |
| test_retry_failure | 测试重试失败场景 | 异常处理 |
| test_retry_non_retryable | 测试不可重试错误 | 边界情况 |
| test_exponential_backoff | 测试指数退避算法 | 算法正确性 |
| test_custom_policy | 测试自定义重试策略 | 配置灵活性 |

### 目标覆盖率
- 语句覆盖率：≥ 80%
- 分支覆盖率：≥ 75%
- 函数覆盖率：≥ 85%
- 行覆盖率：≥ 80%

## 遇到的问题和解决方案

### 问题 1：TypeScript 继承 Error 的原型链问题
**问题**：在 TypeScript 中继承 `Error` 类时，`instanceof` 检查可能失败

**解决方案**：
```typescript
constructor(...) {
  super(message)
  this.name = 'AgentError'
  Object.setPrototypeOf(this, AgentError.prototype)
}
```

### 问题 2：类型安全的错误判断
**问题**：需要在运行时判断错误是否为 `AgentError` 实例

**解决方案**：
```typescript
function isRetryable(error: unknown, policy: RetryPolicy): boolean {
  if (error instanceof AgentError) {
    return policy.retryableErrors.includes(error.code)
  }
  return false
}
```

## 后续注意事项

### 1. 任务 3.4：应用到现有代码
需要在以下模块中应用错误处理：
- **Provider 层**：使用 `withRetry()` 处理 API 调用
- **Tool 执行**：使用 `AgentError` 分类工具错误
- **Agent 循环**：根据错误类型决定是否继续

### 2. 任务 3.5：编写测试
需要编写完整的单元测试：
- 测试所有错误码
- 测试重试逻辑
- 测试指数退避算法
- 测试恢复建议

### 3. 日志集成
错误模块应与日志模块集成：
- 使用 `toJSON()` 记录结构化错误日志
- 在重试时记录重试次数和延迟时间
- 记录错误上下文信息

### 4. 错误码扩展
随着功能增加，可能需要添加新的错误码：
- 保持错误码的语义清晰
- 保持分类合理
- 更新 `getRecoverySuggestion()` 方法

### 5. 监控集成
错误处理应与监控系统集成：
- 统计各类错误的发生频率
- 监控重试成功率
- 设置错误告警阈值

## 技术亮点

1. **类型安全**：完整的 TypeScript 类型定义
2. **可扩展**：易于添加新的错误码
3. **用户友好**：提供恢复建议
4. **智能重试**：指数退避，避免过度重试
5. **结构化**：支持 JSON 序列化

## 使用示例

### 创建和抛出错误
```typescript
import { AgentError, ErrorCode } from './error/index.js'

throw new AgentError(
  'Network request failed',
  ErrorCode.NETWORK_ERROR,
  true,
  { url: 'https://api.example.com', statusCode: 500 }
)
```

### 使用重试机制
```typescript
import { withRetry } from './error/index.js'

const result = await withRetry(async () => {
  return await fetchData()
})
```

### 自定义重试策略
```typescript
const result = await withRetry(
  async () => await fetchData(),
  {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: [ErrorCode.NETWORK_ERROR, ErrorCode.TIMEOUT]
  }
)
```

### 错误处理
```typescript
try {
  await someOperation()
} catch (error) {
  if (error instanceof AgentError) {
    console.error(`Error: ${error.message}`)
    console.error(`Code: ${error.code}`)
    console.error(`Recoverable: ${error.recoverable}`)
    console.error(`Suggestion: ${error.getRecoverySuggestion()}`)
    console.error(`Context:`, error.context)
  }
}
```

## 相关文档

- [日志系统](./logging.md)（待创建）
- [监控系统](./monitoring.md)（待创建）
- [Agent 循环](./agent-loop.md)（待创建）

## 总结

错误处理模块的基础结构已创建完成，提供了统一的错误分类和重试机制。实现质量高，设计合理，为系统的健壮性提供了坚实基础。

**待完成工作**：
- ⏸️ 任务 3.4：应用到现有代码
- ⏸️ 任务 3.5：编写测试

完成这些工作后，错误处理系统将全面投入使用。
