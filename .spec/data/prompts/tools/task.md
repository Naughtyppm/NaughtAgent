# Tool: Task

> 来源: OpenCode `packages/opencode/src/tool/task.ts` + `task.txt`
> 许可证: MIT

## Description

Launch a new agent to handle complex, multistep tasks autonomously.

Available agent types and the tools they have access to:
{agents}

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

When to use the Task tool:
- When you are instructed to execute custom slash commands. Use the Task tool with the slash command invocation as the entire prompt. The slash command can take arguments. For example: Task(description="Check the file", prompt="/check-file path/to/file.py")

When NOT to use the Task tool:
- If you want to read a specific file path, use the Read or Glob tool instead of the Task tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the Glob tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead of the Task tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above

Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless unless you provide a session_id. Your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
6. If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| prompt | string | 是 | The detailed task description for the agent |
| description | string | 是 | A short (3-5 word) description of the task |
| subagent_type | string | 是 | The type of agent to use (e.g., "explore", "general") |
| session_id | string | 否 | Optional session ID for stateful conversations |

## 使用示例

```
// 探索代码库
Task({
  description: "Find error handlers",
  prompt: "Search the codebase for all error handling patterns. Look for try-catch blocks, error boundaries, and error logging. Return a summary of how errors are handled.",
  subagent_type: "explore"
})

// 执行复杂任务
Task({
  description: "Refactor auth module",
  prompt: "Analyze the authentication module and suggest improvements. Do not make any changes, just provide analysis.",
  subagent_type: "general"
})
```

## 权限

- 权限类型: `task`
- 默认: `allow`（但子 Agent 有各自的权限限制）
