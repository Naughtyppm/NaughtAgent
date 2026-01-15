import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  setInteractionCallbacks,
  getInteractionCallbacks,
  resetInteractionCallbacks,
  invokeQuestionCallback,
  invokeTodoUpdateCallback,
  createDefaultCliCallbacks,
} from "../../src/interaction/callbacks"
import type { Question, QuestionResult, TodoList } from "../../src/interaction/types"

describe("Interaction Callbacks", () => {
  beforeEach(() => {
    resetInteractionCallbacks()
  })

  afterEach(() => {
    resetInteractionCallbacks()
  })

  describe("setInteractionCallbacks / getInteractionCallbacks", () => {
    it("should set and get callbacks", () => {
      const onQuestion = vi.fn()
      const onTodoUpdate = vi.fn()

      setInteractionCallbacks({ onQuestion, onTodoUpdate })

      const callbacks = getInteractionCallbacks()
      expect(callbacks.onQuestion).toBe(onQuestion)
      expect(callbacks.onTodoUpdate).toBe(onTodoUpdate)
    })

    it("should merge callbacks", () => {
      const onQuestion = vi.fn()
      const onTodoUpdate = vi.fn()

      setInteractionCallbacks({ onQuestion })
      setInteractionCallbacks({ onTodoUpdate })

      const callbacks = getInteractionCallbacks()
      expect(callbacks.onQuestion).toBe(onQuestion)
      expect(callbacks.onTodoUpdate).toBe(onTodoUpdate)
    })
  })

  describe("resetInteractionCallbacks", () => {
    it("should clear all callbacks", () => {
      setInteractionCallbacks({
        onQuestion: vi.fn(),
        onTodoUpdate: vi.fn(),
      })

      resetInteractionCallbacks()

      const callbacks = getInteractionCallbacks()
      expect(callbacks.onQuestion).toBeUndefined()
      expect(callbacks.onTodoUpdate).toBeUndefined()
    })
  })

  describe("invokeQuestionCallback", () => {
    it("should invoke callback and return result", async () => {
      const mockResult: QuestionResult = {
        answered: true,
        value: "test",
      }
      const onQuestion = vi.fn().mockResolvedValue(mockResult)
      setInteractionCallbacks({ onQuestion })

      const question: Question = {
        type: "text",
        message: "Enter name:",
      }

      const result = await invokeQuestionCallback(question)

      expect(onQuestion).toHaveBeenCalledWith(question)
      expect(result).toEqual(mockResult)
    })

    it("should return default value when no callback", async () => {
      const question: Question = {
        type: "confirm",
        message: "Continue?",
        default: true,
      }

      const result = await invokeQuestionCallback(question)

      expect(result.answered).toBe(true)
      expect(result.value).toBe(true)
    })

    it("should return type-specific default when no default provided", async () => {
      // confirm defaults to false
      const confirmResult = await invokeQuestionCallback({
        type: "confirm",
        message: "Continue?",
      })
      expect(confirmResult.value).toBe(false)

      // text defaults to empty string
      const textResult = await invokeQuestionCallback({
        type: "text",
        message: "Enter:",
      })
      expect(textResult.value).toBe("")

      // multiselect defaults to empty array
      const multiselectResult = await invokeQuestionCallback({
        type: "multiselect",
        message: "Select:",
        options: [{ value: "a", label: "A" }],
      })
      expect(multiselectResult.value).toEqual([])

      // select defaults to first option
      const selectResult = await invokeQuestionCallback({
        type: "select",
        message: "Choose:",
        options: [
          { value: "first", label: "First" },
          { value: "second", label: "Second" },
        ],
      })
      expect(selectResult.value).toBe("first")
    })

    it("should handle callback errors", async () => {
      const onQuestion = vi.fn().mockRejectedValue(new Error("Callback error"))
      setInteractionCallbacks({ onQuestion })

      const result = await invokeQuestionCallback({
        type: "text",
        message: "Enter:",
      })

      expect(result.answered).toBe(false)
      expect(result.cancelled).toBe(true)
    })
  })

  describe("invokeTodoUpdateCallback", () => {
    it("should invoke callback with list", () => {
      const onTodoUpdate = vi.fn()
      setInteractionCallbacks({ onTodoUpdate })

      const list: TodoList = {
        sessionId: "test",
        items: [
          {
            id: "1",
            content: "Task 1",
            status: "pending",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }

      invokeTodoUpdateCallback(list)

      expect(onTodoUpdate).toHaveBeenCalledWith(list)
    })

    it("should not throw when no callback", () => {
      const list: TodoList = { sessionId: "test", items: [] }

      expect(() => invokeTodoUpdateCallback(list)).not.toThrow()
    })

    it("should ignore callback errors", () => {
      const onTodoUpdate = vi.fn().mockImplementation(() => {
        throw new Error("Callback error")
      })
      setInteractionCallbacks({ onTodoUpdate })

      const list: TodoList = { sessionId: "test", items: [] }

      expect(() => invokeTodoUpdateCallback(list)).not.toThrow()
    })
  })

  describe("createDefaultCliCallbacks", () => {
    it("should create callbacks object", () => {
      const callbacks = createDefaultCliCallbacks()

      expect(callbacks.onQuestion).toBeDefined()
      expect(callbacks.onTodoUpdate).toBeDefined()
    })

    it("should return default values for questions", async () => {
      const callbacks = createDefaultCliCallbacks()

      const result = await callbacks.onQuestion!({
        type: "confirm",
        message: "Continue?",
        default: true,
      })

      expect(result.answered).toBe(true)
      expect(result.value).toBe(true)
    })
  })
})
