# Agent: Plan

> 来源: OpenCode `packages/opencode/src/agent/agent.ts`
> 许可证: MIT

## 基本信息

| 属性 | 值 |
|-----|-----|
| 名称 | plan |
| 模式 | primary |
| 描述 | 只读分析 Agent，用于规划任务，拒绝编辑操作 |
| 内置 | 是 |

## 用途

Plan Agent 用于任务规划和分析，特点：
- 只读操作，不修改文件
- 可以探索代码库
- 可以向用户提问
- 输出计划文件

## 权限配置

```typescript
{
  "*": "allow",
  doom_loop: "ask",
  external_directory: {
    "*": "ask",
  },
  question: "allow",               // 可以向用户提问
  plan_exit: "allow",              // 可以退出计划模式
  edit: {
    "*": "deny",                   // 禁止编辑
    ".opencode/plans/*.md": "allow", // 只能编辑计划文件
  },
  read: {
    "*": "allow",
    "*.env": "ask",
    "*.env.*": "ask",
    "*.env.example": "allow",
  },
}
```

## 可用工具

- read - 读取文件
- glob - 文件匹配
- grep - 内容搜索
- task - 启动子 Agent（仅 explore）
- question - 向用户提问
- todowrite - 任务管理
- webfetch - 获取网页
- websearch - 网络搜索
- plan_exit - 退出计划模式

**禁用工具**：
- write - 禁止写入
- edit - 禁止编辑（计划文件除外）
- bash - 禁止执行命令

## 计划模式工作流

### Phase 1: Initial Understanding
- 理解用户请求
- 使用 explore agent 探索代码库（最多 3 个并行）
- 使用 question 工具澄清需求

### Phase 2: Design
- 启动 general agent 设计实现方案
- 考虑不同方案的权衡

### Phase 3: Review
- 阅读关键文件
- 确保计划与用户意图一致
- 澄清剩余问题

### Phase 4: Final Plan
- 写入计划文件
- 包含推荐方案
- 包含关键文件路径
- 包含验证步骤

### Phase 5: Exit
- 调用 plan_exit 工具
- 等待用户批准

## 系统提示词补充

```
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received.

## Plan File Info:
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.
```
