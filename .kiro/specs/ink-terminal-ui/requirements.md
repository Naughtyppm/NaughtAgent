# 需求文档

## 简介

本文档定义了使用 Ink (React for CLI) 重写 NaughtyAgent 终端 UI 的需求。目标是实现类似 Claude Code 的交互式终端体验，包括可折叠的工具调用显示、交互式权限确认菜单、实时状态更新等功能。

## 术语表

- **Ink_UI**: 基于 Ink 框架构建的终端用户界面组件系统
- **Tool_Panel**: 显示工具调用信息的可折叠面板组件
- **Permission_Dialog**: 交互式权限确认对话框组件
- **Status_Indicator**: 显示当前执行状态的指示器组件（思考中、执行中等）
- **Message_View**: 显示对话消息的视图组件
- **REPL_App**: 基于 Ink 的主应用组件，替代现有的 repl.ts
- **Runner**: 现有的 Agent 执行器，负责运行 Agent 并处理权限
- **Collapse_State**: 工具面板的折叠/展开状态

## 需求列表

### 需求 1: Ink 框架集成

**用户故事:** 作为开发者，我希望使用 Ink 框架构建终端 UI，以便获得基于 React 的交互式 CLI 体验。

#### 验收标准

1. Ink_UI 必须使用 Ink 框架 4.x 或更高版本作为渲染引擎
2. Ink_UI 必须使用 @inkjs/ui 组件库提供标准 UI 组件
3. Ink_UI 必须与现有 Runner 接口兼容，无需修改
4. Ink_UI 必须支持 Windows、macOS 和 Linux 终端
5. Ink_UI 必须优雅地处理终端窗口大小变化事件

### 需求 2: 可折叠工具调用显示

**用户故事:** 作为用户，我希望以可折叠的格式查看工具调用，以便在需要时查看执行详情，同时保持对话界面简洁。

#### 验收标准

1. 当工具开始执行时，Tool_Panel 必须显示折叠的摘要，包含工具名称和简短的输入描述
2. 当工具执行完成时，Tool_Panel 必须更新显示成功/错误状态和简短的结果摘要
3. 当用户按下 Ctrl+O 时，Tool_Panel 必须在折叠和展开状态之间切换
4. 当 Tool_Panel 处于展开状态时，必须显示完整的输入参数和输出内容
5. Tool_Panel 必须使用视觉指示器（图标/颜色）区分不同的工具类型（read、write、bash 等）
6. Tool_Panel 必须在同一会话的多次工具调用中保持折叠状态

### 需求 3: 交互式权限确认

**用户故事:** 作为用户，我希望有一个交互式的权限确认菜单，以便通过清晰的选项轻松批准或拒绝操作。

#### 验收标准

1. 当触发权限请求时，Permission_Dialog 必须显示一个模态对话框，包含操作详情
2. Permission_Dialog 必须提供可选择的选项：允许 (y)、总是允许 (a)、拒绝 (n)、跳过任务 (s)
3. Permission_Dialog 必须支持键盘导航（方向键）和直接按键快捷方式
4. 当用户选择"总是允许"时，Permission_Dialog 必须为当前会话切换到自动确认模式
5. Permission_Dialog 必须显示操作类型、资源路径和简短描述
6. 如果用户按下 Escape，Permission_Dialog 必须默认为"拒绝"

### 需求 4: 实时状态显示

**用户故事:** 作为用户，我希望看到实时状态更新，以便了解 Agent 当前正在做什么。

#### 验收标准

1. 当 Agent 正在处理时，Status_Indicator 必须显示带有状态文本的动画 spinner
2. 当 Agent 开始思考时，Status_Indicator 必须显示"思考中..."和当前上下文
3. 当工具正在执行时，Status_Indicator 必须显示工具名称和简短描述
4. 当 Agent 完成响应时，Status_Indicator 必须清除并返回输入模式
5. Status_Indicator 必须平滑更新，不出现闪烁或布局跳动

### 需求 5: 消息显示与布局

**用户故事:** 作为用户，我希望有一个干净的消息显示界面和适当的间距，以便对话易于阅读。

#### 验收标准

1. Message_View 必须使用独特的标题显示用户消息（如 "═══ Me ═══"）
2. Message_View 必须使用包含模型名称的标题显示 AI 消息（如 "═══ Claude ═══"）
3. Message_View 必须正确渲染 Markdown 内容（代码块、粗体、列表等）
4. Message_View 必须在消息之间保持一致的间距
5. Message_View 必须支持 AI 响应的流式文本显示
6. Message_View 必须正确处理长内容的换行

### 需求 6: 命令输入与快捷键

**用户故事:** 作为用户，我希望使用命令和键盘快捷键，以便高效地控制 Agent。

#### 验收标准

1. REPL_App 必须支持所有现有的斜杠命令（/help、/clear、/agent、/model、/exit 等）
2. 当用户按下 Escape 或 Alt+P 时，REPL_App 必须切换到手动确认模式
3. 当用户在任务执行期间按下 Ctrl+C 时，REPL_App 必须取消当前任务
4. REPL_App 必须显示带有当前模式（auto/manual）视觉指示的命令提示符
5. REPL_App 必须支持命令历史导航（上/下方向键）
6. 当用户输入命令时，REPL_App 必须为无效命令提供视觉反馈

### 需求 7: 欢迎界面与帮助

**用户故事:** 作为用户，我希望有一个友好的启动界面和易于访问的帮助，以便快速了解如何使用该工具。

#### 验收标准

1. 当 REPL 启动时，REPL_App 必须显示包含版本信息和当前设置的欢迎横幅
2. REPL_App 必须在欢迎界面显示当前的 agent 类型、模型和权限模式
3. 当用户输入 /help 时，REPL_App 必须显示格式化的帮助界面，包含所有可用命令
4. REPL_App 必须在欢迎横幅中使用现有的猫咪 ASCII art
5. REPL_App 必须在欢迎界面显示当前工作目录

### 需求 8: 与现有系统兼容

**用户故事:** 作为开发者，我希望新 UI 与现有系统兼容，以便不需要修改核心 Agent 逻辑。

#### 验收标准

1. Ink_UI 必须使用现有的 Runner 接口进行 Agent 执行
2. Ink_UI 必须使用现有的 RunnerEventHandlers 进行事件处理
3. Ink_UI 必须保留所有现有的 CLI 参数和选项
4. Ink_UI 必须保持与现有会话管理的向后兼容性
5. 如果终端不支持 Ink 功能，Ink_UI 必须优雅地回退或显示错误消息
