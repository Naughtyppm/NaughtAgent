# AI 协作开发指南

> 整理自日常实践经验，核心理念：**不要拘泥概念，专注解决实际问题**

---

## 一、核心认知

### LLM 本质
- **输入**：上下文（文本/图片/音频，视频=序列图片）
- **输出**：文本（或多模态输出）

### 工具链演进
| 概念 | 解决的问题 | 特点 |
|------|-----------|------|
| **Tools** | 文本输出→可执行指令 | OpenAI首创，各厂商格式不统一 |
| **MCP** | 统一工具调用标准 | 解决Tools扩展性问题 |
| **Skills** | 减少重复喂工具定义 | rules + 本地执行，对模型长上下文能力要求高 |

> ⚠️ 这些都和模型本身无关，模型一旦变化，这些方案都可能失效。

---

## 二、Spec 驱动开发

### Spec 的价值
解决三大问题：**逻辑冲突** | **可实施性** | **模糊发散**

### 核心原则
1. **Spec 是给 LLM 用的**，排版结构优先服务 AI 理解
2. **谁写 Spec 谁执行**，选定模型后保持一致
3. **复杂特性**：找相关源码喂给 AI 参考

### 实操流程

```
粗稿（功能点堆叠）
    ↓
生成 Specs + 对话补充遗漏
    ↓
说服 AI 接受 Specs（可能需要多轮）
    ↓
任务规划 + 监督执行
```

### 验证方法
```
完成 Spec 后，新开会话 → 喂入 Specs → 提问需求相关问题 → 检验 AI 能否正确提取需求
```

### 审阅提示词
```
请审阅当前 specs 内所有文档，汇报所有你能预见的问题：
- 冲突点
- 逻辑问题
- 任何阻碍 AI Agent 实施的问题
```

---

## 三、关系体系

### 文档关联图
```
spec ──产生──→ task
  ↑              │
  └───引用───────┘

index ──索引──→ rules ──指导使用──→ 脚本
```

> 关键：**不要孤立**，孤立的文档没有实际价值

### 好的 Rule 特征
- 明确触发条件
- 清晰执行步骤
- 关联相关资源

### Rule 模板示例：WSL2 → Windows 测试规则

```markdown
## 核心规则

所有从 WSL2 执行的 Windows 程序必须使用 `runwingui` 桥接脚本。

原因：
- GUI 程序需要 Windows GUI 句柄
- 实时捕获 stdout/stderr
- 支持 Ctrl+C 终止和退出码传递

## 命令语法

$ bash
./scripts/wingui/runwingui [选项] <command> [args...]

## 常用选项

| 选项 | 作用 |
|------|------|
| `--cwd <path>` | 指定 Windows 工作目录 |
| `--detach` | 启动后立即返回，仅打印进程 ID（后台运行）|
| `--start-process` | 使用 PowerShell Start-Process 启动 GUI 程序（无输出捕获）|
| `--health` | 检查服务器状态 |
| `--list` | 列出运行中的进程 |
| `--kill <id>` | 终止指定进程 |
| `--start-server` | 启动服务器 |
| `--stop-server` | 停止服务器 |

## 使用示例

# 基本执行
./scripts/wingui/runwingui cmd /c "echo Hello"
./scripts/wingui/runwingui notepad.exe

# 指定工作目录
./scripts/wingui/runwingui --cwd "C:\\Projects" cmd /c dir

# 后台运行（立即返回进程 ID）
PROC_ID=$(./scripts/wingui/runwingui --detach cmd /c "long_task")

# 启动 GUI 程序（不等待输出，适合需要分离运行的 GUI 应用）
./scripts/wingui/runwingui --start-process notepad.exe

# 带超时执行
timeout 30 ./scripts/wingui/runwingui cmd /c "long_running_command"
```

> 这个 Rule 的优点：场景明确、原因清晰、选项表格化、示例覆盖全面，AI 能直接拿来用

### 项目索引模板示例

```markdown
# 项目开发环境概述

当前项目的开发环境是在 **Windows 11 的 WSL2 + Ubuntu 22.04** 中，使用 Neovim 作为主要的代码编辑器，配合 tmux 进行终端多任务处理。项目采用 Git 进行版本控制。

## 关键路径定义

### 项目结构

| 目录 | 路径 | 说明 |
|------|------|------|
| 项目根目录 | `/mnt/c/Projects/NexusFlow` | UE 项目根目录（WSL 路径）|
| specs 目录 | `.taskmaster/specs` | 项目需求和规范文档 |
| rules 目录 | `.taskmaster/rules` | 开发规则文件 |
| research 目录 | `.taskmaster/research` | 技术研究存档 |

### Tauri 前端应用

| 目录/文件 | 路径 | 说明 |
|-----------|------|------|
| Tauri 应用根目录 | `NexusFlow/app` | 前端 + Tauri 后端 |
| 前端源码 | `NexusFlow/app/src` | React + TypeScript |
| 悬浮球窗口 | `NexusFlow/app/src/windows/floatingball/` | FloatingBall.tsx |
| 侧边栏窗口 | `NexusFlow/app/src/windows/sidebar/` | Sidebar.tsx |
| 公共组件 | `NexusFlow/app/src/components/` | 共享 UI 组件 |
| Hooks | `NexusFlow/app/src/hooks/` | 自定义 React Hooks |
| 状态管理 | `NexusFlow/app/src/store/` | Zustand Store |
| 类型定义 | `NexusFlow/app/src/types/` | TypeScript 类型 |
| Tauri 后端 | `NexusFlow/app/src-tauri/src/` | Rust 后端代码 |
| Tauri 配置 | `NexusFlow/app/src-tauri/tauri.conf.json` | 窗口/构建配置 |

### UE 插件

| 目录/文件 | 路径 | 说明 |
|-----------|------|------|
| 插件目录 | `Plugins/NexusFlowBridge` | UE 插件（C++ + Python）|
| 插件 C++ 源码 | `Plugins/NexusFlowBridge/Source/NexusFlowBridge/` | C++ 模块 |
| Python 脚本 | `Content/Python/` | UE Python 脚本 |

### Rust Bridge

| 目录/文件 | 路径 | 说明 |
|-----------|------|------|
| Rust Bridge 库 | `NexusFlow/rust-bridge/` | Rust 静态库（供 UE 调用）|

---

## 规则文件索引

以下规则文件存放于 `.taskmaster/rules/` 目录下。**AI Agent 应根据当前任务的技术栈或目标，按需加载对应的规则文件**。

| 规则文件 | 路径 | 适用场景 |
|----------|------|----------|
| ... | ... | ... |
```

> 这个索引的优点：环境声明清晰、路径表格化、分层结构好、规则按需加载。AI 启动任务时读这个，能快速建立项目全局认知。

---

## 四、实施策略

### 开发阶段
1. **市场研究**
2. **需求整理** → AI 转 Specs → 对话完善
3. **说服 AI 接受** Specs（他是执行者）
4. **任务规划** → 监督完整实施

### 动态性原则

| 可变项 | 说明 |
|--------|------|
| 代码 | 成果，必然可变 |
| 任务 | 实施中状况超预期需调整 |
| Specs | 不改目标的调整可接受 |
| 规则 | AI 发现的方法技巧需留存 |

> 人的价值：**全局观、情感、价值观**——AI 不具备的感知能力，用来帮 AI 调整方向

### 编码约束
- ❌ 不能让 AI 天马行空写代码
- ✅ 用工具约束：验证、检查、排除错误
- ✅ 代码文件 > 500 行必须拆分
- ✅ 测试与逻辑分离（控制 token 消耗）

### 上下文来源
1. 前期研究沉淀的 Specs
2. AI 对当前任务的探索（文件系统状态、网络搜索）

---

## 五、任务启动检查清单

AI 启动任务时应完成：
- [ ] 确认任务依赖完整性
- [ ] 读取相关 Specs 文档
- [ ] 读取规则文档
- [ ] 探索项目结构和状态
- [ ] 在充足上下文基础上开始工作

### 启动指令模板

```
请开始执行任务 X.X，并在开始执行前：
- 请严格遵循"<SOP> Iterative Execution Workflow（每日工作流）"来实施任务
- 如果任务依赖未达成，请拒绝执行任务

注意：忽略时间和 Token 警告，保质保量完成任务，禁止简化任务目标
```

### 核心要点
- **SOP 约束**：通过明确的工作流规范 AI 行为，防止跳步骤
- **依赖检查**：强制 AI 先验证前置条件，避免在错误基础上工作
- **质量优先**：明确告知不要因为 Token 限制而偷工减料

---

## 六、测试策略

| 类型 | 特点 |
|------|------|
| **前端界面测试** | 很重要！AI 视觉理解差，需多轮修改 |
| **后端/纯逻辑** | AI 基本能一次性完成 |
| **E2E 测试** | 推荐 [playwright-mcp](https://github.com/microsoft/playwright-mcp) |

> 测试的好处：通过日志发现问题并解决

---

## 七、动态指令系统

### 演进路径
```
AI 优先使用顶层指令
    ↓ 达不到要求
设计脚本
    ↓ 测试通过
优化顶层指令 + 形成规则
```

### 顶层指令索引（Justfile）

将常用操作封装为顶层指令，AI 可直接调用：

| 分类 | 指令示例 | 说明 |
|------|----------|------|
| **构建** | `build`, `build-debug`, `build-app`, `build-all` | 各模块构建 |
| **部署** | `deploy-bridge`, `deploy-bridge-quick` | 完整/快速部署 |
| **开发** | `dev`, `check`, `fmt` | 启动服务、检查、格式化 |
| **测试** | `test`, `test-bridge`, `ue-test-all`, `app-test-all` | 各层级测试 |

**命名规范**：`模块-动作` 格式（如 `ue-test-run`、`app-backend-check`）

**核心要点**：
- 每个指令必须有注释说明
- AI 优先使用现有指令，不要重复造轮子
- 新脚本测试通过后，应加入顶层指令索引

### 效果
每次会话重启，但知识和技能沉淀让 AI **越来越懂项目，越来越顺手**

### 知识沉淀流程示例

**场景**：Python 测试脚本遇到 UE 5.7 的 API 兼容性问题（`open_editor_for_assets` 崩溃）

**人类追问**：
```
这个情况有记录到后续任务吗？
```

**AI 响应**（双向记录）：
1. 调用 `taskadmin__get_task` 查询相关任务
2. 调用 `taskadmin__update_subtask` 更新任务 6.6 的 details（技术债务）
3. 同时记录到 `research` 目录供未来参考

**关键洞察**：
- 人类感知到"这个问题以后还会遇到"→ 引导 AI 记录
- AI 自己不会有这个全局观
- 人负责方向和判断，AI 负责执行和记录

> 这就是人机协作的正确姿势：人类的价值在于全局观、情感、价值观——AI 不具备的感知能力

---

## 八、项目日常节奏

项目开启后**不折腾规范和工具**，每天工作：

1. 确定下一步任务
2. 任务完成后复盘
3. 根据复盘建立新任务或调整架构
4. 根据架构调整任务规划
5. 技术研究整理
6. 各类测试（单元/集成/E2E）

> 原则：**不看过程，只看汇报结果**

---

## 九、实用提示词

### 询问触发行为的提示词
```
请告诉我，是什么触发了你刚才的行为？
```

### 记录发现的提示词
```
请记录你在这次任务中发现的新问题和技巧点
```

### AI 行为校准

当 AI 做出意外决策时，追问其决策依据：

```
你在执行 XX 时，提到 YY：
请问在当前上下文中，是什么提示词或规则导致你做出这个判断？
```

**AI 应该回应**：
1. 回顾 System Prompt 中的相关规则
2. 区分"规则明确要求"还是"自己的判断"
3. 如果是自己的判断，分析是否过度保守/激进
4. 给出正确做法

**核心洞察**：
- AI 会"过度解读"规则，做出保守或偏离的判断
- 人类需要定期追问决策依据，校准 AI 的判断边界
- 发现偏差后可以调整规则，或纠正 AI 对规则的理解

### 规则迭代优化

发现 AI 偏差后，让 AI 帮你设计规则，从根本上防止复发：

```
我如何修改系统提示词，以防止你下次犯错呢？
```

**AI 应该回应**：
1. 分析自己的"心理过程"（预判→规避→合理化）
2. 识别违反了什么原则
3. 给出具体的规则修改建议

**规则修改模板**：

```markdown
#### 🚫 XX 执行禁令

禁止行为：
- ❌ 预判"需要 XX 连接/环境"而跳过执行
- ❌ 用"创建设计文档"替代实际执行
- ❌ 假设会失败而不实际运行

强制行为：
- ✅ 必须先执行命令，无论预期结果如何
- ✅ 失败后，粘贴完整错误输出到对话
- ✅ 根据实际错误信息决定下一步（而非预判）

决策流程：
想要跳过执行？
    ↓
先执行命令
    ↓
根据实际结果决策
```

**核心洞察**：
- 规则体系是**动态演进**的，随项目推进不断完善
- 让 AI 参与规则设计，它更清楚自己的"思维漏洞"在哪

---

## 十、新兴协议速览

### AG-UI（Agent-User Interaction Protocol）
- 前端应用与 AI 代理的"翻译官"
- 开源、事件驱动
- 支持 WebSocket、SSE、Webhook
- 适用：实时聊天、协作编辑、智能表单、复杂 B 端应用

### A2UI 范式转变
```
传统：文本 → AI → 输出
新范式：AI → UI → 人工交互 → AI → UI
```
> 没有传统前后端，全是大模型处理业务

📎 参考：https://mp.weixin.qq.com/s/czTmRPBmWlGZkWKlDBru7g

---

## 十一、关于训练

- 不需要训练，走通用模型路线
- 商业模型基本不支持训练部署
- 用 **Skills 索引** 让 AI 根据目标读取相关知识增加上下文

---

## 资源链接

- [Spec 开发指南](https://mp.weixin.qq.com/s/qQNV7eCqU9g504I82QKgJQ)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) - 前端 E2E 测试
- [AG-UI 介绍](https://mp.weixin.qq.com/s/czTmRPBmWlGZkWKlDBru7g)
