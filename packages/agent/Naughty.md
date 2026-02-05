# Naughty.md - @naughtyagent/agent 项目规范

> 本文档由 NaughtyAgent `/init` 命令自动生成，记录项目的开发规范和约束。
> 最后更新：2026-02-05
> 项目路径：D:\WorkSpace\AI\NaughtAgent\packages\agent

## 📋 项目信息

- **项目名称**：@naughtyagent/agent
- **版本**：0.1.0
- **描述**：NaughtyAgent 核心 Agent 服务
- **项目类型**：Node.js
- **检测到的语言**：TypeScript

## 🏗️ 项目结构

### 主要目录
- `coverage/`
- `dist/`
- `examples/`
- `node_modules/`
- `prompts/`
- `scripts/`
- `src/`
- `test/`

### 配置文件
- ✅ package.json
- ✅ tsconfig.json
- ❌ .gitignore
- ❌ README

## 🔧 技术栈

### 核心依赖
- @ai-sdk/anthropic: ^3.0.13
- @ai-sdk/openai: ^3.0.7
- @anthropic-ai/sdk: ^0.72.1
- @inkjs/ui: ^2.0.0
- ai: ^6.0.34
- dotenv: ^17.2.3
- fast-glob: ^3.3.3
- ink: 5
- json-schema-to-zod: ^2.7.0
- minimatch: ^10.1.1

### 开发依赖
- @types/bun: latest
- @types/minimatch: ^6.0.0
- @types/react: ^19.2.10
- @vitest/coverage-v8: ^4.0.17
- fast-check: ^3.22.0
- ink-testing-library: ^4.0.0
- tsup: ^8.3.5
- typescript: ^5.7.3
- vitest: ^4.0.17

### NPM Scripts
- `npm run dev` - bun run src/cli.ts
- `npm run build` - tsup
- `npm run postinstall` - node scripts/install-justfile.cjs
- `npm run start` - node dist/cli/cli.js
- `npm run typecheck` - tsc --noEmit
- `npm run test` - vitest run
- `npm run test:watch` - vitest
- `npm run test:coverage` - vitest run --coverage


## 📐 TypeScript 配置

### 编译选项
```json
{
  "target": "ES2022",
  "module": "ESNext",
  "strict": true
}
```


## 🎯 开发规范建议

### 代码风格
1. **命名约定**
   - 类名：PascalCase (例如：`UserService`)
   - 函数/变量：camelCase (例如：`getUserById`)
   - 常量：UPPER_SNAKE_CASE (例如：`MAX_RETRY_COUNT`)
   - 文件名：kebab-case (例如：`user-service.ts`)

2. **目录结构建议**
   ```
   @naughtyagent/agent/
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
3. **测试命名**：`*.test.ts` 或 `*.spec.ts`

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

- ⚠️ 建议添加 .gitignore 文件
- ⚠️ 建议添加 README 文件




---

**注意**：本文档基于当前项目结构自动生成，请根据实际需求调整。
定期运行 `/init` 命令可更新此文档。
