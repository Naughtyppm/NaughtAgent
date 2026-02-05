# 开发工作流规范

## 构建与安装

每次修改 `packages/agent` 中的代码后，必须执行以下步骤：

### 1. 构建

```bash
cmd /c "pnpm --filter @naughtyagent/agent build"
```

### 2. 全局链接

```bash
cd packages/agent
cmd /c "npm link"
```

这会将 `naughty` 命令链接到全局，使其可在任意目录使用。

## 测试要求

### 强制测试场景

以下场景**必须**在终端中实际测试：

1. **功能开发完成后** - 新功能实现后必须测试
2. **Bug 修复后** - 修复完成后必须验证
3. **UI/交互相关修改** - 涉及 Ink 组件的修改必须测试
4. **命令系统修改** - 涉及命令解析、执行的修改必须测试

### 测试方法

在工作区内启动 NaughtyAgent 进行测试：

```bash
# 方式 1：使用全局命令（需要先 npm link）
naughty --ui ink

# 方式 2：直接运行构建产物
node packages/agent/dist/cli/cli.js --ui ink
```

### 测试检查点

- [ ] 命令是否正确识别和执行
- [ ] 错误提示是否友好
- [ ] UI 交互是否流畅
- [ ] 无重复执行或异常行为

## 快速命令

```bash
# 一键构建并链接
cmd /c "pnpm --filter @naughtyagent/agent build" && cd packages/agent && cmd /c "npm link"

# 运行单元测试
pnpm -C packages/agent test

# 运行特定测试
pnpm -C packages/agent test -- --grep "测试名称"
```

## 注意事项

- Windows 环境使用 `cmd /c` 绕过 PowerShell 执行策略
- 测试时注意观察终端输出，确认无错误信息
- 如遇到 "未知命令" 等错误，检查命令注册和路由逻辑
