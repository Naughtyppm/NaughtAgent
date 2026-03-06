# Unit 5.1: Hooks 系统

| 属性 | 值 |
|------|-----|
| 优先级 | P2 |
| 预估工时 | 5 天 |
| 前置依赖 | L1-L3 稳定 |
| 状态 | ⏳ 待开始 |
| Spec | - |

## 目标

实现生命周期钩子系统，支持自定义扩展。

## 任务清单

- [ ] 定义 Hook 事件类型
  - preToolUse / postToolUse
  - fileEdited / fileCreated / fileDeleted
  - promptSubmit / agentStop
  - preTaskExecution / postTaskExecution
- [ ] 实现 HookManager
- [ ] 实现 Hook 配置文件加载
- [ ] 支持 askAgent / runCommand 两种动作
- [ ] 添加 Hook 调试日志

## 完成标准

- 支持所有定义的事件类型
- Hook 配置热加载
- 循环依赖检测

## 关键文件

- 新增: `packages/agent/src/hooks/`

## 影响范围

- 可扩展性
