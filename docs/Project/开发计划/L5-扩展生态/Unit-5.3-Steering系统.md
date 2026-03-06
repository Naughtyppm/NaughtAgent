# Unit 5.3: Steering 系统

| 属性 | 值 |
|------|-----|
| 优先级 | P2 |
| 预估工时 | 3 天 |
| 前置依赖 | 无 |
| 状态 | ⏳ 待开始 |
| Spec | - |

## 目标

实现条件触发的上下文引导规则。

## 任务清单

- [ ] 设计 Steering 文件格式
- [ ] 实现三种触发模式（always/fileMatch/manual）
- [ ] 实现 Steering 加载器
- [ ] 支持 #[[file:xxx]] 引用语法
- [ ] 集成到系统提示词构建

## 完成标准

- 支持 always/fileMatch/manual 三种模式
- 支持文件引用
- 热加载生效

## 关键文件

- 新增: `packages/agent/src/steering/`

## 影响范围

- 上下文引导
