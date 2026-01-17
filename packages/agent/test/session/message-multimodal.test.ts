/**
 * 多模态消息类型测试
 */

import { describe, it, expect } from "vitest"
import {
  createImageMessage,
  createAudioMessage,
  getImages,
  getAudios,
  createToolResult,
  type ImageBlock,
  type AudioBlock,
  type StopReason,
  type Message,
  type ToolResultBlock,
} from "../../src/session/message"

describe("多模态消息类型", () => {
  describe("ImageBlock", () => {
    it("应该支持 base64 图片", () => {
      const imageBlock: ImageBlock = {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "base64data...",
        },
      }

      expect(imageBlock.type).toBe("image")
      expect(imageBlock.source.type).toBe("base64")
    })

    it("应该支持 URL 图片", () => {
      const imageBlock: ImageBlock = {
        type: "image",
        source: {
          type: "url",
          media_type: "image/png",
          data: "https://example.com/image.png",
        },
      }

      expect(imageBlock.type).toBe("image")
      expect(imageBlock.source.type).toBe("url")
    })

    it("应该支持多种图片格式", () => {
      const formats: ImageBlock["source"]["media_type"][] = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ]

      formats.forEach((format) => {
        const block: ImageBlock = {
          type: "image",
          source: {
            type: "base64",
            media_type: format,
            data: "data",
          },
        }
        expect(block.source.media_type).toBe(format)
      })
    })
  })

  describe("AudioBlock", () => {
    it("应该支持 base64 音频", () => {
      const audioBlock: AudioBlock = {
        type: "audio",
        source: {
          type: "base64",
          media_type: "audio/wav",
          data: "base64audiodata...",
        },
      }

      expect(audioBlock.type).toBe("audio")
      expect(audioBlock.source.type).toBe("base64")
    })

    it("应该支持多种音频格式", () => {
      const formats: AudioBlock["source"]["media_type"][] = [
        "audio/wav",
        "audio/mp3",
      ]

      formats.forEach((format) => {
        const block: AudioBlock = {
          type: "audio",
          source: {
            type: "base64",
            media_type: format,
            data: "data",
          },
        }
        expect(block.source.media_type).toBe(format)
      })
    })
  })

  describe("StopReason", () => {
    it("应该支持所有停止原因类型", () => {
      const reasons: StopReason[] = [
        "end_turn",
        "max_tokens",
        "tool_use",
        "stop_sequence",
      ]

      reasons.forEach((reason) => {
        const message: Message = {
          id: "msg_1",
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
          timestamp: Date.now(),
          stop_reason: reason,
        }
        expect(message.stop_reason).toBe(reason)
      })
    })
  })

  describe("Message with stop_reason", () => {
    it("应该允许 assistant 消息包含 stop_reason", () => {
      const message: Message = {
        id: "msg_1",
        role: "assistant",
        content: [{ type: "text", text: "Hello" }],
        timestamp: Date.now(),
        stop_reason: "end_turn",
      }

      expect(message.stop_reason).toBe("end_turn")
    })

    it("stop_reason 应该是可选的", () => {
      const message: Message = {
        id: "msg_1",
        role: "assistant",
        content: [{ type: "text", text: "Hello" }],
        timestamp: Date.now(),
      }

      expect(message.stop_reason).toBeUndefined()
    })
  })

  describe("ToolResultBlock 多模态支持", () => {
    it("应该支持字符串内容", () => {
      const toolResult: ToolResultBlock = {
        type: "tool_result",
        tool_use_id: "tool_1",
        content: "Result text",
      }

      expect(typeof toolResult.content).toBe("string")
    })

    it("应该支持 ContentBlock 数组", () => {
      const toolResult: ToolResultBlock = {
        type: "tool_result",
        tool_use_id: "tool_1",
        content: [
          { type: "text", text: "Text result" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "imagedata",
            },
          },
        ],
      }

      expect(Array.isArray(toolResult.content)).toBe(true)
      expect(toolResult.content).toHaveLength(2)
    })

    it("应该支持混合多模态内容", () => {
      const toolResult: ToolResultBlock = {
        type: "tool_result",
        tool_use_id: "tool_1",
        content: [
          { type: "text", text: "Analysis result:" },
          {
            type: "image",
            source: {
              type: "url",
              media_type: "image/jpeg",
              data: "https://example.com/chart.jpg",
            },
          },
          {
            type: "audio",
            source: {
              type: "base64",
              media_type: "audio/mp3",
              data: "audiodata",
            },
          },
        ],
      }

      expect(Array.isArray(toolResult.content)).toBe(true)
      expect(toolResult.content).toHaveLength(3)
    })
  })

  describe("ContentBlock 联合类型", () => {
    it("应该包含所有内容块类型", () => {
      const message: Message = {
        id: "msg_1",
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "data",
            },
          },
          {
            type: "audio",
            source: {
              type: "base64",
              media_type: "audio/wav",
              data: "data",
            },
          },
          {
            type: "tool_use",
            id: "tool_1",
            name: "test_tool",
            input: {},
          },
          {
            type: "tool_result",
            tool_use_id: "tool_1",
            content: "result",
          },
        ],
        timestamp: Date.now(),
      }

      expect(message.content).toHaveLength(5)
      expect(message.content[0].type).toBe("text")
      expect(message.content[1].type).toBe("image")
      expect(message.content[2].type).toBe("audio")
      expect(message.content[3].type).toBe("tool_use")
      expect(message.content[4].type).toBe("tool_result")
    })
  })
})

describe("多模态工具函数", () => {
  describe("createImageMessage", () => {
    it("应该创建 base64 图片消息", () => {
      const imageData = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      
      const message = createImageMessage(imageData, "image/png", "base64")

      expect(message.role).toBe("user")
      expect(message.content).toHaveLength(1)
      expect(message.content[0].type).toBe("image")
      
      const imageBlock = message.content[0] as ImageBlock
      expect(imageBlock.source.type).toBe("base64")
      expect(imageBlock.source.media_type).toBe("image/png")
      expect(imageBlock.source.data).toBe(imageData)
      expect(message.id).toMatch(/^msg_/)
      expect(message.timestamp).toBeGreaterThan(0)
    })

    it("应该创建 URL 图片消息", () => {
      const imageUrl = "https://example.com/image.jpg"
      
      const message = createImageMessage(imageUrl, "image/jpeg", "url")

      expect(message.role).toBe("user")
      const imageBlock = message.content[0] as ImageBlock
      expect(imageBlock.source.type).toBe("url")
      expect(imageBlock.source.media_type).toBe("image/jpeg")
      expect(imageBlock.source.data).toBe(imageUrl)
    })

    it("默认应该使用 base64 类型", () => {
      const message = createImageMessage("data", "image/png")

      const imageBlock = message.content[0] as ImageBlock
      expect(imageBlock.source.type).toBe("base64")
    })

    it("应该支持所有图片格式", () => {
      const formats: ImageBlock["source"]["media_type"][] = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ]

      formats.forEach((format) => {
        const message = createImageMessage("data", format)
        const imageBlock = message.content[0] as ImageBlock
        expect(imageBlock.source.media_type).toBe(format)
      })
    })
  })

  describe("createAudioMessage", () => {
    it("应该创建音频消息", () => {
      const audioData = "UklGRiQAAABXQVZFZm10IBAAAAABAAEA..."
      
      const message = createAudioMessage(audioData, "audio/wav")

      expect(message.role).toBe("user")
      expect(message.content).toHaveLength(1)
      expect(message.content[0].type).toBe("audio")
      
      const audioBlock = message.content[0] as AudioBlock
      expect(audioBlock.source.type).toBe("base64")
      expect(audioBlock.source.media_type).toBe("audio/wav")
      expect(audioBlock.source.data).toBe(audioData)
      expect(message.id).toMatch(/^msg_/)
      expect(message.timestamp).toBeGreaterThan(0)
    })

    it("应该支持所有音频格式", () => {
      const formats: AudioBlock["source"]["media_type"][] = [
        "audio/wav",
        "audio/mp3",
      ]

      formats.forEach((format) => {
        const message = createAudioMessage("data", format)
        const audioBlock = message.content[0] as AudioBlock
        expect(audioBlock.source.media_type).toBe(format)
      })
    })
  })

  describe("getImages", () => {
    it("应该从消息中提取图片", () => {
      const message: Message = {
        id: "msg_1",
        role: "user",
        content: [
          { type: "text", text: "Check these images:" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "image1",
            },
          },
          {
            type: "image",
            source: {
              type: "url",
              media_type: "image/jpeg",
              data: "https://example.com/image2.jpg",
            },
          },
          {
            type: "audio",
            source: {
              type: "base64",
              media_type: "audio/wav",
              data: "audio1",
            },
          },
        ],
        timestamp: Date.now(),
      }

      const images = getImages(message)

      expect(images).toHaveLength(2)
      expect(images[0].source.data).toBe("image1")
      expect(images[1].source.data).toBe("https://example.com/image2.jpg")
    })

    it("应该返回空数组当消息没有图片时", () => {
      const message: Message = {
        id: "msg_1",
        role: "user",
        content: [
          { type: "text", text: "No images here" },
        ],
        timestamp: Date.now(),
      }

      const images = getImages(message)

      expect(images).toHaveLength(0)
    })
  })

  describe("getAudios", () => {
    it("应该从消息中提取音频", () => {
      const message: Message = {
        id: "msg_1",
        role: "user",
        content: [
          { type: "text", text: "Listen to these:" },
          {
            type: "audio",
            source: {
              type: "base64",
              media_type: "audio/wav",
              data: "audio1",
            },
          },
          {
            type: "audio",
            source: {
              type: "base64",
              media_type: "audio/mp3",
              data: "audio2",
            },
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "image1",
            },
          },
        ],
        timestamp: Date.now(),
      }

      const audios = getAudios(message)

      expect(audios).toHaveLength(2)
      expect(audios[0].source.data).toBe("audio1")
      expect(audios[1].source.data).toBe("audio2")
    })

    it("应该返回空数组当消息没有音频时", () => {
      const message: Message = {
        id: "msg_1",
        role: "user",
        content: [
          { type: "text", text: "No audio here" },
        ],
        timestamp: Date.now(),
      }

      const audios = getAudios(message)

      expect(audios).toHaveLength(0)
    })
  })

  describe("createToolResult 多模态支持", () => {
    it("应该支持字符串内容（向后兼容）", () => {
      const result = createToolResult("tool_1", "Simple text result")

      expect(result.type).toBe("tool_result")
      expect(result.tool_use_id).toBe("tool_1")
      expect(result.content).toBe("Simple text result")
      expect(result.is_error).toBeUndefined()
    })

    it("应该支持 ContentBlock 数组", () => {
      const content = [
        { type: "text" as const, text: "Analysis complete" },
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/png" as const,
            data: "chartdata",
          },
        },
      ]
      
      const result = createToolResult("tool_1", content)

      expect(result.type).toBe("tool_result")
      expect(result.tool_use_id).toBe("tool_1")
      expect(Array.isArray(result.content)).toBe(true)
      expect(result.content).toHaveLength(2)
    })

    it("应该支持错误标记", () => {
      const result = createToolResult("tool_1", "Error occurred", true)

      expect(result.is_error).toBe(true)
    })

    it("应该支持多模态错误结果", () => {
      const content = [
        { type: "text" as const, text: "Error: Failed to process" },
        {
          type: "image" as const,
          source: {
            type: "url" as const,
            media_type: "image/png" as const,
            data: "https://example.com/error-screenshot.png",
          },
        },
      ]
      
      const result = createToolResult("tool_1", content, true)

      expect(result.is_error).toBe(true)
      expect(Array.isArray(result.content)).toBe(true)
    })
  })
})
