import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isBinaryFile, generateDiff } from '../../src/tool/file-utils'
import {
  createTempDir,
  cleanupTempDir,
  createTestFile,
} from '../helpers/context'
import { join } from 'node:path'

describe('file-utils', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  // ── isBinaryFile ──

  describe('isBinaryFile', () => {
    it('detects binary extension', async () => {
      const filePath = await createTestFile(tempDir, 'image.png', 'fake png data')
      expect(await isBinaryFile(filePath)).toBe(true)
    })

    it('detects text file as non-binary', async () => {
      const filePath = await createTestFile(tempDir, 'code.ts', 'const x = 1;\n')
      expect(await isBinaryFile(filePath)).toBe(false)
    })

    it('detects NULL bytes as binary', async () => {
      const filePath = join(tempDir, 'nullbytes.dat')
      const { writeFile } = await import('node:fs/promises')
      await writeFile(filePath, Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6f]))
      expect(await isBinaryFile(filePath)).toBe(true)
    })

    it('returns false for empty file', async () => {
      const filePath = await createTestFile(tempDir, 'empty.txt', '')
      expect(await isBinaryFile(filePath)).toBe(false)
    })

    it('returns false for non-existent file', async () => {
      expect(await isBinaryFile(join(tempDir, 'nope.txt'))).toBe(false)
    })
  })

  // ── generateDiff ──

  describe('generateDiff', () => {
    it('generates diff for single line change', () => {
      const old = 'line1\nline2\nline3'
      const newContent = 'line1\nmodified\nline3'
      const diff = generateDiff(old, newContent, 'test.ts')

      expect(diff).toContain('--- test.ts')
      expect(diff).toContain('+++ test.ts')
      expect(diff).toContain('-line2')
      expect(diff).toContain('+modified')
    })

    it('generates diff for added lines', () => {
      const old = 'a\nb'
      const newContent = 'a\nb\nc\nd'
      const diff = generateDiff(old, newContent, 'file.txt')

      expect(diff).toContain('+c')
      expect(diff).toContain('+d')
    })

    it('returns empty body for identical content', () => {
      const content = 'same\ncontent'
      const diff = generateDiff(content, content, 'same.ts')
      expect(diff).toBe('(no changes)')
    })
  })
})
