# SDD 规格驱动开发

本目录包含 NaughtAgent 的规格定义，基于 OpenCode 源码提取和整理。

## 目的

1. **进度跟踪** - 知道做了什么、还差什么 → 看 `progress.md`
2. **技术细节** - 理解 OpenCode 的设计体系 → 看 `interfaces/` 和 `behaviors/`
3. **开发约束** - 实现时有据可依，不会偏离

## 快速入口

- **看进度**: [progress.md](./progress.md)
- **看架构**: [interfaces/](./interfaces/)
- **看行为**: [behaviors/](./behaviors/)

## 目录结构

```
.spec/sdd/
├── README.md              # 本文件
├── progress.md            # 【开发进度跟踪】
├── testing.md             # 【测试策略规范】
├── interfaces/            # 接口规格（类型、契约）
│   ├── tool.spec.md       # Tool 系统接口
│   ├── agent.spec.md      # Agent 接口
│   ├── session.spec.md    # Session 接口
│   └── permission.spec.md # Permission 接口
├── behaviors/             # 行为规格（场景、约束）
│   ├── tools/             # 各工具的行为规格
│   │   ├── read.behavior.md
│   │   ├── write.behavior.md
│   │   ├── edit.behavior.md
│   │   ├── bash.behavior.md
│   │   ├── glob.behavior.md
│   │   └── grep.behavior.md
│   ├── permission.behavior.md  # 权限系统行为
│   └── error.behavior.md       # 错误处理行为
└── tests/                 # 测试规格
    ├── tool.test-spec.md  # 工具测试规格
    └── templates/         # 测试模板
```

## 规格文件说明

### 接口规格 (interfaces/*.spec.md)

定义模块的**类型签名**和**契约**（前置条件、后置条件、不变量）。

看这个能了解：
- 有哪些核心类型
- 模块之间如何交互
- 设计约束是什么

### 行为规格 (behaviors/*.behavior.md)

定义具体的**输入输出场景**和**错误处理**。

看这个能了解：
- 工具具体怎么工作
- 边界情况怎么处理
- 错误时返回什么

### 测试规格 (tests/*.test-spec.md)

定义**测试用例**和**覆盖要求**。

## 开发流程

```
1. 看 progress.md 确定要做什么
2. 看对应的 spec 了解技术细节
3. 实现代码
4. 编写测试代码
5. 运行测试确保通过
6. 检查覆盖率达标
7. 更新 progress.md 状态
8. 记录测试报告到阶段总结
```

### 完成标准

一个模块标记 ✅ 完成必须满足：

| 要求 | 说明 |
|------|------|
| 规格存在 | `.spec.md` 或 `.behavior.md` |
| 实现完成 | `.ts` 源文件 |
| 测试完成 | `.test.ts` 测试文件 |
| 测试通过 | `pnpm test` 无失败 |
| 覆盖率达标 | 语句 80%、分支 75%、函数 90% |

详见 [testing.md](./testing.md)

## 规格与实现的映射

| 规格文件 | 实现文件 |
|---------|---------|
| `interfaces/tool.spec.md` | `packages/agent/src/tool/tool.ts` |
| `behaviors/tools/read.behavior.md` | `packages/agent/src/tool/read.ts` |
| ... | ... |
