# Unit 4.1: VS Code 深度集成

| 属性 | 值 |
|------|-----|
| 优先级 | P1 |
| 预估工时 | 10 天 |
| 前置依赖 | L1-L2 稳定 |
| 状态 | ⏳ 待开始 |
| Spec | - |

## 目标

深度集成 VS Code，提供原生级体验。

## 子任务拆分

### 4.1.1 Diff Editor 集成（3天）
- [ ] 使用 VS Code Diff Editor API
- [ ] 实现修改预览和确认流程
- [ ] 支持部分接受/拒绝

### 4.1.2 诊断集成（2天）
- [ ] 集成 VS Code Diagnostics API
- [ ] 显示代码问题到 Problems 面板
- [ ] 支持快速修复建议

### 4.1.3 内联补全（3天）
- [ ] 实现 InlineCompletionProvider
- [ ] 支持 Tab 接受建议
- [ ] 添加触发条件配置

### 4.1.4 终端集成（2天）
- [ ] 使用 VS Code Terminal API
- [ ] 在 VS Code 终端执行命令
- [ ] 捕获终端输出

## 完成标准

- 修改在 Diff Editor 中预览
- 代码问题显示在 Problems 面板
- 支持内联代码补全

## 关键文件

- `packages/vscode/src/`

## 影响范围

- IDE 体验
