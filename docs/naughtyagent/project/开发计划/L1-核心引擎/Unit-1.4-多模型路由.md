# Unit 1.4: 多模型路由

| 属性 | 值 |
|------|-----|
| 优先级 | P2 |
| 预估工时 | 3 天 |
| 前置依赖 | Unit 1.1 |
| 状态 | ⏳ 待开始 |
| Spec | - |

## 目标

按任务类型自动选择最优模型，平衡质量和成本。

## 当前实现分析

- `packages/agent/src/provider/factory.ts`: 有模型映射但无任务路由

## 任务清单

- [ ] 定义任务类型分类（simple/complex/code/chat）
- [ ] 实现 ModelRouter 路由策略
- [ ] 配置模型映射规则
- [ ] 添加降级策略（主模型失败自动切换）
- [ ] 记录模型使用统计

## 完成标准

- 简单任务自动使用轻量模型
- 复杂任务自动使用强力模型
- 支持用户自定义路由规则

## 关键文件

- `packages/agent/src/provider/factory.ts`
- 新增: `packages/agent/src/provider/router.ts`

## 影响范围

- Provider 层
- 成本优化
