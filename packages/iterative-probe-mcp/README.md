# iterative-probe-mcp

程序控制的迭代探测 MCP Server，用于 Claude Code。

## 特点

- **程序控制循环**：不依赖 LLM 自驱，由程序控制 探测→分析→修复→验证 循环
- **状态持久化**：所有状态写入文件，支持断点续传
- **并行执行**：支持并行探测和并行修复
- **上下文控制**：通过文件通信，避免上下文爆炸

## 安装

```bash
cd packages/iterative-probe-mcp
npm install
npm run build
```

## 配置 Claude Code

在 `~/.claude/settings.json` 或项目 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "iterative-probe": {
      "command": "node",
      "args": ["/path/to/iterative-probe-mcp/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key"
      }
    }
  }
}
```

或使用 npx（发布后）：

```json
{
  "mcpServers": {
    "iterative-probe": {
      "command": "npx",
      "args": ["iterative-probe-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key"
      }
    }
  }
}
```

## 使用

### 在 Claude Code 中

```
用户: "GAS 系统不工作，帮我排查"

Claude Code 调用:
mcp__iterative_probe__start({
  goal: "排查 GAS 系统问题",
  targets: [
    { name: "GA 激活链路", start: "GA_BasicAttack", end: "Damage Applied" },
    { name: "GE 配置", start: "GE_Damage", end: "Attribute Modified" },
    { name: "属性初始化", start: "BeginPlay", end: "AttributeSet Ready" }
  ],
  cwd: "/path/to/project",
  maxIterations: 5
})

// 查看状态
mcp__iterative_probe__status()

// 获取报告
mcp__iterative_probe__report()
```

## MCP Tools

### start

启动迭代探测。

**参数**：
- `goal` (string, required): 探测目标描述
- `targets` (array, required): 探测目标列表
  - `name` (string): 目标名称
  - `description` (string): 目标描述
  - `start` (string): 起点
  - `end` (string): 终点
- `cwd` (string, required): 工作目录
- `maxIterations` (number): 最大迭代次数，默认 5
- `projectContext` (string): 项目上下文

### status

查看当前探测状态。

**返回**：
- `status`: 状态 (idle/running/completed/failed/stopped)
- `phase`: 当前阶段
- `iteration`: 当前迭代
- `problemsFound`: 发现问题数
- `problemsFixed`: 已修复数
- `progress`: 进度百分比

### report

获取探测报告。

**返回**：
- `sessionId`: 会话 ID
- `problems`: 问题列表
- `summary`: 摘要
- `reportPath`: 报告文件路径

### stop

停止当前探测。

## 输出目录结构

```
.claude/iterative_probe/{session_id}/
├── goal.md              # 探测目标
├── state.json           # 状态快照
├── probes/              # 探测结果
│   ├── probe_链路A.md
│   └── probe_链路B.md
├── analysis.md          # 综合分析
├── fixes_plan.md        # 修复计划
├── fixes/               # 修复结果
│   ├── fix_P001.md
│   └── fix_P002.md
├── verification.md      # 验证结果
└── summary.md           # 最终报告
```

## 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                    程序控制主循环                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  for (i = 0; i < maxIterations; i++) {                     │
│                                                             │
│    // Phase 1: 探测（并行调用 Claude）                      │
│    probeResults = await runProbePhase(targets)             │
│                                                             │
│    // Phase 2: 分析（调用 Claude）                          │
│    analysis = await runAnalyzePhase(probeResults)          │
│                                                             │
│    // 程序判断：无问题则退出                                │
│    if (analysis.problems.length === 0) break               │
│                                                             │
│    // Phase 3: 生成修复计划（调用 Claude）                  │
│    fixPlans = await runPlanPhase(analysis)                 │
│                                                             │
│    // Phase 4: 执行修复（并行调用 Claude）                  │
│    fixResults = await runFixPhase(fixPlans)                │
│                                                             │
│    // Phase 5: 验证（调用 Claude）                          │
│    verification = await runVerifyPhase(fixResults)         │
│                                                             │
│    // 程序判断：验证通过则退出                              │
│    if (verification.allPassed) break                       │
│  }                                                          │
│                                                             │
│  // 生成报告                                                │
│  generateSummary()                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 与 Skill 版本的区别

| 维度 | Skill 版本 | MCP Server 版本 |
|------|-----------|-----------------|
| 循环控制 | 依赖 LLM 自驱（不可靠） | 程序控制（可靠） |
| 状态管理 | LLM 记忆（易丢失） | 文件持久化（可恢复） |
| 日志记录 | LLM 可能跳过 | 程序自动记录 |
| 终止条件 | LLM 判断（不准确） | 程序判断（精确） |
| 并行执行 | 需要 LLM 理解 | 程序原生支持 |

## 环境变量

- `ANTHROPIC_API_KEY`: Claude API Key（必需）
- `CLAUDE_MODEL`: 使用的模型，默认 `claude-sonnet-4-20250514`

## License

MIT
