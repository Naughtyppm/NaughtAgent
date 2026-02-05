/**
 * /init 命令
 *
 * 初始化项目，生成 Naughty.md 规范文档和跨平台 justfile
 *
 * 功能：
 * - 分析项目结构
 * - 检测技术栈
 * - 生成项目规范文档
 * - 生成跨平台兼容的 justfile
 */

import type { BuiltinCommandDefinition } from './types.js'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 分析项目结构
 */
function analyzeProject(projectRoot: string) {
  const analysis = {
    hasPackageJson: false,
    hasTsConfig: false,
    hasGitignore: false,
    hasReadme: false,
    languages: new Set<string>(),
    frameworks: new Set<string>(),
    buildTools: new Set<string>(),
    directories: new Set<string>(),
  }

  try {
    const files = fs.readdirSync(projectRoot)

    files.forEach((file) => {
      const filePath = path.join(projectRoot, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        analysis.directories.add(file)
        if (file === 'node_modules') analysis.frameworks.add('Node.js')
        if (file === 'venv' || file === '.venv') analysis.frameworks.add('Python')
        if (file === 'vendor') analysis.frameworks.add('PHP/Go')
      } else {
        if (file === 'package.json') analysis.hasPackageJson = true
        if (file === 'tsconfig.json') analysis.hasTsConfig = true
        if (file === '.gitignore') analysis.hasGitignore = true
        if (file.toLowerCase().startsWith('readme')) analysis.hasReadme = true

        const ext = path.extname(file)
        if (ext === '.ts' || ext === '.tsx') analysis.languages.add('TypeScript')
        if (ext === '.js' || ext === '.jsx') analysis.languages.add('JavaScript')
        if (ext === '.py') analysis.languages.add('Python')
        if (ext === '.go') analysis.languages.add('Go')
        if (ext === '.rs') analysis.languages.add('Rust')
        if (ext === '.java') analysis.languages.add('Java')

        if (file === 'Cargo.toml') analysis.buildTools.add('Cargo')
        if (file === 'go.mod') analysis.buildTools.add('Go Modules')
        if (file === 'pom.xml') analysis.buildTools.add('Maven')
        if (file === 'build.gradle') analysis.buildTools.add('Gradle')
      }
    })
  } catch {
    // 忽略错误
  }

  return analysis
}


/**
 * 生成跨平台兼容的项目 justfile
 */
function generateProjectJustfile(projectRoot: string): string {
  const analysis = analyzeProject(projectRoot)
  const projectName = path.basename(projectRoot)
  
  // 读取 package.json 获取 scripts
  let scripts: Record<string, string> = {}
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')
    )
    scripts = packageJson.scripts || {}
  } catch {
    // 不存在
  }

  let content = `# ${projectName} 项目命令
# 由 NaughtyAgent /init 命令生成
# 用法: just <命令> 或在 NaughtyAgent 中使用 /<命令>

# ============================================
# 跨平台 Shell 设置（重要！）
# ============================================
# Windows 使用 cmd.exe，Unix 使用默认 shell
set windows-shell := ["cmd.exe", "/c"]

# 默认命令
default:
    @just --list

`

  // 根据项目类型生成命令
  if (analysis.hasPackageJson) {
    content += `# ============================================
# Node.js 项目命令
# ============================================

`
    // 从 package.json scripts 生成命令
    if (scripts.dev) {
      content += `# 启动开发服务器
dev:
    npm run dev

`
    }
    if (scripts.build) {
      content += `# 构建项目
build:
    npm run build

`
    }
    if (scripts.test) {
      content += `# 运行测试
test:
    npm run test

`
    }
    if (scripts.lint) {
      content += `# 代码检查
lint:
    npm run lint

`
    }
    // 通用命令
    content += `# 安装依赖
install:
    npm install

# 清理
clean:
    @echo "清理 node_modules..."
    ${process.platform === 'win32' ? '@if exist node_modules rmdir /s /q node_modules' : '@rm -rf node_modules'}

`
  } else if (analysis.languages.has('Python')) {
    content += `# ============================================
# Python 项目命令
# ============================================

# 运行主程序
run:
    python main.py

# 安装依赖
install:
    pip install -r requirements.txt

# 运行测试
test:
    pytest

`
  } else if (analysis.languages.has('Go')) {
    content += `# ============================================
# Go 项目命令
# ============================================

# 构建
build:
    go build

# 运行
run:
    go run .

# 测试
test:
    go test ./...

`
  } else if (analysis.languages.has('Rust')) {
    content += `# ============================================
# Rust 项目命令
# ============================================

# 构建
build:
    cargo build

# 运行
run:
    cargo run

# 测试
test:
    cargo test

`
  }

  // 通用 Git 命令
  content += `# ============================================
# Git 命令
# ============================================

# 显示状态
status:
    git status -sb

# 显示日志
log:
    git log --oneline -10

# 拉取更新
pull:
    git pull

# 推送
push:
    git push
`

  return content
}


/**
 * 生成 Naughty.md 内容
 */
function generateNaughtyMd(projectRoot: string): string {
  const analysis = analyzeProject(projectRoot)

  // 读取 package.json
  let packageJson: Record<string, unknown> | null = null
  try {
    packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')
    )
  } catch {
    // 不存在
  }

  // 读取 tsconfig.json
  let tsconfig: Record<string, unknown> | null = null
  try {
    tsconfig = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf-8')
    )
  } catch {
    // 不存在
  }

  // 确定项目类型
  let projectType = 'Unknown'
  if (packageJson) {
    projectType = 'Node.js'
  } else if (analysis.languages.has('Python')) {
    projectType = 'Python'
  } else if (analysis.languages.has('Go')) {
    projectType = 'Go'
  } else if (analysis.languages.has('Rust')) {
    projectType = 'Rust'
  } else if (analysis.languages.has('Java')) {
    projectType = 'Java'
  } else if (analysis.languages.size > 0) {
    projectType = Array.from(analysis.languages).join('/')
  }

  const projectName = (packageJson?.name as string) || path.basename(projectRoot)
  const projectVersion = (packageJson?.version as string) || '0.0.0'
  const projectDesc = (packageJson?.description as string) || '项目规范文档'
  const langExt = analysis.languages.has('TypeScript') ? 'ts' : 'js'

  const deps = packageJson?.dependencies as Record<string, string> | undefined
  const devDeps = packageJson?.devDependencies as Record<string, string> | undefined
  const scripts = packageJson?.scripts as Record<string, string> | undefined
  const compilerOptions = (tsconfig?.compilerOptions as Record<string, unknown>) || {}

  return `# Naughty.md - ${projectName} 项目规范

> 本文档由 NaughtyAgent \`/init\` 命令自动生成
> 最后更新：${new Date().toISOString().split('T')[0]}
> 项目路径：${projectRoot}

## 📋 项目信息

- **项目名称**：${projectName}
- **版本**：${projectVersion}
- **描述**：${projectDesc}
- **项目类型**：${projectType}
- **检测到的语言**：${Array.from(analysis.languages).join(', ') || '未检测到'}

## 🏗️ 项目结构

### 主要目录
${Array.from(analysis.directories).filter((d) => !d.startsWith('.')).slice(0, 10).map((d) => `- \`${d}/\``).join('\n') || '- 无'}

### 配置文件
${analysis.hasPackageJson ? '- ✅ package.json' : '- ❌ package.json'}
${analysis.hasTsConfig ? '- ✅ tsconfig.json' : '- ❌ tsconfig.json'}
${analysis.hasGitignore ? '- ✅ .gitignore' : '- ❌ .gitignore'}
${analysis.hasReadme ? '- ✅ README' : '- ❌ README'}

${packageJson ? `## 🔧 技术栈

### 核心依赖
${deps ? Object.entries(deps).slice(0, 10).map(([name, version]) => `- ${name}: ${version}`).join('\n') : '- 无'}

### 开发依赖
${devDeps ? Object.entries(devDeps).slice(0, 10).map(([name, version]) => `- ${name}: ${version}`).join('\n') : '- 无'}

### NPM Scripts
${scripts ? Object.entries(scripts).map(([name, cmd]) => `- \`npm run ${name}\` - ${cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd}`).join('\n') : '- 无'}
` : ''}

${tsconfig ? `## 📐 TypeScript 配置

\`\`\`json
{
  "target": "${compilerOptions.target || 'ES2022'}",
  "module": "${compilerOptions.module || 'ESNext'}",
  "strict": ${compilerOptions.strict || false}
}
\`\`\`
` : ''}

## 🎯 开发规范建议

### 代码风格
- 类名：PascalCase
- 函数/变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 文件名：kebab-case.${langExt}

### 测试要求
- 测试覆盖率：建议 80%+
- 测试文件：\`*.test.${langExt}\` 或 \`*.spec.${langExt}\`

## 📝 建议的改进

${!analysis.hasGitignore ? '- ⚠️ 建议添加 .gitignore 文件\n' : ''}${!analysis.hasReadme ? '- ⚠️ 建议添加 README 文件\n' : ''}${scripts && !scripts.test ? '- ⚠️ 建议添加测试脚本\n' : ''}${scripts && !scripts.build ? '- ⚠️ 建议添加构建脚本\n' : ''}
---

**注意**：本文档基于当前项目结构自动生成，请根据实际需求调整。
`
}

/**
 * /init 命令定义
 */
export const initCommand: BuiltinCommandDefinition = {
  name: 'init',
  description: '初始化项目，生成 Naughty.md 和 justfile',
  handler: async (_args, _namedArgs, ctx) => {
    const state = ctx.getState()
    const projectRoot = state.cwd

    ctx.addMessage('info', '🔍 分析项目结构...')

    try {
      // 生成 Naughty.md
      const naughtyContent = generateNaughtyMd(projectRoot)
      const naughtyPath = path.join(projectRoot, 'Naughty.md')
      fs.writeFileSync(naughtyPath, naughtyContent, 'utf-8')

      // 生成 justfile（如果不存在）
      const justfilePath = path.join(projectRoot, 'justfile')
      let justfileCreated = false
      if (!fs.existsSync(justfilePath)) {
        const justfileContent = generateProjectJustfile(projectRoot)
        fs.writeFileSync(justfilePath, justfileContent, 'utf-8')
        justfileCreated = true
      }

      const analysis = analyzeProject(projectRoot)
      const languages = Array.from(analysis.languages).join(', ') || '未检测到'

      let output = `✅ 初始化完成！
📄 Naughty.md：${naughtyPath}`
      
      if (justfileCreated) {
        output += `
📁 justfile：${justfilePath}（跨平台兼容）`
      } else {
        output += `
📁 justfile：已存在，跳过生成`
      }
      
      output += `
🔍 检测到的语言：${languages}

💡 提示：使用 /refresh 重新加载命令列表`

      return {
        success: true,
        output,
      }
    } catch (error) {
      return {
        success: false,
        error: `生成失败：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
}
