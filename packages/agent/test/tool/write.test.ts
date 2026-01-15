import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import { WriteTool } from '../../src/tool/write'
import {
  createTestContext,
  createTempDir,
  cleanupTempDir,
  createTestFile,
  readTestFile,
} from '../helpers/context'

describe('WriteTool', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  it('should have correct metadata', () => {
    expect(WriteTool.id).toBe('write')
    expect(WriteTool.description).toContain('Writes content to a file')
  })

  it('should create a new file', async () => {
    const filePath = path.join(tempDir, 'new-file.txt')
    const content = 'Hello, World!'
    const ctx = createTestContext({ cwd: tempDir })

    const result = await WriteTool.execute({ filePath, content }, ctx)

    expect(result.title).toBe('new-file.txt')
    expect(result.output).toContain('Created file')
    expect(result.metadata?.existed).toBe(false)

    const written = await readTestFile(filePath)
    expect(written).toBe(content)
  })

  it('should overwrite existing file', async () => {
    const filePath = await createTestFile(tempDir, 'existing.txt', 'old content')
    const newContent = 'new content'
    const ctx = createTestContext({ cwd: tempDir })

    const result = await WriteTool.execute({ filePath, content: newContent }, ctx)

    expect(result.output).toContain('Updated file')
    expect(result.metadata?.existed).toBe(true)

    const written = await readTestFile(filePath)
    expect(written).toBe(newContent)
  })

  it('should handle relative paths', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const content = 'Relative path content'

    await WriteTool.execute({ filePath: 'relative.txt', content }, ctx)

    const written = await readTestFile(path.join(tempDir, 'relative.txt'))
    expect(written).toBe(content)
  })

  it('should create parent directories automatically', async () => {
    const filePath = path.join(tempDir, 'nested', 'deep', 'file.txt')
    const content = 'Nested content'
    const ctx = createTestContext({ cwd: tempDir })

    await WriteTool.execute({ filePath, content }, ctx)

    const written = await readTestFile(filePath)
    expect(written).toBe(content)
  })

  it('should report correct line and byte counts', async () => {
    const filePath = path.join(tempDir, 'counted.txt')
    const content = 'Line 1\nLine 2\nLine 3'
    const ctx = createTestContext({ cwd: tempDir })

    const result = await WriteTool.execute({ filePath, content }, ctx)

    expect(result.metadata?.lines).toBe(3)
    expect(result.metadata?.bytes).toBe(Buffer.byteLength(content, 'utf-8'))
  })
})
