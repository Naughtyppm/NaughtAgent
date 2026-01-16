import { describe, it, expect } from "vitest"
import {
  builtinSkills,
  commitSkill,
  prSkill,
  reviewSkill,
  testSkill,
} from "../../src/skill/builtin"

describe("Builtin Skills", () => {
  describe("builtinSkills", () => {
    it("should export all builtin skills", () => {
      expect(builtinSkills).toHaveLength(4)
      expect(builtinSkills.map((s) => s.name)).toEqual([
        "commit",
        "pr",
        "review",
        "test",
      ])
    })
  })

  describe("commitSkill", () => {
    it("should have correct name and aliases", () => {
      expect(commitSkill.name).toBe("commit")
      expect(commitSkill.aliases).toContain("ci")
    })

    it("should have description", () => {
      expect(commitSkill.description).toBeTruthy()
    })

    it("should have parameters", () => {
      expect(commitSkill.parameters).toBeDefined()
      expect(commitSkill.parameters?.find((p) => p.name === "message")).toBeDefined()
      expect(commitSkill.parameters?.find((p) => p.name === "all")).toBeDefined()
    })

    it("should have workflow with steps", () => {
      expect(commitSkill.workflow).toBeDefined()
      expect(commitSkill.workflow.steps.length).toBeGreaterThan(0)
    })

    it("should have get-diff step", () => {
      const getDiffStep = commitSkill.workflow.steps.find((s) => s.name === "get-diff")
      expect(getDiffStep).toBeDefined()
      expect(getDiffStep?.type).toBe("tool")
    })

    it("should have generate-message step", () => {
      const generateStep = commitSkill.workflow.steps.find((s) => s.name === "generate-message")
      expect(generateStep).toBeDefined()
      expect(generateStep?.type).toBe("llm")
    })

    it("should have confirm step", () => {
      const confirmStep = commitSkill.workflow.steps.find((s) => s.name === "confirm")
      expect(confirmStep).toBeDefined()
      expect(confirmStep?.type).toBe("tool")
    })
  })

  describe("prSkill", () => {
    it("should have correct name and aliases", () => {
      expect(prSkill.name).toBe("pr")
      expect(prSkill.aliases).toContain("pull-request")
    })

    it("should have base parameter with default", () => {
      const baseParam = prSkill.parameters?.find((p) => p.name === "base")
      expect(baseParam).toBeDefined()
      expect(baseParam?.default).toBe("main")
    })

    it("should have workflow with steps", () => {
      expect(prSkill.workflow.steps.length).toBeGreaterThan(0)
    })

    it("should have get-branch step", () => {
      const step = prSkill.workflow.steps.find((s) => s.name === "get-branch")
      expect(step).toBeDefined()
    })

    it("should have get-commits step", () => {
      const step = prSkill.workflow.steps.find((s) => s.name === "get-commits")
      expect(step).toBeDefined()
    })

    it("should have generate-pr step", () => {
      const step = prSkill.workflow.steps.find((s) => s.name === "generate-pr")
      expect(step).toBeDefined()
      expect(step?.type).toBe("llm")
    })
  })

  describe("reviewSkill", () => {
    it("should have correct name and aliases", () => {
      expect(reviewSkill.name).toBe("review")
      expect(reviewSkill.aliases).toContain("cr")
      expect(reviewSkill.aliases).toContain("code-review")
    })

    it("should have files and base parameters", () => {
      expect(reviewSkill.parameters?.find((p) => p.name === "files")).toBeDefined()
      expect(reviewSkill.parameters?.find((p) => p.name === "base")).toBeDefined()
    })

    it("should have workflow with steps", () => {
      expect(reviewSkill.workflow.steps.length).toBeGreaterThan(0)
    })

    it("should have get-code step", () => {
      const step = reviewSkill.workflow.steps.find((s) => s.name === "get-code")
      expect(step).toBeDefined()
    })

    it("should have do-review step", () => {
      const step = reviewSkill.workflow.steps.find((s) => s.name === "do-review")
      expect(step).toBeDefined()
      expect(step?.type).toBe("llm")
    })
  })

  describe("testSkill", () => {
    it("should have correct name and aliases", () => {
      expect(testSkill.name).toBe("test")
      expect(testSkill.aliases).toContain("t")
    })

    it("should have pattern and coverage parameters", () => {
      expect(testSkill.parameters?.find((p) => p.name === "pattern")).toBeDefined()
      expect(testSkill.parameters?.find((p) => p.name === "coverage")).toBeDefined()
    })

    it("should have workflow with steps", () => {
      expect(testSkill.workflow.steps.length).toBeGreaterThan(0)
    })

    it("should have detect-framework step", () => {
      const step = testSkill.workflow.steps.find((s) => s.name === "detect-framework")
      expect(step).toBeDefined()
    })

    it("should have run-tests step", () => {
      const step = testSkill.workflow.steps.find((s) => s.name === "run-tests")
      expect(step).toBeDefined()
      expect(step?.optional).toBe(true) // 测试失败不中断
    })

    it("should have analyze step", () => {
      const step = testSkill.workflow.steps.find((s) => s.name === "analyze")
      expect(step).toBeDefined()
      expect(step?.type).toBe("llm")
    })
  })
})
