# Tool: TodoWrite

> 来源: OpenCode `packages/opencode/src/tool/todo.ts` + `todowrite.txt`
> 许可证: MIT

## Description

Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool

Use this tool proactively in these scenarios:

1. Complex multistep tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the todo list
4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
5. After receiving new instructions - Immediately capture user requirements as todos. Feel free to edit the todo list based on new information.
6. After completing a task - Mark it complete and add any new follow-up tasks
7. When you start working on a new task, mark the todo as in_progress. Ideally you should only have one todo as in_progress at a time. Complete existing tasks before starting new ones.

## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| todos | Todo[] | 是 | Array of todo items |

### Todo 结构

```typescript
interface Todo {
  content: string;      // 任务描述
  status: "pending" | "in_progress" | "completed" | "cancelled";
}
```

## Task States and Management

1. **Task States**: Use these states to track progress:
   - pending: Task not yet started
   - in_progress: Currently working on (limit to ONE task at a time)
   - completed: Task finished successfully
   - cancelled: Task no longer needed

2. **Task Management**:
   - Update task status in real-time as you work
   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
   - Only have ONE task in_progress at any time
   - Complete current tasks before starting new ones
   - Cancel tasks that become irrelevant

3. **Task Breakdown**:
   - Create specific, actionable items
   - Break complex tasks into smaller, manageable steps
   - Use clear, descriptive task names

## 使用示例

```
// 创建任务列表
TodoWrite({
  todos: [
    { content: "分析现有代码结构", status: "completed" },
    { content: "实现核心功能", status: "in_progress" },
    { content: "编写测试", status: "pending" },
    { content: "更新文档", status: "pending" }
  ]
})
```

## 权限

- 权限类型: `todowrite`
- 默认: `allow`
- explore agent: `deny`（探索 Agent 不需要任务管理）
