# Unit 4.2: Web 搜索工具

| 属性 | 值 |
|------|-----|
| 优先级 | P1 |
| 预估工时 | 3 天 |
| 前置依赖 | 无 |
| 状态 | ⏳ 待开始 |
| Spec | - |

## 目标

添加联网搜索和网页抓取能力。

## 任务清单

- [ ] 实现 web_search 工具（调用搜索 API）
- [ ] 实现 web_fetch 工具（抓取网页内容）
- [ ] 添加内容提取（去除 HTML 标签）
- [ ] 添加搜索结果缓存
- [ ] 配置搜索 API（支持多个后端）

## 完成标准

- 支持搜索并返回结果摘要
- 支持抓取指定 URL 内容
- 内容自动提取为纯文本

## 关键文件

- 新增: `packages/agent/src/tool/web-search.ts`
- 新增: `packages/agent/src/tool/web-fetch.ts`

## 影响范围

- Agent 知识边界
