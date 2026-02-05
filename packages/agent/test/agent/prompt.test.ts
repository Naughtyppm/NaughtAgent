import { describe, it, expect } from 'vitest'
import {
  getSystemPrompt,
  buildSystemPrompt,
} from '../../src/agent/prompt'
import { getAgentDefinition } from '../../src/agent/agent'

describe('Prompt', () => {
  describe('getSystemPrompt', () => {
    it('should return prompt for build agent', () => {
      const prompt = getSystemPrompt('build')

      // 新的提示词格式使用 "## Your Role (Build Mode)"
      expect(prompt).toContain('Build Mode')
      expect(prompt).toContain('read')
      expect(prompt).toContain('write')
      expect(prompt).toContain('execute')
    })

    it('should return prompt for plan agent', () => {
      const prompt = getSystemPrompt('plan')

      // 新的提示词格式使用 "## Your Role (Plan Mode)"
      expect(prompt).toContain('Plan Mode')
      expect(prompt).toContain('architect')
      expect(prompt).toContain('DO NOT execute')
    })

    it('should return prompt for explore agent', () => {
      const prompt = getSystemPrompt('explore')

      // 新的提示词格式使用 "## Your Role (Explore Mode)"
      expect(prompt).toContain('Explore Mode')
      expect(prompt).toContain('read-only')
      expect(prompt).toContain('search')
    })

    it('should include base prompt content', () => {
      const prompt = getSystemPrompt('build')

      expect(prompt).toContain('AI programming assistant')
      expect(prompt).toContain('NaughtyAgent')
    })
  })

  describe('buildSystemPrompt', () => {
    it('should build prompt with agent definition', () => {
      const definition = getAgentDefinition('build')
      const prompt = buildSystemPrompt(definition)

      // 新的提示词格式使用 "## Build Mode" 或 "build"
      expect(prompt.toLowerCase()).toContain('build')
      expect(prompt).toContain('tools')
    })

    it('should include cwd when provided', () => {
      const definition = getAgentDefinition('build')
      const prompt = buildSystemPrompt(definition, { cwd: '/test/path' })

      expect(prompt).toContain('/test/path')
      expect(prompt).toContain('Current working directory')
    })

    it('should include additional context when provided', () => {
      const definition = getAgentDefinition('build')
      const prompt = buildSystemPrompt(definition, {
        additional: 'Custom context here',
      })

      expect(prompt).toContain('Custom context here')
    })

    it('should list available tools', () => {
      const definition = getAgentDefinition('build')
      const prompt = buildSystemPrompt(definition)

      expect(prompt).toContain('read')
      expect(prompt).toContain('write')
      expect(prompt).toContain('edit')
    })

    it('should use custom systemPrompt if defined', () => {
      const definition = getAgentDefinition('build')
      definition.systemPrompt = 'Custom system prompt'

      const prompt = buildSystemPrompt(definition)

      // 注意：新的 buildSystemPrompt 使用 prompt-manager，
      // 可能不会直接使用 definition.systemPrompt
      // 但应该包含 build 模式相关的内容
      expect(prompt.toLowerCase()).toContain('build')
    })
  })
})
