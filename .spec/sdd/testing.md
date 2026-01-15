# 测试策略规范

> 本项目的测试要求、流程和报告标准

## 核心原则

**代码未经测试 = 未完成**

1. 每个模块必须有对应的测试文件
2. 测试必须通过才能标记为 ✅ 完成
3. 测试报告必须记录在 spec 文档中

## 测试框架

| 项目 | 选型 | 说明 |
|------|------|------|
| 测试框架 | Vitest | 快速、兼容 ESM |
| 覆盖率 | c8/istanbul | Vitest 内置 |
| Mock | vitest mock | 内置 mock 功能 |

## 覆盖率要求

| 模块类型 | 语句覆盖 | 分支覆盖 | 函数覆盖 |
|----------|----------|----------|----------|
| Tool 实现 | 80% | 75% | 90% |
| Session | 80% | 75% | 90% |
| Agent | 70% | 60% | 80% |
| Provider | 60% | 50% | 70% |

## 测试目录结构

```
packages/agent/
├── src/                    # 源代码
│   ├── tool/
│   ├── session/
│   └── ...
├── test/                   # 测试代码
│   ├── tool/               # 工具测试
│   │   ├── read.test.ts
│   │   ├── write.test.ts
│   │   └── ...
│   ├── session/            # 会话测试
│   │   ├── session.test.ts
│   │   └── storage.test.ts
│   ├── fixtures/           # 测试数据
│   │   └── sample.txt
│   └── helpers/            # 测试工具
│       └── context.ts
└── vitest.config.ts        # 测试配置
```

## 测试类型

### 1. 单元测试（必须）

测试单个函数/类的行为。

```typescript
// test/tool/read.test.ts
describe("ReadTool", () => {
  it("should read file with line numbers", async () => {
    // Arrange
    const filePath = await createTempFile("line1\nline2")

    // Act
    const result = await readTool.execute({ filePath }, ctx)

    // Assert
    expect(result.output).toContain("1\tline1")
  })
})
```

### 2. 集成测试（推荐）

测试模块间的交互。

```typescript
// test/integration/tool-session.test.ts
describe("Tool + Session Integration", () => {
  it("should record tool result in session", async () => {
    const session = await manager.create()
    // ... 测试工具调用结果写入会话
  })
})
```

### 3. 端到端测试（可选）

测试完整流程，Agent Loop 完成后添加。

## 开发流程中的测试

### 每个任务的完成标准

```
1. ✅ 规格文件存在（.spec.md 或 .behavior.md）
2. ✅ 实现代码完成（.ts）
3. ✅ 测试代码完成（.test.ts）
4. ✅ 测试通过（npm test）
5. ✅ 覆盖率达标
6. ✅ 测试报告记录
```

### 测试报告格式

每个阶段总结必须包含测试报告：

```markdown
## 测试报告

### 执行结果

| 类别 | 通过 | 失败 | 跳过 |
|------|------|------|------|
| 单元测试 | 45 | 0 | 2 |
| 集成测试 | 12 | 0 | 0 |

### 覆盖率

| 模块 | 语句 | 分支 | 函数 | 状态 |
|------|------|------|------|------|
| tool/read.ts | 85% | 78% | 100% | ✅ |
| tool/write.ts | 82% | 75% | 100% | ✅ |
| session/session.ts | 80% | 72% | 95% | ✅ |

### 未覆盖的场景

- [ ] read: 超大文件（>1GB）处理
- [ ] bash: Windows 特定命令

### 已知问题

- 无
```

## 测试命令

```bash
# 运行所有测试
pnpm test

# 运行特定模块测试
pnpm test tool
pnpm test session

# 生成覆盖率报告
pnpm test:coverage

# 监听模式开发
pnpm test:watch
```

## 测试配置模板

### vitest.config.ts

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/index.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 90,
      },
    },
  },
})
```

### package.json 脚本

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

## 测试辅助函数

### test/helpers/context.ts

```typescript
import { randomUUID } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

const tempDirs: string[] = []

export function createTestContext(options?: Partial<Tool.Context>): Tool.Context {
  return {
    sessionID: randomUUID(),
    cwd: process.cwd(),
    abort: new AbortController().signal,
    ...options,
  }
}

export async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "naught-test-"))
  tempDirs.push(dir)
  return dir
}

export async function createTempFile(content: string, name = "test.txt"): Promise<string> {
  const dir = await createTempDir()
  const filePath = path.join(dir, name)
  await fs.writeFile(filePath, content)
  return filePath
}

export async function cleanup(): Promise<void> {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs.length = 0
}
```

## 状态标记规则更新

| 标记 | 含义 | 测试要求 |
|------|------|---------|
| ✅ | 完成 | 测试通过 + 覆盖率达标 |
| 🔨 | 进行中 | 可以无测试 |
| ⬜ | 未开始 | - |
| ⚠️ | 代码完成但测试不完整 | 需补充测试 |

## 回溯补测计划

对于已标记 ✅ 但没有测试的模块，需要：

1. 标记为 ⚠️ 警告状态
2. 创建补测任务
3. 完成测试后恢复 ✅

## CI 集成（未来）

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test:coverage
```
