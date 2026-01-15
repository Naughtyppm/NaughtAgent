# Behavior Spec: Read Tool

> 文件读取工具的行为规格

## Overview

| 属性 | 值 |
|------|-----|
| Tool ID | `read` |
| 权限类型 | `read` |
| 默认权限 | `allow`（敏感文件 `ask`） |

## Parameters

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| filePath | string | 是 | - | 文件路径（绝对或相对） |
| offset | number | 否 | 0 | 起始行号（0-based） |
| limit | number | 否 | 2000 | 读取行数 |

## Scenarios

### S1: 正常读取文件

```gherkin
Given 文件 "/path/to/file.txt" 存在且包含 100 行
When 调用 read(filePath: "/path/to/file.txt")
Then 返回文件内容，带行号前缀
And output 包含 "(End of file - total 100 lines)"
And metadata.totalLines = 100
And metadata.truncated = false
```

### S2: 读取部分内容

```gherkin
Given 文件 "/path/to/file.txt" 存在且包含 5000 行
When 调用 read(filePath: "/path/to/file.txt", offset: 1000, limit: 500)
Then 返回第 1001-1500 行内容
And output 包含 "(File has 5000 lines. Showing lines 1001-1500)"
And metadata.linesRead = 500
And metadata.truncated = true
```

### S3: 相对路径解析

```gherkin
Given ctx.cwd = "/workspace"
And 文件 "/workspace/src/index.ts" 存在
When 调用 read(filePath: "src/index.ts")
Then 读取 "/workspace/src/index.ts"
```

### S4: 长行截断

```gherkin
Given 文件包含超过 2000 字符的行
When 调用 read
Then 该行被截断为 2000 字符 + "..."
```

## Error Cases

### E1: 文件不存在

```gherkin
Given 文件 "/path/to/nonexistent.txt" 不存在
When 调用 read(filePath: "/path/to/nonexistent.txt")
Then 抛出 Error("File not found: /path/to/nonexistent.txt")
```

### E2: 路径是目录

```gherkin
Given "/path/to/dir" 是目录
When 调用 read(filePath: "/path/to/dir")
Then 抛出 Error("Path is a directory, not a file: /path/to/dir")
```

### E3: 二进制文件

```gherkin
Given 文件 "/path/to/image.png" 是二进制文件
When 调用 read(filePath: "/path/to/image.png")
Then 抛出 Error("Cannot read binary file: /path/to/image.png")
```

## Binary Detection

### 通过扩展名检测

以下扩展名直接判定为二进制：
- 压缩: `.zip`, `.tar`, `.gz`, `.7z`
- 可执行: `.exe`, `.dll`, `.so`, `.class`, `.jar`
- 图片: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.ico`
- 文档: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`
- 媒体: `.mp3`, `.mp4`, `.avi`, `.mov`, `.wav`
- 其他: `.bin`, `.dat`

### 通过内容检测

读取前 4KB：
- 包含 NULL 字节 (0x00) → 二进制
- 非打印字符比例 > 30% → 二进制

## Output Format

```
<file>
    1	第一行内容
    2	第二行内容
    3	第三行内容
...

(End of file - total N lines)
</file>
```

行号格式：5 位右对齐 + Tab + 内容

## Constraints

1. **最大行数**: 单次最多读取 2000 行
2. **最大行长**: 单行最多 2000 字符
3. **编码**: 仅支持 UTF-8
4. **符号链接**: 跟随符号链接

## Performance

- 小文件 (<1MB): 直接读取
- 大文件 (>1MB): 仍然全量读取后切片（未来可优化为流式）

## Security

- 敏感文件模式需要权限确认：
  - `**/.env*`
  - `**/*secret*`
  - `**/*credential*`
  - `**/*password*`
  - `**/id_rsa*`
