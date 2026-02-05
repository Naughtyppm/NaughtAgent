/**
 * colors.ts 单元测试
 *
 * 测试颜色和图标工具函数
 */

import { describe, it, expect } from 'vitest'
import {
  ANSI,
  Colors,
  toolColors,
  getToolColor,
  defaultTheme,
  statusColors,
  getStatusColor,
  toolIcons,
  getToolIcon,
  statusIcons,
  getStatusIcon,
} from '../../../../src/cli/ink/utils/colors'
import type { ToolName } from '../../../../src/cli/ink/types'

describe('colors.ts', () => {
  // ==========================================================================
  // ANSI 颜色常量测试
  // ==========================================================================
  describe('ANSI 常量', () => {
    it('应该包含重置代码', () => {
      expect(ANSI.reset).toBe('\x1b[0m')
    })

    it('应该包含基础颜色代码', () => {
      expect(ANSI.red).toBe('\x1b[31m')
      expect(ANSI.green).toBe('\x1b[32m')
      expect(ANSI.yellow).toBe('\x1b[33m')
      expect(ANSI.blue).toBe('\x1b[34m')
      expect(ANSI.cyan).toBe('\x1b[36m')
    })

    it('应该包含亮色代码', () => {
      expect(ANSI.brightRed).toBe('\x1b[91m')
      expect(ANSI.brightGreen).toBe('\x1b[92m')
      expect(ANSI.brightBlue).toBe('\x1b[94m')
    })

    it('应该包含样式代码', () => {
      expect(ANSI.bold).toBe('\x1b[1m')
      expect(ANSI.dim).toBe('\x1b[2m')
      expect(ANSI.underline).toBe('\x1b[4m')
    })
  })

  // ==========================================================================
  // Colors 常量测试
  // ==========================================================================
  describe('Colors 常量', () => {
    it('应该包含基础颜色名称', () => {
      expect(Colors.red).toBe('red')
      expect(Colors.green).toBe('green')
      expect(Colors.blue).toBe('blue')
      expect(Colors.cyan).toBe('cyan')
    })

    it('应该包含亮色名称', () => {
      expect(Colors.redBright).toBe('redBright')
      expect(Colors.greenBright).toBe('greenBright')
      expect(Colors.blueBright).toBe('blueBright')
    })
  })

  // ==========================================================================
  // getToolColor 函数测试
  // ==========================================================================
  describe('getToolColor', () => {
    it('应该返回 read 工具的颜色', () => {
      expect(getToolColor('read')).toBe('cyan')
    })

    it('应该返回 write 工具的颜色', () => {
      expect(getToolColor('write')).toBe('green')
    })

    it('应该返回 edit 工具的颜色', () => {
      expect(getToolColor('edit')).toBe('yellow')
    })

    it('应该返回 bash 工具的颜色', () => {
      expect(getToolColor('bash')).toBe('magenta')
    })

    it('应该返回 glob 工具的颜色', () => {
      expect(getToolColor('glob')).toBe('blue')
    })

    it('应该返回 grep 工具的颜色', () => {
      expect(getToolColor('grep')).toBe('blueBright')
    })

    it('应该为未知工具返回默认颜色 white', () => {
      expect(getToolColor('unknown')).toBe('white')
      expect(getToolColor('')).toBe('white')
      expect(getToolColor('custom-tool')).toBe('white')
    })

    it('应该与 toolColors 映射一致', () => {
      const toolNames: ToolName[] = ['read', 'write', 'edit', 'bash', 'glob', 'grep']
      for (const name of toolNames) {
        expect(getToolColor(name)).toBe(toolColors[name])
      }
    })
  })

  // ==========================================================================
  // getStatusColor 函数测试
  // ==========================================================================
  describe('getStatusColor', () => {
    it('应该返回 pending 状态的颜色', () => {
      expect(getStatusColor('pending')).toBe('gray')
    })

    it('应该返回 running 状态的颜色', () => {
      expect(getStatusColor('running')).toBe('cyan')
    })

    it('应该返回 completed 状态的颜色', () => {
      expect(getStatusColor('completed')).toBe('green')
    })

    it('应该返回 error 状态的颜色', () => {
      expect(getStatusColor('error')).toBe('red')
    })

    it('应该与 statusColors 映射一致', () => {
      const statuses = ['pending', 'running', 'completed', 'error'] as const
      for (const status of statuses) {
        expect(getStatusColor(status)).toBe(statusColors[status])
      }
    })
  })

  // ==========================================================================
  // getToolIcon 函数测试
  // ==========================================================================
  describe('getToolIcon', () => {
    it('应该返回 read 工具的图标', () => {
      expect(getToolIcon('read')).toBe('📖')
    })

    it('应该返回 write 工具的图标', () => {
      expect(getToolIcon('write')).toBe('✏️')
    })

    it('应该返回 edit 工具的图标', () => {
      expect(getToolIcon('edit')).toBe('🔧')
    })

    it('应该返回 bash 工具的图标', () => {
      expect(getToolIcon('bash')).toBe('💻')
    })

    it('应该返回 glob 工具的图标', () => {
      expect(getToolIcon('glob')).toBe('🔍')
    })

    it('应该返回 grep 工具的图标', () => {
      expect(getToolIcon('grep')).toBe('🔎')
    })

    it('应该为未知工具返回默认图标', () => {
      expect(getToolIcon('unknown')).toBe('🔧')
      expect(getToolIcon('')).toBe('🔧')
      expect(getToolIcon('custom-tool')).toBe('🔧')
    })

    it('应该与 toolIcons 映射一致', () => {
      const toolNames: ToolName[] = ['read', 'write', 'edit', 'bash', 'glob', 'grep']
      for (const name of toolNames) {
        expect(getToolIcon(name)).toBe(toolIcons[name])
      }
    })
  })

  // ==========================================================================
  // getStatusIcon 函数测试
  // ==========================================================================
  describe('getStatusIcon', () => {
    it('应该返回 pending 状态的图标', () => {
      expect(getStatusIcon('pending')).toBe('○')
    })

    it('应该返回 running 状态的图标', () => {
      expect(getStatusIcon('running')).toBe('◐')
    })

    it('应该返回 completed 状态的图标', () => {
      expect(getStatusIcon('completed')).toBe('✓')
    })

    it('应该返回 error 状态的图标', () => {
      expect(getStatusIcon('error')).toBe('✗')
    })

    it('应该与 statusIcons 映射一致', () => {
      const statuses = ['pending', 'running', 'completed', 'error'] as const
      for (const status of statuses) {
        expect(getStatusIcon(status)).toBe(statusIcons[status])
      }
    })
  })

  // ==========================================================================
  // 主题测试
  // ==========================================================================
  describe('defaultTheme', () => {
    it('应该包含所有语义颜色', () => {
      expect(defaultTheme.primary).toBe('cyan')
      expect(defaultTheme.secondary).toBe('blue')
      expect(defaultTheme.success).toBe('green')
      expect(defaultTheme.warning).toBe('yellow')
      expect(defaultTheme.error).toBe('red')
      expect(defaultTheme.info).toBe('blueBright')
      expect(defaultTheme.muted).toBe('gray')
    })
  })
})
