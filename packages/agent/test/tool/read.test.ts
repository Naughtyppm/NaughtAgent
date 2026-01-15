import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import { ReadTool } from '../../src/tool/read'
import {
  createTestContext,
  createTempDir,
  cleanupTempDir,
  createTestFile,
  generateLines,
} from '../helpers/context'

describe('ReadTool', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  it('should have correct metadata', () => {
    expect(ReadTool.id).toBe('read')
    expect(ReadTool.description).toContain('Reads a file')
  })

  it('should read a simple text file', async () => {
    const content = 'Hello, World!\nThis is a test file.'
    const filePath = await createTestFile(tempDir, 'test.txt', content)
    const ctx = createTestContext({ cwd: tempDir })

    const result = await ReadTool.execute({ filePath }, ctx)

    expect(result.title).toBe('test.txt')
    expect(result.output).toContain('Hello, World!')
    expect(result.output).toContain('This is a test file.')
    expect(result.metadata?.totalLines).toBe(2)
  })

  it('should handle relative paths', async () => {
    const content = 'Relative path test'
    await createTestFile(tempDir, 'relative.txt', content)
    const ctx = createTestContext({ cwd: tempDir })

    const result = await ReadTool.execute({ filePath: 'relative.txt' }, ctx)

    expect(result.output).toContain('Relative path test')
  })

  it('should add line numbers to output', async () => {
    const content = 'Line 1\nLine 2\nLine 3'
    const filePath = await createTestFile(tempDir, 'numbered.txt', content)
    const ctx = createTestContext({ cwd: tempDir })

    const result = await ReadTool.execute({ filePath }, ctx)

    expect(result.output).toMatch(/\s+1\tLine 1/)
    expect(result.output).toMatch(/\s+2\tLine 2/)
    expect(result.output).toMatch(/\s+3\tLine 3/)
  })

  it('should respect offset parameter', async () => {
    const content = generateLines(10)
    const filePath = await createTestFile(tempDir, 'offset.txt', content)
    const ctx = createTestContext({ cwd: tempDir })

    const result = await ReadTool.execute({ filePath, offset: 5 }, ctx)

    // Check line numbers in output format (e.g., "    6\tLine 6")
    expect(result.output).toMatch(/\s+6\tLine 6/)
    expect(result.output).toMatch(/\s+10\tLine 10/)
    // Lines 1-5 should not appear (check line number prefix)
    expect(result.output).not.toMatch(/\s+1\tLine 1\n/)
    expect(result.output).not.toMatch(/\s+5\tLine 5/)
  })

  it('should respect limit parameter', async () => {
    const content = generateLines(100)
    const filePath = await createTestFile(tempDir, 'limit.txt', content)
    const ctx = createTestContext({ cwd: tempDir })

    const result = await ReadTool.execute({ filePath, limit: 5 }, ctx)

    expect(result.output).toContain('Line 1')
    expect(result.output).toContain('Line 5')
    expect(result.output).not.toContain('Line 6')
    expect(result.metadata?.linesRead).toBe(5)
    expect(result.metadata?.truncated).toBe(true)
  })

  it('should throw error for non-existent file', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const filePath = path.join(tempDir, 'nonexistent.txt')

    await expect(ReadTool.execute({ filePath }, ctx)).rejects.toThrow('File not found')
  })

  it('should throw error for directory path', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    await expect(ReadTool.execute({ filePath: tempDir }, ctx)).rejects.toThrow(
      'Path is a directory'
    )
  })

  it('should throw error for binary files', async () => {
    // Create a file with binary extension
    const filePath = await createTestFile(tempDir, 'test.exe', 'binary content')
    const ctx = createTestContext({ cwd: tempDir })

    await expect(ReadTool.execute({ filePath }, ctx)).rejects.toThrow('Cannot read binary file')
  })

  it('should truncate very long lines', async () => {
    const longLine = 'x'.repeat(3000)
    const filePath = await createTestFile(tempDir, 'long.txt', longLine)
    const ctx = createTestContext({ cwd: tempDir })

    const result = await ReadTool.execute({ filePath }, ctx)

    expect(result.output).toContain('...')
    expect(result.output.length).toBeLessThan(longLine.length + 500)
  })
})
