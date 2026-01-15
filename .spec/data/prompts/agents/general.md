# Agent: General

> 来源: OpenCode `packages/opencode/src/agent/agent.ts`
> 许可证: MIT

## 基本信息

| 属性 | 值 |
|-----|-----|
| 名称 | general |
| 模式 | subagent |
| 描述 | 通用子 Agent，用于研究复杂问题和执行多步骤任务 |
| 内置 | 是 |

## 用途

General Agent 是一个功能较全的子 Agent，用于：
- 研究复杂问题
- 执行多步骤任务
- 并行处理多个工作单元

## 权限配置

```typescript
{
  "*": "allow",                    // 默认允许
  doom_loop: "ask",
  external_directory: {
    "*": "ask",
  },
  todoread: "deny",                // 禁止读取任务列表
  todowrite: "deny",               // 禁止写入任务列表
  question: "deny",                // 禁止向用户提问
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
- write - 写入文件
- edit - 编辑文件
- bash - 执行命令
- glob - 文件匹配
- grep - 内容搜索
- webfetch - 获取网页
- websearch - 网络搜索

**禁用工具**：
- task - 禁止启动子 Agent（防止嵌套）
- question - 禁止向用户提问
- todowrite/todoread - 禁止任务管理

## 调用示例

```typescript
Task({
  description: "Analyze auth module",
  prompt: "Analyze the authentication module structure. Identify the main components, data flow, and potential improvements. Return a detailed analysis.",
  subagent_type: "general"
})
```
