/**
 * Justfile 解析器
 * 
 * 解析 justfile 文件，提取命令信息
 */

import { readFile } from 'fs/promises'
import type { JustCommand, JustParameter, ParseError, ParseResult } from './types.js'

/**
 * 命令定义行的正则表达式
 * 匹配: command-name arg1 arg2='default':
 */
const COMMAND_DEF_REGEX = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*(.*?):\s*$/

/**
 * 参数的正则表达式
 * 匹配: ARG 或 ARG='default' 或 ARG="default"
 */
const PARAM_REGEX = /([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*(['"]?)([^'"]*)\2)?/g

/**
 * 依赖命令的正则表达式
 * 匹配命令定义行中冒号前的依赖部分
 */
const DEPS_REGEX = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s+(.+?):\s*$/

/**
 * 解析命令参数
 */
function parseParameters(paramStr: string): JustParameter[] {
  const params: JustParameter[] = []
  const matches = paramStr.matchAll(PARAM_REGEX)
  
  for (const match of matches) {
    const name = match[1]
    const defaultValue = match[3]
    
    params.push({
      name,
      hasDefault: defaultValue !== undefined,
      defaultValue: defaultValue || undefined,
    })
  }
  
  return params
}

/**
 * 解析依赖命令
 */
function parseDependencies(line: string): { name: string; deps: string[]; params: JustParameter[] } | null {
  // 检查是否有依赖（命令名后跟其他命令名，然后是冒号）
  const depsMatch = line.match(DEPS_REGEX)
  if (depsMatch) {
    const name = depsMatch[1]
    const rest = depsMatch[2].trim()
    
    // 分离依赖和参数
    const parts = rest.split(/\s+/)
    const deps: string[] = []
    const paramParts: string[] = []
    
    for (const part of parts) {
      // 如果包含 = 或者是大写字母开头，可能是参数
      if (part.includes('=') || /^[A-Z]/.test(part)) {
        paramParts.push(part)
      } else if (/^[a-z_][a-zA-Z0-9_-]*$/.test(part)) {
        deps.push(part)
      }
    }
    
    return {
      name,
      deps,
      params: parseParameters(paramParts.join(' ')),
    }
  }
  
  return null
}


/**
 * 解析 justfile 内容
 */
export function parseJustfile(content: string): ParseResult {
  const commands: JustCommand[] = []
  const errors: ParseError[] = []
  const lines = content.split('\n')
  
  let currentCommand: JustCommand | null = null
  let commentBuffer: string[] = []
  let lineNumber = 0
  
  for (const line of lines) {
    lineNumber++
    
    // 空行
    if (line.trim() === '') {
      // 如果在命令体中，空行也是命令体的一部分
      if (currentCommand && currentCommand.body.length > 0) {
        currentCommand.body.push('')
      } else {
        // 清空注释缓冲区（注释和命令之间不能有空行）
        commentBuffer = []
      }
      continue
    }
    
    // 注释行
    if (line.trim().startsWith('#')) {
      // 如果在命令体中，注释也是命令体的一部分
      if (currentCommand && currentCommand.body.length > 0) {
        currentCommand.body.push(line)
      } else {
        // 提取注释内容（去掉 # 和前导空格）
        const comment = line.trim().replace(/^#\s*/, '')
        commentBuffer.push(comment)
      }
      continue
    }
    
    // 命令体行（以空格或 tab 开头）
    if (/^[\t ]/.test(line)) {
      if (currentCommand) {
        // 去掉第一个缩进字符
        const bodyLine = line.replace(/^[\t ]/, '')
        currentCommand.body.push(bodyLine)
      } else {
        errors.push({
          message: '意外的缩进行，没有对应的命令定义',
          line: lineNumber,
        })
      }
      continue
    }
    
    // 尝试解析命令定义
    const cmdMatch = line.match(COMMAND_DEF_REGEX)
    if (cmdMatch) {
      // 保存之前的命令
      if (currentCommand) {
        commands.push(currentCommand)
      }
      
      const name = cmdMatch[1]
      const paramStr = cmdMatch[2].trim()
      
      // 检查是否有依赖
      const depsResult = parseDependencies(line)
      
      let params: JustParameter[] = []
      let deps: string[] = []
      
      if (depsResult) {
        params = depsResult.params
        deps = depsResult.deps
      } else {
        params = parseParameters(paramStr)
      }
      
      currentCommand = {
        name,
        description: commentBuffer.join(' '),
        parameters: params,
        body: [],
        isPrivate: name.startsWith('_'),
        isDefault: name === 'default',
        dependencies: deps,
        lineNumber,
      }
      
      // 清空注释缓冲区
      commentBuffer = []
      continue
    }
    
    // 变量赋值行（如 VAR := "value"）
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*:?=/.test(line)) {
      // 保存之前的命令
      if (currentCommand) {
        commands.push(currentCommand)
        currentCommand = null
      }
      commentBuffer = []
      continue
    }
    
    // 设置行（如 set shell := ["bash", "-c"]）
    if (line.trim().startsWith('set ')) {
      // 保存之前的命令
      if (currentCommand) {
        commands.push(currentCommand)
        currentCommand = null
      }
      commentBuffer = []
      continue
    }
    
    // 其他无法识别的行
    errors.push({
      message: `无法解析的行: ${line.substring(0, 50)}${line.length > 50 ? '...' : ''}`,
      line: lineNumber,
    })
  }
  
  // 保存最后一个命令
  if (currentCommand) {
    commands.push(currentCommand)
  }
  
  return { commands, errors }
}


/**
 * 从文件路径解析 justfile
 */
export async function parseJustfileFromPath(filePath: string): Promise<ParseResult> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return parseJustfile(content)
  } catch (error) {
    // 文件不存在或读取失败
    const message = error instanceof Error ? error.message : String(error)
    return {
      commands: [],
      errors: [{
        message: `无法读取文件: ${message}`,
        line: 0,
      }],
    }
  }
}
