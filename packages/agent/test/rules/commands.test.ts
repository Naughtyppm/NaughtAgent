/**
 * Commands 测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  parseJustfile,
  parseMakefile,
  parsePackageScripts,
  detectPackageManager,
  discoverCommands,
  CommandsDiscovery,
  buildCommandsPrompt,
} from "../../src/rules/commands"

describe("parseJustfile", () => {
  it("should parse simple recipes", () => {
    const content = `
build:
    cargo build

test:
    cargo test
`
    const commands = parseJustfile(content)

    expect(commands.length).toBe(2)
    expect(commands[0].name).toBe("build")
    expect(commands[0].command).toBe("just build")
    expect(commands[0].source).toBe("justfile")
    expect(commands[1].name).toBe("test")
  })

  it("should parse recipes with comments", () => {
    const content = `
# Build the project
build:
    cargo build --release

# Run all tests
test *args:
    cargo test {{args}}
`
    const commands = parseJustfile(content)

    expect(commands.length).toBe(2)
    expect(commands[0].name).toBe("build")
    expect(commands[0].description).toBe("Build the project")
    expect(commands[1].name).toBe("test")
    expect(commands[1].description).toBe("Run all tests")
  })

  it("should skip private recipes", () => {
    const content = `
build:
    cargo build

_helper:
    echo "private"

test:
    cargo test
`
    const commands = parseJustfile(content)

    expect(commands.length).toBe(2)
    expect(commands.map((c) => c.name)).toEqual(["build", "test"])
  })

  it("should handle recipes with dependencies", () => {
    const content = `
# Deploy to production
deploy: build test
    ./deploy.sh
`
    const commands = parseJustfile(content)

    expect(commands.length).toBe(1)
    expect(commands[0].name).toBe("deploy")
    expect(commands[0].description).toBe("Deploy to production")
  })
})

describe("parseMakefile", () => {
  it("should parse simple targets", () => {
    const content = `
build:
\tgcc -o main main.c

clean:
\trm -f main
`
    const commands = parseMakefile(content)

    expect(commands.length).toBe(2)
    expect(commands[0].name).toBe("build")
    expect(commands[0].command).toBe("make build")
    expect(commands[0].source).toBe("makefile")
  })

  it("should parse targets with comments", () => {
    const content = `
# Compile the project
build:
\tgcc -o main main.c

# Clean build artifacts
clean:
\trm -f main
`
    const commands = parseMakefile(content)

    expect(commands.length).toBe(2)
    expect(commands[0].description).toBe("Compile the project")
    expect(commands[1].description).toBe("Clean build artifacts")
  })

  it("should skip .PHONY and similar", () => {
    const content = `
.PHONY: build clean

build:
\tgcc main.c

.DEFAULT_GOAL := build
`
    const commands = parseMakefile(content)

    expect(commands.length).toBe(1)
    expect(commands[0].name).toBe("build")
  })

  it("should handle targets with dependencies", () => {
    const content = `
all: build test

build:
\tgcc main.c
`
    const commands = parseMakefile(content)

    expect(commands.length).toBe(2)
    expect(commands.map((c) => c.name)).toContain("all")
    expect(commands.map((c) => c.name)).toContain("build")
  })
})

describe("parsePackageScripts", () => {
  it("should parse scripts", () => {
    const pkg = {
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        test: "vitest",
      },
    }

    const commands = parsePackageScripts(pkg, "pnpm")

    expect(commands.length).toBe(3)
    expect(commands[0].name).toBe("dev")
    expect(commands[0].command).toBe("pnpm dev")
    expect(commands[0].source).toBe("package.json")
  })

  it("should use npm run for npm", () => {
    const pkg = {
      scripts: {
        test: "jest",
      },
    }

    const commands = parsePackageScripts(pkg, "npm")

    expect(commands[0].command).toBe("npm run test")
  })

  it("should skip lifecycle scripts", () => {
    const pkg = {
      scripts: {
        prebuild: "echo pre",
        build: "tsc",
        postbuild: "echo post",
        prepare: "husky install",
        test: "vitest",
      },
    }

    const commands = parsePackageScripts(pkg)

    expect(commands.length).toBe(2)
    expect(commands.map((c) => c.name)).toEqual(["build", "test"])
  })

  it("should extract description from short scripts", () => {
    const pkg = {
      scripts: {
        lint: "eslint src/",
        complex: "npm run build && npm run test && npm run deploy",
      },
    }

    const commands = parsePackageScripts(pkg)

    const lint = commands.find((c) => c.name === "lint")
    const complex = commands.find((c) => c.name === "complex")

    expect(lint?.description).toBe("eslint src/")
    expect(complex?.description).toBeUndefined()
  })

  it("should handle missing scripts", () => {
    const pkg = {}
    const commands = parsePackageScripts(pkg)
    expect(commands).toEqual([])
  })
})

describe("detectPackageManager", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-test-"))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it("should detect pnpm", async () => {
    await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "")
    const pm = await detectPackageManager(tempDir)
    expect(pm).toBe("pnpm")
  })

  it("should detect yarn", async () => {
    await fs.writeFile(path.join(tempDir, "yarn.lock"), "")
    const pm = await detectPackageManager(tempDir)
    expect(pm).toBe("yarn")
  })

  it("should detect npm", async () => {
    await fs.writeFile(path.join(tempDir, "package-lock.json"), "{}")
    const pm = await detectPackageManager(tempDir)
    expect(pm).toBe("npm")
  })

  it("should detect bun", async () => {
    await fs.writeFile(path.join(tempDir, "bun.lockb"), "")
    const pm = await detectPackageManager(tempDir)
    expect(pm).toBe("bun")
  })

  it("should default to npm", async () => {
    const pm = await detectPackageManager(tempDir)
    expect(pm).toBe("npm")
  })

  it("should prioritize bun over others", async () => {
    await fs.writeFile(path.join(tempDir, "bun.lockb"), "")
    await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "")
    const pm = await detectPackageManager(tempDir)
    expect(pm).toBe("bun")
  })
})

describe("discoverCommands", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "discover-test-"))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it("should discover from Justfile", async () => {
    await fs.writeFile(
      path.join(tempDir, "Justfile"),
      `
# Build project
build:
    cargo build
`
    )

    const index = await discoverCommands(tempDir, { sources: ["justfile"] })

    expect(index.commands.length).toBe(1)
    expect(index.commands[0].name).toBe("build")
    expect(index.commands[0].source).toBe("justfile")
  })

  it("should discover from Makefile", async () => {
    await fs.writeFile(
      path.join(tempDir, "Makefile"),
      `
build:
\tgcc main.c
`
    )

    const index = await discoverCommands(tempDir, { sources: ["makefile"] })

    expect(index.commands.length).toBe(1)
    expect(index.commands[0].source).toBe("makefile")
  })

  it("should discover from package.json", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        scripts: {
          test: "vitest",
          build: "tsc",
        },
      })
    )

    const index = await discoverCommands(tempDir, { sources: ["package.json"] })

    expect(index.commands.length).toBe(2)
    expect(index.commands.every((c) => c.source === "package.json")).toBe(true)
  })

  it("should discover from multiple sources", async () => {
    await fs.writeFile(path.join(tempDir, "Justfile"), "deploy:\n    ./deploy.sh")
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ scripts: { test: "vitest" } })
    )

    const index = await discoverCommands(tempDir)

    expect(index.commands.length).toBe(2)
    expect(index.commands.map((c) => c.source).sort()).toEqual(["justfile", "package.json"])
  })

  it("should include discoveredAt timestamp", async () => {
    const index = await discoverCommands(tempDir)
    expect(index.discoveredAt).toBeDefined()
    expect(new Date(index.discoveredAt).getTime()).toBeLessThanOrEqual(Date.now())
  })
})

describe("CommandsDiscovery class", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "discovery-test-"))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it("should cache results", async () => {
    await fs.writeFile(path.join(tempDir, "Justfile"), "build:\n    cargo build")

    const discovery = new CommandsDiscovery({}, 60000)

    const index1 = await discovery.discover(tempDir)
    const index2 = await discovery.discover(tempDir)

    expect(index1).toBe(index2) // Same reference
  })

  it("should clear cache", async () => {
    await fs.writeFile(path.join(tempDir, "Justfile"), "build:\n    cargo build")

    const discovery = new CommandsDiscovery()

    const index1 = await discovery.discover(tempDir)
    discovery.clearCache(tempDir)
    const index2 = await discovery.discover(tempDir)

    expect(index1).not.toBe(index2)
  })

  it("should find command by name", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ scripts: { test: "vitest", build: "tsc" } })
    )

    const discovery = new CommandsDiscovery()

    const cmd = await discovery.findCommand(tempDir, "test")
    expect(cmd).toBeDefined()
    expect(cmd!.name).toBe("test")

    const missing = await discovery.findCommand(tempDir, "nonexistent")
    expect(missing).toBeUndefined()
  })

  it("should filter by source", async () => {
    await fs.writeFile(path.join(tempDir, "Justfile"), "deploy:\n    ./deploy.sh")
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ scripts: { test: "vitest" } })
    )

    const discovery = new CommandsDiscovery()

    const justCommands = await discovery.getCommandsBySource(tempDir, "justfile")
    expect(justCommands.length).toBe(1)
    expect(justCommands[0].name).toBe("deploy")

    const pkgCommands = await discovery.getCommandsBySource(tempDir, "package.json")
    expect(pkgCommands.length).toBe(1)
    expect(pkgCommands[0].name).toBe("test")
  })

  it("should respect discover config", async () => {
    await fs.writeFile(path.join(tempDir, "Justfile"), "build:\n    cargo build")

    const discovery = new CommandsDiscovery({ discover: false })
    const index = await discovery.discover(tempDir)

    expect(index.commands).toEqual([])
  })
})

describe("buildCommandsPrompt", () => {
  it("should build prompt from commands", () => {
    const index = {
      commands: [
        { name: "build", description: "Build project", command: "just build", source: "justfile" as const },
        { name: "test", command: "pnpm test", source: "package.json" as const },
      ],
      discoveredAt: new Date().toISOString(),
    }

    const prompt = buildCommandsPrompt(index)

    expect(prompt).toContain("# Available Project Commands")
    expect(prompt).toContain("## Justfile")
    expect(prompt).toContain("`just build`: Build project")
    expect(prompt).toContain("## npm scripts")
    expect(prompt).toContain("`pnpm test`")
  })

  it("should return empty string for no commands", () => {
    const index = { commands: [], discoveredAt: new Date().toISOString() }
    const prompt = buildCommandsPrompt(index)
    expect(prompt).toBe("")
  })

  it("should group by source", () => {
    const index = {
      commands: [
        { name: "a", command: "just a", source: "justfile" as const },
        { name: "b", command: "make b", source: "makefile" as const },
        { name: "c", command: "just c", source: "justfile" as const },
      ],
      discoveredAt: new Date().toISOString(),
    }

    const prompt = buildCommandsPrompt(index)

    // Check that sources are grouped
    const justfileIndex = prompt.indexOf("## Justfile")
    const makefileIndex = prompt.indexOf("## Makefile")
    expect(justfileIndex).toBeGreaterThan(-1)
    expect(makefileIndex).toBeGreaterThan(-1)
  })
})
