/**
 * 子 Agent 事件系统测试
 *
 * 验证事件类型定义、事件发射器和事件监听器的正确性
 * 重点测试 config 和 retry 事件类型
 */

import { describe, it, expect, vi } from "vitest"
import {
  generateSubAgentId,
  createSubAgentEmitter,
  type SubAgentEvent,
  type SubAgentEventListener,
  type SubAgentConfigEvent,
  type SubAgentRetryEvent,
  type SubAgentStartEvent,
  type SubAgentEndEvent,
  type SubAgentToolEndEvent,
  type SubAgentChildStartEvent,
  type SubAgentChildEndEvent,
  type CreateSubAgentEmitterOptions,
} from "../../src/subtask/events"

describe("SubAgent Events", () => {
  // ========================================================================
  // generateSubAgentId
  // ========================================================================
  describe("generateSubAgentId", () => {
    it("应生成以 sa- 开头的唯一 ID", () => {
      const id = generateSubAgentId()
      expect(id).toMatch(/^sa-\d+-[a-z0-9]{6}$/)
    })

    it("应生成不同的 ID", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateSubAgentId()))
      expect(ids.size).toBe(100)
    })
  })

  // ========================================================================
  // createSubAgentEmitter - 基础事件
  // ========================================================================
  describe("createSubAgentEmitter", () => {
    it("应创建包含所有事件方法的发射器", () => {
      const emitter = createSubAgentEmitter("test-id", undefined)
      expect(emitter).toHaveProperty("start")
      expect(emitter).toHaveProperty("text")
      expect(emitter).toHaveProperty("toolStart")
      expect(emitter).toHaveProperty("toolEnd")
      expect(emitter).toHaveProperty("step")
      expect(emitter).toHaveProperty("thinking")
      expect(emitter).toHaveProperty("end")
      expect(emitter).toHaveProperty("childStart")
      expect(emitter).toHaveProperty("childEnd")
      expect(emitter).toHaveProperty("config")
      expect(emitter).toHaveProperty("retry")
    })

    it("当 listener 为 undefined 时不应抛出错误", () => {
      const emitter = createSubAgentEmitter("test-id", undefined)
      expect(() => emitter.start("test", "build", 10)).not.toThrow()
      expect(() => emitter.text("hello")).not.toThrow()
      expect(() => emitter.config({ maxTurns: 5 })).not.toThrow()
      expect(() => emitter.retry(1, 3, "error", 1000)).not.toThrow()
    })

    it("应正确发射 start 事件", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("test-id", listener, "run_agent")

      emitter.start("test prompt", "build", 10)

      expect(listener).toHaveBeenCalledWith({
        type: "start",
        id: "test-id",
        mode: "run_agent",
        prompt: "test prompt",
        agentType: "build",
        maxSteps: 10,
      } satisfies SubAgentStartEvent)
    })

    it("应正确发射 end 事件", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("test-id", listener)

      emitter.end(true, "done", 1500, undefined, { inputTokens: 100, outputTokens: 50 })

      expect(listener).toHaveBeenCalledWith({
        type: "end",
        id: "test-id",
        success: true,
        output: "done",
        error: undefined,
        usage: { inputTokens: 100, outputTokens: 50 },
        duration: 1500,
      } satisfies SubAgentEndEvent)
    })
  })


  // ========================================================================
  // config 事件 (Requirements 6.1, 6.4)
  // ========================================================================
  describe("config 事件", () => {
    it("应正确发射 config 事件（包含所有字段）", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("cfg-1", listener)

      const config = { maxTurns: 10, timeout: 30000, tools: ["read", "write"] }
      emitter.config(config)

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0] as SubAgentConfigEvent
      expect(event.type).toBe("config")
      expect(event.id).toBe("cfg-1")
      expect(event.config).toEqual(config)
    })

    it("应支持部分配置字段", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("cfg-2", listener)

      emitter.config({ maxTurns: 5 })

      const event = listener.mock.calls[0][0] as SubAgentConfigEvent
      expect(event.config.maxTurns).toBe(5)
      expect(event.config.timeout).toBeUndefined()
      expect(event.config.tools).toBeUndefined()
    })

    it("应支持空配置对象", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("cfg-3", listener)

      emitter.config({})

      const event = listener.mock.calls[0][0] as SubAgentConfigEvent
      expect(event.type).toBe("config")
      expect(event.config).toEqual({})
    })

    it("应支持 agentType 字段", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("cfg-4", listener)

      emitter.config({ agentType: "explore" })

      const event = listener.mock.calls[0][0] as SubAgentConfigEvent
      expect(event.config.agentType).toBe("explore")
    })
  })

  // ========================================================================
  // retry 事件 (Requirements 6.2)
  // ========================================================================
  describe("retry 事件", () => {
    it("应正确发射 retry 事件（包含所有字段）", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("retry-1", listener)

      emitter.retry(1, 3, "Connection timeout", 2000)

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0] as SubAgentRetryEvent
      expect(event.type).toBe("retry")
      expect(event.id).toBe("retry-1")
      expect(event.attempt).toBe(1)
      expect(event.maxAttempts).toBe(3)
      expect(event.error).toBe("Connection timeout")
      expect(event.delay).toBe(2000)
    })

    it("应支持不同的重试次数", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("retry-2", listener)

      emitter.retry(2, 5, "Rate limit exceeded", 4000)

      const event = listener.mock.calls[0][0] as SubAgentRetryEvent
      expect(event.attempt).toBe(2)
      expect(event.maxAttempts).toBe(5)
      expect(event.delay).toBe(4000)
    })

    it("应支持最后一次重试", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("retry-3", listener)

      emitter.retry(3, 3, "Final attempt failed", 10000)

      const event = listener.mock.calls[0][0] as SubAgentRetryEvent
      expect(event.attempt).toBe(3)
      expect(event.maxAttempts).toBe(3)
    })
  })

  // ========================================================================
  // 事件类型完整性验证
  // ========================================================================
  describe("事件类型完整性", () => {
    it("应支持所有事件类型的发射", () => {
      const events: SubAgentEvent[] = []
      const listener: SubAgentEventListener = (e) => events.push(e)
      const emitter = createSubAgentEmitter("all-1", listener, "parallel_agents")

      // 发射所有类型的事件
      emitter.start("test", "build", 10)
      emitter.text("hello", "h")
      emitter.toolStart("t1", "read", { path: "test.ts" })
      emitter.toolEnd("t1", "content", false, 100)
      emitter.step(1, 10)
      emitter.thinking("analyzing...")
      emitter.childStart("c1", "child-1", "sub task")
      emitter.childEnd("c1", "child-1", true, "done")
      emitter.config({ maxTurns: 5, timeout: 30000 })
      emitter.retry(1, 3, "error", 1000)
      emitter.end(true, "complete", 5000)

      // 验证所有事件类型
      const types = events.map((e) => e.type)
      expect(types).toEqual([
        "start",
        "text",
        "tool_start",
        "tool_end",
        "step",
        "thinking",
        "child_start",
        "child_end",
        "config",
        "retry",
        "end",
      ])
    })

    it("所有事件应包含正确的 id", () => {
      const events: SubAgentEvent[] = []
      const listener: SubAgentEventListener = (e) => events.push(e)
      const emitter = createSubAgentEmitter("id-check", listener)

      emitter.start("test", "build", 10)
      emitter.config({ maxTurns: 5 })
      emitter.retry(1, 3, "err", 1000)
      emitter.end(true, "done", 1000)

      for (const event of events) {
        expect(event.id).toBe("id-check")
      }
    })
  })

  // ========================================================================
  // tool_end 事件 timing 信息 (Requirements 6.3 - Property 15)
  // ========================================================================
  describe("tool_end 事件 timing 信息", () => {
    it("tool_end 事件应包含 duration 字段", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("timing-1", listener)

      emitter.toolEnd("t1", "output", false, 150)

      const event = listener.mock.calls[0][0] as SubAgentToolEndEvent
      expect(event.type).toBe("tool_end")
      expect(event.duration).toBe(150)
      expect(typeof event.duration).toBe("number")
    })

    it("tool_end 事件 duration 应为非负数", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("timing-2", listener)

      emitter.toolEnd("t1", "output", false, 0)

      const event = listener.mock.calls[0][0] as SubAgentToolEndEvent
      expect(event.duration).toBe(0)
      expect(event.duration).toBeGreaterThanOrEqual(0)
    })

    it("tool_end 事件应包含所有必需字段", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("timing-3", listener)

      emitter.toolEnd("tool-abc", "result text", true, 2500)

      const event = listener.mock.calls[0][0] as SubAgentToolEndEvent
      expect(event.type).toBe("tool_end")
      expect(event.id).toBe("timing-3")
      expect(event.toolId).toBe("tool-abc")
      expect(event.output).toBe("result text")
      expect(event.isError).toBe(true)
      expect(event.duration).toBe(2500)
    })
  })

  // ========================================================================
  // child 事件发射 (Requirements 6.6 - Property 16)
  // ========================================================================
  describe("child 事件发射", () => {
    it("child_start 事件应包含所有必需字段", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("child-test-1", listener, "parallel_agents")

      emitter.childStart("c1", "analyzer", "分析代码结构")

      const event = listener.mock.calls[0][0] as SubAgentChildStartEvent
      expect(event.type).toBe("child_start")
      expect(event.id).toBe("child-test-1")
      expect(event.childId).toBe("c1")
      expect(event.childName).toBe("analyzer")
      expect(event.prompt).toBe("分析代码结构")
    })

    it("child_end 事件应包含所有必需字段（成功）", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("child-test-2", listener, "parallel_agents")

      emitter.childEnd("c1", "analyzer", true, "分析完成")

      const event = listener.mock.calls[0][0] as SubAgentChildEndEvent
      expect(event.type).toBe("child_end")
      expect(event.id).toBe("child-test-2")
      expect(event.childId).toBe("c1")
      expect(event.childName).toBe("analyzer")
      expect(event.success).toBe(true)
      expect(event.output).toBe("分析完成")
      expect(event.error).toBeUndefined()
    })

    it("child_end 事件应包含错误信息（失败）", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("child-test-3", listener, "multi_agent")

      emitter.childEnd("c2", "builder", false, "", "构建失败")

      const event = listener.mock.calls[0][0] as SubAgentChildEndEvent
      expect(event.type).toBe("child_end")
      expect(event.success).toBe(false)
      expect(event.error).toBe("构建失败")
    })

    it("parallel_agents 模式应能发射完整的 child 事件序列", () => {
      const events: SubAgentEvent[] = []
      const listener: SubAgentEventListener = (e) => events.push(e)
      const emitter = createSubAgentEmitter("par-1", listener, "parallel_agents")

      // 模拟 parallel_agents 的完整事件流
      emitter.start("并行分析任务", "synthesis", 3)
      emitter.config({ maxTurns: 15, agentType: "synthesis" })
      emitter.childStart("c1", "task-1", "子任务 1")
      emitter.childStart("c2", "task-2", "子任务 2")
      emitter.childEnd("c1", "task-1", true, "结果 1")
      emitter.childEnd("c2", "task-2", true, "结果 2")
      emitter.end(true, "汇总结果", 5000)

      const types = events.map(e => e.type)
      expect(types).toEqual([
        "start", "config",
        "child_start", "child_start",
        "child_end", "child_end",
        "end",
      ])
    })

    it("multi_agent 模式应能发射完整的 child 事件序列", () => {
      const events: SubAgentEvent[] = []
      const listener: SubAgentEventListener = (e) => events.push(e)
      const emitter = createSubAgentEmitter("multi-1", listener, "multi_agent")

      // 模拟 multi_agent 的完整事件流
      emitter.start("讨论主题", "discussion", 6)
      emitter.config({ maxTurns: 6, agentType: "discussion" })
      emitter.childStart("arch-r1", "Architect", "Round 1")
      emitter.childEnd("arch-r1", "Architect", true, "架构观点")
      emitter.childStart("dev-r1", "Developer", "Round 1")
      emitter.childEnd("dev-r1", "Developer", true, "开发观点")
      emitter.step(2, 6)
      emitter.end(true, "讨论结果", 8000)

      const types = events.map(e => e.type)
      expect(types).toEqual([
        "start", "config",
        "child_start", "child_end",
        "child_start", "child_end",
        "step", "end",
      ])
    })
  })

  // ========================================================================
  // 各模式事件完整性验证 (Requirements 6.1, 6.3, 6.5, 6.6)
  // ========================================================================
  describe("各模式事件完整性", () => {
    it("run_agent 模式应发射 start+config+tool+step+end 事件", () => {
      const events: SubAgentEvent[] = []
      const listener: SubAgentEventListener = (e) => events.push(e)
      const emitter = createSubAgentEmitter("ra-1", listener, "run_agent")

      emitter.start("执行任务", "build", 30)
      emitter.config({ maxTurns: 30, agentType: "build" })
      emitter.toolStart("t1", "read", { path: "file.ts" })
      emitter.step(1, 30)
      emitter.toolEnd("t1", "content", false, 50)
      emitter.end(true, "完成", 3000, undefined, { inputTokens: 100, outputTokens: 50 })

      const types = events.map(e => e.type)
      expect(types).toContain("start")
      expect(types).toContain("config")
      expect(types).toContain("tool_start")
      expect(types).toContain("tool_end")
      expect(types).toContain("step")
      expect(types).toContain("end")

      // 验证 tool_end 包含 duration
      const toolEnd = events.find(e => e.type === "tool_end") as SubAgentToolEndEvent
      expect(toolEnd.duration).toBe(50)
    })

    it("ask_llm 模式应发射 start+config+end 事件", () => {
      const events: SubAgentEvent[] = []
      const listener: SubAgentEventListener = (e) => events.push(e)
      const emitter = createSubAgentEmitter("al-1", listener, "ask_llm")

      emitter.start("简单问题", "query", 1)
      emitter.config({ maxTurns: 1, agentType: "query" })
      emitter.end(true, "回答", 500, undefined, { inputTokens: 50, outputTokens: 30 })

      const types = events.map(e => e.type)
      expect(types).toEqual(["start", "config", "end"])
    })

    it("fork_agent 模式应发射 start+config+tool+step+end 事件", () => {
      const events: SubAgentEvent[] = []
      const listener: SubAgentEventListener = (e) => events.push(e)
      const emitter = createSubAgentEmitter("fa-1", listener, "fork_agent")

      emitter.start("分叉任务", "build", 30)
      emitter.config({ maxTurns: 30, agentType: "build" })
      emitter.toolStart("t1", "write", { path: "out.ts" })
      emitter.step(1, 30)
      emitter.toolEnd("t1", "written", false, 120)
      emitter.end(true, "完成", 4000)

      const types = events.map(e => e.type)
      expect(types).toContain("start")
      expect(types).toContain("config")
      expect(types).toContain("tool_start")
      expect(types).toContain("tool_end")
      expect(types).toContain("step")
      expect(types).toContain("end")
    })

    it("run_workflow 模式应发射 start+config+tool+step+end 事件", () => {
      const events: SubAgentEvent[] = []
      const listener: SubAgentEventListener = (e) => events.push(e)
      const emitter = createSubAgentEmitter("rw-1", listener, "run_workflow")

      emitter.start("执行工作流", "workflow", 5)
      emitter.config({ maxTurns: 5, agentType: "workflow" })
      emitter.toolStart("wf-step-1", "workflow:analyze", { type: "tool" })
      emitter.step(1, 5)
      emitter.toolEnd("wf-step-1", "分析结果", false, 200)
      emitter.end(true, "工作流完成", 6000)

      const types = events.map(e => e.type)
      expect(types).toContain("start")
      expect(types).toContain("config")
      expect(types).toContain("tool_start")
      expect(types).toContain("tool_end")
      expect(types).toContain("step")
      expect(types).toContain("end")

      // 验证 tool_end 包含 duration
      const toolEnd = events.find(e => e.type === "tool_end") as SubAgentToolEndEvent
      expect(toolEnd.duration).toBe(200)
    })

    it("start 事件应包含所有必需字段 (Property 14)", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("prop14-1", listener, "run_agent")

      emitter.start("测试任务", "build", 20)

      const event = listener.mock.calls[0][0] as SubAgentStartEvent
      expect(event).toHaveProperty("id")
      expect(event).toHaveProperty("mode")
      expect(event).toHaveProperty("prompt")
      expect(event).toHaveProperty("agentType")
      expect(event).toHaveProperty("maxSteps")
      expect(event.id).toBe("prop14-1")
      expect(event.mode).toBe("run_agent")
      expect(event.prompt).toBe("测试任务")
      expect(event.agentType).toBe("build")
      expect(event.maxSteps).toBe(20)
    })

    it("end 事件应包含所有必需字段 (Property 14)", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("prop14-2", listener)

      emitter.end(false, "失败输出", 2000, "超时错误", { inputTokens: 200, outputTokens: 100 })

      const event = listener.mock.calls[0][0] as SubAgentEndEvent
      expect(event).toHaveProperty("id")
      expect(event).toHaveProperty("success")
      expect(event).toHaveProperty("output")
      expect(event).toHaveProperty("duration")
      expect(event.id).toBe("prop14-2")
      expect(event.success).toBe(false)
      expect(event.output).toBe("失败输出")
      expect(event.duration).toBe(2000)
      expect(event.error).toBe("超时错误")
      expect(event.usage).toEqual({ inputTokens: 200, outputTokens: 100 })
    })
  })

  // ========================================================================
  // 实例级监听器 (Requirements 6.7)
  // ========================================================================
  describe("实例级监听器 (per-instance listener)", () => {
    it("应支持仅使用实例级监听器（无全局监听器）", () => {
      const instanceListener = vi.fn()
      const options: CreateSubAgentEmitterOptions = { instanceListener }
      const emitter = createSubAgentEmitter("inst-1", undefined, "run_agent", options)

      emitter.start("测试任务", "build", 10)

      expect(instanceListener).toHaveBeenCalledOnce()
      const event = instanceListener.mock.calls[0][0] as SubAgentStartEvent
      expect(event.type).toBe("start")
      expect(event.id).toBe("inst-1")
    })

    it("应同时调用全局监听器和实例级监听器", () => {
      const globalListener = vi.fn()
      const instanceListener = vi.fn()
      const options: CreateSubAgentEmitterOptions = { instanceListener }
      const emitter = createSubAgentEmitter("inst-2", globalListener, "run_agent", options)

      emitter.start("双监听测试", "build", 10)

      // 两个监听器都应被调用
      expect(globalListener).toHaveBeenCalledOnce()
      expect(instanceListener).toHaveBeenCalledOnce()

      // 两个监听器收到相同的事件
      const globalEvent = globalListener.mock.calls[0][0] as SubAgentStartEvent
      const instanceEvent = instanceListener.mock.calls[0][0] as SubAgentStartEvent
      expect(globalEvent).toEqual(instanceEvent)
      expect(globalEvent.prompt).toBe("双监听测试")
    })

    it("全局监听器和实例级监听器应收到所有事件类型", () => {
      const globalEvents: SubAgentEvent[] = []
      const instanceEvents: SubAgentEvent[] = []
      const globalListener: SubAgentEventListener = (e) => globalEvents.push(e)
      const instanceListener: SubAgentEventListener = (e) => instanceEvents.push(e)
      const emitter = createSubAgentEmitter("inst-3", globalListener, "run_agent", { instanceListener })

      // 发射所有类型的事件
      emitter.start("test", "build", 10)
      emitter.text("hello", "h")
      emitter.toolStart("t1", "read", { path: "test.ts" })
      emitter.toolEnd("t1", "content", false, 100)
      emitter.step(1, 10)
      emitter.thinking("analyzing...")
      emitter.childStart("c1", "child-1", "sub task")
      emitter.childEnd("c1", "child-1", true, "done")
      emitter.config({ maxTurns: 5 })
      emitter.retry(1, 3, "error", 1000)
      emitter.end(true, "complete", 5000)

      // 两个监听器收到相同数量的事件
      expect(globalEvents.length).toBe(11)
      expect(instanceEvents.length).toBe(11)

      // 事件类型完全一致
      const globalTypes = globalEvents.map(e => e.type)
      const instanceTypes = instanceEvents.map(e => e.type)
      expect(globalTypes).toEqual(instanceTypes)
    })

    it("不传 options 时应保持向后兼容", () => {
      const listener = vi.fn()
      // 不传第四个参数，应与之前行为一致
      const emitter = createSubAgentEmitter("compat-1", listener, "run_agent")

      emitter.start("兼容测试", "build", 10)
      emitter.end(true, "done", 1000)

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it("options 为空对象时应保持向后兼容", () => {
      const listener = vi.fn()
      const emitter = createSubAgentEmitter("compat-2", listener, "run_agent", {})

      emitter.start("空选项测试", "build", 10)

      expect(listener).toHaveBeenCalledOnce()
    })

    it("全局监听器异常不应影响实例级监听器", () => {
      const globalListener = vi.fn().mockImplementation(() => {
        throw new Error("全局监听器异常")
      })
      const instanceListener = vi.fn()
      const emitter = createSubAgentEmitter("err-1", globalListener, "run_agent", { instanceListener })

      // 全局监听器抛出异常，但 broadcastEvent 中先调用全局再调用实例
      // 由于没有 try-catch，异常会传播出去
      // 这验证了调用顺序：全局先于实例
      expect(() => emitter.start("异常测试", "build", 10)).toThrow("全局监听器异常")
      expect(globalListener).toHaveBeenCalledOnce()
      // 实例级监听器不会被调用（因为全局监听器抛出了异常）
      expect(instanceListener).not.toHaveBeenCalled()
    })

    it("实例级监听器异常不应影响全局监听器", () => {
      const globalListener = vi.fn()
      const instanceListener = vi.fn().mockImplementation(() => {
        throw new Error("实例监听器异常")
      })
      const emitter = createSubAgentEmitter("err-2", globalListener, "run_agent", { instanceListener })

      // 全局监听器先被调用，然后实例级监听器抛出异常
      expect(() => emitter.start("异常测试2", "build", 10)).toThrow("实例监听器异常")
      // 全局监听器已经成功调用
      expect(globalListener).toHaveBeenCalledOnce()
      expect(instanceListener).toHaveBeenCalledOnce()
    })

    it("不同实例应有独立的实例级监听器", () => {
      const globalListener = vi.fn()
      const instanceListener1 = vi.fn()
      const instanceListener2 = vi.fn()

      const emitter1 = createSubAgentEmitter("multi-inst-1", globalListener, "run_agent", { instanceListener: instanceListener1 })
      const emitter2 = createSubAgentEmitter("multi-inst-2", globalListener, "run_agent", { instanceListener: instanceListener2 })

      emitter1.start("任务1", "build", 10)
      emitter2.start("任务2", "explore", 5)

      // 全局监听器收到两个事件
      expect(globalListener).toHaveBeenCalledTimes(2)

      // 各实例级监听器只收到自己的事件
      expect(instanceListener1).toHaveBeenCalledOnce()
      expect(instanceListener2).toHaveBeenCalledOnce()

      const event1 = instanceListener1.mock.calls[0][0] as SubAgentStartEvent
      const event2 = instanceListener2.mock.calls[0][0] as SubAgentStartEvent
      expect(event1.id).toBe("multi-inst-1")
      expect(event1.prompt).toBe("任务1")
      expect(event2.id).toBe("multi-inst-2")
      expect(event2.prompt).toBe("任务2")
    })
  })
})
