# Implementation Plan: Unified Command System

## Overview

实现统一命令系统，采用"统一入口，分层执行"架构。复用现有 `justfile/` 和 `skill/` 模块，新建 `command/` 模块作为统一层。

**关键原则：**
- 复用现有模块，不重复实现
- 测试必须启动真实 Agent 实例
- 分层执行，统一入口

## Tasks

- [x] 1. 创建统一命令类型定义
  - [x] 1.1 创建 `src/command/types.ts`
    - 定义 CommandLayer, ExecutionMode, CommandSource 类型
    - 定义 UnifiedCommand 接口（包含所有层级属性）
    - 定义 RoutingResult, ExecutionResult 接口
    - 定义 LAYER_PRIORITY, LAYER_ICONS 常量
    - _Requirements: 1.6, 2.11, 3.8, 4.9_

- [x] 2. 实现内置命令层 (Builtin Layer)
  - [x] 2.1 创建 `src/command/builtin/` 目录结构
    - 创建 types.ts 定义 BuiltinHandler 类型
    - 创建 index.ts 导出所有内置命令
    - _Requirements: 2.1_
  
  - [x] 2.2 实现核心内置命令
    - 实现 /help - 显示所有命令（按层分组）
    - 实现 /clear - 清空对话历史
    - 实现 /exit - 退出应用
    - 实现 /refresh - 重新加载命令源
    - _Requirements: 2.2, 2.3, 2.7, 2.8_
  
  - [x] 2.3 实现状态管理命令
    - 实现 /model [name] - 切换模型
    - 实现 /mode - 切换权限模式
    - 实现 /history - 显示命令历史
    - 实现 /config - 显示/打开配置
    - _Requirements: 2.4, 2.5, 2.6, 2.9_

- [x] 3. 实现统一注册表
  - [x] 3.1 创建 `src/command/registry.ts`
    - 实现 UnifiedRegistry 类
    - 聚合 builtin 命令（直接注册）
    - 聚合 external 命令（从 justfile 模块获取并转换）
    - 聚合 skill 命令（从 skill 模块获取并转换）
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 3.2 实现命令查询和搜索
    - 实现 get(name) 方法（按优先级返回）
    - 实现 search(query) 方法（模糊搜索）
    - 实现 getByLayer() 分层获取方法
    - _Requirements: 1.4, 1.5_
  
  - [x] 3.3 实现动态重载
    - 实现 reload() 方法
    - 处理加载错误并记录
    - _Requirements: 1.7, 3.1-3.4, 4.1-4.3_

- [x] 4. Checkpoint - 注册表单元测试
  - 运行 `pnpm -C packages/agent test` 确保注册表测试通过
  - 验证三层命令正确聚合
  - 验证优先级排序正确

- [x] 5. 实现命令路由器
  - [x] 5.1 创建 `src/command/router.ts`
    - 实现 isCommand() 方法（检测 / 前缀）
    - 实现 parseArgs() 方法（支持引号和命名参数）
    - 实现 route() 方法（返回 RoutingResult）
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

- [x] 6. 实现命令调度器
  - [x] 6.1 创建 `src/command/dispatcher.ts`
    - 实现 CommandDispatcher 类
    - 根据 layer 选择执行器
    - builtin → 直接调用 handler
    - external → 调用 justfile executor
    - skill → 调用 skill executor
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 6.2 实现统一结果处理
    - 转换各层执行结果为 ExecutionResult
    - 记录执行时间
    - 支持 AbortSignal 取消
    - _Requirements: 6.4, 6.5, 6.6, 6.7_

- [x] 7. 实现错误诊断模块
  - [x] 7.1 创建 `src/command/diagnostics.ts`
    - 实现 ErrorDiagnostics 类
    - 实现错误分类逻辑
    - 实现 findSimilar() 方法（编辑距离）
    - _Requirements: 7.1, 7.2_
  
  - [x] 7.2 实现各类错误的诊断和建议
    - not_found → 建议相似命令
    - dependency_missing → 提供安装指令
    - workflow_error → 显示失败步骤
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

- [x] 8. 实现补全提供器
  - [x] 8.1 创建 `src/command/completion.ts`
    - 实现 CompletionProvider 类
    - 实现 getSuggestions() 方法（前缀过滤）
    - 生成包含层级图标的建议
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 9. 创建模块入口
  - [x] 9.1 创建 `src/command/index.ts`
    - 导出所有类型
    - 导出 createUnifiedRegistry() 工厂函数
    - 导出 createCommandRouter() 工厂函数
    - 导出 createCommandDispatcher() 工厂函数
    - 导出 createCompletionProvider() 工厂函数

- [x] 10. Checkpoint - 核心模块单元测试
  - 运行 `pnpm -C packages/agent test` 确保所有单元测试通过
  - 验证路由器正确分类输入
  - 验证调度器正确路由到各层

- [x] 11. 真实 Agent 集成测试
  - [x] 11.1 创建测试基础设施
    - 创建 `test/command/integration.test.ts`
    - 创建 `test/helpers/mock-provider.ts` Mock LLM Provider
    - 创建 `test/helpers/test-agent.ts` 测试 Agent 工厂
    - _Requirements: 9.1, 9.7, 9.8_
  
  - [x] 11.2 实现 Builtin 命令集成测试
    - 测试 /help 返回所有命令
    - 测试 /model 切换模型
    - 测试 /mode 切换权限模式
    - 测试 /clear 清空历史
    - _Requirements: 9.2_
  
  - [x] 11.3 实现 External 命令集成测试
    - 创建测试 justfile
    - 测试命令通过 just CLI 执行
    - 验证 stdout/stderr 捕获
    - _Requirements: 9.3_
  
  - [x] 11.4 实现 Skill 命令集成测试
    - 配置 Mock LLM 响应
    - 测试 /commit 触发 AI workflow
    - 验证 workflow 执行和结果
    - _Requirements: 9.4_
  
  - [x] 11.5 实现错误处理集成测试
    - 测试命令不存在时的建议
    - 测试 just 不可用时的诊断
    - _Requirements: 9.5, 9.6_

- [x] 12. Checkpoint - 集成测试通过
  - 运行 `pnpm -C packages/agent test` 确保所有集成测试通过
  - 验证真实 Agent 实例正确执行命令

- [x] 13. 集成到 Ink UI
  - [x] 13.1 更新 App.tsx
    - 创建 UnifiedRegistry 实例
    - 创建 CommandRouter 实例
    - 创建 CommandDispatcher 实例
    - 替换现有分散的命令处理逻辑
    - _Requirements: 1.1, 5.1, 6.1_
  
  - [x] 13.2 更新 InputArea.tsx
    - 使用 CompletionProvider 提供命令补全
    - 显示层级图标和描述
    - _Requirements: 8.1, 8.4_
  
  - [x] 13.3 更新 HelpView.tsx
    - 从 UnifiedRegistry 获取命令
    - 按层级分组显示
    - _Requirements: 2.2_

- [x] 14. Final Checkpoint
  - 运行 `pnpm -C packages/agent test` 确保所有测试通过
  - 运行 `pnpm -C packages/agent typecheck` 确保类型检查通过
  - 手动测试 CLI 命令执行

## Notes

- **复用原则**: External Layer 复用 `src/justfile/`，Skill Layer 复用 `src/skill/`
- **测试要求**: 集成测试必须启动真实 Agent 实例，使用 Mock LLM Provider
- **优先级**: builtin > skill > external（同名命令时）
- **执行模式**: builtin=sync, external=subprocess, skill=workflow

## File Structure

```
src/command/
├── types.ts              # 统一类型定义
├── registry.ts           # 统一注册表
├── router.ts             # 输入路由器
├── dispatcher.ts         # 分层调度器
├── diagnostics.ts        # 错误诊断
├── completion.ts         # 补全提供器
├── builtin/
│   ├── index.ts          # 内置命令导出
│   ├── types.ts          # 内置命令类型
│   ├── help.ts
│   ├── clear.ts
│   ├── model.ts
│   ├── mode.ts
│   ├── history.ts
│   ├── exit.ts
│   ├── refresh.ts
│   └── config.ts
└── index.ts              # 模块入口

test/command/
├── registry.test.ts      # 注册表单元测试
├── router.test.ts        # 路由器单元测试
├── dispatcher.test.ts    # 调度器单元测试
├── diagnostics.test.ts   # 诊断单元测试
├── completion.test.ts    # 补全单元测试
└── integration.test.ts   # 真实 Agent 集成测试

test/helpers/
├── mock-provider.ts      # Mock LLM Provider
└── test-agent.ts         # 测试 Agent 工厂
```

