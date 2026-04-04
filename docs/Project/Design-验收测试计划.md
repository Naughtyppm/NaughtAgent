# NaughtyAgent v0.9.x 系统验收测试计划

> 目标：系统性测试 NA 所有核心功能，找出所有问题，然后参照 CC 源码统一修复。

## 测试环境

- OS: Windows 11
- Node: v24.x
- 模型: claude-sonnet-4（通过 copilot-api 或直连）
- 测试模式: standalone (-s) + daemon + Ink TUI

---

## T1: 基础输出能力

### T1.1 纯文本输出
```bash
na -s "请用中文写一段300字的技术文章，介绍TypeScript的优点"
```
**验收**：输出完整、无截断、格式正确

### T1.2 长文本输出
```bash
na -s "请生成一个包含50个条目的JSON数组，每个元素有name、age、city字段"
```
**验收**：完整 JSON 输出，未被截断

### T1.3 Markdown 格式
```bash
na -s "请生成一个包含标题、表格、代码块、列表的Markdown示例"
```
**验收**：Markdown 渲染正确

---

## T2: 工具调用（单工具）

### T2.1 read 工具
```bash
na -s -d "D:\AISpace\Apps\NaughtAgent" "读取 README.md 全部内容，不要省略"
```
**验收**：文件内容完整显示，不被 TUI 截断

### T2.2 glob 工具
```bash
na -s -d "D:\AISpace\Apps\NaughtAgent" "搜索所有 .ts 文件"
```
**验收**：文件列表完整

### T2.3 grep 工具
```bash
na -s -d "D:\AISpace\Apps\NaughtAgent" "在 src 目录搜索 DEFAULT_MAX_TOKENS"
```
**验收**：匹配结果完整显示

### T2.4 bash 工具
```bash
na -s "运行 node --version && npm --version"
```
**验收**：命令输出正确显示

### T2.5 write 工具
```bash
na -s -d "D:\AISpace\Temp" "创建文件 test-na.txt，内容为 Hello from NaughtyAgent"
```
**验收**：文件创建成功，权限检查正常

### T2.6 edit 工具
```bash
na -s -d "D:\AISpace\Temp" "编辑 test-na.txt，把 Hello 改成 Hi"
```
**验收**：编辑成功，差异显示正确

---

## T3: 多步骤任务

### T3.1 读取+分析
```bash
na -s -d "D:\AISpace\Apps\NaughtAgent" "读取 package.json 和 tsconfig.json，总结项目配置"
```
**验收**：两个文件都读取、分析结果正确

### T3.2 搜索+修改
```bash
na -s -d "D:\AISpace\Temp" "创建一个简单的 hello.ts 文件，然后读取确认内容正确"
```
**验收**：创建+验证两步完成

### T3.3 复杂任务（重点）
```bash
na -s -d "D:\AISpace\Apps\NaughtAgent" "分析 packages/agent/src/config/constants.ts 中所有常量的用途，列出每个常量的名称、值和作用"
```
**验收**：完整分析，不中途停止

---

## T4: Extended Thinking

### T4.1 Thinking 基本功能
```bash
na -s -t "如果我要设计一个分布式任务调度系统，应该考虑哪些关键问题？"
```
**验收**：Thinking 过程可见，最终输出完整

### T4.2 Thinking + 工具调用
```bash
na -s -t -d "D:\AISpace\Apps\NaughtAgent" "分析这个项目的架构，指出可能的改进点"
```
**验收**：Thinking 后正确调用工具，最终输出完整

---

## T5: Daemon 模式

### T5.1 Daemon 启动/停止
```bash
na daemon start
na daemon status
na daemon stop
```
**验收**：启停正常，状态显示正确

### T5.2 通过 Daemon 对话
```bash
na "请说 Hello"
```
**验收**：通过 WebSocket 连接 daemon 正常工作

---

## T6: Ink TUI 模式

### T6.1 交互式输入
启动 `na` 进入 TUI，输入消息查看渲染

**验收**：
- 输入框响应正常
- 消息显示完整（不过度截断）
- 工具输出折叠/展开正常
- 快捷键（Tab 展开、上下选择）正常
- 无渲染抖动

### T6.2 多轮对话
在 TUI 中进行 3-5 轮对话

**验收**：
- 历史消息保留
- 上下文连贯
- 无内存泄漏迹象

---

## T7: 边界情况

### T7.1 空输入
```bash
na -s ""
```
**验收**：优雅处理

### T7.2 超长输入
```bash
na -s "重复这段话100次：NaughtyAgent是一个类似Claude Code的AI编程助手。"
```
**验收**：输出完整或优雅截断

### T7.3 中断处理
Ctrl+C 中断正在执行的任务

**验收**：优雅退出，无僵尸进程

### T7.4 权限拒绝
```bash
na -s -d "D:\AISpace\Apps\NaughtAgent" "删除 README.md"
```
**验收**：权限弹窗/拒绝正常工作

---

## T8: Compact 系统

### T8.1 自动压缩触发
长对话直到触发自动压缩

**验收**：
- 压缩透明进行
- 压缩后上下文保留
- 对话可继续

### T8.2 手动 Compact
```
/compact
```
**验收**：摘要生成正确

---

## T9: 与 CC 对比测试（关键）

对于以上每个测试项，同时在 CC 中执行同样操作，对比：
1. 输出格式差异
2. 响应速度差异
3. 功能完整性差异
4. UI 交互差异

---

## 问题追踪表

| ID | 测试项 | 问题描述 | 严重度 | CC 对照 | 修复状态 |
|----|--------|---------|--------|---------|---------|
| P0-1 | 核心 | max_tokens 截断后无恢复机制，任务静默中断 | P0 | CC 注入 "Resume directly" 最多 3 次恢复 | ✅ 已修 |
| P0-2 | T1/T6 | AI 消息硬截断 15/50 行，完成后内容不全 | P0 | CC AI 消息无硬行数限制 | ✅ 已修 |
| P1-1 | 核心 | 非 413 API 错误(429/529)在主循环中直接 break 退出 | P1 | CC 有 retry-after 解析+指数退避+倒计时UI | ✅ 已修 |
| P1-2 | 核心 | 工具结果截断阈值过低(10K 字符)，缺少写文件+预览策略 | P1 | CC 上限 50K 字符，超限写文件+预览给模型 | ✅ 已修 50K |
| P1-3 | 核心 | DEFAULT_MAX_TOKENS=16K 太低且无升级机制 | P1 | CC 默认 32K，可升级到 64K-128K | ✅ 已修 32K+64K升级 |
| P1-4 | T6 | 流式节流 500ms，打字机效果不流畅 | P1 | CC 直接写终端无节流层 | ✅ 已修 200ms |
| P1-5 | T6 | updateAIThinking 无节流，高频 setState | P1 | - | ✅ 已修 200ms节流 |
| P1-6 | T6 | MessageItem memo 比较遗漏 thinking/isThinking，thinking 不更新 | P1 | - | ✅ 已修 |
| P1-7 | T6 | ToolPanel 展开/折叠条件渲染导致布局跳动 | P1 | CC 用 virtual scroll | ⏳ 架构限制 |
| P1-8 | 核心 | OpenAI provider 无 retry 包装 | P1 | CC 所有 provider 统一 retry | ⏳ 低优先级 |
| P2-1 | T6 | ToolPanel 未使用 memo | P2 | - | ✅ 已修 |
| P2-2 | T6 | InputArea disabled 时 TextInput 被卸载/重建 | P2 | CC 输入框始终存在 | ⏳ Ink API限制 |
| P2-3 | T6 | StatusIndicator 未使用 memo | P2 | - | ⏳ 低优先级 |
| P2-4 | T6 | events 数组持续增长，频繁触发 useEffect | P2 | - | ⏳ 低优先级 |
| P2-5 | 核心 | Compact 阈值 50K 远低于 CC 的 163K，过早压缩 | P2 | CC 167K 触发 | ✅ 已修 140K |
| P2-6 | 死代码 | ThinkingPanel.tsx 未被使用 | P2 | - | ✅ 已修 已删除 |
| P3-1 | T6 | 4 处 useInput 同时活跃，键盘事件无隔离 | P3 | - | 待修 |

---

## 执行策略

1. **第一轮**：用 `na -s`（standalone）跑 T1-T4，收集所有输出问题
2. **第二轮**：用 Ink TUI 跑 T6，收集渲染问题
3. **第三轮**：CC 对比 T9，确定差距
4. **汇总**：所有问题进入追踪表
5. **修复**：参照 CC 源码统一修复
