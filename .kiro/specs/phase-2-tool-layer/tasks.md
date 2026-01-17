# 实现计划：Phase 2 - 工具层重构（MCP 集成）

## 概述

本实现计划将 Phase 2 的设计转换为可执行的编码任务。任务按照依赖关系组织，每个任务都包含具体的实现目标和需要验证的需求。实现将采用增量方式，确保每个步骤都能独立验证和测试。

## 任务列表

- [ ] 1. 扩展 Tool 接口以支持 MCP 字段
  - 在 `packages/agent/src/tool/tool.ts` 中扩展 `Tool.Definition` 接口
  - 添加可选字段：`inputSchema`、`outputSchema`、`title`、`icons`、`source`、`mcpServer`
  - 定义 `JsonSchema` 类型
  - 更新 `Tool.define()` 方法以自动生成 `inputSchema`（从 Zod schema）
  - 设置默认值：`source: "builtin"`、`title: id`
  - _需求：1.1、1.2、1.3_

- [ ] 1.1 编写 Tool 接口扩展的属性测试
  - **属性 2：工具接口字段完整性**
  - **验证需求：1.1、1.2**

- [ ] 2. 增强 Tool Registry 支持动态注册和过滤
  - [ ] 2.1 扩展 ToolRegistry 数据结构
    - 修改 `packages/agent/src/tool/registry.ts`
    - 添加 `ToolEntry` 类型（包含 tool 和 metadata）
    - 添加索引：`bySource`、`byMcpServer`
    - 实现 `ToolFilter` 接口
    - _需求：1.4_

  - [ ] 2.2 实现工具注册和注销方法
    - 实现 `register()` 支持单个和批量注册
    - 实现 `unregister()` 方法
    - 添加 ID 唯一性验证
    - 实现 `has()` 和 `count()` 方法
    - _需求：1.4、1.5_

  - [ ] 2.3 编写工具注册的属性测试
    - **属性 1：工具注册的唯一性约束**
    - **验证需求：1.4、1.5**

  - [ ] 2.4 实现工具过滤和查询
    - 实现 `list(filter)` 方法支持按 source、mcpServer、tags 过滤
    - 优化查询性能（使用索引）
    - _需求：1.4_

  - [ ] 2.5 实现工具变更事件系统
    - 实现 `onChange()` 方法注册监听器
    - 定义 `ToolChangeEvent` 类型
    - 在注册/注销时触发事件
    - _需求：3.3_

- [ ] 3. 实现 JSON Schema 和 Zod 互转
  - [ ] 3.1 实现 Zod Schema 转 JSON Schema
    - 创建 `packages/agent/src/tool/schema-converter.ts`
    - 实现 `zodToJsonSchema()` 函数
    - 支持基本类型：string, number, boolean, object, array
    - 支持 Zod 修饰符：optional, nullable, default, enum
    - 添加 schema 缓存机制
    - _需求：1.3、7.4_

  - [ ] 3.2 编写 JSON Schema 验证的属性测试
    - **属性 3：JSON Schema 验证正确性**
    - **验证需求：1.3**

  - [ ] 3.3 编写 Schema 缓存的属性测试
    - **属性 18：Schema 缓存避免重复解析**
    - **验证需求：7.4**

  - [ ] 3.4 实现 JSON Schema 转 Zod Schema
    - **技术选型**：使用 `json-schema-to-zod` npm 包（推荐方案）
    - 添加依赖：`pnpm add json-schema-to-zod`
    - 实现 `jsonSchemaToZod()` 函数
    - 支持 MCP 工具的 inputSchema 转换
    - 处理嵌套对象和数组
    - 对不支持的 schema 特性提供清晰错误信息
    - _需求：3.2_
    - _预计时间：2 小时_

- [ ] 4. 检查点 - 验证基础接口和转换
  - 确保所有测试通过
  - 验证 Tool 接口扩展正确
  - 验证 Registry 功能完整
  - 验证 Schema 转换正确
  - 如有问题，询问用户

- [ ] 5. 实现 MCP 客户端池管理
  - [ ] 5.1 创建 McpClientPool 类
    - 创建 `packages/agent/src/mcp/pool.ts`
    - 实现客户端存储（Map<string, McpClient>）
    - 实现配置加载（从 McpConfig）
    - _需求：2.1、2.2、10.1、10.2_

  - [ ] 5.2 实现连接管理方法
    - 实现 `connectAll()` 方法
    - 实现 `connect(serverName)` 方法（包含协议版本协商）
    - 实现 `disconnect(serverName)` 和 `disconnectAll()` 方法
    - 添加连接状态跟踪
    - 实现 `startHealthCheck()` 方法（30 秒间隔 ping 检查）
    - 实现 `reconnect()` 方法用于自动重连
    - _需求：2.7_

  - [ ] 5.3 编写 MCP 客户端状态转换的属性测试
    - **属性 8：MCP 客户端状态转换**
    - **验证需求：2.7**

  - [ ] 5.4 实现连接重试策略
    - 创建 `packages/agent/src/mcp/retry.ts`
    - 实现 `connectWithRetry()` 函数
    - 实现指数退避算法
    - 配置：maxAttempts、initialDelayMs、maxDelayMs、backoffMultiplier
    - _需求：2.6_

  - [ ] 5.5 编写连接重试的属性测试
    - **属性 7：连接失败的指数退避重试**
    - **验证需求：2.6**

  - [ ] 5.6 编写连接失败的单元测试
    - 测试 MCP 服务器不可达返回 ConnectionError
    - _需求：8.2_

  - [ ] 5.7 实现客户端查询方法
    - 实现 `getClient(serverName)` 方法
    - 实现 `listClients()` 方法返回状态信息
    - _需求：2.7_

  - [ ] 5.8 编写 MCP 连接复用的集成测试
    - **集成测试：MCP 连接复用**
    - **验证需求：7.5**
    - 监控连接实例的创建次数
    - 验证多次工具调用复用同一连接
    - **注意**：此为集成测试，需要 mock MCP 服务器

- [ ] 6. 实现 MCP 工具适配器
  - [ ] 6.1 创建 MCP 工具包装函数
    - 创建 `packages/agent/src/mcp/adapter.ts`
    - 实现 `wrapMcpTool()` 函数
    - 将 McpTool 转换为 Tool.Definition
    - 生成工具 ID：`${serverName}:${toolName}`
    - 设置 source 为 "mcp"
    - _需求：3.2_

  - [ ] 6.2 实现 MCP 结果转换
    - 实现 `convertMcpResult()` 函数
    - 提取文本内容（McpTextContent）
    - 处理图片和资源内容
    - 设置 metadata（contentTypes、hasImages、hasResources）
    - _需求：3.2_

  - [ ] 6.3 实现工具执行逻辑
    - 在 `wrapMcpTool()` 的 execute 函数中调用 `client.callTool()`
    - 检查取消信号（ctx.abort）
    - 处理 MCP 调用错误
    - _需求：2.4、3.2_

  - [ ] 6.4 编写 MCP 工具调用请求格式的属性测试
    - **属性 5：MCP 工具调用请求格式**
    - **验证需求：2.4**

  - [ ] 6.5 编写 MCP 工具包装的属性测试
    - **属性 9：MCP 工具包装后的接口一致性**
    - **验证需求：3.2**

- [ ] 7. 实现工具发现服务
  - [ ] 7.1 创建 ToolDiscoveryService 类
    - 创建 `packages/agent/src/tool/discovery.ts`
    - 注入 McpClientPool 和 ToolRegistry
    - _Requirements: 3.1_

  - [ ] 7.2 实现工具发现方法
    - 实现 `discoverAndRegister()` 方法
    - 遍历所有 MCP 客户端
    - 调用 `client.listTools()`
    - 使用 `wrapMcpTool()` 包装工具
    - 注册到 ToolRegistry
    - 返回统计信息（discovered, registered, errors）
    - _Requirements: 3.1_

  - [ ] 7.3 编写工具自动发现的集成测试
    - **集成测试：MCP 连接后自动发现工具**
    - **验证需求：2.3、3.1**
    - 使用 mock MCP 服务器进行测试
    - 验证发现的工具数量与服务器返回一致
    - **注意**：此为集成测试，需要 mock MCP 服务器

  - [ ] 7.4 实现单个服务器刷新
    - 实现 `refreshServer(serverName)` 方法
    - 注销该服务器的旧工具
    - 重新发现并注册新工具
    - _Requirements: 3.3_

  - [ ] 7.5 实现热重载机制
    - 实现 `enableHotReload()` 方法
    - 监听所有客户端的 `tools_changed` 事件
    - 自动调用 `refreshServer()`
    - 返回清理函数
    - 实现 `disableHotReload()` 方法
    - _Requirements: 2.5, 3.3_

  - [ ] 7.6 编写工具列表变更事件的集成测试
    - **集成测试：工具列表变更事件响应**
    - **验证需求：2.5、3.3**
    - 模拟服务器事件触发
    - 验证系统无需重启即可更新工具列表
    - **注意**：此为集成测试，需要模拟 MCP 服务器事件

  - [ ] 7.7 实现分页加载支持
    - 在 `discoverAndRegister()` 中添加分页参数
    - 支持 pageSize 和 cursor
    - 处理大量工具的情况（1000+）
    - _Requirements: 3.4_

  - [ ] 7.8 编写分页加载的集成测试
    - **集成测试：大量工具的分页加载**
    - **验证需求：3.4**
    - 模拟大量工具的 MCP 服务器（1000+ 工具）
    - 验证分页加载后工具总数一致
    - **注意**：此为集成测试，需要 mock 大量工具的服务器

- [ ] 8. Checkpoint - 验证 MCP 集成
  - 确保所有测试通过
  - 验证 MCP 客户端池正常工作
  - 验证工具发现和包装正确
  - 验证热重载机制有效
  - 如有问题，询问用户

- [ ] 9. 优化内置工具
  - [ ] 9.1 创建工具执行包装器
    - 创建 `packages/agent/src/tool/wrapper.ts`
    - 定义工具超时配置（Read: 5s, Write: 10s, Edit: 10s, Grep: 15s, Bash: 60s, Glob: 10s, 默认: 30s）
    - 实现 `getToolTimeout()` 函数
    - 实现 `withToolWrapper()` 高阶函数
    - 添加超时控制（使用 getToolTimeout 获取超时时间）
    - 添加执行时长记录
    - 添加结构化日志记录
    - _需求：4.2、4.3、8.1、8.5_

  - [ ] 9.2 编写工具执行超时的单元测试
    - 测试长时间运行的工具会在 30 秒后超时
    - 测试超时返回 TimeoutError
    - _需求：4.3、8.4_

  - [ ] 9.3 编写工具执行错误的属性测试
    - **属性 12：工具执行失败的结构化错误**
    - **验证需求：4.2、8.1**

  - [ ] 9.4 编写工具错误日志的属性测试
    - **属性 14：工具执行错误日志记录**
    - **验证需求：8.5**

  - [ ] 9.5 更新所有内置工具使用包装器
    - 更新 `packages/agent/src/tool/read.ts`
    - 更新 `packages/agent/src/tool/write.ts`
    - 更新 `packages/agent/src/tool/edit.ts`
    - 更新 `packages/agent/src/tool/bash.ts`
    - 更新 `packages/agent/src/tool/glob.ts`
    - 更新 `packages/agent/src/tool/grep.ts`
    - 使用 `withToolWrapper()` 包装 execute 函数
    - _需求：4.1、4.2、4.3_

  - [ ] 9.6 编写内置工具接口一致性的属性测试
    - **属性 11：内置工具接口一致性**
    - **验证需求：4.1**

  - [ ] 9.7 优化内置工具错误处理
    - 为每个工具添加更详细的错误上下文
    - 统一错误消息格式
    - 确保所有错误都是 AgentError 实例
    - _需求：4.2、8.1_

- [ ] 10. 实现统一的参数验证和错误处理
  - [ ] 10.1 增强 Tool.define() 的错误处理
    - 修改 `packages/agent/src/tool/tool.ts` 中的 `define()` 方法
    - 捕获 Zod 验证错误并转换为 AgentError
    - 错误码：`INVALID_REQUEST`
    - 包含详细的字段级错误信息
    - _需求：4.5、8.3_

  - [ ] 10.2 编写参数验证的属性测试
    - **属性 13：参数验证失败返回 ValidationError**
    - **验证需求：4.5、8.3**

  - [ ] 10.3 实现统一的工具执行错误处理
    - 创建 `executeToolWithErrorHandling()` 函数
    - 分类错误：ValidationError、ConnectionError、ToolExecutionError、PermissionError
    - 为每种错误类型设置正确的错误码和 context
    - _需求：8.1、8.2、8.3、8.4_

- [ ] 11. 实现向后兼容层
  - [ ] 11.1 实现旧格式工具的自动转换
    - 在 `Tool.define()` 中检测旧格式
    - 自动生成 `inputSchema`
    - 设置默认的 `source` 和 `title`
    - _需求：5.1、5.2_

  - [ ] 11.2 编写向后兼容的属性测试
    - **属性 15：向后兼容的格式转换**
    - **验证需求：5.1、5.2**

  - [ ] 11.3 支持新旧 API 共存
    - 保留旧的 `ToolRegistry.register()` 签名
    - 添加新的注册选项（批量注册）
    - 确保两种方式都能正常工作
    - _需求：5.3_

  - [ ] 11.4 编写新旧 API 共存的属性测试
    - **属性 16：新旧 API 共存**
    - **验证需求：5.3**

  - [ ] 11.5 添加弃用警告
    - 在使用旧 API 时发出警告
    - 使用 logger.warn() 记录弃用信息
    - 不影响正常执行
    - _需求：5.4_

  - [ ] 11.6 编写弃用警告的单元测试
    - 测试使用旧 API 会产生警告
    - _需求：5.4_

- [ ] 12. 实现 MCP 配置管理
  - [ ] 12.1 定义配置 Schema
    - 创建 `packages/agent/src/mcp/config.ts`
    - 定义 `McpConfig` 接口（已在 types.ts 中）
    - 添加 `settings` 字段（defaultTimeout、hotReload、reconnect）
    - 使用 Zod 定义配置 schema
    - _需求：10.1、10.2、10.4_

  - [ ] 12.2 实现配置加载和验证
    - 实现 `loadMcpConfig(configPath)` 函数
    - 从 JSON 文件读取配置
    - 使用 Zod 验证配置
    - 处理验证错误（记录并使用默认值）
    - _需求：10.4、10.5_

  - [ ] 12.3 编写配置加载的属性测试
    - **属性 20：配置文件加载和验证**
    - **验证需求：10.1、10.2、10.4**

  - [ ] 12.4 编写无效配置的单元测试
    - 测试无效配置记录错误并使用默认设置
    - _需求：10.5_

  - [ ] 12.5 实现配置热重载
    - 使用 `fs.watch()` 监听配置文件变更
    - 检测到变更时重新加载配置
    - 对比新旧配置，增量更新（连接新服务器，断开移除的服务器）
    - _需求：10.3_

  - [ ] 12.6 编写配置热重载的集成测试
    - **集成测试：配置热重载**
    - **验证需求：10.3**
    - 使用文件系统监听测试
    - 验证配置变更后增量更新（连接新服务器，断开移除的服务器）
    - **注意**：此为集成测试，需要文件系统监听

- [ ] 13. 实现 stdio 和 SSE 传输的单元测试
  - [ ] 13.1 编写 stdio 传输的单元测试
    - 测试使用 stdio 配置能够成功连接
    - _需求：2.1_

  - [ ] 13.2 编写 SSE 传输的单元测试
    - 测试使用 SSE 配置能够成功连接
    - _需求：2.2_

- [ ] 14. 集成和端到端测试
  - [ ] 14.1 创建集成测试套件
    - 创建 `packages/agent/test/tool/integration.test.ts`
    - 测试完整的工具发现和调用流程
    - 使用 mock MCP 服务器
    - _需求：所有_

  - [ ] 14.2 测试内置工具和 MCP 工具混合使用
    - 注册内置工具和 MCP 工具
    - 验证两种工具都能正常调用
    - 验证过滤功能正确
    - _需求：3.1、4.1_

  - [ ] 14.3 测试错误场景
    - MCP 服务器连接失败
    - 工具调用超时
    - 参数验证失败
    - 工具执行错误
    - _需求：8.1、8.2、8.3、8.4_

  - [ ] 14.4 性能基准测试
    - **测试工具发现时间**
      - 本地 stdio 服务器：目标 < 500ms
      - 远程 SSE 服务器：目标 < 2000ms
      - 使用 `performance.now()` 测量实际耗时
      - 记录并对比基准数据
    - **测试工具查询时间**
      - 目标：< 10ms
      - 测试 `ToolRegistry.get()` 性能
      - 测试大量工具（1000+）场景下的查询性能
    - **测试 MCP 调用开销**
      - 目标：< 100ms（不包括实际工具执行时间）
      - 测量从调用到 MCP 服务器响应的时间
      - 排除工具实际执行时间
    - **性能测试工具**
      - 使用 Vitest 的 `bench` API
      - 记录性能数据到 `docs/testing/performance-benchmarks.md`
      - 设置性能回归检测
    - _需求：7.1、7.2、7.3_

- [ ] 15. 更新文档和导出
  - [ ] 15.1 更新模块导出
    - 更新 `packages/agent/src/tool/index.ts`
    - 导出新的类型和函数
    - 更新 `packages/agent/src/mcp/index.ts`
    - 导出 McpClientPool、ToolDiscoveryService 等

  - [ ] 15.2 编写 API 文档
    - 创建 `packages/agent/src/tool/README.md`
    - 文档化新的 Tool 接口
    - 提供使用示例
    - 创建 `packages/agent/src/mcp/README.md`
    - 文档化 MCP 集成使用方法

  - [ ] 15.3 更新迁移指南
    - 创建迁移指南文档
    - 说明如何从旧 API 迁移到新 API
    - 提供代码示例

- [ ] 16. 最终检查点 - 完整验证
  - 运行完整测试套件（单元测试 + 属性测试 + 集成测试）
  - 验证测试覆盖率达标（语句 80%+，分支 75%+，函数 85%+，行 80%+）
  - 验证所有 21 个正确性属性都有对应的属性测试
  - 验证所有需求都被实现和测试
  - 生成 Phase 2 完成报告
  - 如有问题，询问用户

## 注意事项

- 所有任务（包括测试任务）都是必需的，确保全面的测试覆盖
- 每个任务都引用了具体的需求编号，便于追溯
- 检查点任务确保增量验证，及时发现问题
- 属性测试使用 fast-check 库，每个测试最少运行 100 次迭代
- 所有属性测试必须包含注释标签：`Feature: phase-2-tool-layer, Property N: ...`
- 内置工具优化保持向后兼容，现有代码无需修改
- MCP 集成是增量的，不影响现有功能
