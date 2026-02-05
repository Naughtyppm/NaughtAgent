/**
 * 工具输出截断器测试
 *
 * 包含单元测试和属性测试
 */

import { describe, it, expect, beforeEach } from "vitest"
import fc from "fast-check"
import {
  createTruncator,
  DEFAULT_TRUNCATION_CONFIG,
  type ToolOutputTruncator,
  type TruncationConfig,
  type GrepMatch,
} from "../../src/token/truncator"
import { estimateTokens } from "../../src/token/token"

// ============================================================================
// 单元测试
// ============================================================================

describe("createTruncator", () => {
  let truncator: ToolOutputTruncator

  beforeEach(() => {
    truncator = createTruncator()
  })

  describe("truncate()", () => {
    it("不截断短内容", () => {
      const content = "Hello, world!"
      const result = truncator.truncate(content)

      expect(result.truncated).toBe(false)
      expect(result.content).toBe(content)
      expect(result.originalTokens).toBe(result.finalTokens)
    })

    it("截断超长内容", () => {
      const content = "x".repeat(50000) // 很长的内容
      const result = truncator.truncate(content, { maxOutputTokens: 100 })

      expect(result.truncated).toBe(true)
      expect(result.finalTokens).toBeLessThanOrEqual(100)
      expect(result.originalTokens).toBeGreaterThan(100)
    })

    it("head 策略保留开头", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`)
      const content = lines.join("\n")
      const result = truncator.truncate(content, {
        maxOutputTokens: 50,
        strategy: "head",
      })

      expect(result.truncated).toBe(true)
      expect(result.content).toContain("Line 1")
      expect(result.content).not.toContain("Line 100")
    })

    it("tail 策略保留结尾", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`)
      const content = lines.join("\n")
      const result = truncator.truncate(content, {
        maxOutputTokens: 50,
        strategy: "tail",
      })

      expect(result.truncated).toBe(true)
      expect(result.content).toContain("Line 100")
      expect(result.content).not.toContain("Line 1\n")
    })

    it("middle 策略保留开头和结尾", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`)
      const content = lines.join("\n")
      const result = truncator.truncate(content, {
        maxOutputTokens: 100,
        strategy: "middle",
      })

      expect(result.truncated).toBe(true)
      expect(result.content).toContain("Line 1")
      expect(result.content).toContain("Line 100")
      expect(result.content).toContain("已截断")
    })
  })

  describe("truncateFileContent()", () => {
    it("不截断短文件", () => {
      const content = "const x = 1;"
      const result = truncator.truncateFileContent(content, "test.ts")

      expect(result.truncated).toBe(false)
      expect(result.content).toBe(content)
    })

    it("截断长文件并包含文件名", () => {
      const content = "x".repeat(50000)
      const result = truncator.truncateFileContent(content, "long-file.ts")

      expect(result.truncated).toBe(true)
      expect(result.content).toContain("long-file.ts")
      expect(result.content).toContain("已截断")
    })
  })

  describe("truncateBashOutput()", () => {
    it("不截断短输出", () => {
      const stdout = "Hello"
      const stderr = ""
      const result = truncator.truncateBashOutput(stdout, stderr)

      expect(result.truncated).toBe(false)
      expect(result.content).toBe("Hello")
    })

    it("合并 stdout 和 stderr", () => {
      const stdout = "output"
      const stderr = "error"
      const result = truncator.truncateBashOutput(stdout, stderr)

      expect(result.content).toContain("output")
      expect(result.content).toContain("[stderr]")
      expect(result.content).toContain("error")
    })

    it("截断长输出", () => {
      const stdout = "x".repeat(50000)
      const result = truncator.truncateBashOutput(stdout, "")

      expect(result.truncated).toBe(true)
      expect(result.content).toContain("命令输出已截断")
    })
  })

  describe("truncateGrepResults()", () => {
    it("不截断少量结果", () => {
      const results: GrepMatch[] = [
        { file: "a.ts", line: 1, content: "match 1" },
        { file: "b.ts", line: 2, content: "match 2" },
      ]
      const result = truncator.truncateGrepResults(results, 2)

      expect(result.truncated).toBe(false)
      expect(result.content).toContain("a.ts:1: match 1")
      expect(result.content).toContain("b.ts:2: match 2")
    })

    it("显示总匹配数", () => {
      const results: GrepMatch[] = [
        { file: "a.ts", line: 1, content: "match 1" },
      ]
      const result = truncator.truncateGrepResults(results, 100)

      expect(result.content).toContain("1/100")
    })

    it("截断大量结果", () => {
      const results: GrepMatch[] = Array.from({ length: 1000 }, (_, i) => ({
        file: `file${i}.ts`,
        line: i,
        content: "x".repeat(100),
      }))
      const result = truncator.truncateGrepResults(results, 1000)

      expect(result.truncated).toBe(true)
      expect(result.content).toContain("grep 结果已截断")
    })
  })

  describe("truncateJson()", () => {
    it("不截断短 JSON", () => {
      const json = JSON.stringify({ a: 1, b: 2 })
      const result = truncator.truncateJson(json)

      expect(result.truncated).toBe(false)
    })

    it("截断长 JSON 保留结构", () => {
      const obj = {
        key1: "x".repeat(10000),
        key2: "y".repeat(10000),
        key3: Array.from({ length: 100 }, (_, i) => ({ id: i, data: "z".repeat(100) })),
      }
      const json = JSON.stringify(obj)
      const result = truncator.truncateJson(json)

      expect(result.truncated).toBe(true)
      // 截断后应该仍是有效 JSON
      expect(() => JSON.parse(result.content)).not.toThrow()
    })

    it("无效 JSON 回退到文本截断", () => {
      const invalidJson = "{ invalid json"
      const result = truncator.truncateJson(invalidJson)

      // 短内容不截断
      expect(result.truncated).toBe(false)
    })
  })
})

// ============================================================================
// 属性测试
// ============================================================================

describe("截断器属性测试", () => {
  let truncator: ToolOutputTruncator

  beforeEach(() => {
    truncator = createTruncator()
  })

  /**
   * 属性 1: 截断遵守 Token 限制
   * 验证需求: 1.1
   */
  describe("属性 1: 截断遵守 Token 限制", () => {
    it("截断后的输出不应超过 Token 限制", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 10000 }),
          fc.integer({ min: 50, max: 500 }),
          (content, maxTokens) => {
            const result = truncator.truncate(content, { maxOutputTokens: maxTokens })
            const actualTokens = estimateTokens(result.content)

            // 允许 10% 的误差（因为 Token 估算不精确）
            return actualTokens <= maxTokens * 1.1
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * 属性 2: 截断策略一致性
   * 验证需求: 1.5
   */
  describe("属性 2: 截断策略一致性", () => {
    it("head 策略应保留内容开头", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 10, maxLength: 50 }),
          fc.integer({ min: 50, max: 200 }),
          (lines, maxTokens) => {
            const content = lines.join("\n")
            const result = truncator.truncate(content, {
              maxOutputTokens: maxTokens,
              strategy: "head",
            })

            if (!result.truncated) return true

            // 开头的内容应该被保留
            const firstLine = lines[0]
            return result.content.startsWith(firstLine) || result.content.includes(firstLine)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("tail 策略应保留内容结尾", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 10, maxLength: 50 }),
          fc.integer({ min: 50, max: 200 }),
          (lines, maxTokens) => {
            const content = lines.join("\n")
            const result = truncator.truncate(content, {
              maxOutputTokens: maxTokens,
              strategy: "tail",
            })

            if (!result.truncated) return true

            // 结尾的内容应该被保留
            const lastLine = lines[lines.length - 1]
            return result.content.endsWith(lastLine) || result.content.includes(lastLine)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("middle 策略应同时保留开头和结尾", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 20, maxLength: 50 }),
          fc.integer({ min: 100, max: 300 }),
          (lines, maxTokens) => {
            const content = lines.join("\n")
            const result = truncator.truncate(content, {
              maxOutputTokens: maxTokens,
              strategy: "middle",
            })

            if (!result.truncated) return true

            const firstLine = lines[0]
            const lastLine = lines[lines.length - 1]

            // 开头和结尾都应该被保留
            return result.content.includes(firstLine) && result.content.includes(lastLine)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * 属性 3: JSON 截断有效性
   * 验证需求: 1.6
   */
  describe("属性 3: JSON 截断有效性", () => {
    it("截断后的 JSON 应该是有效的或包含截断指示器", () => {
      // 生成有效的 JSON 对象
      const jsonObjectArb = fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.integer(),
          fc.boolean(),
          fc.constant(null)
        ),
        { minKeys: 1, maxKeys: 20 }
      )

      fc.assert(
        fc.property(
          jsonObjectArb,
          fc.integer({ min: 50, max: 500 }),
          (obj, maxTokens) => {
            const json = JSON.stringify(obj)
            const result = truncator.truncateJson(json)

            if (!result.truncated) {
              // 未截断，应该是原始内容
              return result.content === json
            }

            // 截断后，要么是有效 JSON，要么包含截断指示器
            try {
              JSON.parse(result.content)
              return true
            } catch {
              return result.content.includes("截断") || result.content.includes("truncated")
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * 额外属性: 截断结果的 Token 数应该减少
   */
  describe("额外属性: 截断应减少 Token 数", () => {
    it("截断后的 Token 数应该小于或等于原始 Token 数", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 10000 }),
          fc.integer({ min: 50, max: 500 }),
          (content, maxTokens) => {
            const result = truncator.truncate(content, { maxOutputTokens: maxTokens })

            return result.finalTokens <= result.originalTokens
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * 额外属性: 截断指示器应该存在
   */
  describe("额外属性: 截断时应包含指示器", () => {
    it("截断后的内容应包含截断指示器", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 10000 }),
          (content) => {
            const result = truncator.truncate(content, { maxOutputTokens: 100 })

            if (!result.truncated) return true

            return result.content.includes("截断") || result.content.includes("truncated")
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
