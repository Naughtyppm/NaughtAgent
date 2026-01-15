# OpenCode 提示词和配置提取

> 来源: [OpenCode](https://github.com/anomalyco/opencode)
> 许可证: MIT
> 提取日期: 2026-01-14

本目录包含从 OpenCode 源码中提取的提示词、工具定义和 Agent 配置，作为 NaughtAgent 开发的参考。

## 目录结构

```
.spec/data/prompts/
├── README.md              # 本文件
├── system-prompt.md       # 主系统提示词
├── permissions.md         # 权限规则模板
├── tools/                 # 工具定义
│   ├── read.md
│   ├── write.md
│   ├── edit.md
│   ├── bash.md
│   ├── glob.md
│   ├── grep.md
│   ├── task.md
│   ├── question.md
│   └── todo.md
└── agents/                # Agent 配置
    ├── build.md
    ├── plan.md
    ├── explore.md
    └── general.md
```

## 内容概览

### 系统提示词 (system-prompt.md)

主系统提示词定义了 Agent 的基本行为：
- 语气和风格（简洁、专业、无 emoji）
- 任务管理（使用 TodoWrite）
- 工具使用策略
- 代码引用格式

### 工具定义 (tools/)

| 工具 | 用途 | 权限 |
|-----|------|-----|
| read | 读取文件 | allow（.env 需确认）|
| write | 写入文件 | ask |
| edit | 编辑文件 | ask |
| bash | 执行命令 | ask |
| glob | 文件匹配 | allow |
| grep | 内容搜索 | allow |
| task | 启动子 Agent | allow |
| question | 向用户提问 | 视 Agent 而定 |
| todo | 任务管理 | allow |

### Agent 配置 (agents/)

| Agent | 模式 | 用途 |
|-------|------|------|
| build | primary | 默认全功能 Agent |
| plan | primary | 只读规划 Agent |
| explore | subagent | 快速代码探索 |
| general | subagent | 通用多步骤任务 |

### 权限规则 (permissions.md)

权限系统支持三种动作：
- `allow` - 自动允许
- `deny` - 自动拒绝
- `ask` - 需要用户确认

## NaughtAgent 适配指南

### 需要调整的部分

1. **品牌名称**: 将 "OpenCode" 替换为 "NaughtAgent"
2. **帮助链接**: 移除 OpenCode 特定链接
3. **工具名称**: 根据实际实现调整
4. **权限 UI**: 在 VS Code 插件中实现确认对话框

### 可直接复用的部分

1. 系统提示词的核心指导原则
2. 工具描述和参数定义
3. Agent 权限配置模式
4. 任务管理策略

### 建议的简化

1. 初期只实现 build 和 explore 两个 Agent
2. 权限系统简化为 allow/ask 两种
3. 工具集先实现核心 6 个：read、write、edit、bash、glob、grep

## 参考链接

- OpenCode 源码: https://github.com/anomalyco/opencode
- Claude Code 文档: https://docs.anthropic.com/claude-code
