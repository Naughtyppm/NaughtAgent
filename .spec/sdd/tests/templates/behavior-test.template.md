# Test Template: Behavior-Driven

> 基于行为规格生成测试的模板

## 模板结构

```typescript
/**
 * Test: {ToolName}
 * Spec: .spec/sdd/behaviors/tools/{tool}.behavior.md
 *
 * 本文件由行为规格生成，修改前请先更新规格文件。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { {ToolName}Tool } from "../../src/tool/{tool}"
import { Tool } from "../../src/tool/tool"
import {
  createTestContext,
  createTempDir,
  createTempFile,
  cleanup
} from "../helpers"

describe("{ToolName}Tool", () => {
  let ctx: Tool.Context
  let tempDir: string

  beforeEach(async () => {
    ctx = createTestContext()
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanup()
  })

  // ============================================
  // Scenarios from behavior spec
  // ============================================

  describe("Scenarios", () => {
    /**
     * S1: {场景名称}
     *
     * Given {前置条件}
     * When {操作}
     * Then {预期结果}
     */
    it("S1: {场景描述}", async () => {
      // Arrange (Given)

      // Act (When)

      // Assert (Then)
    })
  })

  // ============================================
  // Error cases from behavior spec
  // ============================================

  describe("Error Cases", () => {
    /**
     * E1: {错误场景}
     */
    it("E1: {错误描述}", async () => {
      await expect(
        {ToolName}Tool.execute({/* params */}, ctx)
      ).rejects.toThrow("{错误消息}")
    })
  })

  // ============================================
  // Constraints validation
  // ============================================

  describe("Constraints", () => {
    it("should respect {约束名称}", async () => {
      // 验证约束条件
    })
  })
})
```

## 从 Gherkin 到测试代码

### Given → Arrange

```gherkin
Given 文件 "/path/to/file.txt" 存在且包含 100 行
```

```typescript
// Arrange
const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n")
const filePath = await createTempFile(content)
```

### When → Act

```gherkin
When 调用 read(filePath: "/path/to/file.txt")
```

```typescript
// Act
const result = await ReadTool.execute({ filePath }, ctx)
```

### Then → Assert

```gherkin
Then 返回文件内容，带行号前缀
And metadata.totalLines = 100
```

```typescript
// Assert
expect(result.output).toMatch(/^\s+1\t/)
expect(result.metadata?.totalLines).toBe(100)
```

## 参数化测试

### 多输入测试

```typescript
describe("Parameter Validation", () => {
  it.each([
    { offset: -1, error: "offset must be >= 0" },
    { limit: 0, error: "limit must be > 0" },
    { limit: -1, error: "limit must be > 0" },
  ])("should reject invalid params: $error", async ({ offset, limit, error }) => {
    await expect(
      ReadTool.execute({ filePath: "/any", offset, limit }, ctx)
    ).rejects.toThrow(error)
  })
})
```

### 边界值测试

```typescript
describe("Boundary Values", () => {
  it.each([
    { lines: 1, desc: "minimum" },
    { lines: 2000, desc: "default limit" },
    { lines: 2001, desc: "exceeds limit" },
  ])("should handle $desc ($lines lines)", async ({ lines }) => {
    const content = Array(lines).fill("line").join("\n")
    const filePath = await createTempFile(content)

    const result = await ReadTool.execute({ filePath }, ctx)

    expect(result.metadata?.totalLines).toBe(lines)
  })
})
```

## Mock 策略

### 文件系统 Mock

```typescript
import { vol } from "memfs"
import { vi } from "vitest"

vi.mock("fs/promises", async () => {
  const memfs = await import("memfs")
  return memfs.fs.promises
})

beforeEach(() => {
  vol.reset()
  vol.fromJSON({
    "/workspace/file.txt": "content",
    "/workspace/dir": null,  // directory
  })
})
```

### 进程 Mock (Bash)

```typescript
import { vi } from "vitest"
import { spawn } from "child_process"

vi.mock("child_process", () => ({
  spawn: vi.fn(() => ({
    stdout: createMockStream("output"),
    stderr: createMockStream(""),
    on: vi.fn((event, cb) => {
      if (event === "close") setTimeout(() => cb(0), 10)
    }),
    kill: vi.fn(),
  })),
}))
```

### 权限 Mock

```typescript
const mockChecker = {
  check: vi.fn().mockReturnValue({ allowed: true, needsConfirmation: false }),
  enforce: vi.fn().mockResolvedValue(true),
}
```

## 断言工具

### 自定义匹配器

```typescript
expect.extend({
  toHaveLineCount(received: string, expected: number) {
    const lines = received.split("\n").length
    return {
      pass: lines === expected,
      message: () => `Expected ${expected} lines, got ${lines}`,
    }
  },

  toContainDiff(received: string) {
    const hasDiff = received.includes("---") && received.includes("+++")
    return {
      pass: hasDiff,
      message: () => `Expected output to contain diff format`,
    }
  },
})

// 使用
expect(result.output).toHaveLineCount(100)
expect(result.output).toContainDiff()
```

### 结果断言

```typescript
function expectToolSuccess(result: Tool.Result) {
  expect(result.metadata?.error).toBeFalsy()
  expect(result.title).toBeTruthy()
}

function expectToolError(result: Tool.Result, code?: string) {
  expect(result.metadata?.error).toBe(true)
  if (code) {
    expect(result.metadata?.code).toBe(code)
  }
}
```

## 测试数据管理

### Fixtures

```
test/fixtures/
├── text/
│   ├── empty.txt
│   ├── single-line.txt
│   ├── multi-line.txt
│   └── long-lines.txt
├── binary/
│   ├── image.png
│   └── archive.zip
└── code/
    ├── sample.ts
    └── sample.js
```

### 动态生成

```typescript
export function generateLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `Line ${i + 1}`).join("\n")
}

export function generateLargeFile(sizeKB: number): string {
  const line = "x".repeat(100) + "\n"  // ~100 bytes per line
  const lines = Math.ceil((sizeKB * 1024) / 101)
  return line.repeat(lines)
}
```

## CI 集成

### 测试命令

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:spec": "vitest run --reporter=verbose"
  }
}
```

### 覆盖率报告

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["test/**", "**/*.d.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 90,
        lines: 80,
      },
    },
  },
})
```
