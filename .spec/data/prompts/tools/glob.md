# Tool: Glob

> 来源: OpenCode `packages/opencode/src/tool/glob.ts` + `glob.txt`
> 许可证: MIT

## Description

- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| pattern | string | 是 | The glob pattern to match (e.g., "**/*.ts") |
| path | string | 否 | The directory to search in (defaults to cwd) |

## 使用示例

```
// 查找所有 TypeScript 文件
Glob({ pattern: "**/*.ts" })

// 查找 src 目录下的组件
Glob({ pattern: "src/components/**/*.tsx" })

// 查找配置文件
Glob({ pattern: "*.config.{js,ts,json}" })
```

## 权限

- 权限类型: `glob`
- 默认: `allow`
