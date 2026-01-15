import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import { GrepTool } from '../../src/tool/grep'
import {
  createTestContext,
  createTempDir,
  cleanupTempDir,
  createTestFile,
} from '../helpers/context'

describe('GrepTool', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  it('should have correct metadata', () => {
    expect(GrepTool.id).toBe('grep')
    expect(GrepTool.description).toContain('Searches for a pattern')
  })

  it('should find matches in files', async () => {
    await createTestFile(tempDir, 'test.ts', 'const foo = "hello"\nconst bar = "world"')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GrepTool.execute({ pattern: 'foo' }, ctx)

    expect(result.output).toContain('foo')
    expect(result.output).toContain('test.ts')
    expect(result.metadata?.matchCount).toBe(1)
  })

  it('should support regex patterns', async () => {
    // Create file with multiple lines containing the pattern
    await createTestFile(tempDir, 'code.ts', 'function hello() {}')
    await createTestFile(tempDir, 'code2.ts', 'function world() {}')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GrepTool.execute({ pattern: 'function' }, ctx)

    expect(result.output).toContain('function hello')
    expect(result.output).toContain('function world')
    expect(result.metadata?.matchCount).toBe(2)
  })

  it('should support case-insensitive search', async () => {
    // Create separate files to ensure each match is counted
    await createTestFile(tempDir, 'file1.txt', 'Hello world')
    await createTestFile(tempDir, 'file2.txt', 'HELLO WORLD')
    await createTestFile(tempDir, 'file3.txt', 'hello world')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GrepTool.execute({
      pattern: 'hello',
      ignoreCase: true,
    }, ctx)

    expect(result.metadata?.matchCount).toBe(3)
  })

  it('should filter files with include pattern', async () => {
    await createTestFile(tempDir, 'file.ts', 'const x = 1')
    await createTestFile(tempDir, 'file.js', 'const x = 2')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GrepTool.execute({
      pattern: 'const',
      include: '*.ts',
    }, ctx)

    expect(result.output).toContain('file.ts')
    expect(result.output).not.toContain('file.js')
    expect(result.metadata?.fileCount).toBe(1)
  })

  it('should search in specified path', async () => {
    await createTestFile(tempDir, 'root.ts', 'match here')
    await createTestFile(tempDir, 'src/nested.ts', 'match here too')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GrepTool.execute({
      pattern: 'match',
      path: path.join(tempDir, 'src'),
    }, ctx)

    expect(result.output).toContain('nested.ts')
    expect(result.output).not.toContain('root.ts')
  })

  it('should show context lines when requested', async () => {
    const content = 'line 1\nline 2\nmatch line\nline 4\nline 5'
    await createTestFile(tempDir, 'context.txt', content)
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GrepTool.execute({
      pattern: 'match',
      context: 1,
    }, ctx)

    expect(result.output).toContain('line 2')
    expect(result.output).toContain('match line')
    expect(result.output).toContain('line 4')
  })

  it('should return message when no matches found', async () => {
    await createTestFile(tempDir, 'empty.txt', 'no matches here')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GrepTool.execute({ pattern: 'nonexistent' }, ctx)

    expect(result.output).toContain('No matches found')
    expect(result.metadata?.matchCount).toBe(0)
  })

  it('should throw error for invalid regex', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    await expect(
      GrepTool.execute({ pattern: '[invalid' }, ctx)
    ).rejects.toThrow('Invalid regular expression')
  })

  it('should throw error for non-existent path', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    await expect(
      GrepTool.execute({
        pattern: 'test',
        path: path.join(tempDir, 'nonexistent'),
      }, ctx)
    ).rejects.toThrow('Path not found')
  })
})
