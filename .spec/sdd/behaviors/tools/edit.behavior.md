# Behavior Spec: Edit Tool

> 文件编辑工具的行为规格

## Overview

| 属性 | 值 |
|------|-----|
| Tool ID | `edit` |
| 权限类型 | `edit` |
| 默认权限 | `ask` |

## Parameters

| 参数 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| filePath | string | 是 | - | 文件路径 |
| oldString | string | 是 | - | 要替换的文本 |
| newString | string | 是 | - | 替换后的文本 |
| replaceAll | boolean | 否 | false | 是否替换所有匹配 |

## Scenarios

### S1: 单次替换

```gherkin
Given 文件内容为 "hello world"
When 调用 edit(oldString: "world", newString: "claude")
Then 文件内容变为 "hello claude"
And metadata.replacements = 1
```

### S2: 全部替换

```gherkin
Given 文件内容为 "foo bar foo baz foo"
When 调用 edit(oldString: "foo", newString: "qux", replaceAll: true)
Then 文件内容变为 "qux bar qux baz qux"
And metadata.replacements = 3
```

### S3: 多行替换

```gherkin
Given 文件内容为:
  """
  function old() {
    return 1
  }
  """
When 调用 edit(oldString: "function old() {\n  return 1\n}", newString: "function new() {\n  return 2\n}")
Then 文件内容变为:
  """
  function new() {
    return 2
  }
  """
```

### S4: 删除内容

```gherkin
Given 文件内容为 "hello world"
When 调用 edit(oldString: " world", newString: "")
Then 文件内容变为 "hello"
```

### S5: 插入内容

```gherkin
Given 文件内容为 "helloworld"
When 调用 edit(oldString: "hello", newString: "hello ")
Then 文件内容变为 "hello world"
```

## Error Cases

### E1: oldString 不存在

```gherkin
Given 文件内容为 "hello world"
When 调用 edit(oldString: "foo", newString: "bar")
Then 抛出 Error("oldString not found in file: /path/to/file")
```

### E2: 多个匹配但未指定 replaceAll

```gherkin
Given 文件内容为 "foo bar foo"
When 调用 edit(oldString: "foo", newString: "baz", replaceAll: false)
Then 抛出 Error("oldString found multiple times in file. Use replaceAll: true to replace all occurrences, or provide more context to make the match unique.")
```

### E3: oldString 和 newString 相同

```gherkin
Given 任意文件
When 调用 edit(oldString: "foo", newString: "foo")
Then 抛出 Error("oldString and newString must be different")
```

### E4: 文件不存在

```gherkin
Given 文件不存在
When 调用 edit
Then 抛出 Error("File not found: /path/to/file")
```

## Output Format

```
Edit applied successfully.

N replacement(s) made.

--- /path/to/file
+++ /path/to/file
@@ -1 +1 @@
-old content
+new content
```

## Diff Generation

简化的 diff 格式：
- `---` 和 `+++` 标记文件
- `@@` 标记变更位置
- `-` 前缀表示删除的行
- `+` 前缀表示添加的行

## Constraints

1. **精确匹配**: oldString 必须完全匹配，区分大小写
2. **编码**: UTF-8
3. **原子性**: 非原子操作
4. **空白敏感**: 空格、Tab、换行符都参与匹配

## Best Practices

### 提供足够上下文

```typescript
// 不好：可能匹配多处
edit({ oldString: "return", newString: "return null" })

// 好：提供完整上下文
edit({
  oldString: "function foo() {\n  return\n}",
  newString: "function foo() {\n  return null\n}"
})
```

### 处理缩进

```typescript
// 注意保持原有缩进
edit({
  oldString: "    const x = 1",  // 4 空格缩进
  newString: "    const x = 2"   // 保持 4 空格
})
```

### 多处修改

```typescript
// 如果需要修改多处相同内容，使用 replaceAll
edit({ oldString: "oldName", newString: "newName", replaceAll: true })

// 如果只想修改特定位置，提供更多上下文使其唯一
```

## Security

- 所有编辑操作默认需要用户确认
- 展示 diff 让用户预览变更
- 关键文件（配置、脚本）需特别注意
