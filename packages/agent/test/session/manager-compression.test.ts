/**
 * SessionManager 压缩集成测试
 */

import { describe, it, expect, beforeEach } from "vitest"
import { SessionManager } from "../../src/session/manager"
import type { Message, ContentBlock } from "../../src/session/message"

describe("SessionManager - Compression Integration", () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager()
  })

  describe("configureCompression", () => {
    it("should enable compression with default config", () => {
      manager.configureCompression({ enabled: true })
      
      const config = manager.getCompressionConfig()
      expect(config.enabled).toBe(true)
    })

    it("should enable compression with custom config", () => {
      manager.configureCompression({
        enabled: true,
        config: { keepRecentMessages: 5 },
      })
      
      const config = manager.getCompressionConfig()
      expect(config.enabled).toBe(true)
      expect(config.config?.keepRecentMessages).toBe(5)
    })

    it("should disable compression", () => {
      manager.configureCompression({ enabled: true })
      manager.configureCompression({ enabled: false })
      
      const config = manager.getCompressionConfig()
      expect(config.enabled).toBe(false)
    })
  })

  describe("tryCompress", () => {
    it("should return false when compression disabled", () => {
      const session = manager.create()
      
      const result = manager.tryCompress(session.id)
      expect(result).toBe(false)
    })

    it("should return false when messages below threshold", () => {
      manager.configureCompression({ enabled: true })
      const session = manager.create()
      
      // 添加少量消息
      manager.addUserMessage(session.id, "Hello")
      manager.addAssistantMessage(session.id, [{ type: "text", text: "Hi" }])
      
      const result = manager.tryCompress(session.id)
      expect(result).toBe(false)
    })
  })

  describe("compressSession", () => {
    it("should compress session manually", () => {
      const session = manager.create()
      
      // 添加大量消息
      for (let i = 0; i < 20; i++) {
        manager.addUserMessage(session.id, `Message ${i}: ${"x".repeat(1000)}`)
        manager.addAssistantMessage(session.id, [{ 
          type: "text", 
          text: `Response ${i}: ${"y".repeat(1000)}` 
        }])
      }
      
      const beforeCount = manager.get(session.id)!.messages.length
      
      const result = manager.compressSession(session.id, {
        maxContextTokens: 5000,
        compressionThreshold: 0.5,
        keepRecentMessages: 5,
      })
      
      const afterCount = manager.get(session.id)!.messages.length
      
      expect(result.compressed).toBe(true)
      expect(afterCount).toBeLessThan(beforeCount)
    })

    it("should not compress when below threshold", () => {
      const session = manager.create()
      
      // 添加少量消息
      manager.addUserMessage(session.id, "Hello")
      manager.addAssistantMessage(session.id, [{ type: "text", text: "Hi" }])
      
      const result = manager.compressSession(session.id)
      
      expect(result.compressed).toBe(false)
      expect(result.compressedCount).toBe(0)
    })

    it("should return compression stats", () => {
      const session = manager.create()
      
      // 添加大量消息
      for (let i = 0; i < 30; i++) {
        manager.addUserMessage(session.id, `Message ${i}: ${"x".repeat(500)}`)
        manager.addAssistantMessage(session.id, [{ 
          type: "text", 
          text: `Response ${i}: ${"y".repeat(500)}` 
        }])
      }
      
      const result = manager.compressSession(session.id, {
        maxContextTokens: 5000,
        compressionThreshold: 0.3,
        keepRecentMessages: 5,
      })
      
      expect(result.beforeTokens).toBeGreaterThan(0)
      expect(result.afterTokens).toBeGreaterThan(0)
      if (result.compressed) {
        expect(result.afterTokens).toBeLessThan(result.beforeTokens)
      }
    })
  })

  describe("auto compression on addMessage", () => {
    it("should auto compress when threshold exceeded", () => {
      manager.configureCompression({
        enabled: true,
        config: {
          maxContextTokens: 3000,
          compressionThreshold: 0.5,
          keepRecentMessages: 3,
        },
      })
      
      const session = manager.create()
      
      // 添加大量消息直到触发压缩
      for (let i = 0; i < 50; i++) {
        manager.addUserMessage(session.id, `Message ${i}: ${"x".repeat(200)}`)
        manager.addAssistantMessage(session.id, [{ 
          type: "text", 
          text: `Response ${i}: ${"y".repeat(200)}` 
        }])
      }
      
      // 消息数量应该被压缩
      const finalCount = manager.get(session.id)!.messages.length
      expect(finalCount).toBeLessThan(100) // 原本应该有 100 条消息
    })
  })
})
