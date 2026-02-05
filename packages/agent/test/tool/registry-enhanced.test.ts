import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { Tool } from '../../src/tool/tool'
import { ToolRegistry } from '../../src/tool/registry'

describe('ToolRegistry - Enhanced Features', () => {
  beforeEach(() => {
    ToolRegistry.clear()
  })

  describe('批量注册', () => {
    it('should register multiple tools at once', () => {
      const tool1 = Tool.define({
        id: 'tool-1',
        description: 'Tool 1',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: '1' }
        },
      })

      const tool2 = Tool.define({
        id: 'tool-2',
        description: 'Tool 2',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: '2' }
        },
      })

      // 批量注册
      ToolRegistry.register([tool1, tool2])

      expect(ToolRegistry.get('tool-1')).toBeDefined()
      expect(ToolRegistry.get('tool-2')).toBeDefined()
      expect(ToolRegistry.count()).toBe(2)
    })
  })

  describe('工具过滤', () => {
    beforeEach(() => {
      // 注册不同来源的工具
      const builtinTool = Tool.define({
        id: 'builtin-tool',
        description: 'Builtin tool',
        parameters: z.object({}),
        source: 'builtin',
        async execute() {
          return { title: 'OK', output: 'builtin' }
        },
      })

      const mcpTool = Tool.define({
        id: 'mcp-tool',
        description: 'MCP tool',
        parameters: z.object({}),
        source: 'mcp',
        mcpServer: 'test-server',
        async execute() {
          return { title: 'OK', output: 'mcp' }
        },
      })

      const customTool = Tool.define({
        id: 'custom-tool',
        description: 'Custom tool',
        parameters: z.object({}),
        source: 'custom',
        async execute() {
          return { title: 'OK', output: 'custom' }
        },
      })

      ToolRegistry.register([builtinTool, mcpTool, customTool])
    })

    it('should filter tools by source', () => {
      const builtinTools = ToolRegistry.list({ source: 'builtin' })
      expect(builtinTools).toHaveLength(1)
      expect(builtinTools[0].id).toBe('builtin-tool')

      const mcpTools = ToolRegistry.list({ source: 'mcp' })
      expect(mcpTools).toHaveLength(1)
      expect(mcpTools[0].id).toBe('mcp-tool')

      const customTools = ToolRegistry.list({ source: 'custom' })
      expect(customTools).toHaveLength(1)
      expect(customTools[0].id).toBe('custom-tool')
    })

    it('should filter tools by MCP server', () => {
      const serverTools = ToolRegistry.list({ mcpServer: 'test-server' })
      expect(serverTools).toHaveLength(1)
      expect(serverTools[0].id).toBe('mcp-tool')
    })

    it('should count tools with filter', () => {
      expect(ToolRegistry.count({ source: 'builtin' })).toBe(1)
      expect(ToolRegistry.count({ source: 'mcp' })).toBe(1)
      expect(ToolRegistry.count({ source: 'custom' })).toBe(1)
      expect(ToolRegistry.count({ mcpServer: 'test-server' })).toBe(1)
      expect(ToolRegistry.count()).toBe(3)
    })
  })

  describe('工具注销', () => {
    it('should unregister a tool', () => {
      const tool = Tool.define({
        id: 'temp-tool',
        description: 'Temporary tool',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: 'temp' }
        },
      })

      ToolRegistry.register(tool)
      expect(ToolRegistry.has('temp-tool')).toBe(true)

      const result = ToolRegistry.unregister('temp-tool')
      expect(result).toBe(true)
      expect(ToolRegistry.has('temp-tool')).toBe(false)
      expect(ToolRegistry.get('temp-tool')).toBeUndefined()
    })

    it('should return false when unregistering non-existent tool', () => {
      const result = ToolRegistry.unregister('non-existent')
      expect(result).toBe(false)
    })

    it('should clean up indexes when unregistering', () => {
      const mcpTool = Tool.define({
        id: 'mcp-tool',
        description: 'MCP tool',
        parameters: z.object({}),
        source: 'mcp',
        mcpServer: 'test-server',
        async execute() {
          return { title: 'OK', output: 'mcp' }
        },
      })

      ToolRegistry.register(mcpTool)
      expect(ToolRegistry.count({ source: 'mcp' })).toBe(1)
      expect(ToolRegistry.count({ mcpServer: 'test-server' })).toBe(1)

      ToolRegistry.unregister('mcp-tool')
      expect(ToolRegistry.count({ source: 'mcp' })).toBe(0)
      expect(ToolRegistry.count({ mcpServer: 'test-server' })).toBe(0)
    })
  })

  describe('工具变更事件', () => {
    it('should notify listeners on tool registration', () => {
      const events: ToolRegistry.ToolChangeEvent[] = []
      const unsubscribe = ToolRegistry.onChange((event) => {
        events.push(event)
      })

      const tool = Tool.define({
        id: 'event-tool',
        description: 'Event tool',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: 'event' }
        },
      })

      ToolRegistry.register(tool)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('registered')
      if (events[0].type === 'registered') {
        expect(events[0].tool.id).toBe('event-tool')
      }

      unsubscribe()
    })

    it('should notify listeners on tool unregistration', () => {
      const tool = Tool.define({
        id: 'event-tool',
        description: 'Event tool',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: 'event' }
        },
      })

      ToolRegistry.register(tool)

      const events: ToolRegistry.ToolChangeEvent[] = []
      const unsubscribe = ToolRegistry.onChange((event) => {
        events.push(event)
      })

      ToolRegistry.unregister('event-tool')

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('unregistered')
      if (events[0].type === 'unregistered') {
        expect(events[0].id).toBe('event-tool')
      }

      unsubscribe()
    })

    it('should allow unsubscribing from events', () => {
      const events: ToolRegistry.ToolChangeEvent[] = []
      const unsubscribe = ToolRegistry.onChange((event) => {
        events.push(event)
      })

      const tool1 = Tool.define({
        id: 'tool-1',
        description: 'Tool 1',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: '1' }
        },
      })

      ToolRegistry.register(tool1)
      expect(events).toHaveLength(1)

      // 取消订阅
      unsubscribe()

      const tool2 = Tool.define({
        id: 'tool-2',
        description: 'Tool 2',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: '2' }
        },
      })

      ToolRegistry.register(tool2)
      // 不应该收到新事件
      expect(events).toHaveLength(1)
    })

    it('should handle listener errors gracefully', () => {
      // 注册一个会抛出错误的监听器
      const unsubscribe = ToolRegistry.onChange(() => {
        throw new Error('Listener error')
      })

      const tool = Tool.define({
        id: 'error-tool',
        description: 'Error tool',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: 'error' }
        },
      })

      // 不应该抛出错误
      expect(() => {
        ToolRegistry.register(tool)
      }).not.toThrow()

      // 工具应该成功注册
      expect(ToolRegistry.has('error-tool')).toBe(true)

      unsubscribe()
    })
  })

  describe('has() 方法', () => {
    it('should return true for registered tools', () => {
      const tool = Tool.define({
        id: 'test-tool',
        description: 'Test tool',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: 'test' }
        },
      })

      ToolRegistry.register(tool)
      expect(ToolRegistry.has('test-tool')).toBe(true)
    })

    it('should return false for non-existent tools', () => {
      expect(ToolRegistry.has('non-existent')).toBe(false)
    })
  })
})
