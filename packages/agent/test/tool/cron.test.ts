import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  clearAllCronJobs,
  stopCronScheduler,
} from '../../src/tool/cron'
import { createTestContext, createTempDir, cleanupTempDir } from '../helpers/context'

describe('CronTools', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
    clearAllCronJobs()
  })

  afterEach(async () => {
    stopCronScheduler()
    clearAllCronJobs()
    await cleanupTempDir(tempDir)
  })

  // ── CronCreate ──

  it('cron_create: should have correct metadata', () => {
    expect(CronCreateTool.id).toBe('cron_create')
  })

  it('cron_create: creates a recurring job', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await CronCreateTool.execute(
      { cron: '*/5 * * * *', prompt: 'check logs', recurring: true },
      ctx,
    )
    expect(result.output).toContain('recurring')
    expect(result.output).toContain('*/5 * * * *')
    expect(result.metadata?.jobId).toBeTruthy()
  })

  it('cron_create: creates a one-shot job', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await CronCreateTool.execute(
      { cron: '30 14 28 2 *', prompt: 'reminder', recurring: false },
      ctx,
    )
    expect(result.output).toContain('one-shot')
    expect(result.metadata?.recurring).toBe(false)
  })

  it('cron_create: rejects invalid cron expression', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await CronCreateTool.execute(
      { cron: 'not a cron', prompt: 'test', recurring: true },
      ctx,
    )
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Error')
  })

  it('cron_create: rejects cron with wrong field count', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await CronCreateTool.execute(
      { cron: '* * *', prompt: 'test', recurring: true },
      ctx,
    )
    expect(result.isError).toBe(true)
    expect(result.output).toContain('5')
  })

  // ── CronDelete ──

  it('cron_delete: deletes an existing job', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const created = await CronCreateTool.execute(
      { cron: '0 * * * *', prompt: 'hourly', recurring: true },
      ctx,
    )
    const jobId = created.metadata?.jobId as string

    const result = await CronDeleteTool.execute({ id: jobId }, ctx)
    expect(result.output).toContain('deleted')
  })

  it('cron_delete: error for non-existent job', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await CronDeleteTool.execute({ id: 'fake-id' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('No cron job found')
  })

  // ── CronList ──

  it('cron_list: returns empty list when no jobs', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    const result = await CronListTool.execute({}, ctx)
    expect(result.output).toContain('No cron jobs')
  })

  it('cron_list: lists created jobs', async () => {
    const ctx = createTestContext({ cwd: tempDir })
    await CronCreateTool.execute(
      { cron: '0 9 * * 1-5', prompt: 'weekday', recurring: true },
      ctx,
    )
    await CronCreateTool.execute(
      { cron: '0 0 1 * *', prompt: 'monthly', recurring: true },
      ctx,
    )

    const result = await CronListTool.execute({}, ctx)
    expect(result.output).toContain('weekday')
    expect(result.output).toContain('monthly')
    expect(result.metadata?.count).toBe(2)
  })
})
