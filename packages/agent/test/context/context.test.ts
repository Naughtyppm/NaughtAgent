import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import {
  loadRules,
  mergeRulesToPrompt,
  loadProjectStructure,
  loadGitContext,
  loadConfig,
  loadContext,
  buildContextPrompt,
} from "../../src/context"
import { createTempDir, cleanupTempDir } from "../helpers/context"

describe("Context", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  describe("loadRules", () => {
    it("should return empty rules when .naught/rules does not exist", async () => {
      const rules = await loadRules(tempDir)

      expect(rules.project).toEqual([])
      expect(rules.user).toEqual([])
    })

    it("should load project rules from .naught/rules/", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "project.md"), "# Project Rules\n\nBe nice.")
      await fs.writeFile(path.join(rulesDir, "style.md"), "# Style\n\nUse 2 spaces.")

      const rules = await loadRules(tempDir)

      expect(rules.project).toHaveLength(2)
      expect(rules.project.find((r) => r.name === "project")?.content).toContain("Be nice")
      expect(rules.project.find((r) => r.name === "style")?.content).toContain("2 spaces")
    })

    it("should only load .md files", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "rules.md"), "# Rules")
      await fs.writeFile(path.join(rulesDir, "notes.txt"), "Not a rule")
      await fs.writeFile(path.join(rulesDir, "config.json"), "{}")

      const rules = await loadRules(tempDir)

      expect(rules.project).toHaveLength(1)
      expect(rules.project[0].name).toBe("rules")
    })
  })

  describe("mergeRulesToPrompt", () => {
    it("should return empty string for no rules", () => {
      const prompt = mergeRulesToPrompt({ project: [], user: [] })

      expect(prompt).toBe("")
    })

    it("should merge project rules", () => {
      const rules = {
        project: [
          { name: "project", path: "/p/project.md", content: "Project content" },
        ],
        user: [],
      }

      const prompt = mergeRulesToPrompt(rules)

      expect(prompt).toContain("## Project Rules")
      expect(prompt).toContain("### project")
      expect(prompt).toContain("Project content")
    })

    it("should merge both user and project rules", () => {
      const rules = {
        project: [{ name: "project", path: "/p.md", content: "Project rule" }],
        user: [{ name: "global", path: "/g.md", content: "Global rule" }],
      }

      const prompt = mergeRulesToPrompt(rules)

      expect(prompt).toContain("## User Rules")
      expect(prompt).toContain("Global rule")
      expect(prompt).toContain("## Project Rules")
      expect(prompt).toContain("Project rule")
    })
  })

  describe("loadProjectStructure", () => {
    it("should generate directory tree", async () => {
      await fs.mkdir(path.join(tempDir, "src"))
      await fs.writeFile(path.join(tempDir, "src", "index.ts"), "")
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.root).toBe(tempDir)
      expect(structure.tree).toContain("src/")
      expect(structure.tree).toContain("index.ts")
      expect(structure.tree).toContain("package.json")
    })

    it("should exclude node_modules", async () => {
      await fs.mkdir(path.join(tempDir, "node_modules", "some-pkg"), { recursive: true })
      await fs.mkdir(path.join(tempDir, "src"))
      await fs.writeFile(path.join(tempDir, "src", "index.ts"), "")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.tree).not.toContain("node_modules")
      expect(structure.tree).toContain("src/")
    })

    it("should respect maxDepth", async () => {
      await fs.mkdir(path.join(tempDir, "a", "b", "c", "d"), { recursive: true })
      await fs.writeFile(path.join(tempDir, "a", "b", "c", "d", "deep.txt"), "")

      const structure = await loadProjectStructure(tempDir, { maxDepth: 2 })

      expect(structure.tree).toContain("a/")
      expect(structure.tree).toContain("b/")
      // c might be shown but d should not be expanded
    })

    it("should detect key files", async () => {
      await fs.writeFile(path.join(tempDir, "README.md"), "# Readme")
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.keyFiles).toContain("README.md")
      expect(structure.keyFiles).toContain("package.json")
    })
  })

  describe("detectTechStack", () => {
    it("should detect TypeScript from package.json", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          devDependencies: { typescript: "^5.0.0" },
        })
      )

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.languages).toContain("TypeScript")
    })

    it("should detect React framework", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          dependencies: { react: "^18.0.0" },
        })
      )

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.frameworks).toContain("React")
    })

    it("should detect pnpm package manager", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")
      await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.packageManager).toBe("pnpm")
    })

    it("should detect Vitest test framework", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          devDependencies: { vitest: "^1.0.0" },
        })
      )

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.testFramework).toBe("Vitest")
    })

    it("should detect Rust from Cargo.toml", async () => {
      await fs.writeFile(path.join(tempDir, "Cargo.toml"), "[package]")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.languages).toContain("Rust")
    })

    it("should detect Go from go.mod", async () => {
      await fs.writeFile(path.join(tempDir, "go.mod"), "module example")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.languages).toContain("Go")
    })

    it("should detect Python from pyproject.toml", async () => {
      await fs.writeFile(path.join(tempDir, "pyproject.toml"), "[project]")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.languages).toContain("Python")
    })
  })

  describe("loadGitContext", () => {
    it("should return isRepo: false for non-git directory", async () => {
      const git = await loadGitContext(tempDir)

      expect(git.isRepo).toBe(false)
      expect(git.branch).toBeUndefined()
    })

    // Note: Testing actual git operations would require initializing a git repo
    // which is more of an integration test
  })

  describe("loadConfig", () => {
    it("should return default config when no config file exists", async () => {
      const config = await loadConfig(tempDir)

      expect(config.maxSteps).toBe(50)
    })

    it("should load project config", async () => {
      const configDir = path.join(tempDir, ".naught")
      await fs.mkdir(configDir, { recursive: true })
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify({
          model: "claude-opus-4-20250514",
          maxSteps: 100,
        })
      )

      const config = await loadConfig(tempDir)

      expect(config.model).toBe("claude-opus-4-20250514")
      expect(config.maxSteps).toBe(100)
    })

    it("should handle invalid JSON gracefully", async () => {
      const configDir = path.join(tempDir, ".naught")
      await fs.mkdir(configDir, { recursive: true })
      await fs.writeFile(path.join(configDir, "config.json"), "not valid json")

      const config = await loadConfig(tempDir)

      // Should return default config
      expect(config.maxSteps).toBe(50)
    })
  })

  describe("loadContext", () => {
    it("should load full context", async () => {
      // Setup minimal project
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")
      await fs.mkdir(path.join(tempDir, "src"))
      await fs.writeFile(path.join(tempDir, "src", "index.ts"), "")

      const context = await loadContext(tempDir)

      expect(context.rules).toBeDefined()
      expect(context.structure).toBeDefined()
      expect(context.git).toBeDefined()
      expect(context.config).toBeDefined()
    })
  })

  describe("buildContextPrompt", () => {
    it("should build prompt with project structure", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")
      await fs.mkdir(path.join(tempDir, "src"))

      const context = await loadContext(tempDir)
      const prompt = buildContextPrompt(context)

      expect(prompt).toContain("# Project Structure")
      expect(prompt).toContain("src/")
    })

    it("should include tech stack in prompt", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          devDependencies: { typescript: "^5.0.0", vitest: "^1.0.0" },
        })
      )
      await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "")

      const context = await loadContext(tempDir)
      const prompt = buildContextPrompt(context)

      expect(prompt).toContain("## Tech Stack")
      expect(prompt).toContain("TypeScript")
      expect(prompt).toContain("pnpm")
      expect(prompt).toContain("Vitest")
    })

    it("should include rules in prompt", async () => {
      const rulesDir = path.join(tempDir, ".naught", "rules")
      await fs.mkdir(rulesDir, { recursive: true })
      await fs.writeFile(path.join(rulesDir, "project.md"), "Always use TypeScript")

      const context = await loadContext(tempDir)
      const prompt = buildContextPrompt(context)

      expect(prompt).toContain("# Project Rules")
      expect(prompt).toContain("Always use TypeScript")
    })

    it("should show (empty) for empty tree", () => {
      const context: any = {
        rules: { project: [], user: [] },
        structure: { root: tempDir, tree: "", keyFiles: [], techStack: { languages: [], frameworks: [] } },
        git: { isRepo: false },
        config: {},
      }

      const prompt = buildContextPrompt(context)

      expect(prompt).toContain("(empty)")
    })

    it("should include frameworks in tech stack", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          dependencies: { react: "^18.0.0", next: "^14.0.0" },
        })
      )

      const context = await loadContext(tempDir)
      const prompt = buildContextPrompt(context)

      expect(prompt).toContain("Frameworks:")
      expect(prompt).toContain("React")
    })

    it("should include build tool in tech stack", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          devDependencies: { vite: "^5.0.0" },
        })
      )

      const context = await loadContext(tempDir)
      const prompt = buildContextPrompt(context)

      expect(prompt).toContain("Build Tool: Vite")
    })

    it("should include git status when repo exists", () => {
      const context: any = {
        rules: { project: [], user: [] },
        structure: { root: tempDir, tree: "src/", keyFiles: [], techStack: { languages: [], frameworks: [] } },
        git: {
          isRepo: true,
          branch: "main",
          isDirty: true,
          stagedCount: 2,
          unstagedCount: 3,
          recentCommits: [
            { hash: "abc123", message: "feat: add feature" },
            { hash: "def456", message: "fix: bug fix" },
          ],
        },
        config: {},
      }

      const prompt = buildContextPrompt(context)

      expect(prompt).toContain("# Git Status")
      expect(prompt).toContain("Branch: main")
      expect(prompt).toContain("has uncommitted changes")
      expect(prompt).toContain("Staged: 2 files")
      expect(prompt).toContain("Unstaged: 3 files")
      expect(prompt).toContain("Recent commits:")
      expect(prompt).toContain("abc123 feat: add feature")
    })

    it("should show (detached) when no branch", () => {
      const context: any = {
        rules: { project: [], user: [] },
        structure: { root: tempDir, tree: "src/", keyFiles: [], techStack: { languages: [], frameworks: [] } },
        git: {
          isRepo: true,
          branch: undefined,
          isDirty: false,
        },
        config: {},
      }

      const prompt = buildContextPrompt(context)

      expect(prompt).toContain("Branch: (detached)")
      expect(prompt).toContain("Status: clean")
    })
  })

  describe("detectTechStack additional", () => {
    it("should detect npm package manager", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")
      await fs.writeFile(path.join(tempDir, "package-lock.json"), "{}")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.packageManager).toBe("npm")
    })

    it("should detect yarn package manager", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")
      await fs.writeFile(path.join(tempDir, "yarn.lock"), "")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.packageManager).toBe("yarn")
    })

    it("should detect bun package manager", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")
      await fs.writeFile(path.join(tempDir, "bun.lockb"), "")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.packageManager).toBe("bun")
    })

    it("should detect Jest test framework", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          devDependencies: { jest: "^29.0.0" },
        })
      )

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.testFramework).toBe("Jest")
    })

    it("should detect multiple frameworks", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          dependencies: { vue: "^3.0.0", express: "^4.0.0" },
        })
      )

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.frameworks).toContain("Vue")
      expect(structure.techStack.frameworks).toContain("Express")
    })

    it("should detect webpack build tool", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          devDependencies: { webpack: "^5.0.0" },
        })
      )

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.buildTool).toBe("Webpack")
    })

    it("should detect Python from requirements.txt", async () => {
      await fs.writeFile(path.join(tempDir, "requirements.txt"), "flask==2.0.0")

      const structure = await loadProjectStructure(tempDir)

      expect(structure.techStack.languages).toContain("Python")
    })
  })

  describe("generateTree edge cases", () => {
    it("should truncate when maxFiles exceeded", async () => {
      // Create many files
      for (let i = 0; i < 20; i++) {
        await fs.writeFile(path.join(tempDir, `file${i}.txt`), "")
      }

      const structure = await loadProjectStructure(tempDir, { maxFiles: 10 })

      expect(structure.tree).toContain("truncated")
    })

    it("should handle custom exclude patterns", async () => {
      await fs.mkdir(path.join(tempDir, "custom_exclude"))
      await fs.mkdir(path.join(tempDir, "keep"))

      const structure = await loadProjectStructure(tempDir, {
        exclude: ["custom_exclude"],
      })

      expect(structure.tree).not.toContain("custom_exclude")
      expect(structure.tree).toContain("keep")
    })
  })
})
