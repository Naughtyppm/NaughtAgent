# Behavior Spec: Error Handling

> 错误处理的行为规格

## Overview

统一的错误处理策略，确保错误信息清晰、可恢复、对用户友好。

## Error Categories

### 1. 用户错误 (UserError)

用户输入或操作导致的错误，可通过修正输入解决。

```typescript
class UserError extends Error {
  code: string
  suggestion?: string
}
```

| 场景 | code | 消息示例 |
|------|------|---------|
| 文件不存在 | FILE_NOT_FOUND | File not found: /path/to/file |
| 路径是目录 | PATH_IS_DIRECTORY | Path is a directory: /path |
| 无效参数 | INVALID_PARAMETER | Invalid parameter: offset must be >= 0 |
| 权限拒绝 | PERMISSION_DENIED | Permission denied: write to /etc/passwd |

### 2. 系统错误 (SystemError)

系统或环境问题，通常需要外部干预。

```typescript
class SystemError extends Error {
  code: string
  cause?: Error
}
```

| 场景 | code | 消息示例 |
|------|------|---------|
| 磁盘空间不足 | DISK_FULL | Disk full: cannot write file |
| 网络错误 | NETWORK_ERROR | Network error: connection refused |
| 进程错误 | PROCESS_ERROR | Process error: command not found |

### 3. 内部错误 (InternalError)

程序 bug 或意外情况，需要开发者修复。

```typescript
class InternalError extends Error {
  code: string
  context?: Record<string, unknown>
}
```

| 场景 | code | 消息示例 |
|------|------|---------|
| 断言失败 | ASSERTION_FAILED | Assertion failed: session must exist |
| 状态异常 | INVALID_STATE | Invalid state: agent already running |
| 未实现 | NOT_IMPLEMENTED | Not implemented: feature X |

## Error Handling Behaviors

### B1: Tool 执行错误

```gherkin
Given Tool 执行过程中抛出错误
When 错误被捕获
Then 包装为 ToolResult 返回
And output 包含错误消息
And metadata.error = true
And Agent 继续执行（不中断）
```

```typescript
// 错误结果格式
{
  title: "Error",
  output: "Error: File not found: /path/to/file",
  metadata: {
    error: true,
    code: "FILE_NOT_FOUND"
  }
}
```

### B2: Agent 执行错误

```gherkin
Given Agent 执行过程中发生错误
When 错误是可恢复的（Tool 错误）
Then 产生 error 事件
And Agent 继续执行

When 错误是不可恢复的（LLM 错误）
Then 产生 error 事件
And 产生 done 事件
And Agent 终止
```

### B3: Session 错误

```gherkin
Given Session 操作失败
When 是持久化错误
Then 抛出 SystemError
And 状态回滚

When 是状态转换错误
Then 抛出 InternalError
And 记录详细日志
```

### B4: 权限错误

```gherkin
Given 权限检查失败
When action = "deny"
Then 返回 UserError(PERMISSION_DENIED)
And 不执行操作

When 用户拒绝确认
Then 返回 UserError(USER_REJECTED)
And 不执行操作
```

## Error Messages

### 格式规范

```
[ErrorType] 简短描述

详细信息（如果有）

建议操作（如果有）
```

### 示例

```
[UserError] File not found: /workspace/src/missing.ts

The file does not exist at the specified path.

Suggestion: Check the file path or use glob to find the file.
```

### 多语言支持（未来）

```typescript
interface ErrorMessage {
  code: string
  template: string
  params: Record<string, string>
}

// 模板
"FILE_NOT_FOUND": "File not found: {path}"
```

## Error Recovery

### 自动重试

```gherkin
Given 错误是临时性的（网络超时）
When 重试次数 < 最大重试次数
Then 等待退避时间
And 重试操作

When 重试次数 >= 最大重试次数
Then 抛出最终错误
```

重试配置：
```typescript
{
  maxRetries: 3,
  backoff: "exponential",  // 1s, 2s, 4s
  retryableErrors: [
    "NETWORK_ERROR",
    "RATE_LIMITED",
    "TIMEOUT"
  ]
}
```

### 优雅降级

```gherkin
Given 功能 A 失败
When 存在备选方案 B
Then 尝试方案 B
And 记录降级日志
```

## Logging

### 错误日志格式

```json
{
  "level": "error",
  "timestamp": "2024-01-14T10:00:00Z",
  "sessionId": "session-123",
  "error": {
    "type": "UserError",
    "code": "FILE_NOT_FOUND",
    "message": "File not found: /path/to/file",
    "stack": "..."
  },
  "context": {
    "tool": "read",
    "params": { "filePath": "/path/to/file" }
  }
}
```

### 日志级别

| 级别 | 用途 |
|------|------|
| error | 错误，需要关注 |
| warn | 警告，可能有问题 |
| info | 重要信息 |
| debug | 调试信息 |

## User-Facing Errors

### 展示原则

1. **简洁**: 用户看到简短、清晰的消息
2. **可操作**: 提供解决建议
3. **不泄露**: 不暴露内部实现细节
4. **可追溯**: 提供错误 ID 便于排查

### 展示格式

```
❌ Cannot read file

The file "/path/to/file" was not found.

Try:
• Check if the file path is correct
• Use glob to search for the file

Error ID: err-abc123
```

## Error Boundaries

### Tool 层

```typescript
async function executeTool(tool, params, ctx) {
  try {
    return await tool.execute(params, ctx)
  } catch (error) {
    return {
      title: "Error",
      output: formatError(error),
      metadata: { error: true }
    }
  }
}
```

### Agent 层

```typescript
async function* runAgent(agent, input) {
  try {
    // ... agent logic
  } catch (error) {
    yield { type: "error", error }
    yield { type: "done", usage: currentUsage }
  }
}
```

### Session 层

```typescript
function addMessage(sessionId, message) {
  const session = sessions.get(sessionId)
  if (!session) {
    throw new InternalError("Session not found", {
      code: "SESSION_NOT_FOUND",
      context: { sessionId }
    })
  }
  // ...
}
```

## Testing Errors

### 测试用例要求

每个错误场景都应有对应的测试：

```typescript
describe("ReadTool", () => {
  it("should throw FILE_NOT_FOUND for missing file", async () => {
    await expect(
      ReadTool.execute({ filePath: "/nonexistent" }, ctx)
    ).rejects.toThrow("File not found")
  })
})
```
