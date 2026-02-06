/**
 * SubAgentPanel 组件单元测试
 *
 * 测试增强后的 SubAgentPanel 组件，验证：
 * - 基本渲染（头部、任务描述、进度条）
 * - 重试计数显示
 * - 配置信息显示（timeout、maxTurns）
 * - 工具调用列表显示（Requirements 5.2）
 * - 子任务状态显示（Requirements 5.3）
 * - Token 使用量显示
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { SubAgentPanel } from '../../../../src/cli/ink/components/SubAgentPanel.js'
import type { SubAgentState } from '../../../../src/cli/ink/types.js'

// 模拟 @inkjs/ui 的 Spinner 组件，避免测试环境中的动画问题
vi.mock('@inkjs/ui', () => ({
  Spinner: () => React.createElement('ink-text', null, '⏳'),
}))

/**
 * 创建基础子 Agent 状态（用于测试）
 */
function createBaseState(overrides?: Partial<SubAgentState>): SubAgentState {
  return {
    id: 'sa-test-001',
    mode: 'run_agent',
    prompt: '分析代码结构',
    agentType: 'explore',
    status: 'running',
    text: '',
    tools: [],
    children: [],
    currentStep: 2,
    maxSteps: 10,
    startTime: Date.now() - 5000,
    ...overrides,
  }
}

describe('SubAgentPanel', () => {
  // ========================================================================
  // 基本渲染测试
  // ========================================================================
  describe('基本渲染', () => {
    it('应该渲染子 Agent 头部信息', () => {
      const state = createBaseState()
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('子 Agent')
      expect(frame).toContain('独立代理')
      expect(frame).toContain('explore')
    })

    it('应该渲染任务描述', () => {
      const state = createBaseState({ prompt: '分析项目依赖关系' })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('任务:')
      expect(frame).toContain('分析项目依赖关系')
    })

    it('应该渲染进度条和步骤信息 (Requirements 5.1)', () => {
      const state = createBaseState({ currentStep: 3, maxSteps: 10 })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('步骤 3/10')
    })

    it('应该显示完成状态', () => {
      const state = createBaseState({
        status: 'completed',
        endTime: Date.now(),
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('✓')
    })

    it('应该显示错误状态', () => {
      const state = createBaseState({ status: 'error' })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('✗')
    })

    it('应该显示不同模式的名称', () => {
      const modes = [
        { mode: 'parallel_agents' as const, expected: '融合并行' },
        { mode: 'multi_agent' as const, expected: '多角色讨论' },
        { mode: 'ask_llm' as const, expected: 'LLM 查询' },
        { mode: 'fork_agent' as const, expected: '分叉代理' },
      ]
      for (const { mode, expected } of modes) {
        const state = createBaseState({ mode })
        const { lastFrame } = render(
          React.createElement(SubAgentPanel, { subAgent: state })
        )
        expect(lastFrame()!).toContain(expected)
      }
    })
  })

  // ========================================================================
  // 重试计数显示测试
  // ========================================================================
  describe('重试计数显示', () => {
    it('当 retryCount > 0 时应该显示重试计数', () => {
      const state = createBaseState({ retryCount: 2 })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('重试 2')
      expect(frame).toContain('🔄')
    })

    it('当 retryCount 为 0 时不应该显示重试信息', () => {
      const state = createBaseState({ retryCount: 0 })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('重试')
      expect(frame).not.toContain('🔄')
    })

    it('当 retryCount 未定义时不应该显示重试信息', () => {
      const state = createBaseState({ retryCount: undefined })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('重试')
    })
  })

  // ========================================================================
  // 配置信息显示测试
  // ========================================================================
  describe('配置信息显示', () => {
    it('应该显示 maxTurns 配置', () => {
      const state = createBaseState({
        config: { maxTurns: 20 },
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('配置:')
      expect(frame).toContain('最大轮数 20')
    })

    it('应该显示 timeout 配置（毫秒格式化）', () => {
      const state = createBaseState({
        config: { timeout: 180000 },
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('配置:')
      expect(frame).toContain('超时 3m')
    })

    it('应该同时显示 maxTurns 和 timeout', () => {
      const state = createBaseState({
        config: { maxTurns: 15, timeout: 60000 },
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('最大轮数 15')
      expect(frame).toContain('超时 1m')
    })

    it('当没有配置时不应该显示配置区域', () => {
      const state = createBaseState({ config: undefined })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('⚙️')
    })
  })

  // ========================================================================
  // 工具调用列表显示测试 (Requirements 5.2)
  // ========================================================================
  describe('工具调用列表显示 (Requirements 5.2)', () => {
    it('应该显示最近的工具调用', () => {
      const state = createBaseState({
        tools: [
          {
            id: 'tool-1',
            name: 'read',
            displayName: 'read',
            input: { filePath: 'src/index.ts' },
            isError: false,
            status: 'completed',
            startTime: Date.now() - 3000,
            endTime: Date.now() - 2000,
            duration: 1000,
          },
        ],
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('最近操作:')
      expect(frame).toContain('read')
      expect(frame).toContain('src/index.ts')
    })

    it('应该最多显示 3 个工具调用', () => {
      const tools = Array.from({ length: 5 }, (_, i) => ({
        id: `tool-${i}`,
        name: 'read',
        displayName: 'read',
        input: { filePath: `file${i}.ts` },
        isError: false,
        status: 'completed' as const,
        startTime: Date.now() - 5000 + i * 1000,
        duration: 500,
      }))
      const state = createBaseState({ tools })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      // 应该显示最后 3 个（file2, file3, file4）
      expect(frame).toContain('file2.ts')
      expect(frame).toContain('file3.ts')
      expect(frame).toContain('file4.ts')
      expect(frame).toContain('还有 2 个操作')
    })

    it('没有工具调用时不应该显示操作区域', () => {
      const state = createBaseState({ tools: [] })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('最近操作:')
    })
  })

  // ========================================================================
  // 子任务状态显示测试 (Requirements 5.3)
  // ========================================================================
  describe('子任务状态显示 (Requirements 5.3)', () => {
    it('应该显示子任务列表和统计', () => {
      const state = createBaseState({
        mode: 'parallel_agents',
        children: [
          { id: 'c1', name: '代码分析', prompt: '分析代码', status: 'completed' },
          { id: 'c2', name: '测试生成', prompt: '生成测试', status: 'running' },
          { id: 'c3', name: '文档更新', prompt: '更新文档', status: 'error', error: '超时' },
        ],
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      // 统计摘要
      expect(frame).toContain('子任务:')
      expect(frame).toContain('3 个')
      // 子任务名称
      expect(frame).toContain('代码分析')
      expect(frame).toContain('测试生成')
      expect(frame).toContain('文档更新')
    })

    it('应该显示子任务错误信息', () => {
      const state = createBaseState({
        mode: 'multi_agent',
        children: [
          { id: 'c1', name: '失败任务', prompt: '执行', status: 'error', error: '连接超时' },
        ],
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('连接超时')
    })

    it('没有子任务时不应该显示子任务区域', () => {
      const state = createBaseState({ children: [] })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('子任务:')
    })
  })

  // ========================================================================
  // Token 使用量和输出预览测试
  // ========================================================================
  describe('Token 使用量和输出预览', () => {
    it('完成后应该显示 Token 使用量', () => {
      const state = createBaseState({
        status: 'completed',
        endTime: Date.now(),
        usage: { inputTokens: 1500, outputTokens: 800 },
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).toContain('Token:')
      expect(frame).toContain('1,500')
      expect(frame).toContain('800')
    })

    it('运行中不应该显示 Token 使用量', () => {
      const state = createBaseState({
        status: 'running',
        usage: { inputTokens: 1000, outputTokens: 500 },
      })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('Token:')
    })

    it('展开时应该显示输出预览', () => {
      const state = createBaseState({ text: '这是输出内容预览' })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state, isExpanded: true })
      )
      const frame = lastFrame()!
      expect(frame).toContain('输出预览:')
      expect(frame).toContain('这是输出内容预览')
    })

    it('未展开时不应该显示输出预览', () => {
      const state = createBaseState({ text: '这是输出内容预览' })
      const { lastFrame } = render(
        React.createElement(SubAgentPanel, { subAgent: state, isExpanded: false })
      )
      const frame = lastFrame()!
      expect(frame).not.toContain('输出预览:')
    })
  })
})
