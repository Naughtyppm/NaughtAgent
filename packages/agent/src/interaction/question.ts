/**
 * Question 工具 - 向用户提问
 *
 * 支持四种问题类型：
 * - confirm: 是/否确认
 * - select: 单选
 * - multiselect: 多选
 * - text: 文本输入
 */

import { z } from "zod"
import { Tool } from "../tool/tool"
import { invokeQuestionCallback } from "./callbacks"
import type { Question, QuestionResult, QuestionType } from "./types"

const DESCRIPTION = `Ask the user a question and wait for their response.

Question types:
- **confirm**: Yes/No question. Returns boolean.
- **select**: Single choice from options. Returns selected value.
- **multiselect**: Multiple choices from options. Returns array of values.
- **text**: Free text input. Returns string.

Use this tool when you need to:
- Clarify ambiguous requirements
- Get user confirmation before risky operations
- Let user choose between options
- Collect additional information

Examples:
- Confirm: { type: "confirm", message: "Proceed with deletion?" }
- Select: { type: "select", message: "Choose framework:", options: [...] }
- Text: { type: "text", message: "Enter project name:" }`

/**
 * Question 工具参数 Schema
 */
const QuestionParamsSchema = z.object({
  /** 问题类型 */
  type: z
    .enum(["confirm", "select", "multiselect", "text"])
    .describe("Question type: confirm (yes/no), select (single choice), multiselect (multiple choices), text (free input)"),

  /** 问题文本 */
  message: z
    .string()
    .min(1)
    .describe("The question to ask the user"),

  /** 选项（select/multiselect 时必需） */
  options: z
    .array(
      z.object({
        value: z.string().describe("Option value returned when selected"),
        label: z.string().describe("Display label for the option"),
        description: z.string().optional().describe("Optional description"),
      })
    )
    .optional()
    .describe("Options for select/multiselect questions"),

  /** 默认值 */
  default: z
    .union([z.string(), z.boolean(), z.array(z.string())])
    .optional()
    .describe("Default value if user doesn't provide input"),
})

export type QuestionParams = z.infer<typeof QuestionParamsSchema>

/**
 * Question 工具定义
 */
export const QuestionTool = Tool.define({
  id: "question",
  description: DESCRIPTION,
  parameters: QuestionParamsSchema,

  async execute(params, ctx) {
    // 验证参数
    const validationError = validateQuestionParams(params)
    if (validationError) {
      throw new Error(validationError)
    }

    // 构建问题
    const question: Question = {
      type: params.type as QuestionType,
      message: params.message,
      options: params.options,
      default: params.default,
    }

    // 调用回调获取用户回答
    const result = await invokeQuestionCallback(question)

    // 格式化输出
    const output = formatQuestionResult(question, result)

    return {
      title: `question: ${params.type}`,
      output,
      metadata: {
        type: params.type,
        answered: result.answered,
        cancelled: result.cancelled,
        value: result.value,
      },
    }
  },
})

/**
 * 验证问题参数
 */
function validateQuestionParams(params: QuestionParams): string | null {
  // select/multiselect 必须有选项
  if (params.type === "select" || params.type === "multiselect") {
    if (!params.options || params.options.length === 0) {
      return `Options are required for ${params.type} questions`
    }
  }

  // 验证默认值类型
  if (params.default !== undefined) {
    switch (params.type) {
      case "confirm":
        if (typeof params.default !== "boolean") {
          return "Default value for confirm must be boolean"
        }
        break
      case "select":
      case "text":
        if (typeof params.default !== "string") {
          return `Default value for ${params.type} must be string`
        }
        break
      case "multiselect":
        if (!Array.isArray(params.default)) {
          return "Default value for multiselect must be array"
        }
        break
    }
  }

  return null
}

/**
 * 格式化问题结果
 */
function formatQuestionResult(question: Question, result: QuestionResult): string {
  if (result.cancelled) {
    return `Question cancelled: ${question.message}`
  }

  if (!result.answered) {
    return `Question not answered: ${question.message}`
  }

  const valueStr = formatValue(result.value)
  return `User answered: ${valueStr}`
}

/**
 * 格式化值
 */
function formatValue(value: string | boolean | string[] | null): string {
  if (value === null) {
    return "(no answer)"
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "(none selected)"
  }
  return value || "(empty)"
}
