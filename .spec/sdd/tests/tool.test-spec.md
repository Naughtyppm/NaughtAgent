# Test Spec: Tool System

> 工具系统的测试规格

## Coverage Requirements

### 最低覆盖率

| 类型 | 要求 |
|------|------|
| 语句覆盖 | 80% |
| 分支覆盖 | 75% |
| 函数覆盖 | 90% |

### 必须覆盖的场景

1. 所有正常路径 (Happy Path)
2. 所有错误场景 (Error Cases)
3. 边界条件 (Boundary Conditions)
4. 参数验证 (Parameter Validation)

## Test Structure

```
packages/agent/
├── src/tool/
│   ├── read.ts
│   ├── write.ts
│   └── ...
└── test/tool/
    ├── read.test.ts
    ├── write.test.ts
    ├── fixtures/          # 测试数据
    │   ├── sample.txt
    │   └── binary.png
    └── helpers/           # 测试工具
        └── context.ts
```

## Test Case Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Tool } from "../../src/tool/tool"
import { ReadTool } from "../../src/tool/read"
import { createTestContext, createTempFile, cleanup } from "../helpers/context"

describe("ReadTool", () => {
  let ctx: Tool.Context

  beforeEach(() => {
    ctx = createTestContext()
  })

  afterEach(async () => {
    await cleanup()
  })

  describe("正常场景", () => {
    it("should read file content with line numbers", async () => {
      // Arrange
      const filePath = await createTempFile("line1\nline2\nline3")

      // Act
      const result = await ReadTool.execute({ filePath }, ctx)

      // Assert
      expect(result.output).toContain("1\tline1")
      expect(result.output).toContain("2\tline2")
      expect(result.metadata?.totalLines).toBe(3)
    })
  })

  describe("错误场景", () => {
    it("should throw for non-existent file", async () => {
      await expect(
        ReadTool.execute({ filePath: "/nonexistent" }, ctx)
      ).rejects.toThrow("File not found")
    })
  })
})
```

## Tool Test Cases

### Read Tool

| ID | 场景 | 输入 | 预期结果 |
|----|------|------|---------|
| R01 | 读取普通文件 | 存在的文本文件 | 返回带行号的内容 |
| R02 | 读取部分内容 | offset=10, limit=5 | 返回第 11-15 行 |
| R03 | 读取空文件 | 空文件 | 返回空内容，totalLines=1 |
| R04 | 相对路径 | 相对路径 | 解析为绝对路径后读取 |
| R05 | 长行截断 | 行长 > 2000 | 截断并添加 "..." |
| R06 | 文件不存在 | 不存在的路径 | 抛出 FILE_NOT_FOUND |
| R07 | 路径是目录 | 目录路径 | 抛出 PATH_IS_DIRECTORY |
| R08 | 二进制文件 | .png 文件 | 抛出 BINARY_FILE |
| R09 | 大文件 | > 2000 行 | truncated=true |

### Write Tool

| ID | 场景 | 输入 | 预期结果 |
|----|------|------|---------|
| W01 | 创建新文件 | 不存在的路径 | 创建文件，existed=false |
| W02 | 覆盖文件 | 已存在的路径 | 覆盖内容，existed=true |
| W03 | 自动创建目录 | 深层路径 | 创建所有父目录 |
| W04 | 空内容 | content="" | 创建空文件 |
| W05 | 路径是目录 | 目录路径 | 抛出 EISDIR |

### Edit Tool

| ID | 场景 | 输入 | 预期结果 |
|----|------|------|---------|
| E01 | 单次替换 | 唯一匹配 | 替换成功，replacements=1 |
| E02 | 全部替换 | replaceAll=true | 替换所有匹配 |
| E03 | 多行替换 | 跨行的 oldString | 正确替换 |
| E04 | 删除内容 | newString="" | 删除匹配内容 |
| E05 | 未找到 | 不存在的 oldString | 抛出 NOT_FOUND |
| E06 | 多个匹配 | 多处匹配，replaceAll=false | 抛出 MULTIPLE_MATCHES |
| E07 | 相同字符串 | oldString=newString | 抛出 SAME_STRING |

### Bash Tool

| ID | 场景 | 输入 | 预期结果 |
|----|------|------|---------|
| B01 | 正常执行 | echo hello | output="hello\n", exitCode=0 |
| B02 | 命令失败 | exit 1 | exitCode=1 |
| B03 | 指定目录 | workdir=/tmp | 在指定目录执行 |
| B04 | 超时 | sleep 10, timeout=100 | timedOut=true |
| B05 | 取消 | 长命令 + abort | 命令被终止 |
| B06 | 输出截断 | 大量输出 | truncated=true |
| B07 | 合并输出 | stdout + stderr | 两者都在 output 中 |

### Glob Tool

| ID | 场景 | 输入 | 预期结果 |
|----|------|------|---------|
| G01 | 基本匹配 | **/*.ts | 返回所有 .ts 文件 |
| G02 | 指定目录 | path=src | 只搜索 src |
| G03 | 无匹配 | **/*.xyz | count=0 |
| G04 | 结果排序 | 多个文件 | 按修改时间降序 |
| G05 | 结果截断 | > 500 文件 | truncated=true |
| G06 | 忽略目录 | node_modules 中有匹配 | 不返回 |

## Test Helpers

### createTestContext

```typescript
export function createTestContext(options?: Partial<Tool.Context>): Tool.Context {
  return {
    sessionID: "test-session",
    cwd: process.cwd(),
    abort: new AbortController().signal,
    ...options,
  }
}
```

### createTempFile

```typescript
export async function createTempFile(
  content: string,
  name?: string
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "naught-test-"))
  const filePath = path.join(dir, name || "test.txt")
  await fs.writeFile(filePath, content)
  tempDirs.push(dir)
  return filePath
}
```

### cleanup

```typescript
export async function cleanup(): Promise<void> {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  tempDirs.length = 0
}
```

## Integration Tests

### Tool + Permission

```typescript
describe("Tool with Permission", () => {
  it("should check permission before write", async () => {
    const checker = createMockPermissionChecker()
    checker.enforce.mockResolvedValue(false)

    await expect(
      executeWithPermission(WriteTool, params, ctx, checker)
    ).rejects.toThrow("Permission denied")

    expect(checker.enforce).toHaveBeenCalledWith(
      expect.objectContaining({ type: "write" }),
      expect.any(Object),
      expect.any(Function)
    )
  })
})
```

### Tool + Session

```typescript
describe("Tool with Session", () => {
  it("should record tool result in session", async () => {
    const session = createTestSession()
    const result = await executeInSession(ReadTool, params, session)

    expect(session.messages).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: expect.arrayContaining([
          expect.objectContaining({ type: "tool_result" })
        ])
      })
    )
  })
})
```

## Performance Tests

```typescript
describe("Performance", () => {
  it("should read large file within 1s", async () => {
    const largePath = await createLargeFile(100000) // 100k lines

    const start = Date.now()
    await ReadTool.execute({ filePath: largePath }, ctx)
    const duration = Date.now() - start

    expect(duration).toBeLessThan(1000)
  })

  it("should glob 10000 files within 2s", async () => {
    await createManyFiles(10000)

    const start = Date.now()
    await GlobTool.execute({ pattern: "**/*" }, ctx)
    const duration = Date.now() - start

    expect(duration).toBeLessThan(2000)
  })
})
```

## Snapshot Tests

```typescript
describe("Output Format", () => {
  it("should match read output snapshot", async () => {
    const result = await ReadTool.execute({
      filePath: "fixtures/sample.txt"
    }, ctx)

    expect(result.output).toMatchSnapshot()
  })
})
```
