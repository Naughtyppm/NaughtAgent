import { describe, it, expect, vi, beforeEach } from "vitest"
import { Writable } from "stream"
import {
  createStreamOutput,
  stripAnsi,
  getDisplayWidth,
  truncateToWidth,
} from "../../src/ux/output"

describe("StreamOutput", () => {
  let output: string[]
  let mockStream: Writable

  beforeEach(() => {
    output = []
    mockStream = new Writable({
      write(chunk, _encoding, callback) {
        output.push(chunk.toString())
        callback()
      },
    })
  })

  describe("createStreamOutput", () => {
    it("should create output with default config", () => {
      const streamOutput = createStreamOutput()
      expect(streamOutput).toBeDefined()
      expect(streamOutput.write).toBeDefined()
      expect(streamOutput.writeLine).toBeDefined()
    })

    it("should write to custom stream", () => {
      const streamOutput = createStreamOutput({ stream: mockStream })

      streamOutput.write("hello")

      expect(output.join("")).toBe("hello")
    })

    it("should write line with newline", () => {
      const streamOutput = createStreamOutput({ stream: mockStream })

      streamOutput.writeLine("hello")

      expect(output.join("")).toBe("hello\n")
    })
  })

  describe("write with style", () => {
    it("should apply color", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: true,
      })

      streamOutput.write("text", { color: "red" })

      const result = output.join("")
      expect(result).toContain("\x1b[31m") // red
      expect(result).toContain("text")
      expect(result).toContain("\x1b[0m") // reset
    })

    it("should apply bold", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: true,
      })

      streamOutput.write("text", { bold: true })

      const result = output.join("")
      expect(result).toContain("\x1b[1m") // bold
    })

    it("should apply dim", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: true,
      })

      streamOutput.write("text", { dim: true })

      const result = output.join("")
      expect(result).toContain("\x1b[2m") // dim
    })

    it("should not apply style when colors disabled", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      streamOutput.write("text", { color: "red", bold: true })

      const result = output.join("")
      expect(result).toBe("text")
      expect(result).not.toContain("\x1b[")
    })
  })

  describe("writeToolStart", () => {
    it("should write tool start with name", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      streamOutput.writeToolStart("read", { filePath: "/test/file.txt" })

      const result = output.join("")
      expect(result).toContain("read")
      expect(result).toContain("/test/file.txt")
    })

    it("should format bash command", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      streamOutput.writeToolStart("bash", { command: "npm test" })

      const result = output.join("")
      expect(result).toContain("bash")
      expect(result).toContain("npm test")
    })

    it("should truncate long commands", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      const longCommand = "a".repeat(100)
      streamOutput.writeToolStart("bash", { command: longCommand })

      const result = output.join("")
      expect(result).toContain("...")
    })
  })

  describe("writeToolEnd", () => {
    it("should write success indicator", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      streamOutput.writeToolEnd("read", "File content here")

      const result = output.join("")
      expect(result).toContain("✓")
      expect(result).toContain("File content here")
    })

    it("should write error indicator", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      streamOutput.writeToolEnd("read", "Error message", true)

      const result = output.join("")
      expect(result).toContain("✗")
    })

    it("should truncate long output", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      const longOutput = Array(20).fill("line").join("\n")
      streamOutput.writeToolEnd("read", longOutput)

      const result = output.join("")
      expect(result).toContain("more lines")
    })
  })

  describe("writePermissionRequest", () => {
    it("should write permission request", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      streamOutput.writePermissionRequest("write", "/test/file.txt")

      const result = output.join("")
      expect(result).toContain("Permission Required")
      expect(result).toContain("write")
      expect(result).toContain("/test/file.txt")
      expect(result).toContain("[y/N]")
    })

    it("should include preview if provided", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      const preview = "--- a/file.txt\n+++ b/file.txt\n-old\n+new"
      streamOutput.writePermissionRequest("edit", "/test/file.txt", preview)

      const result = output.join("")
      expect(result).toContain("-old")
      expect(result).toContain("+new")
    })
  })

  describe("writeSeparator", () => {
    it("should write separator line", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      streamOutput.writeSeparator()

      const result = output.join("")
      expect(result).toContain("─")
    })
  })

  describe("writeNewLine", () => {
    it("should write empty line", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
      })

      streamOutput.writeNewLine()

      expect(output.join("")).toBe("\n")
    })
  })

  describe("writeDiff", () => {
    it("should write diff with indentation", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
        useColors: false,
      })

      streamOutput.writeDiff("-old\n+new")

      const result = output.join("")
      expect(result).toContain("│")
      expect(result).toContain("-old")
      expect(result).toContain("+new")
    })
  })

  describe("clearLine", () => {
    it("should write clear line sequence", () => {
      const streamOutput = createStreamOutput({
        stream: mockStream,
      })

      streamOutput.clearLine()

      const result = output.join("")
      expect(result).toContain("\r")
      expect(result).toContain("\x1b[2K")
    })
  })
})

describe("Utility Functions", () => {
  describe("stripAnsi", () => {
    it("should remove ANSI codes", () => {
      const input = "\x1b[31mred\x1b[0m text"
      const result = stripAnsi(input)

      expect(result).toBe("red text")
    })

    it("should handle string without ANSI codes", () => {
      const input = "plain text"
      const result = stripAnsi(input)

      expect(result).toBe("plain text")
    })

    it("should handle multiple ANSI codes", () => {
      const input = "\x1b[1m\x1b[31mbold red\x1b[0m"
      const result = stripAnsi(input)

      expect(result).toBe("bold red")
    })
  })

  describe("getDisplayWidth", () => {
    it("should return correct width for ASCII", () => {
      expect(getDisplayWidth("hello")).toBe(5)
    })

    it("should return correct width for CJK characters", () => {
      expect(getDisplayWidth("你好")).toBe(4) // 2 chars * 2 width
    })

    it("should handle mixed content", () => {
      expect(getDisplayWidth("hi你好")).toBe(6) // 2 + 4
    })

    it("should ignore ANSI codes", () => {
      expect(getDisplayWidth("\x1b[31mhello\x1b[0m")).toBe(5)
    })
  })

  describe("truncateToWidth", () => {
    it("should not truncate short strings", () => {
      expect(truncateToWidth("hello", 10)).toBe("hello")
    })

    it("should truncate long strings", () => {
      const result = truncateToWidth("hello world", 8)
      expect(result).toBe("hello...")
    })

    it("should handle CJK characters", () => {
      const result = truncateToWidth("你好世界", 6)
      expect(result.endsWith("...")).toBe(true)
    })
  })
})
