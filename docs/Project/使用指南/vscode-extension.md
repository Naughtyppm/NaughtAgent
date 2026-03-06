# VS Code 扩展使用指南

> NaughtyAgent VS Code 扩展功能说明

---

## 安装

### 从源码安装

```bash
cd packages/vscode
npm run package
```

生成 `.vsix` 文件后，在 VS Code 中：
1. 打开命令面板（`Ctrl+Shift+P`）
2. 输入 "Install from VSIX"
3. 选择生成的 `.vsix` 文件

### 开发模式

```bash
cd packages/vscode
npm run watch
```

然后按 `F5` 启动扩展开发主机。

---

## 功能概览

### 聊天面板

侧边栏 Chat 面板，支持：
- 多轮对话
- 流式输出
- Markdown 渲染
- 代码高亮

### 上下文收集

自动收集：
- 当前打开的文件
- 选中的代码
- 工作区信息

### Diff 预览

文件修改前会显示 Diff 预览，确认后才应用。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+A` | 打开聊天面板 |
| `Ctrl+Shift+E` | 发送选中代码给 Agent |

---

## 命令

打开命令面板（`Ctrl+Shift+P`），输入 "NaughtyAgent"：

| 命令 | 功能 |
|------|------|
| NaughtyAgent: Open Chat | 打开聊天面板 |
| NaughtyAgent: Ask About Selection | 询问选中代码 |
| NaughtyAgent: Explain Code | 解释选中代码 |
| NaughtyAgent: Fix Code | 修复选中代码 |
| NaughtyAgent: New Session | 新建会话 |
| NaughtyAgent: Select Session | 选择会话 |
| NaughtyAgent: Reconnect | 重新连接 Daemon |

---

## 右键菜单

在编辑器中选中代码，右键菜单：

- **Ask NaughtyAgent** - 询问选中代码
- **Explain with NaughtyAgent** - 解释代码
- **Fix with NaughtyAgent** - 修复代码

---

## 配置

在 VS Code 设置中搜索 "naughtyagent"：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `naughtyagent.serverUrl` | Daemon 服务地址 | `http://localhost:31415` |
| `naughtyagent.defaultAgent` | 默认 Agent 类型 | `build` |
| `naughtyagent.autoConfirm.read` | 自动确认读取 | `true` |
| `naughtyagent.autoConfirm.write` | 自动确认写入 | `false` |
| `naughtyagent.autoConfirm.bash` | 自动确认命令 | `false` |
| `naughtyagent.includeCurrentFile` | 包含当前文件 | `true` |
| `naughtyagent.includeSelection` | 包含选中代码 | `true` |

### settings.json 示例

```json
{
  "naughtyagent.serverUrl": "http://localhost:31415",
  "naughtyagent.defaultAgent": "build",
  "naughtyagent.autoConfirm.read": true,
  "naughtyagent.autoConfirm.write": false,
  "naughtyagent.autoConfirm.bash": false,
  "naughtyagent.includeCurrentFile": true,
  "naughtyagent.includeSelection": true
}
```

---

## 使用流程

### 1. 启动 Daemon

确保 Daemon 服务已启动：

```bash
na daemon start
```

### 2. 打开聊天面板

- 点击侧边栏 NaughtyAgent 图标
- 或使用快捷键 `Ctrl+Shift+A`

### 3. 开始对话

在输入框中输入问题或指令：

```
帮我看看这个文件有什么问题
```

### 4. 确认修改

当 Agent 需要修改文件时：
1. 会显示 Diff 预览
2. 点击"应用"确认修改
3. 或点击"拒绝"取消

---

## 状态栏

状态栏显示：
- 连接状态（已连接/断开）
- 当前 Agent 类型
- 当前权限模式

点击状态栏可快速切换模式。

---

## 常见问题

### Q: 扩展无法连接到 Daemon？

A: 检查：
1. Daemon 是否已启动（`na daemon status`）
2. 端口是否正确（默认 31415）
3. 防火墙是否阻止连接

### Q: 如何查看 Agent 的详细日志？

A: 打开 VS Code 输出面板（`Ctrl+Shift+U`），选择 "NaughtyAgent" 通道。

### Q: 修改没有生效？

A: 确认在 Diff 预览中点击了"应用"按钮。

---

## 当前限制

VS Code 扩展目前处于基础阶段，以下功能尚未实现：

- ❌ 内联代码补全
- ❌ Code Actions
- ❌ 诊断集成
- ❌ 文件装饰器
- ❌ 终端集成

这些功能计划在后续版本中实现。

---

> 文档生成日期：2026-02-27
