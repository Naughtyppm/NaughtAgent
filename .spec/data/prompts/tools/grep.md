# Tool: Grep

> 来源: OpenCode `packages/opencode/src/tool/grep.ts` + `grep.txt`
> 许可证: MIT

## Description

- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\s+\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths and line numbers with at least one match sorted by modification time
- Use this tool when you need to find files containing specific patterns
- If you need to identify/count the number of matches within files, use the Bash tool with `rg` (ripgrep) directly. Do NOT use `grep`.
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| pattern | string | 是 | The regex pattern to search for |
| path | string | 否 | The directory to search in (defaults to cwd) |
| include | string | 否 | File pattern filter (e.g., "*.ts") |

## 使用示例

```
// 搜索函数定义
Grep({ pattern: "function\\s+handleSubmit" })

// 在特定文件类型中搜索
Grep({ pattern: "TODO:", include: "*.ts" })

// 搜索导入语句
Grep({ pattern: "import.*from\\s+['\"]react['\"]" })
```

## 权限

- 权限类型: `grep`
- 默认: `allow`
