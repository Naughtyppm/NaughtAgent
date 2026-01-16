import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  parseSkillCommand,
  isSkillCommand,
  executeSkill,
  createSkillExecutor,
} from "../../src/skill/executor"
import {
  registerSkill,
  clearSkills,
} from "../../src/skill/registry"
import { clearWorkflows } from "../../src/subtask"
import type { SkillDefinition } from "../../src/skill/types"
import type { SkillExecutorRuntime } from "../../src/skill/executor"

describe("Skill Executor", () => {
  beforeEach(() => {
    clearSkills()
    clearWorkflows()
  })

  describe("parseSkillCommand", () => {
    it("should return null for non-skill input", () => {
      expect(parseSkillCommand("hello")).toBeNull()
      expect(parseSkillCommand("")).toBeNull()
      expect(parseSkillCommand("commit")).toBeNull()
    })

    it("should parse simple command", () => {
      const result = parseSkillCommand("/commit")

      expect(result).toEqual({
        name: "commit",
        args: [],
        namedArgs: {},
      })
    })

    it("should parse command with positional args", () => {
      const result = parseSkillCommand("/commit arg1 arg2")

      expect(result).toEqual({
        name: "commit",
        args: ["arg1", "arg2"],
        namedArgs: {},
      })
    })

    it("should parse command with named args (--key=value)", () => {
      const result = parseSkillCommand("/pr --base=main")

      expect(result).toEqual({
        name: "pr",
        args: [],
        namedArgs: { base: "main" },
      })
    })

    it("should parse command with named args (--key value)", () => {
      const result = parseSkillCommand("/pr --base main")

      expect(result).toEqual({
        name: "pr",
        args: [],
        namedArgs: { base: "main" },
      })
    })

    it("should parse command with boolean flag", () => {
      const result = parseSkillCommand("/commit --all")

      expect(result).toEqual({
        name: "commit",
        args: [],
        namedArgs: { all: "true" },
      })
    })

    it("should parse command with mixed args", () => {
      const result = parseSkillCommand("/review file.ts --base=main --verbose")

      expect(result).toEqual({
        name: "review",
        args: ["file.ts"],
        namedArgs: { base: "main", verbose: "true" },
      })
    })

    it("should handle quoted arguments", () => {
      const result = parseSkillCommand('/commit "fix: bug fix"')

      expect(result).toEqual({
        name: "commit",
        args: ["fix: bug fix"],
        namedArgs: {},
      })
    })

    it("should handle single quoted arguments", () => {
      const result = parseSkillCommand("/commit 'fix: bug fix'")

      expect(result).toEqual({
        name: "commit",
        args: ["fix: bug fix"],
        namedArgs: {},
      })
    })

    it("should handle command with hyphen in name", () => {
      const result = parseSkillCommand("/code-review")

      expect(result).toEqual({
        name: "code-review",
        args: [],
        namedArgs: {},
      })
    })

    it("should return null for invalid command format", () => {
      expect(parseSkillCommand("/ commit")).toBeNull()
      expect(parseSkillCommand("/-test")).toBeNull()
      expect(parseSkillCommand("/")).toBeNull()
    })
  })

  describe("isSkillCommand", () => {
    it("should return false for non-skill input", () => {
      expect(isSkillCommand("hello")).toBe(false)
      expect(isSkillCommand("/unknown")).toBe(false)
    })

    it("should return true for registered skill", () => {
      registerSkill({
        name: "commit",
        description: "Commit",
        workflow: { name: "commit", description: "Commit", steps: [] },
      })

      expect(isSkillCommand("/commit")).toBe(true)
    })

    it("should return true for alias", () => {
      registerSkill({
        name: "commit",
        description: "Commit",
        aliases: ["ci"],
        workflow: { name: "commit", description: "Commit", steps: [] },
      })

      expect(isSkillCommand("/ci")).toBe(true)
    })
  })

  describe("executeSkill", () => {
    let mockRuntime: SkillExecutorRuntime

    beforeEach(() => {
      mockRuntime = {
        provider: {
          chat: vi.fn().mockResolvedValue({
            content: "LLM response",
            usage: { inputTokens: 10, outputTokens: 20 },
          }),
          chatWithSchema: vi.fn().mockResolvedValue({
            data: {},
            usage: { inputTokens: 10, outputTokens: 20 },
          }),
        },
        toolExecutor: {
          execute: vi.fn().mockResolvedValue({
            output: "tool output",
          }),
        },
      }
    })

    it("should return error for unknown skill", async () => {
      const result = await executeSkill("unknown", [], { cwd: "/tmp" }, mockRuntime)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Unknown skill")
    })

    it("should return error without runtime", async () => {
      registerSkill({
        name: "test",
        description: "Test",
        workflow: { name: "test", description: "Test", steps: [] },
      })

      const result = await executeSkill("test", [], { cwd: "/tmp" })

      expect(result.success).toBe(false)
      expect(result.error).toContain("runtime not configured")
    })

    it("should execute skill by name", async () => {
      registerSkill({
        name: "simple",
        description: "Simple skill",
        workflow: {
          name: "simple",
          description: "Simple",
          steps: [
            { name: "step1", type: "llm", llm: { prompt: "test" } },
          ],
        },
      })

      const result = await executeSkill("simple", [], { cwd: "/tmp" }, mockRuntime)

      expect(result.success).toBe(true)
      expect(result.output).toBe("LLM response")
    })

    it("should execute skill from command string", async () => {
      registerSkill({
        name: "test",
        description: "Test",
        workflow: {
          name: "test",
          description: "Test",
          steps: [
            { name: "step1", type: "llm", llm: { prompt: "test" } },
          ],
        },
      })

      const result = await executeSkill("/test", [], { cwd: "/tmp" }, mockRuntime)

      expect(result.success).toBe(true)
    })

    it("should return error for invalid command", async () => {
      const result = await executeSkill("/ invalid", [], { cwd: "/tmp" }, mockRuntime)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid skill command")
    })

    it("should pass parameters to workflow", async () => {
      registerSkill({
        name: "paramtest",
        description: "Param test",
        parameters: [
          { name: "message", description: "Message" },
        ],
        workflow: {
          name: "paramtest",
          description: "Param test",
          steps: [
            {
              name: "echo",
              type: "tool",
              tool: {
                name: "bash",
                params: (ctx) => ({ command: `echo ${ctx.params.message}` }),
              },
            },
          ],
        },
      })

      await executeSkill("/paramtest hello", [], { cwd: "/tmp" }, mockRuntime)

      expect(mockRuntime.toolExecutor.execute).toHaveBeenCalledWith(
        "bash",
        { command: "echo hello" },
        expect.any(Object)
      )
    })

    it("should apply default parameter values", async () => {
      registerSkill({
        name: "defaulttest",
        description: "Default test",
        parameters: [
          { name: "base", description: "Base", default: "main" },
        ],
        workflow: {
          name: "defaulttest",
          description: "Default test",
          steps: [
            {
              name: "echo",
              type: "tool",
              tool: {
                name: "bash",
                params: (ctx) => ({ command: `echo ${ctx.params.base}` }),
              },
            },
          ],
        },
      })

      await executeSkill("/defaulttest", [], { cwd: "/tmp" }, mockRuntime)

      expect(mockRuntime.toolExecutor.execute).toHaveBeenCalledWith(
        "bash",
        { command: "echo main" },
        expect.any(Object)
      )
    })

    it("should override default with named arg", async () => {
      registerSkill({
        name: "overridetest",
        description: "Override test",
        parameters: [
          { name: "base", description: "Base", default: "main" },
        ],
        workflow: {
          name: "overridetest",
          description: "Override test",
          steps: [
            {
              name: "echo",
              type: "tool",
              tool: {
                name: "bash",
                params: (ctx) => ({ command: `echo ${ctx.params.base}` }),
              },
            },
          ],
        },
      })

      await executeSkill("/overridetest --base=develop", [], { cwd: "/tmp" }, mockRuntime)

      expect(mockRuntime.toolExecutor.execute).toHaveBeenCalledWith(
        "bash",
        { command: "echo develop" },
        expect.any(Object)
      )
    })
  })

  describe("createSkillExecutor", () => {
    let mockRuntime: SkillExecutorRuntime

    beforeEach(() => {
      mockRuntime = {
        provider: {
          chat: vi.fn().mockResolvedValue({
            content: "response",
            usage: { inputTokens: 10, outputTokens: 20 },
          }),
          chatWithSchema: vi.fn().mockResolvedValue({
            data: {},
            usage: { inputTokens: 10, outputTokens: 20 },
          }),
        },
        toolExecutor: {
          execute: vi.fn().mockResolvedValue({ output: "output" }),
        },
      }
    })

    it("should create executor with bound runtime", async () => {
      registerSkill({
        name: "test",
        description: "Test",
        workflow: {
          name: "test",
          description: "Test",
          steps: [{ name: "s", type: "llm", llm: { prompt: "test" } }],
        },
      })

      const executor = createSkillExecutor(mockRuntime)
      const result = await executor.execute("test")

      expect(result.success).toBe(true)
    })

    it("should expose parse method", () => {
      const executor = createSkillExecutor(mockRuntime)

      expect(executor.parse("/commit --all")).toEqual({
        name: "commit",
        args: [],
        namedArgs: { all: "true" },
      })
    })

    it("should expose isSkillCommand method", () => {
      registerSkill({
        name: "test",
        description: "Test",
        workflow: { name: "test", description: "Test", steps: [] },
      })

      const executor = createSkillExecutor(mockRuntime)

      expect(executor.isSkillCommand("/test")).toBe(true)
      expect(executor.isSkillCommand("/unknown")).toBe(false)
    })
  })
})
