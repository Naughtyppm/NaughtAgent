# Proposal: 从 OpenCode 提取可复用的提示词和工具定义

## 变更 ID

`extract-opencode-prompts`

## 背景

NaughtAgent 的核心功能与 Claude Code / OpenCode 类似。OpenCode 是开源的 Claude Code 复刻，其中包含大量经过验证的提示词、工具定义和 Agent 配置。

与其从头编写这些内容，不如直接提取 OpenCode 中可复用的部分作为基础，再根据需要调整。

## 目标

从 OpenCode 源码中提取以下可复用内容：

1. **系统提示词** - Agent 的 system prompt
2. **工具定义** - 各工具的名称、描述、参数定义
3. **Agent 配置** - build、plan、explore 等 Agent 的配置
4. **权限规则** - 默认权限模板

## 提取范围

| 类别 | 来源文件 | 提取内容 |
|------|---------|---------|
| 系统提示词 | `packages/opencode/src/agent/` | Agent prompt 模板 |
| 工具定义 | `packages/opencode/src/tool/*.ts` | 工具描述和参数 schema |
| Agent 配置 | `packages/opencode/src/agent/agent.ts` | Agent 类型定义 |
| 权限规则 | `packages/opencode/src/permission/` | 权限模板 |

## 输出

在 `.spec/data/` 目录下创建：

- `prompts/system-prompt.md` - 系统提示词
- `prompts/tools/` - 各工具的定义
- `prompts/agents/` - Agent 配置
- `prompts/permissions.md` - 权限规则模板

## 影响

- 不涉及代码实现
- 仅提取文档/配置作为参考
- 后续开发可直接使用或调整

## 风险

- 无，仅文档提取
