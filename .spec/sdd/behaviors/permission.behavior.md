# Behavior Spec: Permission System

> 权限系统的行为规格

## Overview

权限系统控制 Agent 对资源的访问，确保用户对敏感操作有控制权。

## Core Behaviors

### B1: 规则匹配顺序

```gherkin
Given 权限规则列表 [R1, R2, R3]
When 检查权限
Then 按顺序匹配，第一个匹配的规则生效
And 无规则匹配时使用 default
```

### B2: Allow 动作

```gherkin
Given 规则 { type: "read", action: "allow" }
When 请求 read 权限
Then 直接允许，不询问用户
And 返回 { allowed: true, needsConfirmation: false }
```

### B3: Deny 动作

```gherkin
Given 规则 { type: "bash", action: "deny", pattern: "rm -rf *" }
When 请求执行 "rm -rf /"
Then 直接拒绝，不询问用户
And 返回 { allowed: false, needsConfirmation: false }
```

### B4: Ask 动作

```gherkin
Given 规则 { type: "write", action: "ask" }
When 请求 write 权限
Then 需要用户确认
And 返回 { allowed: undefined, needsConfirmation: true }
And 调用 onConfirm 回调
```

### B5: 模式匹配

```gherkin
Given 规则 { type: "read", action: "ask", pattern: "**/.env*" }
When 请求读取 "/project/.env.local"
Then 模式匹配成功
And 需要用户确认
```

```gherkin
Given 同样的规则
When 请求读取 "/project/src/index.ts"
Then 模式不匹配
And 继续检查下一条规则
```

## Pattern Matching

### 文件路径匹配

使用 glob 语法：

```typescript
// 匹配所有 .env 文件
{ pattern: "**/.env*" }
// 匹配: .env, .env.local, config/.env.production

// 匹配特定目录
{ pattern: "src/**/*.ts" }
// 匹配: src/index.ts, src/lib/util.ts

// 匹配多种扩展名
{ pattern: "**/*.{ts,tsx}" }
```

### 命令匹配

使用简化的通配符：

```typescript
// 精确匹配
{ pattern: "rm -rf /" }

// 前缀匹配
{ pattern: "sudo *" }
// 匹配: sudo apt install, sudo rm file

// 包含匹配
{ pattern: "* | sh" }
// 匹配: curl url | sh, wget url | sh
```

## Permission Flow

```
┌─────────────────┐
│ Permission      │
│ Request         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Match Rules     │──── No Match ────┐
└────────┬────────┘                  │
         │ Match                     │
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│ Get Action      │         │ Use Default     │
└────────┬────────┘         └────────┬────────┘
         │                           │
         ▼                           ▼
    ┌────┴────┬────────────────┬────┴────┐
    │         │                │         │
    ▼         ▼                ▼         ▼
 [allow]   [deny]           [ask]    [default]
    │         │                │         │
    ▼         ▼                ▼         ▼
 Return    Return          Prompt     Depends
 true      false           User       on value
```

## User Confirmation

### 确认对话框内容

```
┌─────────────────────────────────────────┐
│ Permission Required                      │
├─────────────────────────────────────────┤
│ Action: Write file                       │
│ Resource: /project/src/index.ts          │
│ Description: Update import statement     │
│                                          │
│ [Allow]  [Allow All]  [Deny]  [Deny All] │
└─────────────────────────────────────────┘
```

### 确认选项

| 选项 | 行为 |
|------|------|
| Allow | 允许本次操作 |
| Allow All | 允许同类型所有操作（本会话） |
| Deny | 拒绝本次操作 |
| Deny All | 拒绝同类型所有操作（本会话） |

### 超时处理

```gherkin
Given 用户确认超时（默认 5 分钟）
When 超时发生
Then 默认拒绝
And 返回 { allowed: false }
```

## Session-Level Permissions

### 临时规则

用户选择 "Allow All" 或 "Deny All" 时，添加临时规则：

```typescript
// Allow All for write
session.tempRules.push({
  type: "write",
  action: "allow",
  // 无 pattern，匹配所有 write
})

// Deny All for bash
session.tempRules.push({
  type: "bash",
  action: "deny",
})
```

### 规则优先级

```
1. Session 临时规则（最高）
2. Agent 定义的规则
3. 全局默认规则（最低）
```

## Error Handling

### E1: 无效的权限类型

```gherkin
Given request.type = "invalid"
When 检查权限
Then 抛出 Error("Invalid permission type: invalid")
```

### E2: 无效的 glob 模式

```gherkin
Given rule.pattern = "[invalid"
When 编译规则
Then 抛出 Error("Invalid glob pattern: [invalid")
```

### E3: 确认回调失败

```gherkin
Given onConfirm 抛出异常
When 执行确认
Then 默认拒绝
And 记录错误日志
```

## Security Invariants

1. **默认安全**: 无规则时默认 `ask` 或 `deny`
2. **不可绕过**: 权限检查在工具执行前强制执行
3. **审计日志**: 所有权限决策都应记录
4. **最小权限**: Agent 只能访问其定义允许的资源

## Agent Permission Presets

### build

```typescript
{
  rules: [
    { type: "read", action: "ask", pattern: "**/.env*" },
    { type: "read", action: "ask", pattern: "**/*secret*" },
    { type: "read", action: "allow" },
    { type: "write", action: "ask" },
    { type: "edit", action: "ask" },
    { type: "bash", action: "deny", pattern: "rm -rf *" },
    { type: "bash", action: "deny", pattern: "sudo *" },
    { type: "bash", action: "ask" },
  ],
  default: "ask"
}
```

### plan

```typescript
{
  rules: [
    { type: "read", action: "allow" },
  ],
  default: "deny"
}
```

### explore

```typescript
{
  rules: [
    { type: "read", action: "allow" },
  ],
  default: "deny"
}
```

## Metrics

应收集的指标：

- 权限请求总数（按类型）
- Allow/Deny/Ask 分布
- 用户确认响应时间
- 用户确认结果分布
