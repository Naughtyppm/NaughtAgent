# 权限规则模板

> 来源: OpenCode `packages/opencode/src/permission/next.ts` + `agent/agent.ts`
> 许可证: MIT

## 权限模型概述

OpenCode 使用基于规则的权限系统，每个 Agent 有独立的权限集合。

### 权限动作

```typescript
type Action = "allow" | "deny" | "ask"
```

- `allow` - 自动允许，无需确认
- `deny` - 自动拒绝，抛出错误
- `ask` - 需要用户确认

### 权限规则结构

```typescript
interface Rule {
  permission: string;  // 权限类型（工具名或通配符）
  pattern: string;     // 匹配模式（路径或通配符）
  action: Action;      // 动作
}

type Ruleset = Rule[];
```

### 规则匹配

- 支持通配符 `*` 匹配
- 规则按顺序评估，后面的规则覆盖前面的
- 未匹配的权限默认为 `ask`

## 默认权限配置

```typescript
const defaults = {
  "*": "allow",                    // 默认允许所有工具
  doom_loop: "ask",                // 防止死循环
  external_directory: {
    "*": "ask",                    // 外部目录需确认
    // 截断目录允许
  },
  question: "deny",                // 默认禁止提问
  plan_enter: "deny",              // 默认禁止进入计划模式
  plan_exit: "deny",               // 默认禁止退出计划模式
  read: {
    "*": "allow",
    "*.env": "ask",                // .env 文件需确认
    "*.env.*": "ask",
    "*.env.example": "allow",      // 示例文件允许
  },
}
```

## 各 Agent 权限配置

### Build Agent

```typescript
{
  ...defaults,
  question: "allow",
  plan_enter: "allow",
}
```

### Plan Agent

```typescript
{
  ...defaults,
  question: "allow",
  plan_exit: "allow",
  edit: {
    "*": "deny",
    ".opencode/plans/*.md": "allow",
  },
}
```

### Explore Agent

```typescript
{
  ...defaults,
  "*": "deny",
  grep: "allow",
  glob: "allow",
  list: "allow",
  bash: "allow",
  webfetch: "allow",
  websearch: "allow",
  codesearch: "allow",
  read: "allow",
}
```

### General Agent

```typescript
{
  ...defaults,
  todoread: "deny",
  todowrite: "deny",
}
```

## 用户自定义权限

用户可以在配置文件中覆盖默认权限：

```yaml
# opencode.yaml
permission:
  bash: "ask"                      # 所有 bash 命令需确认
  edit:
    "*": "allow"
    "*.lock": "deny"               # 禁止编辑 lock 文件
  read:
    "*.env": "deny"                # 禁止读取 .env 文件
```

## 权限请求流程

```
1. 工具调用触发权限检查
2. 评估规则集（Agent 规则 + 用户规则）
3. 根据动作：
   - allow: 继续执行
   - deny: 抛出 DeniedError
   - ask: 发送权限请求，等待用户响应
4. 用户响应：
   - once: 本次允许
   - always: 永久允许（添加到规则集）
   - reject: 拒绝，抛出 RejectedError
```

## 权限类型映射

| 工具 | 权限类型 |
|-----|---------|
| read | read |
| write | edit |
| edit | edit |
| patch | edit |
| multiedit | edit |
| bash | bash |
| glob | glob |
| grep | grep |
| task | task |
| question | question |
| todowrite | todowrite |
| todoread | todoread |

## 错误类型

```typescript
// 用户拒绝（无消息）- 停止执行
class RejectedError extends Error {
  message = "The user rejected permission to use this specific tool call."
}

// 用户拒绝（有消息）- 继续执行，带反馈
class CorrectedError extends Error {
  message = "The user rejected permission with feedback: ${message}"
}

// 规则自动拒绝 - 停止执行
class DeniedError extends Error {
  message = "The user has specified a rule which prevents you from using this tool."
  ruleset: Ruleset  // 相关规则
}
```

## NaughtAgent 适配说明

1. 简化权限模型，初期可只支持 `allow` 和 `ask`
2. 权限配置存储在项目配置文件中
3. 用户确认 UI 需要在 VS Code 插件中实现
4. 考虑添加"记住选择"功能
