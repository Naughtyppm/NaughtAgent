import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import { EditTool } from '../../src/tool/edit'
import {
  createTestContext,
  createTempDir,
  cleanupTempDir,
  createTestFile,
  readTestFile,
} from '../helpers/context'

describe('EditTool', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  it('should have correct metadata', () => {
    expect(EditTool.id).toBe('edit')
    expect(EditTool.description).toContain('exact string replacements')
  })

  it('should replace a single occurrence', async () => {
    const filePath = await createTestFile(tempDir, 'edit.txt', 'Hello, World!')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await EditTool.execute({
      filePath,
      oldString: 'World',
      newString: 'Universe',
    }, ctx)

    expect(result.title).toBe('edit.txt')
    expect(result.metadata?.replacements).toBe(1)

    const content = await readTestFile(filePath)
    expect(content).toBe('Hello, Universe!')
  })

  it('should handle relative paths', async () => {
    await createTestFile(tempDir, 'relative-edit.txt', 'foo bar')
    const ctx = createTestContext({ cwd: tempDir })

    await EditTool.execute({
      filePath: 'relative-edit.txt',
      oldString: 'foo',
      newString: 'baz',
    }, ctx)

    const content = await readTestFile(path.join(tempDir, 'relative-edit.txt'))
    expect(content).toBe('baz bar')
  })

  it('should replace all occurrences with replaceAll flag', async () => {
    const filePath = await createTestFile(tempDir, 'multi.txt', 'foo foo foo')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await EditTool.execute({
      filePath,
      oldString: 'foo',
      newString: 'bar',
      replaceAll: true,
    }, ctx)

    expect(result.metadata?.replacements).toBe(3)

    const content = await readTestFile(filePath)
    expect(content).toBe('bar bar bar')
  })

  it('should throw error when oldString not found', async () => {
    const filePath = await createTestFile(tempDir, 'notfound.txt', 'Hello, World!')
    const ctx = createTestContext({ cwd: tempDir })

    await expect(
      EditTool.execute({
        filePath,
        oldString: 'NotFound',
        newString: 'Replacement',
      }, ctx)
    ).rejects.toThrow('oldString not found')
  })

  it('should throw error when multiple matches without replaceAll', async () => {
    const filePath = await createTestFile(tempDir, 'multi-error.txt', 'foo foo')
    const ctx = createTestContext({ cwd: tempDir })

    await expect(
      EditTool.execute({
        filePath,
        oldString: 'foo',
        newString: 'bar',
      }, ctx)
    ).rejects.toThrow('found multiple times')
  })

  it('should throw error when oldString equals newString', async () => {
    const filePath = await createTestFile(tempDir, 'same.txt', 'Hello')
    const ctx = createTestContext({ cwd: tempDir })

    await expect(
      EditTool.execute({
        filePath,
        oldString: 'Hello',
        newString: 'Hello',
      }, ctx)
    ).rejects.toThrow('must be different')
  })

  it('should throw error for non-existent file', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    await expect(
      EditTool.execute({
        filePath: path.join(tempDir, 'nonexistent.txt'),
        oldString: 'foo',
        newString: 'bar',
      }, ctx)
    ).rejects.toThrow('File not found')
  })

  it('should generate diff in output', async () => {
    const filePath = await createTestFile(tempDir, 'diff.txt', 'old line')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await EditTool.execute({
      filePath,
      oldString: 'old',
      newString: 'new',
    }, ctx)

    expect(result.output).toContain('-old line')
    expect(result.output).toContain('+new line')
  })
})
