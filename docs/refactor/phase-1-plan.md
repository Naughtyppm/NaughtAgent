# Phase 1 重构计划：基础设施层对齐

## 目标

将现有的基础设施层（消息协议、会话管理、错误处理）对齐到 Claude Agent SDK 规范。

## 当前状态分析

### ✅ 已经对齐的部分

1. **消息协议基础结构**
   - `MessageRole`: `"user" | "assistant"` ✅
   - `TextBlock`, `ToolUseBlock`, `ToolResultBlock` ✅
   - `ContentBlock` 联合类型 ✅
   - `Message` 接口包含 id, role, content, timestamp ✅

2. **会话管理基础**
   - `Session` 接口包含基本字段 ✅
   - `SessionManager` 已实现 ✅
   - 文件系统存储已实现 ✅

3. **工具系统基础**
   - `Tool` 命名空间模式 ✅
   - `ToolRegistry` 注册表 ✅
   - 内置工具：Read, Write, Edit, Bash, Glob, Grep ✅

### ⚠️ 需要补充的部分

1. **消息协议扩展**
   - [ ] 添加 `ImageBlock` 支持（多模态）
   - [ ] 添加 `AudioBlock` 支持（多模态）
   - [ ] 添加 `stop_reason` 字段到 AssistantMessage
   - [ ] 支持 `parent_tool_use_id` 关联

2. **会话管理增强**
   - [ ] 添加会话分支功能（`branch()`）
   - [ ] 添加会话标签系统（`tags`）
   - [ ] 添加成本追踪（`total_cost_usd`）
   - [ ] 添加轮次计数（`num_turns`）
   - [ ] 实现会话过滤和搜索

3. **错误处理统一**
   - [ ] 定义 `AgentError` 类型体系
   - [ ] 实现错误码枚举（`ErrorCode`）
   - [ ] 实现重试策略（`RetryPolicy`）
   - [ ] 实现 `withRetry()` 工具函数

4. **日志与监控**
   - [ ] 实现结构化日志系统（`Logger`）
   - [ ] 实现性能监控（`PerformanceMonitor`）
   - [ ] 添加 trace_id 支持

## 实施步骤

### Step 1: 消息协议扩展（1-2天）

**目标**：支持多模态内容和更丰富的元数据

**任务清单**：
- [ ] 在 `message.ts` 中添加 `ImageBlock` 和 `AudioBlock` 类型
- [ ] 扩展 `Message` 接口，添加可选的 `stop_reason` 字段
- [ ] 添加 `parent_tool_use_id` 支持
- [ ] 更新相关的工具函数（`getMessageText` 等）
- [ ] 编写单元测试

**关键文件**：
- `packages/agent/src/session/message.ts`

**测试要求**：
- 测试多模态内容块的创建和解析
- 测试 stop_reason 的各种情况
- 测试工具结果的关联

### Step 2: 会话管理增强（2-3天）

**目标**：添加会话分支、标签、成本追踪等高级功能

**任务清单**：
- [ ] 扩展 `Session` 接口，添加 `tags`, `total_cost_usd`, `num_turns`
- [ ] 在 `SessionManager` 中实现 `branch()` 方法
- [ ] 实现会话过滤和搜索功能
- [ ] 更新存储层以支持新字段
- [ ] 编写单元测试和集成测试

**关键文件**：
- `packages/agent/src/session/session.ts`
- `packages/agent/src/session/manager.ts`
- `packages/agent/src/session/storage.ts`

**测试要求**：
- 测试会话分支功能
- 测试标签过滤
- 测试成本追踪准确性
- 测试存储的向后兼容性

### Step 3: 错误处理统一（2天）

**目标**：建立统一的错误处理机制和重试策略

**任务清单**：
- [ ] 创建 `packages/agent/src/error/` 目录
- [ ] 定义 `AgentError` 类和 `ErrorCode` 枚举
- [ ] 实现 `RetryPolicy` 接口和 `withRetry()` 函数
- [ ] 在现有代码中应用新的错误处理
- [ ] 编写单元测试

**关键文件**：
- `packages/agent/src/error/types.ts` (新建)
- `packages/agent/src/error/retry.ts` (新建)
- `packages/agent/src/error/index.ts` (新建)

**测试要求**：
- 测试各种错误类型的分类
- 测试重试策略的指数退避
- 测试不可重试错误的处理
- 测试错误恢复建议

### Step 4: 日志与监控（2天）

**目标**：实现结构化日志和性能监控

**任务清单**：
- [ ] 创建 `packages/agent/src/logging/` 目录
- [ ] 实现 `Logger` 类（支持不同日志级别）
- [ ] 实现 `PerformanceMonitor` 类
- [ ] 添加 trace_id 生成和传递
- [ ] 在关键路径上添加日志和监控点
- [ ] 编写单元测试

**关键文件**：
- `packages/agent/src/logging/logger.ts` (新建)
- `packages/agent/src/logging/monitor.ts` (新建)
- `packages/agent/src/logging/index.ts` (新建)

**测试要求**：
- 测试日志级别过滤
- 测试性能指标收集
- 测试 trace_id 传递
- 测试日志输出格式

### Step 5: 集成和文档（1天）

**目标**：整合所有改动，更新文档和测试

**任务清单**：
- [ ] 运行完整测试套件，确保覆盖率达标
- [ ] 更新 API 文档
- [ ] 编写迁移指南（如有破坏性变更）
- [ ] 生成 Phase 1 完成报告

## 成功标准

1. **功能完整性**
   - ✅ 所有计划的功能都已实现
   - ✅ 与 Claude Agent SDK 规范对齐

2. **测试覆盖率**
   - ✅ 语句覆盖率 ≥ 80%
   - ✅ 分支覆盖率 ≥ 75%
   - ✅ 函数覆盖率 ≥ 85%
   - ✅ 行覆盖率 ≥ 80%

3. **向后兼容性**
   - ✅ 现有 API 保持兼容（或提供迁移路径）
   - ✅ 现有测试全部通过

4. **文档完整性**
   - ✅ API 文档更新
   - ✅ 迁移指南（如需要）
   - ✅ Phase 1 完成报告

## 风险和缓解

### 风险 1: 破坏现有功能
**缓解措施**：
- 保持现有 API 不变，添加新 API
- 每个步骤后运行完整测试套件
- 使用 Git 分支，随时可以回滚

### 风险 2: 测试覆盖率下降
**缓解措施**：
- 新代码必须有对应测试
- 使用 vitest 的覆盖率报告监控
- 设置 CI 检查覆盖率阈值

### 风险 3: 性能回归
**缓解措施**：
- 添加性能监控点
- 对比重构前后的性能指标
- 优化热路径代码

## 时间估算

- Step 1: 1-2 天
- Step 2: 2-3 天
- Step 3: 2 天
- Step 4: 2 天
- Step 5: 1 天

**总计**: 8-10 天

## 下一步

完成 Phase 1 后，进入 Phase 2: 工具层重构（MCP 集成）
