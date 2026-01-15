# Interface Spec: Security 安全系统

> 路径限制、命令黑名单、安全检查

## 概述

安全系统负责：
1. 限制文件访问范围（只能访问项目目录内）
2. 过滤危险命令
3. 检测潜在的安全风险

## 为什么需要安全系统

Agent 有能力执行任意文件操作和命令，如果不加限制：
- 可能读取敏感文件（~/.ssh/id_rsa, /etc/passwd）
- 可能执行危险命令（rm -rf /, sudo）
- 可能访问项目外的文件

## Types

```typescript
/**
 * 路径检查结果
 */
interface PathCheckResult {
  /** 是否允许 */
  allowed: boolean
  /** 规范化后的路径 */
  normalizedPath: string
  /** 拒绝原因（如果不允许） */
  reason?: string
}

/**
 * 命令检查结果
 */
interface CommandCheckResult {
  /** 是否允许 */
  allowed: boolean
  /** 拒绝原因（如果不允许） */
  reason?: string
  /** 匹配的黑名单规则 */
  matchedRule?: string
  /** 风险等级 */
  riskLevel: "safe" | "warning" | "danger"
}

/**
 * 安全配置
 */
interface SecurityConfig {
  /** 项目根目录 */
  projectRoot: string
  /** 允许访问的额外目录 */
  allowedPaths?: string[]
  /** 禁止访问的路径模式 */
  deniedPaths?: string[]
  /** 额外的命令黑名单 */
  deniedCommands?: string[]
  /** 允许的命令白名单（如果设置，只允许这些命令） */
  allowedCommands?: string[]
}

/**
 * 安全检查器
 */
interface SecurityChecker {
  /** 检查路径是否允许访问 */
  checkPath(filePath: string): PathCheckResult

  /** 检查命令是否允许执行 */
  checkCommand(command: string): CommandCheckResult

  /** 规范化路径 */
  normalizePath(filePath: string): string

  /** 检查路径是否在项目内 */
  isInsideProject(filePath: string): boolean
}
```

## 路径限制

### 规则

1. **默认只允许项目目录内的文件**
2. **禁止路径遍历**（`../` 不能逃出项目）
3. **禁止访问敏感文件**

### 敏感路径（默认禁止）

```typescript
const SENSITIVE_PATHS = [
  // SSH 密钥
  "**/.ssh/**",
  "**/.gnupg/**",

  // 环境变量和密钥
  "**/.env",
  "**/.env.*",
  "**/*secret*",
  "**/*credential*",
  "**/*password*",
  "**/secrets/**",

  // 系统文件
  "/etc/passwd",
  "/etc/shadow",
  "/etc/hosts",

  // 浏览器数据
  "**/Chrome/**",
  "**/Firefox/**",
  "**/.mozilla/**",

  // 其他敏感
  "**/.aws/**",
  "**/.kube/**",
  "**/.docker/**",
]
```

### 路径检查流程

```typescript
function checkPath(filePath: string, config: SecurityConfig): PathCheckResult {
  // 1. 规范化路径（解析 ../ 等）
  const normalized = normalizePath(filePath, config.projectRoot)

  // 2. 检查是否在项目内
  if (!isInsideProject(normalized, config.projectRoot)) {
    // 检查是否在允许的额外目录
    if (!isInAllowedPaths(normalized, config.allowedPaths)) {
      return {
        allowed: false,
        normalizedPath: normalized,
        reason: "Path is outside project directory"
      }
    }
  }

  // 3. 检查是否匹配敏感路径
  if (matchesSensitivePath(normalized)) {
    return {
      allowed: false,
      normalizedPath: normalized,
      reason: "Access to sensitive file is not allowed"
    }
  }

  // 4. 检查自定义禁止路径
  if (matchesDeniedPath(normalized, config.deniedPaths)) {
    return {
      allowed: false,
      normalizedPath: normalized,
      reason: "Path is in denied list"
    }
  }

  return { allowed: true, normalizedPath: normalized }
}
```

## 命令黑名单

### 危险命令（默认禁止）

```typescript
const DANGEROUS_COMMANDS = [
  // 删除类
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~",
  "rm -rf $HOME",
  "rmdir /",

  // 权限提升
  "sudo *",
  "su *",
  "doas *",

  // 系统修改
  "chmod 777 *",
  "chown *",
  "mkfs*",
  "dd if=*",
  "format *",

  // 网络危险
  "curl * | sh",
  "curl * | bash",
  "wget * | sh",
  "wget * | bash",

  // 进程控制
  "kill -9 1",
  "killall *",
  "pkill *",

  // 历史/配置修改
  "history -c",
  "> ~/.bash_history",
  "shred *",

  // Windows 危险命令
  "format c:",
  "del /f /s /q c:\\*",
  "rd /s /q c:\\",
]
```

### 警告命令（需要确认）

```typescript
const WARNING_COMMANDS = [
  // 删除类（非根目录）
  "rm -rf *",
  "rm -r *",
  "rmdir *",

  // 权限修改
  "chmod *",

  // Git 危险操作
  "git reset --hard",
  "git clean -fd",
  "git push --force",
  "git push -f",

  // 包管理全局安装
  "npm install -g *",
  "pnpm add -g *",
  "yarn global add *",

  // 环境变量
  "export *",
  "set *",
]
```

### 命令检查流程

```typescript
function checkCommand(command: string, config: SecurityConfig): CommandCheckResult {
  const normalized = normalizeCommand(command)

  // 1. 检查白名单（如果设置）
  if (config.allowedCommands) {
    if (!matchesAllowedCommand(normalized, config.allowedCommands)) {
      return {
        allowed: false,
        reason: "Command not in allowed list",
        riskLevel: "danger"
      }
    }
  }

  // 2. 检查危险命令
  const dangerMatch = matchesDangerousCommand(normalized)
  if (dangerMatch) {
    return {
      allowed: false,
      reason: "Command is dangerous",
      matchedRule: dangerMatch,
      riskLevel: "danger"
    }
  }

  // 3. 检查自定义黑名单
  const deniedMatch = matchesDeniedCommand(normalized, config.deniedCommands)
  if (deniedMatch) {
    return {
      allowed: false,
      reason: "Command is in denied list",
      matchedRule: deniedMatch,
      riskLevel: "danger"
    }
  }

  // 4. 检查警告命令
  const warningMatch = matchesWarningCommand(normalized)
  if (warningMatch) {
    return {
      allowed: true,  // 允许但警告
      matchedRule: warningMatch,
      riskLevel: "warning"
    }
  }

  return { allowed: true, riskLevel: "safe" }
}
```

## 接口

```typescript
/**
 * 创建安全检查器
 */
function createSecurityChecker(config: SecurityConfig): SecurityChecker

/**
 * 检查路径
 */
function checkPath(filePath: string, projectRoot: string): PathCheckResult

/**
 * 检查命令
 */
function checkCommand(command: string): CommandCheckResult

/**
 * 规范化路径
 */
function normalizePath(filePath: string, basePath: string): string

/**
 * 检查是否在目录内
 */
function isInsidePath(filePath: string, directory: string): boolean
```

## 与现有系统集成

### 在工具执行前检查

```typescript
// read/write/edit 工具
async execute(params, ctx) {
  const security = createSecurityChecker({ projectRoot: ctx.cwd })
  const check = security.checkPath(params.filePath)

  if (!check.allowed) {
    return {
      output: `Error: ${check.reason}`,
      metadata: { blocked: true, reason: check.reason }
    }
  }

  // 继续执行...
}

// bash 工具
async execute(params, ctx) {
  const check = checkCommand(params.command)

  if (!check.allowed) {
    return {
      output: `Error: ${check.reason}`,
      metadata: { blocked: true, reason: check.reason }
    }
  }

  if (check.riskLevel === "warning") {
    // 需要用户确认
  }

  // 继续执行...
}
```

### 与 Permission 系统配合

```
请求执行操作
    │
    ▼
Security.check()  ← 安全检查（硬性限制）
    │
    ├─ 不允许 → 直接拒绝
    │
    └─ 允许 → Permission.check()  ← 权限检查（用户配置）
                │
                ├─ deny → 拒绝
                ├─ ask → 询问用户
                └─ allow → 执行
```

## 错误处理

| 场景 | 处理 |
|------|------|
| 路径不存在 | 允许（由工具处理） |
| 路径解析失败 | 拒绝 |
| 命令解析失败 | 拒绝 |
| 符号链接指向外部 | 拒绝 |
