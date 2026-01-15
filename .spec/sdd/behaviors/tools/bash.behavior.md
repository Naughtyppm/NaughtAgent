# Behavior Spec: Bash Tool

> 命令执行工具的行为规格

## Overview

| 属性 | 值 |
|------|-----|
| Tool ID | `bash` |
| 权限类型 | `bash` |
| 默认权限 | `ask` |

## Parameters

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| command | string | 是 | - | 要执行的命令 |
| workdir | string | 否 | ctx.cwd | 工作目录 |
| timeout | number | 否 | 120000 | 超时时间（毫秒） |
| description | string | 否 | - | 命令描述 |

## Scenarios

### S1: 正常执行命令

```gherkin
Given ctx.cwd = "/workspace"
When 调用 bash(command: "echo hello")
Then 返回 output = "hello\n"
And metadata.exitCode = 0
```

### S2: 指定工作目录

```gherkin
Given 目录 "/other/path" 存在
When 调用 bash(command: "pwd", workdir: "/other/path")
Then output 包含 "/other/path"
And metadata.cwd = "/other/path"
```

### S3: 命令失败

```gherkin
Given 命令会失败
When 调用 bash(command: "exit 1")
Then output 包含 "[Exit code: 1]"
And metadata.exitCode = 1
```

### S4: 超时处理

```gherkin
Given timeout = 1000
When 调用 bash(command: "sleep 10", timeout: 1000)
Then 命令被终止
And output 包含 "[Command timed out after 1000ms]"
And metadata.timedOut = true
```

### S5: 取消执行

```gherkin
Given 命令正在执行
When ctx.abort 被触发
Then 命令被终止
And output 包含 "[Command was cancelled]"
```

### S6: 合并 stdout 和 stderr

```gherkin
Given 命令同时输出到 stdout 和 stderr
When 调用 bash(command: "echo out; echo err >&2")
Then output 包含 "out" 和 "err"
```

## Platform Behavior

### Windows

```typescript
shell: "powershell.exe"
args: ["-NoProfile", "-Command"]
```

### Unix (Linux/macOS)

```typescript
shell: process.env.SHELL || "/bin/sh"
args: ["-c"]
```

## Error Cases

### E1: 命令不存在

```gherkin
Given 命令 "nonexistent_command" 不存在
When 调用 bash(command: "nonexistent_command")
Then output 包含错误信息（shell 报告）
And metadata.exitCode != 0
```

### E2: 工作目录不存在

```gherkin
Given 目录 "/nonexistent" 不存在
When 调用 bash(command: "ls", workdir: "/nonexistent")
Then 抛出 Error
```

### E3: 权限不足

```gherkin
Given 命令需要更高权限
When 调用 bash(command: "cat /etc/shadow")
Then output 包含权限错误
And metadata.exitCode != 0
```

## Output Format

正常输出：
```
命令输出内容
```

带状态信息：
```
命令输出内容

[Exit code: N]
```

超时：
```
部分输出...

[Command timed out after Nms]
```

无输出：
```
(no output)
```

## Constraints

1. **最大输出**: 100KB，超出截断
2. **默认超时**: 120 秒
3. **环境变量**: 继承当前进程环境，设置 `TERM=dumb`
4. **stdin**: 忽略（不支持交互式命令）

## Output Truncation

```gherkin
Given 命令输出超过 100KB
When 命令执行完成
Then output 被截断为 100KB
And output 末尾添加 "... (output truncated)"
And metadata.truncated = true
```

## Security

### 默认拒绝的命令模式

```typescript
[
  "rm -rf *",
  "rm -rf /",
  "rm -rf ~",
  "sudo *",
  "su *",
  "chmod 777 *",
  "curl * | sh",
  "wget * | sh",
  "> /dev/sda",
  "mkfs.*",
  "dd if=*",
  ":(){ :|:& };:",  // fork bomb
]
```

### 需要确认的命令模式

```typescript
[
  "rm *",
  "mv *",
  "cp *",
  "chmod *",
  "chown *",
  "git push *",
  "git reset --hard *",
  "npm publish",
  "docker *",
]
```

### 默认允许的命令模式

```typescript
[
  "ls *",
  "cat *",
  "head *",
  "tail *",
  "grep *",
  "find *",
  "echo *",
  "pwd",
  "whoami",
  "date",
  "git status",
  "git log *",
  "git diff *",
  "npm list",
  "node --version",
]
```

## Process Management

1. **信号处理**:
   - 超时时先发 SIGTERM
   - 5 秒后若未退出发 SIGKILL

2. **子进程**:
   - 命令启动的子进程可能不会被终止
   - 建议使用 process group（未来优化）

3. **资源限制**:
   - 当前无 CPU/内存限制
   - 未来可考虑使用 cgroups (Linux)

## Best Practices

1. **描述命令**: 使用 description 参数说明命令用途
2. **避免交互**: 不要使用需要用户输入的命令
3. **检查退出码**: 根据 exitCode 判断成功/失败
4. **合理超时**: 长时间命令设置适当的 timeout
