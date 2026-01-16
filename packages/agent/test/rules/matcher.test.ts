/**
 * Matcher 测试
 */

import { describe, it, expect } from "vitest"
import {
  matchGlob,
  matchTrigger,
  matchRule,
  matchRules,
  getAlwaysLoadRules,
  extractFilePaths,
  buildMatchContext,
} from "../../src/rules/matcher"
import type { RuleMeta, RulesIndex, MatchContext } from "../../src/rules/types"

describe("matchGlob", () => {
  it("should match exact file names", () => {
    expect(matchGlob("index.ts", "index.ts")).toBe(true)
    expect(matchGlob("index.ts", "main.ts")).toBe(false)
  })

  it("should match with * wildcard", () => {
    expect(matchGlob("*.ts", "index.ts")).toBe(true)
    expect(matchGlob("*.ts", "main.ts")).toBe(true)
    expect(matchGlob("*.ts", "index.js")).toBe(false)
    expect(matchGlob("*.ts", "src/index.ts")).toBe(false)
  })

  it("should match with ** wildcard", () => {
    expect(matchGlob("**/*.ts", "index.ts")).toBe(true)
    expect(matchGlob("**/*.ts", "src/index.ts")).toBe(true)
    expect(matchGlob("**/*.ts", "src/utils/helper.ts")).toBe(true)
    expect(matchGlob("**/*.ts", "src/index.js")).toBe(false)
  })

  it("should match directory patterns", () => {
    expect(matchGlob("src/**/*.ts", "src/index.ts")).toBe(true)
    expect(matchGlob("src/**/*.ts", "src/utils/helper.ts")).toBe(true)
    expect(matchGlob("src/**/*.ts", "lib/index.ts")).toBe(false)
  })

  it("should normalize path separators", () => {
    expect(matchGlob("src/**/*.ts", "src\\utils\\helper.ts")).toBe(true)
    expect(matchGlob("src\\**\\*.ts", "src/utils/helper.ts")).toBe(true)
  })
})

describe("matchTrigger", () => {
  describe("glob trigger", () => {
    it("should match files", () => {
      const trigger = { type: "glob" as const, pattern: "*.ts" }
      expect(matchTrigger(trigger, { files: ["index.ts"] })).toBe(true)
      expect(matchTrigger(trigger, { files: ["index.js"] })).toBe(false)
      expect(matchTrigger(trigger, { files: [] })).toBe(false)
      expect(matchTrigger(trigger, {})).toBe(false)
    })

    it("should match any file in list", () => {
      const trigger = { type: "glob" as const, pattern: "*.ts" }
      expect(matchTrigger(trigger, { files: ["index.js", "main.ts"] })).toBe(true)
    })
  })

  describe("command trigger", () => {
    it("should match exact command", () => {
      const trigger = { type: "command" as const, pattern: "/commit" }
      expect(matchTrigger(trigger, { command: "/commit" })).toBe(true)
      expect(matchTrigger(trigger, { command: "/pr" })).toBe(false)
      expect(matchTrigger(trigger, {})).toBe(false)
    })

    it("should match wildcard command", () => {
      const trigger = { type: "command" as const, pattern: "git *" }
      expect(matchTrigger(trigger, { command: "git" })).toBe(true)
      expect(matchTrigger(trigger, { command: "git commit" })).toBe(true)
      expect(matchTrigger(trigger, { command: "git push origin main" })).toBe(true)
      expect(matchTrigger(trigger, { command: "npm install" })).toBe(false)
    })
  })

  describe("keyword trigger", () => {
    it("should match keywords in input", () => {
      const trigger = { type: "keyword" as const, words: ["test", "测试"] }
      expect(matchTrigger(trigger, { input: "run the test" })).toBe(true)
      expect(matchTrigger(trigger, { input: "运行测试" })).toBe(true)
      expect(matchTrigger(trigger, { input: "build the project" })).toBe(false)
      expect(matchTrigger(trigger, {})).toBe(false)
    })

    it("should be case insensitive", () => {
      const trigger = { type: "keyword" as const, words: ["Test"] }
      expect(matchTrigger(trigger, { input: "run the TEST" })).toBe(true)
      expect(matchTrigger(trigger, { input: "run the test" })).toBe(true)
    })
  })

  describe("tool trigger", () => {
    it("should match tool names", () => {
      const trigger = { type: "tool" as const, names: ["bash", "read"] }
      expect(matchTrigger(trigger, { tools: ["bash"] })).toBe(true)
      expect(matchTrigger(trigger, { tools: ["read"] })).toBe(true)
      expect(matchTrigger(trigger, { tools: ["write"] })).toBe(false)
      expect(matchTrigger(trigger, { tools: [] })).toBe(false)
      expect(matchTrigger(trigger, {})).toBe(false)
    })
  })
})

describe("matchRule", () => {
  it("should match alwaysLoad rules", () => {
    const rule: RuleMeta = {
      id: "security",
      file: "security.md",
      description: "Security rules",
      triggers: [],
      alwaysLoad: true,
    }
    expect(matchRule(rule, {})).toBe(true)
  })

  it("should not match rules without triggers", () => {
    const rule: RuleMeta = {
      id: "misc",
      file: "misc.md",
      description: "Misc rules",
      triggers: [],
    }
    expect(matchRule(rule, { input: "anything" })).toBe(false)
  })

  it("should match if any trigger matches", () => {
    const rule: RuleMeta = {
      id: "typescript",
      file: "typescript.md",
      description: "TypeScript rules",
      triggers: [
        { type: "glob", pattern: "*.ts" },
        { type: "keyword", words: ["typescript"] },
      ],
    }
    expect(matchRule(rule, { files: ["index.ts"] })).toBe(true)
    expect(matchRule(rule, { input: "use typescript" })).toBe(true)
    expect(matchRule(rule, { files: ["index.js"] })).toBe(false)
  })
})

describe("matchRules", () => {
  const index: RulesIndex = {
    version: 1,
    rules: [
      {
        id: "security",
        file: "security.md",
        description: "Security",
        triggers: [],
        priority: 100,
        alwaysLoad: true,
      },
      {
        id: "typescript",
        file: "typescript.md",
        description: "TypeScript",
        triggers: [{ type: "glob", pattern: "*.ts" }],
        priority: 10,
      },
      {
        id: "testing",
        file: "testing.md",
        description: "Testing",
        triggers: [{ type: "keyword", words: ["test"] }],
        priority: 5,
      },
      {
        id: "misc",
        file: "misc.md",
        description: "Misc",
        triggers: [],
      },
    ],
  }

  it("should return matched rules sorted by priority", () => {
    const context: MatchContext = { files: ["index.ts"], input: "run test" }
    const matched = matchRules(index, context)

    expect(matched.length).toBe(3)
    expect(matched[0].id).toBe("security") // priority 100
    expect(matched[1].id).toBe("typescript") // priority 10
    expect(matched[2].id).toBe("testing") // priority 5
  })

  it("should respect maxRules limit", () => {
    const context: MatchContext = { files: ["index.ts"], input: "run test" }
    const matched = matchRules(index, context, 2)

    expect(matched.length).toBe(2)
    expect(matched[0].id).toBe("security")
    expect(matched[1].id).toBe("typescript")
  })

  it("should return empty array when no matches", () => {
    const context: MatchContext = { files: ["index.py"] }
    const matched = matchRules(index, context)

    // Only alwaysLoad rule matches
    expect(matched.length).toBe(1)
    expect(matched[0].id).toBe("security")
  })
})

describe("getAlwaysLoadRules", () => {
  it("should return only alwaysLoad rules", () => {
    const index: RulesIndex = {
      version: 1,
      rules: [
        { id: "a", file: "a.md", description: "", triggers: [], alwaysLoad: true, priority: 10 },
        { id: "b", file: "b.md", description: "", triggers: [], alwaysLoad: false },
        { id: "c", file: "c.md", description: "", triggers: [], alwaysLoad: true, priority: 20 },
      ],
    }

    const always = getAlwaysLoadRules(index)
    expect(always.length).toBe(2)
    expect(always[0].id).toBe("c") // higher priority first
    expect(always[1].id).toBe("a")
  })
})

describe("extractFilePaths", () => {
  it("should extract relative paths", () => {
    const paths = extractFilePaths("修改 ./src/index.ts 文件")
    expect(paths).toContain("./src/index.ts")
  })

  it("should extract simple paths", () => {
    const paths = extractFilePaths("看看 src/utils/helper.ts")
    expect(paths).toContain("src/utils/helper.ts")
  })

  it("should extract multiple paths", () => {
    const paths = extractFilePaths("比较 src/a.ts 和 src/b.ts")
    expect(paths).toContain("src/a.ts")
    expect(paths).toContain("src/b.ts")
  })

  it("should extract single file names", () => {
    const paths = extractFilePaths("读取 package.json")
    expect(paths).toContain("package.json")
  })

  it("should return empty array for no paths", () => {
    const paths = extractFilePaths("帮我写个函数")
    expect(paths).toEqual([])
  })
})

describe("buildMatchContext", () => {
  it("should build context from input", () => {
    const ctx = buildMatchContext("修改 src/index.ts")
    expect(ctx.input).toBe("修改 src/index.ts")
    expect(ctx.files).toContain("src/index.ts")
  })

  it("should include command and tools", () => {
    const ctx = buildMatchContext("test", { command: "/commit", tools: ["bash"] })
    expect(ctx.command).toBe("/commit")
    expect(ctx.tools).toEqual(["bash"])
  })

  it("should merge additional files", () => {
    const ctx = buildMatchContext("test", { additionalFiles: ["extra.ts"] })
    expect(ctx.files).toContain("extra.ts")
  })
})
