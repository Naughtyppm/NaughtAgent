# Unit 5.4: MCP 服务端

| 属性 | 值 |
|------|-----|
| 优先级 | P3 |
| 预估工时 | 5 天 |
| 前置依赖 | L1-L4 稳定 |
| 状态 | ⏳ 待开始 |
| Spec | - |

## 目标

将 NaughtyAgent 能力暴露为 MCP 服务。

## 任务清单

- [ ] 实现 MCP Server 协议
- [ ] 暴露内置工具为 MCP 工具
- [ ] 暴露会话管理为 MCP 资源
- [ ] 添加认证机制
- [ ] 编写 MCP 服务文档

## 完成标准

- 其他 MCP 客户端可连接
- 可调用 NaughtyAgent 工具
- 支持认证和权限控制

## 关键文件

- `packages/agent/src/mcp/server.ts`

## 影响范围

- 生态互通
