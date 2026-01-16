import { describe, it, expect, beforeEach } from "vitest"
import {
  registerBuiltinSkills,
  initSkills,
  listSkills,
  hasSkill,
  clearSkills,
} from "../../src/skill"

describe("Skill Module", () => {
  beforeEach(() => {
    clearSkills()
  })

  describe("registerBuiltinSkills", () => {
    it("should register all builtin skills", () => {
      registerBuiltinSkills()

      expect(hasSkill("commit")).toBe(true)
      expect(hasSkill("pr")).toBe(true)
      expect(hasSkill("review")).toBe(true)
      expect(hasSkill("test")).toBe(true)
    })

    it("should register aliases", () => {
      registerBuiltinSkills()

      expect(hasSkill("ci")).toBe(true)
      expect(hasSkill("cr")).toBe(true)
      expect(hasSkill("t")).toBe(true)
    })

    it("should register 4 skills", () => {
      registerBuiltinSkills()

      expect(listSkills()).toHaveLength(4)
    })
  })

  describe("initSkills", () => {
    it("should initialize skills system", () => {
      initSkills()

      expect(listSkills().length).toBeGreaterThan(0)
    })

    it("should be idempotent", () => {
      initSkills()
      const count1 = listSkills().length

      initSkills()
      const count2 = listSkills().length

      // 重复初始化会覆盖，数量不变
      expect(count2).toBe(count1)
    })
  })

  describe("exports", () => {
    it("should export types", async () => {
      const module = await import("../../src/skill")

      // 检查导出的函数
      expect(module.registerSkill).toBeDefined()
      expect(module.getSkill).toBeDefined()
      expect(module.hasSkill).toBeDefined()
      expect(module.listSkills).toBeDefined()
      expect(module.unregisterSkill).toBeDefined()
      expect(module.clearSkills).toBeDefined()
      expect(module.getSkillCount).toBeDefined()
    })

    it("should export executor functions", async () => {
      const module = await import("../../src/skill")

      expect(module.parseSkillCommand).toBeDefined()
      expect(module.isSkillCommand).toBeDefined()
      expect(module.executeSkill).toBeDefined()
      expect(module.createSkillExecutor).toBeDefined()
    })

    it("should export builtin skills", async () => {
      const module = await import("../../src/skill")

      expect(module.builtinSkills).toBeDefined()
      expect(module.commitSkill).toBeDefined()
      expect(module.prSkill).toBeDefined()
      expect(module.reviewSkill).toBeDefined()
      expect(module.testSkill).toBeDefined()
    })
  })
})
