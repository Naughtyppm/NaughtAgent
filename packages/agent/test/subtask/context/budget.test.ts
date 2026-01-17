/**
 * Token 预算管理测试
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  SimpleTokenCounter,
  TokenBudgetManager,
  createTokenBudgetManager,
  defaultTokenCounter,
} from "../../../src/subtask/context/budget"
import type { Message } from "../../../src/session"

describe("SimpleTokenCounter", () => {
  const counter = new SimpleTokenCounter()

  it("should count tokens for English text", () => {
    const text = "Hello, world!"
    const tokens = counter.count(text)
    // 13 chars / 4 = ~3-4 tokens
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(10)
  })

  it("should count tokens for Chinese text", () => {
    const text = "你好，世界！"
    const tokens = counter.count(text)
    // Chinese uses 1.5 chars per token
    expect(tokens).toBeGreaterThan(0)
  })

  it("should return 0 for empty text", () => {
    expect(counter.count("")).toBe(0)
    expect(counter.count(null as unknown as string)).toBe(0)
  })

  it("should count message tokens", () => {
    const message: Message = {
      id: "msg_1",
      role: "user",
      content: [{ type: "text", text: "Hello, world!" }],
      timestamp: Date.now(),
    }
    const tokens = counter.countMessage(message)
    expect(tokens).toBeGreaterThan(0)
  })

  it("should count tool_use blocks", () => {
    const message: Message = {
      id: "msg_1",
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tool_1",
          name: "read_file",
          input: { path: "test.ts" },
        },
      ],
      timestamp: Date.now(),
    }
    const tokens = counter.countMessage(message)
    expect(tokens).toBeGreaterThan(0)
  })

  it("should count multiple messages", () => {
    const messages: Message[] = [
      {
        id: "msg_1",
        role: "user",
        content: [{ type: "text", text: "Hello" }],
        timestamp: Date.now(),
      },
      {
        id: "msg_2",
        role: "assistant",
        content: [{ type: "text", text: "Hi there!" }],
        timestamp: Date.now(),
      },
    ]
    const tokens = counter.countMessages(messages)
    expect(tokens).toBeGreaterThan(counter.countMessage(messages[0]))
  })
})

describe("TokenBudgetManager", () => {
  let manager: TokenBudgetManager

  beforeEach(() => {
    manager = createTokenBudgetManager({
      total: 10000,
      system: 1000,
      context: 3000,
      history: 4000,
      response: 2000,
    })
  })

  it("should initialize with correct budget", () => {
    const budget = manager.getBudget()
    expect(budget.total).toBe(10000)
    expect(budget.system).toBe(1000)
  })

  it("should track used tokens", () => {
    manager.allocateSystem("Hello, world!")
    const used = manager.getUsed()
    expect(used.system).toBeGreaterThan(0)
    expect(used.context).toBe(0)
    expect(used.history).toBe(0)
  })

  it("should calculate remaining budget", () => {
    const initialRemaining = manager.getRemaining()
    expect(initialRemaining.system).toBe(1000)

    manager.allocateSystem("Hello, world!")
    const afterRemaining = manager.getRemaining()
    expect(afterRemaining.system).toBeLessThan(1000)
  })

  it("should detect truncation when over budget", () => {
    const longText = "a".repeat(5000) // ~1250 tokens
    const { truncated } = manager.allocateSystem(longText)
    expect(truncated).toBe(true)
  })

  it("should not truncate when within budget", () => {
    const shortText = "Hello"
    const { truncated } = manager.allocateSystem(shortText)
    expect(truncated).toBe(false)
  })

  it("should allocate history messages", () => {
    const messages: Message[] = Array.from({ length: 10 }, (_, i) => ({
      id: `msg_${i}`,
      role: "user" as const,
      content: [{ type: "text" as const, text: `Message ${i}` }],
      timestamp: Date.now(),
    }))

    const { keptMessages, truncated } = manager.allocateHistory(messages)
    expect(keptMessages).toBeGreaterThan(0)
    expect(keptMessages).toBeLessThanOrEqual(messages.length)
  })

  it("should detect over budget", () => {
    expect(manager.isOverBudget()).toBe(false)

    // The allocate methods cap at budget limits, so we need to check
    // that after allocating to all categories, the total is tracked correctly
    // Since allocate caps at budget, isOverBudget checks if used > total - response
    // With budget: total=10000, system=1000, context=3000, history=4000, response=2000
    // Max usable = 10000 - 2000 = 8000
    // If we allocate system=1000, context=3000, history=4000, total=8000, not over budget

    // Let's verify the logic works correctly
    manager.allocateSystem("a".repeat(5000)) // Will cap at 1000 tokens
    manager.allocateContext("b".repeat(15000)) // Will cap at 3000 tokens
    manager.allocateHistory([
      {
        id: "msg_1",
        role: "user",
        content: [{ type: "text", text: "c".repeat(20000) }],
        timestamp: Date.now(),
      },
    ]) // Will cap at 4000 tokens

    // Total used = 1000 + 3000 + 4000 = 8000
    // Max allowed = 10000 - 2000 = 8000
    // So it's exactly at budget, not over
    expect(manager.isOverBudget()).toBe(false)

    // To test over budget, we need a scenario where the budget is exceeded
    // This happens when the sum of individual budgets exceeds total - response
    const overBudgetManager = createTokenBudgetManager({
      total: 100,
      system: 50,
      context: 50,
      history: 50,
      response: 20,
    })

    // Max allowed = 100 - 20 = 80
    // But system + context + history = 150, so if all are used, it's over
    overBudgetManager.allocateSystem("a".repeat(500)) // Uses up to 50
    overBudgetManager.allocateContext("b".repeat(500)) // Uses up to 50
    overBudgetManager.allocateHistory([
      {
        id: "msg_1",
        role: "user",
        content: [{ type: "text", text: "c".repeat(500) }],
        timestamp: Date.now(),
      },
    ]) // Uses up to 50

    // Total used = 50 + 50 + 50 = 150 > 80
    expect(overBudgetManager.isOverBudget()).toBe(true)
  })

  it("should reset usage", () => {
    manager.allocateSystem("Hello")
    manager.reset()
    const used = manager.getUsed()
    expect(used.system).toBe(0)
    expect(used.context).toBe(0)
    expect(used.history).toBe(0)
  })

  it("should truncate text to token limit", () => {
    const longText = "a".repeat(1000)
    const truncated = manager.truncateText(longText, 50)
    expect(truncated.length).toBeLessThan(longText.length)
    expect(truncated.endsWith("...")).toBe(true)
  })

  it("should truncate messages to token limit", () => {
    const messages: Message[] = Array.from({ length: 100 }, (_, i) => ({
      id: `msg_${i}`,
      role: "user" as const,
      content: [{ type: "text" as const, text: `This is message number ${i}` }],
      timestamp: Date.now(),
    }))

    const truncated = manager.truncateMessages(messages, 100)
    expect(truncated.length).toBeLessThan(messages.length)
    // Should keep most recent messages
    expect(truncated[truncated.length - 1].id).toBe(messages[messages.length - 1].id)
  })
})

describe("defaultTokenCounter", () => {
  it("should be a SimpleTokenCounter instance", () => {
    expect(defaultTokenCounter).toBeInstanceOf(SimpleTokenCounter)
  })

  it("should count tokens", () => {
    const tokens = defaultTokenCounter.count("Hello, world!")
    expect(tokens).toBeGreaterThan(0)
  })
})
