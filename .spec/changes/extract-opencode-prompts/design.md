# 设计方案

## 实现思路

从 OpenCode 源码中定位关键文件，提取提示词和配置，整理成独立的 markdown/json 文件存放在 `.spec/data/prompts/` 下。

## 目录结构

```
.spec/data/prompts/
├── system-prompt.md          # 主系统提示词
├── tools/                    # 工具定义
│   ├── read.md
│   ├── write.md
│   ├── edit.md
│   ├── bash.md
│   ├── glob.md
│   ├── grep.md
│   ├── task.md
│   ├── question.md
│   └── todo.md
├── agents/                   # Agent 配置
│   ├── build.md
│   ├── plan.md
│   └── explore.md
└── permissions.md            # 权限规则模板
```

## 提取来源

| 目标文件 | OpenCode 来源 |
|---------|--------------|
| system-prompt.md | `src/session/prompt.ts` 或 `src/agent/*.ts` |
| tools/*.md | `src/tool/*.ts` 中的 description 和 parameters |
| agents/*.md | `src/agent/agent.ts` 中的 Agent 定义 |
| permissions.md | `src/permission/` 中的默认规则 |

## 提取格式

### 工具定义格式

```markdown
# Tool: <name>

## Description
<工具描述，给 LLM 看的>

## Parameters
| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| ... | ... | ... | ... |

## 示例
<使用示例>
```

### Agent 配置格式

```markdown
# Agent: <name>

## 模式
<primary | subagent>

## 描述
<Agent 用途>

## 系统提示词
<Agent 特定的 prompt>

## 权限
<允许/禁止的操作>
```

## 执行步骤

1. 读取 OpenCode 源码，定位提示词和工具定义
2. 提取内容，按上述格式整理
3. 创建目录结构和文件
4. 标注来源（MIT 许可证）
5. 记录需要针对 NaughtAgent 调整的部分

## 注意事项

- 保留原始意图，不做过度修改
- 标注哪些是直接复用，哪些需要调整
- 中文注释便于理解
