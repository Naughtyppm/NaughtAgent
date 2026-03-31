# 任务：为核心模块编写单元测试

## 背景

NaughtAgent v0.2.0 重构了多个核心模块，但还没有配套的单元测试。需要为关键模块补充 vitest 测试。

## 目标

为以下 3 个模块编写 vitest 测试（按优先级排列）：

### 1. safe-path.ts（最高优先）
- 文件：`packages/agent/src/tool/safe-path.ts`
- 测试 `safePath()` 的路径沙箱功能：
  - 正常路径（相对/绝对）→ 正确解析
  - 路径逃逸（`../../etc/passwd`）→ 抛出 Error
  - `allowEscape: true` → 允许逃逸
  - Windows 路径兼容性（`D:\foo\bar`）
- 测试 `resolvePath()` 的宽松解析：
  - 相对路径 → 拼接 cwd
  - 绝对路径 → 直接 resolve

### 2. compact.ts
- 文件：`packages/agent/src/agent/compact.ts`
- 测试 `microCompact()` ：
  - 正常消息 → 不变
  - 超长 tool_result → 被截断
  - 空 session → 不报错
- 测试 `estimateTokens()`：
  - 空 session → 返回 0
  - 有消息 → 返回合理估算值

### 3. message-converter.ts
- 文件：`packages/agent/src/agent/message-converter.ts`
- 测试消息格式转换的正确性

## 约束

- 使用 vitest（项目已配置）
- 测试文件放在 `packages/agent/src/__tests__/` 目录下
- 命名规则：`{模块名}.test.ts`
- **不要用子 agent（dispatch_agent）**，直接读代码、写测试
- 每个模块写完后运行 `npx vitest run {测试文件}` 验证通过
- 运行 `npx tsc --noEmit` 确认零 typecheck 错误

## 成功标准

- 至少 safe-path.ts 的测试全部通过
- 每个测试文件至少 5 个测试用例
- typecheck 零错误
