# Tool: Question

> 来源: OpenCode `packages/opencode/src/tool/question.ts` + `question.txt`
> 许可证: MIT

## Description

Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Answers are returned as arrays of labels; set `multiple: true` to allow selecting more than one
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| question | string | 是 | The question to ask the user |
| options | string[] | 是 | Array of options for the user to choose from |
| multiple | boolean | 否 | Allow multiple selections (default false) |

## 使用示例

```
// 单选问题
Question({
  question: "Which database would you like to use?",
  options: [
    "PostgreSQL (Recommended)",
    "MySQL",
    "SQLite",
    "MongoDB"
  ]
})

// 多选问题
Question({
  question: "Which features should be included?",
  options: [
    "Authentication",
    "Authorization",
    "Logging",
    "Caching"
  ],
  multiple: true
})
```

## 权限

- 权限类型: `question`
- build agent: `allow`
- plan agent: `allow`
- 其他 agent: `deny`（子 Agent 不能直接向用户提问）
