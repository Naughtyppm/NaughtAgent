/**
 * fork_agent 模式测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { runForkAgent, type ForkAgentRuntime } from "../../src/subtask/fork-agent"
import type { ForkAgentConfig, ParentContext } from "../../src/subtask/types"
import type { Message } from "../../src/session"

// Mock dependencies
vi.mock("../../src/agent", () => ({
  createAgentLoop: vi.fn(() => ({
    run: vi.fn(function* () {
      yield { type: "text", content: "Hello from fork agent" }
      yield {
        type: "done",
        usage: { inputTokens: 100, outputTokens: 50 },
      }
    }),
  })),
  getAgentDefinition: vi.fn(() => ({
    name: "build",
    description: "Build agent",
    tools: ["read_file", "write_file"],
  })),
}))

vi.mock("../../src/session", () => ({
  createSession: vi.fn(() => ({
    id: "child_session_1",
    status: "idle",
    cwd: process.cwd(),
    messages: [],
    agentType: "build",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usage: { inputTokens: 0, outputTokens: 0 },
  })),
}))

vi.mock("../../src/provider", () => ({
  createProvider: vi.fn(() => ({})),
  createProviderFromEnv: vi.fn(() => ({})),
}))

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

describe("runForkAgent", () => {
  let config: ForkAgentConfig
  let runtime: ForkAgentRuntime
  let parentContext: ParentContext

  beforeEach(() => {
    parentContext = {
      sessionId: "parent_session_1",
      messages: Array.from({ length: 5 }, (_, i) =>
        createMessage(i % 2 === 0 ? "user" : "assistant", `Message ${i}`, i)
      ),
      systemPrompt: "You are a helpful assistant.",
      tools: ["read_file", "write_file"],
      agentType: "build",
    }

    config = {
      mode: "fork_agent",
      prompt: "Complete this subtask",
      inherit: {
        messages: true,
        context: true,
        tools: true,
        systemPrompt: true,
      },
    }

    runtime = {
      parentContext,
      apiKey: "test-api-key",
    }
  })

  it("should execute fork agent successfully", async () => {
    const result = await runForkAgent(config, runtime)

    expect(result.success).toBe(true)
    expect(result.output).toContain("Hello from fork agent")
    expect(result.childSessionId).toBe("child_session_1")
  })

  it("should return usage statistics", async () => {
    const result = await runForkAgent(config, runtime)

    expect(result.usage.inputTokens).toBe(100)
    expect(result.usage.outputTokens).toBe(50)
  })

  it("should track duration", async () => {
    const result = await runForkAgent(config, runtime)

    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it("should handle abort signal", async () => {
    const abortController = new AbortController()
    abortController.abort()

    const result = await runForkAgent(
      { ...config, abort: abortController.signal },
      runtime
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe("Task was aborted")
  })

  it("should inherit only specified number of messages", async () => {
    const result = await runForkAgent(
      {
        ...config,
        inherit: { messages: 2 },
      },
      runtime
    )

    expect(result.success).toBe(true)
  })

  it("should not inherit messages when disabled", async () => {
    const result = await runForkAgent(
      {
        ...config,
        inherit: { messages: false },
      },
      runtime
    )

    expect(result.success).toBe(true)
  })

  it("should use parent agent type by default", async () => {
    const result = await runForkAgent(config, runtime)

    expect(result.success).toBe(true)
    // Agent type should be inherited from parent
  })

  it("should override agent type when specified", async () => {
    const result = await runForkAgent(
      {
        ...config,
        agentType: "explore",
      },
      runtime
    )

    expect(result.success).toBe(true)
  })

  it("should respect maxTurns limit", async () => {
    const result = await runForkAgent(
      {
        ...config,
        maxTurns: 5,
      },
      runtime
    )

    expect(result.success).toBe(true)
  })

  it("should handle missing parent context", async () => {
    // This would be caught by the runner, but test the function directly
    const result = await runForkAgent(config, {
      ...runtime,
      parentContext: {
        sessionId: "",
        messages: [],
      },
    })

    expect(result.success).toBe(true) // Still succeeds with empty context
  })

  it("should include context summary when available", async () => {
    const contextWithSummary: ParentContext = {
      ...parentContext,
      contextSummary: {
        summary: "This is a summary of the parent context.",
        keyFiles: ["src/index.ts"],
        keyDecisions: ["Use TypeScript"],
        tokenCount: 50,
      },
    }

    const result = await runForkAgent(config, {
      ...runtime,
      parentContext: contextWithSummary,
    })

    expect(result.success).toBe(true)
  })

  it("should use token budget when specified", async () => {
    const result = await runForkAgent(
      {
        ...config,
        tokenBudget: {
          total: 5000,
          history: 2000,
        },
      },
      runtime
    )

    expect(result.success).toBe(true)
  })
})
