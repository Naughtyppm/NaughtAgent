# Agent: Build

> 来源: OpenCode `packages/opencode/src/agent/agent.ts`
> 许可证: MIT

## 基本信息

| 属性 | 值 |
|-----|-----|
| 名称 | build |
| 模式 | primary |
| 描述 | 默认全功能 Agent，可编辑文件、执行命令 |
| 内置 | 是 |

## 用途

Build Agent 是默认的主 Agent，具有完整的工具访问权限，用于：
- 代码编写和编辑
- 文件操作
- 命令执行
- 任务规划和管理

## 权限配置

```typescript
{
  "*": "allow",                    // 默认允许所有工具
  doom_loop: "ask",                // 防止死循环
  external_directory: {
    "*": "ask",                    // 外部目录需确认
  },
  question: "allow",               // 可以向用户提问
  plan_enter: "allow",             // 可以进入计划模式
  plan_exit: "deny",               // 不能退出计划模式（由 plan agent 控制）
  read: {
    "*": "allow",
    "*.env": "ask",                // .env 文件需确认
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
- task - 启动子 Agent
- question - 向用户提问
- todowrite - 任务管理
- webfetch - 获取网页
- websearch - 网络搜索

## 系统提示词

使用主系统提示词（见 system-prompt.md）
