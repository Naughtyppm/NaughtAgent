---
inclusion: manual
---

# 多角色讨论工作流

## 触发条件

当用户说以下内容时，启动多角色讨论流程：
- "发起讨论" / "多角色讨论" / "multi-agent discuss"
- "让几个角色讨论一下"
- "多视角分析"
- "讨论一下这个方案"

## 脚本位置

`~/.kiro/scripts/multi-agent-discuss.ts`

## 三种讨论模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| round-robin | 固定轮转 A→B→C→A→B→C | 头脑风暴、每人都需发言 |
| handoff | 角色自选下一个发言者 | 深度辩论、针对性回应 |
| moderated | 第一个角色当主持人协调 | 正式评审、结构化讨论 |

## 执行流程

1. 询问用户讨论主题（如果已提供则直接使用）
2. 询问讨论模式（默认 handoff）
   - 简单头脑风暴 → round-robin
   - 深度辩论/针对性讨论 → handoff
   - 正式评审/需要引导 → moderated
3. 询问是否自定义角色（默认：架构师、开发者、审查员）
4. 询问是否有讨论后需要执行的任务
5. 创建临时 JSON 配置文件
6. 用后台进程执行脚本
7. 等待完成后读取输出文件
8. 如有后续任务，基于讨论结果执行
9. 清理临时配置文件

## 配置文件格式

```json
{
  "topic": "讨论主题",
  "mode": "handoff",
  "agents": [
    { "name": "架构师", "role": "关注系统设计、可扩展性" },
    { "name": "开发者", "role": "关注实现细节、代码质量" },
    { "name": "审查员", "role": "关注潜在风险、边界情况" }
  ],
  "maxRounds": 3,
  "outputFile": "讨论记录输出路径.md"
}
```

## moderated 模式角色配置

moderated 模式下，agents 数组的第一个角色自动成为主持人：

```json
{
  "topic": "API 设计评审",
  "mode": "moderated",
  "agents": [
    { "name": "主持人", "role": "引导讨论方向，确保每个观点被充分讨论" },
    { "name": "架构师", "role": "关注系统设计和可扩展性" },
    { "name": "前端", "role": "关注 API 易用性和前端集成体验" },
    { "name": "安全", "role": "关注认证授权和数据安全" }
  ]
}
```

## handoff 机制说明

- 每个角色发言后用 `[NEXT: 角色名]` 指定下一个发言者
- 任何角色可以用 `[END_DISCUSSION]` 终止讨论
- 未指定下一位时自动轮转到下一个角色
- moderated 模式下参与者发言后自动交回主持人

## 执行命令

```bash
cmd /c "npx tsx %USERPROFILE%\.kiro\scripts\multi-agent-discuss.ts --config 配置文件路径"
```

## 常用角色模板

| 场景 | 角色组合 |
|------|---------|
| 技术评审 | 架构师、开发者、测试、安全 |
| 产品讨论 | 产品经理、设计师、开发者、用户代表 |
| 代码审查 | 作者、审查员、架构师 |
| 方案对比 | 支持者、反对者、中立分析师 |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| API_BASE_URL | LLM API 地址 | http://localhost:8080/v1 |
| API_KEY | API 密钥 | sk-placeholder |
| MODEL | 模型名称 | claude-sonnet-4-20250514 |
| MAX_ROUNDS | 最大轮次 | 3 |

## 注意事项

- 使用 JSON 配置文件传参，避免 PowerShell 中文编码问题
- 脚本需要多轮 LLM 调用，用后台进程运行，定期检查输出
- 讨论完成后清理临时配置文件
- 输出文件为 Markdown 格式，可直接查看
- 示例配置文件：`~/.kiro/scripts/discuss-config.example.json`
