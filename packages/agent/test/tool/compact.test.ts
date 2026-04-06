import { describe, it, expect } from 'vitest'
import {
  CompactTool,
  type CompactMeta,
} from '../../src/tool/compact'
import { createTestContext } from '../helpers/context'

describe('CompactTool', () => {
  it('should have correct metadata', () => {
    expect(CompactTool.id).toBe('compact')
    expect(CompactTool.description).toContain('Compress conversation context')
  })

  it('returns error when context is not available', async () => {
    const ctx = createTestContext()
    const result = await CompactTool.execute({ reason: 'test' }, ctx)
    expect(result.isError).toBe(true)
    expect(result.output).toContain('not available')
  })

  it('reports no compaction needed when tokens are within limit', async () => {
    const mockSession = { messages: [] } as any
    const ctx = createTestContext({
      meta: {
        session: mockSession,
        summarizer: async (text: string) => 'summary',
        autoCompact: async () => false, // 不需要压缩
        estimateTokens: () => 1000,
      } satisfies CompactMeta,
    })

    const result = await CompactTool.execute({}, ctx)
    expect(result.output).toContain('within limits')
    expect(result.output).toContain('1000')
  })

  it('performs compaction and reports token reduction', async () => {
    let callCount = 0
    const mockSession = { messages: [] } as any
    const ctx = createTestContext({
      meta: {
        session: mockSession,
        summarizer: async (text: string) => 'summary of: ' + text,
        autoCompact: async () => true, // 执行压缩
        estimateTokens: () => {
          callCount++
          return callCount === 1 ? 5000 : 1500 // before -> after
        },
      } satisfies CompactMeta,
    })

    const result = await CompactTool.execute({ reason: 'too long' }, ctx)
    expect(result.output).toContain('5000')
    expect(result.output).toContain('1500')
    expect(result.output).toContain('too long')
  })
})
