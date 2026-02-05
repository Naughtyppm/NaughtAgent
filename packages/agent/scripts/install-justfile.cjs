#!/usr/bin/env node
/**
 * 安装默认全局 Justfile (CommonJS 版本)
 * 
 * 在 npm link / npm install 时自动执行
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

// 检查是否有 --force 参数
const forceInstall = process.argv.includes('--force')

// 默认 justfile 内容（Windows 兼容版本）
const DEFAULT_JUSTFILE = `# NaughtyAgent 全局命令
# 这些命令在任意目录下都可用
# 位置: ~/.naughtyagent/justfile

# Windows 兼容：使用 cmd
set windows-shell := ["cmd.exe", "/c"]

# 默认命令：显示帮助
default:
    @just --list

# ============================================
# 系统命令
# ============================================

# 显示 NaughtyAgent 版本
version:
    @naughtyagent --version

# 打开配置目录
[windows]
config:
    @explorer "%USERPROFILE%\\.naughtyagent"

[unix]
config:
    @open ~/.naughtyagent 2>/dev/null || xdg-open ~/.naughtyagent 2>/dev/null || echo "请手动打开目录: ~/.naughtyagent"

# 检查更新
update:
    @echo "检查 NaughtyAgent 更新..."
    @npm view @naughtyagent/agent version

# 显示帮助信息
help:
    @echo "NaughtyAgent 全局命令"
    @echo ""
    @echo "系统命令:"
    @echo "  version  - 显示版本"
    @echo "  config   - 打开配置目录"
    @echo "  update   - 检查更新"
    @echo "  help     - 显示帮助"
    @echo ""
    @echo "开发命令:"
    @echo "  init     - 初始化项目"
    @echo "  status   - 显示 Git 状态"
    @echo ""
    @just --list

# ============================================
# 开发命令
# ============================================

# 初始化项目（生成 Naughty.md）
# 注意：此命令需要在 naughtyagent 交互模式中使用 /init
init:
    @echo 请启动 naughtyagent 后使用 /init 命令生成项目规范文档
    @echo 或直接运行: naughtyagent 然后输入 /init

# 显示 Git 状态
status:
    @git status -sb

# 显示 Git 日志
log:
    @git log --oneline -10

# ============================================
# 快捷命令
# ============================================

# 清屏
[windows]
cls:
    @cls

[unix]
cls:
    @clear

# 显示当前目录
[windows]
pwd:
    @cd

[unix]
pwd:
    @pwd

# 显示目录内容
[windows]
ls:
    @dir

[unix]
ls:
    @ls -la
`

function installGlobalJustfile() {
  const targetDir = path.join(os.homedir(), '.naughtyagent')
  const justfilePath = path.join(targetDir, 'justfile')
  
  try {
    // 创建目录
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
      console.log(`✓ 创建目录: ${targetDir}`)
    }
    
    // 检查文件是否存在
    if (fs.existsSync(justfilePath) && !forceInstall) {
      console.log(`ℹ 全局 justfile 已存在: ${justfilePath}`)
      console.log(`  使用 --force 参数强制覆盖`)
      return
    }
    
    // 写入文件
    fs.writeFileSync(justfilePath, DEFAULT_JUSTFILE, 'utf-8')
    if (forceInstall) {
      console.log(`✓ 全局 justfile 已更新: ${justfilePath}`)
    } else {
      console.log(`✓ 全局 justfile 已安装: ${justfilePath}`)
    }
    
  } catch (error) {
    console.warn(`⚠ 安装全局 justfile 失败: ${error.message}`)
    // 不抛出错误，避免阻塞安装流程
  }
}

// 执行安装
installGlobalJustfile()
