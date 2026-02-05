/**
 * 命令注册表
 * 
 * 管理全局和项目命令的发现、合并和查询
 */

import { join } from 'path'
import { homedir } from 'os'
import { parseJustfileFromPath } from './parser.js'
import type {
  CommandRegistry,
  ParseError,
  RegisteredCommand,
  RegistryConfig,
} from './types.js'

/**
 * 默认全局 justfile 路径
 */
export const DEFAULT_GLOBAL_PATH = join(homedir(), '.naughtyagent', 'justfile')

/**
 * 默认项目 justfile 路径
 */
export const DEFAULT_PROJECT_PATH = 'justfile'

/**
 * 创建命令注册表
 */
export function createCommandRegistry(config?: Partial<RegistryConfig>): CommandRegistry {
  const globalPath = config?.globalPath ?? DEFAULT_GLOBAL_PATH
  let projectPath = config?.projectPath ?? DEFAULT_PROJECT_PATH
  
  let globalCommands: RegisteredCommand[] = []
  let projectCommands: RegisteredCommand[] = []
  let globalErrors: ParseError[] = []
  let projectErrors: ParseError[] = []
  
  /**
   * 加载全局命令
   */
  async function loadGlobal(): Promise<void> {
    const result = await parseJustfileFromPath(globalPath)
    globalCommands = result.commands.map(cmd => ({
      ...cmd,
      source: 'global' as const,
      sourcePath: globalPath,
    }))
    globalErrors = result.errors
  }
  
  /**
   * 加载项目命令
   */
  async function loadProject(): Promise<void> {
    const result = await parseJustfileFromPath(projectPath)
    projectCommands = result.commands.map(cmd => ({
      ...cmd,
      source: 'project' as const,
      sourcePath: projectPath,
    }))
    projectErrors = result.errors
  }

  
  /**
   * 合并命令列表
   * 项目命令覆盖同名全局命令
   */
  function mergeCommands(): RegisteredCommand[] {
    const merged: RegisteredCommand[] = []
    const projectNames = new Set(projectCommands.map(c => c.name))
    
    // 添加全局命令（排除被项目覆盖的）
    for (const cmd of globalCommands) {
      if (!projectNames.has(cmd.name)) {
        merged.push(cmd)
      }
    }
    
    // 添加所有项目命令
    merged.push(...projectCommands)
    
    return merged
  }
  
  /**
   * 模糊搜索匹配
   */
  function fuzzyMatch(text: string, query: string): boolean {
    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    return lowerText.includes(lowerQuery)
  }
  
  const registry: CommandRegistry = {
    /**
     * 获取所有命令（已合并，不含私有命令）
     */
    getCommands(): RegisteredCommand[] {
      return mergeCommands().filter(cmd => !cmd.isPrivate)
    },
    
    /**
     * 根据名称获取命令
     */
    getCommand(name: string): RegisteredCommand | undefined {
      const commands = mergeCommands()
      return commands.find(cmd => cmd.name === name)
    },
    
    /**
     * 搜索命令（模糊匹配）
     */
    searchCommands(query: string): RegisteredCommand[] {
      if (!query) {
        return this.getCommands()
      }
      
      return this.getCommands().filter(cmd => 
        fuzzyMatch(cmd.name, query) || fuzzyMatch(cmd.description, query)
      )
    },
    
    /**
     * 重新加载所有命令
     */
    async reload(): Promise<void> {
      await Promise.all([loadGlobal(), loadProject()])
    },
    
    /**
     * 重新加载项目命令
     */
    async reloadProject(newProjectPath: string): Promise<void> {
      projectPath = newProjectPath
      await loadProject()
    },
    
    /**
     * 获取加载错误
     */
    getErrors(): { global: ParseError[]; project: ParseError[] } {
      return {
        global: globalErrors,
        project: projectErrors,
      }
    },
  }
  
  return registry
}
