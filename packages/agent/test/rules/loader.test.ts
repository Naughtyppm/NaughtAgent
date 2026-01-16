/**
 * Loader 测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  loadRulesIndex,
  generateDefaultIndex,
  loadRule,
  loadRules,
  loadAlwaysRules,
  loadMatchedRules,
  RulesLoader,
  buildRulesPrompt,
} from "../../src/rules/loader"
import type { RuleMeta, LoadedRule } from "../../src/rules/types"

describe("Loader", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rules-test-"))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe("generateDefaultIndex", () => {
    it("should generate index from .md files", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "typescript.md"), "# TypeScript Rules")
      await fs.writeFile(path.join(rulesDir, "testing.md"), "# Testing Rules")
      await fs.writeFile(path.join(rulesDir, "readme.txt"), "Not a rule")

      const index = await generateDefaultIndex(rulesDir)

      expect(index.version).toBe(1)
      expect(index.rules.length).toBe(2)
      expect(index.rules.map((r) => r.id).sort()).toEqual(["testing", "typescript"])
    })

    it("should return empty index for non-existent directory", async () => {
      const index = await generateDefaultIndex(path.join(tempDir, "nonexistent"))
      expect(index.rules).toEqual([])
    })
  })

  describe("loadRulesIndex", () => {
    it("should load YAML index", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })

      const yamlContent = `version: 1
rules:
  - id: typescript
    file: typescript.md
    description: TypeScript rules
    triggers:
      - type: glob
        pattern: "*.ts"
  - id: security
    file: security.md
    description: Security rules
    priority: 100
    alwaysLoad: true
    triggers: []
`
      await fs.writeFile(path.join(rulesDir, "index.yaml"), yamlContent)

      const index = await loadRulesIndex(tempDir)

      expect(index.version).toBe(1)
      expect(index.rules.length).toBe(2)

      const tsRule = index.rules.find((r) => r.id === "typescript")
      expect(tsRule).toBeDefined()
      expect(tsRule!.file).toBe("typescript.md")
      expect(tsRule!.triggers.length).toBe(1)
      expect(tsRule!.triggers[0].type).toBe("glob")

      const secRule = index.rules.find((r) => r.id === "security")
      expect(secRule).toBeDefined()
      expect(secRule!.priority).toBe(100)
      expect(secRule!.alwaysLoad).toBe(true)
    })

    it("should load JSON index", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })

      const jsonContent = {
        version: 1,
        rules: [
          {
            id: "test",
            file: "test.md",
            description: "Test rules",
            triggers: [{ type: "keyword", words: ["test"] }],
          },
        ],
      }
      await fs.writeFile(path.join(rulesDir, "index.json"), JSON.stringify(jsonContent))

      const index = await loadRulesIndex(tempDir)

      expect(index.rules.length).toBe(1)
      expect(index.rules[0].id).toBe("test")
    })

    it("should fallback to auto-generated index", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "custom.md"), "# Custom")

      const index = await loadRulesIndex(tempDir)

      expect(index.rules.length).toBe(1)
      expect(index.rules[0].id).toBe("custom")
    })
  })

  describe("loadRule", () => {
    it("should load rule content", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "test.md"), "# Test Rules\n\nSome content")

      const meta: RuleMeta = {
        id: "test",
        file: "test.md",
        description: "Test",
        triggers: [],
      }

      const rule = await loadRule(tempDir, meta)

      expect(rule.meta).toBe(meta)
      expect(rule.content).toBe("# Test Rules\n\nSome content")
    })

    it("should throw for non-existent file", async () => {
      const meta: RuleMeta = {
        id: "missing",
        file: "missing.md",
        description: "Missing",
        triggers: [],
      }

      await expect(loadRule(tempDir, meta)).rejects.toThrow()
    })
  })

  describe("loadRules", () => {
    it("should load multiple rules", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "a.md"), "Rule A")
      await fs.writeFile(path.join(rulesDir, "b.md"), "Rule B")

      const metas: RuleMeta[] = [
        { id: "a", file: "a.md", description: "A", triggers: [] },
        { id: "b", file: "b.md", description: "B", triggers: [] },
      ]

      const rules = await loadRules(tempDir, metas)

      expect(rules.length).toBe(2)
      expect(rules[0].content).toBe("Rule A")
      expect(rules[1].content).toBe("Rule B")
    })

    it("should skip missing files", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "exists.md"), "Exists")

      const metas: RuleMeta[] = [
        { id: "exists", file: "exists.md", description: "Exists", triggers: [] },
        { id: "missing", file: "missing.md", description: "Missing", triggers: [] },
      ]

      const rules = await loadRules(tempDir, metas)

      expect(rules.length).toBe(1)
      expect(rules[0].meta.id).toBe("exists")
    })
  })

  describe("loadAlwaysRules", () => {
    it("should load only alwaysLoad rules", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })

      await fs.writeFile(path.join(rulesDir, "security.md"), "Security content")
      await fs.writeFile(path.join(rulesDir, "optional.md"), "Optional content")

      const yamlContent = `version: 1
rules:
  - id: security
    file: security.md
    description: Security
    alwaysLoad: true
    triggers: []
  - id: optional
    file: optional.md
    description: Optional
    triggers:
      - type: keyword
        words: ["optional"]
`
      await fs.writeFile(path.join(rulesDir, "index.yaml"), yamlContent)

      const rules = await loadAlwaysRules(tempDir)

      expect(rules.length).toBe(1)
      expect(rules[0].meta.id).toBe("security")
    })
  })

  describe("loadMatchedRules", () => {
    it("should load rules matching context", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })

      await fs.writeFile(path.join(rulesDir, "typescript.md"), "TS rules")
      await fs.writeFile(path.join(rulesDir, "python.md"), "Python rules")

      const yamlContent = `version: 1
rules:
  - id: typescript
    file: typescript.md
    description: TypeScript
    triggers:
      - type: glob
        pattern: "*.ts"
  - id: python
    file: python.md
    description: Python
    triggers:
      - type: glob
        pattern: "*.py"
`
      await fs.writeFile(path.join(rulesDir, "index.yaml"), yamlContent)

      const rules = await loadMatchedRules(tempDir, { files: ["index.ts"] })

      expect(rules.length).toBe(1)
      expect(rules[0].meta.id).toBe("typescript")
    })
  })

  describe("RulesLoader class", () => {
    it("should cache index", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "test.md"), "Test")

      const loader = new RulesLoader({ cacheTimeout: 60000 })

      const index1 = await loader.loadIndex(tempDir)
      const index2 = await loader.loadIndex(tempDir)

      expect(index1).toBe(index2) // Same reference (cached)
    })

    it("should clear cache", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "test.md"), "Test")

      const loader = new RulesLoader()

      const index1 = await loader.loadIndex(tempDir)
      loader.clearCache(tempDir)
      const index2 = await loader.loadIndex(tempDir)

      expect(index1).not.toBe(index2) // Different reference
    })

    it("should load relevant rules with deduplication", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })

      await fs.writeFile(path.join(rulesDir, "security.md"), "Security")
      await fs.writeFile(path.join(rulesDir, "typescript.md"), "TypeScript")

      const yamlContent = `version: 1
rules:
  - id: security
    file: security.md
    description: Security
    priority: 100
    alwaysLoad: true
    triggers:
      - type: glob
        pattern: "*.ts"
  - id: typescript
    file: typescript.md
    description: TypeScript
    triggers:
      - type: glob
        pattern: "*.ts"
`
      await fs.writeFile(path.join(rulesDir, "index.yaml"), yamlContent)

      const loader = new RulesLoader()
      const rules = await loader.loadRelevantRules(tempDir, { files: ["index.ts"] })

      // security matches both alwaysLoad and glob, but should appear only once
      expect(rules.length).toBe(2)
      const ids = rules.map((r) => r.meta.id)
      expect(ids).toContain("security")
      expect(ids).toContain("typescript")
    })
  })

  describe("buildRulesPrompt", () => {
    it("should build prompt from rules", () => {
      const rules: LoadedRule[] = [
        {
          meta: { id: "test", file: "test.md", description: "Test rules", triggers: [] },
          content: "# Test\n\nDo this and that.",
        },
      ]

      const prompt = buildRulesPrompt(rules)

      expect(prompt).toContain("# Project Rules")
      expect(prompt).toContain("## test")
      expect(prompt).toContain("> Test rules")
      expect(prompt).toContain("# Test")
      expect(prompt).toContain("Do this and that.")
    })

    it("should return empty string for no rules", () => {
      const prompt = buildRulesPrompt([])
      expect(prompt).toBe("")
    })
  })
})
