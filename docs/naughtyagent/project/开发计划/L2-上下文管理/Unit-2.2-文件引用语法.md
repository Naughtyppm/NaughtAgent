# Unit 2.2: 文件引用语法

| 属性 | 值 |
|------|-----|
| 优先级 | P0 |
| 预估工时 | 2 天 |
| 前置依赖 | 无 |
| 状态 | ⏳ 待开始 |
| Spec | - |

## 目标

支持 #file 和 @file 语法引用文件内容。

## 任务清单

- [ ] 实现 #file:path 语法解析
- [ ] 实现 @mention 语法解析
- [ ] 自动读取文件内容注入上下文
- [ ] 支持 glob 模式（#file:src/*.ts）
- [ ] CLI 和 VSCode 同步支持

## 完成标准

- `#file:package.json` 自动注入文件内容
- 支持相对路径和 glob
- 文件不存在时友好提示

## 关键文件

- 新增: `packages/agent/src/context/file-reference.ts`

## 影响范围

- 用户交互
- 上下文注入
