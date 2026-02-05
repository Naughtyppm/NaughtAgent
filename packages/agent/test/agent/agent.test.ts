import { describe, it, expect } from 'vitest'
import {
  BUILTIN_AGENTS,
  getAgentDefinition,
  listAgents,
  type AgentDefinition,
  type AgentType,
} from '../../src/agent/agent'

describe('Agent', () => {
  describe('BUILTIN_AGENTS', () => {
    it('should have build agent', () => {
      expect(BUILTIN_AGENTS.build).toBeDefined()
      expect(BUILTIN_AGENTS.build.type).toBe('build')
      expect(BUILTIN_AGENTS.build.mode).toBe('primary')
      expect(BUILTIN_AGENTS.build.name).toBe('Build')
    })

    it('should have plan agent', () => {
      expect(BUILTIN_AGENTS.plan).toBeDefined()
      expect(BUILTIN_AGENTS.plan.type).toBe('plan')
      expect(BUILTIN_AGENTS.plan.mode).toBe('primary')
      expect(BUILTIN_AGENTS.plan.name).toBe('Plan')
    })

    it('should have explore agent', () => {
      expect(BUILTIN_AGENTS.explore).toBeDefined()
      expect(BUILTIN_AGENTS.explore.type).toBe('explore')
      expect(BUILTIN_AGENTS.explore.mode).toBe('subagent')
      expect(BUILTIN_AGENTS.explore.name).toBe('Explore')
    })

    it('should have tools defined for each agent', () => {
      expect(BUILTIN_AGENTS.build.tools).toContain('read')
      expect(BUILTIN_AGENTS.build.tools).toContain('write')
      expect(BUILTIN_AGENTS.build.tools).toContain('edit')
      expect(BUILTIN_AGENTS.build.tools).toContain('bash')

      expect(BUILTIN_AGENTS.plan.tools).toContain('read')
      expect(BUILTIN_AGENTS.plan.tools).toContain('write')  // plan agent can write plan files
      expect(BUILTIN_AGENTS.plan.tools).not.toContain('bash')

      expect(BUILTIN_AGENTS.explore.tools).toContain('read')
      expect(BUILTIN_AGENTS.explore.tools).toContain('glob')
      expect(BUILTIN_AGENTS.explore.tools).toContain('grep')
    })
  })

  describe('getAgentDefinition', () => {
    it('should return build agent definition', () => {
      const definition = getAgentDefinition('build')

      expect(definition.type).toBe('build')
      expect(definition.mode).toBe('primary')
      expect(definition.tools).toContain('read')
    })

    it('should return plan agent definition', () => {
      const definition = getAgentDefinition('plan')

      expect(definition.type).toBe('plan')
      expect(definition.mode).toBe('primary')
    })

    it('should return explore agent definition', () => {
      const definition = getAgentDefinition('explore')

      expect(definition.type).toBe('explore')
      expect(definition.mode).toBe('subagent')
    })

    it('should return a copy, not the original', () => {
      const def1 = getAgentDefinition('build')
      const def2 = getAgentDefinition('build')

      expect(def1).not.toBe(def2)
      expect(def1).toEqual(def2)
    })

    it('should throw for unknown agent type', () => {
      expect(() => getAgentDefinition('unknown' as AgentType)).toThrow('Unknown agent type')
    })
  })

  describe('listAgents', () => {
    it('should list all agents', () => {
      const agents = listAgents()

      expect(agents.length).toBe(3)
      expect(agents.map(a => a.type)).toContain('build')
      expect(agents.map(a => a.type)).toContain('plan')
      expect(agents.map(a => a.type)).toContain('explore')
    })

    it('should filter by primary mode', () => {
      const agents = listAgents('primary')

      expect(agents.length).toBe(2)
      expect(agents.every(a => a.mode === 'primary')).toBe(true)
    })

    it('should filter by subagent mode', () => {
      const agents = listAgents('subagent')

      expect(agents.length).toBe(1)
      expect(agents[0].type).toBe('explore')
    })
  })
})
