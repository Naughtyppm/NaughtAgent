# 实现计划: Global Justfile Commands

## 概述

本计划将全局 justfile 命令系统分解为可执行的编码任务。实现顺序为：解析器 → 注册表 → 执行器 → UI 组件 → 安装脚本。

## 任务列表

- [x] 1. 创建 justfile 模块基础结构
  - 创建 `packages/agent/src/justfile/` 目录
  - 创建 `types.ts` 定义所有类型接口
  - 创建 `index.ts` 桶导出
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. 实现 Just_Parser 解析器
  - [x] 2.1 实现命令名称和参数解析
    - 解析命令定义行（如 `build:`, `test-file FILE:`）
    - 提取命令名称、参数名称、默认值
    - _Requirements: 5.1, 5.3_
  
  - [x] 2.2 实现注释描述提取
    - 解析命令上方的 `#` 注释作为描述
    - 支持多行注释合并
    - _Requirements: 5.2_
  
  - [x] 2.3 实现命令体解析
    - 解析缩进的命令体内容
    - 支持多行命令
    - _Requirements: 5.5_
  
  - [x] 2.4 实现私有命令和默认命令识别
    - 识别以 `_` 开头的私有命令
    - 识别 `default` 命令并标记
    - _Requirements: 5.4, 5.6_
  
  - [x] 2.5 实现错误处理
    - 返回解析错误列表（包含行号和描述）
    - 不抛出异常，继续解析有效部分
    - _Requirements: 5.7, 1.4_
  
  - [ ]* 2.6 编写解析器属性测试
    - **Property 2: 解析器往返一致性**
    - **Property 3: 私有命令过滤**
    - **Property 4: 默认命令标识**
    - **Property 9: 解析错误处理**
    - **Validates: Requirements 5.1-5.7, 1.4**

- [x] 3. Checkpoint - 确保解析器测试通过
  - 确保所有测试通过，如有问题询问用户

- [x] 4. 实现 Command_Registry 命令注册表
  - [x] 4.1 实现文件加载功能
    - 从指定路径加载 justfile
    - 处理文件不存在的情况（返回空列表）
    - 处理读取错误（记录警告，返回空列表）
    - _Requirements: 1.1, 1.2, 2.1, 2.2_
  
  - [x] 4.2 实现命令合并逻辑
    - 合并全局和项目命令
    - 项目命令覆盖同名全局命令
    - 标注每个命令的来源
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 4.3 实现命令搜索功能
    - 支持模糊搜索（名称和描述）
    - 不区分大小写
    - _Requirements: 4.3_
  
  - [x] 4.4 实现项目路径切换
    - 支持重新加载项目 justfile
    - 保持全局命令不变
    - _Requirements: 2.3_
  
  - [ ]* 4.5 编写注册表属性测试
    - **Property 1: Justfile 加载一致性**
    - **Property 5: 命令合并优先级**
    - **Property 6: 命令合并顺序保持**
    - **Property 7: 模糊搜索过滤**
    - **Validates: Requirements 1.1, 2.1, 3.1-3.4, 4.3**

- [x] 5. Checkpoint - 确保注册表测试通过
  - 确保所有测试通过，如有问题询问用户


- [x] 6. 实现 Command_Executor 命令执行器
  - [x] 6.1 实现 just 可用性检查
    - 检查 `just` 命令是否在 PATH 中
    - 返回可用性状态
    - _Requirements: 6.1_
  
  - [x] 6.2 实现命令执行
    - 调用 `just <command>` 执行命令
    - 捕获 stdout 和 stderr
    - 返回执行结果（成功/失败、输出、退出码）
    - _Requirements: 6.3, 6.4, 6.5_
  
  - [x] 6.3 实现超时控制
    - 支持配置执行超时时间
    - 超时后终止进程
    - _Requirements: 6.6_
  
  - [ ]* 6.4 编写执行器单元测试
    - 测试成功执行
    - 测试执行失败
    - 测试超时处理
    - _Requirements: 6.1-6.6_

- [x] 7. 实现 Command_Prompt UI 组件
  - [x] 7.1 创建 CommandPrompt 组件
    - 显示命令列表（名称、描述、来源图标）
    - 支持键盘导航（上/下方向键）
    - 支持 Enter 选择和 Escape 关闭
    - _Requirements: 4.1, 4.4, 4.5, 4.6_
  
  - [x] 7.2 实现模糊搜索过滤
    - 根据输入过滤命令列表
    - 高亮匹配部分
    - _Requirements: 4.3_
  
  - [x] 7.3 显示参数信息
    - 在命令项中显示参数信息
    - 区分必需和可选参数
    - _Requirements: 4.7_
  
  - [ ]* 7.4 编写 UI 组件属性测试
    - **Property 8: 命令显示完整性**
    - **Validates: Requirements 4.2, 4.7**

- [x] 8. 集成到 InputArea 组件
  - [x] 8.1 修改 InputArea 检测 `/` 输入
    - 当输入以 `/` 开头时显示命令提示
    - 传递过滤文本给 CommandPrompt
    - _Requirements: 4.1_
  
  - [x] 8.2 处理命令选择
    - 选择命令后填入输入框
    - 支持带参数的命令
    - _Requirements: 4.5, 6.2_
  
  - [x] 8.3 集成命令执行
    - 提交 `/command` 时执行对应命令
    - 显示执行结果
    - _Requirements: 6.1, 6.4, 6.5_

- [x] 9. Checkpoint - 确保 UI 集成测试通过
  - 确保所有测试通过，如有问题询问用户

- [x] 10. 创建默认全局 Justfile
  - [x] 10.1 创建默认 justfile 模板
    - 包含 help、version、config、update 命令
    - 添加清晰的注释说明
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  
  - [ ]* 10.2 编写默认 justfile 验证测试
    - 验证包含所有必需命令
    - 验证格式正确可解析
    - _Requirements: 8.1-8.6_

- [x] 11. 实现安装脚本
  - [x] 11.1 创建安装脚本
    - 创建 `~/.naughtyagent/` 目录
    - 复制默认 justfile 到全局目录
    - 支持 `--force` 选项
    - _Requirements: 7.2, 7.3, 7.4, 7.5_
  
  - [x] 11.2 集成到构建流程
    - 在 `pnpm build` 后自动执行
    - 显示安装结果信息
    - _Requirements: 7.1, 7.6_

- [x] 12. 最终 Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 确保所有属性测试通过
  - 如有问题询问用户

## 注意事项

- 任务标记 `*` 的为可选测试任务，可跳过以加快 MVP 开发
- 每个属性测试至少运行 100 次迭代
- 所有代码使用 TypeScript 编写
- 遵循项目现有的代码风格和模块结构
