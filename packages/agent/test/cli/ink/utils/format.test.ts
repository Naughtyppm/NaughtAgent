/**
 * format.ts 单元测试
 *
 * 测试格式化工具函数
 */

import { describe, it, expect } from 'vitest'
import {
  truncateString,
  getFileName,
  formatFilePath,
  formatToolInput,
  formatToolCallSummary,
  formatDuration,
  getToolDuration,
  formatToolOutput,
  countOutputLines,
} from '../../../../src/cli/ink/utils/format'
import type { ToolCall, ReadToolInput, WriteToolInput, EditToolInput, BashToolInput, GlobToolInput, GrepToolInput } from '../../../../src/cli/ink/types'

describe('format.ts', () => {
  // ==========================================================================
  // truncateString 函数测试
  // ==========================================================================
  describe('truncateString', () => {
    it('应该返回短于 maxLength 的字符串原样', () => {
      expect(truncateString('hello', 10)).toBe('hello')
      expect(truncateString('test', 50)).toBe('test')
    })

    it('应该截断超过 maxLength 的字符串', () => {
      expect(truncateString('hello world', 8)).toBe('hello...')
      expect(truncateString('this is a long string', 10)).toBe('this is...')
    })

    it('应该处理空字符串', () => {
      expect(truncateString('', 10)).toBe('')
    })

    it('应该处理 undefined/null 输入', () => {
      expect(truncateString(undefined as unknown as string, 10)).toBe('')
      expect(truncateString(null as unknown as string, 10)).toBe('')
    })

    it('应该处理 maxLength 为 0 的情况', () => {
      expect(truncateString('hello', 0)).toBe('')
    })

    it('应该处理负数 maxLength', () => {
      expect(truncateString('hello', -5)).toBe('')
    })

    it('应该使用自定义省略号', () => {
      expect(truncateString('hello world', 9, '…')).toBe('hello wo…')
      expect(truncateString('hello world', 10, '>>>')).toBe('hello w>>>')
    })

    it('应该处理 maxLength 小于省略号长度的情况', () => {
      expect(truncateString('hello', 2)).toBe('..')
      expect(truncateString('hello', 1)).toBe('.')
    })

    it('应该处理刚好等于 maxLength 的字符串', () => {
      expect(truncateString('hello', 5)).toBe('hello')
      expect(truncateString('12345', 5)).toBe('12345')
    })

    it('应该正确处理 Unicode 字符', () => {
      // 注意：truncateString 按字符数计算，不是按字节
      // '你好世界' 有 4 个字符，maxLength=5 时不需要截断
      expect(truncateString('你好世界', 5)).toBe('你好世界')
      expect(truncateString('你好世界', 4)).toBe('你好世界')
      // 需要截断的情况
      expect(truncateString('你好世界测试', 5)).toBe('你好...')
    })

    it('应该处理 emoji 字符（可能产生乱码）', () => {
      // emoji 使用 surrogate pairs，slice 可能会截断到中间
      // 这是当前实现的已知行为，测试验证实际输出
      const result = truncateString('🎉🎊🎁🎄', 4)
      // 结果可能包含乱码字符，但长度应该符合预期
      expect(result.length).toBeLessThanOrEqual(4)
    })
  })

  // ==========================================================================
  // getFileName 函数测试
  // ==========================================================================
  describe('getFileName', () => {
    it('应该从 Unix 路径提取文件名', () => {
      expect(getFileName('/path/to/file.ts')).toBe('file.ts')
      expect(getFileName('/home/user/project/src/index.js')).toBe('index.js')
    })

    it('应该从 Windows 路径提取文件名', () => {
      expect(getFileName('C:\\Users\\test\\file.ts')).toBe('file.ts')
      expect(getFileName('D:\\project\\src\\main.js')).toBe('main.js')
    })

    it('应该处理只有文件名的情况', () => {
      expect(getFileName('file.ts')).toBe('file.ts')
      expect(getFileName('README.md')).toBe('README.md')
    })

    it('应该处理空字符串', () => {
      expect(getFileName('')).toBe('')
    })

    it('应该处理以斜杠结尾的路径', () => {
      // 实际实现返回原路径（因为 split 后最后一个元素是空字符串，回退到原路径）
      expect(getFileName('/path/to/dir/')).toBe('/path/to/dir/')
    })
  })

  // ==========================================================================
  // formatFilePath 函数测试
  // ==========================================================================
  describe('formatFilePath', () => {
    it('应该返回短路径原样', () => {
      expect(formatFilePath('src/file.ts')).toBe('src/file.ts')
    })

    it('应该截断长路径并显示文件名', () => {
      const longPath = '/very/long/path/to/some/deeply/nested/file.ts'
      expect(formatFilePath(longPath, false, 20)).toBe('file.ts')
    })

    it('应该在 showFullPath 为 true 时截断完整路径', () => {
      const longPath = '/very/long/path/to/file.ts'
      // 15 - 3 (省略号) = 12 个字符
      expect(formatFilePath(longPath, true, 15)).toBe('/very/long/p...')
    })

    it('应该处理空路径', () => {
      expect(formatFilePath('')).toBe('')
    })

    it('应该处理文件名也超长的情况', () => {
      const longFileName = 'this-is-a-very-long-filename-that-exceeds-limit.ts'
      expect(formatFilePath(longFileName, false, 20)).toBe('this-is-a-very-lo...')
    })
  })


  // ==========================================================================
  // formatToolInput 函数测试
  // ==========================================================================
  describe('formatToolInput', () => {
    describe('read 工具', () => {
      it('应该格式化基本文件路径', () => {
        // 默认 maxLength=50，路径较短时显示完整路径
        const input: ReadToolInput = { filePath: '/path/to/file.ts' }
        expect(formatToolInput('read', input)).toBe('/path/to/file.ts')
      })

      it('应该格式化短路径', () => {
        const input: ReadToolInput = { filePath: 'file.ts' }
        expect(formatToolInput('read', input)).toBe('file.ts')
      })

      it('应该格式化带行号范围的输入', () => {
        const input: ReadToolInput = { filePath: 'file.ts', startLine: 10, endLine: 20 }
        expect(formatToolInput('read', input)).toBe('file.ts (L10-20)')
      })

      it('应该格式化只有起始行的输入', () => {
        const input: ReadToolInput = { filePath: 'file.ts', startLine: 10 }
        expect(formatToolInput('read', input)).toBe('file.ts (from L10)')
      })

      it('应该处理长路径', () => {
        const input: ReadToolInput = { filePath: '/very/long/path/to/file.ts' }
        expect(formatToolInput('read', input, { maxLength: 15 })).toBe('file.ts')
      })
    })

    describe('write 工具', () => {
      it('应该格式化文件路径', () => {
        // 默认 maxLength=50，路径较短时显示完整路径
        const input: WriteToolInput = { filePath: '/path/to/file.ts', content: 'content' }
        expect(formatToolInput('write', input)).toBe('/path/to/file.ts')
      })

      it('应该格式化短路径', () => {
        const input: WriteToolInput = { filePath: 'file.ts', content: 'content' }
        expect(formatToolInput('write', input)).toBe('file.ts')
      })

      it('应该处理长路径', () => {
        const input: WriteToolInput = { filePath: '/very/long/path/to/file.ts', content: 'content' }
        expect(formatToolInput('write', input, { maxLength: 15 })).toBe('file.ts')
      })
    })

    describe('edit 工具', () => {
      it('应该格式化文件路径', () => {
        // 默认 maxLength=50，路径较短时显示完整路径
        const input: EditToolInput = { filePath: '/path/to/file.ts', oldContent: 'old', newContent: 'new' }
        expect(formatToolInput('edit', input)).toBe('/path/to/file.ts')
      })

      it('应该格式化短路径', () => {
        const input: EditToolInput = { filePath: 'file.ts', oldContent: 'old', newContent: 'new' }
        expect(formatToolInput('edit', input)).toBe('file.ts')
      })
    })

    describe('bash 工具', () => {
      it('应该格式化命令', () => {
        const input: BashToolInput = { command: 'npm install' }
        expect(formatToolInput('bash', input)).toBe('npm install')
      })

      it('应该截断长命令', () => {
        const input: BashToolInput = { command: 'npm install --save-dev typescript eslint prettier' }
        expect(formatToolInput('bash', input, { maxLength: 20 })).toBe('npm install --sav...')
      })

      it('应该移除多余空白', () => {
        const input: BashToolInput = { command: '  npm   install  ' }
        expect(formatToolInput('bash', input)).toBe('npm install')
      })

      it('应该处理空命令', () => {
        const input: BashToolInput = { command: '' }
        expect(formatToolInput('bash', input)).toBe('')
      })
    })

    describe('glob 工具', () => {
      it('应该格式化模式', () => {
        const input: GlobToolInput = { pattern: '**/*.ts' }
        expect(formatToolInput('glob', input)).toBe('**/*.ts')
      })

      it('应该格式化带 cwd 的模式', () => {
        const input: GlobToolInput = { pattern: '*.ts', cwd: 'src' }
        expect(formatToolInput('glob', input)).toBe('src/*.ts')
      })

      it('应该截断长模式', () => {
        const input: GlobToolInput = { pattern: '**/*.{ts,tsx,js,jsx}', cwd: '/very/long/path' }
        // 20 - 3 = 17 个字符
        expect(formatToolInput('glob', input, { maxLength: 20 })).toBe('/very/long/path/*...')
      })
    })

    describe('grep 工具', () => {
      it('应该格式化搜索模式', () => {
        const input: GrepToolInput = { pattern: 'TODO', path: 'src' }
        expect(formatToolInput('grep', input)).toBe('"TODO" in src')
      })

      it('应该使用默认路径', () => {
        const input: GrepToolInput = { pattern: 'FIXME' }
        expect(formatToolInput('grep', input)).toBe('"FIXME" in .')
      })

      it('应该截断长模式', () => {
        const input: GrepToolInput = { pattern: 'very long search pattern', path: '/long/path' }
        // 格式: "pattern" in path，20 - 3 = 17 个字符
        expect(formatToolInput('grep', input, { maxLength: 20 })).toBe('"very long search...')
      })
    })

    describe('未知工具', () => {
      it('应该尝试提取 filePath', () => {
        // formatFilePath 在路径较短时返回完整路径
        const input = { filePath: '/path/to/file.ts' }
        expect(formatToolInput('unknown', input)).toBe('/path/to/file.ts')
      })

      it('应该尝试提取短 filePath', () => {
        const input = { filePath: 'file.ts' }
        expect(formatToolInput('unknown', input)).toBe('file.ts')
      })

      it('应该尝试提取 path', () => {
        const input = { path: '/path/to/file.ts' }
        expect(formatToolInput('unknown', input)).toBe('/path/to/file.ts')
      })

      it('应该尝试提取短 path', () => {
        const input = { path: 'file.ts' }
        expect(formatToolInput('unknown', input)).toBe('file.ts')
      })

      it('应该尝试提取 command', () => {
        const input = { command: 'echo hello' }
        expect(formatToolInput('unknown', input)).toBe('echo hello')
      })

      it('应该尝试提取 pattern', () => {
        const input = { pattern: '*.ts' }
        expect(formatToolInput('unknown', input)).toBe('*.ts')
      })

      it('应该回退到 JSON 摘要', () => {
        const input = { foo: 'bar', baz: 123 }
        const result = formatToolInput('unknown', input, { maxLength: 30 })
        expect(result).toContain('foo')
        expect(result).toContain('bar')
      })

      it('应该处理复杂对象', () => {
        const input = { nested: { deep: { value: 'test' } } }
        const result = formatToolInput('unknown', input, { maxLength: 50 })
        expect(result).toBe('{"nested":{"deep":{"value":"test"}}}')
      })
    })
  })


  // ==========================================================================
  // formatToolCallSummary 函数测试
  // ==========================================================================
  describe('formatToolCallSummary', () => {
    it('应该格式化工具调用摘要', () => {
      const tool: ToolCall = {
        id: '1',
        name: 'read',
        displayName: 'Read File',
        input: { filePath: '/path/to/file.ts' },
        isError: false,
        status: 'completed',
        startTime: Date.now(),
      }
      // 默认 maxLength=50，路径较短时显示完整路径
      expect(formatToolCallSummary(tool)).toBe('Read File: /path/to/file.ts')
    })

    it('应该格式化短路径的工具调用摘要', () => {
      const tool: ToolCall = {
        id: '1',
        name: 'read',
        displayName: 'Read File',
        input: { filePath: 'file.ts' },
        isError: false,
        status: 'completed',
        startTime: Date.now(),
      }
      expect(formatToolCallSummary(tool)).toBe('Read File: file.ts')
    })

    it('应该使用自定义选项', () => {
      const tool: ToolCall = {
        id: '1',
        name: 'bash',
        displayName: 'Execute',
        input: { command: 'npm install --save-dev typescript' },
        isError: false,
        status: 'running',
        startTime: Date.now(),
      }
      expect(formatToolCallSummary(tool, { maxLength: 15 })).toBe('Execute: npm install ...')
    })
  })

  // ==========================================================================
  // formatDuration 函数测试
  // ==========================================================================
  describe('formatDuration', () => {
    describe('毫秒范围', () => {
      it('应该格式化 0 毫秒', () => {
        expect(formatDuration(0)).toBe('0ms')
      })

      it('应该格式化小于 1 秒的时间', () => {
        expect(formatDuration(100)).toBe('100ms')
        expect(formatDuration(500)).toBe('500ms')
        expect(formatDuration(999)).toBe('999ms')
      })

      it('应该处理负数', () => {
        expect(formatDuration(-100)).toBe('0ms')
        expect(formatDuration(-1)).toBe('0ms')
      })
    })

    describe('秒范围', () => {
      it('应该格式化整数秒', () => {
        expect(formatDuration(1000)).toBe('1s')
        expect(formatDuration(5000)).toBe('5s')
        expect(formatDuration(30000)).toBe('30s')
      })

      it('应该格式化带小数的秒', () => {
        expect(formatDuration(1500)).toBe('1.5s')
        expect(formatDuration(2300)).toBe('2.3s')
        expect(formatDuration(59999)).toBe('60.0s')
      })

      it('应该四舍五入到一位小数', () => {
        expect(formatDuration(1234)).toBe('1.2s')
        expect(formatDuration(1256)).toBe('1.3s')
      })
    })

    describe('分钟范围', () => {
      it('应该格式化整数分钟', () => {
        expect(formatDuration(60000)).toBe('1m')
        expect(formatDuration(120000)).toBe('2m')
        expect(formatDuration(300000)).toBe('5m')
      })

      it('应该格式化分钟和秒', () => {
        expect(formatDuration(65000)).toBe('1m 5s')
        expect(formatDuration(90000)).toBe('1m 30s')
        expect(formatDuration(125000)).toBe('2m 5s')
      })

      it('应该处理接近 1 小时的时间', () => {
        expect(formatDuration(3599000)).toBe('59m 59s')
      })
    })

    describe('小时范围', () => {
      it('应该格式化整数小时', () => {
        // 实际实现：整数小时不显示 0m
        expect(formatDuration(3600000)).toBe('1h')
        expect(formatDuration(7200000)).toBe('2h')
      })

      it('应该格式化小时和分钟', () => {
        expect(formatDuration(3660000)).toBe('1h 1m') // 1小时1分钟
        expect(formatDuration(5400000)).toBe('1h 30m') // 1.5小时
      })

      it('应该格式化小时、分钟和秒', () => {
        expect(formatDuration(3665000)).toBe('1h 1m 5s')
        expect(formatDuration(7325000)).toBe('2h 2m 5s')
      })

      it('应该处理只有小时和秒的情况', () => {
        expect(formatDuration(3605000)).toBe('1h 0m 5s')
      })

      it('应该处理大时间值', () => {
        // 实际实现：整数小时不显示 0m
        expect(formatDuration(86400000)).toBe('24h') // 24 小时
        expect(formatDuration(90061000)).toBe('25h 1m 1s')
      })
    })

    describe('边界情况', () => {
      it('应该处理浮点数输入', () => {
        // 1000.5 四舍五入后是 1001ms，即 1.001s，显示为 1.0s
        expect(formatDuration(1000.5)).toBe('1.0s')
        expect(formatDuration(1500.9)).toBe('1.5s')
      })

      it('应该处理整数秒', () => {
        expect(formatDuration(1000)).toBe('1s')
        expect(formatDuration(2000)).toBe('2s')
      })

      it('应该处理非常小的正数', () => {
        expect(formatDuration(0.1)).toBe('0ms')
        expect(formatDuration(0.9)).toBe('1ms')
      })
    })
  })

  // ==========================================================================
  // getToolDuration 函数测试
  // ==========================================================================
  describe('getToolDuration', () => {
    it('应该返回格式化的执行时间', () => {
      const tool: ToolCall = {
        id: '1',
        name: 'read',
        displayName: 'Read',
        input: { filePath: 'file.ts' },
        isError: false,
        status: 'completed',
        startTime: 1000,
        endTime: 2500,
      }
      expect(getToolDuration(tool)).toBe('1.5s')
    })

    it('应该在未完成时返回 null', () => {
      const tool: ToolCall = {
        id: '1',
        name: 'read',
        displayName: 'Read',
        input: { filePath: 'file.ts' },
        isError: false,
        status: 'running',
        startTime: 1000,
      }
      expect(getToolDuration(tool)).toBeNull()
    })

    it('应该处理 0 执行时间', () => {
      const tool: ToolCall = {
        id: '1',
        name: 'read',
        displayName: 'Read',
        input: { filePath: 'file.ts' },
        isError: false,
        status: 'completed',
        startTime: 1000,
        endTime: 1000,
      }
      expect(getToolDuration(tool)).toBe('0ms')
    })
  })

  // ==========================================================================
  // formatToolOutput 函数测试
  // ==========================================================================
  describe('formatToolOutput', () => {
    it('应该返回第一行内容', () => {
      const output = 'First line\nSecond line\nThird line'
      expect(formatToolOutput(output)).toBe('First line')
    })

    it('应该截断长输出', () => {
      const output = 'This is a very long first line that should be truncated'
      expect(formatToolOutput(output, 20)).toBe('This is a very lo...')
    })

    it('应该移除 ANSI 转义序列', () => {
      const output = '\x1b[31mRed text\x1b[0m\nNormal text'
      expect(formatToolOutput(output)).toBe('Red text')
    })

    it('应该处理空输出', () => {
      expect(formatToolOutput('')).toBe('')
      expect(formatToolOutput(undefined)).toBe('')
    })

    it('应该修剪空白', () => {
      const output = '  trimmed content  \nSecond line'
      expect(formatToolOutput(output)).toBe('trimmed content')
    })

    it('应该处理只有空白的第一行', () => {
      const output = '   \nActual content'
      expect(formatToolOutput(output)).toBe('')
    })

    it('应该处理复杂的 ANSI 序列', () => {
      const output = '\x1b[1;31;40mBold red on black\x1b[0m'
      expect(formatToolOutput(output)).toBe('Bold red on black')
    })
  })

  // ==========================================================================
  // countOutputLines 函数测试
  // ==========================================================================
  describe('countOutputLines', () => {
    it('应该计算行数', () => {
      expect(countOutputLines('one\ntwo\nthree')).toBe(3)
      expect(countOutputLines('single line')).toBe(1)
    })

    it('应该处理空输出', () => {
      // 实际实现：空字符串返回 0（因为 !output 为 true）
      expect(countOutputLines('')).toBe(0)
      expect(countOutputLines(undefined)).toBe(0)
    })

    it('应该处理以换行结尾的输出', () => {
      expect(countOutputLines('line1\nline2\n')).toBe(3)
    })

    it('应该处理多个连续换行', () => {
      expect(countOutputLines('line1\n\n\nline4')).toBe(4)
    })
  })
})
