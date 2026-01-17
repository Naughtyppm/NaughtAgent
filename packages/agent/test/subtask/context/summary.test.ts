/**
 * 上下文摘要测试
 */

import { describe, it, expect } from "vitest"
import {
  evaluateMessageImportance,
  compressBySlidingWindow,
  compressByImportance,
  compressMessages,
  extractKeyFiles,
  extractKeyDecisions,
  generateSimpleSummary,
} from "../../../src/subtask/context/summary"
import type { Message } from "../../../src/session"

// Helper to create test messages
function createMessage(
  role: "user" | "assistant",
  text: string,
  index: number
): Message {
  return {
    id: `msg_${index}`,
    role,
    content: [{ type: "text", text }],
    timestamp: Date.now() + index,
  }
}

function createToolMessage(
  toolName: string,
  input: Record<string, unknown>,
  index: number
): Message {
  return {
    id: `msg_${index}`,
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: `tool_${index}`,
        name: toolName,
        input,
      },
    ],
    timestamp: Date.now() + index,
  }
}

describe("evaluateMessageImportance", () => {
  it("should give higher score to recent messages", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      createMessage("user", `Message ${i}`, i)
    )

    const firstScore = evaluateMessageImportance(messages[0], 0, 10)
    const lastScore = evaluateMessageImportance(messages[9], 9, 10)

    expect(lastScore.score).toBeGreaterThan(firstScore.score)
  })

  it("should give higher score to user messages", () => {
    const userMsg = createMessage("user", "Hello", 0)
    const assistantMsg = createMessage("assistant", "Hello", 1)

    const userScore = evaluateMessageImportance(userMsg, 0, 2)
    const assistantScore = evaluateMessageImportance(assistantMsg, 1, 2)

    // User messages get +10 bonus
    expect(userScore.reason).toContain("user_input")
  })

  it("should give higher score to messages with tool_use", () => {
    const toolMsg = createToolMessage("read_file", { path: "test.ts" }, 0)
    const textMsg = createMessage("assistant", "Hello", 1)

    const toolScore = evaluateMessageImportance(toolMsg, 0, 2)
    const textScore = evaluateMessageImportance(textMsg, 1, 2)

    expect(toolScore.reason).toContain("tool_use")
  })

  it("should give higher score to messages with error keywords", () => {
    const errorMsg = createMessage("assistant", "Error: something went wrong", 0)
    const normalMsg = createMessage("assistant", "Everything is fine", 1)

    const errorScore = evaluateMessageImportance(errorMsg, 0, 2)
    const normalScore = evaluateMessageImportance(normalMsg, 1, 2)

    expect(errorScore.reason).toContain("error")
  })
})

describe("compressBySlidingWindow", () => {
  it("should keep all messages if under window size", () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      createMessage("user", `Message ${i}`, i)
    )

    const result = compressBySlidingWindow(messages, 10)
    expect(result.length).toBe(5)
  })

  it("should keep only recent messages if over window size", () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      createMessage("user", `Message ${i}`, i)
    )

    const result = compressBySlidingWindow(messages, 10)
    expect(result.length).toBe(10)
    expect(result[0].id).toBe("msg_10")
    expect(result[9].id).toBe("msg_19")
  })
})

describe("compressByImportance", () => {
  it("should keep all messages if under keep count", () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      createMessage("user", `Message ${i}`, i)
    )

    const result = compressByImportance(messages, 10)
    expect(result.length).toBe(5)
  })

  it("should keep most important messages", () => {
    const messages = [
      createMessage("user", "Normal message", 0),
      createMessage("assistant", "Error: something failed", 1),
      createMessage("user", "Another normal message", 2),
      createToolMessage("read_file", { path: "test.ts" }, 3),
      createMessage("assistant", "Normal response", 4),
    ]

    const result = compressByImportance(messages, 3)
    expect(result.length).toBe(3)
    // Should include error message and tool message
  })
})

describe("compressMessages", () => {
  it("should use sliding_window strategy by default", () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      createMessage("user", `Message ${i}`, i)
    )

    const result = compressMessages(messages, {
      strategy: "sliding_window",
      windowSize: 20,
    })

    expect(result.length).toBe(20)
  })

  it("should use importance strategy when specified", () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      createMessage("user", `Message ${i}`, i)
    )

    const result = compressMessages(messages, {
      strategy: "importance",
      keepImportant: 10,
    })

    expect(result.length).toBe(10)
  })
})

describe("extractKeyFiles", () => {
  it("should extract file paths from tool_use", () => {
    const messages: Message[] = [
      createToolMessage("read_file", { path: "src/index.ts" }, 0),
      createToolMessage("write_file", { file: "src/utils.ts" }, 1),
    ]

    const files = extractKeyFiles(messages)
    expect(files).toContain("src/index.ts")
    expect(files).toContain("src/utils.ts")
  })

  it("should extract file paths from text", () => {
    const messages: Message[] = [
      createMessage("assistant", "I read the file src/components/Button.ts and found the issue", 0),
    ]

    const files = extractKeyFiles(messages)
    expect(files).toContain("src/components/Button.ts")
  })

  it("should limit number of files", () => {
    const messages: Message[] = Array.from({ length: 30 }, (_, i) =>
      createToolMessage("read_file", { path: `src/file${i}.ts` }, i)
    )

    const files = extractKeyFiles(messages)
    expect(files.length).toBeLessThanOrEqual(20)
  })
})

describe("extractKeyDecisions", () => {
  it("should extract decision statements", () => {
    const messages: Message[] = [
      createMessage("assistant", "I decide to use TypeScript for this project.", 0),
      createMessage("assistant", "We should adopt the new API design.", 1),
    ]

    const decisions = extractKeyDecisions(messages)
    expect(decisions.length).toBeGreaterThan(0)
  })

  it("should only extract from assistant messages", () => {
    const messages: Message[] = [
      createMessage("user", "I decide to use TypeScript.", 0),
      createMessage("assistant", "Good choice! I will use TypeScript.", 1),
    ]

    const decisions = extractKeyDecisions(messages)
    // Should only include assistant's decision
    expect(decisions.some((d) => d.includes("will use"))).toBe(true)
  })

  it("should limit number of decisions", () => {
    const messages: Message[] = Array.from({ length: 20 }, (_, i) =>
      createMessage("assistant", `I decide to do thing ${i}.`, i)
    )

    const decisions = extractKeyDecisions(messages)
    expect(decisions.length).toBeLessThanOrEqual(10)
  })
})

describe("generateSimpleSummary", () => {
  it("should generate summary with key files", () => {
    const messages: Message[] = [
      createToolMessage("read_file", { path: "src/index.ts" }, 0),
      createMessage("assistant", "I read the file and found the issue.", 1),
    ]

    const summary = generateSimpleSummary(messages)
    expect(summary.keyFiles).toContain("src/index.ts")
    expect(summary.tokenCount).toBeGreaterThan(0)
  })

  it("should generate summary with key decisions", () => {
    const messages: Message[] = [
      createMessage("assistant", "I decide to refactor the code.", 0),
    ]

    const summary = generateSimpleSummary(messages)
    expect(summary.keyDecisions?.length).toBeGreaterThan(0)
  })

  it("should include recent conversation", () => {
    const messages: Message[] = [
      createMessage("user", "Please help me fix the bug.", 0),
      createMessage("assistant", "I found the issue in the code.", 1),
    ]

    const summary = generateSimpleSummary(messages)
    expect(summary.summary).toContain("最近对话")
  })

  it("should handle empty messages", () => {
    const summary = generateSimpleSummary([])
    expect(summary.summary).toBe("")
    expect(summary.tokenCount).toBe(0)
  })
})
