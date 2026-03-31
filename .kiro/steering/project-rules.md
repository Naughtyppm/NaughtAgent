# NaughtyAgent 项目规则

## 语言

始终使用中文回复，除非用户明确要求其他语言。包括对话、代码注释、文档、错误说明。

## 项目命令

执行构建/测试/部署等操作前，先检查项目根目录是否有 `justfile`，有则优先用 `just <命令>`。

## 长输出策略

超过 100 行的内容用 `fsWrite` + `fsAppend` 分段写入文件，不要在对话中输出。
- fsWrite 创建文件，写前 50 行
- fsAppend 每次追加 30-50 行
- 完成后简短告知文件位置

文件路径约定：
- 设计方案：`Docs/Project/Design-{名称}.md`
- 配置指南：`Docs/Project/Guide-{名称}.md`
- 分析报告：`Docs/Project/Report-{名称}.md`

## 事件系统

遇到以下情况时发出事件（格式：`<event:domain.action.status>{JSON}</event:...>`）：

- 工具调用失败 → `<event:mcp.tool.error>`
- 发现可改进点 → `<event:skill.improvement.identified>`
- 同一错误出现 3 次以上 → `<event:debug.error.repeated>`
- 尝试 2 次以上才成功时，主动回顾并发出改进事件


## 笔记规范

每篇学习笔记（`docs/智能体/Agent架构/`）开头必须包含术语表，格式：

```markdown
## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| xxx | xxx | xxx |
```
