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

      expect(prompt).toContain('Build agent')
      expect(prompt).toContain('full-featured')
      expect(prompt).toContain('edit files')
      expect(prompt).toContain('execute')
    })

    it('should return prompt for plan agent', () => {
      const prompt = getSystemPrompt('plan')

      expect(prompt).toContain('Plan agent')
      expect(prompt).toContain('read-only')
      expect(prompt).toContain('CANNOT')
    })

    it('should return prompt for explore agent', () => {
      const prompt = getSystemPrompt('explore')

      expect(prompt).toContain('Explore agent')
      expect(prompt).toContain('fast')
      expect(prompt).toContain('exploration')
    })

    it('should include base prompt content', () => {
      const prompt = getSystemPrompt('build')

      expect(prompt).toContain('AI programming assistant')
      expect(prompt).toContain('tools')
    })
  })

  describe('buildSystemPrompt', () => {
    it('should build prompt with agent definition', () => {
      const definition = getAgentDefinition('build')
      const prompt = buildSystemPrompt(definition)

      expect(prompt).toContain('Build agent')
      expect(prompt).toContain('Available tools')
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

      expect(prompt).toContain('Custom system prompt')
    })
  })
})
