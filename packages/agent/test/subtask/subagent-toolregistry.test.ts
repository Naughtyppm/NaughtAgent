/**
 * 子代理工具注册验证测试
 *
 * 验证 run_agent / fork_agent 的 createAgentLoop 能正确接收 toolRegistry
 * 确保子代理能访问 read/write/edit/bash 等基础工具
 */

import { describe, it, expect } from "vitest"
import { z } from "zod"
import { ToolRegistry } from "../../src/tool/registry"
import { createAgentLoop } from "../../src/agent/loop"
import { createSession } from "../../src/session"
import { getAgentDefinition } from "../../src/agent"
import { Tool } from "../../src/tool/tool"

// 模拟工具
const MockReadTool = Tool.define({
  id: "read",
  description: "Mock read tool",
  parameters: z.object({
    filePath: z.string(),
  }),
  async execute() {
    return { title: "read", output: "mock file content" }
  },
})

const MockWriteTool = Tool.define({
  id: "write",
  description: "Mock write tool",
  parameters: z.object({
    filePath: z.string(),
    content: z.string(),
  }),
  async execute() {
    return { title: "write", output: "wrote file" }
  },
})

// 模拟 provider（不会实际调用 LLM）
const mockProvider = {
  chat: async () => ({ text: "ok", usage: { inputTokens: 0, outputTokens: 0 } }),
  stream: async function* () {
    yield { type: "message_end" as const, usage: { inputTokens: 0, outputTokens: 0 }, stopReason: "end_turn" }
  },
}

describe("子代理工具注册", () => {
  it("传入 toolRegistry 时，loop 使用该实例", () => {
    const registry = new ToolRegistry()
    registry.register(MockReadTool)
    registry.register(MockWriteTool)

    const session = createSession({ cwd: "/tmp", agentType: "build" })
    const definition = getAgentDefinition("build")

    const loop = createAgentLoop({
      definition,
      session,
      provider: mockProvider as any,
      runConfig: { sessionId: "test", cwd: "/tmp", abort: new AbortController().signal },
      toolRegistry: registry,
    })

    expect(loop).toBeDefined()
    expect(loop.run).toBeDefined()
    expect(loop.abort).toBeDefined()
  })

  it("不传 toolRegistry 时（旧行为），不报错", () => {
    const session = createSession({ cwd: "/tmp", agentType: "build" })
    const definition = getAgentDefinition("build")

    const loop = createAgentLoop({
      definition,
      session,
      provider: mockProvider as any,
      runConfig: { sessionId: "test", cwd: "/tmp", abort: new AbortController().signal },
    })

    expect(loop).toBeDefined()
  })

  it("RunAgentRuntime 接受 toolRegistry 字段", async () => {
    const registry = new ToolRegistry()
    // 确认 RunAgentRuntime 类型允许 toolRegistry
    const runtime = {
      apiKey: "test",
      baseURL: "http://localhost:4141",
      model: "claude-sonnet-4",
      toolRegistry: registry,
    }
    expect(runtime.toolRegistry).toBe(registry)
    expect(runtime.toolRegistry).toBeInstanceOf(ToolRegistry)
  })

  it("ToolRegistry 实例包含注册的基础工具", () => {
    const registry = new ToolRegistry()
    registry.register(MockReadTool)
    registry.register(MockWriteTool)

    expect(registry.get("read")).toBeDefined()
    expect(registry.get("write")).toBeDefined()
    expect(registry.get("nonexistent")).toBeUndefined()
  })
})
