import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryTool } from '../../src/tool/memory'
import {
  createTestContext,
  createTempDir,
  cleanupTempDir,
  readTestFile,
} from '../helpers/context'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

describe('MemoryTool', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  it('should have correct metadata', () => {
    expect(MemoryTool.id).toBe('memory')
    expect(MemoryTool.description).toContain('Persistent memory')
  })

  // ── read ──

  it('read: returns message when no memory file exists', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await MemoryTool.execute({ action: 'read' }, ctx)
    expect(result.output).toContain('No memory file found')
    expect(result.title).toBe('memory read')
  })

  // ── write ──

  it('write: requires content', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await MemoryTool.execute({ action: 'write' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('content is required')
  })

  it('write: creates .naughty directory and memory file', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await MemoryTool.execute(
      { action: 'write', content: 'Hello memory' },
      ctx,
    )
    expect(result.title).toBe('memory write')
    expect(result.output).toContain('12 chars')

    const content = await readTestFile(join(tempDir, '.naughty', 'memory.md'))
    expect(content).toBe('Hello memory')
  })

  // ── append ──

  it('append: creates file with header when none exists', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await MemoryTool.execute(
      { action: 'append', content: 'First entry' },
      ctx,
    )
    expect(result.title).toBe('memory append')

    const content = await readTestFile(join(tempDir, '.naughty', 'memory.md'))
    expect(content).toContain('# Project Memory')
    expect(content).toContain('First entry')
  })

  it('append: appends to existing memory', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    await MemoryTool.execute({ action: 'write', content: '# Memory\n\nEntry 1' }, ctx)
    await MemoryTool.execute({ action: 'append', content: 'Entry 2' }, ctx)

    const content = await readTestFile(join(tempDir, '.naughty', 'memory.md'))
    expect(content).toContain('Entry 1')
    expect(content).toContain('Entry 2')
  })

  // ── read after write ──

  it('read: returns written content', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    await MemoryTool.execute({ action: 'write', content: 'Saved data' }, ctx)

    const result = await MemoryTool.execute({ action: 'read' }, ctx)
    expect(result.output).toBe('Saved data')
  })
})
