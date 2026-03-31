/**
 * 命令执行器
 * 
 * 负责执行 justfile 命令
 * 
 * Windows 兼容性说明：
 * - just 默认使用 sh 作为 shell，但 Windows 没有 sh
 * - 如果 justfile 没有设置 shell，在 Windows 上自动使用 cmd.exe
 * - 用户可以在 justfile 中通过 `set shell := [...]` 指定 shell
 */

import { spawn } from 'child_process'
import { dirname } from 'path'
import type {
  CommandExecutor,
  ExecuteOptions,
  ExecuteResult,
  RegisteredCommand,
} from './types.js'

/**
 * 默认超时时间（30秒）
 */
const DEFAULT_TIMEOUT = 30000

/**
 * 检查命令是否可用
 */
async function checkCommandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const checkCmd = isWindows ? 'where' : 'which'
    
    const proc = spawn(checkCmd, [command], {
      stdio: 'ignore',
      shell: true,
    })
    
    proc.on('close', (code) => {
      resolve(code === 0)
    })
    
    proc.on('error', () => {
      resolve(false)
    })
  })
}

/**
 * 执行命令
 */
async function executeCommand(
  command: string,
  args: string[],
  options: ExecuteOptions
): Promise<ExecuteResult> {
  const startTime = Date.now()
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: true,
    })
    
    let stdout = ''
    let stderr = ''
    let killed = false
    
    // 超时处理
    const timer = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
    }, timeout)
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })
    
    proc.on('close', (code) => {
      clearTimeout(timer)
      const duration = Date.now() - startTime
      
      if (killed) {
        resolve({
          success: false,
          stdout,
          stderr: stderr + '\n命令执行超时',
          exitCode: -1,
          duration,
        })
      } else {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code ?? -1,
          duration,
        })
      }
    })
    
    proc.on('error', (error) => {
      clearTimeout(timer)
      const duration = Date.now() - startTime
      
      resolve({
        success: false,
        stdout,
        stderr: error.message,
        exitCode: -1,
        duration,
      })
    })
  })
}


/**
 * 创建命令执行器
 */
export function createCommandExecutor(): CommandExecutor {
  let justAvailable: boolean | null = null
  
  return {
    /**
     * 检查 just 是否可用
     */
    async isJustAvailable(): Promise<boolean> {
      if (justAvailable === null) {
        justAvailable = await checkCommandAvailable('just')
      }
      return justAvailable
    },
    
    /**
     * 执行命令
     */
    async execute(
      command: RegisteredCommand,
      options: ExecuteOptions
    ): Promise<ExecuteResult> {
      // 检查 just 是否可用
      const available = await this.isJustAvailable()
      if (!available) {
        return {
          success: false,
          stdout: '',
          stderr: 'just 命令不可用，请先安装 just: https://github.com/casey/just',
          exitCode: -1,
          duration: 0,
        }
      }
      
      // 构建命令参数
      const args: string[] = []
      
      // Windows 上需要指定 shell，因为默认的 sh 不存在
      // 使用 cmd.exe 因为它支持常见的 shell 命令如 echo
      const isWindows = process.platform === 'win32'
      if (isWindows) {
        args.push('--shell', 'cmd.exe')
        args.push('--shell-arg', '/c')
      }
      
      // 指定 justfile 路径
      args.push('--justfile', command.sourcePath)
      
      // 设置工作目录为 justfile 所在目录
      const justfileDir = dirname(command.sourcePath)
      const cwd = command.source === 'project' ? options.cwd : justfileDir
      
      // 添加命令名称
      args.push(command.name)
      
      // 添加命令参数
      if (options.args) {
        args.push(...options.args)
      }
      
      return executeCommand('just', args, {
        ...options,
        cwd,
      })
    },
  }
}
