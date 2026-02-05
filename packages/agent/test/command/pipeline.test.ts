/**
 * 管道执行器测试
 *
 * 需求: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import {
  hasPipe,
  parsePipeline,
  executePipeline,
  _findPipePositions,
  _parseCommandParts,
} from "../../src/command/pipeline"

// ============================================================================
// 单元测试
// ============================================================================

describe("hasPipe()", () => {
  it("检测简单管道", () => {
    expect(hasPipe("cmd1 | cmd2")).toBe(true)
  })

  it("无管道返回 false", () => {
    expect(hasPipe("cmd1 arg1")).toBe(false)
  })

  it("引号内的管道不计", () => {
    expect(hasPipe('cmd1 "a|b"')).toBe(false)
    expect(hasPipe("cmd1 'a|b'")).toBe(false)
  })

  it("混合引号和管道", () => {
    expect(hasPipe('cmd1 "a|b" | cmd2')).toBe(true)
  })
})

describe("parsePipeline()", () => {
  it("解析简单管道", () => {
    const stages = parsePipeline("cmd1 | cmd2")
    expect(stages.length).toBe(2)
    expect(stages[0].command).toBe("cmd1")
    expect(stages[1].command).toBe("cmd2")
  })

  it("解析带参数的管道", () => {
    const stages = parsePipeline("cmd1 arg1 | cmd2 arg2")
    expect(stages[0].args).toEqual(["arg1"])
    expect(stages[1].args).toEqual(["arg2"])
  })

  it("解析多级管道", () => {
    const stages = parsePipeline("cmd1 | cmd2 | cmd3")
    expect(stages.length).toBe(3)
  })

  it("无管道返回单个阶段", () => {
    const stages = parsePipeline("cmd1 arg1")
    expect(stages.length).toBe(1)
    expect(stages[0].command).toBe("cmd1")
  })

  it("处理引号内的管道", () => {
    const stages = parsePipeline('cmd1 "a|b" | cmd2')
    expect(stages.length).toBe(2)
    expect(stages[0].args).toEqual(["a|b"])
  })
})

describe("_parseCommandParts()", () => {
  it("解析简单命令", () => {
    const parts = _parseCommandParts("cmd arg1 arg2")
    expect(parts).toEqual(["cmd", "arg1", "arg2"])
  })

  it("处理双引号", () => {
    const parts = _parseCommandParts('cmd "arg with space"')
    expect(parts).toEqual(["cmd", "arg with space"])
  })

  it("处理单引号", () => {
    const parts = _parseCommandParts("cmd 'arg with space'")
    expect(parts).toEqual(["cmd", "arg with space"])
  })

  it("处理转义字符", () => {
    const parts = _parseCommandParts("cmd arg\\ with\\ space")
    expect(parts).toEqual(["cmd", "arg with space"])
  })
})

describe("executePipeline()", () => {
  const mockExecutor = async (cmd: string, args: string[]) => {
    if (cmd === "fail") {
      return { success: false, output: "", error: "命令失败" }
    }
    return { success: true, output: `${cmd}:${args.join(",")}` }
  }

  it("执行简单管道", async () => {
    const result = await executePipeline("cmd1 | cmd2", mockExecutor)
    expect(result.success).toBe(true)
    expect(result.stagesExecuted).toBe(2)
  })

  it("传递输出作为第一个参数", async () => {
    const result = await executePipeline("cmd1 arg1 | cmd2", mockExecutor)
    expect(result.success).toBe(true)
    // cmd2 应该收到 cmd1 的输出作为第一个参数
    expect(result.output).toContain("cmd1:arg1")
  })

  it("失败时停止执行", async () => {
    const result = await executePipeline("fail | cmd2", mockExecutor)
    expect(result.success).toBe(false)
    expect(result.stagesExecuted).toBe(1)
  })
})


// ============================================================================
// 属性测试
// ============================================================================

describe("管道属性测试", () => {
  /**
   * 属性 18: 引号外管道解析
   * 验证需求: 7.1
   */
  describe("属性 18: 引号外管道解析", () => {
    it("引号内的管道不应被解析", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z]+$/),
          fc.stringMatching(/^[a-z]+$/),
          (before, after) => {
            // 双引号
            const doubleQuoted = `cmd "${before}|${after}"`
            const stages1 = parsePipeline(doubleQuoted)
            if (stages1.length !== 1) return false

            // 单引号
            const singleQuoted = `cmd '${before}|${after}'`
            const stages2 = parsePipeline(singleQuoted)
            if (stages2.length !== 1) return false

            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("引号外的管道应被解析", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z]+$/),
          fc.stringMatching(/^[a-z]+$/),
          (cmd1, cmd2) => {
            const input = `${cmd1} | ${cmd2}`
            const stages = parsePipeline(input)
            return stages.length === 2
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  /**
   * 属性 19: 管道数据流
   * 验证需求: 7.2
   */
  describe("属性 19: 管道数据流", () => {
    it("输出应该传递给下一阶段", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z]+$/),
          async (output) => {
            let receivedArgs: string[] = []
            const executor = async (cmd: string, args: string[]) => {
              if (cmd === "cmd1") {
                return { success: true, output }
              }
              receivedArgs = args
              return { success: true, output: "done" }
            }

            await executePipeline("cmd1 | cmd2", executor)
            return receivedArgs[0] === output
          }
        ),
        { numRuns: 30 }
      )
    })
  })

  /**
   * 属性 20: 管道失败停止执行
   * 验证需求: 7.3
   */
  describe("属性 20: 管道失败停止执行", () => {
    it("失败后不应执行后续阶段", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 0, max: 4 }),
          async (totalStages, failAt) => {
            if (failAt >= totalStages) return true

            let executedCount = 0
            const executor = async (cmd: string, _args: string[]) => {
              executedCount++
              if (cmd === `cmd${failAt}`) {
                return { success: false, output: "", error: "fail" }
              }
              return { success: true, output: "ok" }
            }

            const commands = Array.from(
              { length: totalStages },
              (_, i) => `cmd${i}`
            ).join(" | ")

            const result = await executePipeline(commands, executor)

            // 执行数应该等于失败位置 + 1
            return executedCount === failAt + 1 && !result.success
          }
        ),
        { numRuns: 30 }
      )
    })
  })
})
