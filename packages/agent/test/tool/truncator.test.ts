/**
 * OutputTruncator 单元测试
 * 简化版 - 只测试核心功能
 */

import { describe, it, expect } from "vitest"
import {
  createOutputTruncator,
  DEFAULT_TRUNCATOR_CONFIG,
} from "../../src/tool/output-truncator"

describe("OutputTruncator", () => {
  it("应该创建截断器", () => {
    const truncator = createOutputTruncator()
    expect(truncator).toBeDefined()
    expect(truncator.truncate).toBeInstanceOf(Function)
    expect(truncator.needsTruncation).toBeInstanceOf(Function)
  })

  it("应该检测是否需要截断", () => {
    const truncator = createOutputTruncator({ maxLength: 100 })
    expect(truncator.needsTruncation("a".repeat(101))).toBe(true)
    expect(truncator.needsTruncation("a".repeat(100))).toBe(false)
  })

  it("应该截断超长输出", () => {
    const truncator = createOutputTruncator({
      maxLength: 100,
      headLength: 30,
      tailLength: 20,
      smartTruncate: false,
    })
    const result = truncator.truncate("a".repeat(200))
    
    expect(result.truncated).toBe(true)
    expect(result.output).toContain("[截断:")
  })

  it("不需要截断时返回原始输出", () => {
    const truncator = createOutputTruncator({ maxLength: 100 })
    const output = "Hello"
    const result = truncator.truncate(output)
    
    expect(result.truncated).toBe(false)
    expect(result.output).toBe(output)
  })

  it("应该有正确的默认配置", () => {
    expect(DEFAULT_TRUNCATOR_CONFIG.maxLength).toBe(10000)
    expect(DEFAULT_TRUNCATOR_CONFIG.smartTruncate).toBe(true)
  })
})
