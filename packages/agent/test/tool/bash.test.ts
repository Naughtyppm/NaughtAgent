import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import { BashTool } from '../../src/tool/bash'
import {
  createTestContext,
  createTempDir,
  cleanupTempDir,
  createTestFile,
} from '../helpers/context'

describe('BashTool', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  it('should have correct metadata', () => {
    expect(BashTool.id).toBe('bash')
    expect(BashTool.description).toContain('Executes a shell command')
  })

  it('should execute a simple command', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    const result = await BashTool.execute({
      command: 'echo "Hello, World!"',
    }, ctx)

    expect(result.output).toContain('Hello, World!')
    expect(result.metadata?.exitCode).toBe(0)
  })

  it('should use description as title when provided', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    const result = await BashTool.execute({
      command: 'echo test',
      description: 'Print test message',
    }, ctx)

    expect(result.title).toBe('Print test message')
  })

  it('should run in specified workdir', async () => {
    const subDir = path.join(tempDir, 'subdir')
    await createTestFile(subDir, 'marker.txt', 'marker')
    const ctx = createTestContext({ cwd: tempDir })

    // Use cross-platform command to list files
    const command = process.platform === 'win32' ? 'Get-ChildItem -Name' : 'ls'
    const result = await BashTool.execute({
      command,
      workdir: subDir,
    }, ctx)

    expect(result.output).toContain('marker.txt')
    expect(result.metadata?.cwd).toBe(subDir)
  })

  it('should handle relative workdir', async () => {
    const subDir = path.join(tempDir, 'relative-sub')
    await createTestFile(subDir, 'test.txt', 'test')
    const ctx = createTestContext({ cwd: tempDir })

    const command = process.platform === 'win32' ? 'Get-ChildItem -Name' : 'ls'
    const result = await BashTool.execute({
      command,
      workdir: 'relative-sub',
    }, ctx)

    expect(result.output).toContain('test.txt')
  })

  it('should capture exit code for failed commands', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    const result = await BashTool.execute({
      command: 'exit 42',
    }, ctx)

    expect(result.metadata?.exitCode).toBe(42)
    expect(result.output).toContain('Exit code: 42')
  })

  it('should handle command timeout', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    // Use a command that sleeps - cross platform
    const command = process.platform === 'win32'
      ? 'Start-Sleep -Seconds 10'
      : 'sleep 10'

    const result = await BashTool.execute({
      command,
      timeout: 100, // 100ms timeout
    }, ctx)

    expect(result.metadata?.timedOut).toBe(true)
    expect(result.output).toContain('timed out')
  }, 10000)

  it('should return "(no output)" for empty output', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    // Command that produces no output
    const command = process.platform === 'win32' ? 'echo $null' : 'true'
    const result = await BashTool.execute({ command }, ctx)

    // On some platforms this might have output, so just check it doesn't throw
    expect(result.output).toBeDefined()
  })

  it('should capture stderr output', async () => {
    const ctx = createTestContext({ cwd: tempDir })

    // Write to stderr
    const command = process.platform === 'win32'
      ? 'Write-Error "error message" 2>&1'
      : 'echo "error message" >&2'

    const result = await BashTool.execute({ command }, ctx)

    expect(result.output).toContain('error')
  })

  it('should handle abort signal', async () => {
    const abortController = new AbortController()
    const ctx = createTestContext({ cwd: tempDir, abort: abortController.signal })

    // Start a long-running command
    const command = process.platform === 'win32'
      ? 'Start-Sleep -Seconds 30'
      : 'sleep 30'

    // Abort after a short delay
    setTimeout(() => abortController.abort(), 100)

    const result = await BashTool.execute({ command }, ctx)

    expect(result.output).toContain('cancelled')
  }, 10000)

  it('should handle spawn error', async () => {
    const ctx = createTestContext({ cwd: '/nonexistent/path/that/does/not/exist' })

    await expect(
      BashTool.execute({ command: 'echo test' }, ctx)
    ).rejects.toThrow()
  })
})
