# 实现计划：上下文与 Token 优化

## 概述

本实现计划将上下文感知增强和 Token 优化功能分解为可执行的编码任务。采用渐进式集成策略，复用现有 `context/` 和 `subtask/context/` 模块的能力。

## 任务列表

- [x] 1. 基础设施：哈希计算和配置管理
  - [x] 1.1 实现 HashCalculator 模块
    - 创建 `src/context/hash-calculator.ts`
    - 实现 `computeProjectHash()` 基于关键文件计算哈希
    - 实现 `computeFileHash()` 计算单文件哈希
    - 实现 `computeContentHash()` 计算字符串哈希
    - 支持排除 `.gitignore` 和常见排除模式
    - _需求: 2.1, 2.2, 2.3_
  
  - [x] 1.2 编写 HashCalculator 属性测试
    - **属性 4: 哈希计算包含关键文件**
    - **属性 5: 哈希包含时间戳**
    - **属性 6: 哈希排除忽略文件**
    - **验证: 需求 2.1, 2.2, 2.3**
  
  - [x] 1.3 实现 OptimizationConfig 模块
    - 创建 `src/context/optimization-config.ts`
    - 定义 `OptimizationConfig` 接口和默认值
    - 实现配置加载和合并逻辑
    - 从 `.naught/config.json` 读取配置
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 1.4 编写 OptimizationConfig 单元测试
    - 测试配置加载
    - 测试默认值合并
    - **属性 18: 默认配置值**
    - **验证: 需求 7.5**

- [x] 2. 检查点 - 确保基础设施测试通过
  - 运行 `pnpm -C packages/agent test`
  - 确保所有测试通过，如有问题询问用户

- [x] 3. 项目索引缓存系统
  - [x] 3.1 实现 IndexCache 模块
    - 创建 `src/context/index-cache.ts`
    - 定义 `ProjectIndex` 接口
    - 实现 `load()` 从 `.naught/cache/project-index.json` 加载
    - 实现 `save()` 持久化索引
    - 实现 `isValid()` 检查缓存有效性（哈希匹配）
    - 实现 `getOrCreate()` 带缓存逻辑的索引获取
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 3.2 编写 IndexCache 属性测试
    - **属性 1: 索引缓存有效性和加载**
    - **属性 2: 项目索引结构完整性**
    - **属性 7: 项目索引序列化往返**
    - **验证: 需求 1.1, 1.2, 1.3, 1.4, 2.4**
  
  - [x] 3.3 实现 ContextInjector 模块
    - 创建 `src/context/context-injector.ts`
    - 实现 `buildProjectContext()` 构建上下文字符串
    - 实现 `injectIntoSystemPrompt()` 注入到系统提示
    - 使用 `<project-context>` 标签包装
    - 处理缓存失效时的重新生成
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 3.4 编写 ContextInjector 属性测试
    - **属性 8: 上下文注入完整性**
    - **属性 9: 上下文注入在缓存过期时触发重新生成**
    - **验证: 需求 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 4. 检查点 - 确保索引缓存测试通过
  - 运行 `pnpm -C packages/agent test`
  - 确保所有测试通过，如有问题询问用户

- [x] 5. Token 压缩系统
  - [x] 5.1 实现 TokenCompressor 模块
    - 创建 `src/context/token-compressor.ts`
    - 复用 `subtask/context/` 的压缩策略
    - 实现 `needsCompression()` 检查是否需要压缩
    - 实现 `compress()` 执行压缩
    - 支持 sliding_window、importance、summary 策略
    - 保留最近消息和重要消息
    - 添加压缩摘要消息
    - _需求: 4.1, 4.3, 4.5_
  
  - [x] 5.2 编写 TokenCompressor 属性测试
    - **属性 10: Token 压缩阈值行为**
    - **属性 11: 压缩保留重要消息**
    - **属性 12: 压缩添加摘要消息**
    - **验证: 需求 4.1, 4.3, 4.5**
  
  - [x] 5.3 集成 TokenCompressor 到 Agent Loop
    - 修改 `src/agent/loop.ts`
    - 在 LLM 调用前检查 Token 使用量
    - 超阈值时自动压缩消息历史
    - 记录压缩日志
    - _需求: 4.1, 4.4_

- [x] 6. 工具输出截断
  - [x] 6.1 实现 OutputTruncator 模块
    - 创建 `src/tool/output-truncator.ts`
    - 实现 `truncate()` 截断输出
    - 保留头部和尾部内容
    - 插入截断指示器
    - 实现智能截断（JSON/代码边界检测）
    - _需求: 5.1, 5.2, 5.3, 5.5_
  
  - [x] 6.2 编写 OutputTruncator 属性测试
    - **属性 13: 输出截断阈值行为**
    - **属性 14: 截断保留头尾并带指示器**
    - **属性 15: 智能截断在逻辑边界**
    - **验证: 需求 5.1, 5.2, 5.3, 5.5**
  
  - [x] 6.3 集成 OutputTruncator 到工具执行
    - 修改 `src/agent/loop.ts` 中的 `executeTool()`
    - 在工具执行后应用截断
    - _需求: 5.4_

- [ ] 7. 检查点 - 确保压缩和截断测试通过
  - 运行 `pnpm -C packages/agent test`
  - 确保所有测试通过，如有问题询问用户

- [-] 8. 智能内容缓存
  - [x] 8.1 实现 ContentCache 模块
    - 创建 `src/context/content-cache.ts`
    - 实现 `has()` 检查缓存
    - 实现 `add()` 添加到缓存
    - 实现 `getReference()` 获取哈希引用
    - 实现 `clear()` 清除缓存
    - 会话级别作用域
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  
  - [ ] 8.2 编写 ContentCache 属性测试
    - **属性 16: 内容缓存行为**
    - **属性 17: 哈希引用格式**
    - **验证: 需求 6.1, 6.2, 6.3, 6.4, 6.5**
  
  - [-] 8.3 集成 ContentCache 到 read 工具
    - 修改 `src/tool/read.ts`
    - 在文件读取时检查缓存
    - 缓存命中返回引用，未命中返回内容并缓存
    - _需求: 6.1, 6.2, 6.3, 6.5_

- [-] 9. 刷新命令实现
  - [x] 9.1 实现 /refresh 命令
    - 修改 `src/cli/repl.ts` 添加命令处理
    - 调用 IndexCache 强制重新生成
    - 清除 ContentCache
    - 显示刷新摘要
    - _需求: 1.6, 8.1, 8.2, 8.3, 8.4_
  
  - [ ] 9.2 编写 /refresh 命令单元测试
    - **属性 3: 强制刷新重新生成**
    - **验证: 需求 1.6**

- [x] 10. 系统集成
  - [x] 10.1 集成 ContextInjector 到 PromptManager
    - 修改 `src/agent/prompt-manager.ts`
    - 在 `buildSystemPrompt()` 中注入项目上下文
    - 使用 OptimizationConfig 控制是否启用
    - _需求: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 10.2 更新模块导出
    - 更新 `src/context/index.ts` 导出新模块
    - 更新 `src/tool/index.ts` 导出 OutputTruncator
    - _需求: 无_

- [ ] 11. 最终检查点 - 确保所有测试通过
  - 运行 `pnpm -C packages/agent test`
  - 运行 `pnpm -C packages/agent typecheck`
  - 确保所有测试通过，如有问题询问用户

## 备注

- 每个属性测试引用设计文档中的属性编号
- 检查点任务用于验证阶段性成果
- 复用现有 `subtask/context/` 模块的压缩逻辑，避免重复实现
