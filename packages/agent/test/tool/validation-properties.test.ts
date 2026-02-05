import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { z } from "zod"
import { Tool } from "../../src/tool/tool"
import { AgentError, ErrorCode } from "../../src/error"
import { createTestContext } from "../helpers/context"

/**
 * Feature: phase-2-tool-layer, Property 13: 参数验证失败返回 ValidationError
 *
 * 对于任何无效的参数输入，工具执行应该：
 * 1. 抛出 AgentError 实例
 * 2. 错误码为 INVALID_REQUEST
 * 3. 包含详细的字段级错误信息
 * 4. 错误不可恢复（recoverable: false）
 *
 * Validates: Requirements 4.5, 8.3
 */
describe("Tool Validation Properties", () => {
  describe("Property 13: 参数验证失败返回 ValidationError", () => {
    it("should return ValidationError for invalid string parameters", async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成非字符串值
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.array(fc.integer())
          ),
          async (invalidValue) => {
            const tool = Tool.define({
              id: "string-param-tool",
              description: "Tool requiring string parameter",
              parameters: z.object({
                name: z.string(),
              }),
              async execute(params) {
                return { title: "OK", output: params.name }
              },
            })

            const ctx = createTestContext()

            try {
              await tool.execute({ name: invalidValue }, ctx)
              // 如果没有抛出错误，测试失败
              expect.fail("Should have thrown an error")
            } catch (error) {
              // 验证错误类型
              expect(error).toBeInstanceOf(AgentError)
              const agentError = error as AgentError
              expect(agentError.code).toBe(ErrorCode.INVALID_REQUEST)
              expect(agentError.recoverable).toBe(false)

              // 验证错误上下文包含字段级错误
              expect(agentError.context).toBeDefined()
              expect(agentError.context?.tool).toBe("string-param-tool")
              expect(agentError.context?.fieldErrors).toBeDefined()
              expect(Array.isArray(agentError.context?.fieldErrors)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should return ValidationError for invalid number parameters", async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成非数字值
          fc.oneof(
            fc.string(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.array(fc.string())
          ),
          async (invalidValue) => {
            const tool = Tool.define({
              id: "number-param-tool",
              description: "Tool requiring number parameter",
              parameters: z.object({
                count: z.number(),
              }),
              async execute(params) {
                return { title: "OK", output: String(params.count) }
              },
            })

            const ctx = createTestContext()

            try {
              await tool.execute({ count: invalidValue }, ctx)
              expect.fail("Should have thrown an error")
            } catch (error) {
              expect(error).toBeInstanceOf(AgentError)
              const agentError = error as AgentError
              expect(agentError.code).toBe(ErrorCode.INVALID_REQUEST)
              expect(agentError.recoverable).toBe(false)
              expect(agentError.context?.fieldErrors).toBeDefined()
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should return ValidationError for missing required parameters", async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成空对象或缺少必需字段的对象
          fc.oneof(
            fc.constant({}),
            fc.record({ other: fc.string() }),
            fc.constant(null),
            fc.constant(undefined)
          ),
          async (invalidParams) => {
            const tool = Tool.define({
              id: "required-param-tool",
              description: "Tool with required parameters",
              parameters: z.object({
                required1: z.string(),
                required2: z.number(),
              }),
              async execute(params) {
                return {
                  title: "OK",
                  output: `${params.required1}-${params.required2}`,
                }
              },
            })

            const ctx = createTestContext()

            try {
              await tool.execute(invalidParams as any, ctx)
              expect.fail("Should have thrown an error")
            } catch (error) {
              expect(error).toBeInstanceOf(AgentError)
              const agentError = error as AgentError
              expect(agentError.code).toBe(ErrorCode.INVALID_REQUEST)
              expect(agentError.recoverable).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should return ValidationError for constraint violations", async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成违反约束的值
          fc.oneof(
            fc.integer({ max: 0 }), // 小于等于 0
            fc.integer({ min: 101 }) // 大于 100
          ),
          async (invalidValue) => {
            const tool = Tool.define({
              id: "constraint-tool",
              description: "Tool with constrained parameters",
              parameters: z.object({
                value: z.number().min(1).max(100),
              }),
              async execute(params) {
                return { title: "OK", output: String(params.value) }
              },
            })

            const ctx = createTestContext()

            try {
              await tool.execute({ value: invalidValue }, ctx)
              expect.fail("Should have thrown an error")
            } catch (error) {
              expect(error).toBeInstanceOf(AgentError)
              const agentError = error as AgentError
              expect(agentError.code).toBe(ErrorCode.INVALID_REQUEST)
              expect(agentError.recoverable).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should include field path in error details for nested objects", async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成无效的嵌套对象
          fc.oneof(
            fc.constant({ user: { name: 123 } }), // name 应该是字符串
            fc.constant({ user: { name: "test", age: "invalid" } }), // age 应该是数字
            fc.constant({ user: null }), // user 不能是 null
            fc.constant({}) // 缺少 user
          ),
          async (invalidParams) => {
            const tool = Tool.define({
              id: "nested-param-tool",
              description: "Tool with nested parameters",
              parameters: z.object({
                user: z.object({
                  name: z.string(),
                  age: z.number().optional(),
                }),
              }),
              async execute(params) {
                return { title: "OK", output: params.user.name }
              },
            })

            const ctx = createTestContext()

            try {
              await tool.execute(invalidParams as any, ctx)
              expect.fail("Should have thrown an error")
            } catch (error) {
              expect(error).toBeInstanceOf(AgentError)
              const agentError = error as AgentError
              expect(agentError.code).toBe(ErrorCode.INVALID_REQUEST)
              expect(agentError.context?.fieldErrors).toBeDefined()

              // 验证字段路径格式正确
              const fieldErrors = agentError.context
                ?.fieldErrors as Tool.FieldError[]
              expect(fieldErrors.length).toBeGreaterThan(0)
              fieldErrors.forEach((fe) => {
                expect(fe.path).toBeDefined()
                expect(fe.message).toBeDefined()
                expect(fe.code).toBeDefined()
              })
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should include field path in error details for array items", async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成包含无效数组项的参数
          fc.oneof(
            fc.constant({ items: [1, 2, "invalid", 4] }), // 数组中有非数字
            fc.constant({ items: "not-an-array" }), // 不是数组
            fc.constant({ items: [null] }) // 数组中有 null
          ),
          async (invalidParams) => {
            const tool = Tool.define({
              id: "array-param-tool",
              description: "Tool with array parameters",
              parameters: z.object({
                items: z.array(z.number()),
              }),
              async execute(params) {
                return { title: "OK", output: params.items.join(",") }
              },
            })

            const ctx = createTestContext()

            try {
              await tool.execute(invalidParams as any, ctx)
              expect.fail("Should have thrown an error")
            } catch (error) {
              expect(error).toBeInstanceOf(AgentError)
              const agentError = error as AgentError
              expect(agentError.code).toBe(ErrorCode.INVALID_REQUEST)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should handle multiple validation errors", async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成有多个错误的参数
          fc.constant({
            name: 123, // 应该是字符串
            age: "invalid", // 应该是数字
            email: 456, // 应该是字符串
          }),
          async (invalidParams) => {
            const tool = Tool.define({
              id: "multi-error-tool",
              description: "Tool with multiple parameters",
              parameters: z.object({
                name: z.string(),
                age: z.number(),
                email: z.string().email(),
              }),
              async execute(params) {
                return { title: "OK", output: params.name }
              },
            })

            const ctx = createTestContext()

            try {
              await tool.execute(invalidParams as any, ctx)
              expect.fail("Should have thrown an error")
            } catch (error) {
              expect(error).toBeInstanceOf(AgentError)
              const agentError = error as AgentError
              expect(agentError.code).toBe(ErrorCode.INVALID_REQUEST)

              // 验证包含多个字段错误
              const fieldErrors = agentError.context
                ?.fieldErrors as Tool.FieldError[]
              expect(fieldErrors.length).toBeGreaterThanOrEqual(2)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should preserve original Zod errors in context", async () => {
      await fc.assert(
        fc.asyncProperty(fc.string(), async (toolId) => {
          // 确保 toolId 非空
          const safeToolId = toolId.trim() || "test-tool"

          const tool = Tool.define({
            id: safeToolId,
            description: "Test tool",
            parameters: z.object({
              value: z.string(),
            }),
            async execute(params) {
              return { title: "OK", output: params.value }
            },
          })

          const ctx = createTestContext()

          try {
            await tool.execute({ value: 123 } as any, ctx)
            expect.fail("Should have thrown an error")
          } catch (error) {
            expect(error).toBeInstanceOf(AgentError)
            const agentError = error as AgentError

            // 验证保留了原始 Zod 错误
            expect(agentError.context?.zodErrors).toBeDefined()
            expect(Array.isArray(agentError.context?.zodErrors)).toBe(true)
          }
        }),
        { numRuns: 100 }
      )
    })
  })

  describe("formatZodErrors", () => {
    it("should format simple field errors correctly", () => {
      fc.assert(
        fc.property(
          fc.record({
            fieldName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
          }),
          ({ fieldName }) => {
            const schema = z.object({
              [fieldName]: z.string(),
            })

            try {
              schema.parse({ [fieldName]: 123 })
              expect.fail("Should have thrown")
            } catch (error) {
              if (error instanceof z.ZodError) {
                const fieldErrors = Tool.formatZodErrors(error)
                expect(fieldErrors.length).toBe(1)
                expect(fieldErrors[0].path).toBe(fieldName)
                expect(fieldErrors[0].code).toBe("invalid_type")
                expect(fieldErrors[0].expected).toBe("string")
                expect(fieldErrors[0].received).toBe("number")
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should format nested field paths correctly", () => {
      fc.assert(
        fc.property(
          fc.record({
            outer: fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
            inner: fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
          }),
          ({ outer, inner }) => {
            const schema = z.object({
              [outer]: z.object({
                [inner]: z.number(),
              }),
            })

            try {
              schema.parse({ [outer]: { [inner]: "invalid" } })
              expect.fail("Should have thrown")
            } catch (error) {
              if (error instanceof z.ZodError) {
                const fieldErrors = Tool.formatZodErrors(error)
                expect(fieldErrors.length).toBe(1)
                expect(fieldErrors[0].path).toBe(`${outer}.${inner}`)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should format array index paths correctly", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          (index) => {
            const schema = z.object({
              items: z.array(z.string()),
            })

            // 创建一个数组，在指定索引处放入无效值
            const items = Array(index + 1).fill("valid")
            items[index] = 123 as any

            try {
              schema.parse({ items })
              expect.fail("Should have thrown")
            } catch (error) {
              if (error instanceof z.ZodError) {
                const fieldErrors = Tool.formatZodErrors(error)
                expect(fieldErrors.length).toBe(1)
                expect(fieldErrors[0].path).toBe(`items[${index}]`)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe("formatValidationErrorMessage", () => {
    it("should format single error message correctly", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (toolId, path, message) => {
            const fieldErrors: Tool.FieldError[] = [
              { path, message, code: "invalid_type" },
            ]

            const result = Tool.formatValidationErrorMessage(toolId, fieldErrors)

            expect(result).toContain(toolId)
            expect(result).toContain(path)
            expect(result.toLowerCase()).toContain(message.toLowerCase())
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should truncate multiple errors to 3", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.array(
            fc.record({
              path: fc.string({ minLength: 1, maxLength: 20 }),
              message: fc.string({ minLength: 1, maxLength: 50 }),
              code: fc.constant("invalid_type"),
            }),
            { minLength: 4, maxLength: 10 }
          ),
          (toolId, errors) => {
            const fieldErrors = errors as Tool.FieldError[]
            const result = Tool.formatValidationErrorMessage(toolId, fieldErrors)

            // 应该包含 "and X more errors" 的提示
            expect(result).toContain("more errors")
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should handle empty field errors", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 30 }), (toolId) => {
          const result = Tool.formatValidationErrorMessage(toolId, [])
          expect(result).toContain(toolId)
          expect(result).toContain("Invalid parameters")
        }),
        { numRuns: 100 }
      )
    })
  })

  describe("executeToolWithErrorHandling", () => {
    it("should return AgentError unchanged", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (toolId, message) => {
            const originalError = new AgentError(
              message,
              ErrorCode.TOOL_EXECUTION_ERROR,
              true,
              { custom: "context" }
            )

            const result = Tool.executeToolWithErrorHandling(
              originalError,
              toolId
            )

            // 应该返回相同的错误实例
            expect(result).toBe(originalError)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should classify permission errors correctly", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom(
            "permission denied",
            "EACCES: permission denied",
            "EPERM: operation not permitted"
          ),
          (toolId, errorMessage) => {
            const error = new Error(errorMessage)
            const result = Tool.executeToolWithErrorHandling(error, toolId)

            expect(result.code).toBe(ErrorCode.PERMISSION_DENIED)
            expect(result.recoverable).toBe(false)
            expect(result.context?.errorType).toBe("PermissionError")
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should classify connection errors correctly", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom(
            "ECONNREFUSED",
            "ECONNRESET",
            "ENOTFOUND",
            "connection refused"
          ),
          (toolId, errorMessage) => {
            const error = new Error(errorMessage)
            const result = Tool.executeToolWithErrorHandling(error, toolId)

            expect(result.code).toBe(ErrorCode.NETWORK_ERROR)
            expect(result.recoverable).toBe(true)
            expect(result.context?.errorType).toBe("ConnectionError")
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should classify timeout errors correctly", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom("timeout", "TIMEOUT", "operation timed out"),
          (toolId, errorMessage) => {
            const error = new Error(errorMessage)
            const result = Tool.executeToolWithErrorHandling(error, toolId)

            expect(result.code).toBe(ErrorCode.TIMEOUT)
            expect(result.recoverable).toBe(true)
            expect(result.context?.errorType).toBe("TimeoutError")
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should classify generic errors as ToolExecutionError", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 100 }).filter(
            (s) =>
              !s.includes("permission") &&
              !s.includes("EACCES") &&
              !s.includes("EPERM") &&
              !s.includes("ECONN") &&
              !s.includes("ENOTFOUND") &&
              !s.includes("timeout") &&
              !s.includes("connection")
          ),
          (toolId, errorMessage) => {
            const error = new Error(errorMessage)
            const result = Tool.executeToolWithErrorHandling(error, toolId)

            expect(result.code).toBe(ErrorCode.TOOL_EXECUTION_ERROR)
            expect(result.recoverable).toBe(true)
            expect(result.context?.errorType).toBe("ToolExecutionError")
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should preserve original error information in context", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (toolId, errorMessage) => {
            const error = new Error(errorMessage)
            const result = Tool.executeToolWithErrorHandling(error, toolId)

            expect(result.context?.tool).toBe(toolId)
            expect(result.context?.originalError).toBeDefined()

            const originalError = result.context?.originalError as {
              name: string
              message: string
            }
            expect(originalError.name).toBe("Error")
            expect(originalError.message).toBe(errorMessage)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should handle non-Error objects", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
          (toolId, errorValue) => {
            const result = Tool.executeToolWithErrorHandling(errorValue, toolId)

            expect(result).toBeInstanceOf(AgentError)
            expect(result.context?.tool).toBe(toolId)
            expect(result.context?.originalError).toBe(errorValue)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe("Error type detection", () => {
    it("should detect ValidationError for ZodError", () => {
      fc.assert(
        fc.property(fc.string(), () => {
          const schema = z.string()
          try {
            schema.parse(123)
          } catch (error) {
            const errorType = Tool.detectErrorType(error)
            expect(errorType).toBe("ValidationError")
          }
        }),
        { numRuns: 100 }
      )
    })

    it("should map error types to correct error codes", () => {
      const errorTypes: Tool.ToolErrorType[] = [
        "ValidationError",
        "ConnectionError",
        "ToolExecutionError",
        "PermissionError",
        "TimeoutError",
      ]

      const expectedCodes: Record<Tool.ToolErrorType, ErrorCode> = {
        ValidationError: ErrorCode.INVALID_REQUEST,
        ConnectionError: ErrorCode.NETWORK_ERROR,
        ToolExecutionError: ErrorCode.TOOL_EXECUTION_ERROR,
        PermissionError: ErrorCode.PERMISSION_DENIED,
        TimeoutError: ErrorCode.TIMEOUT,
      }

      fc.assert(
        fc.property(fc.constantFrom(...errorTypes), (errorType) => {
          const code = Tool.getErrorCodeForType(errorType)
          expect(code).toBe(expectedCodes[errorType])
        }),
        { numRuns: 100 }
      )
    })

    it("should correctly determine recoverability", () => {
      const nonRecoverable: Tool.ToolErrorType[] = [
        "ValidationError",
        "PermissionError",
      ]
      const recoverable: Tool.ToolErrorType[] = [
        "ConnectionError",
        "ToolExecutionError",
        "TimeoutError",
      ]

      fc.assert(
        fc.property(fc.constantFrom(...nonRecoverable), (errorType) => {
          expect(Tool.isRecoverableError(errorType)).toBe(false)
        }),
        { numRuns: 100 }
      )

      fc.assert(
        fc.property(fc.constantFrom(...recoverable), (errorType) => {
          expect(Tool.isRecoverableError(errorType)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })
})
