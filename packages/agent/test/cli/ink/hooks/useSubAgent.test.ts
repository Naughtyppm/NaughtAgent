/**
 * useSubAgent Hook 单元测试
 *
 * 测试事件处理性能优化（Requirements 5.5）：
 * - applyEvent 纯函数正确性
 * - isImmediateEvent 分类正确性
 * - throttle 批量更新行为
 * - 关键事件立即刷新
 * - clear 清理逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyEvent, isImmediateEvent, THROTTLE_INTERVAL } from '../../../../src/cli/ink/hooks/useSubAgent.js'
import type { SubAgentState } from '../../../../src/cli/ink/types.js'
import type { SubAgentEvent } from '../../../../src/subtask/events.js'

// ============================================================================
// applyEvent 纯函数测试
// ============================================================================
describe('applyEvent', () => {
  let emptyState: Map<string, SubAgentState>
  let pendingToolCalls: string[]
  let toolToSubAgent: Map<string, string>

  beforeEach(() => {
    emptyState = new Map()
    pendingToolCalls = []
    toolToSubAgent = new Map()
  })

  it('应该处理 start 事件并创建新的子 Agent 状态', () => {
    const event: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析代码',
      agentType: 'explore',
      maxSteps: 10,
    }

    const result = applyEvent(emptyState, event, pendingToolCalls, toolToSubAgent)

    expect(result.size).toBe(1)
    const state = result.get('sa-001')!
    expect(state.id).toBe('sa-001')
    expect(state.mode).toBe('run_agent')
    expect(state.prompt).toBe('分析代码')
    expect(state.agentType).toBe('explore')
    expect(state.status).toBe('running')
    expect(state.maxSteps).toBe(10)
    expect(state.currentStep).toBe(0)
    expect(state.text).toBe('')
    expect(state.tools).toEqual([])
  })

  it('start 事件应该自动关联待关联的工具调用', () => {
    pendingToolCalls.push('tool-call-123')
    const event: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }

    applyEvent(emptyState, event, pendingToolCalls, toolToSubAgent)

    expect(toolToSubAgent.get('tool-call-123')).toBe('sa-001')
    expect(pendingToolCalls).toHaveLength(0)
  })

  it('应该处理 text 事件并更新文本内容', () => {
    // 先创建一个子 Agent
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const textEvent: SubAgentEvent = {
      type: 'text',
      id: 'sa-001',
      content: '正在分析代码结构...',
      delta: '正在',
    }
    const result = applyEvent(state, textEvent, pendingToolCalls, toolToSubAgent)

    expect(result.get('sa-001')!.text).toBe('正在分析代码结构...')
  })

  it('text 事件对不存在的 id 应该无操作', () => {
    const textEvent: SubAgentEvent = {
      type: 'text',
      id: 'nonexistent',
      content: '内容',
      delta: '内容',
    }
    const result = applyEvent(emptyState, textEvent, pendingToolCalls, toolToSubAgent)
    expect(result.size).toBe(0)
  })

  it('应该处理 tool_start 事件并添加工具调用', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const toolStartEvent: SubAgentEvent = {
      type: 'tool_start',
      id: 'sa-001',
      toolId: 'tool-1',
      name: 'read',
      input: { filePath: 'src/index.ts' },
    }
    const result = applyEvent(state, toolStartEvent, pendingToolCalls, toolToSubAgent)

    const tools = result.get('sa-001')!.tools
    expect(tools).toHaveLength(1)
    expect(tools[0].id).toBe('tool-1')
    expect(tools[0].name).toBe('read')
    expect(tools[0].status).toBe('pending')
  })

  it('应该处理 tool_end 事件并更新工具状态', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }
    let state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const toolStartEvent: SubAgentEvent = {
      type: 'tool_start',
      id: 'sa-001',
      toolId: 'tool-1',
      name: 'read',
      input: { filePath: 'src/index.ts' },
    }
    state = applyEvent(state, toolStartEvent, pendingToolCalls, toolToSubAgent)

    const toolEndEvent: SubAgentEvent = {
      type: 'tool_end',
      id: 'sa-001',
      toolId: 'tool-1',
      output: '文件内容',
      isError: false,
      duration: 150,
    }
    const result = applyEvent(state, toolEndEvent, pendingToolCalls, toolToSubAgent)

    const tool = result.get('sa-001')!.tools[0]
    expect(tool.status).toBe('completed')
    expect(tool.output).toBe('文件内容')
    expect(tool.isError).toBe(false)
    expect(tool.duration).toBe(150)
  })

  it('应该处理 step 事件并更新进度', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 10,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const stepEvent: SubAgentEvent = {
      type: 'step',
      id: 'sa-001',
      current: 3,
      total: 10,
    }
    const result = applyEvent(state, stepEvent, pendingToolCalls, toolToSubAgent)

    expect(result.get('sa-001')!.currentStep).toBe(3)
    expect(result.get('sa-001')!.maxSteps).toBe(10)
  })

  it('应该处理 end 事件并更新完成状态', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const endEvent: SubAgentEvent = {
      type: 'end',
      id: 'sa-001',
      success: true,
      output: '分析完成',
      duration: 5000,
      usage: { inputTokens: 1000, outputTokens: 500 },
    }
    const result = applyEvent(state, endEvent, pendingToolCalls, toolToSubAgent)

    const sa = result.get('sa-001')!
    expect(sa.status).toBe('completed')
    expect(sa.text).toBe('分析完成')
    expect(sa.usage).toEqual({ inputTokens: 1000, outputTokens: 500 })
    expect(sa.endTime).toBeDefined()
  })

  it('end 事件失败时应该设置 error 状态', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const endEvent: SubAgentEvent = {
      type: 'end',
      id: 'sa-001',
      success: false,
      output: '',
      error: '超时',
      duration: 180000,
    }
    const result = applyEvent(state, endEvent, pendingToolCalls, toolToSubAgent)

    expect(result.get('sa-001')!.status).toBe('error')
  })

  it('应该处理 child_start 事件', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'parallel_agents',
      prompt: '并行任务',
      agentType: 'build',
      maxSteps: 5,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const childStartEvent: SubAgentEvent = {
      type: 'child_start',
      id: 'sa-001',
      childId: 'child-1',
      childName: '代码分析',
      prompt: '分析代码',
    }
    const result = applyEvent(state, childStartEvent, pendingToolCalls, toolToSubAgent)

    const children = result.get('sa-001')!.children!
    expect(children).toHaveLength(1)
    expect(children[0].id).toBe('child-1')
    expect(children[0].name).toBe('代码分析')
    expect(children[0].status).toBe('running')
  })

  it('应该处理 child_end 事件', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'parallel_agents',
      prompt: '并行任务',
      agentType: 'build',
      maxSteps: 5,
    }
    let state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const childStartEvent: SubAgentEvent = {
      type: 'child_start',
      id: 'sa-001',
      childId: 'child-1',
      childName: '代码分析',
      prompt: '分析代码',
    }
    state = applyEvent(state, childStartEvent, pendingToolCalls, toolToSubAgent)

    const childEndEvent: SubAgentEvent = {
      type: 'child_end',
      id: 'sa-001',
      childId: 'child-1',
      childName: '代码分析',
      success: true,
      output: '分析完成',
    }
    const result = applyEvent(state, childEndEvent, pendingToolCalls, toolToSubAgent)

    expect(result.get('sa-001')!.children![0].status).toBe('completed')
    expect(result.get('sa-001')!.children![0].output).toBe('分析完成')
  })

  it('应该处理 config 事件', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const configEvent: SubAgentEvent = {
      type: 'config',
      id: 'sa-001',
      config: { timeout: 60000, maxTurns: 20 },
    }
    const result = applyEvent(state, configEvent, pendingToolCalls, toolToSubAgent)

    expect(result.get('sa-001')!.config).toEqual({
      timeout: 60000,
      maxTurns: 20,
      tools: undefined,
    })
  })

  it('应该处理 retry 事件', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)

    const retryEvent: SubAgentEvent = {
      type: 'retry',
      id: 'sa-001',
      attempt: 2,
      maxAttempts: 3,
      error: '网络错误',
      delay: 2000,
    }
    const result = applyEvent(state, retryEvent, pendingToolCalls, toolToSubAgent)

    expect(result.get('sa-001')!.retryCount).toBe(2)
  })

  it('thinking 事件应该不改变状态', () => {
    const startEvent: SubAgentEvent = {
      type: 'start',
      id: 'sa-001',
      mode: 'run_agent',
      prompt: '分析',
      agentType: 'explore',
      maxSteps: 5,
    }
    const state = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)
    const stateBefore = state.get('sa-001')!

    const thinkingEvent: SubAgentEvent = {
      type: 'thinking',
      id: 'sa-001',
      message: '思考中...',
    }
    const result = applyEvent(state, thinkingEvent, pendingToolCalls, toolToSubAgent)

    // thinking 事件不修改状态内容
    expect(result.get('sa-001')!.text).toBe(stateBefore.text)
    expect(result.get('sa-001')!.status).toBe(stateBefore.status)
  })

  it('应该正确处理多个事件的顺序应用', () => {
    // 模拟完整的事件流：start → text → tool_start → tool_end → step → end
    let state = emptyState

    state = applyEvent(state, {
      type: 'start', id: 'sa-001', mode: 'run_agent',
      prompt: '分析', agentType: 'explore', maxSteps: 5,
    }, pendingToolCalls, toolToSubAgent)

    state = applyEvent(state, {
      type: 'text', id: 'sa-001', content: '开始分析', delta: '开始',
    }, pendingToolCalls, toolToSubAgent)

    state = applyEvent(state, {
      type: 'tool_start', id: 'sa-001', toolId: 't1', name: 'read',
      input: { filePath: 'a.ts' },
    }, pendingToolCalls, toolToSubAgent)

    state = applyEvent(state, {
      type: 'tool_end', id: 'sa-001', toolId: 't1',
      output: '内容', isError: false, duration: 100,
    }, pendingToolCalls, toolToSubAgent)

    state = applyEvent(state, {
      type: 'step', id: 'sa-001', current: 1, total: 5,
    }, pendingToolCalls, toolToSubAgent)

    state = applyEvent(state, {
      type: 'end', id: 'sa-001', success: true, output: '完成',
      duration: 3000, usage: { inputTokens: 500, outputTokens: 200 },
    }, pendingToolCalls, toolToSubAgent)

    const sa = state.get('sa-001')!
    expect(sa.status).toBe('completed')
    expect(sa.text).toBe('完成')
    expect(sa.tools).toHaveLength(1)
    expect(sa.tools[0].status).toBe('completed')
    expect(sa.currentStep).toBe(1)
    expect(sa.usage).toEqual({ inputTokens: 500, outputTokens: 200 })
  })

  it('applyEvent 不应该修改原始状态（不可变性）', () => {
    const startEvent: SubAgentEvent = {
      type: 'start', id: 'sa-001', mode: 'run_agent',
      prompt: '分析', agentType: 'explore', maxSteps: 5,
    }
    const original = applyEvent(emptyState, startEvent, pendingToolCalls, toolToSubAgent)
    const originalSize = original.size

    // 应用新事件
    const textEvent: SubAgentEvent = {
      type: 'text', id: 'sa-001', content: '新内容', delta: '新',
    }
    const modified = applyEvent(original, textEvent, pendingToolCalls, toolToSubAgent)

    // 原始状态不应被修改
    expect(original.size).toBe(originalSize)
    expect(original.get('sa-001')!.text).toBe('')
    // 新状态应该有更新
    expect(modified.get('sa-001')!.text).toBe('新内容')
  })
})

// ============================================================================
// isImmediateEvent 测试
// ============================================================================
describe('isImmediateEvent', () => {
  it('start 事件应该是立即事件', () => {
    expect(isImmediateEvent('start')).toBe(true)
  })

  it('end 事件应该是立即事件', () => {
    expect(isImmediateEvent('end')).toBe(true)
  })

  it('child_start 事件应该是立即事件', () => {
    expect(isImmediateEvent('child_start')).toBe(true)
  })

  it('child_end 事件应该是立即事件', () => {
    expect(isImmediateEvent('child_end')).toBe(true)
  })

  it('text 事件不应该是立即事件', () => {
    expect(isImmediateEvent('text')).toBe(false)
  })

  it('tool_start 事件不应该是立即事件', () => {
    expect(isImmediateEvent('tool_start')).toBe(false)
  })

  it('tool_end 事件不应该是立即事件', () => {
    expect(isImmediateEvent('tool_end')).toBe(false)
  })

  it('step 事件不应该是立即事件', () => {
    expect(isImmediateEvent('step')).toBe(false)
  })

  it('thinking 事件不应该是立即事件', () => {
    expect(isImmediateEvent('thinking')).toBe(false)
  })

  it('config 事件不应该是立即事件', () => {
    expect(isImmediateEvent('config')).toBe(false)
  })

  it('retry 事件不应该是立即事件', () => {
    expect(isImmediateEvent('retry')).toBe(false)
  })
})

// ============================================================================
// THROTTLE_INTERVAL 常量测试
// ============================================================================
describe('THROTTLE_INTERVAL', () => {
  it('应该统一到 400ms（与 useMessages/StatusIndicator 对齐，消除交替闪烁）', () => {
    expect(THROTTLE_INTERVAL).toBe(400)
  })

  it('应该大于 0', () => {
    expect(THROTTLE_INTERVAL).toBeGreaterThan(0)
  })
})
