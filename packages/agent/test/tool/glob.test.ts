import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import { GlobTool } from '../../src/tool/glob'
import {
  createTestContext,
  createTempDir,
  cleanupTempDir,
  createTestFile,
} from '../helpers/context'

describe('GlobTool', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  it('should have correct metadata', () => {
    expect(GlobTool.id).toBe('glob')
    expect(GlobTool.description).toContain('file pattern matching')
  })

  it('should find files matching pattern', async () => {
    await createTestFile(tempDir, 'file1.ts', 'content1')
    await createTestFile(tempDir, 'file2.ts', 'content2')
    await createTestFile(tempDir, 'file3.js', 'content3')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GlobTool.execute({ pattern: '*.ts' }, ctx)

    expect(result.output).toContain('file1.ts')
    expect(result.output).toContain('file2.ts')
    expect(result.output).not.toContain('file3.js')
    expect(result.metadata?.count).toBe(2)
  })

  it('should search recursively with ** pattern', async () => {
    await createTestFile(tempDir, 'root.ts', 'root')
    await createTestFile(tempDir, 'src/nested.ts', 'nested')
    await createTestFile(tempDir, 'src/deep/deeper.ts', 'deeper')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GlobTool.execute({ pattern: '**/*.ts' }, ctx)

    expect(result.output).toContain('root.ts')
    expect(result.output).toContain('nested.ts')
    expect(result.output).toContain('deeper.ts')
    expect(result.metadata?.count).toBe(3)
  })

  it('should search in specified path', async () => {
    await createTestFile(tempDir, 'root.ts', 'root')
    await createTestFile(tempDir, 'src/nested.ts', 'nested')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GlobTool.execute({
      pattern: '*.ts',
      path: path.join(tempDir, 'src'),
    }, ctx)

    expect(result.output).toContain('nested.ts')
    expect(result.output).not.toContain('root.ts')
    expect(result.metadata?.count).toBe(1)
  })

  it('should handle relative path parameter', async () => {
    await createTestFile(tempDir, 'src/file.ts', 'content')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GlobTool.execute({
      pattern: '*.ts',
      path: 'src',
    }, ctx)

    expect(result.output).toContain('file.ts')
  })

  it('should return message when no files found', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GlobTool.execute({ pattern: '*.nonexistent' }, ctx)

    expect(result.output).toContain('No files found')
    expect(result.metadata?.count).toBe(0)
  })

  it('should ignore node_modules by default', async () => {
    await createTestFile(tempDir, 'src/app.ts', 'app')
    await createTestFile(tempDir, 'node_modules/pkg/index.ts', 'pkg')
    const ctx = createTestContext({ cwd: tempDir })

    const result = await GlobTool.execute({ pattern: '**/*.ts' }, ctx)

    expect(result.output).toContain('app.ts')
    expect(result.output).not.toContain('node_modules')
    expect(result.metadata?.count).toBe(1)
  })
})
