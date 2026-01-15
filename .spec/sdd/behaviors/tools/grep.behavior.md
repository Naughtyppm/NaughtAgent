# Behavior Spec: Grep Tool

> 内容搜索工具的行为规格

## Overview

| 属性 | 值 |
|------|-----|
| Tool ID | `grep` |
| 权限类型 | `read` |
| 默认权限 | `allow` |

## Parameters

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| pattern | string | 是 | - | 正则表达式模式 |
| path | string | 否 | ctx.cwd | 搜索路径（文件或目录） |
| include | string | 否 | - | 文件名 glob 过滤 |
| ignoreCase | boolean | 否 | false | 忽略大小写 |
| maxResults | number | 否 | 100 | 最大结果数 |
| context | number | 否 | 0 | 上下文行数 |

## Scenarios

### S1: 基本搜索

```gherkin
Given 文件 "src/index.ts" 包含 "function hello"
When 调用 grep(pattern: "function hello")
Then 返回匹配的文件和行
And output 包含 "src/index.ts:N: function hello"
```

### S2: 正则表达式

```gherkin
Given 文件包含 "const foo = 1" 和 "let bar = 2"
When 调用 grep(pattern: "(const|let)\\s+\\w+")
Then 匹配两行
```

### S3: 忽略大小写

```gherkin
Given 文件包含 "Hello" 和 "HELLO"
When 调用 grep(pattern: "hello", ignoreCase: true)
Then 匹配两处
```

### S4: 文件过滤

```gherkin
Given 目录包含 .ts 和 .js 文件
When 调用 grep(pattern: "import", include: "*.ts")
Then 只搜索 .ts 文件
```

### S5: 上下文行

```gherkin
Given 文件内容:
  line 1
  line 2
  match here
  line 4
  line 5
When 调用 grep(pattern: "match", context: 1)
Then output 包含:
  line 2
  match here
  line 4
```

### S6: 搜索单个文件

```gherkin
Given path 指向单个文件
When 调用 grep(pattern: "foo", path: "/path/to/file.ts")
Then 只搜索该文件
```

## Output Format

### 基本格式

```
Found N match(es) in M file(s):

path/to/file1.ts
  10: matching line content
  25: another match

path/to/file2.ts
  5: match in second file
```

### 带上下文

```
path/to/file.ts
  8- context before
  9- context before
  10: matching line
  11- context after
  12- context after
```

### 无结果

```
No matches found for pattern: <pattern>
```

### 截断

```
Found 150 match(es) in 30 file(s):

... (showing first 100 matches)

path/to/file.ts
  10: match
...
```

## Default Ignores

搜索目录时忽略：

```typescript
[
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/*.min.js",
  "**/*.bundle.js",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
]
```

## Binary File Handling

```gherkin
Given 文件是二进制文件
When grep 遍历到该文件
Then 跳过该文件（不报错）
```

## Error Cases

### E1: 无效的正则表达式

```gherkin
Given pattern = "[invalid"
When 调用 grep
Then 抛出 Error("Invalid regular expression: ...")
```

### E2: 路径不存在

```gherkin
Given path 不存在
When 调用 grep
Then 抛出 Error("Path not found: ...")
```

## Constraints

1. **最大结果数**: 默认 100，可配置
2. **最大文件大小**: 跳过 > 1MB 的文件
3. **编码**: 仅搜索 UTF-8 文件
4. **行长限制**: 匹配行超过 500 字符时截断显示

## Regex Features

支持的正则特性（JavaScript RegExp）：

| 特性 | 示例 |
|------|------|
| 字符类 | `[a-z]`, `\d`, `\w`, `\s` |
| 量词 | `*`, `+`, `?`, `{n,m}` |
| 锚点 | `^`, `$`, `\b` |
| 分组 | `(...)`, `(?:...)` |
| 选择 | `a|b` |
| 转义 | `\.`, `\[`, `\\` |

## Performance

- 使用流式读取大文件
- 并行搜索多个文件
- 提前终止（达到 maxResults）

## Common Patterns

| 用途 | 模式 |
|------|------|
| 函数定义 | `function\s+\w+` |
| 类定义 | `class\s+\w+` |
| import 语句 | `^import\s+` |
| TODO 注释 | `//\s*TODO` |
| console.log | `console\.log` |
| 变量声明 | `(const|let|var)\s+\w+` |

## Best Practices

1. **转义特殊字符**: `.`, `[`, `(` 等需要转义
2. **使用 include**: 限定文件类型提高效率
3. **合理 maxResults**: 避免返回过多结果
4. **配合 glob**: 先 glob 找文件，再 grep 搜内容
