#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 读取项目配置
const projectRoot = process.cwd();

// 分析项目结构
function analyzeProject() {
  const analysis = {
    hasPackageJson: false,
    hasTsConfig: false,
    hasGitignore: false,
    hasReadme: false,
    languages: new Set(),
    frameworks: new Set(),
    buildTools: new Set(),
    directories: new Set()
  };

  try {
    const files = fs.readdirSync(projectRoot);
    
    files.forEach(file => {
      const filePath = path.join(projectRoot, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        analysis.directories.add(file);
        // 检测框架和工具
        if (file === 'node_modules') analysis.frameworks.add('Node.js');
        if (file === 'venv' || file === '.venv') analysis.frameworks.add('Python');
        if (file === 'vendor') analysis.frameworks.add('PHP/Go');
      } else {
        // 检测配置文件
        if (file === 'package.json') analysis.hasPackageJson = true;
        if (file === 'tsconfig.json') analysis.hasTsConfig = true;
        if (file === '.gitignore') analysis.hasGitignore = true;
        if (file.toLowerCase().startsWith('readme')) analysis.hasReadme = true;
        
        // 检测语言
        const ext = path.extname(file);
        if (ext === '.ts' || ext === '.tsx') analysis.languages.add('TypeScript');
        if (ext === '.js' || ext === '.jsx') analysis.languages.add('JavaScript');
        if (ext === '.py') analysis.languages.add('Python');
        if (ext === '.go') analysis.languages.add('Go');
        if (ext === '.rs') analysis.languages.add('Rust');
        if (ext === '.java') analysis.languages.add('Java');
        
        // 检测构建工具
        if (file === 'Cargo.toml') analysis.buildTools.add('Cargo');
        if (file === 'go.mod') analysis.buildTools.add('Go Modules');
        if (file === 'pom.xml') analysis.buildTools.add('Maven');
        if (file === 'build.gradle') analysis.buildTools.add('Gradle');
      }
    });
  } catch (error) {
    console.error('分析项目结构时出错:', error.message);
  }

  return analysis;
}

// 尝试读取 package.json
let packageJson = null;
try {
  packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
} catch (error) {
  // package.json 不存在，使用默认值
}

// 尝试读取 tsconfig.json
let tsconfig = null;
try {
  tsconfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf-8'));
} catch (error) {
  // tsconfig.json 不存在，使用默认值
}

// 分析项目
const analysis = analyzeProject();

// 确定项目类型
let projectType = 'Unknown';
if (packageJson) {
  projectType = 'Node.js';
} else if (analysis.languages.has('Python')) {
  projectType = 'Python';
} else if (analysis.languages.has('Go')) {
  projectType = 'Go';
} else if (analysis.languages.has('Rust')) {
  projectType = 'Rust';
} else if (analysis.languages.has('Java')) {
  projectType = 'Java';
} else if (analysis.languages.size > 0) {
  projectType = Array.from(analysis.languages).join('/');
}

// 生成文档内容
const projectName = packageJson?.name || path.basename(projectRoot);
const projectVersion = packageJson?.version || '0.0.0';
const projectDesc = packageJson?.description || '项目规范文档';

const content = `# Naughty.md - ${projectName} 项目规范

> 本文档由 NaughtyAgent \`/init\` 命令自动生成，记录项目的开发规范和约束。
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
${Array.from(analysis.directories).filter(d => !d.startsWith('.')).slice(0, 10).map(d => `- \`${d}/\``).join('\n') || '- 无'}

### 配置文件
${analysis.hasPackageJson ? '- ✅ package.json' : '- ❌ package.json'}
${analysis.hasTsConfig ? '- ✅ tsconfig.json' : '- ❌ tsconfig.json'}
${analysis.hasGitignore ? '- ✅ .gitignore' : '- ❌ .gitignore'}
${analysis.hasReadme ? '- ✅ README' : '- ❌ README'}

${packageJson ? `## 🔧 技术栈

### 核心依赖
${Object.entries(packageJson.dependencies || {}).slice(0, 10).map(([name, version]) => `- ${name}: ${version}`).join('\n') || '- 无'}

### 开发依赖
${Object.entries(packageJson.devDependencies || {}).slice(0, 10).map(([name, version]) => `- ${name}: ${version}`).join('\n') || '- 无'}

### NPM Scripts
${Object.entries(packageJson.scripts || {}).map(([name, cmd]) => `- \`npm run ${name}\` - ${cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd}`).join('\n') || '- 无'}
` : ''}

${tsconfig ? `## 📐 TypeScript 配置

### 编译选项
\`\`\`json
{
  "target": "${tsconfig.compilerOptions?.target || 'ES2022'}",
  "module": "${tsconfig.compilerOptions?.module || 'ESNext'}",
  "strict": ${tsconfig.compilerOptions?.strict || false}
}
\`\`\`
` : ''}

## 🎯 开发规范建议

### 代码风格
1. **命名约定**
   - 类名：PascalCase (例如：\`UserService\`)
   - 函数/变量：camelCase (例如：\`getUserById\`)
   - 常量：UPPER_SNAKE_CASE (例如：\`MAX_RETRY_COUNT\`)
   - 文件名：kebab-case (例如：\`user-service.${analysis.languages.has('TypeScript') ? 'ts' : 'js'}\`)

2. **目录结构建议**
   \`\`\`
   ${projectName}/
   ├── src/           # 源代码
   ├── test/          # 测试文件
   ├── docs/          # 文档
   ├── scripts/       # 脚本工具
   └── dist/          # 构建输出
   \`\`\`

3. **版本控制**
   - 使用 Git 进行版本管理
   - 提交信息遵循约定式提交规范
   - 重要变更记录在 CHANGELOG

### 测试要求
1. **测试覆盖率**：建议 80%+
2. **测试文件位置**：与源码文件同目录或独立 \`test/\` 目录
3. **测试命名**：\`*.test.${analysis.languages.has('TypeScript') ? 'ts' : 'js'}\` 或 \`*.spec.${analysis.languages.has('TypeScript') ? 'ts' : 'js'}\`

### 文档规范
- 公共 API 必须有注释说明
- 复杂逻辑需要解释性注释
- 保持 README 更新

## 🔒 安全规范

- 敏感信息使用环境变量
- API 密钥不提交到代码库
- 用户输入必须验证和清理
- 定期更新依赖包

## 📝 建议的改进

${!analysis.hasGitignore ? '- ⚠️ 建议添加 .gitignore 文件' : ''}
${!analysis.hasReadme ? '- ⚠️ 建议添加 README 文件' : ''}
${packageJson && !packageJson.scripts?.test ? '- ⚠️ 建议添加测试脚本' : ''}
${packageJson && !packageJson.scripts?.build ? '- ⚠️ 建议添加构建脚本' : ''}
${analysis.languages.has('TypeScript') && !analysis.hasTsConfig ? '- ⚠️ 建议添加 tsconfig.json 配置' : ''}

---

**注意**：本文档基于当前项目结构自动生成，请根据实际需求调整。
定期运行 \`/init\` 命令可更新此文档。
`;

// 写入文件
fs.writeFileSync(path.join(projectRoot, 'Naughty.md'), content, 'utf-8');

console.log('✅ Naughty.md 已生成！');
console.log('📄 文件位置：' + path.join(projectRoot, 'Naughty.md'));
console.log('📊 项目类型：' + projectType);
console.log('🔍 检测到的语言：' + (Array.from(analysis.languages).join(', ') || '未检测到'));
