/**
 * 链式执行器测试
 *
 * 需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import {
  hasChain,
  parseChain,
  executeChain,
  _findChainPositions,
} from "../../src/command/chain"

// ============================================================================
// 单元测试
// ============================================================================

describe("hasChain()", () => {
  it("检测 && 操作符", () => {
    expect(hasChain("cmd1 && cmd2")).toBe(true)
  })

  it("检测 ; 操作符", () => {
    expect(hasChain("cmd1 ; cmd2")).toBe(true)
  })

  it("无链式操作符返回 false", () => {
    expect(hasChain("cmd1 arg1")).toBe(false)
  })

  it("引号内的操作符不计", () => {
    expect(hasChain('cmd1 "a&&b"')).toBe(false)
    expect(hasChain('cmd1 "a;b"')).toBe(false)
  })
})

describe("parseChain()", () => {
  it("解析 && 链", () => {
    const segments = parseChain("cmd1 && cmd2")
    expect(segments.length).toBe(2)
    expect(segments[0].command).toBe("cmd1")
    expect(segments[0].operator).toBe("&&")
    expect(segments[1].command).toBe("cmd2")
  })

  it("解析 ; 链", () => {
    const segments = parseChain("cmd1 ; cmd2")
    expect(segments.length).toBe(2)
    expect(segments[0].operator).toBe(";")
  })

  it("解析混合链", () => {
    const segments = parseChain("cmd1 && cmd2 ; cmd3")
    expect(segments.length).toBe(3)
    expect(segments[0].operator).toBe("&&")
    expect(segments[1].operator).toBe(";")
  })

  it("无链式操作符返回单个段", () => {
    const segments = parseChain("cmd1 arg1")
    expect(segments.length).toBe(1)
    expect(segments[0].operator).toBeNull()
  })
})

describe("executeChain()", () => {
  const mockExecutor = async (cmd: string, _args: string[]) => {
    if (cmd === "fail") {
      return { success: false, output: "", error: "命令失败" }
    }
    return { success: true, output: `${cmd}:ok` }
  }

  it("执行 && 链（全部成功）", async () => {
    const result = await executeChain("cmd1 && cmd2", mockExecutor)
    expect(result.success).toBe(true)
    expect(result.segmentsExecuted).toBe(2)
  })

  it("执行 && 链（第一个失败）", async () => {
    const result = await executeChain("fail && cmd2", mockExecutor)
    expect(result.success).toBe(false)
    expect(result.segmentsExecuted).toBe(1)
  })

  it("执行 ; 链（第一个失败仍继续）", async () => {
    const result = await executeChain("fail ; cmd2", mockExecutor)
    expect(result.segmentsExecuted).toBe(2)
  })

  it("混合 && 和 ;", async () => {
    const result = await executeChain("fail && cmd2 ; cmd3", mockExecutor)
    // fail 失败，cmd2 被跳过，cmd3 执行
    expect(result.segmentsExecuted).toBe(2) // fail 和 cmd3
  })
})


// ============================================================================
// 属性测试
// ============================================================================

describe("链式属性测试", () => {
  /**
   * 属性 21: 链式条件执行 (&&)
   * 验证需求: 8.1
   */
  describe("属性 21: 链式条件执行 (&&)", () => {
    it("&& 前失败应跳过后续 && 命令", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (chainLength) => {
            let executedCommands: string[] = []
            const executor = async (cmd: string, _args: string[]) => {
              executedCommands.push(cmd)
              if (cmd === "cmd0") {
                return { success: false, output: "", error: "fail" }
              }
              return { success: true, output: "ok" }
            }

            const commands = Array.from(
              { length: chainLength },
              (_, i) => `cmd${i}`
            ).join(" && ")

            executedCommands = []
            await executeChain(commands, executor)

            // 只有 cmd0 应该被执行
            return executedCommands.length === 1 && executedCommands[0] === "cmd0"
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  /**
   * 属性 22: 链式无条件执行 (;)
   * 验证需求: 8.2
   */
  describe("属性 22: 链式无条件执行 (;)", () => {
    it("; 前失败仍应执行后续命令", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (chainLength) => {
            let executedCommands: string[] = []
            const executor = async (cmd: string, _args: string[]) => {
              executedCommands.push(cmd)
              if (cmd === "cmd0") {
                return { success: false, output: "", error: "fail" }
              }
              return { success: true, output: "ok" }
            }

            const commands = Array.from(
              { length: chainLength },
              (_, i) => `cmd${i}`
            ).join(" ; ")

            executedCommands = []
            await executeChain(commands, executor)

            // 所有命令都应该被执行
            return executedCommands.length === chainLength
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  /**
   * 属性 23: 链式结果聚合
   * 验证需求: 8.3
   */
  describe("属性 23: 链式结果聚合", () => {
    it("输出数组长度应等于执行的段数", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (chainLength) => {
            const executor = async (cmd: string, _args: string[]) => {
              return { success: true, output: cmd }
            }

            const commands = Array.from(
              { length: chainLength },
              (_, i) => `cmd${i}`
            ).join(" ; ")

            const result = await executeChain(commands, executor)

            return result.outputs.length === result.segmentsExecuted
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  /**
   * 属性 24: 混合操作符优先级
   * 验证需求: 8.5
   */
  describe("属性 24: 混合操作符优先级", () => {
    it("操作符应从左到右求值", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("&&", ";"),
          fc.constantFrom("&&", ";"),
          async (op1, op2) => {
            const executionOrder: string[] = []
            const executor = async (cmd: string, _args: string[]) => {
              executionOrder.push(cmd)
              return { success: true, output: cmd }
            }

            const input = `cmd1 ${op1} cmd2 ${op2} cmd3`
            await executeChain(input, executor)

            // 应该按顺序执行
            return (
              executionOrder[0] === "cmd1" &&
              executionOrder[1] === "cmd2" &&
              executionOrder[2] === "cmd3"
            )
          }
        ),
        { numRuns: 20 }
      )
    })
  })
})
