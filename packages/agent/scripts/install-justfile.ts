#!/usr/bin/env node
/**
 * 安装默认全局 Justfile
 * 
 * 用法:
 *   npx ts-node scripts/install-justfile.ts [--force]
 * 
 * 选项:
 *   --force  强制覆盖现有文件
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// 默认 justfile 内容
const DEFAULT_JUSTFILE = `# NaughtyAgent 全局命令
# 这些命令在任意目录下都可用
# 位置: ~/.naughtyagent/justfile

# 默认命令：显示帮助
default:
    @just --list

# ============================================
# 系统命令
# ============================================

# 显示 NaughtyAgent 版本
version:
    @naughty --version

# 打开配置目录
config:
    @echo "配置目录: ~/.naughtyagent/"

# 检查更新
update:
    @echo "检查 NaughtyAgent 更新..."
    @npm view naughtyagent version 2>/dev/null || echo "无法检查更新"

# 显示帮助信息
help:
    @echo "NaughtyAgent 全局命令"
    @echo ""
    @just --list

# ============================================
# 开发命令
# ============================================

# 初始化项目（生成 Naughty.md）
init:
    @naughty /init

# 显示 Git 状态
status:
    @git status -sb 2>/dev/null || echo "不是 Git 仓库"

# 显示 Git 日志
log:
    @git log --oneline -10 2>/dev/null || echo "不是 Git 仓库"

# ============================================
# 快捷命令
# ============================================

# 清屏
cls:
    @clear 2>/dev/null || cls

# 显示当前目录
pwd:
    @pwd

# 显示目录内容
ls:
    @ls -la 2>/dev/null || dir
`

interface InstallOptions {
  force?: boolean
  targetDir?: string
}

interface InstallResult {
  success: boolean
  message: string
  installedPath?: string
}

/**
 * 安装默认全局 justfile
 */
export async function installGlobalJustfile(options: InstallOptions = {}): Promise<InstallResult> {
  const targetDir = options.targetDir ?? join(homedir(), '.naughtyagent')
  const justfilePath = join(targetDir, 'justfile')
  
  try {
    // 创建目录
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
      console.log(`✓ 创建目录: ${targetDir}`)
    }
    
    // 检查文件是否存在
    if (existsSync(justfilePath) && !options.force) {
      return {
        success: true,
        message: `全局 justfile 已存在: ${justfilePath}\n  使用 --force 选项强制覆盖`,
        installedPath: justfilePath,
      }
    }
    
    // 写入文件
    writeFileSync(justfilePath, DEFAULT_JUSTFILE, 'utf-8')
    
    return {
      success: true,
      message: `✓ 全局 justfile 已安装: ${justfilePath}`,
      installedPath: justfilePath,
    }
  } catch (error) {
    return {
      success: false,
      message: `安装失败: ${error instanceof Error ? error.message : error}`,
    }
  }
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force')
  
  installGlobalJustfile({ force }).then(result => {
    console.log(result.message)
    process.exit(result.success ? 0 : 1)
  })
}
