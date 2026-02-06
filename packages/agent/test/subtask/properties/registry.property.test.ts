/**
 * Agent Registry 属性测试
 *
 * 使用 fast-check 进行属性测试，验证 Agent 注册表的正确性属性。
 *
 * **Property 4: Markdown Parsing Round-Trip**
 * **Validates: Requirements 2.2, 2.3, 2.4**
 *
 * @module test/subtask/properties/registry.property
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import {
  parseAgentFile,
  VALID_PERMISSION_MODES,
  type PermissionMode,
} from "../../../src/subtask/agent-registry"

describe("Agent Registry Properties", () => {
  // 保存原始 console.warn
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  // ==========================================================================
  // Generators - 智能生成器，约束到有效输入空间
  // ==========================================================================

  /**
   * 生成有效的 Agent 名称
   * - 以字母开头
   * - 只包含字母、数字、连字符、下划线
   * - 长度 1-50
   */
  const validAgentName = fc
    .tuple(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
      fc.array(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
        { minLength: 0, maxLength: 49 }
      )
    )
    .map(([first, rest]) => first + rest.join(''))

  /**
   * 生成有效的描述
   * - 以字母或中文开头（避免 YAML 特殊字符）
   * - 长度 1-100
   * - 确保 trim 后非空
   */
  const validDescription = fc
    .tuple(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ测试描述'.split('')),
      fc.array(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 测试描述内容'.split('')),
        { minLength: 0, maxLength: 99 }
      )
    )
    .map(([first, rest]) => first + rest.join(''))

  /**
   * 生成有效的工具名称
   */
  const validToolName = fc.constantFrom(
    "read",
    "write",
    "glob",
    "grep",
    "bash",
    "edit",
    "append",
    "search"
  )

  /**
   * 生成有效的工具列表
   */
  const validToolsList = fc.array(validToolName, { minLength: 0, maxLength: 5 })

  /**
   * 生成有效的模型名称
   */
  const validModel = fc.option(
    fc.constantFrom(
      "claude-sonnet",
      "claude-opus",
      "claude-haiku",
      "gpt-4",
      "gpt-4-turbo"
    ),
    { nil: undefined }
  )

  /**
   * 生成有效的权限模式
   */
  const validPermissionMode = fc.option(
    fc.constantFrom<PermissionMode>("ask", "allow", "plan"),
    { nil: undefined }
  )

  /**
   * 生成有效的 Markdown body 内容
   * - 可以包含标题、列表等 Markdown 语法
   * - 避免 YAML frontmatter 分隔符 (---)
   */
  const validMarkdownBody = fc
    .array(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \n#*_.中文内容测试提示词系统'.split('')
      ),
      { minLength: 0, maxLength: 200 }
    )
    .map((chars) => chars.join('').trim())

  /**
   * 生成完整的 frontmatter 数据
   */
  const validFrontmatterData = fc.record({
    name: validAgentName,
    description: validDescription,
    tools: validToolsList,
    model: validModel,
    permissionMode: validPermissionMode,
  })

  /**
   * 构建 Markdown 文件内容
   *
   * @param frontmatter - frontmatter 数据
   * @param body - Markdown body
   * @returns 完整的 Markdown 文件内容
   */
  function buildMarkdownContent(
    frontmatter: {
      name: string
      description: string
      tools: string[]
      model?: string
      permissionMode?: PermissionMode
    },
    body: string
  ): string {
    const lines: string[] = ["---"]

    // name 和 description 是必填的，使用引号包裹确保 YAML 安全
    lines.push(`name: "${frontmatter.name}"`)
    lines.push(`description: "${frontmatter.description}"`)

    // tools 数组
    if (frontmatter.tools.length > 0) {
      lines.push("tools:")
      for (const tool of frontmatter.tools) {
        lines.push(`  - ${tool}`)
      }
    }

    // 可选字段
    if (frontmatter.model !== undefined) {
      lines.push(`model: ${frontmatter.model}`)
    }

    if (frontmatter.permissionMode !== undefined) {
      lines.push(`permissionMode: ${frontmatter.permissionMode}`)
    }

    lines.push("---")
    lines.push("")
    lines.push(body)

    return lines.join("\n")
  }

  // ==========================================================================
  // Property 4: Markdown Parsing Round-Trip
  // ==========================================================================

  describe("Property 4: Markdown Parsing Round-Trip", () => {
    /**
     * **Validates: Requirements 2.2, 2.3, 2.4**
     *
     * *For any* valid Markdown file with YAML frontmatter in `.naughty/agents/`,
     * parsing SHALL extract name, description, tools, model, permissionMode from
     * frontmatter and the body as systemPrompt.
     */
    it("should correctly parse any valid Markdown file with frontmatter", () => {
      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          (frontmatter, body) => {
            // 构建 Markdown 内容
            const content = buildMarkdownContent(frontmatter, body)
            const filePath = ".naughty/agents/test-agent.md"

            // 解析文件
            const result = parseAgentFile(content, filePath)

            // 验证解析成功
            expect(result).not.toBeNull()

            if (result) {
              // 验证 name 正确提取（trim 后）
              expect(result.name).toBe(frontmatter.name.trim())

              // 验证 description 正确提取（trim 后）
              expect(result.description).toBe(frontmatter.description.trim())

              // 验证 tools 正确提取
              const expectedTools = frontmatter.tools.map((t) => t.trim())
              expect(result.tools).toEqual(expectedTools)

              // 验证 model 正确提取（如果存在）
              if (frontmatter.model !== undefined) {
                expect(result.model).toBe(frontmatter.model.trim())
              } else {
                expect(result.model).toBeUndefined()
              }

              // 验证 permissionMode 正确提取（如果存在）
              if (frontmatter.permissionMode !== undefined) {
                expect(result.permissionMode).toBe(frontmatter.permissionMode)
              } else {
                expect(result.permissionMode).toBeUndefined()
              }

              // 验证 systemPrompt 正确提取（body trim 后）
              expect(result.systemPrompt).toBe(body.trim())

              // 验证 filePath 正确设置
              expect(result.filePath).toBe(filePath)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：解析后的 name 应该是非空字符串
     *
     * **Validates: Requirements 2.3**
     */
    it("parsed name should always be a non-empty string", () => {
      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          (frontmatter, body) => {
            const content = buildMarkdownContent(frontmatter, body)
            const result = parseAgentFile(content, "test.md")

            expect(result).not.toBeNull()
            if (result) {
              expect(typeof result.name).toBe("string")
              expect(result.name.length).toBeGreaterThan(0)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：解析后的 description 应该是非空字符串
     *
     * **Validates: Requirements 2.3**
     */
    it("parsed description should always be a non-empty string", () => {
      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          (frontmatter, body) => {
            const content = buildMarkdownContent(frontmatter, body)
            const result = parseAgentFile(content, "test.md")

            expect(result).not.toBeNull()
            if (result) {
              expect(typeof result.description).toBe("string")
              expect(result.description.length).toBeGreaterThan(0)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：解析后的 tools 应该是字符串数组
     *
     * **Validates: Requirements 2.3**
     */
    it("parsed tools should always be an array of strings", () => {
      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          (frontmatter, body) => {
            const content = buildMarkdownContent(frontmatter, body)
            const result = parseAgentFile(content, "test.md")

            expect(result).not.toBeNull()
            if (result) {
              expect(Array.isArray(result.tools)).toBe(true)
              for (const tool of result.tools) {
                expect(typeof tool).toBe("string")
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：解析后的 permissionMode 应该是有效值或 undefined
     *
     * **Validates: Requirements 2.3**
     */
    it("parsed permissionMode should be valid or undefined", () => {
      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          (frontmatter, body) => {
            const content = buildMarkdownContent(frontmatter, body)
            const result = parseAgentFile(content, "test.md")

            expect(result).not.toBeNull()
            if (result) {
              if (result.permissionMode !== undefined) {
                expect(VALID_PERMISSION_MODES).toContain(result.permissionMode)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：解析后的 systemPrompt 应该是字符串
     *
     * **Validates: Requirements 2.4**
     */
    it("parsed systemPrompt should always be a string", () => {
      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          (frontmatter, body) => {
            const content = buildMarkdownContent(frontmatter, body)
            const result = parseAgentFile(content, "test.md")

            expect(result).not.toBeNull()
            if (result) {
              expect(typeof result.systemPrompt).toBe("string")
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：tools 数组长度应该保持一致
     *
     * **Validates: Requirements 2.3**
     */
    it("tools array length should be preserved", () => {
      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          (frontmatter, body) => {
            const content = buildMarkdownContent(frontmatter, body)
            const result = parseAgentFile(content, "test.md")

            expect(result).not.toBeNull()
            if (result) {
              expect(result.tools.length).toBe(frontmatter.tools.length)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：filePath 应该被正确保留
     *
     * **Validates: Requirements 2.2**
     */
    it("filePath should be preserved exactly", () => {
      // 生成有效的文件路径
      const validFilePath = fc
        .tuple(
          fc.constantFrom("agents", "custom", "test"),
          fc.constantFrom("agent", "reviewer", "helper"),
        )
        .map(([dir, name]) => `.naughty/${dir}/${name}.md`)

      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          validFilePath,
          (frontmatter, body, filePath) => {
            const content = buildMarkdownContent(frontmatter, body)
            const result = parseAgentFile(content, filePath)

            expect(result).not.toBeNull()
            if (result) {
              expect(result.filePath).toBe(filePath)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：systemPrompt 应该等于 body 的 trim 结果
     *
     * **Validates: Requirements 2.4**
     */
    it("systemPrompt should equal trimmed body content", () => {
      fc.assert(
        fc.property(
          validFrontmatterData,
          validMarkdownBody,
          (frontmatter, body) => {
            const content = buildMarkdownContent(frontmatter, body)
            const result = parseAgentFile(content, "test.md")

            expect(result).not.toBeNull()
            if (result) {
              // systemPrompt 应该是 body 的 trim 结果
              expect(result.systemPrompt).toBe(body.trim())
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
