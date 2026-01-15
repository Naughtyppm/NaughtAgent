# Interface Spec: Permission System

> 权限控制系统的接口规格

## Types

```typescript
/**
 * 权限类型
 */
type PermissionType = "read" | "write" | "edit" | "bash" | "question"

/**
 * 权限动作
 */
type PermissionAction = "allow" | "deny" | "ask"

/**
 * 权限规则
 */
interface PermissionRule {
  /** 权限类型 */
  type: PermissionType
  /** 默认动作 */
  action: PermissionAction
  /** 路径/命令匹配模式（glob 语法） */
  pattern?: string
}

/**
 * 权限集合
 */
interface PermissionSet {
  /** 规则列表，按优先级排序 */
  rules: PermissionRule[]
  /** 默认动作（无规则匹配时） */
  default: PermissionAction
}

/**
 * 权限检查请求
 */
interface PermissionRequest {
  /** 权限类型 */
  type: PermissionType
  /** 资源路径或命令 */
  resource: string
  /** 操作描述（用于展示） */
  description?: string
}

/**
 * 权限检查结果
 */
interface PermissionResult {
  /** 是否允许 */
  allowed: boolean
  /** 动作来源 */
  action: PermissionAction
  /** 匹配的规则（如果有） */
  matchedRule?: PermissionRule
  /** 需要用户确认 */
  needsConfirmation: boolean
}

/**
 * 用户确认回调
 */
type ConfirmationCallback = (request: PermissionRequest) => Promise<boolean>

/**
 * 权限检查器
 */
interface PermissionChecker {
  /** 检查权限 */
  check(request: PermissionRequest, permissions: PermissionSet): PermissionResult
  /** 执行权限检查（包含用户确认） */
  enforce(
    request: PermissionRequest,
    permissions: PermissionSet,
    onConfirm: ConfirmationCallback
  ): Promise<boolean>
}
```

## Permission Types

| 类型 | 适用工具 | 资源格式 |
|------|---------|---------|
| read | read | 文件路径 |
| write | write | 文件路径 |
| edit | edit | 文件路径 |
| bash | bash | 命令字符串 |
| question | question | 问题类型 |

## Default Permissions

### build Agent

```typescript
{
  rules: [
    // 敏感文件需确认
    { type: "read", action: "ask", pattern: "**/.env*" },
    { type: "read", action: "ask", pattern: "**/*secret*" },
    { type: "read", action: "ask", pattern: "**/*credential*" },
    // 写操作需确认
    { type: "write", action: "ask" },
    { type: "edit", action: "ask" },
    // 危险命令拒绝
    { type: "bash", action: "deny", pattern: "rm -rf *" },
    { type: "bash", action: "deny", pattern: "sudo *" },
    // 其他命令需确认
    { type: "bash", action: "ask" },
    // 读取默认允许
    { type: "read", action: "allow" },
  ],
  default: "ask"
}
```

### plan Agent

```typescript
{
  rules: [
    { type: "read", action: "allow" },
    { type: "write", action: "deny" },
    { type: "edit", action: "deny" },
    { type: "bash", action: "deny" },
  ],
  default: "deny"
}
```

### explore Agent

```typescript
{
  rules: [
    { type: "read", action: "allow" },
  ],
  default: "deny"
}
```

## Contracts

### PermissionRule

#### 前置条件

1. `type` 必须是有效的 PermissionType
2. `action` 必须是有效的 PermissionAction
3. `pattern` 如果存在，必须是有效的 glob 模式

### PermissionSet

#### 前置条件

1. `rules` 可以为空
2. `default` 必须是有效的 PermissionAction

#### 不变量

1. 规则按数组顺序匹配，第一个匹配的规则生效
2. 无规则匹配时使用 `default`

### PermissionChecker

#### check

**前置条件**:
1. `request.type` 必须有效
2. `request.resource` 必须非空

**后置条件**:
1. 返回的 `PermissionResult` 必须完整
2. `needsConfirmation` 为 true 当且仅当 `action === "ask"`

#### enforce

**前置条件**:
1. 同 `check`
2. `onConfirm` 必须是有效的回调函数

**后置条件**:
1. 返回 true 表示允许执行
2. 返回 false 表示拒绝执行
3. `action === "allow"` 时不调用 `onConfirm`
4. `action === "deny"` 时不调用 `onConfirm`
5. `action === "ask"` 时必须调用 `onConfirm`

## Pattern Matching

使用 glob 语法匹配：

| 模式 | 匹配 |
|------|------|
| `*` | 单层任意字符 |
| `**` | 多层目录 |
| `?` | 单个字符 |
| `[abc]` | 字符集 |
| `{a,b}` | 选择 |

### 示例

| 模式 | 匹配示例 |
|------|---------|
| `**/.env*` | `.env`, `.env.local`, `config/.env` |
| `src/**/*.ts` | `src/index.ts`, `src/lib/util.ts` |
| `rm -rf *` | `rm -rf /`, `rm -rf .` |

## Error Handling

| 错误场景 | 处理方式 |
|---------|---------|
| 无效的权限类型 | 抛出 Error |
| 无效的 glob 模式 | 抛出 Error |
| 用户确认超时 | 返回 false（拒绝） |
| 用户确认回调失败 | 抛出 Error |

## Security Considerations

1. **最小权限原则**: 默认 deny，显式 allow
2. **敏感文件保护**: .env, credentials 等需确认
3. **危险命令阻止**: rm -rf, sudo 等默认拒绝
4. **路径遍历防护**: 规范化路径后再匹配
5. **命令注入防护**: bash 命令需完整匹配
