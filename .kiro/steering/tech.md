# 技术栈

## 核心架构

- **基于 Claude Agent SDK** - 使用 `@anthropic-ai/claude-agent-sdk` 作为核心
- 参考：https://github.com/anthropics/claude-agent-sdk-typescript

## 语言与运行时

- TypeScript（ES2022 目标）
- Node.js / Bun 运行时
- ESM 模块（`"type": "module"`）

## 包管理

- pnpm（monorepo，使用 `pnpm-workspace.yaml`）
- 工作区：`packages/*`

## 构建工具

- **tsup**：Agent 包的 TypeScript 打包器
- **esbuild**：VS Code 扩展打包器
- **tsc**：类型检查

## 测试

- **vitest**：测试运行器，使用 v8 覆盖率
- 测试文件：`test/**/*.test.ts`
- 覆盖率阈值：语句 80%，分支 75%，函数 85%，行 80%

## 主要依赖

### Agent 包
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK（核心）
- `zod` - Schema 验证
- `fast-glob` - 文件 glob 匹配
- `minimatch` - 模式匹配

### VS Code 扩展
- `ws` - WebSocket 客户端
- `@types/vscode` - VS Code API 类型

## 常用命令

```bash
# 开发
pnpm dev                    # 开发模式运行 agent
pnpm build                  # 构建 agent 包
pnpm typecheck              # 类型检查

# 测试
pnpm -C packages/agent test           # 运行测试
pnpm -C packages/agent test:watch     # 监听模式
pnpm -C packages/agent test:coverage  # 带覆盖率

# VS Code 扩展
cd packages/vscode
npm run build               # 构建扩展
npm run watch               # 监听模式
npm run package             # 创建 .vsix
```

## TypeScript 配置

- 严格模式启用
- 路径别名：`@/*` → `./src/*`
- 模块解析：bundler
- 生成声明文件

## 开发规范

1. **始终用中文交流** - 所有对话、注释、文档使用中文
2. **不要破坏现有代理模式** - 修改代码时保持现有架构和设计模式
3. **谨慎修改环境变量** - 不要轻易更改环境变量配置