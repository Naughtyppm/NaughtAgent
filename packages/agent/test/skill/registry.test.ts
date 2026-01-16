import { describe, it, expect, beforeEach } from "vitest"
import {
  registerSkill,
  getSkill,
  hasSkill,
  listSkills,
  unregisterSkill,
  clearSkills,
  getSkillCount,
} from "../../src/skill/registry"
import type { SkillDefinition } from "../../src/skill/types"

describe("Skill Registry", () => {
  beforeEach(() => {
    clearSkills()
  })

  const createTestSkill = (name: string, aliases?: string[]): SkillDefinition => ({
    name,
    description: `Test skill: ${name}`,
    aliases,
    workflow: {
      name: `workflow-${name}`,
      description: `Workflow for ${name}`,
      steps: [{ name: "step1", type: "llm", llm: { prompt: "test" } }],
    },
  })

  describe("registerSkill", () => {
    it("should register a skill", () => {
      const skill = createTestSkill("test")

      registerSkill(skill)

      expect(getSkill("test")).toEqual(skill)
    })

    it("should register skill with aliases", () => {
      const skill = createTestSkill("commit", ["ci", "c"])

      registerSkill(skill)

      expect(getSkill("commit")).toEqual(skill)
      expect(getSkill("ci")).toEqual(skill)
      expect(getSkill("c")).toEqual(skill)
    })

    it("should throw error for skill without name", () => {
      const skill = { description: "test", workflow: { name: "w", description: "d", steps: [] } } as SkillDefinition

      expect(() => registerSkill(skill)).toThrow("name is required")
    })

    it("should throw error for skill without workflow", () => {
      const skill = { name: "test", description: "test" } as SkillDefinition

      expect(() => registerSkill(skill)).toThrow("must have a workflow")
    })

    it("should overwrite existing skill with same name", () => {
      const skill1 = createTestSkill("test")
      const skill2 = { ...createTestSkill("test"), description: "Updated" }

      registerSkill(skill1)
      registerSkill(skill2)

      expect(getSkill("test")?.description).toBe("Updated")
    })
  })

  describe("getSkill", () => {
    it("should return undefined for unknown skill", () => {
      expect(getSkill("unknown")).toBeUndefined()
    })

    it("should get skill by name", () => {
      const skill = createTestSkill("myskill")
      registerSkill(skill)

      expect(getSkill("myskill")).toEqual(skill)
    })

    it("should get skill by alias", () => {
      const skill = createTestSkill("commit", ["ci"])
      registerSkill(skill)

      expect(getSkill("ci")).toEqual(skill)
    })
  })

  describe("hasSkill", () => {
    it("should return false for unknown skill", () => {
      expect(hasSkill("unknown")).toBe(false)
    })

    it("should return true for registered skill", () => {
      registerSkill(createTestSkill("test"))

      expect(hasSkill("test")).toBe(true)
    })

    it("should return true for alias", () => {
      registerSkill(createTestSkill("commit", ["ci"]))

      expect(hasSkill("ci")).toBe(true)
    })
  })

  describe("listSkills", () => {
    it("should return empty array when no skills registered", () => {
      expect(listSkills()).toEqual([])
    })

    it("should return all registered skills", () => {
      registerSkill(createTestSkill("skill1"))
      registerSkill(createTestSkill("skill2"))
      registerSkill(createTestSkill("skill3"))

      const skills = listSkills()

      expect(skills).toHaveLength(3)
      expect(skills.map((s) => s.name)).toContain("skill1")
      expect(skills.map((s) => s.name)).toContain("skill2")
      expect(skills.map((s) => s.name)).toContain("skill3")
    })
  })

  describe("unregisterSkill", () => {
    it("should return false for unknown skill", () => {
      expect(unregisterSkill("unknown")).toBe(false)
    })

    it("should unregister skill", () => {
      registerSkill(createTestSkill("test"))

      const result = unregisterSkill("test")

      expect(result).toBe(true)
      expect(hasSkill("test")).toBe(false)
    })

    it("should remove aliases when unregistering", () => {
      registerSkill(createTestSkill("commit", ["ci", "c"]))

      unregisterSkill("commit")

      expect(hasSkill("commit")).toBe(false)
      expect(hasSkill("ci")).toBe(false)
      expect(hasSkill("c")).toBe(false)
    })
  })

  describe("clearSkills", () => {
    it("should clear all skills", () => {
      registerSkill(createTestSkill("skill1"))
      registerSkill(createTestSkill("skill2", ["s2"]))

      clearSkills()

      expect(listSkills()).toHaveLength(0)
      expect(hasSkill("skill1")).toBe(false)
      expect(hasSkill("s2")).toBe(false)
    })
  })

  describe("getSkillCount", () => {
    it("should return 0 when no skills registered", () => {
      expect(getSkillCount()).toBe(0)
    })

    it("should return correct count", () => {
      registerSkill(createTestSkill("skill1"))
      registerSkill(createTestSkill("skill2"))

      expect(getSkillCount()).toBe(2)
    })
  })
})
