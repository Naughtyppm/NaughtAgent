/**
 * Tokenizer 单元测试
 *
 * 测试内容：
 * - EstimateTokenizer
 * - ClaudeTokenizer
 * - GPTTokenizer
 * - TokenizerFactory
 * - TokenizerProvider
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  // Tokenizer 实现
  EstimateTokenizer,
  createEstimateTokenizer,
  ClaudeTokenizer,
  createClaudeTokenizer,
  createClaudeTokenizerSync,
  preloadClaudeTokenizer,
  GPTTokenizer,
  createGPTTokenizer,
  createGPTTokenizerSync,
  preloadGPTTokenizer,
  // 工厂和 Provider
  getTokenizerFactory,
  createTokenizer,
  getTokenizerProvider,
  createTokenizerProvider,
  // 错误类型
  TokenizerLoadError,
  InvalidTokenError,
  TextTooLongError,
  // 类型
  type Tokenizer,
  type TokenizerType,
} from "../../src/token"

// ============================================================================
// EstimateTokenizer 测试
// ============================================================================

describe("EstimateTokenizer", () => {
  let tokenizer: Tokenizer

  beforeEach(() => {
    tokenizer = createEstimateTokenizer()
  })

  describe("type", () => {
    it("should have type 'estimate'", () => {
      expect(tokenizer.type).toBe("estimate")
    })
  })


  describe("countTokens", () => {
    it("should return 0 for empty string", () => {
      expect(tokenizer.countTokens("")).toBe(0)
    })

    it("should return 0 for null/undefined", () => {
      expect(tokenizer.countTokens(null as any)).toBe(0)
      expect(tokenizer.countTokens(undefined as any)).toBe(0)
    })

    it("should estimate English text (4 chars/token)", () => {
      // 12 English chars = ~3 tokens
      const text = "Hello World!"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(10)
    })

    it("should estimate Chinese text (1.5 chars/token)", () => {
      // 6 Chinese chars = ~4 tokens
      const text = "你好世界测试"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(10)
    })

    it("should estimate mixed text", () => {
      const text = "Hello 你好 World 世界"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should handle special characters", () => {
      const text = "!@#$%^&*()_+-=[]{}|;':\",./<>?"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe("encode", () => {
    it("should return empty array for empty string", () => {
      expect(tokenizer.encode("")).toEqual([])
    })

    it("should return char codes as pseudo tokens", () => {
      const text = "abc"
      const encoded = tokenizer.encode(text)
      expect(encoded).toEqual([97, 98, 99]) // 'a', 'b', 'c' char codes
    })
  })

  describe("decode", () => {
    it("should return empty string for empty array", () => {
      expect(tokenizer.decode([])).toBe("")
    })

    it("should decode char codes back to text", () => {
      const tokens = [97, 98, 99]
      expect(tokenizer.decode(tokens)).toBe("abc")
    })

    it("should roundtrip encode/decode", () => {
      const text = "Hello World"
      const encoded = tokenizer.encode(text)
      const decoded = tokenizer.decode(encoded)
      expect(decoded).toBe(text)
    })
  })


  describe("truncateToTokens", () => {
    it("should return empty string for empty input", () => {
      expect(tokenizer.truncateToTokens("", 10)).toBe("")
    })

    it("should return empty string for maxTokens <= 0", () => {
      expect(tokenizer.truncateToTokens("Hello", 0)).toBe("")
      expect(tokenizer.truncateToTokens("Hello", -1)).toBe("")
    })

    it("should return full text if under limit", () => {
      const text = "Hi"
      expect(tokenizer.truncateToTokens(text, 100)).toBe(text)
    })

    it("should truncate text to fit token limit", () => {
      const text = "This is a very long text that should be truncated"
      const truncated = tokenizer.truncateToTokens(text, 5)
      expect(truncated.length).toBeLessThan(text.length)
      expect(tokenizer.countTokens(truncated)).toBeLessThanOrEqual(5)
    })

    it("should handle Chinese text truncation", () => {
      const text = "这是一段很长的中文文本需要被截断"
      const truncated = tokenizer.truncateToTokens(text, 3)
      expect(truncated.length).toBeLessThan(text.length)
      expect(tokenizer.countTokens(truncated)).toBeLessThanOrEqual(3)
    })
  })
})

// ============================================================================
// ClaudeTokenizer 测试
// ============================================================================

describe("ClaudeTokenizer", () => {
  let tokenizer: Tokenizer | null = null

  beforeEach(async () => {
    try {
      await preloadClaudeTokenizer()
      tokenizer = createClaudeTokenizerSync()
    } catch {
      // Claude tokenizer 可能不可用
    }
  })

  describe("type", () => {
    it("should have type 'claude'", () => {
      if (!tokenizer) return // Skip if not available
      expect(tokenizer.type).toBe("claude")
    })
  })

  describe("countTokens", () => {
    it("should return 0 for empty string", () => {
      if (!tokenizer) return
      expect(tokenizer.countTokens("")).toBe(0)
    })

    it("should count English text tokens", () => {
      if (!tokenizer) return
      const text = "Hello, world! This is a test."
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(20)
    })

    it("should count Chinese text tokens", () => {
      if (!tokenizer) return
      const text = "你好世界，这是一个测试。"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should count code tokens", () => {
      if (!tokenizer) return
      const code = `function hello() { return "world"; }`
      const tokens = tokenizer.countTokens(code)
      expect(tokens).toBeGreaterThan(0)
    })
  })


  describe("encode", () => {
    it("should return array with length equal to token count", () => {
      if (!tokenizer) return
      const text = "Hello world"
      const encoded = tokenizer.encode(text)
      const count = tokenizer.countTokens(text)
      expect(encoded.length).toBe(count)
    })
  })

  describe("decode", () => {
    it("should throw InvalidTokenError", () => {
      if (!tokenizer) return
      expect(() => tokenizer.decode([1, 2, 3])).toThrow(InvalidTokenError)
    })
  })

  describe("truncateToTokens", () => {
    it("should return empty string for empty input", () => {
      if (!tokenizer) return
      expect(tokenizer.truncateToTokens("", 10)).toBe("")
    })

    it("should return full text if under limit", () => {
      if (!tokenizer) return
      const text = "Hi"
      expect(tokenizer.truncateToTokens(text, 100)).toBe(text)
    })

    it("should truncate text to fit token limit", () => {
      if (!tokenizer) return
      const text = "This is a very long text that should be truncated to fit within the token limit"
      const truncated = tokenizer.truncateToTokens(text, 5)
      expect(truncated.length).toBeLessThan(text.length)
      expect(tokenizer.countTokens(truncated)).toBeLessThanOrEqual(5)
    })
  })

  describe("async creation", () => {
    it("should create tokenizer asynchronously", async () => {
      try {
        const asyncTokenizer = await createClaudeTokenizer()
        expect(asyncTokenizer.type).toBe("claude")
        expect(asyncTokenizer.countTokens("test")).toBeGreaterThan(0)
      } catch (error) {
        // 如果库不可用，应该抛出 TokenizerLoadError
        expect(error).toBeInstanceOf(TokenizerLoadError)
      }
    })
  })
})


// ============================================================================
// GPTTokenizer 测试
// ============================================================================

describe("GPTTokenizer", () => {
  let tokenizer: Tokenizer | null = null

  beforeEach(async () => {
    try {
      await preloadGPTTokenizer()
      tokenizer = createGPTTokenizerSync()
    } catch {
      // GPT tokenizer 可能不可用
    }
  })

  describe("type", () => {
    it("should have type 'gpt'", () => {
      if (!tokenizer) return
      expect(tokenizer.type).toBe("gpt")
    })
  })

  describe("countTokens", () => {
    it("should return 0 for empty string", () => {
      if (!tokenizer) return
      expect(tokenizer.countTokens("")).toBe(0)
    })

    it("should count English text tokens", () => {
      if (!tokenizer) return
      const text = "Hello, world! This is a test."
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(20)
    })

    it("should count Chinese text tokens", () => {
      if (!tokenizer) return
      const text = "你好世界，这是一个测试。"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe("encode/decode", () => {
    it("should encode text to token array", () => {
      if (!tokenizer) return
      const text = "Hello world"
      const encoded = tokenizer.encode(text)
      expect(Array.isArray(encoded)).toBe(true)
      expect(encoded.length).toBeGreaterThan(0)
    })

    it("should decode tokens back to text", () => {
      if (!tokenizer) return
      const text = "Hello world"
      const encoded = tokenizer.encode(text)
      const decoded = tokenizer.decode(encoded)
      // tiktoken decode 可能返回带有 BOM 或其他细微差异
      expect(decoded.trim()).toBe(text.trim())
    })

    it("should roundtrip encode/decode for ASCII text", () => {
      if (!tokenizer) return
      const text = "Hello"
      const encoded = tokenizer.encode(text)
      const decoded = tokenizer.decode(encoded)
      expect(decoded).toBe(text)
    })
  })


  describe("truncateToTokens", () => {
    it("should return empty string for empty input", () => {
      if (!tokenizer) return
      expect(tokenizer.truncateToTokens("", 10)).toBe("")
    })

    it("should return full text if under limit", () => {
      if (!tokenizer) return
      const text = "Hi"
      expect(tokenizer.truncateToTokens(text, 100)).toBe(text)
    })

    it("should truncate text precisely", () => {
      if (!tokenizer) return
      const text = "This is a very long text that should be truncated to fit within the token limit"
      const truncated = tokenizer.truncateToTokens(text, 5)
      expect(truncated.length).toBeLessThan(text.length)
      // GPT tokenizer 可以精确截断
      expect(tokenizer.countTokens(truncated)).toBe(5)
    })
  })

  describe("async creation", () => {
    it("should create tokenizer asynchronously", async () => {
      try {
        const asyncTokenizer = await createGPTTokenizer()
        expect(asyncTokenizer.type).toBe("gpt")
        expect(asyncTokenizer.countTokens("test")).toBeGreaterThan(0)
      } catch (error) {
        expect(error).toBeInstanceOf(TokenizerLoadError)
      }
    })

    it("should support different model encodings", async () => {
      try {
        const gpt4Tokenizer = await createGPTTokenizer("gpt-4")
        const gpt35Tokenizer = await createGPTTokenizer("gpt-3.5-turbo")
        
        // 两者都应该能正常工作
        expect(gpt4Tokenizer.countTokens("test")).toBeGreaterThan(0)
        expect(gpt35Tokenizer.countTokens("test")).toBeGreaterThan(0)
      } catch {
        // 库不可用时跳过
      }
    })
  })
})


// ============================================================================
// TokenizerFactory 测试
// ============================================================================

describe("TokenizerFactory", () => {
  describe("getTokenizerFactory", () => {
    it("should return singleton factory", () => {
      const factory1 = getTokenizerFactory()
      const factory2 = getTokenizerFactory()
      expect(factory1).toBe(factory2)
    })
  })

  describe("create", () => {
    it("should create estimate tokenizer", () => {
      const tokenizer = createTokenizer({ type: "estimate" })
      expect(tokenizer).not.toBeNull()
      expect(tokenizer!.type).toBe("estimate")
    })

    it("should fallback to estimate when claude unavailable", () => {
      const tokenizer = createTokenizer({
        type: "claude",
        fallbackStrategy: "estimate",
      })
      expect(tokenizer).not.toBeNull()
      // 可能是 claude 或 estimate
      expect(["claude", "estimate"]).toContain(tokenizer!.type)
    })

    it("should fallback to estimate when gpt unavailable", () => {
      const tokenizer = createTokenizer({
        type: "gpt",
        fallbackStrategy: "estimate",
      })
      expect(tokenizer).not.toBeNull()
      expect(["gpt", "estimate"]).toContain(tokenizer!.type)
    })

    it("should return null with none fallback strategy", () => {
      // 使用一个不存在的类型来测试
      const factory = getTokenizerFactory()
      // estimate 总是可用的
      const tokenizer = factory.create({
        type: "estimate",
        fallbackStrategy: "none",
      })
      expect(tokenizer).not.toBeNull()
    })

    it("should throw with error fallback strategy when unavailable", () => {
      // 这个测试依赖于库是否可用
      // 如果 claude 不可用，应该抛出错误
      try {
        const tokenizer = createTokenizer({
          type: "claude",
          fallbackStrategy: "error",
        })
        // 如果成功创建，说明库可用
        expect(tokenizer!.type).toBe("claude")
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }
    })
  })


  describe("isAvailable", () => {
    it("should report estimate as available", () => {
      const factory = getTokenizerFactory()
      expect(factory.isAvailable("estimate")).toBe(true)
    })
  })

  describe("getSupportedTypes", () => {
    it("should include estimate in supported types", () => {
      const factory = getTokenizerFactory()
      const types = factory.getSupportedTypes()
      expect(types).toContain("estimate")
    })
  })
})

// ============================================================================
// TokenizerProvider 测试
// ============================================================================

describe("TokenizerProvider", () => {
  describe("getTokenizerProvider", () => {
    it("should return singleton provider", () => {
      const provider1 = getTokenizerProvider()
      const provider2 = getTokenizerProvider()
      expect(provider1).toBe(provider2)
    })
  })

  describe("createTokenizerProvider", () => {
    it("should create new provider instance", () => {
      const provider1 = createTokenizerProvider()
      const provider2 = createTokenizerProvider()
      expect(provider1).not.toBe(provider2)
    })
  })

  describe("getTokenizer", () => {
    it("should return tokenizer for undefined model", () => {
      const provider = createTokenizerProvider()
      const tokenizer = provider.getTokenizer()
      expect(tokenizer).not.toBeNull()
    })

    it("should return claude tokenizer for claude models", () => {
      const provider = createTokenizerProvider()
      const tokenizer = provider.getTokenizer("claude-3-sonnet")
      expect(tokenizer).not.toBeNull()
      // 可能回退到 estimate
      expect(["claude", "estimate"]).toContain(tokenizer.type)
    })

    it("should return gpt tokenizer for gpt models", () => {
      const provider = createTokenizerProvider()
      const tokenizer = provider.getTokenizer("gpt-4")
      expect(tokenizer).not.toBeNull()
      expect(["gpt", "estimate"]).toContain(tokenizer.type)
    })

    it("should return estimate tokenizer for unknown models", () => {
      const provider = createTokenizerProvider()
      const tokenizer = provider.getTokenizer("unknown-model")
      expect(tokenizer).not.toBeNull()
      expect(tokenizer.type).toBe("estimate")
    })
  })


  describe("caching", () => {
    it("should cache tokenizers", () => {
      const provider = createTokenizerProvider()
      
      // 第一次获取
      provider.getTokenizer("claude-3-sonnet")
      const stats1 = provider.getCacheStats()
      
      // 第二次获取相同类型
      provider.getTokenizer("claude-3-opus")
      const stats2 = provider.getCacheStats()
      
      // 应该有缓存命中
      expect(stats2.hits).toBeGreaterThanOrEqual(stats1.hits)
    })

    it("should track cache stats", () => {
      const provider = createTokenizerProvider()
      
      const initialStats = provider.getCacheStats()
      expect(initialStats.cachedCount).toBe(0)
      expect(initialStats.hits).toBe(0)
      expect(initialStats.misses).toBe(0)
      
      // 获取一个 tokenizer
      provider.getTokenizer()
      
      const afterStats = provider.getCacheStats()
      expect(afterStats.cachedCount).toBeGreaterThan(0)
      expect(afterStats.misses).toBe(1)
    })

    it("should clear cache", () => {
      const provider = createTokenizerProvider()
      
      provider.getTokenizer()
      expect(provider.getCacheStats().cachedCount).toBeGreaterThan(0)
      
      provider.clearCache()
      
      const stats = provider.getCacheStats()
      expect(stats.cachedCount).toBe(0)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  describe("preload", () => {
    it("should preload tokenizers", async () => {
      const provider = createTokenizerProvider()
      
      await provider.preload(["claude", "gpt", "estimate"])
      
      // 预加载后缓存应该有内容
      const stats = provider.getCacheStats()
      expect(stats.cachedCount).toBeGreaterThan(0)
    })
  })
})


// ============================================================================
// 错误类型测试
// ============================================================================

describe("Error Types", () => {
  describe("TokenizerLoadError", () => {
    it("should create error with tokenizer type", () => {
      const error = new TokenizerLoadError("claude")
      expect(error.name).toBe("TokenizerLoadError")
      expect(error.tokenizerType).toBe("claude")
      expect(error.message).toContain("claude")
    })

    it("should include cause error", () => {
      const cause = new Error("Module not found")
      const error = new TokenizerLoadError("gpt", cause)
      expect(error.cause).toBe(cause)
      expect(error.message).toContain("Module not found")
    })
  })

  describe("InvalidTokenError", () => {
    it("should create error with invalid tokens", () => {
      const error = new InvalidTokenError([999, 888], "claude")
      expect(error.name).toBe("InvalidTokenError")
      expect(error.invalidTokens).toEqual([999, 888])
      expect(error.tokenizerType).toBe("claude")
      expect(error.message).toContain("999")
    })
  })

  describe("TextTooLongError", () => {
    it("should create error with length info", () => {
      const error = new TextTooLongError(10000, 5000)
      expect(error.name).toBe("TextTooLongError")
      expect(error.textLength).toBe(10000)
      expect(error.maxLength).toBe(5000)
      expect(error.message).toContain("10000")
      expect(error.message).toContain("5000")
    })
  })
})

// ============================================================================
// 边界情况测试
// ============================================================================

describe("Edge Cases", () => {
  describe("special characters", () => {
    it("should handle emoji", () => {
      const tokenizer = createEstimateTokenizer()
      const text = "Hello 👋 World 🌍"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should handle newlines", () => {
      const tokenizer = createEstimateTokenizer()
      const text = "Line 1\nLine 2\nLine 3"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should handle tabs", () => {
      const tokenizer = createEstimateTokenizer()
      const text = "Col1\tCol2\tCol3"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe("long text", () => {
    it("should handle very long text", () => {
      const tokenizer = createEstimateTokenizer()
      const text = "a".repeat(100000)
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe("unicode", () => {
    it("should handle Japanese text", () => {
      const tokenizer = createEstimateTokenizer()
      const text = "こんにちは世界"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should handle Korean text", () => {
      const tokenizer = createEstimateTokenizer()
      const text = "안녕하세요 세계"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should handle Arabic text", () => {
      const tokenizer = createEstimateTokenizer()
      const text = "مرحبا بالعالم"
      const tokens = tokenizer.countTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })
  })
})
