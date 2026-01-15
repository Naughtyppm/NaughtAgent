import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QuestionTool } from "../../src/interaction/question"
import {
  setInteractionCallbacks,
  resetInteractionCallbacks,
} from "../../src/interaction/callbacks"
import type { QuestionResult } from "../../src/interaction/types"

describe("Question Tool", () => {
  beforeEach(() => {
    resetInteractionCallbacks()
  })

  afterEach(() => {
    resetInteractionCallbacks()
  })

  describe("QuestionTool definition", () => {
    it("should have correct id", () => {
      expect(QuestionTool.id).toBe("question")
    })

    it("should have description", () => {
      expect(QuestionTool.description).toBeDefined()
      expect(QuestionTool.description.length).toBeGreaterThan(0)
    })
  })

  describe("QuestionTool.execute - confirm", () => {
    it("should ask confirm question", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: true,
        value: true,
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "confirm",
          message: "Continue?",
        },
        { cwd: "/test" }
      )

      expect(onQuestion).toHaveBeenCalledWith({
        type: "confirm",
        message: "Continue?",
        options: undefined,
        default: undefined,
      })
      expect(result.output).toContain("Yes")
      expect(result.metadata?.value).toBe(true)
    })

    it("should handle confirm with default", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: true,
        value: false,
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "confirm",
          message: "Delete?",
          default: false,
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("No")
      expect(result.metadata?.value).toBe(false)
    })
  })

  describe("QuestionTool.execute - select", () => {
    it("should ask select question", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: true,
        value: "typescript",
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "select",
          message: "Choose language:",
          options: [
            { value: "typescript", label: "TypeScript" },
            { value: "javascript", label: "JavaScript" },
          ],
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("typescript")
      expect(result.metadata?.value).toBe("typescript")
    })

    it("should require options for select", async () => {
      await expect(
        QuestionTool.execute(
          {
            type: "select",
            message: "Choose:",
            // options missing
          },
          { cwd: "/test" }
        )
      ).rejects.toThrow("Options are required")
    })

    it("should require non-empty options for select", async () => {
      await expect(
        QuestionTool.execute(
          {
            type: "select",
            message: "Choose:",
            options: [],
          },
          { cwd: "/test" }
        )
      ).rejects.toThrow("Options are required")
    })
  })

  describe("QuestionTool.execute - multiselect", () => {
    it("should ask multiselect question", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: true,
        value: ["eslint", "prettier"],
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "multiselect",
          message: "Select tools:",
          options: [
            { value: "eslint", label: "ESLint" },
            { value: "prettier", label: "Prettier" },
            { value: "typescript", label: "TypeScript" },
          ],
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("eslint, prettier")
      expect(result.metadata?.value).toEqual(["eslint", "prettier"])
    })

    it("should handle empty selection", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: true,
        value: [],
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "multiselect",
          message: "Select:",
          options: [{ value: "a", label: "A" }],
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("none selected")
    })
  })

  describe("QuestionTool.execute - text", () => {
    it("should ask text question", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: true,
        value: "my-project",
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "text",
          message: "Project name:",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("my-project")
      expect(result.metadata?.value).toBe("my-project")
    })

    it("should handle empty text", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: true,
        value: "",
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "text",
          message: "Name:",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("empty")
    })
  })

  describe("QuestionTool.execute - cancelled", () => {
    it("should handle cancelled question", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: false,
        value: null,
        cancelled: true,
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "confirm",
          message: "Continue?",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("cancelled")
      expect(result.metadata?.cancelled).toBe(true)
    })

    it("should handle unanswered question", async () => {
      const onQuestion = vi.fn().mockResolvedValue({
        answered: false,
        value: null,
      } as QuestionResult)
      setInteractionCallbacks({ onQuestion })

      const result = await QuestionTool.execute(
        {
          type: "text",
          message: "Name:",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("not answered")
    })
  })

  describe("QuestionTool.execute - validation", () => {
    it("should validate confirm default type", async () => {
      await expect(
        QuestionTool.execute(
          {
            type: "confirm",
            message: "Continue?",
            default: "yes" as any, // should be boolean
          },
          { cwd: "/test" }
        )
      ).rejects.toThrow("must be boolean")
    })

    it("should validate select default type", async () => {
      await expect(
        QuestionTool.execute(
          {
            type: "select",
            message: "Choose:",
            options: [{ value: "a", label: "A" }],
            default: true as any, // should be string
          },
          { cwd: "/test" }
        )
      ).rejects.toThrow("must be string")
    })

    it("should validate multiselect default type", async () => {
      await expect(
        QuestionTool.execute(
          {
            type: "multiselect",
            message: "Select:",
            options: [{ value: "a", label: "A" }],
            default: "a" as any, // should be array
          },
          { cwd: "/test" }
        )
      ).rejects.toThrow("must be array")
    })
  })

  describe("QuestionTool.execute - metadata", () => {
    it("should include type in metadata", async () => {
      setInteractionCallbacks({
        onQuestion: vi.fn().mockResolvedValue({ answered: true, value: true }),
      })

      const result = await QuestionTool.execute(
        { type: "confirm", message: "Test?" },
        { cwd: "/test" }
      )

      expect(result.metadata?.type).toBe("confirm")
    })

    it("should include answered in metadata", async () => {
      setInteractionCallbacks({
        onQuestion: vi.fn().mockResolvedValue({ answered: true, value: "x" }),
      })

      const result = await QuestionTool.execute(
        { type: "text", message: "Test?" },
        { cwd: "/test" }
      )

      expect(result.metadata?.answered).toBe(true)
    })
  })
})
