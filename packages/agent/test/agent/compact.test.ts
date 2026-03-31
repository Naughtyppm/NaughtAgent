/**
 * compact.ts 单元测试
 *
 * 测试三层压缩管道：microCompact / estimateTokens / autoCompact
 */

import { describe, it, expect, vi } from "vitest"
import { microCompact, estimateTokens, autoCompact, shouldAutoCompact } from "../../src/agent/compact"
import type { Session } from "../../src/session"
import type { Message } from "../../src/session/message"

// ─── 辅助函数 ──────────────────────────────────────────

function createSession(messages: Message[] = []): Session {
  return {
    id: "test-session",
    status: "idle",
    cwd: "/tmp",
    messages,
    agentType: "build",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usage: { inputTokens: 0, outputTokens: 0 },
  }
}

function textMsg(role: "user" | "assistant", text: string): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role,
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  }
}

function toolUseMsg(toolUseId: string, toolName: string, input: unknown = {}): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: "assistant",
    content: [{ type: "tool_use", id: toolUseId, name: toolName, input }],
    timestamp: Date.now(),
  }
}

function toolResultMsg(toolUseId: string, content: string): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
    timestamp: Date.now(),
  }
}

// ─── microCompact 测试 ─────────────────────────────────

describe("microCompact", () => {
  it("少于等于 3 个 tool_result 时不压缩", () => {
    const session = createSession([
      toolUseMsg("t1", "read", { filePath: "/a.ts" }),
      toolResultMsg("t1", "file content A ".repeat(20)),
      toolUseMsg("t2", "grep", { pattern: "foo" }),
      toolResultMsg("t2", "grep result B ".repeat(20)),
      toolUseMsg("t3", "glob", { pattern: "*.ts" }),
      toolResultMsg("t3", "glob result C ".repeat(20)),
    ])

    microCompact(session)

    // 所有内容应保持不变
    const results = session.messages
      .flatMap(m => m.content)
      .filter(b => b.type === "tool_result")
    for (const r of results) {
      expect((r as { content: string }).content).not.toContain("[Previous:")
    }
  })

  it("超过 3 个 tool_result 后，旧的被替换为占位符", () => {
    const session = createSession([
      toolUseMsg("t1", "read"),
      toolResultMsg("t1", "old content 1 ".repeat(20)),
      toolUseMsg("t2", "grep"),
      toolResultMsg("t2", "old content 2 ".repeat(20)),
      toolUseMsg("t3", "glob"),
      toolResultMsg("t3", "recent content 3 ".repeat(20)),
      toolUseMsg("t4", "read"),
      toolResultMsg("t4", "recent content 4 ".repeat(20)),
      toolUseMsg("t5", "bash"),
      toolResultMsg("t5", "recent content 5 ".repeat(20)),
    ])

    microCompact(session)

    const results = session.messages
      .flatMap(m => m.content)
      .filter(b => b.type === "tool_result") as Array<{ content: string; tool_use_id: string }>

    // 前 2 个（旧的）应被替换
    expect(results[0].content).toBe("[Previous: used read]")
    expect(results[1].content).toBe("[Previous: used grep]")
    // 后 3 个（最近的）应保持不变
    expect(results[2].content).toContain("recent content 3")
    expect(results[3].content).toContain("recent content 4")
    expect(results[4].content).toContain("recent content 5")
  })

  it("短内容（<100 字符）的 tool_result 不替换", () => {
    const session = createSession([
      toolUseMsg("t1", "read"),
      toolResultMsg("t1", "short"),  // < 100 字符
      toolUseMsg("t2", "grep"),
      toolResultMsg("t2", "long content ".repeat(20)),
      toolUseMsg("t3", "glob"),
      toolResultMsg("t3", "recent 3 ".repeat(20)),
      toolUseMsg("t4", "read"),
      toolResultMsg("t4", "recent 4 ".repeat(20)),
      toolUseMsg("t5", "bash"),
      toolResultMsg("t5", "recent 5 ".repeat(20)),
    ])

    microCompact(session)

    const results = session.messages
      .flatMap(m => m.content)
      .filter(b => b.type === "tool_result") as Array<{ content: string }>

    // t1 短内容不被替换
    expect(results[0].content).toBe("short")
    // t2 长内容被替换
    expect(results[1].content).toBe("[Previous: used grep]")
  })

  it("tool_use_id 无法匹配时使用 unknown", () => {
    const session = createSession([
      // 没有对应的 tool_use 消息
      toolResultMsg("orphan-1", "orphan content ".repeat(20)),
      toolUseMsg("t2", "read"),
      toolResultMsg("t2", "content 2 ".repeat(20)),
      toolUseMsg("t3", "glob"),
      toolResultMsg("t3", "content 3 ".repeat(20)),
      toolUseMsg("t4", "grep"),
      toolResultMsg("t4", "content 4 ".repeat(20)),
      toolUseMsg("t5", "bash"),
      toolResultMsg("t5", "content 5 ".repeat(20)),
    ])

    microCompact(session)

    const results = session.messages
      .flatMap(m => m.content)
      .filter(b => b.type === "tool_result") as Array<{ content: string }>

    // orphan 应使用 "unknown"
    expect(results[0].content).toBe("[Previous: used unknown]")
  })
})

// ─── estimateTokens 测试 ───────────────────────────────

describe("estimateTokens", () => {
  it("空消息返回 0", () => {
    const session = createSession([])
    expect(estimateTokens(session)).toBe(0)
  })

  it("文本消息正确估算（字符数 / 4 向上取整）", () => {
    // 8 个字符 → 2 tokens
    const session = createSession([textMsg("user", "12345678")])
    expect(estimateTokens(session)).toBe(2)
  })

  it("包含 tool_use 和 tool_result 的消息正确估算", () => {
    const session = createSession([
      toolUseMsg("t1", "read", { filePath: "/test.ts" }),  // name(4) + input JSON
      toolResultMsg("t1", "result content"),
    ])
    const tokens = estimateTokens(session)
    expect(tokens).toBeGreaterThan(0)
    // tool_use: "read"(4) + JSON.stringify({filePath:"/test.ts"})(22) = 26 chars → ~7 tokens
    // tool_result: "result content"(14) → ~4 tokens
    // 总计约 11
    expect(tokens).toBeGreaterThanOrEqual(7)
  })

  it("9 个字符向上取整为 3", () => {
    const session = createSession([textMsg("user", "123456789")])
    expect(estimateTokens(session)).toBe(3)  // ceil(9/4) = 3
  })
})

// ─── autoCompact 测试 ──────────────────────────────────

describe("autoCompact", () => {
  it("Token 未超阈值时不压缩", async () => {
    const session = createSession([textMsg("user", "hello")])
    const summarizer = vi.fn()

    const result = await autoCompact(session, summarizer)

    expect(result).toBe(false)
    expect(summarizer).not.toHaveBeenCalled()
    expect(session.messages).toHaveLength(1)
  })

  it("Token 超阈值时触发压缩", async () => {
    // 构造超过阈值的消息（AUTO_COMPACT_TOKEN_THRESHOLD 默认 50000）
    const longText = "x".repeat(200_001)  // 200001 chars → 50001 tokens
    const session = createSession([textMsg("user", longText)])
    const summarizer = vi.fn().mockResolvedValue("This is a summary.")

    const result = await autoCompact(session, summarizer)

    expect(result).toBe(true)
    expect(summarizer).toHaveBeenCalledOnce()
    // 压缩后应只有 2 条消息
    expect(session.messages).toHaveLength(2)
    expect(session.messages[0].role).toBe("user")
    expect(session.messages[1].role).toBe("assistant")
  })

  it("压缩后消息包含摘要内容", async () => {
    const longText = "x".repeat(200_001)
    const session = createSession([textMsg("user", longText)])
    const summarizer = vi.fn().mockResolvedValue("Summary: task completed step 1.")

    await autoCompact(session, summarizer)

    const compactedText = (session.messages[0].content[0] as { text: string }).text
    expect(compactedText).toContain("Summary: task completed step 1.")
    expect(compactedText).toContain("Do NOT re-read them")
  })

  it("压缩后保留最近读取的文件内容（Preserved File Contents）", async () => {
    const fileContent = "<file>\n    1\tconst x = 1\n</file>"
    const longText = "x".repeat(200_001)
    const session = createSession([
      textMsg("user", longText),
      toolUseMsg("t1", "read", { filePath: "/src/app.ts" }),
      toolResultMsg("t1", fileContent),
    ])
    const summarizer = vi.fn().mockResolvedValue("Summary.")

    await autoCompact(session, summarizer)

    const compactedText = (session.messages[0].content[0] as { text: string }).text
    expect(compactedText).toContain("Preserved File Contents")
    expect(compactedText).toContain("/src/app.ts")
    expect(compactedText).toContain("const x = 1")
  })
})

// ─── shouldAutoCompact 测试 ─────────────────────────────

describe("shouldAutoCompact", () => {
  it("低于阈值返回 false", () => {
    const session = createSession([textMsg("user", "hello")])
    expect(shouldAutoCompact(session)).toBe(false)
  })

  it("超过阈值返回 true", () => {
    const longText = "x".repeat(200_001)
    const session = createSession([textMsg("user", longText)])
    expect(shouldAutoCompact(session)).toBe(true)
  })
})
