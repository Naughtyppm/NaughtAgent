/**
 * StatusIndicator 组件单元测试
 *
 * 测试增强后的 StatusIndicator 组件，验证：
 * - 基本状态渲染（idle、thinking、executing、waiting）
 * - 步骤计数和 Token 使用量显示
 * - 多子 Agent 摘要显示 (Requirements 5.4)
 * - 活跃子 Agent 列表优化
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { StatusIndicator } from '../../../../src/cli/ink/components/StatusIndicator.js'
import type { ActiveSubAgentSummary } from '../../../../src/cli/ink/types.js'

// 模拟 @inkjs/ui 的 Spinner 组件，避免测试环境中的动画问题
vi.mock('@inkjs/ui', () => ({
  Spinner: () => React.createElement('ink-text', null, '⏳'),
}))

describe('StatusIndicator', () => {
  // ========================================================================
  // 基本状态渲染测试
  // ========================================================================
  describe('基本状态渲染', () => {
    it('idle 状态不应该渲染任何内容', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, { status: 'idle' })
      )
      expect(lastFrame()).toBe('')
    })

    it('thinking 状态应该显示思考中文本', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, { status: 'thinking' })
      )
      const frame = lastFrame()!
      expect(frame).toContain('思考中...')
      expect(frame).toContain('🤔')
    })

    it('executing 状态应该显示执行中文本', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'executing',
          message: '读取文件',
          detail: 'index.ts',
        })
      )
      const frame = lastFrame()!
      expect(frame).toContain('读取文件')
      expect(frame).toContain('index.ts')
      expect(frame).toContain('⚡')
    })

    it('waiting 状态应该显示等待中文本', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, { status: 'waiting' })
      )
      const frame = lastFrame()!
      expect(frame).toContain('等待中...')
      expect(frame).toContain('⏳')
    })
  })

  // ========================================================================
  // 步骤计数和 Token 显示测试
  // ========================================================================
  describe('步骤计数和 Token 显示', () => {
    it('应该显示步骤计数', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'executing',
          stepCurrent: 3,
          stepTotal: 10,
        })
      )
      const frame = lastFrame()!
      expect(frame).toContain('[3/10]')
    })

    it('没有 stepTotal 时应该显示步骤编号', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'executing',
          stepCurrent: 5,
        })
      )
      const frame = lastFrame()!
      expect(frame).toContain('[步骤 5]')
    })

    it('应该显示 Token 使用量', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'thinking',
          tokenUsage: { input: 1500, output: 800 },
        })
      )
      const frame = lastFrame()!
      expect(frame).toContain('📊')
      expect(frame).toContain('1.5k↓')
      expect(frame).toContain('800↑')
    })
  })

  // ========================================================================
  // 多子 Agent 摘要显示测试 (Requirements 5.4)
  // ========================================================================
  describe('多子 Agent 摘要显示 (Requirements 5.4)', () => {
    it('当有多个活跃子 Agent 时应该显示摘要', () => {
      const agents: ActiveSubAgentSummary[] = [
        {
          id: 'sa-1',
          mode: 'run_agent',
          agentType: 'explore',
          status: 'running',
          currentStep: 2,
          maxSteps: 10,
        },
        {
          id: 'sa-2',
          mode: 'parallel_agents',
          agentType: 'build',
          status: 'running',
          currentStep: 5,
          maxSteps: 8,
        },
      ]
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'executing',
          activeSubAgents: agents,
        })
      )
      const frame = lastFrame()!
      // 应该显示子 Agent 摘要标题和总数
      expect(frame).toContain('子 Agent')
      expect(frame).toContain('×2')
      // 应该显示运行中的数量
      expect(frame).toContain('◐2')
    })

    it('应该显示每个子 Agent 的模式和进度', () => {
      const agents: ActiveSubAgentSummary[] = [
        {
          id: 'sa-1',
          mode: 'run_agent',
          agentType: 'explore',
          status: 'running',
          currentStep: 3,
          maxSteps: 10,
        },
      ]
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'executing',
          activeSubAgents: agents,
        })
      )
      const frame = lastFrame()!
      // 应该显示模式简称
      expect(frame).toContain('独立')
      // 应该显示 agentType
      expect(frame).toContain('explore')
      // 应该显示进度
      expect(frame).toContain('3/10')
    })

    it('应该显示各状态的统计数量', () => {
      const agents: ActiveSubAgentSummary[] = [
        { id: 'sa-1', mode: 'run_agent', agentType: 'explore', status: 'running', currentStep: 2, maxSteps: 10 },
        { id: 'sa-2', mode: 'parallel_agents', agentType: 'build', status: 'completed', currentStep: 8, maxSteps: 8 },
        { id: 'sa-3', mode: 'ask_llm', agentType: 'plan', status: 'error', currentStep: 3, maxSteps: 5 },
      ]
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'executing',
          activeSubAgents: agents,
        })
      )
      const frame = lastFrame()!
      expect(frame).toContain('×3')
      expect(frame).toContain('◐1')  // 1 running
      expect(frame).toContain('✓1')  // 1 completed
      expect(frame).toContain('✗1')  // 1 error
    })

    it('没有活跃子 Agent 时不应该显示摘要', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'executing',
          activeSubAgents: [],
        })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('子 Agent')
      expect(frame).not.toContain('×')
    })

    it('activeSubAgents 为 undefined 时不应该显示摘要', () => {
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'executing',
        })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('子 Agent')
    })

    it('idle 状态但有活跃子 Agent 时应该显示摘要', () => {
      const agents: ActiveSubAgentSummary[] = [
        { id: 'sa-1', mode: 'run_agent', agentType: 'explore', status: 'running', currentStep: 1, maxSteps: 5 },
      ]
      const { lastFrame } = render(
        React.createElement(StatusIndicator, {
          status: 'idle',
          activeSubAgents: agents,
        })
      )
      const frame = lastFrame()!
      // idle 但有子 Agent 时仍应渲染
      expect(frame).toContain('子 Agent')
      expect(frame).toContain('×1')
    })

    it('应该显示不同模式的简短名称', () => {
      const modes: Array<{ mode: ActiveSubAgentSummary['mode']; expected: string }> = [
        { mode: 'run_agent', expected: '独立' },
        { mode: 'fork_agent', expected: '分叉' },
        { mode: 'parallel_agents', expected: '并行' },
        { mode: 'multi_agent', expected: '多角色' },
        { mode: 'run_workflow', expected: '工作流' },
        { mode: 'ask_llm', expected: 'LLM' },
      ]
      for (const { mode, expected } of modes) {
        const agents: ActiveSubAgentSummary[] = [
          { id: 'sa-1', mode, agentType: 'test', status: 'running', currentStep: 1, maxSteps: 5 },
        ]
        const { lastFrame } = render(
          React.createElement(StatusIndicator, {
            status: 'executing',
            activeSubAgents: agents,
          })
        )
        expect(lastFrame()!).toContain(expected)
      }
    })
  })
})
