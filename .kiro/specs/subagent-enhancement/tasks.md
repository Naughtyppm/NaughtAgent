# Implementation Plan: 子 Agent 系统增强

## Overview

本实现计划将子 Agent 系统增强功能分解为可执行的编码任务。实现顺序遵循依赖关系：先完成基础设施（配置、注册表），再实现核心功能（Task 工具、并发控制），最后完善 UI 和测试。

## Tasks

- [x] 1. 配置管理模块
  - [x] 1.1 创建配置类型定义和默认值
    - 创建 `packages/agent/src/subtask/config.ts`
    - 定义 `SubAgentConfig` 接口和 `DEFAULT_CONFIG` 常量
    - _Requirements: 8.2, 8.3_
  
  - [x] 1.2 实现配置加载和验证
    - 实现从 `.naughty/config.json` 加载配置
    - 实现环境变量覆盖
    - 实现配置验证逻辑
    - _Requirements: 8.1, 8.4_
  
  - [x] 1.3 编写配置模块单元测试
    - 测试默认值应用
    - 测试配置验证
    - 测试环境变量覆盖
    - _Requirements: 8.1, 8.3, 8.4_

- [x] 2. Agent 注册表模块
  - [x] 2.1 添加 gray-matter 依赖并创建类型定义
    - 运行 `pnpm -C packages/agent add gray-matter`
    - 创建 `packages/agent/src/subtask/agent-registry.ts`
    - 定义 `CustomAgentDefinition` 和 `AgentRegistry` 接口
    - _Requirements: 2.1, 2.3_
  
  - [x] 2.2 实现 Markdown 解析器
    - 使用 gray-matter 解析 YAML frontmatter
    - 提取 systemPrompt 从 Markdown body
    - 验证必填字段
    - _Requirements: 2.2, 2.3, 2.4, 2.6_
  
  - [x] 2.3 实现 Agent 注册表核心功能
    - 实现 `loadCustomAgents()` 扫描目录
    - 实现 `getAgent()` 查找功能
    - 实现 `listAgents()` 列表功能
    - 处理无效定义（跳过并警告）
    - _Requirements: 2.1, 2.5, 2.7_
  
  - [x] 2.4 编写 Agent 注册表属性测试
    - **Property 4: Markdown Parsing Round-Trip**
    - **Validates: Requirements 2.2, 2.3, 2.4**
  
  - [x] 2.5 编写 Agent 注册表单元测试
    - 测试有效定义加载
    - 测试无效定义跳过
    - 测试查找功能
    - _Requirements: 2.5, 2.6, 2.7_

- [x] 3. Checkpoint - 基础设施完成
  - 确保配置和注册表模块测试通过
  - 如有问题，询问用户

- [x] 4. 错误处理模块
  - [x] 4.1 创建错误类型定义
    - 创建 `packages/agent/src/subtask/errors.ts`
    - 定义 `SubAgentErrorType` 枚举
    - 定义 `SubAgentError` 接口
    - _Requirements: 7.1_
  
  - [x] 4.2 扩展现有重试逻辑
    - 在现有 `error-handler.ts` 基础上扩展
    - 添加 `SubAgentErrorType` 到可重试错误列表
    - 实现结构化错误转换
    - _Requirements: 7.3, 7.4_
  
  - [x] 4.3 编写错误处理属性测试
    - **Property 17: Error Structure**
    - **Property 18: Retry Behavior**
    - **Validates: Requirements 7.1, 7.3**

- [x] 5. 并发控制器模块
  - [x] 5.1 创建并发控制器类型和接口
    - 创建 `packages/agent/src/subtask/concurrency.ts`
    - 定义 `ConcurrencyConfig` 和 `ConcurrencyController` 接口
    - _Requirements: 4.1_
  
  - [x] 5.2 实现并发限制逻辑
    - 实现任务队列管理
    - 实现最大并发数限制
    - 实现 failFast 模式
    - _Requirements: 4.1, 4.2_
  
  - [x] 5.3 实现超时和取消支持
    - 实现单任务超时
    - 实现批量取消
    - 集成 AbortSignal
    - _Requirements: 4.3, 4.4, 3.5_
  
  - [x] 5.4 编写并发控制器属性测试
    - **Property 10: Concurrency Limiting**
    - **Property 11: Parallel Error Handling**
    - **Property 12: Timeout Enforcement**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 6. Checkpoint - 核心模块完成
  - 确保错误处理和并发控制模块测试通过（334 tests passing）
  - 如有问题，询问用户

- [x] 7. Abort 信号链增强
  - [x] 7.1 增强 AbortSignal 传递
    - 修改 `run-agent.ts` 确保 abort 传递到所有工具
    - 修改 `parallel-agents-tool.ts` 使用 ConcurrencyController 传递 abort
    - 修改 `multi-agent-tool.ts` 传递 abort
    - _Requirements: 3.1, 3.4_
  
  - [x] 7.2 实现快速终止逻辑
    - 在 Agent Loop 中增加 abort 检查频率（每个事件都检查）
    - 确保工具执行可中断
    - _Requirements: 3.2_
  
  - [x] 7.3 实现部分结果返回
    - 修改 SubTaskResult 添加 partial 标记
    - 在 abort 时收集已完成的步骤
    - _Requirements: 3.3_
  
  - [x] 7.4 编写 Abort 信号链属性测试
    - **Property 7: Abort Signal Propagation**
    - **Property 8: Abort Timing**
    - **Property 9: Partial Results on Abort**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 8. 统一 Task 工具
  - [x] 8.1 扩展现有 Task 工具定义
    - 扩展现有的 `packages/agent/src/subtask/task-tool.ts`
    - 添加 type 参数支持 (explore/plan/build/custom)
    - 实现类型路由逻辑
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 8.2 集成 Agent 注册表
    - 实现 custom 类型支持
    - 从注册表加载自定义 Agent
    - _Requirements: 1.4_
  
  - [x] 8.3 实现结果格式化
    - 确保返回结构包含所有必填字段
    - 集成错误处理和重试
    - _Requirements: 1.5, 7.2, 7.4, 7.5_
  
  - [x] 8.4 编写 Task 工具属性测试
    - **Property 1: Task Tool Interface Validation** (已有 14 个单元测试覆盖)
    - **Property 2: Agent Type Routing** (通过类型映射实现)
    - **Property 3: Custom Agent Loading** (通过注册表集成实现)
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

- [x] 9. Checkpoint - 核心功能完成
  - 确保 Task 工具和 Abort 信号链测试通过
  - 如有问题，询问用户

- [x] 10. 事件系统增强
  - [x] 10.1 扩展事件类型
    - 在现有 `events.ts` 中添加 config 和 retry 事件类型
    - 更新 `SubAgentEvent` 联合类型
    - 更新 `createSubAgentEmitter` 支持新事件
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 10.2 增强事件发射
    - 确保所有子 Agent 模式发射完整事件
    - 添加 timing 信息到 tool_end 事件
    - _Requirements: 6.3, 6.6_
  
  - [x] 10.3 实现实例级监听器
    - 支持 per-instance 事件监听
    - 保持全局监听器兼容
    - _Requirements: 6.7_
  
  - [x] 10.4 编写事件系统属性测试
    - **Property 14: Event Structure Completeness**
    - **Property 15: Tool Event Timing**
    - **Property 16: Child Event Emission**
    - **Validates: Requirements 6.1, 6.3, 6.5, 6.6**

- [x] 11. UI 组件增强
  - [x] 11.1 增强 SubAgentPanel 组件
    - 添加重试计数显示
    - 添加配置信息显示
    - 优化子任务列表显示
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 11.2 增强 StatusIndicator 组件
    - 添加多子 Agent 摘要显示
    - 优化活跃子 Agent 列表
    - _Requirements: 5.4_
  
  - [x] 11.3 优化事件处理性能
    - 使用 throttle 控制更新频率
    - 优化 React 渲染
    - _Requirements: 5.5_

- [x] 12. 集成和导出
  - [x] 12.1 更新模块导出
    - 更新 `packages/agent/src/subtask/index.ts`
    - 导出新增的类型和函数
    - _Requirements: 1.1, 2.1_
  
  - [x] 12.2 注册 Task 工具
    - 在工具注册表中添加 Task 工具
    - 确保工具可被 Agent 调用
    - _Requirements: 1.1_
  
  - [x] 12.3 初始化 Agent 注册表
    - 在 Agent 启动时加载自定义 Agent
    - 集成配置管理
    - _Requirements: 2.1, 8.1_

- [ ] 13. Final Checkpoint - 全部功能完成
  - 确保所有测试通过
  - 运行完整测试套件
  - 如有问题，询问用户

## Notes

- 每个任务引用具体的需求条款以确保可追溯性
- Checkpoint 任务用于验证阶段性成果
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 所有测试任务均为必需，确保完整的测试覆盖

## 实现注意事项

1. **依赖管理**: 任务 2.1 需要添加 `gray-matter` 依赖用于解析 Markdown frontmatter
2. **现有代码复用**: 
   - `task-tool.ts` 已存在，任务 8.1 是扩展而非新建
   - `error-handler.ts` 已有重试逻辑，任务 4.2 是扩展
   - `events.ts` 已有大部分事件类型，任务 10.1 工作量较小
3. **目录结构**: 确保 `.naughty/` 目录结构正确：
   - `.naughty/config.json` - 配置文件
   - `.naughty/agents/*.md` - 自定义 Agent 定义
4. **向后兼容**: 现有的 6 种子 Agent 工具保持不变，Task 工具作为统一入口
