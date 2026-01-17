# Implementation Plan: Agent Cognitive Layer

## Overview

本实现计划将认知能力层分解为可增量实现的任务，按照依赖关系组织。每个任务都与具体的需求关联，确保完整覆盖所有功能。

实现语言：TypeScript
测试框架：Vitest + fast-check

## 阶段报告要求

> 每个阶段（Phase）完成后，需要生成阶段报告，记录到 `.kiro/specs/agent-cognitive-layer/reports/` 目录。

### 报告模板

```markdown
# Phase X 完成报告：[阶段名称]

## 概述
- 完成日期：YYYY-MM-DD
- 耗时：X 天
- 状态：✅ 完成 / ⚠️ 部分完成 / ❌ 阻塞

## 实现内容

### 这个系统/模块做了什么
[简述功能和职责]

### 起到什么作用
[在整体架构中的位置和价值]

### 一般怎么做（业界常见方案）
[简述常见实现方式]

### 我们怎么做的
[具体实现选择]

### 为什么这样做
[决策理由和权衡]

## 关键文件
- `path/to/file.ts` - 描述

## 测试覆盖
- 单元测试：X 个
- 覆盖率：X%

## 遇到的问题和解决方案
1. 问题描述 → 解决方案

## 后续注意事项
- 注意点 1
- 注意点 2
```

## 任务依赖图

```
Phase 0: Provider 重构（前置）
    ↓
Phase 1: 基础设施（配置、类型）
    ↓
Phase 2: 工具系统增强（扩展现有 tool/ 和 permission/）
    ↓
Phase 3: 记忆系统（不依赖 LLM）
    ↓
Phase 4: 规划层（依赖 LLM）
    ↓
Phase 5: 反思循环（依赖 LLM）
    ↓
Phase 6: 集成层（依赖所有模块）
    ↓
Phase 7: 验收
```

> **注意**：工具系统增强是在现有 `packages/agent/src/tool/` 和 `permission/` 基础上扩展，不新建独立系统。

## Tasks

---

### Phase 0: Provider 层重构（前置）

> ⚠️ 必须在认知层开发前完成，避免后续重构

- [ ] 0. Provider 层重构
  - [ ] 0.1 安装 Claude SDK 依赖
    - 安装 `@anthropic-ai/sdk`
    - 移除 `@ai-sdk/anthropic`
    - 保留 `ai` 和 `@ai-sdk/openai`（OpenAI Provider 依赖）
    - _Requirements: 16_
  - [ ] 0.2 实现 ClaudeProvider
    - 创建 `provider/claude.ts`
    - 实现 `LLMProvider` 接口
    - 使用 `client.messages.stream()` 实现流式
    - 使用 `client.messages.create()` 实现非流式
    - 实现工具定义转换（使用 `betaZodTool`）
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - [ ] 0.3 实现 toolRunner 封装
    - 封装 `client.beta.messages.toolRunner()` 能力
    - 提供自动工具调用循环
    - _Requirements: 16.5_
  - [ ] 0.4 更新工厂和类型
    - 更新 `factory.ts` 支持 'claude' provider type
    - 更新 `types.ts` 适配消息格式差异
    - 保持 `LLMProvider` 接口不变
    - _Requirements: 16.7, 16.9_
  - [ ] 0.5 编写 Provider 测试
    - 单元测试：消息格式转换
    - 单元测试：工具定义转换
    - 集成测试：实际 API 调用（可选，需 API Key）
    - _Requirements: 16.1-16.9_
  - [ ] 0.6 验证现有功能
    - 确保 OpenAI Provider 正常工作
    - 确保 Kiro Provider 正常工作（独立实现，不受影响）
    - 运行现有 Agent 测试
    - _Requirements: 16.8_

- [ ] 0.7 Checkpoint - Provider 重构完成
  - 所有现有测试通过
  - Agent 基本功能正常
  - 如有问题，询问用户

---

### Phase 1: 基础设施

- [ ] 1. 项目结构和基础类型
  - [ ] 1.1 创建目录结构和入口文件
    - 创建 `packages/agent/src/subtask/cognitive/` 目录
    - 创建 `index.ts` 统一导出
    - 创建 `types.ts` 基础类型定义
    - _Requirements: 14.1_
  - [ ] 1.2 安装新依赖
    - 安装 `fast-check`（属性测试）
    - 安装 `ajv`（JSON Schema 验证，可选）
    - _Requirements: 9.3_
  - [ ] 1.3 实现配置管理模块
    - 创建 `config.ts`
    - 实现 `CognitiveConfig` 接口和验证
    - 实现配置预设 (minimal, standard, full)
    - 实现配置序列化/反序列化
    - _Requirements: 15.1, 15.2, 15.3, 15.5, 15.6_
  - [ ] 1.4 编写配置模块测试
    - 单元测试：配置验证、预设加载
    - 属性测试：**Property 42-44**
    - **Validates: Requirements 15.2, 15.3, 15.6**

- [ ] 1.5 Checkpoint - 基础设施完成
  - 配置测试通过
  - 📝 生成阶段报告：`reports/phase-1-infrastructure.md`

---

### Phase 2: 工具系统增强

> 在现有 `packages/agent/src/tool/` 和 `permission/` 基础上扩展

- [ ] 2. 工具系统增强
  - [ ] 2.1 扩展 ToolRegistry
    - 修改 `tool/registry.ts`
    - 添加 category 和 tags 支持
    - 实现 unregister 方法
    - 实现 query 方法（按名称模式、类别、标签）
    - 添加事件发射（registered、unregistered）
    - 实现 toClaudeTools() 格式转换
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [ ] 2.2 编写 ToolRegistry 扩展测试
    - 单元测试：注册、注销、查询
    - 属性测试：**Property 14-16**
    - **Validates: Requirements 7.1, 7.3, 7.6**
  - [ ] 2.3 实现 PermissionController（参考 Claude Code）
    - 创建 `permission/controller.ts`
    - 实现声明式权限规则（ask/allow/deny）
    - 实现规则优先级匹配（deny > allow > ask）
    - 实现模式匹配（字符串、glob、正则）
    - 实现静态分析自动允许安全命令
    - 与现有 checkPermission 集成
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [ ] 2.4 编写 PermissionController 测试
    - 单元测试：规则匹配、优先级、模式匹配
    - 属性测试：**Property 17-19**（更新为新的权限模型）
    - **Validates: Requirements 8.2, 8.3, 8.6, 8.7**
  - [ ] 2.5 实现 ParameterValidator
    - 创建 `tool/validator.ts`
    - 实现 JSON Schema 验证（使用 Ajv 或 Zod）
    - 实现类型强制转换
    - 实现字符串输入清理
    - 实现 Zod → JSON Schema 转换
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ] 2.6 编写 ParameterValidator 测试
    - 单元测试：验证、强制转换、清理
    - 属性测试：**Property 20-22**
    - **Validates: Requirements 9.1, 9.2, 9.4**
  - [ ] 2.7 实现 ExecutionSandbox
    - 创建 `tool/sandbox.ts`
    - 实现超时控制（Promise.race）
    - 实现执行指标收集
    - 可选内存监控
    - 与 Tool.Context.abort 集成
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [ ] 2.8 编写 ExecutionSandbox 测试
    - 单元测试：超时、指标收集
    - 属性测试：**Property 23-24**
    - **Validates: Requirements 10.1, 10.2, 10.5**
  - [ ] 2.9 更新工具系统导出
    - 更新 `tool/index.ts` 导出新组件
    - 更新 `permission/index.ts` 导出 PermissionController

- [ ] 2.10 Checkpoint - 工具系统增强完成
  - 所有工具系统测试通过
  - 📝 生成阶段报告：`reports/phase-2-tool-system.md`

---

### Phase 3: 记忆系统

> 记忆系统不依赖 LLM（嵌入使用 TF-IDF），可独立实现和测试

- [ ] 3. 记忆系统实现
  - [ ] 3.1 实现嵌入向量提供者
    - 创建 `memory/embedding.ts`
    - 实现 `EmbeddingProvider` 接口
    - 实现 `TFIDFEmbeddingProvider`（默认，详见 design.md）
    - 预留外部嵌入服务扩展点（OpenAI、Transformers.js）
    - _Requirements: 12.2_
  - [ ] 3.2 实现工作记忆
    - 创建 `memory/working.ts`
    - 实现 `WorkingMemory` 类
    - 实现 LRU 淘汰策略
    - 实现会话隔离
    - 实现查询功能
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - [ ] 3.3 编写工作记忆测试
    - 单元测试：LRU 淘汰、会话隔离
    - 属性测试：**Property 25-28**（纯逻辑，100 次迭代）
    - **Validates: Requirements 11.1, 11.4, 11.5, 11.6**
  - [ ] 3.4 实现语义记忆
    - 创建 `memory/semantic.ts`
    - 实现 `SemanticMemory` 类
    - 实现向量存储（内存 Map）
    - 实现重要性评分（基于访问频率和显式标记）
    - 实现记忆合并（相似度阈值 0.85 + 内容拼接，详见 design.md）
    - 实现按重要性淘汰
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
  - [ ] 3.5 编写语义记忆测试
    - 单元测试：存储、合并、淘汰
    - 属性测试：**Property 29-32**
    - **Validates: Requirements 12.1, 12.3, 12.5, 12.6**
  - [ ] 3.6 实现记忆检索器
    - 创建 `memory/retriever.ts`
    - 实现 `MemoryRetriever` 类
    - 实现余弦相似度计算
    - 实现多源检索合并
    - 实现结果排序和过滤
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_
  - [ ] 3.7 编写记忆检索器测试
    - 单元测试：相似度计算、排序
    - 属性测试：**Property 33-37**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.6**
  - [ ] 3.8 创建记忆系统统一导出
    - 创建 `memory/index.ts`
    - 导出所有记忆系统组件

- [ ] 3.9 Checkpoint - 记忆系统完成
  - 所有记忆系统测试通过
  - 📝 生成阶段报告：`reports/phase-3-memory.md`

---

### Phase 4: 规划层

> 规划层依赖 LLM（Claude SDK）进行任务分解

- [ ] 4. 规划层实现
  - [ ] 4.1 实现任务分解器
    - 创建 `planning/decomposer.ts`
    - 实现 `TaskDecomposer` 类
    - 使用 Claude SDK 进行结构化分析
    - 实现输入验证（空输入拒绝）
    - 实现步骤 ID 生成和复杂度估算
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [ ] 4.2 编写任务分解器测试
    - 单元测试：输入验证（纯逻辑）
    - 契约测试：验证 LLM 调用格式（Mock Provider）
    - 集成测试：真实 API（可选，skipIf 无 API Key）
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6**
  - [ ] 4.3 实现依赖分析器
    - 创建 `planning/dependency.ts`
    - 实现 `DependencyAnalyzer` 类
    - 实现循环依赖检测（**Kahn 算法**，详见 design.md）
    - 实现引用完整性验证
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [ ] 4.4 编写依赖分析器测试
    - 单元测试：循环检测、拓扑排序（纯逻辑）
    - 属性测试：**Property 3-4**（纯逻辑，100 次迭代）
    - **Validates: Requirements 2.4, 2.6**
  - [ ] 4.5 实现执行规划器
    - 创建 `planning/planner.ts`
    - 实现 `ExecutionPlanner` 类
    - 实现执行批次生成（拓扑排序分层）
    - 实现并行/串行策略
    - 与现有 TaskExecutor 集成
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [ ] 4.6 编写执行规划器测试
    - 单元测试：批次生成、并发限制（纯逻辑）
    - 属性测试：**Property 5-7**
    - **Validates: Requirements 3.2, 3.3, 3.4**
  - [ ] 4.7 创建规划层统一导出
    - 创建 `planning/index.ts`
    - 导出所有规划层组件

- [ ] 4.8 Checkpoint - 规划层完成
  - 所有规划层测试通过
  - 📝 生成阶段报告：`reports/phase-4-planning.md`

---

### Phase 5: 反思循环

> 反思循环依赖 LLM 进行错误诊断

- [ ] 5. 反思循环实现
  - [ ] 5.1 实现结果验证器
    - 创建 `reflection/validator.ts`
    - 实现 `ResultValidator` 类
    - 实现验证标准评估
    - 实现验证历史记录
    - 实现自定义验证函数支持
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [ ] 5.2 编写结果验证器测试
    - 单元测试：验证逻辑、历史记录（纯逻辑）
    - 属性测试：**Property 8-9**
    - **Validates: Requirements 4.2, 4.6**
  - [ ] 5.3 实现错误诊断器
    - 创建 `reflection/diagnoser.ts`
    - 实现 `ErrorDiagnoser` 类
    - 实现错误模式匹配（正则 + 关键词）
    - 实现错误分类
    - 使用 Claude SDK 进行智能分析（复杂错误）
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ] 5.4 编写错误诊断器测试
    - 单元测试：模式匹配、分类（纯逻辑）
    - 契约测试：LLM 调用格式（Mock Provider）
    - **Validates: Requirements 5.2, 5.5**
  - [ ] 5.5 实现自我纠错器
    - 创建 `reflection/corrector.ts`
    - 实现 `SelfCorrector` 类
    - 实现修复方案生成
    - 实现重试限制
    - 实现策略去重（哈希比较）
    - 与现有 error-handler 集成
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [ ] 5.6 编写自我纠错器测试
    - 单元测试：重试限制、策略去重（纯逻辑）
    - 属性测试：**Property 12-13**
    - **Validates: Requirements 6.2, 6.4**
  - [ ] 5.7 创建反思循环统一导出
    - 创建 `reflection/index.ts`
    - 导出所有反思循环组件

- [ ] 5.8 Checkpoint - 反思循环完成
  - 所有反思循环测试通过
  - 📝 生成阶段报告：`reports/phase-5-reflection.md`

---

### Phase 6: 集成层

> 集成层将所有模块组合，提供统一入口

- [ ] 6. 集成层实现
  - [ ] 6.1 实现 CognitiveSubTask 主类
    - 创建 `cognitive-subtask.ts`
    - 实现统一接口包装现有 SubTask 模式
    - 实现认知功能编排（规划 → 执行 → 反思）
    - 实现事件发射
    - 实现配置管理（含运行时更新，详见 design.md）
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  - [ ] 6.2 编写 CognitiveSubTask 测试
    - 单元测试：配置管理、事件发射（纯逻辑）
    - 属性测试：**Property 38-41**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.6**
  - [ ] 6.3 实现错误处理集成
    - 创建认知层错误类
    - 实现与现有 error-handler 的集成
    - 实现降级策略（认知功能失败时回退到直接执行）
    - _Requirements: 14.5_
  - [ ] 6.4 更新主入口导出
    - 更新 `cognitive/index.ts` 导出所有组件
    - 更新 `subtask/index.ts` 导出认知层

- [ ] 6.5 Checkpoint - 集成层完成
  - 所有集成层测试通过
  - 📝 生成阶段报告：`reports/phase-6-integration.md`

---

### Phase 7: 验收

- [ ] 7. 集成测试和文档
  - [ ] 7.1 编写端到端集成测试
    - 测试完整的规划-执行-反思流程
    - 测试记忆系统的协作
    - 测试配置预设的实际效果
    - _Requirements: 14.1, 14.2, 14.3_
  - [ ] 7.2 添加 JSDoc 文档注释
    - 为所有公开接口添加文档
    - 添加使用示例
    - _Requirements: All_

- [ ] 7.3 Final Checkpoint - 全部完成
  - 所有测试通过
  - 覆盖率达标
  - 文档完整
  - 📝 生成最终报告：`reports/phase-7-final.md`

---

## Notes

### 任务顺序说明

1. **Phase 0 必须最先完成** - Provider 重构影响所有 LLM 调用，先完成避免后续返工
2. **Phase 1-3 顺序执行** - 基础设施 → 工具系统增强 → 记忆系统
3. **Phase 4-5 依赖 Phase 0** - 规划层和反思循环需要 LLM 调用
4. **Phase 6 依赖所有前置** - 集成层需要所有模块就绪

### 工具系统说明

工具系统增强是在现有模块基础上扩展：
- `tool/registry.ts` - 扩展注册表，添加查询、事件、格式转换
- `tool/validator.ts` - 新增参数校验器
- `tool/sandbox.ts` - 新增执行沙箱
- `permission/controller.ts` - 新增权限控制器（基于角色）

保持与现有 `Tool.define()` 模式兼容。

### 测试策略

| 测试类型 | LLM 依赖 | 运行频率 | 目的 |
|----------|----------|----------|------|
| 单元测试 | 无 | 每次提交 | 验证纯逻辑 |
| 契约测试 | Mock | 每次提交 | 验证接口格式 |
| 集成测试 | 真实 API | 手动/可选 | 验证端到端 |

**覆盖率目标**：语句 80%，分支 75%，函数 85%，行 80%

### 风险点

1. **Claude SDK API 变化** - 关注 `@anthropic-ai/sdk` 版本更新，`betaZodTool` 是 Beta API
2. **嵌入向量质量** - TF-IDF 对语义理解有限，后续可升级到 OpenAI/Transformers.js
3. **内存监控精度** - Node.js 限制，只能做到进程级别
