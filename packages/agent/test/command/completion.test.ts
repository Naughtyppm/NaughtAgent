/**
 * 命令补全提供器单元测试
 *
 * 测试 CompletionProvider 的核心功能：
 * - 前缀过滤
 * - 层级图标
 * - 参数提示
 * - 排序逻辑
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCompletionProvider,
  getSuggestions,
  formatSuggestion,
  type CompletionSuggestion,
  type CompletionProvider,
} from '../../src/command/completion.js'
import type { UnifiedRegistry } from '../../src/command/registry.js'
import type { UnifiedCommand, CommandLayer } from '../../src/command/types.js'
import { LAYER_ICONS } from '../../src/command/types.js'

// ============================================================================
// Mock Registry
// ============================================================================

/**
 * 创建测试用的 Mock Registry
 */
function createMockRegistry(commands: UnifiedCommand[]): UnifiedRegistry {
  return {
    getAll: () => commands,
    getByLayer: (layer: CommandLayer) => commands.filter((c) => c.layer === layer),
    getBuiltin: () => commands.filter((c) => c.layer === 'builtin'),
    getExternal: () => commands.filter((c) => c.layer === 'external'),
    getSkills: () => commands.filter((c) => c.layer === 'skill'),
    get: (name: string) => commands.find((c) => c.name === name || c.aliases?.includes(name)),
    search: (query: string) => {
      const lowerQuery = query.toLowerCase()
      return commands.filter(
        (c) =>
          c.name.toLowerCase().includes(lowerQuery) ||
          c.description.toLowerCase().includes(lowerQuery)
      )
    },
    reload: async () => {},
    getErrors: () => ({
      justfile: { global: [], project: [] },
      skill: { global: [], project: [] },
    }),
  }
}

/**
 * 创建测试命令
 */
function createTestCommand(
  name: string,
  layer: CommandLayer,
  options: Partial<UnifiedCommand> = {}
): UnifiedCommand {
  return {
    name,
    description: options.description ?? `${name} command`,
    layer,
    executionMode: layer === 'builtin' ? 'sync' : layer === 'external' ? 'subprocess' : 'workflow',
    source: layer === 'builtin' ? 'builtin' : layer === 'external' ? 'project-justfile' : 'builtin-skill',
    parameters: options.parameters ?? [],
    aliases: options.aliases,
    ...options,
  }
}

// ============================================================================
// 测试套件
// ============================================================================

describe('CompletionProvider', () => {
  let provider: CompletionProvider
  let mockRegistry: UnifiedRegistry

  beforeEach(() => {
    provider = createCompletionProvider()
  })

  describe('getSuggestions', () => {
    describe('基本过滤', () => {
      it('应该返回所有命令当输入只有 /', () => {
        const commands = [
          createTestCommand('help', 'builtin'),
          createTestCommand('clear', 'builtin'),
          createTestCommand('build', 'external'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions).toHaveLength(3)
        expect(suggestions.map((s) => s.name)).toContain('help')
        expect(suggestions.map((s) => s.name)).toContain('clear')
        expect(suggestions.map((s) => s.name)).toContain('build')
      })

      it('应该返回所有命令当输入为空字符串', () => {
        const commands = [
          createTestCommand('help', 'builtin'),
          createTestCommand('model', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('', mockRegistry)

        expect(suggestions).toHaveLength(2)
      })

      it('应该按前缀过滤命令', () => {
        const commands = [
          createTestCommand('help', 'builtin'),
          createTestCommand('history', 'builtin'),
          createTestCommand('clear', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/h', mockRegistry)

        expect(suggestions).toHaveLength(2)
        expect(suggestions.map((s) => s.name)).toContain('help')
        expect(suggestions.map((s) => s.name)).toContain('history')
        expect(suggestions.map((s) => s.name)).not.toContain('clear')
      })

      it('应该支持不带 / 前缀的输入', () => {
        const commands = [
          createTestCommand('help', 'builtin'),
          createTestCommand('history', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('he', mockRegistry)

        expect(suggestions).toHaveLength(1)
        expect(suggestions[0].name).toBe('help')
      })

      it('应该大小写不敏感', () => {
        const commands = [
          createTestCommand('Help', 'builtin'),
          createTestCommand('HISTORY', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/h', mockRegistry)

        expect(suggestions).toHaveLength(2)
      })

      it('应该返回空数组当没有匹配', () => {
        const commands = [
          createTestCommand('help', 'builtin'),
          createTestCommand('clear', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/xyz', mockRegistry)

        expect(suggestions).toHaveLength(0)
      })
    })

    describe('层级图标', () => {
      it('应该为 builtin 命令添加 ⚡ 图标', () => {
        const commands = [createTestCommand('help', 'builtin')]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].layerIcon).toBe('⚡')
        expect(suggestions[0].layer).toBe('builtin')
      })

      it('应该为 external 命令添加 📁 图标', () => {
        const commands = [createTestCommand('build', 'external')]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].layerIcon).toBe('📁')
        expect(suggestions[0].layer).toBe('external')
      })

      it('应该为 skill 命令添加 🤖 图标', () => {
        const commands = [createTestCommand('commit', 'skill')]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].layerIcon).toBe('🤖')
        expect(suggestions[0].layer).toBe('skill')
      })

      it('应该为所有层级使用正确的图标', () => {
        const commands = [
          createTestCommand('help', 'builtin'),
          createTestCommand('build', 'external'),
          createTestCommand('commit', 'skill'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        const builtinSuggestion = suggestions.find((s) => s.name === 'help')
        const externalSuggestion = suggestions.find((s) => s.name === 'build')
        const skillSuggestion = suggestions.find((s) => s.name === 'commit')

        expect(builtinSuggestion?.layerIcon).toBe(LAYER_ICONS.builtin)
        expect(externalSuggestion?.layerIcon).toBe(LAYER_ICONS.external)
        expect(skillSuggestion?.layerIcon).toBe(LAYER_ICONS.skill)
      })
    })

    describe('排序', () => {
      it('应该按层级优先级排序（builtin > skill > external）', () => {
        const commands = [
          createTestCommand('test', 'external'),
          createTestCommand('test2', 'skill'),
          createTestCommand('test3', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        // builtin 应该在最前面
        expect(suggestions[0].layer).toBe('builtin')
        // skill 在中间
        expect(suggestions[1].layer).toBe('skill')
        // external 在最后
        expect(suggestions[2].layer).toBe('external')
      })

      it('应该在相同层级内按名称字母顺序排序', () => {
        const commands = [
          createTestCommand('zebra', 'builtin'),
          createTestCommand('alpha', 'builtin'),
          createTestCommand('beta', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].name).toBe('alpha')
        expect(suggestions[1].name).toBe('beta')
        expect(suggestions[2].name).toBe('zebra')
      })

      it('应该优先显示前缀匹配的结果', () => {
        const commands = [
          createTestCommand('helper', 'builtin'),
          createTestCommand('help', 'builtin'),
          createTestCommand('myhelp', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/hel', mockRegistry)

        // 前缀匹配的应该在前面
        expect(suggestions[0].name).toBe('help')
        expect(suggestions[1].name).toBe('helper')
        // 包含但不是前缀的在后面
        expect(suggestions[2].name).toBe('myhelp')
      })
    })

    describe('参数提示', () => {
      it('应该为有参数的命令生成参数提示', () => {
        const commands = [
          createTestCommand('model', 'builtin', {
            parameters: [{ name: 'name', required: true }],
          }),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].parameterHint).toBe('<name>')
      })

      it('应该为可选参数使用方括号', () => {
        const commands = [
          createTestCommand('config', 'builtin', {
            parameters: [{ name: 'key', required: false }],
          }),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].parameterHint).toBe('[key]')
      })

      it('应该显示默认值', () => {
        const commands = [
          createTestCommand('timeout', 'builtin', {
            parameters: [{ name: 'seconds', required: false, defaultValue: '30' }],
          }),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].parameterHint).toBe('[seconds=30]')
      })

      it('应该组合多个参数', () => {
        const commands = [
          createTestCommand('copy', 'builtin', {
            parameters: [
              { name: 'source', required: true },
              { name: 'dest', required: true },
              { name: 'force', required: false },
            ],
          }),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].parameterHint).toBe('<source> <dest> [force]')
      })

      it('应该为无参数命令返回 undefined', () => {
        const commands = [createTestCommand('help', 'builtin', { parameters: [] })]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/', mockRegistry)

        expect(suggestions[0].parameterHint).toBeUndefined()
      })
    })

    describe('别名匹配', () => {
      it('应该匹配命令别名', () => {
        const commands = [
          createTestCommand('help', 'builtin', { aliases: ['h', '?'] }),
          createTestCommand('clear', 'builtin'),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/h', mockRegistry)

        expect(suggestions).toHaveLength(1)
        expect(suggestions[0].name).toBe('help')
      })
    })

    describe('描述匹配', () => {
      it('应该匹配命令描述', () => {
        const commands = [
          createTestCommand('help', 'builtin', { description: '显示帮助信息' }),
          createTestCommand('clear', 'builtin', { description: '清空屏幕' }),
        ]
        mockRegistry = createMockRegistry(commands)

        const suggestions = provider.getSuggestions('/帮助', mockRegistry)

        expect(suggestions).toHaveLength(1)
        expect(suggestions[0].name).toBe('help')
      })
    })
  })

  describe('getParameterSuggestions', () => {
    it('应该为 -- 开头的输入提供命名参数建议', () => {
      const command = createTestCommand('config', 'builtin', {
        parameters: [
          { name: 'key', required: true },
          { name: 'value', required: false },
        ],
      })

      const suggestions = provider.getParameterSuggestions(command, '--k')

      expect(suggestions).toContain('--key=')
    })

    it('应该为有默认值的参数显示默认值', () => {
      const command = createTestCommand('timeout', 'builtin', {
        parameters: [{ name: 'seconds', required: false, defaultValue: '30' }],
      })

      const suggestions = provider.getParameterSuggestions(command, '--s')

      expect(suggestions).toContain('--seconds=30')
    })

    it('应该为 - 开头的输入提供 -- 形式建议', () => {
      const command = createTestCommand('config', 'builtin', {
        parameters: [{ name: 'verbose', required: false }],
      })

      const suggestions = provider.getParameterSuggestions(command, '-')

      expect(suggestions).toContain('--verbose')
    })

    it('应该为位置参数提供名称建议', () => {
      const command = createTestCommand('copy', 'builtin', {
        parameters: [
          { name: 'source', required: true, description: '源文件' },
          { name: 'dest', required: true },
        ],
      })

      const suggestions = provider.getParameterSuggestions(command, 's')

      expect(suggestions.some((s) => s.includes('source'))).toBe(true)
    })

    it('应该返回空数组当命令没有参数', () => {
      const command = createTestCommand('help', 'builtin', { parameters: [] })

      const suggestions = provider.getParameterSuggestions(command, '--')

      expect(suggestions).toHaveLength(0)
    })
  })
})

describe('getSuggestions 便捷函数', () => {
  it('应该正常工作', () => {
    const commands = [createTestCommand('help', 'builtin')]
    const mockRegistry = createMockRegistry(commands)

    const suggestions = getSuggestions('/h', mockRegistry)

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].name).toBe('help')
  })
})

describe('formatSuggestion', () => {
  it('应该格式化基本建议', () => {
    const suggestion: CompletionSuggestion = {
      name: 'help',
      description: '显示帮助信息',
      layer: 'builtin',
      layerIcon: '⚡',
      source: 'builtin',
    }

    const formatted = formatSuggestion(suggestion)

    expect(formatted).toBe('⚡ /help - 显示帮助信息')
  })

  it('应该包含参数提示', () => {
    const suggestion: CompletionSuggestion = {
      name: 'model',
      description: '切换模型',
      layer: 'builtin',
      layerIcon: '⚡',
      parameterHint: '<name>',
      source: 'builtin',
    }

    const formatted = formatSuggestion(suggestion)

    expect(formatted).toBe('⚡ /model <name> - 切换模型')
  })

  it('应该正确显示不同层级图标', () => {
    const externalSuggestion: CompletionSuggestion = {
      name: 'build',
      description: '构建项目',
      layer: 'external',
      layerIcon: '📁',
      source: 'project-justfile',
    }

    const skillSuggestion: CompletionSuggestion = {
      name: 'commit',
      description: '生成提交',
      layer: 'skill',
      layerIcon: '🤖',
      source: 'builtin-skill',
    }

    expect(formatSuggestion(externalSuggestion)).toContain('📁')
    expect(formatSuggestion(skillSuggestion)).toContain('🤖')
  })
})
