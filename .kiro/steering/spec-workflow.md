# Spec 工作流规范

## 阶段报告要求

每个 Spec 的实现阶段（Phase）完成后，需要生成阶段报告。

### 报告位置

复盘文档按 Claude Agent SDK 的架构组织，存放在 `docs/` 目录下：

```
docs/
├── architecture/          # 架构决策记录
│   ├── 01-overall-design.md
│   ├── 02-sdk-integration.md
│   └── 03-extension-points.md
├── core/                  # SDK 核心组件
│   ├── agent-harness.md
│   ├── message-protocol.md
│   └── streaming.md
├── tools/                 # 工具系统
│   ├── builtin-tools.md
│   ├── custom-tools.md
│   └── mcp-servers.md
├── permissions/           # 权限系统
│   ├── permission-modes.md
│   ├── can-use-tool.md
│   └── security-layers.md
├── context/               # 上下文管理
│   ├── context-window.md
│   ├── auto-compaction.md
│   └── file-system.md
├── skills/                # 技能系统
│   ├── skill-loading.md
│   ├── builtin-skills.md
│   └── custom-skills.md
├── subagents/             # 子代理
│   ├── subagent-design.md
│   ├── context-isolation.md
│   └── task-delegation.md
├── hooks/                 # 生命周期钩子
│   ├── hook-system.md
│   ├── hook-events.md
│   └── hook-matchers.md
├── integration/           # 外部集成
│   ├── vscode-extension.md
│   ├── cli-wrapper.md
│   └── api-server.md
└── testing/               # 测试记录
    ├── unit-tests.md
    ├── integration-tests.md
    ├── e2e-tests.md
    └── coverage-reports.md
```

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

### 测试用例列表
| 测试用例 | 描述 | 状态 | 覆盖场景 |
|---------|------|------|---------|
| test_xxx_1 | 描述 | ✅ | 正常流程 |
| test_xxx_2 | 描述 | ✅ | 边界情况 |
| test_xxx_3 | 描述 | ⚠️ | 异常处理 |

### 覆盖率数据
- 单元测试：X 个
- 语句覆盖率：X%
- 分支覆盖率：X%
- 函数覆盖率：X%
- 行覆盖率：X%

### 测试策略
- 正常流程测试
- 边界条件测试
- 异常情况测试
- 性能测试（如适用）

### 失败案例分析
1. 失败场景描述 → 原因分析 → 解决方案

## 遇到的问题和解决方案
1. 问题描述 → 解决方案

## 后续注意事项
- 注意点 1
- 注意点 2
```

### 报告目的

1. **知识沉淀**：记录实现决策和理由，便于后续维护
2. **进度追踪**：明确每个阶段的完成状态
3. **问题记录**：保留遇到的问题和解决方案
4. **上下文传递**：帮助 AI 在新会话中快速理解已完成的工作

## Checkpoint 规则

每个阶段的 Checkpoint 应该：

1. 确认所有任务完成
2. 确认测试通过
3. 生成阶段报告
4. 如有阻塞问题，询问用户
