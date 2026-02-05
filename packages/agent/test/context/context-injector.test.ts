/**
 * ContextInjector 单元测试
 *
 * 测试上下文注入器的核心功能：
 * - 构建项目上下文字符串
 * - 注入到系统提示
 * - Token 估算
 * - 配置合并
 *
 * 需求: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect } from "vitest"
import {
  createContextInjector,
  DEFAULT_CONTEXT_INJECTOR_CONFIG,
  PROJECT_CONTEXT_TAG_OPEN,
  PROJECT_CONTEXT_TAG_CLOSE,
  CHARS_PER_TOKEN,
  _buildStructureSection,
  _buildTechStackSection,
  _buildKeyFilesSection,
  _wrapWithProjectContextTag,
  _estimateTokensFromString,
  _truncateContext,
} from "../../src/context/context-injector"
import type { ProjectIndex } from "../../src/context/index-cache"
import type { TechStack } from "../../src/context/context"

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * 创建测试用的 ProjectIndex
 */
function createTestProjectIndex(overrides?: Partial<ProjectIndex>): ProjectIndex {
  const defaultIndex: ProjectIndex = {
    version: "1.0.0",
    updatedAt: Date.now(),
    hash: "abc123def456",
    root: "/test/project",
    structure: {
      tree: `├── src/
│   ├── index.ts
│   └── utils.ts
├── package.json
└── tsconfig.json`,
      keyFiles: ["package.json", "tsconfig.json", "README.md"],
      techStack: {
        languages: ["TypeScript", "JavaScript"],
        frameworks: ["React"],
        packageManager: "pnpm",
        testFramework: "Vitest",
        buildTool: "Vite",
      },
    },
    metadata: {
      generationTime: 100,
      fileCount: 10,
      dirCount: 3,
    },
  }

  if (overrides) {
    return {
      ...defaultIndex,
      ...overrides,
      structure: {
        ...defaultIndex.structure,
        ...overrides.structure,
        techStack: {
          ...defaultIndex.structure.techStack,
          ...overrides.structure?.techStack,
        },
      },
      metadata: {
        ...defaultIndex.metadata,
        ...overrides.metadata,
      },
    }
  }

  return defaultIndex
}

// ============================================================================
// createContextInjector Tests
// ============================================================================

describe("createContextInjector", () => {
  it("应该使用默认配置创建注入器", () => {
    const injector = createContextInjector()
    expect(injector).toBeDefined()
    expect(injector.buildProjectContext).toBeInstanceOf(Function)
    expect(injector.injectIntoSystemPrompt).toBeInstanceOf(Function)
    expect(injector.estimateTokens).toBeInstanceOf(Function)
  })

  it("应该允许覆盖配置", () => {
    const injector = createContextInjector({
      enabled: false,
      maxTokens: 1000,
    })

    const index = createTestProjectIndex()
    const context = injector.buildProjectContext(index)

    // 禁用时应返回空字符串
    expect(context).toBe("")
  })

  it("应该允许部分覆盖 include 配置", () => {
    const injector = createContextInjector({
      include: {
        structure: false,
        techStack: true,
        keyFiles: true,
        gitStatus: false,
      },
    })

    const index = createTestProjectIndex()
    const context = injector.buildProjectContext(index)

    // 不应包含项目结构
    expect(context).not.toContain("## Project Structure")
    // 应包含技术栈
    expect(context).toContain("## Tech Stack")
  })
})

// ============================================================================
// buildProjectContext Tests
// ============================================================================

describe("buildProjectContext", () => {
  it("需求 3.1: 应包含缓存的项目结构", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex()

    const context = injector.buildProjectContext(index)

    expect(context).toContain("## Project Structure")
    expect(context).toContain("src/")
    expect(context).toContain("index.ts")
  })

  it("需求 3.2: 应包含检测到的技术栈信息", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex()

    const context = injector.buildProjectContext(index)

    expect(context).toContain("## Tech Stack")
    expect(context).toContain("TypeScript")
    expect(context).toContain("React")
    expect(context).toContain("pnpm")
    expect(context).toContain("Vitest")
    expect(context).toContain("Vite")
  })

  it("需求 3.3: 应包含关键文件列表", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex()

    const context = injector.buildProjectContext(index)

    expect(context).toContain("## Key Files")
    expect(context).toContain("package.json")
    expect(context).toContain("tsconfig.json")
    expect(context).toContain("README.md")
  })

  it("需求 3.4: 应使用 <project-context> 标签包装", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex()

    const context = injector.buildProjectContext(index)

    expect(context).toContain(PROJECT_CONTEXT_TAG_OPEN)
    expect(context).toContain(PROJECT_CONTEXT_TAG_CLOSE)
    expect(context.startsWith(PROJECT_CONTEXT_TAG_OPEN)).toBe(true)
    expect(context.endsWith(PROJECT_CONTEXT_TAG_CLOSE)).toBe(true)
  })

  it("禁用时应返回空字符串", () => {
    const injector = createContextInjector({ enabled: false })
    const index = createTestProjectIndex()

    const context = injector.buildProjectContext(index)

    expect(context).toBe("")
  })

  it("空索引时应返回空字符串", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex({
      structure: {
        tree: "",
        keyFiles: [],
        techStack: {
          languages: [],
          frameworks: [],
          packageManager: undefined,
          testFramework: undefined,
          buildTool: undefined,
        },
      },
    })

    const context = injector.buildProjectContext(index)

    expect(context).toBe("")
  })

  it("只有部分内容时应正确构建", () => {
    const injector = createContextInjector({
      include: {
        structure: false,
        techStack: true,
        keyFiles: false,
        gitStatus: false,
      },
    })
    const index = createTestProjectIndex()

    const context = injector.buildProjectContext(index)

    expect(context).toContain("## Tech Stack")
    expect(context).not.toContain("## Project Structure")
    expect(context).not.toContain("## Key Files")
  })
})

// ============================================================================
// injectIntoSystemPrompt Tests
// ============================================================================

describe("injectIntoSystemPrompt", () => {
  it("应将上下文注入到基础提示后", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex()
    const basePrompt = "You are a helpful assistant."

    const result = injector.injectIntoSystemPrompt(basePrompt, index)

    expect(result).toContain(basePrompt)
    expect(result).toContain(PROJECT_CONTEXT_TAG_OPEN)
    expect(result.indexOf(basePrompt)).toBeLessThan(result.indexOf(PROJECT_CONTEXT_TAG_OPEN))
  })

  it("禁用时应返回原始提示", () => {
    const injector = createContextInjector({ enabled: false })
    const index = createTestProjectIndex()
    const basePrompt = "You are a helpful assistant."

    const result = injector.injectIntoSystemPrompt(basePrompt, index)

    expect(result).toBe(basePrompt)
  })

  it("空基础提示时应只返回上下文", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex()

    const result = injector.injectIntoSystemPrompt("", index)

    expect(result).toContain(PROJECT_CONTEXT_TAG_OPEN)
    expect(result.startsWith(PROJECT_CONTEXT_TAG_OPEN)).toBe(true)
  })

  it("超过 Token 限制时应截断", () => {
    const injector = createContextInjector({ maxTokens: 50 }) // 很小的限制
    const index = createTestProjectIndex()
    const basePrompt = "You are a helpful assistant."

    const result = injector.injectIntoSystemPrompt(basePrompt, index)

    // 应该包含截断提示
    expect(result).toContain("truncated")
  })
})

// ============================================================================
// estimateTokens Tests
// ============================================================================

describe("estimateTokens", () => {
  it("应正确估算 Token 数", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex()

    const tokens = injector.estimateTokens(index)

    // Token 数应该是正数
    expect(tokens).toBeGreaterThan(0)

    // 验证估算逻辑
    const context = injector.buildProjectContext(index)
    const expectedTokens = Math.ceil(context.length / CHARS_PER_TOKEN)
    expect(tokens).toBe(expectedTokens)
  })

  it("禁用时应返回 0", () => {
    const injector = createContextInjector({ enabled: false })
    const index = createTestProjectIndex()

    const tokens = injector.estimateTokens(index)

    expect(tokens).toBe(0)
  })

  it("空内容时应返回 0", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex({
      structure: {
        tree: "",
        keyFiles: [],
        techStack: {
          languages: [],
          frameworks: [],
          packageManager: undefined,
          testFramework: undefined,
          buildTool: undefined,
        },
      },
    })

    const tokens = injector.estimateTokens(index)

    expect(tokens).toBe(0)
  })
})

// ============================================================================
// Internal Function Tests
// ============================================================================

describe("_buildStructureSection", () => {
  it("应正确构建结构部分", () => {
    const tree = `├── src/
│   └── index.ts
└── package.json`

    const section = _buildStructureSection(tree)

    expect(section).toContain("## Project Structure")
    expect(section).toContain("```")
    expect(section).toContain(tree)
  })
})

describe("_buildTechStackSection", () => {
  it("应正确构建完整技术栈部分", () => {
    const techStack: TechStack = {
      languages: ["TypeScript"],
      frameworks: ["React", "Next.js"],
      packageManager: "pnpm",
      testFramework: "Vitest",
      buildTool: "Vite",
    }

    const section = _buildTechStackSection(techStack)

    expect(section).toContain("## Tech Stack")
    expect(section).toContain("**Languages**: TypeScript")
    expect(section).toContain("**Frameworks**: React, Next.js")
    expect(section).toContain("**Package Manager**: pnpm")
    expect(section).toContain("**Test Framework**: Vitest")
    expect(section).toContain("**Build Tool**: Vite")
  })

  it("空技术栈时应返回空字符串", () => {
    const techStack: TechStack = {
      languages: [],
      frameworks: [],
    }

    const section = _buildTechStackSection(techStack)

    expect(section).toBe("")
  })

  it("部分技术栈时应只包含有值的部分", () => {
    const techStack: TechStack = {
      languages: ["Python"],
      frameworks: [],
    }

    const section = _buildTechStackSection(techStack)

    expect(section).toContain("**Languages**: Python")
    expect(section).not.toContain("**Frameworks**")
    expect(section).not.toContain("**Package Manager**")
  })
})

describe("_buildKeyFilesSection", () => {
  it("应正确构建关键文件部分", () => {
    const keyFiles = ["package.json", "tsconfig.json", "README.md"]

    const section = _buildKeyFilesSection(keyFiles)

    expect(section).toContain("## Key Files")
    expect(section).toContain("- package.json")
    expect(section).toContain("- tsconfig.json")
    expect(section).toContain("- README.md")
  })
})

describe("_wrapWithProjectContextTag", () => {
  it("应正确包装内容", () => {
    const content = "Test content"

    const wrapped = _wrapWithProjectContextTag(content)

    expect(wrapped).toBe(`${PROJECT_CONTEXT_TAG_OPEN}\n${content}\n${PROJECT_CONTEXT_TAG_CLOSE}`)
  })
})

describe("_estimateTokensFromString", () => {
  it("应正确估算 Token 数", () => {
    const text = "Hello, world!" // 13 字符

    const tokens = _estimateTokensFromString(text)

    expect(tokens).toBe(Math.ceil(13 / CHARS_PER_TOKEN))
  })

  it("空字符串应返回 0", () => {
    expect(_estimateTokensFromString("")).toBe(0)
  })
})

describe("_truncateContext", () => {
  it("不超过限制时应返回原内容", () => {
    const context = _wrapWithProjectContextTag("Short content")

    const truncated = _truncateContext(context, 1000)

    expect(truncated).toBe(context)
  })

  it("超过限制时应截断并添加提示", () => {
    const longContent = "A".repeat(1000)
    const context = _wrapWithProjectContextTag(longContent)

    const truncated = _truncateContext(context, 50) // 很小的限制

    expect(truncated.length).toBeLessThan(context.length)
    expect(truncated).toContain("truncated")
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  it("应处理特殊字符", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex({
      structure: {
        tree: "├── 中文目录/\n│   └── 文件.ts",
        keyFiles: ["中文文件.md"],
        techStack: {
          languages: ["TypeScript"],
          frameworks: [],
        },
      },
    })

    const context = injector.buildProjectContext(index)

    expect(context).toContain("中文目录")
    expect(context).toContain("中文文件.md")
  })

  it("应处理空数组", () => {
    const injector = createContextInjector()
    const index = createTestProjectIndex({
      structure: {
        tree: "├── src/",
        keyFiles: [],
        techStack: {
          languages: [],
          frameworks: [],
          packageManager: undefined,
          testFramework: undefined,
          buildTool: undefined,
        },
      },
    })

    const context = injector.buildProjectContext(index)

    // 应该只包含结构部分
    expect(context).toContain("## Project Structure")
    expect(context).not.toContain("## Tech Stack")
    expect(context).not.toContain("## Key Files")
  })

  it("应处理非常长的树结构", () => {
    const injector = createContextInjector({ maxTokens: 100 })
    const longTree = Array(100)
      .fill("├── file.ts")
      .join("\n")
    const index = createTestProjectIndex({
      structure: {
        tree: longTree,
        keyFiles: [],
        techStack: {
          languages: [],
          frameworks: [],
        },
      },
    })

    const context = injector.buildProjectContext(index)

    // 应该被截断
    expect(context.length).toBeLessThan(longTree.length + 200)
  })
})
