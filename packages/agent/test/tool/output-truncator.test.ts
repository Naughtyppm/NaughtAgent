/**
 * OutputTruncator 单元测试
 * 覆盖核心截断行为、配置、边界情况
 */

import { describe, it, expect } from "vitest"
import {
  createOutputTruncator,
  DEFAULT_TRUNCATOR_CONFIG,
} from "../../src/tool/output-truncator"

describe("OutputTruncator", () => {
  // 1. 短输出不截断（原样返回）
  it("短输出不截断，原样返回", () => {
    const truncator = createOutputTruncator({ maxLength: 200 })
    const input = "Hello, world!"
    const result = truncator.truncate(input)

    expect(result.truncated).toBe(false)
    expect(result.output).toBe(input)
    expect(result.originalLength).toBe(input.length)
    expect(result.truncatedLength).toBe(input.length)
  })

  // 2. 超长输出被截断
  it("超长输出被截断", () => {
    const truncator = createOutputTruncator({
      maxLength: 100,
      headLength: 30,
      tailLength: 20,
      smartTruncate: false,
    })
    const input = "x".repeat(500)
    const result = truncator.truncate(input)

    expect(result.truncated).toBe(true)
    expect(result.output.length).toBeLessThan(input.length)
    expect(result.originalLength).toBe(500)
  })

  // 3. 截断指示器包含原始长度
  it("截断指示器包含原始长度", () => {
    const truncator = createOutputTruncator({
      maxLength: 80,
      headLength: 20,
      tailLength: 20,
      smartTruncate: false,
    })
    const input = "a".repeat(300)
    const result = truncator.truncate(input)

    expect(result.truncated).toBe(true)
    expect(result.output).toContain("300")
    expect(result.output).toContain("[截断:")
  })

  // 4. 自定义 maxLength 控制截断阈值
  it("自定义 maxLength 控制截断阈值", () => {
    const small = createOutputTruncator({ maxLength: 50, smartTruncate: false })
    const large = createOutputTruncator({ maxLength: 500, smartTruncate: false })
    const input = "y".repeat(200)

    expect(small.needsTruncation(input)).toBe(true)
    expect(large.needsTruncation(input)).toBe(false)

    const resultSmall = small.truncate(input)
    const resultLarge = large.truncate(input)

    expect(resultSmall.truncated).toBe(true)
    expect(resultLarge.truncated).toBe(false)
    expect(resultLarge.output).toBe(input)
  })

  // 5. 空字符串输入
  it("空字符串输入不截断", () => {
    const truncator = createOutputTruncator({ maxLength: 100 })
    const result = truncator.truncate("")

    expect(result.truncated).toBe(false)
    expect(result.output).toBe("")
    expect(result.originalLength).toBe(0)
  })

  // 6. 多次调用互不影响
  it("多次调用互不影响", () => {
    const truncator = createOutputTruncator({
      maxLength: 50,
      smartTruncate: false,
    })

    const input1 = "a".repeat(200)
    const input2 = "short"
    const input3 = "b".repeat(300)

    const result1 = truncator.truncate(input1)
    const result2 = truncator.truncate(input2)
    const result3 = truncator.truncate(input3)

    expect(result1.truncated).toBe(true)
    expect(result1.originalLength).toBe(200)

    expect(result2.truncated).toBe(false)
    expect(result2.output).toBe("short")

    expect(result3.truncated).toBe(true)
    expect(result3.originalLength).toBe(300)
  })

  // 7. needsTruncation 边界检测
  it("needsTruncation 边界值正确", () => {
    const truncator = createOutputTruncator({ maxLength: 100 })

    expect(truncator.needsTruncation("a".repeat(100))).toBe(false)
    expect(truncator.needsTruncation("a".repeat(101))).toBe(true)
    expect(truncator.needsTruncation("a".repeat(99))).toBe(false)
  })

  // 8. DEFAULT_TRUNCATOR_CONFIG 默认值
  it("默认配置包含合理值", () => {
    expect(DEFAULT_TRUNCATOR_CONFIG.maxLength).toBe(10000)
    expect(DEFAULT_TRUNCATOR_CONFIG.smartTruncate).toBe(true)
    expect(DEFAULT_TRUNCATOR_CONFIG.headLength).toBeGreaterThan(0)
    expect(DEFAULT_TRUNCATOR_CONFIG.tailLength).toBeGreaterThan(0)
  })

  // 9. head + tail 内容保留
  it("截断后保留 head 和 tail 部分", () => {
    const truncator = createOutputTruncator({
      maxLength: 100,
      headLength: 20,
      tailLength: 20,
      smartTruncate: false,
    })
    const head = "HEAD_CONTENT_START__"
    const tail = "__TAIL_CONTENT_END!!"
    const middle = "m".repeat(500)
    const input = head + middle + tail

    const result = truncator.truncate(input)

    expect(result.truncated).toBe(true)
    expect(result.output).toContain("HEAD_CONTENT_START")
    expect(result.output).toContain("TAIL_CONTENT_END")
  })

  // 10. smartTruncate 模式也能正常截断多行输入
  it("smartTruncate 模式能截断多行输入", () => {
    const truncator = createOutputTruncator({
      maxLength: 100,
      headLength: 40,
      tailLength: 20,
      smartTruncate: true,
    })
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n")
    const result = truncator.truncate(lines)

    expect(result.truncated).toBe(true)
    expect(result.output.length).toBeLessThan(lines.length)
    expect(result.output).toContain("[截断:")
  })

  // 11. 恰好等于 maxLength 不截断
  it("恰好等于 maxLength 不截断", () => {
    const truncator = createOutputTruncator({ maxLength: 100 })
    const input = "a".repeat(100)
    const result = truncator.truncate(input)

    expect(result.truncated).toBe(false)
    expect(result.output).toBe(input)
  })

  // 12. 只超过 1 字符也会截断
  it("超过 maxLength 1 字符也会截断", () => {
    const truncator = createOutputTruncator({ maxLength: 100, smartTruncate: false })
    const input = "a".repeat(101)
    const result = truncator.truncate(input)

    expect(result.truncated).toBe(true)
  })
})
