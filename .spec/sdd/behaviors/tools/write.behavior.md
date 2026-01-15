# Behavior Spec: Write Tool

> 文件写入工具的行为规格

## Overview

| 属性 | 值 |
|------|-----|
| Tool ID | `write` |
| 权限类型 | `write` |
| 默认权限 | `ask` |

## Parameters

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| filePath | string | 是 | - | 文件路径（绝对或相对） |
| content | string | 是 | - | 要写入的内容 |

## Scenarios

### S1: 创建新文件

```gherkin
Given 文件 "/path/to/new.txt" 不存在
When 调用 write(filePath: "/path/to/new.txt", content: "hello")
Then 创建文件并写入内容
And output 包含 "Created file: /path/to/new.txt"
And metadata.existed = false
```

### S2: 覆盖已有文件

```gherkin
Given 文件 "/path/to/existing.txt" 已存在
When 调用 write(filePath: "/path/to/existing.txt", content: "new content")
Then 覆盖文件内容
And output 包含 "Updated file: /path/to/existing.txt"
And metadata.existed = true
```

### S3: 自动创建目录

```gherkin
Given 目录 "/path/to/deep/nested" 不存在
When 调用 write(filePath: "/path/to/deep/nested/file.txt", content: "hello")
Then 自动创建所有父目录
And 创建文件并写入内容
```

### S4: 相对路径解析

```gherkin
Given ctx.cwd = "/workspace"
When 调用 write(filePath: "src/new.ts", content: "export {}")
Then 写入到 "/workspace/src/new.ts"
```

### S5: 空内容

```gherkin
Given 任意路径
When 调用 write(filePath: "/path/to/empty.txt", content: "")
Then 创建空文件
And metadata.lines = 1
And metadata.bytes = 0
```

## Error Cases

### E1: 路径是已存在的目录

```gherkin
Given "/path/to/dir" 是已存在的目录
When 调用 write(filePath: "/path/to/dir", content: "hello")
Then 抛出 Error（EISDIR）
```

### E2: 无写入权限

```gherkin
Given 目录 "/readonly" 无写入权限
When 调用 write(filePath: "/readonly/file.txt", content: "hello")
Then 抛出 Error（EACCES）
```

### E3: 磁盘空间不足

```gherkin
Given 磁盘空间不足
When 调用 write
Then 抛出 Error（ENOSPC）
```

## Output Format

```
Created file: /path/to/file.txt

Wrote N lines (M bytes)
```

或

```
Updated file: /path/to/file.txt

Wrote N lines (M bytes)
```

## Constraints

1. **编码**: 始终使用 UTF-8
2. **原子性**: 非原子写入（未来可改为先写临时文件再 rename）
3. **权限**: 新文件使用系统默认权限
4. **换行符**: 保持 content 中的换行符不变

## Security

- 所有写操作默认需要用户确认
- 特别危险的路径应额外警告：
  - 系统目录: `/etc`, `/usr`, `C:\Windows`
  - 用户配置: `~/.bashrc`, `~/.ssh`
  - 项目关键文件: `package.json`, `.gitignore`

## Best Practices

1. **优先使用 edit**: 修改已有文件时，优先使用 edit 工具
2. **避免覆盖**: 写入前应先 read 确认文件状态
3. **备份建议**: 重要文件修改前建议用户备份
