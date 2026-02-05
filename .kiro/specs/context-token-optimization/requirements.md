# 需求文档

## 简介

本功能旨在优化 NaughtyAgent 的上下文管理和 Token 使用效率。通过实现项目索引缓存系统、上下文自动注入、Token 压缩策略、工具输出截断和智能内容缓存，解决每次对话都要重新探索项目结构、长对话 Token 消耗大等问题。

## 术语表

- **Project_Index（项目索引）**: 包含项目结构、技术栈、关键文件等信息的缓存数据
- **Index_Cache（索引缓存）**: 负责存储和管理 Project_Index 的持久化组件
- **Context_Injector（上下文注入器）**: 负责将缓存的项目信息注入到 Agent 系统提示中
- **Token_Compressor（Token 压缩器）**: 负责在主 Agent Loop 中压缩消息历史
- **Tool_Output_Truncator（工具输出截断器）**: 负责截断过长的工具执行结果
- **Content_Cache（内容缓存）**: 使用 hash 引用避免重复发送相同文件内容
- **Hash_Reference（哈希引用）**: 通过内容 hash 标识已发送的文件内容

## 需求列表

### 需求 1: 项目索引缓存

**用户故事:** 作为开发者，我希望 Agent 能缓存项目结构和技术栈信息，这样我就不用在每次对话时都等待项目探索。

#### 验收标准

1. 当 Agent 在项目目录启动时，Index_Cache 应检查是否存在有效的缓存 Project_Index
2. 当存在有效的缓存 Project_Index 且项目哈希匹配时，Index_Cache 应加载缓存索引而非重新生成
3. 当不存在缓存 Project_Index 或哈希不匹配时，Index_Cache 应生成新的 Project_Index 并持久化
4. Project_Index 应包含项目结构树、关键文件列表、技术栈信息和用于变更检测的内容哈希
5. Index_Cache 应将 Project_Index 存储在 `.naught/cache/project-index.json`
6. 当用户执行 `/refresh` 命令时，Index_Cache 应无视缓存有效性强制重新生成 Project_Index

### 需求 2: 项目哈希计算

**用户故事:** 作为开发者，我希望系统能高效检测项目变更，这样缓存可以自动保持最新而无需手动干预。

#### 验收标准

1. Hash_Calculator 应基于关键项目文件（package.json、tsconfig.json、Cargo.toml 等）计算哈希
2. Hash_Calculator 应在哈希计算中包含文件修改时间戳
3. 计算哈希时，Hash_Calculator 应忽略 `.gitignore` 中的文件和常见排除模式（node_modules、dist 等）
4. 对于所有有效的 Project_Index 对象，序列化后再反序列化应产生等价的对象（往返属性）

### 需求 3: 上下文自动注入

**用户故事:** 作为开发者，我希望项目上下文能自动包含在系统提示中，这样 Agent 从第一条消息就能理解我的项目。

#### 验收标准

1. 构建系统提示时，Context_Injector 应包含缓存的项目结构
2. 构建系统提示时，Context_Injector 应包含检测到的技术栈信息
3. 构建系统提示时，Context_Injector 应包含关键文件列表
4. Context_Injector 应将注入的上下文格式化在 `<project-context>` 标签内
5. 如果缓存的 Project_Index 过期或缺失，Context_Injector 应在注入前触发索引重新生成

### 需求 4: 主循环 Token 压缩

**用户故事:** 作为开发者，我希望 Agent 能在对话历史过长时自动压缩，这样我可以进行更长的对话而不会触及上下文限制。

#### 验收标准

1. 当会话输入 Token 超过可配置阈值（默认 80000）时，Token_Compressor 应压缩消息历史
2. Token_Compressor 应使用 subtask/context 中现有的压缩策略（sliding_window、importance、summary）
3. 压缩消息时，Token_Compressor 应保留最近的消息和重要消息（包含错误、决策、工具结果的消息）
4. Token_Compressor 应记录压缩操作，包括压缩前后的 Token 数量
5. 发生压缩时，Token_Compressor 应添加一条系统消息，说明早期上下文已被摘要

### 需求 5: 工具输出截断

**用户故事:** 作为开发者，我希望大型工具输出能自动截断并附带摘要，这样它们不会消耗过多 Token。

#### 验收标准

1. 当工具结果输出超过可配置限制（默认 10000 字符）时，Tool_Output_Truncator 应截断输出
2. 截断输出时，Tool_Output_Truncator 应保留输出的开头和结尾部分
3. 截断输出时，Tool_Output_Truncator 应插入摘要指示器，显示总长度和截断点
4. Tool_Output_Truncator 应适用于所有工具类型（read、grep、bash 等）
5. 如果工具输出是结构化的（JSON、代码），Tool_Output_Truncator 应尝试在逻辑边界处截断

### 需求 6: 智能内容缓存

**用户故事:** 作为开发者，我希望 Agent 避免多次重复发送相同的文件内容，这样 Token 使用更高效。

#### 验收标准

1. 读取文件时，Content_Cache 应计算并存储文件内容的哈希
2. 在同一会话中再次读取相同文件时，Content_Cache 应检查内容哈希是否匹配
3. 如果内容哈希与之前发送的文件匹配，Content_Cache 应使用 Hash_Reference 而非完整内容
4. Hash_Reference 格式应为 `[内容已缓存: {文件名} (哈希: {短哈希})]`
5. 当文件内容已更改（哈希不同）时，Content_Cache 应发送完整内容并更新缓存
6. Content_Cache 应限定在当前会话范围内，会话结束时清除

### 需求 7: 配置管理

**用户故事:** 作为开发者，我希望能配置 Token 优化设置，这样我可以根据具体需求调整行为。

#### 验收标准

1. 配置应支持通过 `.naught/config.json` 设置 Token 压缩阈值
2. 配置应支持通过 `.naught/config.json` 设置工具输出截断限制
3. 配置应支持通过 `.naught/config.json` 启用/禁用内容缓存
4. 配置应支持通过 `.naught/config.json` 启用/禁用自动上下文注入
5. 当配置值缺失时，系统应使用合理的默认值

### 需求 8: 刷新命令

**用户故事:** 作为开发者，我希望能在需要时手动刷新项目索引，这样我可以确保 Agent 拥有最新的项目信息。

#### 验收标准

1. 当用户输入 `/refresh` 时，系统应重新生成 Project_Index
2. 当用户输入 `/refresh` 时，系统应清除当前会话的 Content_Cache
3. 刷新完成时，系统应显示刷新信息的摘要（文件数量、技术栈等）
4. 如果刷新失败，系统应显示错误消息，并在可用时继续使用之前的缓存
