import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { Tool } from '../../src/tool/tool'
import { ToolRegistry } from '../../src/tool/registry'
import { createTestContext } from '../helpers/context'

describe('Tool', () => {
  describe('define', () => {
    it('should create a tool definition', () => {
      const tool = Tool.define({
        id: 'test-tool',
        description: 'A test tool',
        parameters: z.object({
          message: z.string(),
        }),
        async execute(params) {
          return {
            title: 'Test',
            output: params.message,
          }
        },
      })

      expect(tool.id).toBe('test-tool')
      expect(tool.description).toBe('A test tool')
    })

    it('should auto-generate inputSchema from Zod schema', () => {
      const tool = Tool.define({
        id: 'schema-tool',
        description: 'Tool with schema',
        parameters: z.object({
          name: z.string(),
          age: z.number(),
          active: z.boolean().optional(),
        }),
        async execute() {
          return { title: 'OK', output: 'done' }
        },
      })

      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema?.type).toBe('object')
      expect(tool.inputSchema?.properties).toBeDefined()
      expect(tool.inputSchema?.properties?.name).toBeDefined()
      expect(tool.inputSchema?.properties?.age).toBeDefined()
      expect(tool.inputSchema?.properties?.active).toBeDefined()
    })

    it('should set default values for source and title', () => {
      const tool = Tool.define({
        id: 'default-tool',
        description: 'Tool with defaults',
        parameters: z.object({}),
        async execute() {
          return { title: 'OK', output: 'done' }
        },
      })

      expect(tool.source).toBe('builtin')
      expect(tool.title).toBe('default-tool')
    })

    it('should allow overriding default values', () => {
      const tool = Tool.define({
        id: 'custom-tool',
        description: 'Tool with custom values',
        parameters: z.object({}),
        source: 'custom',
        title: 'Custom Title',
        icons: {
          light: 'light.svg',
          dark: 'dark.svg',
        },
        async execute() {
          return { title: 'OK', output: 'done' }
        },
      })

      expect(tool.source).toBe('custom')
      expect(tool.title).toBe('Custom Title')
      expect(tool.icons).toEqual({
        light: 'light.svg',
        dark: 'dark.svg',
      })
    })

    it('should support MCP-specific fields', () => {
      const tool = Tool.define({
        id: 'mcp-tool',
        description: 'MCP tool',
        parameters: z.object({}),
        source: 'mcp',
        mcpServer: 'test-server',
        outputSchema: {
          type: 'object',
          properties: {
            result: { type: 'string' },
          },
        },
        async execute() {
          return { title: 'OK', output: 'done' }
        },
      })

      expect(tool.source).toBe('mcp')
      expect(tool.mcpServer).toBe('test-server')
      expect(tool.outputSchema).toBeDefined()
      expect(tool.outputSchema?.type).toBe('object')
    })

    it('should validate parameters on execute', async () => {
      const tool = Tool.define({
        id: 'validate-tool',
        description: 'Validates params',
        parameters: z.object({
          count: z.number().min(1),
        }),
        async execute(params) {
          return {
            title: 'Count',
            output: `Count: ${params.count}`,
          }
        },
      })

      const ctx = createTestContext()

      // Valid params
      const result = await tool.execute({ count: 5 }, ctx)
      expect(result.output).toBe('Count: 5')

      // Invalid params
      await expect(tool.execute({ count: 0 }, ctx)).rejects.toThrow()
      await expect(tool.execute({ count: 'invalid' }, ctx)).rejects.toThrow()
    })

    it('should pass context to execute function', async () => {
      let receivedCtx: Tool.Context | null = null

      const tool = Tool.define({
        id: 'ctx-tool',
        description: 'Receives context',
        parameters: z.object({}),
        async execute(_, ctx) {
          receivedCtx = ctx
          return { title: 'OK', output: 'done' }
        },
      })

      const ctx = createTestContext({ sessionID: 'my-session', cwd: '/test/path' })
      await tool.execute({}, ctx)

      expect(receivedCtx).not.toBeNull()
      expect(receivedCtx!.sessionID).toBe('my-session')
      expect(receivedCtx!.cwd).toBe('/test/path')
    })
  })

  describe('createContext', () => {
    it('should create context with defaults', () => {
      const ctx = Tool.createContext()

      expect(ctx.sessionID).toBe('default')
      expect(ctx.cwd).toBe(process.cwd())
      expect(ctx.abort).toBeDefined()
    })

    it('should allow overriding defaults', () => {
      const ctx = Tool.createContext({
        sessionID: 'custom-session',
        cwd: '/custom/path',
      })

      expect(ctx.sessionID).toBe('custom-session')
      expect(ctx.cwd).toBe('/custom/path')
    })
  })
})

describe('ToolRegistry', () => {
  beforeEach(() => {
    ToolRegistry.clear()
  })

  it('should register and retrieve tools', () => {
    const tool = Tool.define({
      id: 'reg-tool',
      description: 'Registered tool',
      parameters: z.object({}),
      async execute() {
        return { title: 'OK', output: 'done' }
      },
    })

    ToolRegistry.register(tool)

    const retrieved = ToolRegistry.get('reg-tool')
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe('reg-tool')
  })

  it('should return undefined for unknown tools', () => {
    const tool = ToolRegistry.get('unknown-tool')
    expect(tool).toBeUndefined()
  })

  it('should list all registered tools', () => {
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

    ToolRegistry.register(tool1)
    ToolRegistry.register(tool2)

    const tools = ToolRegistry.list()
    expect(tools).toHaveLength(2)

    const ids = ToolRegistry.ids()
    expect(ids).toContain('tool-1')
    expect(ids).toContain('tool-2')
  })

  it('should execute tools by id', async () => {
    const tool = Tool.define({
      id: 'exec-tool',
      description: 'Executable tool',
      parameters: z.object({
        value: z.string(),
      }),
      async execute(params) {
        return { title: 'Result', output: `Value: ${params.value}` }
      },
    })

    ToolRegistry.register(tool)

    const ctx = createTestContext()
    const result = await ToolRegistry.execute('exec-tool', { value: 'hello' }, ctx)

    expect(result.title).toBe('Result')
    expect(result.output).toBe('Value: hello')
  })

  it('should throw when executing unknown tool', async () => {
    const ctx = createTestContext()
    await expect(ToolRegistry.execute('unknown', {}, ctx)).rejects.toThrow('Tool not found: unknown')
  })
})
