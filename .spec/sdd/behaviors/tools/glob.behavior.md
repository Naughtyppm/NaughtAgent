# Behavior Spec: Glob Tool

> 文件模式匹配工具的行为规格

## Overview

| 属性 | 值 |
|------|-----|
| Tool ID | `glob` |
| 权限类型 | `read` |
| 默认权限 | `allow` |

## Parameters

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| pattern | string | 是 | - | Glob 模式 |
| path | string | 否 | ctx.cwd | 搜索目录 |

## Scenarios

### S1: 基本匹配

```gherkin
Given 目录结构:
  /workspace/
    src/
      index.ts
      util.ts
    test/
      index.test.ts
When 调用 glob(pattern: "**/*.ts")
Then 返回所有 .ts 文件
And metadata.count = 3
```

### S2: 指定目录

```gherkin
Given ctx.cwd = "/workspace"
When 调用 glob(pattern: "*.ts", path: "src")
Then 只搜索 /workspace/src 目录
And 返回 src 下的 .ts 文件
```

### S3: 无匹配结果

```gherkin
Given 目录中没有 .xyz 文件
When 调用 glob(pattern: "**/*.xyz")
Then output = "No files found matching pattern: **/*.xyz"
And metadata.count = 0
```

### S4: 结果排序

```gherkin
Given 多个文件有不同的修改时间
When 调用 glob
Then 结果按修改时间降序排列（最新的在前）
```

### S5: 结果截断

```gherkin
Given 匹配结果超过 500 个文件
When 调用 glob
Then 只返回前 500 个
And output 包含 "... (N more files not shown)"
And metadata.truncated = true
```

## Glob Patterns

| 模式 | 说明 | 示例匹配 |
|------|------|---------|
| `*` | 匹配单层任意字符 | `*.ts` → `index.ts` |
| `**` | 匹配多层目录 | `**/*.ts` → `src/lib/util.ts` |
| `?` | 匹配单个字符 | `?.ts` → `a.ts` |
| `[abc]` | 字符集 | `[abc].ts` → `a.ts`, `b.ts` |
| `[a-z]` | 字符范围 | `[a-z].ts` → `x.ts` |
| `{a,b}` | 选择 | `*.{ts,js}` → `index.ts`, `index.js` |
| `!` | 否定（在 ignore 中） | `!*.test.ts` |

## Default Ignores

以下目录默认被忽略：

```typescript
[
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
]
```

## Output Format

有结果：
```
Found N file(s):

relative/path/to/file1.ts
relative/path/to/file2.ts
...
```

无结果：
```
No files found matching pattern: **/*.xyz
```

截断：
```
Found 600 file(s):

file1.ts
file2.ts
... (前 500 个)

... (100 more files not shown)
```

## Constraints

1. **最大结果数**: 500 个文件
2. **只匹配文件**: 不返回目录
3. **不跟随符号链接**: `followSymbolicLinks: false`
4. **相对路径输出**: 输出相对于搜索目录的路径

## Error Cases

### E1: 无效的 glob 模式

```gherkin
Given pattern 包含无效语法
When 调用 glob
Then 抛出 Error（fast-glob 错误）
```

### E2: 搜索目录不存在

```gherkin
Given path 指向不存在的目录
When 调用 glob
Then 返回空结果（不抛错）
And metadata.count = 0
```

## Performance

- 使用 `fast-glob` 库
- 并行遍历目录
- 默认忽略大型目录（node_modules 等）

## Common Patterns

| 用途 | 模式 |
|------|------|
| 所有 TypeScript 文件 | `**/*.ts` |
| 所有测试文件 | `**/*.test.ts` 或 `**/*.spec.ts` |
| src 目录下的 JS/TS | `src/**/*.{js,ts}` |
| 配置文件 | `*.config.{js,ts,json}` |
| Markdown 文档 | `**/*.md` |
| 排除测试 | `src/**/!(*test).ts` |

## Best Practices

1. **具体模式**: 使用具体的模式减少结果数量
2. **限定目录**: 指定 path 参数缩小搜索范围
3. **组合使用**: 与 grep 配合进行内容搜索
