/**
 * 命令系统集成测试
 *
 * 测试：
 * - 增强路由器（别名解析）
 * - 增强调度器（管道/链式执行）
 * - 历史记录集成
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { createEnhancedRouter, createEnhancedDispatcher } from "../../src/command/integration.js"
import { createCommandRouter } from "../../src/command/router.js"
import { createCommandDispatcher } from "../../src/command/dispatcher.js"
import { createAliasManager } from "../../src/command/alias.js"
import { createHistoryManager } from "../../src/command/history-manager.js"
import type { UnifiedRegistry } from "../../src/command/registry.js"
import type { UnifiedCommand } from "../../src/command/types.js"

// ============================================================================
// Mock Registry
// ============================================================================

function createMockRegistry(): UnifiedRegistry {
  const commands = new Map<string, UnifiedCommand>([
    ["help", {
      name: "help",
      description: "显示帮助",
      layer: "builtin",
      executionMode: "sync",
      source: "builtin",
      parameters: [],
    }],
    ["echo", {
      name: "echo",
      description: "回显输入",
      layer: "builtin",
      executionMode: "sync",
      source: "builtin",
      parameters: [],
    }],
    ["upper", {
      name: "upper",
      description: "转大写",
      layer: "builtin",
      executionMode: "sync",
      source: "builtin",
      parameters: [],
    }],
    ["fail", {
      name: "fail",
      description: "总是失败",
      layer: "builtin",
      executionMode: "sync",
      source: "builtin",
      parameters: [],
    }],
  ])

  return {
    get: (name: string) => commands.get(name),
    getAll: () => Array.from(commands.values()),
    has: (name: string) => commands.has(name),
    reload: async () => {},
    getErrors: () => ({ justfile: [], skill: [] }),
  }
}

// ============================================================================
// Enhanced Router Tests
// ============================================================================

describe("EnhancedRouter", () => {
  let registry: UnifiedRegistry
  let aliasManager: ReturnType<typeof createAliasManager>

  beforeEach(() => {
    registry = createMockRegistry()
    aliasManager = createAliasManager({
      aliasFile: "/tmp/test-aliases.json",
      builtinCommands: ["help", "echo", "upper", "fail"],
    })
  })

  it("应该正常路由已知命令", () => {
    const baseRouter = createCommandRouter(registry)
    const router = createEnhancedRouter({
      baseRouter,
      aliasManager,
      registry,
    })

    const result = router.route("/help")
    expect(result.type).toBe("command")
    expect(result.found).toBe(true)
    expect(result.commandName).toBe("help")
  })

  it("应该识别自然语言输入", () => {
    const baseRouter = createCommandRouter(registry)
    const router = createEnhancedRouter({
      baseRouter,
      aliasManager,
      registry,
    })

    const result = router.route("hello world")
    expect(result.type).toBe("natural-language")
    expect(result.found).toBe(false)
  })

  it("应该解析命令参数", () => {
    const baseRouter = createCommandRouter(registry)
    const router = createEnhancedRouter({
      baseRouter,
      aliasManager,
      registry,
    })

    const parsed = router.parseArgs('/echo "hello world" --verbose')
    expect(parsed.name).toBe("echo")
    expect(parsed.args).toContain("hello world")
    expect(parsed.namedArgs["verbose"]).toBe("true")
  })
})

// ============================================================================
// Enhanced Dispatcher Tests
// ============================================================================

describe("EnhancedDispatcher", () => {
  let registry: UnifiedRegistry
  let historyManager: ReturnType<typeof createHistoryManager>

  beforeEach(() => {
    registry = createMockRegistry()
    historyManager = createHistoryManager({
      historyFile: "/tmp/test-history.json",
      maxEntries: 100,
      deduplicate: true,
    })
  })

  it("应该执行简单命令", async () => {
    const baseRouter = createCommandRouter(registry)
    const baseDispatcher = createCommandDispatcher()

    // Mock dispatcher
    const mockDispatcher = {
      dispatch: vi.fn().mockResolvedValue({
        success: true,
        output: "test output",
        duration: 10,
        layer: "builtin",
      }),
    }

    const dispatcher = createEnhancedDispatcher({
      baseDispatcher: mockDispatcher as any,
      router: baseRouter,
      registry,
      historyManager,
    })

    const result = await dispatcher.execute("/echo hello", { cwd: "/tmp" })
    expect(result.success).toBe(true)
  })

  it("应该记录命令历史", async () => {
    const baseRouter = createCommandRouter(registry)

    const mockDispatcher = {
      dispatch: vi.fn().mockResolvedValue({
        success: true,
        output: "test",
        duration: 10,
        layer: "builtin",
      }),
    }

    const dispatcher = createEnhancedDispatcher({
      baseDispatcher: mockDispatcher as any,
      router: baseRouter,
      registry,
      historyManager,
    })

    await dispatcher.execute("/echo test", { cwd: "/tmp" })

    const history = await historyManager.getAll()
    expect(history.length).toBeGreaterThan(0)
    expect(history[history.length - 1].command).toBe("/echo test")
  })

  it("应该处理未知命令", async () => {
    const baseRouter = createCommandRouter(registry)
    const baseDispatcher = createCommandDispatcher()

    const dispatcher = createEnhancedDispatcher({
      baseDispatcher,
      router: baseRouter,
      registry,
      historyManager,
    })

    const result = await dispatcher.execute("/unknown", { cwd: "/tmp" })
    expect(result.success).toBe(false)
    expect(result.error).toContain("未知命令")
  })
})

// ============================================================================
// Pipeline Integration Tests
// ============================================================================

describe("Pipeline Integration", () => {
  let registry: UnifiedRegistry
  let historyManager: ReturnType<typeof createHistoryManager>

  beforeEach(() => {
    registry = createMockRegistry()
    historyManager = createHistoryManager({
      historyFile: "/tmp/test-history-pipe.json",
      maxEntries: 100,
      deduplicate: true,
    })
  })

  it("应该检测管道语法", async () => {
    const baseRouter = createCommandRouter(registry)

    let callCount = 0
    const mockDispatcher = {
      dispatch: vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          success: true,
          output: `output-${callCount}`,
          duration: 10,
          layer: "builtin",
        })
      }),
    }

    const dispatcher = createEnhancedDispatcher({
      baseDispatcher: mockDispatcher as any,
      router: baseRouter,
      registry,
      historyManager,
    })

    const result = await dispatcher.execute("/echo hello | /upper", { cwd: "/tmp" })

    // 管道应该被检测到
    expect(result.data?.stagesExecuted).toBeDefined()
  })
})

// ============================================================================
// Chain Integration Tests
// ============================================================================

describe("Chain Integration", () => {
  let registry: UnifiedRegistry
  let historyManager: ReturnType<typeof createHistoryManager>

  beforeEach(() => {
    registry = createMockRegistry()
    historyManager = createHistoryManager({
      historyFile: "/tmp/test-history-chain.json",
      maxEntries: 100,
      deduplicate: true,
    })
  })

  it("应该检测链式语法", async () => {
    const baseRouter = createCommandRouter(registry)

    let callCount = 0
    const mockDispatcher = {
      dispatch: vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          success: true,
          output: `output-${callCount}`,
          duration: 10,
          layer: "builtin",
        })
      }),
    }

    const dispatcher = createEnhancedDispatcher({
      baseDispatcher: mockDispatcher as any,
      router: baseRouter,
      registry,
      historyManager,
    })

    const result = await dispatcher.execute("/echo a && /echo b", { cwd: "/tmp" })

    // 链式应该被检测到
    expect(result.data?.segmentsExecuted).toBeDefined()
  })

  it("应该处理分号链式", async () => {
    const baseRouter = createCommandRouter(registry)

    let callCount = 0
    const mockDispatcher = {
      dispatch: vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          success: callCount !== 2, // 第二个命令失败
          output: `output-${callCount}`,
          duration: 10,
          layer: "builtin",
        })
      }),
    }

    const dispatcher = createEnhancedDispatcher({
      baseDispatcher: mockDispatcher as any,
      router: baseRouter,
      registry,
      historyManager,
    })

    const result = await dispatcher.execute("/echo a ; /fail ; /echo c", { cwd: "/tmp" })

    // 分号链式应该继续执行
    expect(result.data?.segmentsExecuted).toBeGreaterThan(1)
  })
})
