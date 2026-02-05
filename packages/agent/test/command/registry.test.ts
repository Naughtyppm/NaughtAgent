/**
 * 统一命令注册表单元测试
 *
 * 测试内容：
 * 1. Builtin 命令正确加载
 * 2. External 命令（justfile）正确加载和转换
 * 3. Skill 命令正确加载和转换
 * 4. 优先级排序正确（builtin > skill > external）
 * 5. get() 方法返回最高优先级命令
 * 6. search() 方法按名称/描述/别名搜索
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { UnifiedCommand, CommandLayer } from '../../src/command/types.js'
import { LAYER_PRIORITY } from '../../src/command/types.js'

// Mock justfile 模块
vi.mock('../../src/justfile/index.js', () => ({
  createCommandRegistry: vi.fn().mockResolvedValue({
    getCommands: vi.fn().mockReturnValue([]),
    getErrors: vi.fn().mockReturnValue({ global: [], project: [] }),
    reload: vi.fn(),
  }),
}))

// Mock skill 模块
vi.mock('../../src/skill/index.js', () => ({
  listSkills: vi.fn().mockReturnValue([]),
}))

// 导入被测模块（在 mock 之后）
import {
  createUnifiedRegistry,
  createSyncRegistry,
  type UnifiedRegistry,
} from '../../src/command/registry.js'
import { createCommandRegistry } from '../../src/justfile/index.js'
import { listSkills } from '../../src/skill/index.js'

describe('UnifiedRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createUnifiedRegistry', () => {
    it('should create registry with builtin commands', async () => {
      const registry = await createUnifiedRegistry()
      const builtinCommands = registry.getBuiltin()

      // 应该包含核心内置命令
      expect(builtinCommands.length).toBeGreaterThan(0)

      // 验证 help 命令存在
      const helpCmd = builtinCommands.find((cmd) => cmd.name === 'help')
      expect(helpCmd).toBeDefined()
      expect(helpCmd?.layer).toBe('builtin')
      expect(helpCmd?.executionMode).toBe('sync')
      expect(helpCmd?.source).toBe('builtin')
    })

    it('should load all expected builtin commands', async () => {
      const registry = await createUnifiedRegistry()
      const builtinCommands = registry.getBuiltin()
      const names = builtinCommands.map((cmd) => cmd.name)

      // 验证所有预期的内置命令
      expect(names).toContain('help')
      expect(names).toContain('clear')
      expect(names).toContain('exit')
      expect(names).toContain('refresh')
      expect(names).toContain('model')
      expect(names).toContain('mode')
      expect(names).toContain('history')
      expect(names).toContain('config')
    })
  })


  describe('External Commands (Justfile)', () => {
    it('should load and convert justfile commands', async () => {
      // 设置 mock 返回 justfile 命令
      const mockJustfileCommands = [
        {
          name: 'build',
          description: 'Build the project',
          source: 'project' as const,
          sourcePath: './justfile',
          parameters: [],
        },
        {
          name: 'test',
          description: 'Run tests',
          source: 'global' as const,
          sourcePath: '~/.naughtyagent/justfile',
          parameters: [{ name: 'filter', hasDefault: true, defaultValue: '' }],
        },
      ]

      vi.mocked(createCommandRegistry).mockResolvedValue({
        getCommands: vi.fn().mockReturnValue(mockJustfileCommands),
        getErrors: vi.fn().mockReturnValue({ global: [], project: [] }),
        reload: vi.fn(),
      })

      const registry = await createUnifiedRegistry()
      const externalCommands = registry.getExternal()

      expect(externalCommands.length).toBe(2)

      // 验证 build 命令转换
      const buildCmd = externalCommands.find((cmd) => cmd.name === 'build')
      expect(buildCmd).toBeDefined()
      expect(buildCmd?.layer).toBe('external')
      expect(buildCmd?.executionMode).toBe('subprocess')
      expect(buildCmd?.source).toBe('project-justfile')

      // 验证 test 命令转换
      const testCmd = externalCommands.find((cmd) => cmd.name === 'test')
      expect(testCmd).toBeDefined()
      expect(testCmd?.source).toBe('global-justfile')
      expect(testCmd?.parameters).toHaveLength(1)
      expect(testCmd?.parameters[0].name).toBe('filter')
      expect(testCmd?.parameters[0].required).toBe(false)
    })

    it('should handle justfile loading errors gracefully', async () => {
      vi.mocked(createCommandRegistry).mockRejectedValue(
        new Error('Justfile not found')
      )

      const registry = await createUnifiedRegistry()
      const externalCommands = registry.getExternal()
      const errors = registry.getErrors()

      // 应该返回空数组而不是抛出错误
      expect(externalCommands).toEqual([])
      // 错误应该被记录
      expect(errors.justfile.global.length).toBeGreaterThan(0)
    })
  })

  describe('Skill Commands', () => {
    it('should load and convert skill commands', async () => {
      // 设置 mock 返回 skill 定义
      const mockSkills = [
        {
          name: 'commit',
          description: 'Generate commit message',
          aliases: ['ci', 'c'],
          parameters: [{ name: 'message', description: 'Commit message', required: false }],
          workflow: { name: 'commit-workflow', description: 'Commit', steps: [] },
        },
        {
          name: 'pr',
          description: 'Generate PR description',
          workflow: { name: 'pr-workflow', description: 'PR', steps: [] },
        },
      ]

      vi.mocked(listSkills).mockReturnValue(mockSkills)

      const registry = await createUnifiedRegistry()
      const skillCommands = registry.getSkills()

      expect(skillCommands.length).toBe(2)

      // 验证 commit 命令转换
      const commitCmd = skillCommands.find((cmd) => cmd.name === 'commit')
      expect(commitCmd).toBeDefined()
      expect(commitCmd?.layer).toBe('skill')
      expect(commitCmd?.executionMode).toBe('workflow')
      expect(commitCmd?.source).toBe('builtin-skill')
      expect(commitCmd?.aliases).toContain('ci')
      expect(commitCmd?.aliases).toContain('c')

      // 验证 pr 命令转换
      const prCmd = skillCommands.find((cmd) => cmd.name === 'pr')
      expect(prCmd).toBeDefined()
      expect(prCmd?.layer).toBe('skill')
    })

    it('should handle skill loading errors gracefully', async () => {
      vi.mocked(listSkills).mockImplementation(() => {
        throw new Error('Skill module error')
      })

      const registry = await createUnifiedRegistry()
      const skillCommands = registry.getSkills()
      const errors = registry.getErrors()

      // 应该返回空数组而不是抛出错误
      expect(skillCommands).toEqual([])
      // 错误应该被记录
      expect(errors.skill.global.length).toBeGreaterThan(0)
    })
  })


  describe('Priority Ordering', () => {
    it('should return builtin command when same name exists in multiple layers', async () => {
      // 设置 mock：builtin 有 help，skill 也有 help
      const mockSkills = [
        {
          name: 'help',
          description: 'Skill help command',
          workflow: { name: 'help-workflow', description: 'Help', steps: [] },
        },
      ]
      vi.mocked(listSkills).mockReturnValue(mockSkills)

      const registry = await createUnifiedRegistry()
      const helpCmd = registry.get('help')

      // 应该返回 builtin 版本（优先级最高）
      expect(helpCmd).toBeDefined()
      expect(helpCmd?.layer).toBe('builtin')
    })

    it('should return skill command over external when same name exists', async () => {
      // 设置 mock：skill 有 build，external 也有 build
      const mockSkills = [
        {
          name: 'build',
          description: 'Skill build command',
          workflow: { name: 'build-workflow', description: 'Build', steps: [] },
        },
      ]
      vi.mocked(listSkills).mockReturnValue(mockSkills)

      const mockJustfileCommands = [
        {
          name: 'build',
          description: 'Justfile build command',
          source: 'project' as const,
          sourcePath: './justfile',
          parameters: [],
        },
      ]
      vi.mocked(createCommandRegistry).mockResolvedValue({
        getCommands: vi.fn().mockReturnValue(mockJustfileCommands),
        getErrors: vi.fn().mockReturnValue({ global: [], project: [] }),
        reload: vi.fn(),
      })

      const registry = await createUnifiedRegistry()
      const buildCmd = registry.get('build')

      // 应该返回 skill 版本（优先级高于 external）
      expect(buildCmd).toBeDefined()
      expect(buildCmd?.layer).toBe('skill')
    })

    it('should verify LAYER_PRIORITY constants', () => {
      // 验证优先级常量正确
      expect(LAYER_PRIORITY.builtin).toBeLessThan(LAYER_PRIORITY.skill)
      expect(LAYER_PRIORITY.skill).toBeLessThan(LAYER_PRIORITY.external)
    })

    it('should sort getAll() results by name', async () => {
      const registry = await createUnifiedRegistry()
      const allCommands = registry.getAll()

      // 验证按名称排序
      for (let i = 1; i < allCommands.length; i++) {
        expect(allCommands[i - 1].name.localeCompare(allCommands[i].name)).toBeLessThanOrEqual(0)
      }
    })
  })

  describe('get() method', () => {
    it('should return undefined for unknown command', async () => {
      const registry = await createUnifiedRegistry()
      const cmd = registry.get('nonexistent')

      expect(cmd).toBeUndefined()
    })

    it('should find command by name', async () => {
      const registry = await createUnifiedRegistry()
      const cmd = registry.get('help')

      expect(cmd).toBeDefined()
      expect(cmd?.name).toBe('help')
    })

    it('should find command by alias', async () => {
      // 设置 mock：skill 有别名
      const mockSkills = [
        {
          name: 'commit',
          description: 'Commit changes',
          aliases: ['ci', 'c'],
          workflow: { name: 'commit-workflow', description: 'Commit', steps: [] },
        },
      ]
      vi.mocked(listSkills).mockReturnValue(mockSkills)

      const registry = await createUnifiedRegistry()

      // 通过别名查找
      const cmdByCi = registry.get('ci')
      const cmdByC = registry.get('c')

      expect(cmdByCi).toBeDefined()
      expect(cmdByCi?.name).toBe('commit')
      expect(cmdByC).toBeDefined()
      expect(cmdByC?.name).toBe('commit')
    })
  })


  describe('search() method', () => {
    it('should return empty array for no matches', async () => {
      const registry = await createUnifiedRegistry()
      const results = registry.search('xyznonexistent')

      expect(results).toEqual([])
    })

    it('should find commands by name', async () => {
      const registry = await createUnifiedRegistry()
      const results = registry.search('help')

      expect(results.length).toBeGreaterThan(0)
      expect(results.some((cmd) => cmd.name === 'help')).toBe(true)
    })

    it('should find commands by description', async () => {
      const registry = await createUnifiedRegistry()
      // 搜索描述中的关键词
      const results = registry.search('model')

      expect(results.length).toBeGreaterThan(0)
    })

    it('should find commands by alias', async () => {
      // 设置 mock：skill 有别名
      const mockSkills = [
        {
          name: 'commit',
          description: 'Commit changes',
          aliases: ['ci', 'c'],
          workflow: { name: 'commit-workflow', description: 'Commit', steps: [] },
        },
      ]
      vi.mocked(listSkills).mockReturnValue(mockSkills)

      const registry = await createUnifiedRegistry()
      const results = registry.search('ci')

      expect(results.length).toBeGreaterThan(0)
      expect(results.some((cmd) => cmd.name === 'commit')).toBe(true)
    })

    it('should be case-insensitive', async () => {
      const registry = await createUnifiedRegistry()

      const resultsLower = registry.search('help')
      const resultsUpper = registry.search('HELP')
      const resultsMixed = registry.search('HeLp')

      expect(resultsLower.length).toBe(resultsUpper.length)
      expect(resultsLower.length).toBe(resultsMixed.length)
    })
  })

  describe('getByLayer() method', () => {
    it('should return only builtin commands for builtin layer', async () => {
      const registry = await createUnifiedRegistry()
      const commands = registry.getByLayer('builtin')

      expect(commands.length).toBeGreaterThan(0)
      expect(commands.every((cmd) => cmd.layer === 'builtin')).toBe(true)
    })

    it('should return only external commands for external layer', async () => {
      const mockJustfileCommands = [
        {
          name: 'build',
          description: 'Build',
          source: 'project' as const,
          sourcePath: './justfile',
          parameters: [],
        },
      ]
      vi.mocked(createCommandRegistry).mockResolvedValue({
        getCommands: vi.fn().mockReturnValue(mockJustfileCommands),
        getErrors: vi.fn().mockReturnValue({ global: [], project: [] }),
        reload: vi.fn(),
      })

      const registry = await createUnifiedRegistry()
      const commands = registry.getByLayer('external')

      expect(commands.length).toBe(1)
      expect(commands.every((cmd) => cmd.layer === 'external')).toBe(true)
    })

    it('should return only skill commands for skill layer', async () => {
      const mockSkills = [
        {
          name: 'commit',
          description: 'Commit',
          workflow: { name: 'w', description: 'd', steps: [] },
        },
      ]
      vi.mocked(listSkills).mockReturnValue(mockSkills)

      const registry = await createUnifiedRegistry()
      const commands = registry.getByLayer('skill')

      expect(commands.length).toBe(1)
      expect(commands.every((cmd) => cmd.layer === 'skill')).toBe(true)
    })
  })

  describe('reload() method', () => {
    it('should reload all command sources', async () => {
      const mockReload = vi.fn()
      vi.mocked(createCommandRegistry).mockResolvedValue({
        getCommands: vi.fn().mockReturnValue([]),
        getErrors: vi.fn().mockReturnValue({ global: [], project: [] }),
        reload: mockReload,
      })

      const registry = await createUnifiedRegistry()
      await registry.reload()

      // justfile registry 的 reload 应该被调用
      expect(mockReload).toHaveBeenCalled()
    })
  })

  describe('getErrors() method', () => {
    it('should return error structure', async () => {
      const registry = await createUnifiedRegistry()
      const errors = registry.getErrors()

      expect(errors).toHaveProperty('justfile')
      expect(errors).toHaveProperty('skill')
      expect(errors.justfile).toHaveProperty('global')
      expect(errors.justfile).toHaveProperty('project')
      expect(errors.skill).toHaveProperty('global')
      expect(errors.skill).toHaveProperty('project')
    })
  })
})


describe('createSyncRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create registry synchronously', () => {
    const registry = createSyncRegistry()

    expect(registry).toBeDefined()
    expect(typeof registry.getAll).toBe('function')
    expect(typeof registry.get).toBe('function')
    expect(typeof registry.search).toBe('function')
  })

  it('should include builtin commands', () => {
    const registry = createSyncRegistry()
    const builtinCommands = registry.getBuiltin()

    expect(builtinCommands.length).toBeGreaterThan(0)
    expect(builtinCommands.some((cmd) => cmd.name === 'help')).toBe(true)
  })

  it('should include skill commands', () => {
    const mockSkills = [
      {
        name: 'commit',
        description: 'Commit',
        workflow: { name: 'w', description: 'd', steps: [] },
      },
    ]
    vi.mocked(listSkills).mockReturnValue(mockSkills)

    const registry = createSyncRegistry()
    const skillCommands = registry.getSkills()

    expect(skillCommands.length).toBe(1)
    expect(skillCommands[0].name).toBe('commit')
  })

  it('should return empty array for external commands', () => {
    const registry = createSyncRegistry()
    const externalCommands = registry.getExternal()

    // 同步版本不加载 justfile 命令
    expect(externalCommands).toEqual([])
  })

  it('should handle skill loading errors gracefully', () => {
    vi.mocked(listSkills).mockImplementation(() => {
      throw new Error('Skill error')
    })

    // 不应该抛出错误
    const registry = createSyncRegistry()
    const skillCommands = registry.getSkills()

    expect(skillCommands).toEqual([])
  })
})

describe('Command Metadata Completeness', () => {
  it('should ensure all commands have required metadata', async () => {
    const registry = await createUnifiedRegistry()
    const allCommands = registry.getAll()

    for (const cmd of allCommands) {
      // 验证必需字段
      expect(cmd.name).toBeTruthy()
      expect(typeof cmd.name).toBe('string')
      expect(cmd.description).toBeTruthy()
      expect(typeof cmd.description).toBe('string')
      expect(['builtin', 'external', 'skill']).toContain(cmd.layer)
      expect(['sync', 'subprocess', 'workflow']).toContain(cmd.executionMode)
      expect([
        'builtin',
        'global-justfile',
        'project-justfile',
        'builtin-skill',
        'global-skill',
        'project-skill',
      ]).toContain(cmd.source)
      expect(Array.isArray(cmd.parameters)).toBe(true)
    }
  })

  it('should ensure builtin commands have correct execution mode', async () => {
    const registry = await createUnifiedRegistry()
    const builtinCommands = registry.getBuiltin()

    for (const cmd of builtinCommands) {
      expect(cmd.executionMode).toBe('sync')
      expect(cmd.source).toBe('builtin')
    }
  })
})

describe('Layer Aggregation Completeness', () => {
  it('should aggregate commands from all three layers', async () => {
    // 设置所有三层都有命令
    const mockSkills = [
      {
        name: 'commit',
        description: 'Commit',
        workflow: { name: 'w', description: 'd', steps: [] },
      },
    ]
    vi.mocked(listSkills).mockReturnValue(mockSkills)

    const mockJustfileCommands = [
      {
        name: 'build',
        description: 'Build',
        source: 'project' as const,
        sourcePath: './justfile',
        parameters: [],
      },
    ]
    vi.mocked(createCommandRegistry).mockResolvedValue({
      getCommands: vi.fn().mockReturnValue(mockJustfileCommands),
      getErrors: vi.fn().mockReturnValue({ global: [], project: [] }),
      reload: vi.fn(),
    })

    const registry = await createUnifiedRegistry()
    const allCommands = registry.getAll()

    // 验证三层都有命令
    const layers = new Set(allCommands.map((cmd) => cmd.layer))
    expect(layers.has('builtin')).toBe(true)
    expect(layers.has('skill')).toBe(true)
    expect(layers.has('external')).toBe(true)
  })
})
