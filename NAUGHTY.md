# Naughty.md - naughtyagent 项目规范

> 本文档由 NaughtyAgent `/init` 命令自动生成，记录项目的开发规范和约束。
> 最后更新：2026-02-05
> 项目路径：D:\WorkSpace\AI\NaughtAgent

## 📋 项目信息

- **项目名称**：naughtyagent
- **版本**：0.1.0
- **描述**：NaughtyAgent - AI 编程助手
- **项目类型**：Node.js
- **检测到的语言**：未检测到

## 🏗️ 项目结构

### 主要目录
- `Agent相关/`
- `docs/`
- `node_modules/`
- `opencode/`
- `packages/`
- `SnapMind-v2.0.0/`

### 配置文件
- ✅ package.json
- ❌ tsconfig.json
- ✅ .gitignore
- ✅ README

## 🔧 技术栈

### 核心依赖
- 无

### 开发依赖
- 无

### NPM Scripts
- `npm run dev` - pnpm -C packages/agent dev
- `npm run build` - pnpm -C packages/agent build
- `npm run typecheck` - pnpm -C packages/agent typecheck




## 🎯 开发规范建议

### 代码风格
1. **命名约定**
   - 类名：PascalCase (例如：`UserService`)
   - 函数/变量：camelCase (例如：`getUserById`)
   - 常量：UPPER_SNAKE_CASE (例如：`MAX_RETRY_COUNT`)
   - 文件名：kebab-case (例如：`user-service.js`)

2. **目录结构建议**
   ```
   naughtyagent/
   ├── src/           # 源代码
   ├── test/          # 测试文件
   ├── docs/          # 文档
   ├── scripts/       # 脚本工具
   └── dist/          # 构建输出
   ```

3. **版本控制**
   - 使用 Git 进行版本管理
   - 提交信息遵循约定式提交规范
   - 重要变更记录在 CHANGELOG

### 测试要求
1. **测试覆盖率**：建议 80%+
2. **测试文件位置**：与源码文件同目录或独立 `test/` 目录
3. **测试命名**：`*.test.js` 或 `*.spec.js`

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



- ⚠️ 建议添加测试脚本



---

**注意**：本文档基于当前项目结构自动生成，请根据实际需求调整。
定期运行 `/init` 命令可更新此文档。
