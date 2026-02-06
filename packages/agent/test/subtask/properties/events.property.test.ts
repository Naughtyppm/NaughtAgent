/**
 * 事件系统属性测试
 *
 * 使用 fast-check 进行属性测试，验证事件系统的正确性属性。
 *
 * **Property 14: Event Structure Completeness**
 * **Property 15: Tool Event Timing**
 * **Property 16: Child Event Emission**
 * **Validates: Requirements 6.1, 6.3, 6.5, 6.6**
 *
 * @module test/subtask/properties/events.property
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  createSubAgentEmitter,
  type SubAgentEvent,
  type SubAgentEventListener,
  type SubAgentStartEvent,
  type SubAgentEndEvent,
  type SubAgentToolEndEvent,
  type SubAgentChildStartEvent,
  type SubAgentChildEndEvent,
  type SubAgentMode,
} from "../../../src/subtask/events"

describe("Event System Properties", () => {
  // ==========================================================================
  // Generators - 智能生成器，约束到有效输入空间
  // ==========================================================================

  /**
   * 生成有效的子 Agent ID
   */
  const validId = fc
    .tuple(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
      fc.array(
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")),
        { minLength: 2, maxLength: 20 }
      )
    )
    .map(([first, rest]) => first + rest.join(""))

  /**
   * 生成有效的 SubAgentMode
   */
  const validMode: fc.Arbitrary<SubAgentMode> = fc.constantFrom(
    "run_agent",
    "fork_agent",
    "parallel_agents",
    "multi_agent",
    "run_workflow",
    "ask_llm"
  )

  /**
   * 生成有效的 prompt 字符串
   * - 非空，长度 1-200
   */
  const validPrompt = fc
    .array(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 分析代码执行任务测试".split("")
      ),
      { minLength: 1, maxLength: 200 }
    )
    .map((chars) => chars.join(""))

  /**
   * 生成有效的 agentType
   */
  const validAgentType = fc.constantFrom(
    "explore", "plan", "build", "custom", "query",
    "synthesis", "discussion", "workflow"
  )

  /**
   * 生成有效的 maxSteps（正整数）
   */
  const validMaxSteps = fc.integer({ min: 1, max: 100 })

  /**
   * 生成有效的 duration（非负毫秒数）
   */
  const validDuration = fc.integer({ min: 0, max: 300000 })

  /**
   * 生成有效的输出字符串
   */
  const validOutput = fc
    .array(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 完成结果输出".split("")
      ),
      { minLength: 0, maxLength: 200 }
    )
    .map((chars) => chars.join(""))

  /**
   * 生成有效的错误消息（可选）
   */
  const validError = fc.option(
    fc
      .array(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyz0123456789 错误超时失败".split("")
        ),
        { minLength: 1, maxLength: 100 }
      )
      .map((chars) => chars.join("")),
    { nil: undefined }
  )

  /**
   * 生成有效的 usage（可选）
   */
  const validUsage = fc.option(
    fc.record({
      inputTokens: fc.integer({ min: 0, max: 100000 }),
      outputTokens: fc.integer({ min: 0, max: 100000 }),
    }),
    { nil: undefined }
  )

  /**
   * 生成有效的 toolId
   */
  const validToolId = fc
    .tuple(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
      fc.array(
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")),
        { minLength: 1, maxLength: 15 }
      )
    )
    .map(([first, rest]) => first + rest.join(""))

  /**
   * 生成有效的子任务数量（1-10）
   */
  const validChildCount = fc.integer({ min: 1, max: 10 })

  /**
   * 生成有效的子任务名称
   */
  const validChildName = fc.constantFrom(
    "analyzer", "builder", "reviewer", "planner",
    "task-1", "task-2", "task-3", "Architect", "Developer"
  )

  // ==========================================================================
  // Property 14: Event Structure Completeness
  // ==========================================================================

  describe("Property 14: Event Structure Completeness", () => {
    /**
     * **Validates: Requirements 6.1, 6.5**
     *
     * *For any* SubAgentEvent of type "start", the event SHALL contain
     * id, mode, prompt, agentType, and maxSteps.
     * *For any* SubAgentEvent of type "end", the event SHALL contain
     * id, success, output, duration, and optionally error and usage.
     */

    it("start event should contain all required fields for any valid inputs", () => {
      fc.assert(
        fc.property(
          validId,
          validMode,
          validPrompt,
          validAgentType,
          validMaxSteps,
          (id, mode, prompt, agentType, maxSteps) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, mode)

            emitter.start(prompt, agentType, maxSteps)

            // 验证只发射了一个事件
            expect(events.length).toBe(1)

            const event = events[0] as SubAgentStartEvent
            // 验证事件类型
            expect(event.type).toBe("start")
            // 验证所有必需字段存在
            expect(event).toHaveProperty("id")
            expect(event).toHaveProperty("mode")
            expect(event).toHaveProperty("prompt")
            expect(event).toHaveProperty("agentType")
            expect(event).toHaveProperty("maxSteps")
            // 验证字段值正确
            expect(event.id).toBe(id)
            expect(event.mode).toBe(mode)
            expect(event.prompt).toBe(prompt)
            expect(event.agentType).toBe(agentType)
            expect(event.maxSteps).toBe(maxSteps)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("end event should contain all required fields for any valid inputs", () => {
      fc.assert(
        fc.property(
          validId,
          validMode,
          fc.boolean(),
          validOutput,
          validDuration,
          validError,
          validUsage,
          (id, mode, success, output, duration, error, usage) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, mode)

            emitter.end(success, output, duration, error, usage)

            // 验证只发射了一个事件
            expect(events.length).toBe(1)

            const event = events[0] as SubAgentEndEvent
            // 验证事件类型
            expect(event.type).toBe("end")
            // 验证所有必需字段存在
            expect(event).toHaveProperty("id")
            expect(event).toHaveProperty("success")
            expect(event).toHaveProperty("output")
            expect(event).toHaveProperty("duration")
            // 验证字段值正确
            expect(event.id).toBe(id)
            expect(event.success).toBe(success)
            expect(event.output).toBe(output)
            expect(event.duration).toBe(duration)
            // 验证可选字段
            expect(event.error).toBe(error)
            expect(event.usage).toEqual(usage)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("start event field types should be correct for any valid inputs", () => {
      fc.assert(
        fc.property(
          validId,
          validMode,
          validPrompt,
          validAgentType,
          validMaxSteps,
          (id, mode, prompt, agentType, maxSteps) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, mode)

            emitter.start(prompt, agentType, maxSteps)

            const event = events[0] as SubAgentStartEvent
            // 验证字段类型
            expect(typeof event.id).toBe("string")
            expect(typeof event.mode).toBe("string")
            expect(typeof event.prompt).toBe("string")
            expect(typeof event.agentType).toBe("string")
            expect(typeof event.maxSteps).toBe("number")
            // maxSteps 应为正整数
            expect(event.maxSteps).toBeGreaterThanOrEqual(1)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("end event duration should be a non-negative number for any valid inputs", () => {
      fc.assert(
        fc.property(
          validId,
          fc.boolean(),
          validOutput,
          validDuration,
          (id, success, output, duration) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener)

            emitter.end(success, output, duration)

            const event = events[0] as SubAgentEndEvent
            expect(typeof event.duration).toBe("number")
            expect(event.duration).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // ==========================================================================
  // Property 15: Tool Event Timing
  // ==========================================================================

  describe("Property 15: Tool Event Timing", () => {
    /**
     * **Validates: Requirements 6.3**
     *
     * *For any* tool_end event, the event SHALL contain the duration field
     * representing execution time in milliseconds.
     */

    it("tool_end event should always contain duration field for any valid inputs", () => {
      fc.assert(
        fc.property(
          validId,
          validMode,
          validToolId,
          validOutput,
          fc.boolean(),
          validDuration,
          (id, mode, toolId, output, isError, duration) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, mode)

            emitter.toolEnd(toolId, output, isError, duration)

            expect(events.length).toBe(1)

            const event = events[0] as SubAgentToolEndEvent
            // 验证事件类型
            expect(event.type).toBe("tool_end")
            // 验证 duration 字段存在且为数字
            expect(event).toHaveProperty("duration")
            expect(typeof event.duration).toBe("number")
            // 验证 duration 值正确
            expect(event.duration).toBe(duration)
            // 验证 duration 为非负数
            expect(event.duration).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("tool_end event should contain all required fields for any valid inputs", () => {
      fc.assert(
        fc.property(
          validId,
          validToolId,
          validOutput,
          fc.boolean(),
          validDuration,
          (id, toolId, output, isError, duration) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener)

            emitter.toolEnd(toolId, output, isError, duration)

            const event = events[0] as SubAgentToolEndEvent
            // 验证所有必需字段
            expect(event).toHaveProperty("type")
            expect(event).toHaveProperty("id")
            expect(event).toHaveProperty("toolId")
            expect(event).toHaveProperty("output")
            expect(event).toHaveProperty("isError")
            expect(event).toHaveProperty("duration")
            // 验证字段值
            expect(event.id).toBe(id)
            expect(event.toolId).toBe(toolId)
            expect(event.output).toBe(output)
            expect(event.isError).toBe(isError)
            expect(event.duration).toBe(duration)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("tool_end duration should preserve exact millisecond value", () => {
      fc.assert(
        fc.property(
          validId,
          validToolId,
          fc.integer({ min: 0, max: 600000 }),
          (id, toolId, durationMs) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener)

            emitter.toolEnd(toolId, "output", false, durationMs)

            const event = events[0] as SubAgentToolEndEvent
            // duration 应精确保留毫秒值
            expect(event.duration).toBe(durationMs)
            expect(Number.isInteger(event.duration)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // ==========================================================================
  // Property 16: Child Event Emission
  // ==========================================================================

  describe("Property 16: Child Event Emission", () => {
    /**
     * **Validates: Requirements 6.6**
     *
     * *For any* sub-agent that spawns child tasks (parallel_agents, multi_agent),
     * child_start and child_end events SHALL be emitted for each child.
     */

    it("should emit matching child_start and child_end for each child in parallel_agents mode", () => {
      fc.assert(
        fc.property(
          validId,
          validChildCount,
          validPrompt,
          (id, childCount, prompt) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, "parallel_agents")

            // 为每个子任务发射 child_start 和 child_end
            for (let i = 0; i < childCount; i++) {
              const childId = `child-${i}`
              const childName = `task-${i}`
              emitter.childStart(childId, childName, prompt)
              emitter.childEnd(childId, childName, true, "done")
            }

            // 验证 child_start 事件数量
            const childStarts = events.filter(
              (e) => e.type === "child_start"
            ) as SubAgentChildStartEvent[]
            expect(childStarts.length).toBe(childCount)

            // 验证 child_end 事件数量
            const childEnds = events.filter(
              (e) => e.type === "child_end"
            ) as SubAgentChildEndEvent[]
            expect(childEnds.length).toBe(childCount)

            // 验证每个 child_start 都有对应的 child_end
            for (let i = 0; i < childCount; i++) {
              const expectedChildId = `child-${i}`
              const start = childStarts.find(
                (e) => e.childId === expectedChildId
              )
              const end = childEnds.find(
                (e) => e.childId === expectedChildId
              )
              expect(start).toBeDefined()
              expect(end).toBeDefined()
              expect(start!.childName).toBe(end!.childName)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should emit matching child_start and child_end for each child in multi_agent mode", () => {
      fc.assert(
        fc.property(
          validId,
          validChildCount,
          validPrompt,
          (id, childCount, prompt) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, "multi_agent")

            // 为每个子任务发射 child_start 和 child_end
            for (let i = 0; i < childCount; i++) {
              const childId = `agent-${i}`
              const childName = `agent-${i}`
              emitter.childStart(childId, childName, prompt)
              emitter.childEnd(childId, childName, true, "result")
            }

            const childStarts = events.filter(
              (e) => e.type === "child_start"
            ) as SubAgentChildStartEvent[]
            const childEnds = events.filter(
              (e) => e.type === "child_end"
            ) as SubAgentChildEndEvent[]

            // 验证数量匹配
            expect(childStarts.length).toBe(childCount)
            expect(childEnds.length).toBe(childCount)

            // 验证每对 child_start/child_end 的 parentId 一致
            for (const start of childStarts) {
              expect(start.id).toBe(id)
            }
            for (const end of childEnds) {
              expect(end.id).toBe(id)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("child_start event should contain all required fields for any valid inputs", () => {
      fc.assert(
        fc.property(
          validId,
          validToolId,
          validChildName,
          validPrompt,
          (id, childId, childName, prompt) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, "parallel_agents")

            emitter.childStart(childId, childName, prompt)

            expect(events.length).toBe(1)

            const event = events[0] as SubAgentChildStartEvent
            // 验证事件类型
            expect(event.type).toBe("child_start")
            // 验证所有必需字段
            expect(event).toHaveProperty("id")
            expect(event).toHaveProperty("childId")
            expect(event).toHaveProperty("childName")
            expect(event).toHaveProperty("prompt")
            // 验证字段值
            expect(event.id).toBe(id)
            expect(event.childId).toBe(childId)
            expect(event.childName).toBe(childName)
            expect(event.prompt).toBe(prompt)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("child_end event should contain all required fields for any valid inputs", () => {
      fc.assert(
        fc.property(
          validId,
          validToolId,
          validChildName,
          fc.boolean(),
          validOutput,
          validError,
          (id, childId, childName, success, output, error) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, "multi_agent")

            emitter.childEnd(childId, childName, success, output, error)

            expect(events.length).toBe(1)

            const event = events[0] as SubAgentChildEndEvent
            // 验证事件类型
            expect(event.type).toBe("child_end")
            // 验证所有必需字段
            expect(event).toHaveProperty("id")
            expect(event).toHaveProperty("childId")
            expect(event).toHaveProperty("childName")
            expect(event).toHaveProperty("success")
            expect(event).toHaveProperty("output")
            // 验证字段值
            expect(event.id).toBe(id)
            expect(event.childId).toBe(childId)
            expect(event.childName).toBe(childName)
            expect(event.success).toBe(success)
            expect(event.output).toBe(output)
            expect(event.error).toBe(error)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("child events should maintain correct parent-child relationship for any child count", () => {
      fc.assert(
        fc.property(
          validId,
          fc.constantFrom<SubAgentMode>("parallel_agents", "multi_agent"),
          validChildCount,
          (id, mode, childCount) => {
            const events: SubAgentEvent[] = []
            const listener: SubAgentEventListener = (e) => events.push(e)
            const emitter = createSubAgentEmitter(id, listener, mode)

            // 发射完整的事件序列：start + children + end
            emitter.start("parent task", "synthesis", childCount * 2)

            const childIds: string[] = []
            for (let i = 0; i < childCount; i++) {
              const childId = `c-${i}`
              childIds.push(childId)
              emitter.childStart(childId, `child-${i}`, `subtask ${i}`)
            }
            for (let i = 0; i < childCount; i++) {
              emitter.childEnd(childIds[i], `child-${i}`, true, `result-${i}`)
            }

            emitter.end(true, "all done", 5000)

            // 验证所有 child 事件的 parent id 一致
            const childEvents = events.filter(
              (e) => e.type === "child_start" || e.type === "child_end"
            )
            expect(childEvents.length).toBe(childCount * 2)

            for (const event of childEvents) {
              expect(event.id).toBe(id)
            }

            // 验证 child_start 在 child_end 之前（按 childId 配对）
            for (const cid of childIds) {
              const startIdx = events.findIndex(
                (e) => e.type === "child_start" && (e as SubAgentChildStartEvent).childId === cid
              )
              const endIdx = events.findIndex(
                (e) => e.type === "child_end" && (e as SubAgentChildEndEvent).childId === cid
              )
              expect(startIdx).toBeLessThan(endIdx)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
