import { describe, it, expect } from 'vitest'
import { ReadTool } from '../../src/tool/read'
import { WriteTool } from '../../src/tool/write'
import { EditTool } from '../../src/tool/edit'
import { BashTool } from '../../src/tool/bash'
import { GlobTool } from '../../src/tool/glob'
import { GrepTool } from '../../src/tool/grep'

/**
 * 测试内置工具是否正确获得 MCP 字段
 */
describe('Built-in Tools MCP Fields', () => {
  it('should have inputSchema auto-generated for ReadTool', () => {
    expect(ReadTool.inputSchema).toBeDefined()
    expect(ReadTool.inputSchema?.type).toBe('object')
    expect(ReadTool.inputSchema?.properties).toBeDefined()
    expect(ReadTool.inputSchema?.properties?.filePath).toBeDefined()
  })

  it('should have default source and title for ReadTool', () => {
    expect(ReadTool.source).toBe('builtin')
    expect(ReadTool.title).toBe('read')
  })

  it('should have inputSchema for all built-in tools', () => {
    const tools = [ReadTool, WriteTool, EditTool, BashTool, GlobTool, GrepTool]
    
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema?.type).toBe('object')
      expect(tool.source).toBe('builtin')
      expect(tool.title).toBe(tool.id)
    }
  })

  it('should preserve required fields in inputSchema', () => {
    // ReadTool 的 filePath 是必需的
    expect(ReadTool.inputSchema?.required).toBeDefined()
    expect(ReadTool.inputSchema?.required).toContain('filePath')
    
    // offset 和 limit 是可选的，不应该在 required 中
    expect(ReadTool.inputSchema?.required).not.toContain('offset')
    expect(ReadTool.inputSchema?.required).not.toContain('limit')
  })

  it('should include parameter descriptions in inputSchema', () => {
    // 检查 filePath 的描述
    const filePathSchema = ReadTool.inputSchema?.properties?.filePath as any
    expect(filePathSchema?.description).toBeDefined()
    expect(filePathSchema?.description).toContain('absolute path')
  })
})
