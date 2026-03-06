# 安全与权限层

安全与权限层控制 Agent 的操作边界，保护用户系统安全。

## 1. 权限模式

### 三级权限模式

| 模式 | 读文件 | 写文件 | 执行命令 | 适用场景 |
|------|--------|--------|---------|---------|
| ask | ✅ 自动 | ⚠️ 询问 | ⚠️ 询问 | 日常使用，安全优先 |
| allow | ✅ 自动 | ✅ 自动 | ✅ 自动 | 信任场景，效率优先 |
| sandbox | ✅ 自动 | ✅ 沙箱内 | ✅ 沙箱内 | 实验场景 |

### 权限检查流程

```typescript
// permission/permission.ts
interface PermissionRequest {
  type: PermissionType       // read | write | edit | bash | glob | grep
  resource: string           // 文件路径或命令
  description?: string       // 用于展示
}

interface PermissionResult {
  allowed: boolean
  action: PermissionAction   // allow | deny | ask
  needsConfirmation: boolean
}

function checkPermission(
  request: PermissionRequest,
  permissions: PermissionSet
): PermissionResult
```

### 细粒度规则

```typescript
interface PermissionRule {
  type: PermissionType
  action: PermissionAction
  pattern?: string           // glob 模式匹配
}

// 示例：build 模式的默认规则
const buildPermissions: PermissionSet = {
  rules: [
    // 敏感文件需确认
    { type: "read", action: "ask", pattern: "**/.env*" },
    { type: "read", action: "ask", pattern: "**/*secret*" },
    // 写操作需确认
    { type: "write", action: "ask" },
    { type: "edit", action: "ask" },
    // 危险命令拒绝
    { type: "bash", action: "deny", pattern: "rm -rf *" },
    { type: "bash", action: "deny", pattern: "sudo *" },
    // 其他命令需确认
    { type: "bash", action: "ask" },
    // 读取和搜索默认允许
    { type: "read", action: "allow" },
    { type: "glob", action: "allow" },
    { type: "grep", action: "allow" },
  ],
  default: "ask",
}
```

## 2. 安全检查

### 路径安全检查

```typescript
// security/security.ts
interface PathCheckResult {
  safe: boolean
  reason?: string
  normalizedPath: string
}

interface SecurityChecker {
  checkPath(filePath: string): PathCheckResult
  checkCommand(command: string): CommandCheckResult
}
```

### 检查项

| 检查项 | 说明 | 处理 |
|--------|------|------|
| 路径遍历 | `../` 尝试逃逸工作目录 | 拒绝 |
| 符号链接 | 指向工作目录外的链接 | 警告 |
| 绝对路径 | 访问工作目录外的绝对路径 | 拒绝 |
| 敏感文件 | `.env`、`credentials` 等 | 询问 |

### 命令安全检查

| 危险命令 | 处理 |
|----------|------|
| `rm -rf /` | 拒绝 |
| `rm -rf *` | 拒绝 |
| `sudo *` | 拒绝 |
| `chmod 777` | 警告 |
| `curl \| bash` | 警告 |

## 3. 沙箱执行（待实现）

### 设计方案

```
┌─────────────────────────────────────┐
│           Host System               │
│  ┌───────────────────────────────┐  │
│  │      Docker Container         │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │    Agent Process        │  │  │
│  │  │  - 只读挂载项目目录      │  │  │
│  │  │  - 写入到临时目录        │  │  │
│  │  │  - 网络隔离              │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### 沙箱能力

| 能力 | 说明 |
|------|------|
| 文件系统隔离 | 写入到临时目录，不影响真实文件 |
| 网络隔离 | 禁止或限制网络访问 |
| 进程隔离 | 限制可执行的命令 |
| 资源限制 | CPU、内存、磁盘配额 |

### 沙箱退出

用户确认后，将沙箱内的修改同步到真实文件系统。

## 4. 关键文件索引

| 文件 | 职责 |
|------|------|
| `permission/permission.ts` | 权限检查、规则匹配 |
| `security/security.ts` | 安全检查器 |

## 5. 待实现功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| Docker 沙箱 | P1 | 容器级隔离 |
| 网络白名单 | P2 | 限制可访问的域名 |
| 审计日志 | P2 | 记录所有敏感操作 |
| 代码注入检测 | P3 | 检测恶意代码模式 |
